// Moving blood: what the GPU draws in each lumen, computed from the model's flows.
//
// The picture keeps four things true and exaggerates only two scales:
//   direction   parcels move the way the model's flow goes, and reverse with it;
//   speed       a parcel's speed rises with mean velocity (on a √ scale, so 4× faster reads as 2×);
//   volume      the number of parcels passing a point each second is proportional to flow, so
//               what enters a junction leaves it (continuity);
//   profile     lanes nearer the axis run faster: laminar flow, the centre lane at twice the mean,
//               as in Poiseuille flow (venous Reynolds numbers are in the hundreds).
// Time is slowed and speed compressed so motion can be followed; ranking is never changed.
//
// Also computed here: stagnant blood (slow flow in a large vein, shown as drifting "smoke", the
// spontaneous echo contrast seen on ultrasound), where each vessel's blood comes from (mixing at
// every junction weighted by flow), the breathing and heartbeat in the flow (optional, amplified),
// and a dye bolus that travels the network, conserved along each vessel and mixed (flow-weighted)
// only at junctions.

// Display speed, world units per second, for a mean velocity in cm/s.
export const SPEED_K = 9.5;
// (Below 0.25 cm/s it stands; up to 0.6 it rises from 0, so the blood and the chevrons' fade start from rest, never in a jump.)
export const displaySpeed = (v) => { const a = Math.abs(v); return a < 0.25 ? 0 : Math.sign(v) * SPEED_K * Math.sqrt(a) * smoothstep(0.25, 0.6, a); };
// Parcels per display second per mL/s of flow.
export const KAPPA = 0.4;
// Slot spacing along a lane (world units); the shader doubles it (×2, ×4) when zoomed out so
// parcels stay apart on screen. The distance a vessel's stream has moved is kept modulo PERIOD:
// a multiple of 8 (lane speeds are in eighths of the mean) × 256 (slots per hash cycle) × the
// widest spacing, so wrapping never moves a parcel.
export const SLOT = 7;
export const PERIOD = 8 * 256 * SLOT * 4;
// A vein this wide (mm) or wider is "large": slow flow there is abnormal and shown as smoke.
export const STASIS_MIN_D = 5;

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Laminar lanes across a lumen: normalized positions (−1 … 1, kept off the wall) and speed
 * factors in eighths of the mean (2 at the axis, the Poiseuille centreline; at least 2/8 so the
 * outer lanes still creep). One lane runs at the mean.
 */
export function lanes(n) {
  if (n <= 1) return [{ y: 0, k: 8 }];
  return Array.from({ length: n }, (_, i) => {
    const y = ((i + 0.5) / n * 2 - 1) * 0.8;
    return { y, k: Math.max(2, Math.round(16 * (1 - y * y))) };
  });
}

/**
 * Fraction of slots that hold a parcel so that parcels cross a section at KAPPA × |flow| per
 * second: flux = p × Σ(lane speed) / spacing. Capped at 1 (a packed lane).
 */
export function occupancy(qMlS, vDisp, n, spacing = SLOT) {
  const sum = lanes(n).reduce((a, l) => a + l.k / 8, 0);
  const v = Math.max(Math.abs(vDisp), 2);
  return Math.min(1, (KAPPA * Math.abs(qMlS) * spacing) / (v * sum));
}

/**
 * One vessel's stream, advanced by `dt` seconds. `vMean` is the beat-filtered mean velocity
 * (cm/s), `vNow` the instantaneous one; with `phasic` the display follows breathing and the
 * heartbeat (amplified ×2 around the mean) instead of a smooth mean. `speed` scales motion;
 * `still` (reduced motion) keeps it in place, following the flow's direction at once.
 * `rev` (optional): whether the vessel counts as reversed, the same signal that turns its colour (stage.js
 * isReversed). Given, it alone sets which way the blood and its chevrons run, so both turn at the moment the
 * colour does: the blood slows to a stop over REVERSE_SETTLE, stands still, then eases off the other way.
 * Without it the stream turns when its eased mean crosses zero, which for a small reversed flow can be many
 * seconds after the colour.
 */
