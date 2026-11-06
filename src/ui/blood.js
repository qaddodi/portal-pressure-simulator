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

import { lumenSurface, lumenAt } from './stomach-lumen.js';

// Display speed, world units per second, for a mean velocity in cm/s.
export const SPEED_K = 9.5;
// (Below 0.25 cm/s it stands; up to 0.6 it rises from 0, so the blood and the chevrons' fade start from rest, never in a jump.)
export const displaySpeed = (v) => { const a = Math.abs(v); return a < 0.25 ? 0 : Math.sign(v) * SPEED_K * Math.sqrt(a) * smoothstep(0.25, 0.6, a); };
// The time-averaged mean velocity the blood and the chevrons follow (TAMV): the engine's 1.5 s flow filter, then this one, so the
// beat is gone and the breath's swing is down to a twelfth; a reversed vessel's sign is the mean's (a hepatofugal one runs backwards).
export const MEAN_TAU = 3;
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

const NO_OPTS = {};   // (advanceStream's options when none are given: read, never written)
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
export function advanceStream(st, vMean, vNow, dt, opts = NO_OPTS) {
  ADV_IN[0] = vMean; ADV_IN[1] = vNow; ADV_IN[2] = dt;
  return advanceKept(st, opts);
}
/**
 * The same for the vessel k of two velocity tables, the time step in `opts.dt`: a frame advances every vessel's stream, and a number handed to a
 * call that is not inlined (this body is too large to be) is boxed in a new heap number, three for each of them. They go through ADV_IN instead.
 */
