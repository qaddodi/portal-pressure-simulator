// Each vessel's usual velocity, for the figure colored by velocity (colormap.js velocityColor), in cm/s as the Doppler
// reads it (topology.js dopplerK). No DOM here, so the unit tests load it. The vessels the Doppler samples keep its ranges (doppler.js PROBES); with a TIPS or
// DIPS in, the main portal vein's floor is 30 cm/s, the follow-up scan's cut-off, and it has no ceiling: fast flow is what a working stent does. Every other vein is compared with its
// own healthy velocity, normal from two-thirds to one and a half times it, as no published range covers it. Collaterals
// and the other shunts have no normal and stay neutral.
import { EDGES, dopplerK } from '../engine/topology.js?v=4044766e96';
import { FLOW_CUTS } from '../engine/flow-cuts.js?v=1c97536e9e';

export { FLOW_CUTS };

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const DOPPLER_NORMAL = {
  PV_TRUNK: [15, 40], PVH_R: [12, 35], PVH_L: [12, 35], SMV_CONF: [10, 30], SV_CONF: [10, 30], V_SPL: [10, 30],
  RHV_IVC: [10, 40], MHV_IVC: [10, 40], LHV_IVC: [10, 40], IVCS_RA: [10, 50], TIPS: [90, 190], DIPS: [90, 190],
};
// The vessel a station's name means: the velocity layer's callout at that station reads it (stage.js layerRuns), so
// "Portal v." is the portal vein the Doppler samples, not a faster collateral or tributary joining it there.
export const STATION_VESSEL = { CONF: 'PV_TRUNK', SMV: 'SMV_CONF', SV: 'SV_CONF', LPV: 'PVH_L', RPV: 'PVH_R', RHV: 'RHV_IVC', MHV: 'MHV_IVC', LHV: 'LHV_IVC', IVCS: 'IVCS_RA' };
export const STENT_PV_NORMAL = [30, Infinity];
// The lumen the probe sees (cm²): a lumped bundle (the jejunal and ileal veins) is drawn at one vein's width d but its
// flow reaches the probe through a wider trunk vd, as the engine's own velocity reads it (engine.js velocity).
const area = (k, d) => { const e = EDGES[k], D = Math.max(0.5, d * (e?.vd ? e.vd / e.d : 1)) / 10; return (Math.PI * D * D) / 4; };
// The mean velocity across the lumen (cm/s, signed) of vessel k in frame f (Q and D per edge; the smoothed Qf when
// the frame has it). Every velocity on screen (Details, the hover tip, the figure's labels and colours, the Doppler)
// comes from here, so one vessel reads one number everywhere.
export const meanVel = (f, k) => (f.Qf ? f.Qf[k] : f.Q[k]) / area(k, f.D[k]);
// The Doppler's reading (peak, see dopplerK).
export const dopplerVel = (f, k) => meanVel(f, k) * dopplerK(EDGES[k]);

let refOf = null, ref = null;
function healthyVel(healthy, k) {
  if (!healthy?.Q || !healthy?.D) return 0;
  if (refOf !== healthy) { refOf = healthy; ref = EDGES.map((e, i) => Math.abs(dopplerVel(healthy, i))); }
  return ref[k];
}
export function velNormal(k, f, healthy) {
  const e = EDGES[k];
  if (!e) return null;
  if (e.id === 'PV_TRUNK' && f?.D && (f.D[EI.TIPS] > 0 || f.D[EI.DIPS] > 0)) return STENT_PV_NORMAL;
  if (DOPPLER_NORMAL[e.id]) return DOPPLER_NORMAL[e.id];
  if (e.kind !== 'vein' && e.kind !== 'diode') return null;
  const h = healthyVel(healthy, k);
  return h > 1 ? [h / 1.5, h * 1.5] : null;
}
// Where a velocity sits on the colour scale, 0 to 1: the lower third below normal (paler the slower), the middle third
// within it, the top third above it (deepest at twice the top of the range). A range with no ceiling spans the middle
// third from its floor to twice it, and never reaches the top third.
export const velPos = (v, [lo, hi]) => {
  const a = Math.abs(v), span = Number.isFinite(hi) ? hi - lo : lo;
  return a < lo ? 0.32 * (a / lo) : a <= hi ? 0.34 + 0.32 * Math.min(1, (a - lo) / span) : 0.68 + 0.32 * Math.min(1, (a - hi) / hi);
};

// Whether a flow (mL/s, signed) runs backward, past a small dead band: a flow hovering at zero is not "reversed". `ref` is the vessel's healthy flow.
export const flowReversed = (q, ref = 0) => q < -Math.max(FLOW_CUTS.reversedQ, FLOW_CUTS.reversedRel * Math.abs(ref));

// One reading of a vein's flow, for every place that puts it in words (flow-cuts.js lists them). `v` is the signed velocity (cm/s, as the Doppler
// reads it; null when the caller has only a flow); `q` the signed flow (mL/s; null when only the velocity's sign is known, as for a Doppler
// waveform); `normal` the vessel's usual range ([lo, hi], hi may be Infinity) or null. Options: `ref` the vessel's healthy flow (mL/s); `stent`
// reads a stent, which is occluded under 2 cm/s and has no stasis; `swings` is a waveform that crosses zero, which is never stasis.
// The flags are independent, so a caller that cares about direction first (the Details sentence, the screen-reader summary) can say so;
// `word` is the one name when a single word is wanted: none, then stasis, then reversed, then slow, fast or normal.
export function judgeFlow(v, q, normal, { ref = 0, stent = false, swings = false } = {}) {
  const has = Number.isFinite(v), a = has ? Math.abs(v) : 0;
  const none = has && a < (stent ? FLOW_CUTS.stentNone : FLOW_CUTS.none);
  const stasis = has && !stent && !none && !swings && a < FLOW_CUTS.stasis;
  const reversed = q != null ? flowReversed(q, ref) : has && v < 0;
  const still = q != null && Math.abs(q) < FLOW_CUTS.stillQ && Math.abs(ref) > FLOW_CUTS.stillRef;
  const slow = has && !!normal && a < normal[0];
  const fast = has && !!normal && a > normal[1];
  const word = none ? 'none' : stasis ? 'stasis' : reversed ? 'reversed' : slow ? 'slow' : fast ? 'fast' : 'normal';
  return { word, none, stasis, reversed, still, slow, fast };
}
