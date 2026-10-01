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
// and a dye bolus that travels the network, splitting at junctions and diluting where it merges
// with undyed blood.

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
// An injection (DYE_SECONDS, or for as long as it is held, up to DYE_MAX_HOLD) released as a train
// of packets. Each moves at its vessel's display speed; at a node it continues into every outflow.
// Concentration is kept through a split (the same blood) and diluted at a merge, by this inflow's
// share of the node's total inflow.
export const DYE_BINS = 48;
export const DYE_SECONDS = 6, DYE_MAX_HOLD = 30;
const EMIT_EVERY = 0.12, MIN_C = 0.04, HIDDEN_S = 1;

export function createBolus(edges, nodes) {
  const NI = new Map(nodes.map((n, i) => [n.id, i]));
  const from = edges.map((e) => NI.get(e.from)), to = edges.map((e) => NI.get(e.to));
  const touch = nodes.map(() => []);
  edges.forEach((e, k) => { if (e.kind !== 'wedge') { touch[from[k]].push(k); touch[to[k]].push(k); } });
  let packets = [], emitters = [];

  // Hand a packet that has run off the downstream end of edge k to the next vessels.
  function pass(p, net, out, depth = 0) {
    const k = p.e, q = net.Q[k];
    const n = q >= 0 ? to[k] : from[k];
    let qin = 0;
    const outs = [];
    for (const j of touch[n]) {
      const qj = net.Q[j];
      if (!qj) continue;
      const into = (qj > 0 && to[j] === n) || (qj < 0 && from[j] === n);
      if (into) qin += Math.abs(qj); else outs.push(j);
    }
    if (!qin || !outs.length) return;
    const c = p.c * Math.abs(q) / qin;
    if (c < MIN_C) return;
    for (const j of outs) {
      const np = { e: j, x: p.x - net.len[k], c, age: p.age };
      if (np.x >= net.len[j] && depth < 8) pass(np, net, out, depth + 1); else out.push(np);
    }
  }

  return {
    /**
     * Starts an injection into edge `k` at `at` (0–1 along the flow) lasting `seconds`; injecting
     * into the same vessel again extends the one running. With `hold` it goes on until release()
     * (and at least `seconds`), up to DYE_MAX_HOLD.
     */
    inject(k, at = 0, { seconds = DYE_SECONDS, hold = false } = {}) {
      const em = emitters.find((x) => x.k === k);
      if (em) { em.left = Math.max(em.left, seconds); em.hold = em.hold || hold; return; }
      emitters.push({ k, at, left: seconds, acc: EMIT_EVERY, hold, held: 0 });
    },
    /** Ends a held injection (it still runs out its minimum). */
    release() { for (const em of emitters) em.hold = false; },
    clear() { packets = []; emitters = []; },
    get active() { return packets.length > 0 || emitters.length > 0; },
    /** Whether dye is being injected now. */
    get injecting() { return emitters.length > 0; },
    get count() { return packets.length; },
    /**
     * Advances by `dt` seconds. `net`: { Q (signed, per edge), vd (display speed, |world/s|),
     * len (world units; hidden vessels get a length of one second's travel) }.
     */
    step(dt, net) {
      for (const em of emitters) {
        em.left -= dt; em.acc += dt; em.held += dt;
        if (em.held >= DYE_MAX_HOLD) em.hold = false;
        while (em.acc >= EMIT_EVERY) { em.acc -= EMIT_EVERY; packets.push({ e: em.k, x: em.at * net.len[em.k], c: 1, age: 0 }); }
      }
      emitters = emitters.filter((em) => em.left > 0 || em.hold);
      const next = [];
      for (const p of packets) {
        p.x += net.vd[p.e] * dt; p.age += dt;
        // Washout: dye ages out over about 25 s wherever it is (it mixes into the whole blood volume).
        p.c *= Math.exp(-dt / 25);
        if (p.c < MIN_C) continue;
        if (p.x >= net.len[p.e]) pass(p, net, next); else next.push(p);
      }
      packets = next.length > 4000 ? next.slice(-4000) : next;
    },
    /**
     * Concentration (0–1) along edge k's drawn course from its `from` end, in DYE_BINS bins.
     * Each packet is a Gaussian as wide as the packet spacing there, widening as it ages
     * (dispersion), so a train of packets reads as a continuous column.
     */
    field(k, net, out) {
      out.fill(0);
      const L = net.len[k], fwd = net.Q[k] >= 0;
      let any = false;
      for (const p of packets) {
        if (p.e !== k) continue;
        any = true;
        const gap = Math.max(2, net.vd[k] * EMIT_EVERY), sg = gap * (1 + 0.12 * p.age);
        const amp = p.c * 0.3989 * gap / sg;
        const s = fwd ? p.x : L - p.x;
        const b0 = Math.max(0, Math.floor((s - 3 * sg) / L * (DYE_BINS - 1))), b1 = Math.min(DYE_BINS - 1, Math.ceil((s + 3 * sg) / L * (DYE_BINS - 1)));
        for (let b = b0; b <= b1; b++) { const d = (b / (DYE_BINS - 1)) * L - s; out[b] += amp * Math.exp(-0.5 * d * d / (sg * sg)); }
      }
      if (any) for (let b = 0; b < DYE_BINS; b++) out[b] = Math.min(1, out[b]);
      return any;
    },
  };
}
export const HIDDEN_SECONDS = HIDDEN_S;
