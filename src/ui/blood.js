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
export const displaySpeed = (v) => (Math.abs(v) < 0.25 ? 0 : Math.sign(v) * SPEED_K * Math.sqrt(Math.abs(v)));
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
 * heartbeat (amplified ×2 around the mean) instead of a smooth mean. `speed` scales motion.
 */
export function advanceStream(st, vMean, vNow, dt, { phasic = false, speed = 1, large = true } = {}) {
  if (st.vSlow == null) { st.vSlow = vMean; st.vFast = vNow; st.D = (st.seed || 0) * 97 % PERIOD; }
  st.vSlow += (vMean - st.vSlow) * -Math.expm1(-dt / 1.5);
  st.vFast += (vNow - st.vFast) * -Math.expm1(-dt / 0.12);
  const v = phasic ? st.vSlow + (st.vFast - st.vSlow) * 2 : st.vSlow;
  st.v = v;
  st.vd = displaySpeed(v);
  st.D = (((st.D + st.vd * speed * dt) % PERIOD) + PERIOD) % PERIOD;
  st.stasis = large ? 1 - smoothstep(2, 5.5, Math.abs(st.vSlow)) : 0;
  return st;
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