export function advanceStreamAt(st, means, nows, k, opts) {
  ADV_IN[0] = means[k]; ADV_IN[1] = nows[k]; ADV_IN[2] = opts.dt;
  return advanceKept(st, opts);
}
const ADV_IN = new Float64Array(3);   // [the mean velocity, the instantaneous one, the time step] of the stream being advanced
function advanceKept(st, opts) {
  const vMean = ADV_IN[0], vNow = ADV_IN[1];
  let dt = ADV_IN[2];
  const { phasic = false, speed = 1, large = true, still = false, rev } = opts;
  // (Not set yet: undefined, or NaN in a stream made with every field a number.)
  if (!(st.vSlow > -Infinity)) { st.vSlow = vMean; st.vFast = vNow; st.D = (st.seed || 0) * 97 % PERIOD; st.hold = 0; st.settle = 0; }
  const ruled = rev != null, sgR = rev ? -1 : 1;
  // Reduced motion (still): nothing moves or eases; the stream stands where it is and points the way the flow goes now.
  if (still) { st.vSlow = vMean; st.vFast = vNow; st.hold = 0; st.settle = 0; st.sgn = ruled ? sgR : Math.sign(vMean) || st.sgn; dt = 0; }
  st.vSlow += (vMean - st.vSlow) * -Math.expm1(-dt / MEAN_TAU);
  st.vFast += (vNow - st.vFast) * -Math.expm1(-dt / 0.12);
  // When the mean flow turns round, the blood settles, stands still for REVERSE_HOLD seconds and then eases off the
  // other way (over REVERSE_RAMP), so the stop is seen (blueprint §6.2). The display alone holds: the model and its
  // numbers run on.
  const sg = ruled ? sgR : Math.sign(st.vSlow);
  if (sg && st.sgn && sg !== st.sgn) {
    st.hold = REVERSE_HOLD + REVERSE_RAMP;
    // Ruled by the colour's signal: the shown blood slows from where it is, while the mean starts afresh from the
    // new flow (shown only once the hold is over), instead of easing for seconds back through zero.
    if (ruled) { st.settle = REVERSE_SETTLE; st.vOld = st.vm > -Infinity ? st.vm : st.vSlow; st.vSlow = vMean; st.vFast = vNow; }
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
// A vein that carries an open collateral's blood on: the ascending lumbar collateral (C9) empties into the azygos
// arch, so the azygos (AZY_SVC) beside it keeps its chevrons while the collateral is open.
export const KEY_CHEV_LANES = { AZY_SVC: ['C9'] };
const NEVER = () => false;
/** Whether vessel `e` keeps its chevrons under Key chevrons only; `open(id)`: whether collateral `id` is drawn open. */
export function keyChevron(e, open = NEVER) {
  if (KEY_CHEV_IDS.has(e.id) || e.kind === 'liver' || e.kind === 'collateral' || e.kind === 'shunt') return true;
  const laneIds = KEY_CHEV_LANES[e.id];   // (some(open): open(id, index, list), as the array method calls it)
  if (laneIds) for (let i = 0; i < laneIds.length; i++) if (open(laneIds[i], i, laneIds)) return true;
  return false;
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

// Scratch the network passes below write over, kept from call to call (2 Nov 2026, scripts/off-gpu-scan.mjs alloc: a Map, arrays and
// typed arrays made for every model frame). Plain arrays grow by being written past their end, so none is ever sized or remade; a number
// held as a Float32Array's is rounded with Math.fround where it is stored, the same value the typed array gave.
const NODE_IX = new Map(), NODE_IDS = [];
/** The index of each node by its id, kept while the node list is the same ids in the same order. */
function nodeIndex(nodes) {
  let same = NODE_IDS.length === nodes.length;
  for (let i = 0; same && i < nodes.length; i++) if (NODE_IDS[i] !== nodes[i].id) same = false;
  if (!same) {
    NODE_IX.clear();
    NODE_IDS.length = nodes.length;
    for (let i = 0; i < nodes.length; i++) { NODE_IDS[i] = nodes[i].id; NODE_IX.set(nodes[i].id, i); }
  }
  return NODE_IX;
}
const EF = [], ET = [], FLOW_TO = [], IN_AT = [], IN_LIST = [], ORDER = [];   // (edge ends, the node each flow enters, the inflow lists: start, edges; the nodes by pressure)
/** The nodes' indexes from high pressure to low (stable), the order blood flows in. */
function byPressure(nn, P) {
  for (let i = 0; i < nn; i++) {
    const v = i;
    let j = i - 1;
    while (j >= 0 && P[ORDER[j]] < P[v]) { ORDER[j + 1] = ORDER[j]; j--; }
    ORDER[j + 1] = v;
  }
}
/** Each non-wedge edge with flow, listed under the node its flow enters (IN_AT[n] .. IN_AT[n + 1] in IN_LIST, edges in order). */
function inflowLists(edges, nn, Q) {
  const ne = edges.length;
  for (let n = 0; n <= nn + 1; n++) IN_AT[n] = 0;
  for (let k = 0; k < ne; k++) {
    if (edges[k].kind === 'wedge' || !Q[k]) { FLOW_TO[k] = -1; continue; }
    const n = Q[k] > 0 ? ET[k] : EF[k];
    if (!(n >= 0)) { FLOW_TO[k] = -1; continue; }
    FLOW_TO[k] = n;
    IN_AT[n + 1]++;
  }
  for (let n = 0; n < nn; n++) IN_AT[n + 1] += IN_AT[n];
  for (let i = IN_LIST.length; i < IN_AT[nn]; i++) IN_LIST[i] = 0;   // (no holes: the fill below is out of order)
  for (let k = 0; k < ne; k++) if (FLOW_TO[k] >= 0) IN_LIST[IN_AT[FLOW_TO[k]]++] = k;
  for (let n = nn; n > 0; n--) IN_AT[n] = IN_AT[n - 1];   // (the fill moved each start to its end: back one)
  IN_AT[0] = 0;
}
const O_NODE = [], O_C = [], O_SUM = [];
for (let i = 0; i < ORIGIN_N; i++) { O_C.push(0); O_SUM.push(0); }
/** O_C: the blend of edge k's blood: the named source of a source artery, else its upstream node's. */
function blendOf(edges, Q, k) {
  const N = ORIGIN_N, s = SOURCE[edges[k].id];
  if (s != null) { for (let i = 0; i < N; i++) O_C[i] = i === s ? 1 : 0; return; }
  const n = Q[k] >= 0 ? EF[k] : ET[k];
  for (let i = 0; i < N; i++) O_C[i] = O_NODE[n * N + i];
}

/**
 * Per edge, the fraction of its blood from the SMV, the IMV, the splenic vein and the hepatic
 * artery (the rest is systemic), written into `out` (a Float32Array of ORIGIN_N × edges, which it returns). Nodes are
 * visited from high pressure to low, the order blood flows in, so one pass mixes every junction from its already-mixed
 * inflows. Allocates nothing: a caller that reads it every frame keeps its own `out`.
 */
export function originFractionsInto(edges, nodes, Q, P, out) {
  const N = ORIGIN_N, NI = nodeIndex(nodes), nn = nodes.length, ne = edges.length;
  for (let k = 0; k < ne; k++) { EF[k] = NI.get(edges[k].from); ET[k] = NI.get(edges[k].to); }
  inflowLists(edges, nn, Q);
  for (let i = 0; i < nn * N; i++) O_NODE[i] = 0;
  const node = O_NODE, c = O_C, sum = O_SUM;
  byPressure(nn, P);
  for (let x = 0; x < nn; x++) {
    const n = ORDER[x];
    let w = 0;
    for (let i = 0; i < N; i++) sum[i] = 0;
    for (let p = IN_AT[n]; p < IN_AT[n + 1]; p++) { const k = IN_LIST[p], q = Math.abs(Q[k]); blendOf(edges, Q, k); w += q; for (let i = 0; i < N; i++) sum[i] += q * c[i]; }
    if (w > 0) for (let i = 0; i < N; i++) node[n * N + i] = Math.fround(sum[i] / w);
  }
  for (let k = 0; k < ne; k++) { blendOf(edges, Q, k); for (let i = 0; i < N; i++) out[k * N + i] = c[i]; }
  return out;
}
/** originFractionsInto into a new Float32Array. */
export function originFractions(edges, nodes, Q, P) {
  return originFractionsInto(edges, nodes, Q, P, new Float32Array(edges.length * ORIGIN_N));
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

const BED_HAS = [], BED_SAT = [];
/** Saturation leaving edge k at its downstream end. */
const oxOut = (node, edges, k, upNode) => node[upNode] * (consumes(edges[k]) ? 1 - LIVER_EXTRACTION : 1);
/**
 * Oxygen saturation (0–1) per node, and per edge at its `from` and `to` ends (2 × edges: from, to), written into
 * res = { node, edge } (arrays, or Float32Arrays; the numbers stored are the Float32 ones either way). Beds fed straight from the aorta
 * return their own venous saturation; the hepatic artery's node mixes as any other. Nodes are visited from high pressure to
 * low, as in originFractions. Allocates nothing.
 */
function oxygenInto(res, edges, nodes, Q, P) {
  const NI = nodeIndex(nodes), nn = nodes.length, ne = edges.length, node = res.node, edge = res.edge;
  for (let k = 0; k < ne; k++) { EF[k] = NI.get(edges[k].from); ET[k] = NI.get(edges[k].to); }
  for (let n = 0; n < nn; n++) BED_HAS[n] = 0;
  for (let k = 0; k < ne; k++) {
    const e = edges[k];
    if (e.from === 'AO' && e.kind === 'arteriole') { BED_HAS[ET[k]] = 1; BED_SAT[ET[k]] = e.tone === 'splanchnic' ? SAT.gut : SAT.systemic; }
  }
  inflowLists(edges, nn, Q);
  for (let n = 0; n < nn; n++) node[n] = Math.fround(SAT.systemic);
  const ao = NI.get('AO');
  if (ao != null) node[ao] = Math.fround(SAT.artery);
  byPressure(nn, P);
  for (let x = 0; x < nn; x++) {
    const n = ORDER[x];
    if (n === ao) continue;
    if (BED_HAS[n]) { node[n] = Math.fround(BED_SAT[n]); continue; }
    let w = 0, s = 0;
    for (let p = IN_AT[n]; p < IN_AT[n + 1]; p++) { const k = IN_LIST[p], q = Math.abs(Q[k]); w += q; s += q * oxOut(node, edges, k, Q[k] >= 0 ? EF[k] : ET[k]); }
    if (w > 0) node[n] = Math.fround(s / w);
  }
  for (let k = 0; k < ne; k++) {
    const u = Q[k] >= 0 ? EF[k] : ET[k], a = node[u], b = oxOut(node, edges, k, u);
    // An arteriole into a bed is arterial along its length (the bed's own venous blood starts after it).
    const lo = isArterial(edges[k]) ? a : b;
    if (Q[k] >= 0) { edge[2 * k] = Math.fround(a); edge[2 * k + 1] = Math.fround(lo); } else { edge[2 * k] = Math.fround(lo); edge[2 * k + 1] = Math.fround(a); }
  }
}
/** { node, edge } as Float32Arrays, new each call (for a caller that keeps it; the figure reads oxygenFor's). */
export function oxygenSat(edges, nodes, Q, P) {
  const res = { node: new Float32Array(nodes.length), edge: new Float32Array(edges.length * 2) };
  oxygenInto(res, edges, nodes, Q, P);
  return res;
}

// oxygenFor's answers: a few slots written over in turn (a flow array stays in its slot while it is among the last OXY_SLOTS read), so a
// model frame is worked out once, however many read it, and none is made. Read it where it is asked for; a held answer is written over
// after OXY_SLOTS other flow arrays. The arrays are plain ones (numbers as Float32 holds them), read by index.
const OXY_SLOTS = 8, OXY_MEMO = [];
for (let i = 0; i < OXY_SLOTS; i++) OXY_MEMO.push({ Q: null, node: [], edge: [] });
let oxyAt = 0;
/** oxygenSat for model frame `f` (its beat-filtered flows), computed once per flow array: the figure, the lobule
 *  and the vessel card all read the same frame. */
export function oxygenFor(edges, nodes, f) {
  const Q = f.Qf || f.Q;
  for (let i = 0; i < OXY_SLOTS; i++) if (OXY_MEMO[i].Q === Q) return OXY_MEMO[i];
  const o = OXY_MEMO[oxyAt];
  oxyAt = (oxyAt + 1) % OXY_SLOTS;
  o.Q = null;
  oxygenInto(o, edges, nodes, Q, f.Pf || f.P);
  o.Q = Q;
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

const NO_INJECT = {};   // (inject's options when none are given: never written)
export function createBolus(edges, nodes) {
  const NI = new Map(nodes.map((n, i) => [n.id, i]));
  const from = edges.map((e) => NI.get(e.from)), to = edges.map((e) => NI.get(e.to));
  const touch = nodes.map(() => []);
  edges.forEach((e, k) => { if (e.kind !== 'wedge') { touch[from[k]].push(k); touch[to[k]].push(k); } });
  // Per edge: slugs {a, b, c} along the flow direction (a < b, in world units from the upstream end), front first, kept as three
  // parallel lists (SA, SB, SC, SN of them in use), written in place. `SD` is the flow direction they were last laid out for.
  // (2 Nov 2026: a slug was an object, and a step made lists, a Map and a closure; none now. These lists grow by being written past
  // their end, never remade.)
  const E = edges.length;
  const SA = edges.map(() => []), SB = edges.map(() => []), SC = edges.map(() => []);
  const SN = new Int32Array(E), SD = new Int8Array(E).fill(1);
  let emitters = [];
  // Scratch kept from call to call: a paint's slugs before they are ordered, a step's junction tallies (in the order first met) and a
  // junction's outflows.
  const TA = [], TB = [], TC = [];
  const mixV = new Float64Array(nodes.length), mixSeen = new Int32Array(nodes.length), mixList = new Int32Array(nodes.length), outs = new Int32Array(2 * E + 1);
  let mixStamp = 0;

  const orient = (k, dir, L) => {
    if (SD[k] === dir) return;
    SD[k] = dir;
    // (Each slug mirrored along the vessel, and the list turned round.)
    const a = SA[k], b = SB[k], c = SC[k], n = SN[k];
    for (let i = 0, j = n - 1; i <= j; i++, j--) {
      const ai = a[i], bi = b[i], ci = c[i], aj = a[j], bj = b[j], cj = c[j];
      a[i] = L - bj; b[i] = L - aj; c[i] = cj;
      a[j] = L - bi; b[j] = L - ai; c[j] = ci;
    }
  };
  // Join touching slugs of (nearly) the same concentration, conserving the dye in them: the m slugs in TA/TB/TC become edge k's.
  const coalesce = (k, m) => {
    const a = SA[k], b = SB[k], c = SC[k];
    let w = 0;
    for (let i = 0; i < m; i++) {
      const sa = TA[i], sb = TB[i], sc = TC[i];
      if (w > 0 && Math.abs(a[w - 1] - sb) < 1e-6 && Math.abs(c[w - 1] - sc) <= 0.03 * Math.max(c[w - 1], sc)) {
        const l1 = b[w - 1] - a[w - 1], l2 = sb - sa;
        c[w - 1] = (c[w - 1] * l1 + sc * l2) / (l1 + l2); a[w - 1] = sa;
      } else { a[w] = sa; b[w] = sb; c[w] = sc; w++; }
    }
    SN[k] = w;
  };
  // Set the blood between a and b to concentration c.
  const paint = (k, a, b, c) => {
    const ka = SA[k], kb = SB[k], kc = SC[k], n = SN[k];
    let m = 0;
    for (let i = 0; i < n; i++) {
      const sa = ka[i], sb = kb[i], sc = kc[i];
      if (sb <= a || sa >= b) { TA[m] = sa; TB[m] = sb; TC[m] = sc; m++; continue; }
      if (sa < a) { TA[m] = sa; TB[m] = a; TC[m] = sc; m++; }
      if (sb > b) { TA[m] = b; TB[m] = sb; TC[m] = sc; m++; }
    }
    TA[m] = a; TB[m] = b; TC[m] = c; m++;
    // (Stable, front first: by a, largest first.)
    for (let i = 1; i < m; i++) {
      const va = TA[i], vb = TB[i], vc = TC[i];
      let j = i - 1;
      while (j >= 0 && TA[j] < va) { TA[j + 1] = TA[j]; TB[j + 1] = TB[j]; TC[j + 1] = TC[j]; j--; }
      TA[j + 1] = va; TB[j + 1] = vb; TC[j + 1] = vc;
    }
    coalesce(k, m);
  };

  return {
    /**
     * Starts an injection into edge `k` at `at` (0–1 along the flow) lasting `seconds`; injecting
     * into the same vessel again extends the one running. With `hold` it goes on until release()
     * (and at least `seconds`), up to DYE_MAX_HOLD.
     */
    inject(k, at = 0, { seconds = DYE_SECONDS, hold = false } = NO_INJECT) {
      for (let x = 0; x < emitters.length; x++) {
        const em = emitters[x];
        if (em.k === k) { em.left = Math.max(em.left, seconds); em.hold = em.hold || hold; return; }
      }
      emitters.push({ k, at, left: seconds, hold, held: 0 });   // alloc-rare: one record for each injection started (a learner's action; or, once, the worker's failure handing its runs back), never per frame
    },
    /** Ends a held injection (it still runs out its minimum). */
    release() { for (const em of emitters) em.hold = false; },
    clear() { SN.fill(0); emitters = []; },
    get active() {
      if (emitters.length > 0) return true;
      for (let k = 0; k < E; k++) if (SN[k] > 0) return true;
      return false;
    },
    /** Whether dye is being injected now. */
    get injecting() { return emitters.length > 0; },
    get count() { let n = 0; for (let k = 0; k < E; k++) n += SN[k]; return n; },
    /**
     * Advances by `dt` seconds. `net`: { Q (signed, per edge), vd (display speed, |world/s|),
     * len (world units; hidden vessels get a length of one second's travel) }.
     */
    step(dt, net) {
      if (dt > MAX_STEP) { for (; dt > 1e-9; dt -= MAX_STEP) this.step(Math.min(dt, MAX_STEP), net); return; }
      const decay = Math.exp(-dt / WASHOUT_S);
      // 1. Move every slug downstream; what passes the end of a vessel is tallied per junction as
      //    flow × (the mean concentration that passed).
      mixStamp++;
      let mixN = 0;
      for (let k = 0; k < E; k++) {
        const q = net.Q[k], n0 = SN[k];
        if (!n0 || !q) continue;
        const L = net.len[k], d = net.vd[k] * dt;
        orient(k, q > 0 ? 1 : -1, L);
        const a = SA[k], b = SB[k], c = SC[k];
        let passed = 0, w = 0;
        for (let i = 0; i < n0; i++) {
          const sa = a[i] + d;
          let sb = b[i] + d;
          const sc = c[i] * decay;
          if (sc < MIN_C) continue;
          if (sa >= L) { passed += sc * (sb - sa); continue; }
          if (sb > L) { passed += sc * (sb - L); sb = L; }
          a[w] = sa; b[w] = sb; c[w] = sc; w++;
        }
        SN[k] = w;
        if (passed > 0 && d > 0) {
          const n = q > 0 ? to[k] : from[k];
          if (mixSeen[n] !== mixStamp) { mixSeen[n] = mixStamp; mixV[n] = 0; mixList[mixN++] = n; }
          mixV[n] = (mixV[n] || 0) + Math.abs(q) * passed / d;
        }
      }
      // 2. At each junction the blood leaving every outflow has the flow-weighted mean concentration
      //    of everything entering (undyed inflow dilutes it); every branch gets the same.
      for (let x = 0; x < mixN; x++) {
        const n = mixList[x], num = mixV[n], tn = touch[n];
        let qin = 0, no = 0;
        for (let i = 0; i < tn.length; i++) {
          const j = tn[i], qj = net.Q[j];
          if (!qj) continue;
          if ((qj > 0 && to[j] === n) || (qj < 0 && from[j] === n)) qin += Math.abs(qj); else outs[no++] = j;
        }
        const c = qin ? num / qin : 0;
        if (c < MIN_C) continue;
        for (let i = 0; i < no; i++) {
          const j = outs[i], d = net.vd[j] * dt;
          if (!(d > 0)) continue;
          orient(j, net.Q[j] > 0 ? 1 : -1, net.len[j]);
          const a = SA[j], b = SB[j], cc = SC[j], last = SN[j] - 1;
          if (last >= 0 && Math.abs(a[last] - d) < 1e-6 && Math.abs(cc[last] - c) <= 0.03 * Math.max(cc[last], c)) {
            const l1 = b[last] - a[last];
            cc[last] = (cc[last] * l1 + c * d) / (l1 + d); a[last] = 0;
          } else { const m = SN[j]++; a[m] = 0; b[m] = d; cc[m] = c; }
        }
      }
      // 3. The injection: the blood that passes the injection point this step is dyed.
      for (let x = 0; x < emitters.length; x++) {
        const em = emitters[x];
        em.left -= dt; em.held += dt;
        if (em.held >= DYE_MAX_HOLD) em.hold = false;
        const q = net.Q[em.k];
        if (!q) continue;
        const L = net.len[em.k], d = net.vd[em.k] * dt, a = Math.min(em.at * L, Math.max(0, L - d));
        orient(em.k, q > 0 ? 1 : -1, L);
        paint(em.k, a, Math.min(L, a + d), 1);
      }
      let kept = 0;
      for (let x = 0; x < emitters.length; x++) { const em = emitters[x]; if (em.left > 0 || em.hold) emitters[kept++] = em; }
      emitters.length = kept;
    },
    /**
     * Concentration (0–1) along edge k's drawn course from its `from` end, in DYE_BINS bins: the
     * mean over the stretch each bin stands for.
     */
    field(k, net, out) {
      out.fill(0);
      const n = SN[k];
      if (!n) return false;
      const a = SA[k], b = SB[k], c = SC[k];
      const L = net.len[k], w = L / (DYE_BINS - 1), fwd = SD[k] > 0;
      for (let i = 0; i < n; i++) {
        const sa = a[i], sb = b[i], sc = c[i];
        const lo = fwd ? sa : L - sb, hi = fwd ? sb : L - sa;
        const b0 = Math.max(0, Math.floor(lo / w - 0.5)), b1 = Math.min(DYE_BINS - 1, Math.ceil(hi / w + 0.5));
        for (let bin = b0; bin <= b1; bin++) {
          const x0 = Math.max(0, (bin - 0.5) * w), x1 = Math.min(L, (bin + 0.5) * w);
          const ov = Math.min(hi, x1) - Math.max(lo, x0);
          if (ov > 0) out[bin] += sc * ov / (x1 - x0);
        }
      }
      for (let bin = 0; bin < DYE_BINS; bin++) out[bin] = Math.min(1, out[bin]);
      return true;
    },
  };
}
export const HIDDEN_SECONDS = HIDDEN_S;

// ── An active variceal bleed on the figure (veins-gl.js draws it) ──
// A steady stream: a thread of blood leaves the tear, curves out and drops straight down through the stomach to the pool,
// thinning as it goes (a slow bleed breaks into drops lower down). It flows (the shader slides it down on the blood's clock)
// but never pulses: no beat-timed jets, welling or thrown drops at the tear (owner, 6 Nov 2026: "the stream of blood but no
// pulse; get rid of the pulsating red circle and splatters"). The pool is the stomach's own lumen filled from the bottom, a
// flat surface at the level that share of its area makes (stomach-lumen.js), rippling where the thread lands. The figure is
// the upright plate (ascites pools at the pelvis the same way), so blood settles in the lowest part of the stomach.
// Each shape: [x0, y0, x1, y1, r0, r1, alpha, kind]: the pool (kind 0): x0 its surface's height, y0 its ripple, x1 where
// the thread lands, y1 the thread's strength (0..1), r0 its inset from the wall; the thread (kind 2): from (x0, y0) to
// (x1, y1) the pool's surface, r0 its radius, r1 how far it breaks into drops (0..1).
// A bleed's pool and stream come and go over BLEED_FADE seconds (never in one frame): the share shown steps toward 1 while
// the bleed runs and toward 0 once it stops (Reduce Motion: at once), and every shape's alpha is scaled by its eased value.
export const BLEED_FADE = 0.5;
export const stepBleedFade = (a, on, dt, instant = false) => (instant ? (on ? 1 : 0) : on ? Math.min(1, a + dt / BLEED_FADE) : Math.max(0, a - dt / BLEED_FADE));
export const fadeBleedShapes = (shapes, a) => {
  if (a >= 1) return shapes;
  const k = a <= 0 ? 0 : a * a * (3 - 2 * a);
  return k ? shapes.map((sh) => { const o = sh.slice(); o[6] *= k; return o; }) : [];
};
const NO_SHAPES = [];   // (fadeBleedShapesInto's answer for a bleed faded out: empty, never written)
/**
 * fadeBleedShapes with nothing made: the faded shapes are written into `out` (rows as bleedShapes makes them, at least as many as
 * `shapes`; makeBleedRows), which it returns; a full share returns `shapes` itself, and none returns an empty list.
 */
export const fadeBleedShapesInto = (out, shapes, a) => {
  if (a >= 1) return shapes;
  const k = a <= 0 ? 0 : a * a * (3 - 2 * a);
  if (!k) return NO_SHAPES;
  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i], o = out[i];
    for (let j = 0; j < sh.length; j++) o[j] = sh[j];
    o[6] *= k;
  }
  return out;
};

const frac = (x) => ((x % 1) + 1) % 1;
// The heartbeat's surge at time t: a sharp systolic peak over a quieter flow between beats, periodic and smooth.
export const bleedPulse = (t, hr = 80) => 0.25 + 0.75 * Math.max(0, Math.cos(2 * Math.PI * (frac((t * Math.min(160, Math.max(45, hr || 80))) / 60) - 0.12))) ** 4;
// How full the pool is (0..1) for the blood lost so far: a puddle at once, full by 1.5 L (the scope's pool uses it as well).
export const poolFill = (total) => Math.min(1, Math.max(0.12, Math.sqrt(Math.max(0, total || 0) / 1500)));
// The share of the stomach's lumen the figure's pool fills at most (the rest is gas and the fundus above the level).
export const POOL_SHARE = 0.8;
/** The pool's surface (world y, down the page) for the blood lost so far. */
export const poolSurface = (total) => lumenSurface(POOL_SHARE * poolFill(total));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

/** How many shapes bleedShapes makes: the pool and the thread. */
export const BLEED_ROWS = 2;
/** BLEED_ROWS rows of eight numbers to give bleedShapesInto (and fadeBleedShapesInto) to write over: made once, where the figure is set up. */
export function makeBleedRows() {
  const rows = [];
  for (let i = 0; i < BLEED_ROWS; i++) rows.push([0, 0, 0, 0, 0, 0, 0, 0]);
  return rows;
}
const setRow = (o, x0, y0, x1, y1, r0, r1, al, kind) => { o[0] = x0; o[1] = y0; o[2] = x1; o[3] = y1; o[4] = r0; o[5] = r1; o[6] = al; o[7] = kind; };

/** bleedShapes written into `out` (BLEED_ROWS rows, makeBleedRows), which it returns: the same numbers, nothing made. */
export function bleedShapesInto(out, bleed, rate, sites) {
  const gv = bleed.site === 'GV';
  const tx = gv ? sites.fundus[0] : sites.varix[0] + 8, ty = gv ? sites.fundus[1] - 4 : sites.varix[1] + 12;
  const k = clamp((rate || 50) / 90, 0.7, 1.8);
  const spurt = smooth(25, 70, rate || 50);   // 0 an ooze, 1 a fast bleed
  // The pool, and the thread that falls into it: it leaves the tear toward the lumen and lands a little way in.
  const surf = poolSurface(bleed.total), [lo, hi] = lumenAt(surf);
  const land = clamp(gv ? tx + 3 : tx + 62, lo + 14, hi - 14), flow = 0.35 + 0.65 * spurt;
  setRow(out[0], surf, 0.5, land, flow, 4, 0, 0.92, 0);
  // The thread: one steady width and strength, with no beat-timed swell.
  setRow(out[1], tx, ty + 1, land, surf, 2.9 * Math.sqrt(k) * 0.975, 1 - 0.5 * spurt, 0.95 * 0.9, 2);
  return out;
}
/** bleedShapesInto, into new rows (for a caller that keeps what it gets). */
export function bleedShapes(bleed, rate, sites) {
  return bleedShapesInto(makeBleedRows(), bleed, rate, sites);
}

// ── Parcels carried through junctions (combined plan, B1 and C1) ──
// Each stream's distance D is its own, so on its own each vessel's streaks are a pattern unrelated to the next vessel's, and
// at every junction the two would ghost over each other. Instead a vessel whose blood comes on from another one (its parent:
// the largest inflow at the node where the vessel's blood enters it) draws its parent's pattern, carried on at its own speed:
// the shader reads, for a pixel at arc s, the pattern of the root stream at s_e = A + B s. B is the root's display speed over
// the vessel's own (signed), so a parcel crosses into the vessel and runs on at the vessel's speed; A anchors the junction, so
// the vessel's junction end shows exactly what the parent shows at its own junction end, whatever B is. A chain of such
// vessels composes (A and B are taken through the parent's own), down to a root that draws its own D.
// Volume is unchanged (the occupancy each vessel draws is its own flux); only the pattern is shared.
// A link forms, ends, or moves to another parent by easing its weight w: down to zero, then switched, then up again; so a
// pattern never jumps. While a link is changing, the shader draws both patterns, mixed by w.

/** Ends this close (world units) count as one junction; speed ratios beyond these do not chain. */
export const CHAIN_NEAR = 20, CHAIN_RATIO = 2, CHAIN_B_MAX = 3;

// Items grouped by node, kept from call to call (2 Nov 2026, scripts/frame-alloc.mjs: a Map and an array for each node, made every frame;
// then an object and an array for each node, kept; now a linked list through the items, nothing made). A group is built under a stamp: a
// node's head and tail are only read if it carries the stamp of the group being read, so an older group reads as empty.
const GROUP_AT = new Map(), G_HEAD = [], G_TAIL = [], G_STAMP = [], G_NEXT = [];
let groupN = 0, groupStamp = 0;
function groupStart(items) {
  groupStamp++;
  if (GROUP_AT.size > 4096) { GROUP_AT.clear(); groupN = 0; }
  for (let i = G_NEXT.length; i < items; i++) G_NEXT[i] = -1;   // (no holes: items join in an order of their own)
}
/** Item i joins the list of `node`, after the items already there (so lists run in item order). */
function groupAdd(node, i) {
  let g = GROUP_AT.get(node);
  if (g === undefined) { g = groupN++; GROUP_AT.set(node, g); G_STAMP[g] = 0; }
  G_NEXT[i] = -1;
  if (G_STAMP[g] !== groupStamp) { G_STAMP[g] = groupStamp; G_HEAD[g] = i; } else G_NEXT[G_TAIL[g]] = i;
  G_TAIL[g] = i;
}
/** The first item of `node`'s list in the group being read (follow it with G_NEXT[i]; -1: the end), -1 when it has none. */
function groupHead(node) {
  const g = GROUP_AT.get(node);
  return g !== undefined && G_STAMP[g] === groupStamp ? G_HEAD[g] : -1;
}

/**
 * The parent of each candidate: the candidate with the largest |flow| whose blood leaves at the node where this one's enters,
 * with their drawn ends within CHAIN_NEAR. items[i]: { up, down (node ids, by the shown flow), upPt, downPt ([x, y]), q (|flow|),
 * m (the model's mean display speed along the vessel's arc, signed; 0: it cannot chain) }. Written into `out` (an Int32Array or
 * array of at least items.length; −1: none), which it returns. Allocates nothing.
 */
export function chainParentsInto(items, out) {
  groupStart(items.length);
  for (let i = 0; i < items.length; i++) if (items[i].m) groupAdd(items[i].down, i);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    out[i] = -1;
    if (!it.m) continue;
    let best = -1;
    for (let j = groupHead(it.up); j >= 0; j = G_NEXT[j]) {
      if (j === i) continue;
      const p = items[j];
      if (Math.hypot(p.downPt[0] - it.upPt[0], p.downPt[1] - it.upPt[1]) >= CHAIN_NEAR) continue;
      if (best < 0 || p.q > items[best].q) best = j;
    }
    out[i] = best;
  }
  return out;
}
/** chainParentsInto, into `out` or a new Int32Array. */
export function chainParents(items, out = new Int32Array(items.length)) {
  return chainParentsInto(items, out);
}

/**
 * The links between streams, kept from frame to frame by each candidate's `key` (its row). step(items, kW, kB): items as for
 * chainParents, plus s0 (the arc of the vessel's junction end: 0 or its length) and sj (the arc of its downstream end, where a
 * child of it would join). kW, kB: this frame's easing shares (1: at once, reduced motion). After a step, for item i:
 * par[i], root[i] (keys, −1: none), A[i], B[i], w[i]; ef[i], et[i]: the weight of a link at the vessel's from and to end (a
 * chained end: its arrowheads run through it), or minus the weight of the link that makes it the minor inflow at that end.
 * `easing`: whether a weight or a B is still on its way (the figure is kept awake).
 */
export function createStreamChain() {
  // Each key's state lives in slot `SK.get(key)` of these lists (one list a field), written in place; a slot freed when its key goes is
  // used again by the next key. (Fields: p parent key, r root key, w weight, B, A, sj, s0, pA, pB, fresh, stable.)
  const SK = new Map(), sKey = [], sLive = [], sP = [], sR = [], sW = [], sB = [], sA = [], sSj = [], sS0 = [], sPA = [], sPB = [], sFresh = [], sStable = [], free = [];
  let slots = 0;
  const close = (v, to, k, tol) => (Math.abs(to - v) <= tol ? to : v + (to - v) * k);
  const api = { par: [], root: [], A: [], B: [], w: [], ef: [], et: [], easing: false };
  // (Kept from call to call so a step makes no Map, Set, array or closure: the parent of each item and whether it is done (2: being
  // visited), the index of each key, the stamp that marks a key for this call, and the call's items and easing shares.)
  const parIx = [], done = [];
  const atM = new Map(), mark = new Map();
  let stamp = 0, cur = null, kW = 1, kB = 1;
  const atGet = (key) => { const i = atM.get(key); return i != null && i < cur.length && cur[i].key === key ? i : null; };
  const slotOf = (key) => {
    let s = SK.get(key);
    if (s === undefined) {
      s = free.length ? free.pop() : slots++;
      SK.set(key, s);
      sKey[s] = key; sLive[s] = 1; sP[s] = -1; sR[s] = -1; sW[s] = 0; sB[s] = 1; sA[s] = 0; sSj[s] = 0; sS0[s] = 0; sPA[s] = 0; sPB[s] = 1; sFresh[s] = true; sStable[s] = false;
    }
    return s;
  };
  const put = (i, arc, v) => {
    const k = arc === 0 ? 'ef' : 'et', o = api[k][i];
    if (v > 0) api[k][i] = Math.max(o > 0 ? o : 0, v); else if (!(o > 0)) api[k][i] = Math.min(o, v);
  };
  const go = (i) => {
    if (done[i]) return;
    done[i] = 2;   // (visiting: a parent met again on the way is a loop, and counts as none)
    const items = cur, it = items[i], s = slotOf(it.key);
    let p = parIx[i];
    if (p >= 0 && done[p] === 2) p = -1;
    if (p >= 0) go(p);
    // What this vessel should be drawn through: its parent's own pattern, or (once the parent's link is steady) the parent's root.
    let want = -1, wantR = -1, Bw = 1, peA = 0, peB = 1;
    if (p >= 0) {
      const pi = items[p], ps = slotOf(pi.key), ratio = Math.abs(pi.m / it.m);
      const thru = sR[ps] >= 0 && sW[ps] === 1 && sStable[ps];
      peA = thru ? sA[ps] : 0; peB = thru ? sB[ps] : 1;
      Bw = (peB * pi.m) / it.m;
      if (ratio <= CHAIN_RATIO && ratio >= 1 / CHAIN_RATIO && Math.abs(Bw) <= CHAIN_B_MAX && Math.abs(Bw) >= 1 / CHAIN_B_MAX) {
        want = pi.key; wantR = thru ? sR[ps] : pi.key;
      }
    }
    const same = want === sP[s] && wantR === sR[s];
    if (sFresh[s]) {
      sFresh[s] = false; sP[s] = want; sR[s] = wantR; sB[s] = Bw; sW[s] = want >= 0 ? 1 : 0;
    } else if (same && want >= 0) {
      const w = close(sW[s], 1, kW, 0.002), B = close(sB[s], Bw, kB, 1e-4);
      if (w !== sW[s] || B !== sB[s]) api.easing = true;
      sW[s] = w; sB[s] = B;
    } else if (!same) {
      if (sW[s] > 0) { sW[s] = close(sW[s], 0, kW, 0.002); api.easing = true; }
      if (sW[s] === 0 && mark.get(it.key) !== stamp) { sP[s] = want; sR[s] = wantR; sB[s] = Bw; if (want >= 0) api.easing = true; }
    }
    sStable[s] = sP[s] >= 0 && want === sP[s] && wantR === sR[s];
    // The junction, through the current link's parent (as it was when last drawn, if it is no longer a candidate).
    if (sP[s] >= 0) {
      const q = atGet(sP[s]);
      if (q != null && sP[s] === want) { sSj[s] = items[q].sj; sPA[s] = peA; sPB[s] = peB; }
      else if (q != null) { const qs = slotOf(sP[s]); const thru = sR[s] !== sP[s]; sSj[s] = items[q].sj; sPA[s] = thru ? sA[qs] : 0; sPB[s] = thru ? sB[qs] : 1; }
      sS0[s] = it.s0;
      sA[s] = sPA[s] + sPB[s] * sSj[s] - sB[s] * sS0[s];
    } else { sA[s] = 0; sB[s] = 1; }
    done[i] = 1;
    api.par[i] = sW[s] > 0 ? sP[s] : -1; api.root[i] = sW[s] > 0 ? sR[s] : -1;
    api.A[i] = sA[s]; api.B[i] = sB[s]; api.w[i] = sW[s];
  };

  api.step = (items, shareW = 1, shareB = 1) => {
    const n = items.length;
    chainParentsInto(items, parIx);
    for (let i = 0; i < n; i++) done[i] = 0;
    api.par.length = api.root.length = api.A.length = api.B.length = api.w.length = api.ef.length = api.et.length = n;
    api.easing = false;
    // (The index of each key, a Map kept from call to call: written over for this call's keys, and an entry left by a key no longer drawn
    // is told by its index not being this call's key's. No Map, Set, array or closure is made a call.)
    stamp++;
    if (atM.size > 4 * n + 64) atM.clear();
    for (let i = 0; i < n; i++) atM.set(items[i].key, i);
    const at = atGet;
    // (A vessel some child is still drawn through, by a root other than this vessel, keeps its link until that child has let go.)
    for (let q = 0; q < slots; q++) if (sLive[q] && sW[q] > 0 && sR[q] !== sP[q]) mark.set(sP[q], stamp);
    cur = items; kW = shareW; kB = shareB;
    for (let i = 0; i < n; i++) go(i);
    // The ends: a chained vessel's junction end and its parent's end there carry the link's weight; any other inflow at that
    // node is the minor one, carrying minus that weight.
    for (let i = 0; i < n; i++) { api.ef[i] = 0; api.et[i] = 0; }
    groupStart(n);
    for (let j = 0; j < n; j++) if (items[j].m) groupAdd(items[j].down, j);
    for (let i = 0; i < n; i++) {
      const w = api.w[i];
      if (!(w > 0)) continue;
      put(i, items[i].s0, w);
      const p = at(api.par[i]);
      if (p == null) continue;
      put(p, items[p].sj, w);
      for (let j = groupHead(items[i].up); j >= 0; j = G_NEXT[j]) if (j !== p && j !== i) put(j, items[j].sj, -w);
    }
    // (The state of a vessel no longer drawn, that nothing is drawn through, goes: drawn again, it starts afresh.)
    stamp++;
    for (let q = 0; q < slots; q++) if (sLive[q] && sW[q] > 0) { mark.set(sP[q], stamp); mark.set(sR[q], stamp); }
    for (let q = 0; q < slots; q++) {
      if (!sLive[q]) continue;
      const key = sKey[q];
      if (at(key) == null && mark.get(key) !== stamp) { SK.delete(key); sLive[q] = 0; free.push(q); }
    }
    cur = null;
    return api;
  };
  return api;
}