export function advanceStream(st, vMean, vNow, dt, { phasic = false, speed = 1, large = true, still = false, rev } = {}) {
  if (st.vSlow == null) { st.vSlow = vMean; st.vFast = vNow; st.D = (st.seed || 0) * 97 % PERIOD; st.hold = 0; st.settle = 0; }
  const ruled = rev != null, sgR = rev ? -1 : 1;
  // Reduced motion (still): nothing moves or eases; the stream stands where it is and points the way the flow goes now.
  if (still) { st.vSlow = vMean; st.vFast = vNow; st.hold = 0; st.settle = 0; st.sgn = ruled ? sgR : Math.sign(vMean) || st.sgn; dt = 0; }
  st.vSlow += (vMean - st.vSlow) * -Math.expm1(-dt / 1.5);
  st.vFast += (vNow - st.vFast) * -Math.expm1(-dt / 0.12);
  // When the mean flow turns round, the blood settles, stands still for REVERSE_HOLD seconds and then eases off the
  // other way (over REVERSE_RAMP), so the stop is seen (blueprint §6.2). The display alone holds: the model and its
  // numbers run on.
  const sg = ruled ? sgR : Math.sign(st.vSlow);
  if (sg && st.sgn && sg !== st.sgn) {
    st.hold = REVERSE_HOLD + REVERSE_RAMP;
    // Ruled by the colour's signal: the shown blood slows from where it is, while the mean starts afresh from the
    // new flow (shown only once the hold is over), instead of easing for seconds back through zero.
    if (ruled) { st.settle = REVERSE_SETTLE; st.vOld = st.vm ?? st.vSlow; st.vSlow = vMean; st.vFast = vNow; }
  }
  if (sg) st.sgn = sg;
  if (st.settle > 0) {
    st.settle = Math.max(0, st.settle - dt);
    const f = smoothstep(0, 1, st.settle / REVERSE_SETTLE);
    st.vm = st.v = f * st.vOld;
    st.vd = f * displaySpeed(st.vOld);
    st.D = (((st.D + st.vd * speed * dt) % PERIOD) + PERIOD) % PERIOD;
    st.stasis = large ? 1 - f * smoothstep(2, 5.5, Math.abs(st.vOld)) : 0;
    st.drift = drift(st, dt);
    return st;
  }
  let k = 1;
  if (st.hold > 0) {
    st.hold = Math.max(0, st.hold - dt);
    k = st.hold > REVERSE_RAMP ? 0 : smoothstep(0, 1, 1 - st.hold / REVERSE_RAMP);
  }
  // (Ruled: a flow too small to count as reversed, running the other way, shows as standing; beats still swing it.)
  const vm = ruled ? st.sgn * Math.max(0, st.sgn * st.vSlow) : st.vSlow;
  const v = phasic ? vm + (st.vFast - st.vSlow) * 2 : vm;
  st.vm = k * vm;
  st.v = k ? k * v : 0;
  st.vd = k ? k * displaySpeed(v) : 0;   // (eased on the display's own scale, which is steep near zero)
  st.D = (((st.D + st.vd * speed * dt) % PERIOD) + PERIOD) % PERIOD;
  st.stasis = large ? 1 - k * smoothstep(2, 5.5, Math.abs(vm)) : 0;
  st.drift = drift(st, dt);
  return st;
}
/**
 * How far a stream's stagnant blood (its smoke) has drifted, in shimmer cells: stasis × 0.06 cells a second, added up
 * frame by frame and wrapped at the noise's 50-cell period (seamless). A change in stasis changes only the drift's speed;
 * as stasis × clock it moved the whole pattern by Δstasis × clock, further the longer the app had run (round 2 review, B1).
 */
export const DRIFT_PERIOD = 50;
export const drift = (st, dt) => ((st.drift || 0) + st.stasis * dt * 0.06) % DRIFT_PERIOD;
/**
 * Reduced motion: still chevrons spaced by flow. The spacing level (0–3, continuous) for a flow q (mL/s, either way): 0, the
 * finest spacing, from 0.8 L/min; each halving of the flow doubles the spacing, up to 3 (eight times as far apart).
 */
