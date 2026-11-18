// The cavernoma's channels (periportal collaterals, edge C8), drawn in the frame of the clotted portal trunk: `u` runs along the trunk's own drawn course from the confluence
// to the hilum (units), `v` is the offset from its centreline, positive to the patient's right (the side away from the hepatic artery). Each channel leaves the trunk's centreline at
// its own place `a` below the clot and rejoins it at its own place `z` above it (so the joins are spread along both stumps, not all at one node), rises to its offset over 17
// units, and winds about it (CAV_CHANNELS, anatomy.js). Mohammad, 17 Nov 2026, the "T3" mock: wrapped on both sides of the vein, wide smooth loops, each joined at its own place.
// In the circuit the channels fold onto the main channel's lane, as every strand does.
import { smooth01 } from './num.js';
import { CAV_GROW } from './anatomy.js';

export const CAV_RAMP = 17;       // (units over which a channel rises to its offset and falls back to the trunk)
export const CAV_MAIN_FROM = 22;  // (where the main channel, the C8 course, leaves the trunk: units from either end; the folded channels follow it)

export const CAV_SMOOTH = 16;   // (the normal is the trunk's direction averaged over this many units either side, so an offset of 30 never folds on the trunk's own meander)

/**
 * The trunk's drawn course as one polyline: `pieces` (each a list of [x, y]) end to end. Returns { P, U, L, NX, NY }: the points, the arc length at each, the total, and at each
 * the unit normal toward the patient's right (n = (ty, -tx), the trunk running confluence → hilum) of the trunk's direction averaged over CAV_SMOOTH either side: the channels
 * stand off the trunk's own point along it, so they follow its small meander at the stumps and never fold where it bends (a channel 30 off a bend of radius 30 would).
 */
export function trunkFrame(pieces) {
  const P = [], U = [];   // alloc-rare: the frame's lists, made when the change between the views moves (stage-frame.js cavFrame)
  let acc = 0;
  for (const piece of pieces) for (const p of piece) {
    const q = P[P.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6) continue;   // (the pieces share their joint)
    if (q) acc += Math.hypot(p[0] - q[0], p[1] - q[1]);
    P.push(p); U.push(acc);
  }
  const n = P.length, NX = new Float64Array(n), NY = new Float64Array(n);   // alloc-rare: as above
  for (let i = 0; i < n; i++) {
    let tx = 0, ty = 0;
    for (let j = 1; j < n; j++) {
      if (U[j] < U[i] - CAV_SMOOTH) continue;
      if (U[j - 1] > U[i] + CAV_SMOOTH) break;
      tx += P[j][0] - P[j - 1][0]; ty += P[j][1] - P[j - 1][1];
    }
    const tl = Math.hypot(tx, ty) || 1;
    NX[i] = ty / tl; NY[i] = -tx / tl;
  }
  return { P, U, L: acc, NX, NY };   // alloc-rare: as above
}

/** The trunk's point at arc length u, with the smoothed normal toward the patient's right, into `o` = [x, y, nx, ny]. */
export function frameAt(F, u, o) {
  const { P, U } = F, n = P.length;
  const uu = Math.min(F.L, Math.max(0, u));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (U[m] < uu) lo = m; else hi = m; }
  const k = (uu - U[lo]) / (U[hi] - U[lo] || 1);
  o[0] = P[lo][0] + (P[hi][0] - P[lo][0]) * k; o[1] = P[lo][1] + (P[hi][1] - P[lo][1]) * k;
  const nx = F.NX[lo] + (F.NX[hi] - F.NX[lo]) * k, ny = F.NY[lo] + (F.NY[hi] - F.NY[lo]) * k, nl = Math.hypot(nx, ny) || 1;
  o[2] = nx / nl; o[3] = ny / nl;
  return o;
}

/** A channel's offset from the trunk's centreline at arc length u (zero outside its stretch): v · plateau + a wave that grows in over the first and last quarter. */
export function cavOffset(c, u, L) {
  const a = c.a, b = L - c.z;
  if (u <= a || u >= b) return 0;
  const rp = c.ramp ?? CAV_RAMP, pl = smooth01((u - a) / rp) * smooth01((b - u) / rp), tau = (u - a) / (b - a), amp = c.amp * smooth01(tau / 0.25) * smooth01((1 - tau) / 0.25);
  return pl * (c.v + amp * Math.sin(2 * Math.PI * c.cyc * tau + c.ph));
}

const TMP = [0, 0, 0, 0];
/**
 * The channel's n samples, equally spaced in u from where it leaves the trunk to where it rejoins it. `fold` (0 anatomy, 1 circuit) takes it onto the main channel's lane
 * (`main`: that channel's n samples as drawn), each sample on the share of the lane it lies at along the trunk. Allocates n pairs: made when the course changes.
 */
export function cavStrand(F, c, n, fold, main) {
  const out = [], a = c.a, b = F.L - c.z, L = F.L, m1 = main ? main.length - 1 : 0, span = Math.max(1, L - 2 * CAV_MAIN_FROM);   // alloc-rare: a channel's samples, made when the course changes (as braid's own list was)
  for (let j = 0; j < n; j++) {
    const u = a + ((b - a) * j) / (n - 1);
    let x = 0, y = 0;
    if (fold < 1) { const f = frameAt(F, u, TMP), v = cavOffset(c, u, L) * (1 - fold); x = f[0] + f[2] * v; y = f[1] + f[3] * v; }
    if (fold > 0 && main) {
      const q = main[Math.round(Math.min(1, Math.max(0, (u - CAV_MAIN_FROM) / span)) * m1)];
      x += (q[0] - x) * fold; y += (q[1] - y) * fold;   // (fold 1: the main channel's own sample)
    }
    out.push([x, y]);   // alloc-rare: a sample's pair, as above
  }
  return out;
}

/** How far a channel is grown at recruitment r (0–1): 0 before it begins at r0, 1 once CAV_GROW of the recruitment has passed, eased between. It scales the channel's caliber, whole and joined at both ends. */
export const cavGrow = (r, r0) => smooth01((r - r0) / CAV_GROW);
