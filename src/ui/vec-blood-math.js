// The vector renderer's blood material, in JavaScript (workstream D, docs/recommendations/vector-renderer-plan.md section 5.3): the
// arithmetic of src/ui/vec-blood-glsl.js that can be judged without a GPU, written the same way so the unit tests can drive it. Nothing
// here draws and nothing reads a drawn radius: a stream's distance and drift come from the model's velocity alone.
//
// What is mirrored:
//   • the stream's distance and drift on the blood clock (veins-gl.js flowD, flowDrift, rootDD) and the CPU's anchoring of them
//     (stage-blood.js anchorStream), so a speed step, a beat, a re-anchor and a reversal can be run end to end;
//   • where the pattern is read: the stream coordinate of a pixel (blood-tile.js dNoise's two phases), the chained vessel's coordinate
//     (flow texel 4: se = A + B s), the lane across;
//   • the footprint attenuation of the streaks' octaves (the fine one's weight falls to 0 over 0.5 … 1.5 tile texels, the coarse one's
//     over 3 … 6), the shares that remain and the spread that keeps their level;
//   • the weights a junction blends its members' streams with (they follow the flow direction, and swap with a reversal, eased);
//   • the zoom numbers the streaks follow (veins-gl.js ZOOM_VS zoomOut).
import { PERIOD, DRIFT_PERIOD, DRIFT_RATE, SLOT } from './blood.js';
import { D_CYCLE, TILE_W } from './blood-tile.js';

export { PERIOD, DRIFT_PERIOD, DRIFT_RATE, D_CYCLE };

/** GLSL's mod: the remainder with the sign of the divisor. */
export const mod = (a, b) => a - b * Math.floor(a / b);
export const fract = (x) => x - Math.floor(x);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

// ── The stream's distance and drift (veins-gl.js flowD, flowDrift, rootDD) ──
/**
 * One stream's anchor, as stage-blood.js writes it into the flow row: D and vd (texel 0: distance and display speed), the stasis (texel 0
 * w), the drift dr (texel 3 z), and texel 6: B0 the blood clock it was anchored at, k the display speed's factor (0: not anchored, the
 * CPU's own distance and drift stand), slope how fast the speed was changing at the anchor.
 * streamDistance: the distance on the blood clock bT. Reads no radius, no zoom, no camera (plan 5.3, "Physical vs drawn").
 */
export function streamDistance(a, bT) {
  const t = bT - a.B0;
  return a.k === 0 ? a.D : mod(a.D + (a.vd + 0.5 * a.slope * t) * a.k * t, PERIOD);
}
/** The stagnant blood's drift (in shimmer cells) on the clock bT. */
export function streamDrift(a, bT) {
  return a.k === 0 ? a.dr : mod(a.dr + a.stasis * DRIFT_RATE * (bT - a.B0), DRIFT_PERIOD);
}

const ACC_MAX = 200, VD_HAIR = 0.01, VD_REL = 0.004, STASIS_HAIR = 0.002;
/**
 * The CPU's side, a copy of stage-blood.js anchorStream (same arithmetic): `sm` the stream (blood.js advanceStream's, with aB, aD, aV,
 * aT, aS, aA, aR, vp kept), `so` { speed, bt, dt }. It keeps the stream's own distance equal to where the GPU has it, and writes a new
 * anchor only when the speed or the stasis moved past a hair. The tests run it with blood.js advanceStream.
 */