export const CHEV_Q_FULL = 0.8 / 0.06;   // 0.8 L/min in mL/s
export const chevFlowLevel = (q) => Math.min(3, Math.max(0, Math.log2(CHEV_Q_FULL / Math.max(1e-3, Math.abs(q || 0)))));
/** Seconds the displayed blood stands still when a vessel's mean flow turns round, and then takes to reach its speed. */
export const REVERSE_HOLD = 0.6, REVERSE_RAMP = 0.5;
/** Seconds the shown blood takes to slow to a stop when its vessel turns reversed (or back), before that hold. */
export const REVERSE_SETTLE = 0.6;

/**
 * Reversal as shown, held for a breath (stage.js holdReversals): `n` flags that change only once a vessel's new direction has
 * held for `breath` seconds of model time, or at once on a jump. step(raw, t, jump): raw(k) is the model's flag (0 or 1) now,
 * t the model time; returns whether any shown flag turned. (Round 2 review, B3.)
 */
export function createReversalHold(n, breath = 4) {
  const hold = new Uint8Array(n), pend = new Float64Array(n).fill(NaN);
  return {
    hold,
    step(raw, t, jump) {
      let flip = false;
      for (let k = 0; k < n; k++) {
        const r = raw(k);
        if (r === hold[k]) { pend[k] = NaN; continue; }
        if (!jump) {
          if (!(pend[k] <= t)) pend[k] = t;
          if (t - pend[k] < breath) continue;
        }
        hold[k] = r; pend[k] = NaN; flip = true;
      }
      return flip;
    },
  };
}

