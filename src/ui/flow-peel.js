// The flow peel: the change between Anatomy and Circuit runs in the direction blood flows (M5 of the morph mocks; Mohammad, 6 Nov 2026:
// "I love M5 let's go for it"). Each point of the figure moves on its own share of the change, which starts later the further downstream
// it sits: the gut and the spleen leave first, then the portal vein, the liver, the hepatic veins and the heart. Every point still moves
// on the straight line from its anatomy place to its circuit place (only its timing changes), so the morph pieces' binning, the
// MORPH_SLACK fit and the labels' anchors hold as they did with the plain lerp. A point's rank comes from its circuit column (the circuit
// lays the system out in flow order, splanchnic beds on the left to the heart on the right), read once from the wide circuit's x.
import { VB_CIRC } from './anatomy.js';

// How much of the change the wave spreads over: the heart starts when 0.4 of the change has gone. (The mock's value.)
export const PEEL_DL = 0.4;
const X0 = VB_CIRC[0] + 30, X1 = VB_CIRC[0] + VB_CIRC[2] - 30;   // (the splanchnic beds' left edge, 60, to the heart's right, 1360: CIRCUIT_ZONES)
// A point's place in the flow, 0 (gut, spleen) to 1 (heart), from its x in the wide circuit.
export function peelRank(cx) {
  const r = (cx - X0) / (X1 - X0);
  return r < 0 ? 0 : r > 1 ? 1 : r;
}
// A point's share of the change at t (the change's eased share, 0 the anatomy, 1 the circuit), for rank r. Exactly 0 and 1 at the ends,
// so a landed view is the plain picture.
export function peelAt(t, r) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = (t - PEEL_DL * r) / (1 - PEEL_DL);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}
// The soft brightening on the moving front, 0 to 1: a bell on the share, 0 where the point rests at either end.
export function peelGlow(t, r) {
  if (t <= 0 || t >= 1) return 0;
  const x = (t - PEEL_DL * r) / (1 - PEEL_DL);
  if (x <= 0 || x >= 1) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s;
}
// The ranks of a circuit course (wide, unturned: [[x, y], ...]), one a point, in a Float32Array (alloc-rare: once a course is made).
export function peelRanks(C) {
  const r = new Float32Array(C.length);
  for (let i = 0; i < C.length; i++) r[i] = peelRank(C[i][0]);
  return r;
}
// How bright the front gets at most, as a share of the hover's lift (veins-gl: lum toward lum · 1.18 + 0.04).
export const PEEL_GLOW = 0.8;