export function anchorStream(sm, so, reset) {
  const sp = so.speed, t = so.bt;
  if (!reset && t >= sm.aB) {
    const dt = t - sm.aB;
    sm.D = (((sm.aD + (sm.aV + 0.5 * sm.aA * dt) * sm.aS * dt) % PERIOD) + PERIOD) % PERIOD;
    sm.drift = (sm.aR + sm.aT * DRIFT_RATE * dt) % DRIFT_PERIOD;
    if (sp === sm.aS && Math.abs(sm.vd - (sm.aV + sm.aA * dt)) <= VD_HAIR + VD_REL * Math.abs(sm.aV) && Math.abs(sm.stasis - sm.aT) <= STASIS_HAIR) { sm.vp = sm.vd; return; }
  }
  const a = so.dt > 0 && sm.aB === sm.aB ? (sm.vd - sm.vp) / so.dt : 0;
  sm.aA = a > ACC_MAX ? ACC_MAX : a < -ACC_MAX ? -ACC_MAX : a;
  sm.vp = sm.vd;
  sm.aB = t; sm.aD = sm.D; sm.aV = sm.vd; sm.aT = sm.stasis; sm.aS = sp; sm.aR = sm.drift || 0;
}
/** The anchor the GPU reads (flow texels 0, 3 and 6) from a stream that anchorStream has kept. */
export function anchorOf(sm) {
  return { D: sm.aD, vd: sm.aV, stasis: sm.aT, dr: sm.aR, B0: sm.aB, k: sm.aS, slope: sm.aA };
}
/** The signed shortest difference b − a on the PERIOD circle (the stream's distance wraps). */
export const circDiff = (a, b, period = PERIOD) => { const d = mod(b - a + period / 2, period) - period / 2; return d; };

// ── Where the pattern is read (blood-tile.js dNoise) ──
/**
 * The two phases of the flow-map and where each reads the tile along: u_k = (s − g f_k D_CYCLE) / cell + drift, the weights w_k
 * (triangle, w0 + w1 = 1). s: the arc along the stream's pattern; D: the stream distance now; ay: |y| across (0 … 1); cell: world
 * units a cell spans. The phases are half a cycle apart, so each read is hidden as it resets.
 */
export function patternPhases(s, D, ay, cell, drift, out = {}) {
  const g = Math.max(2, 16 * (1 - 0.64 * ay * ay)) * 0.125;
  const f0 = fract(D / D_CYCLE), f1 = fract(f0 + 0.5);
  out.u0 = (s - g * f0 * D_CYCLE) / cell + drift;
  out.u1 = (s - g * f1 * D_CYCLE) / cell + drift;
  out.w0 = 1 - Math.abs(1 - 2 * f0);
  out.w1 = 1 - Math.abs(1 - 2 * f1);
  return out;
}
/** A chained vessel reads its root's pattern: the root's arc at this vessel's s (flow texel 4: A, B). */
export const chainArc = (A, B, s) => A + B * s;
/** The lane coordinate across the vessel in lattice rows (the tile's v), as bloodAt has it, plus the stagnant blood's swirl. */
export function laneCoord(y, R, Lg, px, stasis, drift, s, id) {
  const lc = clamp((1.7 * R) / Lg, 1, 7);
  let qy = (y * R) / Math.max((0.55 * 1.6 * R) / lc, 3.2 * px);
  const sw = 6.2831853 * 1.2 * drift;
  qy += stasis * 0.6 * (Math.sin(sw) * Math.sin(s * 0.021 + id * 1.7) + Math.cos(sw) * Math.sin(s * 0.034 + id * 0.9 + 2));
  return qy;
}

// ── The zoom numbers (veins-gl.js ZOOM_VS) ──
/** The lane spacing, the two parcel scales and the cross-fade between them, the octaves' fades, the scale between: for pxW. */
export function zoomNumbers(pxW, out = {}) {
  const Lg = Math.max(2.6, 5 * pxW);
  const lx = clamp(Math.log2(Math.max(pxW, 1e-4) * 8 / SLOT), -1, 3);
  const li = smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx);
  const lb = Math.min(Math.floor(li), 1), lf = li - lb;
  const sA = SLOT * 2 ** lb, sB = SLOT * 2 ** (lb + 1);
  const cellA = 5.12 * sA, cellB = 5.12 * sB;
  out.Lg = Lg; out.sA = sA; out.sB = sB; out.lf = lf;
  out.fadeA = smoothstep(1.2 * pxW, 2 * pxW, cellA * 0.5);
  out.fadeB = smoothstep(1.2 * pxW, 2 * pxW, cellB * 0.5);
  out.sx = mix(sA, sB, lf);
  out.cellA = cellA; out.cellB = cellB;
  return out;
}

