// Lumped-parameter hemodynamic engine (blueprint §7).
// Pure JS, no DOM: runs in a Web Worker, on the main thread, or in Node tests.

import { NODES, EDGES, COLLATERAL_DMIN_RATIO, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from './topology.js';
import {
  clamp, tubeResistanceFactor, tubeArea, volumeOf, ptmOf, complianceAt, stenosisFactor,
  heartFlow, fillShape, systoleShape, raWave, iapFromAscites, makeRng,
} from './physiology.js';
import { defaultParams, DRUGS, PRESETS, deepMerge } from './scenario.js';
import { detectEvents } from './events.js';

const KNEE = { artery: [1e9, 1], bed: [14, 10], portal: [14, 10], vein: [14, 6], hepvein: [10, 3], heart: [10, 4], liver: [9, 2], wedge: [9, 5], varix: [30, 10] };
const KD = { vein: 0.03, diode: 0.03, collateral: 0.08 };
const EXT_OVERRIDE = { IVC_IS: 'abd', CAUD: 'none' };

export const VARIX = { Tcrit: 120, r0Healthy: 1.0, rMax: 6.0, w0: 1.0, open: 3.5, k: 0.22 };
/** Rupture hazard per day as a function of T/Tcrit (§7.5). */
export const ruptureHazardPerDay = (x) => (x <= 1 ? 0 : 0.01 * Math.pow((x - 1) / 0.25, 3));
export const COLLATERAL = { open: 7.5, span: 14, tauGrow: 50, tauRegress: 120 };
const BLOOD_BASE = 5000, HCT_BASE = 0.42;
export const LYMPH = { base: 2.5, max: 10, adapt: 0.03, kfHep: 0.45, kfSpl: 0.2, adaptFrac: 0.6 };

export class Engine {
  constructor({ params, seed } = {}) {
    this.nodes = NODES;
    this.edges = EDGES;
    this.N = NODES.length;
    this.E = EDGES.length;
    this.ni = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
    this.ei = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
    this.A = new Float64Array(this.N * this.N);
    this.b = new Float64Array(this.N);
    this.G = new Float64Array(this.E);
    this.Q = new Float64Array(this.E);
    this.P = new Float64Array(this.N);
    this.V = new Float64Array(this.N);
    this.ext = new Float64Array(this.N);
    this.Cn = new Float64Array(this.N);
    this.wf = new Int8Array(this.E);     // waterfall flag: +1 f→t, −1 t→f
    this.wfx = new Float64Array(this.E); // waterfall external pressure

    // Static node constants
    this.nodeC = NODES.map((n) => n.C);
    this.nodeK = NODES.map((n) => KNEE[n.kind] || KNEE.vein);
    this.Pbase = Float64Array.from(NODES.map((n) => n.P));

    // Static edge constants
    this.Rbase = new Float64Array(this.E);
    this.edgeExt = [];
    this.edgeF = new Int32Array(this.E);
    this.edgeT = new Int32Array(this.E);
    EDGES.forEach((e, k) => {
      const f = this.ni[e.from], t = this.ni[e.to];
      this.edgeF[k] = f; this.edgeT[k] = t;
      if (e.Q) this.Rbase[k] = (NODES[f].P - NODES[t].P) / e.Q;
      else if (e.R) this.Rbase[k] = e.R;
      this.edgeExt[k] = EXT_OVERRIDE[e.id] || NODES[f].ext;
      if ((e.Q || e.R) && !(this.Rbase[k] > 0)) throw new Error(`Non-positive baseline resistance on ${e.id}`);
    });
    this.collaterals = EDGES.map((e, k) => (e.kind === 'collateral' ? k : -1)).filter((k) => k >= 0);

    this.params = params ? structuredClone(params) : defaultParams();
    this.reset(seed ?? this.params.seed);
  }

  // ───────────────────────── state ─────────────────────────
  reset(seed = 1) {
    this.t = 0;
    this.day = 0;
    this.rng = makeRng(seed);
    this.baro = 1; this.MAPf = 93; this.habr = 1;
    this.hr = 72;
    this.slow = {
      d: Object.fromEntries(this.collaterals.map((k) => [EDGES[k].id, EDGES[k].dMax * COLLATERAL_DMIN_RATIO])),
      r0: { VAR: VARIX.r0Healthy, GV: VARIX.r0Healthy },
      spleen: 11,
      splTone: 1,
      volExtra: 0,
      lymphCap: LYMPH.base,
      ascites: 0,
    };
    this.blood = { rbc: BLOOD_BASE * HCT_BASE, lost: 0, infused: 0 };
    this.bleed = { active: false, site: null, G: 0, clot: 0, total: 0 };
    this.infusions = [];
    this.valsalva = { until: -1, start: -1 };
    this.pi = { vmax: -Infinity, vmin: Infinity, cycleStart: 0, value: 0, lastPh: 0 };
    this.flows = { ascitesRate: 0, hepLymph: 0, splLymph: 0 };
    this.evState = {};
    this.newEvents = [];
    this.eventLog = [];
    this.quiet = false;
    this.bands = 0;
    for (let i = 0; i < this.N; i++) {
      const [Pk, Ps] = this.nodeK[i];
      this.V[i] = volumeOf(this.Pbase[i], this.nodeC[i], Pk, Ps);
      this.P[i] = this.Pbase[i];
    }
    this.Vbase = Float64Array.from(this.V);
    this.Qpref = 18.3;
    // Reference: healthy baseline pressures (for collateral drivers) & portal inflow (for HABR).
    const saved = this.params;
    this.params = defaultParams();
    this.settle();
    this.Qpref = this.portalInflow();
    this.refP = Float64Array.from(this.P);
    this.refQ = Float64Array.from(this.Q);
    this.Vbase = Float64Array.from(this.V);
    this.params = saved;
    this.settle();
  }

  setParams(p) {
    const prev = this.params;
    this.params = structuredClone(p);
    if (prev.seed !== p.seed) this.rng = makeRng(p.seed);
  }

  /** Load a preset: healthy reset, apply params, run the disease clock for its chronic days. */
  loadPreset(id, { days } = {}) {
    const pr = PRESETS.find((x) => x.id === id) || PRESETS[0];
    const params = pr.apply(defaultParams());
    params.seed = this.params.seed;
    this.params = defaultParams();
    this.params.seed = params.seed;
    this.reset(params.seed);
    this.params = params;
    if (pr.volume) this.addVolume(pr.volume, 0.35);
    this.settle();
    const n = days ?? pr.days;
    if (n > 0) this.advanceDays(n, { noRupture: true, silent: true });
    this.day = 0;
    this.t = 0;
    this.eventLog = [];
    this.newEvents = [];
    this.evState = {};
    detectEvents(this, true);
    this.newEvents = [];
    return params;
  }

  // ───────────────────────── derived params ─────────────────────────
  drugEffects() {
    const e = { hr: 1, contr: 1, spl: 1, sys: 1, sin: 1, baroHr: 1 };
    for (const [k, on] of Object.entries(this.params.drugs)) {
      if (!on || !DRUGS[k]) continue;
      const d = DRUGS[k];
      e.hr *= d.hr; e.contr *= d.contr; e.spl *= d.spl; e.sys *= d.sys; e.sin *= d.sin; e.baroHr = Math.min(e.baroHr, d.baroHr);
    }
    return e;
  }

  zoneMult(lobe, zone) {
    const p = this.params, s = p.cirrhosis;
    const sinM = 1 + 20 * Math.pow(s, 2.5);
    const cz = { pre: 1 + 2 * s, sin: sinM, post: 1 + 2 * s, inter: sinM }[zone];
    let user = 1;
    if (lobe === 'R' || lobe === 'L') user = p.fibrosis[lobe][zone] ?? 1;
    else user = 0.5 * ((p.fibrosis.R.sin ?? 1) + (p.fibrosis.L.sin ?? 1));
    let m = cz * user;
    if (zone === 'sin' || zone === 'inter') m *= this._drug.sin;
    return m;
  }

  hct() { return clamp(this.blood.rbc / this.bloodVolume(), 0.05, 0.8); }
  bloodVolume() {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.V[i] - this.Vbase[i];
    return BLOOD_BASE + s;
  }
  viscosity() { return clamp(1 + 1.6 * (this.hct() - HCT_BASE), 0.5, 1.6); }

  heartState() {
    const d = this._drug, p = this.params, b = this.baro;
    const hr = clamp(72 * d.hr * (1 + 0.9 * (b - 1) * d.baroHr), 38, 170);
    const contr = p.contractility * d.contr * clamp(1 + 0.35 * (b - 1), 0.6, 1.6);
    const cap = contr * Math.pow(hr / 72, 0.6) * (1 - 0.3 * p.tr);
    return { hr, cap };
  }

  // ───────────────────────── externals ─────────────────────────
  computeExt(t) {
    const p = this.params;
    let ppl = 0, iapResp = 0;
    if (p.respiration && !this.quiet) {
      const s = Math.sin((2 * Math.PI * t) / 4);
      ppl = -2 * p.respDepth * s;
      iapResp = 1 * p.respDepth * s;
    }
    let vals = 0;
    if (t < this.valsalva.until && !this.quiet) {
      const u = Math.min(1, (t - this.valsalva.start) / 1.5);
      vals = 30 * u;
    }
    this.iap = iapFromAscites(this.slow.ascites) + iapResp + vals;
    const iapDev = this.iap - 5;
    const pplDev = ppl + vals;
    let raExt = pplDev + 12 * p.pericardial;
    if (p.pulsatile && !this.quiet) raExt += raWave(this.phase());
    for (let i = 0; i < this.N; i++) {
      const ext = NODES[i].ext;
      this.ext[i] = ext === 'abd' ? iapDev
        : ext === 'thor' ? pplDev
        : ext === 'eso' ? pplDev + (p.balloonEso ? 40 : 0)
        : ext === 'gas' ? iapDev + (p.balloonGas ? 45 : 0)
        : 0;
    }
    this.ext[this.ni.RA] = raExt;
  }

  /** Cardiac phase 0..1, integrated so heart-rate changes never jump the phase. */
  phase() {
    return this.cyc - Math.floor(this.cyc);
  }

  extFor(kind) {
    const iapDev = this.iap - 5;
    return kind === 'abd' ? iapDev : kind === 'thor' ? this.ext[this.ni.SVC] : kind === 'eso' ? this.ext[this.ni.VAR]
      : kind === 'gas' ? this.ext[this.ni.GV] : 0;
  }

  // ───────────────────────── conductances ─────────────────────────
  computeG(P) {
    const p = this.params, s = p.cirrhosis, d = this._drug;
    const visc = this.viscosity();
    const spl = p.splanchnicTone * this.slow.splTone * d.spl * Math.pow(this.baro, 0.6);
    const sys = p.systemicTone * d.sys * this.baro;
    const cath = p.catheter;
    const extE = { abd: this.iap - 5, thor: this.ext[this.ni.SVC], eso: this.ext[this.ni.VAR], gas: this.ext[this.ni.GV], none: 0 };

    this.wf.fill(0);
    for (let k = 0; k < this.E; k++) {
      const e = EDGES[k];
      const f = this.edgeF[k], t = this.edgeT[k];
      let R = this.Rbase[k];
      switch (e.kind) {
        case 'arteriole':
          R *= e.tone === 'splanchnic' ? spl : e.tone === 'systemic' ? sys : 1 / this.habr;
          if (e.tone === 'splanchnic') {
            // Venoarteriolar response: marked venous hypertension constricts the feeding arterioles.
            const ex = P[t] - (this.refP ? this.refP[t] : this.Pbase[t]);
            if (ex > 15) R *= 1 + 0.2 * (ex - 15);
          }
          break;
        case 'artery':
          break;
        case 'vein': case 'diode': {
          const x = extE[this.edgeExt[k]];
          const up = P[f] >= P[t] ? f : t, dn = up === f ? t : f;
          // Starling resistor: downstream end collapsed → flow set by upstream − external pressure.
          if (P[dn] - x < 0 && P[up] - x > 0.5) {
            R *= tubeResistanceFactor(P[up] - x, P[up] - x, this.Pbase[up], this.Pbase[up], KD[e.kind] ?? 0.03);
            this.wf[k] = up === f ? 1 : -1;
            this.wfx[k] = x;
          } else {
            R *= tubeResistanceFactor(P[f] - x, P[t] - x, this.Pbase[f], this.Pbase[t], KD[e.kind] ?? 0.03);
          }
          break;
        }
        case 'liver':
          R *= this.zoneMult(e.lobe, e.zone);
          if (e.zone === 'sin' || e.zone === 'post') {
            // Congested sinusoids dilate; capillarized (cirrhotic) sinusoids cannot.
            const kd = 0.08 * (1 - s);
            if (kd > 0) R *= tubeResistanceFactor(P[f], P[t], this.Pbase[f], this.Pbase[t], kd);
          }
          break;
        case 'wedge': {
          let g = e.G;
          if (e.role === 'leak') g *= Math.max(0.01, (1 - s) * (1 - s));
          if (e.role === 'out' && cath.wedged && cath.vein === e.w) g = 0;
          this.G[k] = g;
          continue;
        }
        case 'collateral': {
          const present = !e.spontaneous || p.spontaneous[e.id];
          if (!present || p.occluded[e.id]) { this.G[k] = 0; continue; }
          const dd = this.slow.d[e.id];
          // Collaterals cross compartments (e.g. the diaphragm): each end sees its own surroundings.
          R = e.Ropen * Math.pow(e.dMax / dd, 4) * tubeResistanceFactor(P[f] - this.ext[f], P[t] - this.ext[t], this.refP ? this.refP[f] : this.Pbase[f], this.refP ? this.refP[t] : this.Pbase[t], KD.collateral);
          if (e.code === 'C1' && this.bands > 0) R /= Math.max(0.02, 1 - this.bands / 4);
          break;
        }
        case 'shunt': {
          let g = 0;
          if (e.shunt === 'ap') g = 0.5 * (0.05 * s * s * s + 0.1 * p.apShunt);
          else if (e.shunt === 'tips' && p.tips.on) g = 1 / (0.04 * Math.pow(10 / p.tips.d, 4) * visc);
          else if (e.shunt === 'portocaval' && p.portocaval) g = 1 / (0.03 * visc);
          else if (e.shunt === 'dsrs' && p.dsrs) g = 1 / (0.08 * visc);
          else if (e.shunt === 'mesocaval' && p.mesocaval) g = 1 / (0.08 * visc);
          if (g > 0) g /= Math.min(1e9, stenosisFactor(this.occlusion(e.id)));
          this.G[k] = g;
          continue;
        }
      }
      R *= visc;
      const sf = stenosisFactor(this.occlusion(e.id));
      if (sf === Infinity) { this.G[k] = 0; continue; }
      R *= sf;
      // Surgical ligations implied by shunt procedures
      if (p.portocaval && e.id === 'PV_TRUNK') { this.G[k] = 0; continue; }
      if (p.dsrs && e.id === 'SV_CONF') { this.G[k] = 0; continue; }
      this.G[k] = 1 / R;
    }
  }

  occlusion(id) {
    const s1 = this.params.stenosis[id] || 0, s2 = this.params.thrombus[id] || 0;
    return 1 - (1 - s1) * (1 - s2);
  }

  // ───────────────────────── integration ─────────────────────────
  /** One implicit (backward-Euler, Picard-linearized) step of dt seconds. */
  step(dt) {
    const N = this.N, A = this.A, b = this.b, P = this.P, p = this.params;
    this._drug = this.drugEffects();
    const hs = this.heartState();
    this.hr = hs.hr;
    this.cyc = (this.cyc || 0) + dt * hs.hr / 60;
    const tNew = this.t + dt;
    this.computeExt(tNew);
    this.computeG(P);

    A.fill(0);
    const P0 = this._P0 || (this._P0 = new Float64Array(N));
    for (let i = 0; i < N; i++) {
      const [Pk, Ps] = this.nodeK[i];
      const C = this.nodeC[i] * this.liverStiff(i);
      const ptm = ptmOf(this.V[i], C, Pk, Ps);
      P0[i] = this.ext[i] + ptm;
      const Ci = complianceAt(ptm, C, Pk, Ps);
      this.Cn[i] = Ci;
      A[i * N + i] = Ci / dt;
      b[i] = (Ci / dt) * P0[i];
    }
    // Diodes: choose conductance by current gradient
    for (let k = 0; k < this.E; k++) {
      let g = this.G[k];
      if (g === 0) continue;
      const f = this.edgeF[k], t = this.edgeT[k];
      if (EDGES[k].kind === 'diode' && P[f] < P[t]) g *= 0.002;
      this.G[k] = g;
      if (this.wf[k]) {
        const up = this.wf[k] > 0 ? f : t, dn = up === f ? t : f, x = this.wfx[k];
        A[up * N + up] += g; b[up] += g * x;
        A[dn * N + up] -= g; b[dn] -= g * x;
        continue;
      }
      A[f * N + f] += g; A[t * N + t] += g;
      A[f * N + t] -= g; A[t * N + f] -= g;
    }
    // Heart pump RA → AO
    const RA = this.ni.RA, AO = this.ni.AO;
    let m = 1;
    if (p.pulsatile && !this.quiet) {
      const ph = this.phase();
      m = fillShape(ph) + p.tr * 1.2 * (fillShape(ph) - systoleShape(ph));
    }
    const [Qh0, dQh0] = heartFlow(P[RA] - this.ext[RA], hs.cap);
    const Qh = Qh0 * m, dQh = dQh0 * m;
    const a0 = Qh - dQh * P[RA];
    A[RA * N + RA] += dQh; b[RA] -= a0;
    A[AO * N + RA] -= dQh; b[AO] += a0;
    // Bleeding sink
    let gb = 0, bi = -1;
    if (this.bleed.active) {
      bi = this.ni[this.bleed.site];
      if (P[bi] - this.ext[bi] > 0) { gb = this.bleed.G; A[bi * N + bi] += gb; b[bi] += gb * this.ext[bi]; }
    }
    // Infusions (mL/s) into upper-body veins
    let inf = 0;
    for (const f of this.infusions) inf += f.rate;
    const UP = this.ni.UPPV;
    b[UP] += inf;

    solve(A, b, N);
    const Pn = b;

    // Flows & volume update (exactly conservative)
    const net = this._net || (this._net = new Float64Array(N));
    net.fill(0);
    for (let k = 0; k < this.E; k++) {
      const g = this.G[k];
      const f = this.edgeF[k], t = this.edgeT[k];
      let q;
      if (this.wf[k]) q = this.wf[k] > 0 ? g * (Pn[f] - this.wfx[k]) : -g * (Pn[t] - this.wfx[k]);
      else q = g * (Pn[f] - Pn[t]);
      this.Q[k] = q;
      net[f] -= q; net[t] += q;
    }
    const qh = a0 + dQh * Pn[RA];
    this.Qheart = qh;
    net[RA] -= qh; net[AO] += qh;
    let qb = 0;
    if (gb > 0) { qb = Math.max(0, gb * (Pn[bi] - this.ext[bi])); net[bi] -= qb; }
    this.Qbleed = qb;
    net[UP] += inf;

    for (let i = 0; i < N; i++) {
      this.V[i] += dt * net[i];
      const [Pk, Ps] = this.nodeK[i];
      P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i] * this.liverStiff(i), Pk, Ps);
    }

    // Blood accounting
    const hct = this.hct();
    if (qb > 0) { this.blood.lost += qb * dt; this.blood.rbc -= qb * dt * hct; this.bleed.total += qb * dt; }
    for (const f of this.infusions) {
      const v = Math.min(f.remaining, f.rate * dt);
      f.remaining -= v;
      this.blood.rbc += v * f.hct;
      this.blood.infused += v;
    }
    this.infusions = this.infusions.filter((f) => f.remaining > 1e-6);
    this.infusions.forEach((f) => { if (f.remaining < f.rate * dt) f.rate = f.remaining / dt; });

    this.t = tNew;
    this.controllers(dt);
    if (!this.quiet) this.fastProcesses(dt);
    if (p.pulsatile && !this.quiet) this.trackPulsatility();
  }

  liverStiff(i) {
    const k = NODES[i].kind;
    return (k === 'liver') ? 1 - 0.6 * this.params.cirrhosis : 1;
  }

  controllers(dt) {
    const p = this.params;
    const a = Math.min(1, dt / 1.5);
    if (!this.Qf) this.Qf = Float64Array.from(this.Q);
    for (let k = 0; k < this.E; k++) this.Qf[k] += (this.Q[k] - this.Qf[k]) * a;
    // Display-filtered pressures (removes respiratory / cardiac ripple from readouts)
    if (!this.Pf) this.Pf = Float64Array.from(this.P);
    const ap = Math.min(1, dt / 2.5);
    for (let i = 0; i < this.N; i++) this.Pf[i] += (this.P[i] - this.Pf[i]) * ap;
    this.COf = (this.COf ?? this.Qheart) + (this.Qheart - (this.COf ?? this.Qheart)) * Math.min(1, dt / 2);
    this.MAPf += (this.P[this.ni.AO] - this.MAPf) * (dt / (2 + dt));
    const bt = clamp(1 + 4 * (93 - this.MAPf) / 93, 0.5, 2.5);
    this.baro += (bt - this.baro) * Math.min(0.25, dt / (15 + dt));
    const Qp = this.portalInflow();
    const kh = 2.0 * (1 - 0.5 * p.cirrhosis) * p.habrStrength;
    const ht = 1 + kh * clamp((this.Qpref - Qp) / this.Qpref, 0, 1);
    this.habr += (ht - this.habr) * Math.min(0.3, dt / (10 + dt));
  }

  portalInflow() {
    return Math.max(0, this.Q[this.ei.PRE_R]) + Math.max(0, this.Q[this.ei.PRE_L]);
  }

  /** Processes on the hemodynamic clock: bleeding, clotting, rupture hazard, ascites trickle. */
  fastProcesses(dt) {
    const p = this.params;
    // Ascites (mL/min → per dt)
    const as = this.starling();
    this.slow.ascites = Math.max(0, this.slow.ascites + (as.net * dt) / 60);
    // Bleeding / clot
    if (this.bleed.active) {
      const i = this.ni[this.bleed.site];
      const ptm = this.P[i] - this.ext[i];
      if (ptm < 9) this.bleed.clot += dt; else this.bleed.clot = Math.max(0, this.bleed.clot - dt * 0.5);
      if (this.bleed.clot > 45) this.stopBleed('clot');
    } else {
      for (const site of ['VAR', 'GV']) {
        const x = this.varix(site).ratio;
        if (x <= 1) continue;
        if (p.deterministicRupture) { this.rupture(site, 0.6); break; }
        const hDay = ruptureHazardPerDay(x);
        if (this.rng() < hDay * dt / 86400) { this.rupture(site, 0.4 + 0.5 * this.rng()); break; }
      }
    }
    if (this.valsalva.until > 0 && this.t > this.valsalva.until) this.valsalva.until = -1;
  }

  trackPulsatility() {
    const ph = this.phase();
    const v = this.velocity('PV_TRUNK');
    if (ph < this.pi.lastPh) {
      const vmax = this.pi.vmax, vmin = this.pi.vmin;
      this.pi.value = Math.abs(vmax) > 0.5 ? clamp((vmax - vmin) / Math.max(Math.abs(vmax), 1e-6), 0, 3) : 0;
      this.pi.vmax = -Infinity; this.pi.vmin = Infinity;
    }
    this.pi.vmax = Math.max(this.pi.vmax, v);
    this.pi.vmin = Math.min(this.pi.vmin, v);
    this.pi.lastPh = ph;
  }

  /** Relax to quasi-steady state (no respiration, no pulsatility). */
  // Relaxation steps are a numerical device, not elapsed physiological time: the clock is restored.
  settle(n = 1) {
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    const sched = [[0.02, 10], [0.2, 15], [2, 20], [10, 30]];
    for (let r = 0; r < n; r++) for (const [dt, k] of sched) for (let i = 0; i < k; i++) this.step(dt);
    this.quiet = q; this.t = t; this.cyc = cyc;
  }
  settleQuick() {
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    for (let i = 0; i < 10; i++) this.step(5);
    this.quiet = q; this.t = t; this.cyc = cyc;
  }

  // ───────────────────────── disease clock ─────────────────────────
  advanceDays(n, { noRupture = false, silent = false } = {}) {
    const out = { ruptured: false };
    for (let d = 0; d < n; d++) {
      this.settleQuick();
      this.slowStep(1);
      this.day += 1;
      if (!silent) detectEvents(this);
      if (!noRupture && !this.bleed.active) {
        for (const site of ['VAR', 'GV']) {
          const x = this.varix(site).ratio;
          if (x <= 1) continue;
          const hDay = this.params.deterministicRupture ? Infinity : ruptureHazardPerDay(x);
          if (this.rng() < 1 - Math.exp(-hDay)) { this.rupture(site, 0.4 + 0.5 * this.rng()); out.ruptured = true; break; }
        }
        if (out.ruptured) break;
      }
    }
    this.settleQuick();
    return out;
  }

  slowStep(days) {
    const p = this.params, P = this.P, s = this.slow;
    // Collateral remodeling (§7.4): diameter relaxes toward a pressure-driven target.
    for (const k of this.collaterals) {
      const e = EDGES[k];
      const f = this.edgeF[k], t = this.edgeT[k];
      let driver = this.routeExcess(e.route);
      if (p.occluded[e.id]) driver = 0;
      const dMin = e.dMax * COLLATERAL_DMIN_RATIO;
      const frac = clamp((driver - COLLATERAL.open) / COLLATERAL.span, 0, 1);
      const target = dMin + (e.dMax - dMin) * Math.sqrt(frac);
      const d = s.d[e.id];
      const tau = target > d ? COLLATERAL.tauGrow : COLLATERAL.tauRegress;
      s.d[e.id] = clamp(d + (target - d) * Math.min(1, days / tau), dMin, e.dMax);
    }
    // Varix baseline radius relaxes toward a transmural-pressure target (remodeling)
    for (const site of ['VAR', 'GV']) {
      const ex = this.routeExcess(site === 'VAR' ? ['LGV', 'AZY'] : ['SV', 'IVCI']);
      const target = clamp(VARIX.r0Healthy + VARIX.k * Math.max(0, ex - VARIX.open), VARIX.r0Healthy, VARIX.rMax);
      const r = s.r0[site];
      const tau = target > r ? 60 : 150;
      s.r0[site] = r + (target - r) * Math.min(1, days / tau);
    }
    if (this.bands > 0) this.bands = Math.max(0, this.bands - 0.02 * days); // bands slough; columns can recur
    // Spleen
    const spTarget = clamp(11 + 0.5 * Math.max(0, P[this.ni.SPL] - 12), 9, 22);
    s.spleen += (spTarget - s.spleen) * Math.min(1, days / 45);
    // Chronic splanchnic vasodilation & plasma expansion (hyperdynamic circulation)
    const ppg = P[this.ni.CONF] - P[this.ni.IVCS];
    const x = clamp((ppg - 6) / 14, 0, 1);
    s.splTone += (1 - 0.45 * x - s.splTone) * Math.min(1, days / 30);
    const volT = 700 * x;
    const dv = (volT - s.volExtra) * Math.min(1, days / 30);
    if (Math.abs(dv) > 0.01) { s.volExtra += dv; this.addVolume(dv, HCT_BASE * 0.7, true); }
    // Lymph capacity adapts toward demand
    const st = this.starling();
    const demand = st.hep + st.spl;
    // Lymphatics remodel toward (but never fully match) chronic demand.
    const capT = Math.min(LYMPH.max, LYMPH.base + LYMPH.adaptFrac * Math.max(0, demand - LYMPH.base));
    s.lymphCap += (capT - s.lymphCap) * Math.min(1, LYMPH.adapt * days);
    s.ascites = clamp(s.ascites + st.net * 1440 * days, 0, 18000);
    // Anticoagulation slowly lyses thrombus
    if (p.anticoag) {
      for (const k of Object.keys(p.thrombus)) {
        p.thrombus[k] = Math.max(0, p.thrombus[k] - 0.006 * days);
        if (p.thrombus[k] === 0) delete p.thrombus[k];
      }
    }
  }

  /** Gradient between two nodes in excess of the healthy gradient (mmHg). */
  routeExcess([a, b]) {
    const i = this.ni[a], j = this.ni[b];
    return (this.P[i] - this.P[j]) - (this.refP[i] - this.refP[j]);
  }

  /** Starling filtration & lymph balance, mL/min. */
  starling() {
    const p = this.params, P = this.P, s = p.cirrhosis;
    const iap = this.iap ?? 5;
    const pic = 25 * (p.albumin / 4.0);
    const sigH = 0.1 + 0.5 * s;
    const piH = pic * (1 - sigH) * 0.9;
    const pMid = 0.6 * (0.7 * P[this.ni.SIN_R] + 0.3 * P[this.ni.CV_R]) + 0.4 * (0.7 * P[this.ni.SIN_L] + 0.3 * P[this.ni.CV_L]);
    // Hepatic lymph: 0.5 mL/min at baseline, rising with sinusoidal filtration pressure.
    const hep = 0.5 + LYMPH.kfHep * Math.max(0, (pMid - iap) - sigH * (pic - piH) - 0.75);
    const spl = LYMPH.kfSpl * Math.max(0, (P[this.ni.INT] - iap) - 0.9 * (pic - 10));
    const excess = Math.max(0, hep + spl - this.slow.lymphCap);
    let reabs = this.slow.ascites > 0 ? Math.min(0.6, this.slow.ascites / 2000) : 0;
    if (p.diuretics && this.slow.ascites > 0) reabs += Math.min(0.9, this.slow.ascites / 1500);
    const net = excess - reabs;
    this.flows = { hep, spl, excess, reabs };
    return { hep, spl, net, excess, highProtein: sigH < 0.3 && hep > spl };
  }

  // ───────────────────────── actions ─────────────────────────
  addVolume(mL, hct = 0, silentPlasma = false) {
    const i = this.ni.UPPV;
    this.V[i] += mL;
    const [Pk, Ps] = this.nodeK[i];
    this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i], Pk, Ps);
    this.blood.rbc += mL * hct;
    if (!silentPlasma) this.blood.infused += mL;
  }

  infuse(kind) {
    const spec = {
      crystalloid: { vol: 250, hct: 0, dur: 900 },   // 1 L, ~25 % stays intravascular
      prbc: { vol: 300, hct: 0.6, dur: 600 },
      albumin: { vol: 400, hct: 0, dur: 900 },
      plasma: { vol: 250, hct: 0, dur: 900 },
    }[kind];
    if (!spec) return;
    this.infusions.push({ kind, rate: spec.vol / spec.dur, remaining: spec.vol, hct: spec.hct });
    if (kind === 'albumin') this.params.albumin = Math.min(4.5, this.params.albumin + 0.25);
  }

  hemorrhage(mL) {
    // Instant external blood loss (for tests / scenarios)
    const hct = this.hct();
    const per = mL / 2;
    for (const id of ['UPPV', 'LOWV']) {
      const i = this.ni[id];
      this.V[i] -= per;
      const [Pk, Ps] = this.nodeK[i];
      this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i], Pk, Ps);
    }
    this.blood.rbc -= mL * hct;
    this.blood.lost += mL;
  }

  rupture(site, tear = 0.6) {
    this.bleed = { active: true, site, G: 0.25 * tear, clot: 0, total: 0, tear, t0: this.t, day: this.day };
    this.pushEvent({ id: 'VARIX_RUPTURE', severity: 'critical', title: site === 'VAR' ? 'Esophageal varix ruptured' : 'Gastric varix ruptured', anchor: site });
  }

  stopBleed(reason) {
    if (!this.bleed.active) return;
    this.bleed = { active: false, site: null, G: 0, clot: 0, total: this.bleed.total };
    this.pushEvent({ id: 'BLEED_STOPPED', severity: 'ok', title: reason === 'band' ? 'Bleeding controlled by banding' : 'Bleeding stopped (clot formed)', anchor: 'VAR' });
  }

  band() {
    this.bands = Math.min(4, this.bands + 1);
    this.slow.r0.VAR = Math.max(VARIX.r0Healthy, this.slow.r0.VAR * 0.6);
    if (this.bleed.active && this.bleed.site === 'VAR') this.stopBleed('band');
  }

  paracentesis(mL, albumin) {
    const removed = Math.min(mL, this.slow.ascites);
    this.slow.ascites -= removed;
    if (albumin) this.params.albumin = Math.min(4.5, this.params.albumin + 0.3 * removed / 5000);
    else if (removed > 5000) {
      // Post-paracentesis circulatory dysfunction: effective hypovolemia
      this.hemorrhageSilent(0.12 * (removed - 5000));
      this.pushEvent({ id: 'PICD', severity: 'caution', title: 'Post-paracentesis circulatory dysfunction', anchor: 'PERITONEUM' });
    }
    return removed;
  }
  hemorrhageSilent(mL) { const l = this.blood.lost; this.hemorrhage(mL); this.blood.lost = l; }

  startValsalva(sec = 10) { this.valsalva = { start: this.t, until: this.t + sec }; }

  pushEvent(ev) {
    const e = { ...ev, t: this.t, day: this.day, key: `${ev.id}-${this.eventLog.length}` };
    this.newEvents.push(e);
    this.eventLog.push(e);
    if (this.eventLog.length > 200) this.eventLog.shift();
  }

  // ───────────────────────── measurement helpers ─────────────────────────
  diameter(id) {
    const k = this.ei[id], e = EDGES[k];
    if (e.kind === 'collateral') {
      const f = this.edgeF[k], t = this.edgeT[k];
      const a = 0.5 * (tubeArea(this.P[f] - this.ext[f], 0.08) / tubeArea(this.refP[f], 0.08) + tubeArea(this.P[t] - this.ext[t], 0.08) / tubeArea(this.refP[t], 0.08));
      const present = !e.spontaneous || this.params.spontaneous[e.id];
      return present && !this.params.occluded[e.id] ? this.slow.d[e.id] * Math.sqrt(a) : 0;
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'tips') return this.params.tips.on ? this.params.tips.d : 0;
      return this.G[k] > 0 ? (e.d || 3) : 0;
    }
    const base = e.d || 3;
    if (e.kind !== 'vein' && e.kind !== 'diode') return base;
    const f = this.edgeF[k], t = this.edgeT[k];
    const x = this.extFor(this.edgeExt[k]);
    const a = 0.5 * (tubeArea(this.P[f] - x) / tubeArea(this.Pbase[f]) + tubeArea(this.P[t] - x) / tubeArea(this.Pbase[t]));
    return base * Math.sqrt(a) * Math.sqrt(1 - this.occlusion(id) * 0.9);
  }

  /** Mean velocity (cm/s), signed. */
  velocity(id) {
    const q = this.Q[this.ei[id]];
    const d = Math.max(0.5, this.diameter(id)) / 10; // cm
    return q / (Math.PI * d * d / 4);
  }

  varix(site, P = this.P) {
    const i = this.ni[site];
    const ptm = P[i] - this.ext[i];
    const ref = this.refP ? this.refP[i] : this.Pbase[i];
    const r0 = this.slow.r0[site];
    const r = r0 * Math.sqrt(tubeArea(ptm, 0.08) / tubeArea(ref, 0.08));
    const w = Math.max(0.12, VARIX.w0 / r0) * (site === 'GV' ? 1.4 : 1);
    const T = Math.max(0, ptm) * r / w;
    return { ptm, r, r0, w, T, ratio: T / VARIX.Tcrit };
  }

  hvpgTrue(P = this.P) {
    const lc = this.G[this.ei.WC_R], ll = this.G[this.ei.WL_R];
    const wh = (lc * P[this.ni.SIN_R] + ll * P[this.ni.CV_R]) / (lc + ll);
    return { whvp: wh, fhvp: P[this.ni.RHV], hvpg: wh - P[this.ni.RHV] };
  }

  // ───────────────────────── snapshot ─────────────────────────
  snapshot() {
    return structuredClone({
      params: this.params, V: Array.from(this.V), P: Array.from(this.P), Q: Array.from(this.Q), t: this.t, day: this.day,
      baro: this.baro, MAPf: this.MAPf, habr: this.habr, hr: this.hr, slow: this.slow, blood: this.blood,
      bleed: this.bleed, infusions: this.infusions, bands: this.bands, rng: this.rng.state(), iap: this.iap,
      valsalva: this.valsalva, evState: this.evState,
    });
  }
  restore(s) {
    const c = structuredClone(s);
    this.params = deepMerge(defaultParams(), c.params);
    this.V.set(c.V); this.P.set(c.P); if (c.Q) this.Q.set(c.Q);
    Object.assign(this, { t: c.t, day: c.day, baro: c.baro, MAPf: c.MAPf, habr: c.habr, hr: c.hr, slow: c.slow, blood: c.blood,
      bleed: c.bleed, infusions: c.infusions, bands: c.bands, iap: c.iap, valsalva: c.valsalva || { until: -1, start: -1 }, evState: c.evState || {} });
    this.rng.setState(c.rng);
    this.Pf = Float64Array.from(this.P);
    this.Qf = Float64Array.from(this.Q);
    this._drug = this.drugEffects();
    this.computeExt(this.t);
    this.computeG(this.P);
  }
}

function solve(A, b, n) {
  // inline import to keep hot path monomorphic
  return solveInPlace(A, b, n);
}
import { solveInPlace } from './linalg.js';

export { SPLANCHNIC_ARTERIES, PORTOSYSTEMIC_EDGES };