// Key chevrons only (Blood menu; always while presenting): chevrons keep to the portal story (the portal
// inflow, the liver's beds, the hepatic veins, any open collateral or shunt); the rest fade.
const KEY_CHEV_IDS = new Set(['V_INT', 'V_COL', 'V_IMV', 'V_SPL', 'SV_MID', 'V_STO', 'SMV_CONF', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC']);
// A vein drawn in an open collateral's own lane: the ascending lumbar collateral (C9) runs up the azygos
// trunk's lane into the arch, so that stretch of its course is the azygos (AZY_SVC) on screen and keeps its
// chevrons while the collateral is open.
export const KEY_CHEV_LANES = { AZY_SVC: ['C9'] };
/** Whether vessel `e` keeps its chevrons under Key chevrons only; `open(id)`: whether collateral `id` is drawn open. */
export function keyChevron(e, open = () => false) {
  return KEY_CHEV_IDS.has(e.id) || e.kind === 'liver' || e.kind === 'collateral' || e.kind === 'shunt'
    || (KEY_CHEV_LANES[e.id] || []).some(open);
}

// ── Where the blood comes from ─────────────────────
// The veins that drain each bed name its blood: the superior mesenteric vein (small bowel; the
// coronary, left gastric, vein shares its color), the inferior mesenteric vein, the splenic vein;
// everything else (the hepatic artery's blood included) is systemic. Composition mixes at each
// node, weighted by inflow.
export const ORIGINS = [
  ['smv', 'SMV', 'SMV', 'Superior mesenteric vein (and the coronary vein)'],
  ['imv', 'IMV', 'IMV', 'Inferior mesenteric vein'],
  ['spleen', 'Splenic vein', 'SV', 'Splenic blood'],
  ['artery', 'Hepatic artery', 'HA', 'Arterial blood through the liver'],
  ['systemic', 'Systemic', 'Sys', 'Blood from the rest of the body'],
];
const SOURCE = { A_SMA: 0, A_LGA: 0, A_IMA: 1, A_SPL: 2, A_HEP: 3 };
/** Named sources (the rest is systemic): the channels of originFractions. */
export const ORIGIN_N = 4;

/**
 * Per edge, the fraction of its blood from the SMV, the IMV, the splenic vein and the hepatic
 * artery (the rest is systemic), as a Float32Array of ORIGIN_N × edges. Nodes are visited from high
 * pressure to low, the order blood flows in, so one pass mixes every junction from its already-mixed
 * inflows.
 */
export function originFractions(edges, nodes, Q, P) {
  const N = ORIGIN_N;
  const NI = new Map(nodes.map((n, i) => [n.id, i]));
  const from = edges.map((e) => NI.get(e.from)), to = edges.map((e) => NI.get(e.to));
  const inflow = nodes.map(() => []);
  edges.forEach((e, k) => {
    if (e.kind === 'wedge' || !Q[k]) return;
    inflow[Q[k] > 0 ? to[k] : from[k]].push(k);
  });
  const node = new Float32Array(nodes.length * N), edge = new Float32Array(edges.length * N);
  const order = nodes.map((_, i) => i).sort((a, b) => P[b] - P[a]);
  const comp = (k, out) => {
    const s = SOURCE[edges[k].id];
    if (s != null) { for (let c = 0; c < N; c++) out[c] = c === s ? 1 : 0; return; }
    const n = Q[k] >= 0 ? from[k] : to[k];
    for (let c = 0; c < N; c++) out[c] = node[n * N + c];
  };
  const c = new Array(N).fill(0), sum = new Array(N);
  for (const n of order) {
    let w = 0;
    sum.fill(0);
    for (const k of inflow[n]) { const q = Math.abs(Q[k]); comp(k, c); w += q; for (let i = 0; i < N; i++) sum[i] += q * c[i]; }
    if (w > 0) for (let i = 0; i < N; i++) node[n * N + i] = sum[i] / w;
  }
  for (let k = 0; k < edges.length; k++) { comp(k, c); edge.set(c, k * N); }
  return edge;
}

// ── Oxygen ─────────────────────────────────────────
// Oxygen saturation of each vessel's blood, for the "colored by oxygen" view: the hepatic artery's blood is fully
// arterial, each capillary bed returns venous blood (the gut's veins less desaturated than the rest of the body's),
// and the liver's sinusoids use oxygen along their length, so blood darkens from the portal tract to the central
// vein. Saturation mixes flow-weighted at every junction (one haemoglobin throughout, so content mixes as
// saturation does). Round, textbook values: arterial 98 %, portal (gut venous) about 85 %, mixed systemic venous
// about 75 %, and the liver extracting about a quarter of what reaches its sinusoids, so hepatic venous blood is
// about 65 %. When portal inflow falls and the hepatic artery takes over (the buffer response), the sinusoids
// fill with brighter arterial blood.
export const SAT = { artery: 0.98, gut: 0.85, systemic: 0.75 };
export const LIVER_EXTRACTION = 0.25;
const consumes = (e) => e.kind === 'liver' && e.zone === 'sin';
const isArterial = (e) => e.kind === 'artery' || e.kind === 'arteriole';

/**
 * Oxygen saturation (0–1) per node, and per edge at its `from` and `to` ends (2 × edges: from, to), as
 * { node, edge }. Beds fed straight from the aorta return their own venous saturation; the hepatic artery's node
 * mixes as any other. Nodes are visited from high pressure to low, as in originFractions.
 */
export function oxygenSat(edges, nodes, Q, P) {
  const NI = new Map(nodes.map((n, i) => [n.id, i]));
  const from = edges.map((e) => NI.get(e.from)), to = edges.map((e) => NI.get(e.to));
  const bed = new Map();
  edges.forEach((e, k) => { if (e.from === 'AO' && e.kind === 'arteriole') bed.set(to[k], e.tone === 'splanchnic' ? SAT.gut : SAT.systemic); });
  const inflow = nodes.map(() => []);
  edges.forEach((e, k) => {
    if (e.kind === 'wedge' || !Q[k]) return;
    inflow[Q[k] > 0 ? to[k] : from[k]].push(k);
  });
  const node = new Float32Array(nodes.length).fill(SAT.systemic), edge = new Float32Array(edges.length * 2);
  const ao = NI.get('AO');
  if (ao != null) node[ao] = SAT.artery;
  const up = (k) => (Q[k] >= 0 ? from[k] : to[k]);
  // Saturation leaving edge k at its downstream end.
  const out = (k) => node[up(k)] * (consumes(edges[k]) ? 1 - LIVER_EXTRACTION : 1);
  const order = nodes.map((_, i) => i).sort((a, b) => P[b] - P[a]);
  for (const n of order) {
    if (n === ao) continue;
    if (bed.has(n)) { node[n] = bed.get(n); continue; }
    let w = 0, s = 0;
    for (const k of inflow[n]) { const q = Math.abs(Q[k]); w += q; s += q * out(k); }
    if (w > 0) node[n] = s / w;
  }
  for (let k = 0; k < edges.length; k++) {
    const a = node[up(k)], b = out(k);
    // An arteriole into a bed is arterial along its length (the bed's own venous blood starts after it).
    const lo = isArterial(edges[k]) ? a : b;
    if (Q[k] >= 0) { edge[2 * k] = a; edge[2 * k + 1] = lo; } else { edge[2 * k] = lo; edge[2 * k + 1] = a; }
  }
  return { node, edge };
}

const OXY_MEMO = new WeakMap();
/** oxygenSat for model frame `f` (its beat-filtered flows), computed once per flow array: the figure, the lobule
 *  and the vessel card all read the same frame. */
export function oxygenFor(edges, nodes, f) {
  const Q = f.Qf || f.Q;
  let o = OXY_MEMO.get(Q);
  if (!o) { o = oxygenSat(edges, nodes, Q, f.Pf || f.P); OXY_MEMO.set(Q, o); }
  return o;
}

// ── Dye bolus ──────────────────────────────────────────
// An injection (DYE_SECONDS, or for as long as it is held, up to DYE_MAX_HOLD) travelling the
// network as dye in the blood. Each vessel holds slugs of blood with a concentration (0–1) that
// move at the vessel's display speed, so concentration is carried unchanged along a vessel (a
// slug moves exactly, with no smearing). It changes only at junctions: where vessels merge the
// outflow is the flow-weighted mean of the inflows (undyed inflow counts as zero), and each
// branch of a split gets the same concentration. The only other loss is a gentle washout.
export const DYE_BINS = 48;
export const DYE_SECONDS = 6, DYE_MAX_HOLD = 30;
const MIN_C = 0.02, HIDDEN_S = 1, WASHOUT_S = 30, MAX_STEP = 0.1;

export function createBolus(edges, nodes) {
  const NI = new Map(nodes.map((n, i) => [n.id, i]));
  const from = edges.map((e) => NI.get(e.from)), to = edges.map((e) => NI.get(e.to));
  const touch = nodes.map(() => []);
  edges.forEach((e, k) => { if (e.kind !== 'wedge') { touch[from[k]].push(k); touch[to[k]].push(k); } });
  // Per edge: slugs {a, b, c} along the flow direction (a < b, in world units from the upstream end),
  // front first. `dir` is the flow direction they were last laid out for.
  const st = edges.map(() => ({ dir: 1, s: [] }));
  let emitters = [];

  const orient = (S, dir, L) => {
    if (S.dir === dir) return;
    S.dir = dir;
    S.s = S.s.map((sl) => ({ a: L - sl.b, b: L - sl.a, c: sl.c })).reverse();
  };
  // Join touching slugs of (nearly) the same concentration, conserving the dye in them.
  const coalesce = (S) => {
    const out = [];
    for (const sl of S.s) {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.a - sl.b) < 1e-6 && Math.abs(prev.c - sl.c) <= 0.03 * Math.max(prev.c, sl.c)) {
        const l1 = prev.b - prev.a, l2 = sl.b - sl.a;
        prev.c = (prev.c * l1 + sl.c * l2) / (l1 + l2); prev.a = sl.a;
      } else out.push(sl);
    }
    S.s = out;
  };
  // Set the blood between a and b to concentration c.
  const paint = (S, a, b, c) => {
    const out = [];
    for (const sl of S.s) {
      if (sl.b <= a || sl.a >= b) { out.push(sl); continue; }
      if (sl.a < a) out.push({ a: sl.a, b: a, c: sl.c });
      if (sl.b > b) out.push({ a: b, b: sl.b, c: sl.c });
    }
    out.push({ a, b, c });
    out.sort((x, y) => y.a - x.a);
    S.s = out; coalesce(S);
  };

  return {
    /**
     * Starts an injection into edge `k` at `at` (0–1 along the flow) lasting `seconds`; injecting
     * into the same vessel again extends the one running. With `hold` it goes on until release()
     * (and at least `seconds`), up to DYE_MAX_HOLD.
     */
    inject(k, at = 0, { seconds = DYE_SECONDS, hold = false } = {}) {
      const em = emitters.find((x) => x.k === k);
      if (em) { em.left = Math.max(em.left, seconds); em.hold = em.hold || hold; return; }
      emitters.push({ k, at, left: seconds, hold, held: 0 });
    },
    /** Ends a held injection (it still runs out its minimum). */
    release() { for (const em of emitters) em.hold = false; },
    clear() { for (const S of st) S.s = []; emitters = []; },
    get active() { return emitters.length > 0 || st.some((S) => S.s.length > 0); },
    /** Whether dye is being injected now. */
    get injecting() { return emitters.length > 0; },
    get count() { return st.reduce((a, S) => a + S.s.length, 0); },
    /**
     * Advances by `dt` seconds. `net`: { Q (signed, per edge), vd (display speed, |world/s|),
     * len (world units; hidden vessels get a length of one second's travel) }.
     */
    step(dt, net) {
      if (dt > MAX_STEP) { for (; dt > 1e-9; dt -= MAX_STEP) this.step(Math.min(dt, MAX_STEP), net); return; }
      const decay = Math.exp(-dt / WASHOUT_S);
      // 1. Move every slug downstream; what passes the end of a vessel is tallied per junction as
      //    flow × (the mean concentration that passed).
      const mix = new Map();
      for (let k = 0; k < edges.length; k++) {
        const S = st[k], q = net.Q[k];
        if (!S.s.length || !q) continue;
        const L = net.len[k], d = net.vd[k] * dt;
        orient(S, q > 0 ? 1 : -1, L);
        const keep = [];
        let passed = 0;
        for (const sl of S.s) {
          sl.a += d; sl.b += d; sl.c *= decay;
          if (sl.c < MIN_C) continue;
          if (sl.a >= L) { passed += sl.c * (sl.b - sl.a); continue; }
          if (sl.b > L) { passed += sl.c * (sl.b - L); sl.b = L; }
          keep.push(sl);
        }
        S.s = keep;
        if (passed > 0 && d > 0) { const n = q > 0 ? to[k] : from[k]; mix.set(n, (mix.get(n) || 0) + Math.abs(q) * passed / d); }
      }
      // 2. At each junction the blood leaving every outflow has the flow-weighted mean concentration
      //    of everything entering (undyed inflow dilutes it); every branch gets the same.
      for (const [n, num] of mix) {
        let qin = 0;
        const outs = [];
        for (const j of touch[n]) {
          const qj = net.Q[j];
          if (!qj) continue;
          if ((qj > 0 && to[j] === n) || (qj < 0 && from[j] === n)) qin += Math.abs(qj); else outs.push(j);
        }
        const c = qin ? num / qin : 0;
        if (c < MIN_C) continue;
        for (const j of outs) {
          const S = st[j], d = net.vd[j] * dt;
          if (!(d > 0)) continue;
          orient(S, net.Q[j] > 0 ? 1 : -1, net.len[j]);
          const last = S.s[S.s.length - 1];
          if (last && Math.abs(last.a - d) < 1e-6 && Math.abs(last.c - c) <= 0.03 * Math.max(last.c, c)) {
            const l1 = last.b - last.a;
            last.c = (last.c * l1 + c * d) / (l1 + d); last.a = 0;
          } else S.s.push({ a: 0, b: d, c });
        }
      }
      // 3. The injection: the blood that passes the injection point this step is dyed.
      for (const em of emitters) {
        em.left -= dt; em.held += dt;
        if (em.held >= DYE_MAX_HOLD) em.hold = false;
        const q = net.Q[em.k];
        if (!q) continue;
        const L = net.len[em.k], d = net.vd[em.k] * dt, a = Math.min(em.at * L, Math.max(0, L - d));
        orient(st[em.k], q > 0 ? 1 : -1, L);
        paint(st[em.k], a, Math.min(L, a + d), 1);
      }
      emitters = emitters.filter((em) => em.left > 0 || em.hold);
    },
    /**
     * Concentration (0–1) along edge k's drawn course from its `from` end, in DYE_BINS bins: the
     * mean over the stretch each bin stands for.
     */
    field(k, net, out) {
      out.fill(0);
      const S = st[k];
      if (!S.s.length) return false;
      const L = net.len[k], w = L / (DYE_BINS - 1), fwd = S.dir > 0;
      for (const sl of S.s) {
        const lo = fwd ? sl.a : L - sl.b, hi = fwd ? sl.b : L - sl.a;
        const b0 = Math.max(0, Math.floor(lo / w - 0.5)), b1 = Math.min(DYE_BINS - 1, Math.ceil(hi / w + 0.5));
        for (let b = b0; b <= b1; b++) {
          const x0 = Math.max(0, (b - 0.5) * w), x1 = Math.min(L, (b + 0.5) * w);
          const ov = Math.min(hi, x1) - Math.max(lo, x0);
          if (ov > 0) out[b] += sl.c * ov / (x1 - x0);
        }
      }
      for (let b = 0; b < DYE_BINS; b++) out[b] = Math.min(1, out[b]);
      return true;
    },
  };
}
export const HIDDEN_SECONDS = HIDDEN_S;