// ── Filtering at every zoom (brief section 6) ──
/** The tile's texels along one cell of the coarse octave's lattice is 10.24, of the fine one 5.12; the tile is TILE_W texels wide. */
export { TILE_W };
/**
 * The footprint of one device pixel along the streaks, in tile texels: the pixel's world size over the cell, 50 cells to the tile's U.
 * (The footprint across is the mips' business, as before: the lane spacing already keeps it near a lattice row.)
 */
export const footprintTexels = (px, cell) => (px / (50 * cell)) * TILE_W;
/** The fine octave's weight: 1 up to half a texel, 0 from one and a half, a smoothstep between (no step). */
export const FINE_LO = 0.5, FINE_HI = 1.5;
export const fineWeight = (fp) => 1 - smoothstep(FINE_LO, FINE_HI, fp);
/** The coarse octave's weight: the streaks go to the lumen's mean beyond it. */
export const COARSE_LO = 3, COARSE_HI = 6;
export const coarseWeight = (fp) => 1 - smoothstep(COARSE_LO, COARSE_HI, fp);
/** The two octaves' shares of the streaks' noise (0.62 coarse, 0.38 fine) and the spread that evens them (blood look D, lenOn). */
export const SHARE_B = 0.62, SHARE_F = 0.38, SPREAD_K = 0.5288;
/** After the footprint's attenuation: the shares (still summing to 1) and lnS, the factor that keeps the spread level. */
export function attenuatedShares(shareB, shareF, fp, out = {}) {
  const fb = shareB, ff = shareF * fineWeight(fp), t = fb + ff;
  out.wb = fb / t; out.wf = ff / t;
  out.spread = Math.sqrt(SPREAD_K / (out.wb * out.wb + out.wf * out.wf));
  out.mean = coarseWeight(fp);   // (the noise goes toward 0.5 by 1 − this)
  return out;
}
/** The octaves' mixed noise from their two reads a and b (each 0 … 1) at footprint fp: as vbNoiseD. */
export function attenuatedNoise(a, b, shareB, shareF, fp) {
  const q = attenuatedShares(shareB, shareF, fp);
  let n = q.wb * a + q.wf * b;
  n = q.spread === 1 ? n : 0.5 + (n - 0.5) * q.spread;
  return 0.5 + (n - 0.5) * q.mean;
}

// ── A junction's blend (vecBloodMix) ──
/** How far a member's flow runs toward the end its pixel is nearest to (an inflow to the junction), eased through zero. */
/** (Over ±INFLOW_RANGE display units: a reversal ramps the speed through that in about a fifth of a second, so the swap is seen to ease.) */
export const INFLOW_RANGE = 8;
export const inflowOf = (vdToEnd) => smoothstep(-INFLOW_RANGE, INFLOW_RANGE, vdToEnd);
export const FLOOR_W = 0.15;
/**
 * The weights a junction blends its members' streams with. share[i]: the member's geometric share at the pixel (the region shader's);
 * vd[i]: its display speed (flow texel 0 y, signed along its arc); nearEnd[i]: 1 when the pixel is nearer the member's far end (arc
 * length past half), else 0. A member whose blood runs toward the junction supplies it (weight × 1); one running away keeps FLOOR_W.
 * Returns weights summing to 1. A reversal turns vd through zero, so the weights swap smoothly with it.
 */
export function mixWeights(share, vd, nearEnd, out = []) {
  let tot = 0;
  for (let i = 0; i < share.length; i++) {
    const toEnd = nearEnd[i] ? vd[i] : -vd[i];
    out[i] = Math.max(share[i], 0) * (FLOOR_W + (1 - FLOOR_W) * inflowOf(toEnd));
    tot += out[i];
  }
  if (!(tot > 0)) { for (let i = 0; i < share.length; i++) out[i] = 1 / share.length; return out; }
  for (let i = 0; i < share.length; i++) out[i] /= tot;
  return out;
}

// ── The lanes (veins-gl.js LANE_K) ──
export const LANE_K = Array.from({ length: 7 }, (_, j) => {
  const n = j + 1;
  let k = 0;
  for (let i = 0; i < n; i++) { const yl = n === 1 ? 0 : (((i + 0.5) / n) * 2 - 1) * 0.8; k += n === 1 ? 1 : Math.max(2, Math.floor(16 * (1 - yl * yl) + 0.5)) / 8; }
  return k;
});
