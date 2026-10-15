// Each vessel's usual velocity, for the figure colored by velocity (colormap.js velocityColor), in cm/s as the Doppler
// reads it (topology.js dopplerK). No DOM here, so the unit tests load it. The vessels the Doppler samples keep its ranges (doppler.js PROBES); with a TIPS or
// DIPS in, the main portal vein's floor is 30 cm/s, the follow-up scan's cut-off. Every other vein is compared with its
// own healthy velocity, normal from two-thirds to one and a half times it, as no published range covers it. Collaterals
// and the other shunts have no normal and stay neutral.
import { EDGES, dopplerK } from '../engine/topology.js?v=4044766e96';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const DOPPLER_NORMAL = {
  PV_TRUNK: [15, 40], PVH_R: [12, 35], PVH_L: [12, 35], SMV_CONF: [10, 30], SV_CONF: [10, 30], V_SPL: [10, 30],
  RHV_IVC: [10, 40], MHV_IVC: [10, 40], LHV_IVC: [10, 40], IVCS_RA: [10, 50], TIPS: [90, 190], DIPS: [90, 190],
};
export const STENT_PV_NORMAL = [30, 40];
const area = (d) => { const D = Math.max(0.5, d) / 10; return (Math.PI * D * D) / 4; };
// The Doppler's reading of vessel k in frame f (Q and D per edge; the smoothed Qf when the frame has it).
export const dopplerVel = (f, k) => ((f.Qf ? f.Qf[k] : f.Q[k]) / area(f.D[k])) * dopplerK(EDGES[k]);

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
// within it, the top third above it (deepest at twice the top of the range).
export const velPos = (v, [lo, hi]) => {
  const a = Math.abs(v);
  return a < lo ? 0.32 * (a / lo) : a <= hi ? 0.34 + 0.32 * ((a - lo) / (hi - lo)) : 0.68 + 0.32 * Math.min(1, (a - hi) / hi);
};