// ── An active variceal bleed on the figure (veins-gl.js draws it) ──
// Blood spurts from the rupture into the lumen (up the esophagus from an esophageal varix, down into the fundus from a
// gastric one) in time with the heartbeat: two jets that lengthen on each beat, and drops thrown off them that rise and
// fall back under gravity. A slow bleed (under about 40 mL/min) oozes instead: the jets stay short and few drops fly.
// Blood then runs down from the tear into the stomach, a trickle with beads sliding along it, and collects in a pool
// that lies in the bottom of the stomach with a flat surface, its level rising with the square root of the blood lost.
// t: seconds (0 holds every jet and drop at its own stage); hr: the heart rate (beats a minute).
// Each shape: [x0, y0, x1, y1, r0, r1, alpha, kind]: a jet (kind 1) from its base (x0, y0; radius r0) to its tip
// (x1, y1; radius r1), or the pool (kind 0): a bowl, the ellipse at (x0, y0) with radii x1, y1, filled below the
// surface at height r0.
export const BLEED_JETS = 2;
// A bleed's jets and pool come and go over BLEED_FADE seconds (never in one frame): the share shown steps toward 1 while
// the bleed runs and toward 0 once it stops (Reduce Motion: at once), and every shape's alpha is scaled by its eased value.
export const BLEED_FADE = 0.5;
export const stepBleedFade = (a, on, dt, instant = false) => (instant ? (on ? 1 : 0) : on ? Math.min(1, a + dt / BLEED_FADE) : Math.max(0, a - dt / BLEED_FADE));
export const fadeBleedShapes = (shapes, a) => {
  if (a >= 1) return shapes;
  const k = a <= 0 ? 0 : a * a * (3 - 2 * a);
  return k ? shapes.map((sh) => { const o = sh.slice(); o[6] *= k; return o; }) : [];
};

export const BLEED_DROPS = 12;
const DROP_LIFE = 0.75, GRAV = 150;
const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
// The heartbeat's surge at time t: a sharp systolic peak over a quieter flow between beats, periodic and smooth.
export const bleedPulse = (t, hr = 80) => 0.25 + 0.75 * Math.max(0, Math.cos(2 * Math.PI * (frac((t * Math.min(160, Math.max(45, hr || 80))) / 60) - 0.12))) ** 4;
// The pool's fill (0..1 of its bowl) for the blood lost so far: a puddle at once, full by 1.5 L.
export const poolFill = (total) => Math.min(1, Math.max(0.12, Math.sqrt(Math.max(0, total || 0) / 1500)));
const hash = (i) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
function along(pts, u) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let d = u * L;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = Math.min(1, d / seg[i]), a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]];
    }
    d -= seg[i];
  }
  return [...pts[pts.length - 1], 0, 1];
}

export function bleedShapes(bleed, rate, t, sites, hr = 80) {
  const gv = bleed.site === 'GV';
  const site = gv ? [sites.fundus[0], sites.fundus[1] - 4] : [sites.varix[0] + 8, sites.varix[1] + 12];
  const k = Math.min(1.8, Math.max(0.7, (rate || 50) / 90));
  const spurt = smooth(25, 70, rate || 50);   // 0 an ooze, 1 a spurting bleed
  const up = gv ? 1 : -1;   // (the jets' way into the lumen: up the esophagus, down into the stomach)
  // The pool: a bowl in the bottom of the stomach, filled to its surface.
  const [px, py] = sites.stomachPool, rx = 72, ry = 40;
  const surf = py + ry - 2 * ry * 0.85 * poolFill(bleed.total);
  const out = [[px, py, rx, ry, surf, 0, 0.88, 0]];
  // The jets, lengthening on each beat.
  const p = bleedPulse(t, hr);
  for (const [da, w] of [[-0.06, 1], [0.08, 0.7]].slice(0, BLEED_JETS)) {
    const len = (4 + (6 + 28 * p) * spurt) * k * w, a = up * Math.PI / 2 + da;
    out.push([site[0], site[1], site[0] + Math.cos(a) * len, site[1] + Math.sin(a) * len, 1.7 * k * w, 0.45 * k, 0.95 * (0.6 + 0.4 * p), 1]);
  }
  // The drops: each thrown off at its birth, as far as that moment's surge throws it, and falling back; each eases in from
  // nothing and thins to nothing before it is thrown again, so none pops on or off.
  for (let i = 0; i < BLEED_DROPS; i++) {
    const age = frac(t / DROP_LIFE + i / BLEED_DROPS) * DROP_LIFE, pb = bleedPulse(t - age, hr);
    const a = up * Math.PI / 2 + (hash(i) - 0.5) * 0.24, v = Math.sqrt(2 * GRAV * (5 + 18 * pb) * k) * (0.35 + 0.65 * spurt);
    const x = site[0] + Math.cos(a) * v * age, y = site[1] + Math.sin(a) * v * age + 0.5 * GRAV * age * age;
    const r = (0.8 + 0.9 * hash(i + 40)) * k;
    // (Gone once it falls back past the tear, into the wall below it.)
    const fall = gv ? 1 : 1 - smooth(site[1] + 4, site[1] + 40, y);
    const al = 0.9 * smooth(0, 0.12, age) * (1 - age / DROP_LIFE) ** 1.2 * (0.3 + 0.7 * spurt) * fall;
    const vy = Math.sin(a) * v + GRAV * age, vx = Math.cos(a) * v, sp = Math.hypot(vx, vy) || 1;
    out.push([x, y, x - (vx / sp) * r * 1.4, y - (vy / sp) * r * 1.4, r, r * 0.7, al, 1]);
  }
  // The trickle down into the stomach, and beads of blood sliding along it toward the pool.
  const run = gv ? [site, [site[0] + 2, site[1] + 40], [site[0] + 4, site[1] + 100], [px - 4, surf + 2]]
    : [site, [site[0] + 7, site[1] + 18], [site[0] + 23, site[1] + 56], [site[0] + 41, site[1] + 116], [site[0] + 57, site[1] + 176], [px - 6, surf + 2]];
  for (let i = 1; i < run.length; i++) out.push([run[i - 1][0], run[i - 1][1], run[i][0], run[i][1], 1.4 * k, 1.2 * k, 0.78, 1]);
  for (let i = 0; i < 3; i++) {
    const u = frac(t * 0.55 + i / 3), [x, y, tx, ty] = along(run, u), r = 2.1 * k;
    out.push([x, y, x - tx * r * 1.6, y - ty * r * 1.6, r, r * 0.8, 0.9 * Math.sin(Math.PI * u) ** 0.8, 1]);
  }
  return out;
}
