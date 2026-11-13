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

// ── A vessel that reverses between the views (13 Nov 2026) ──
// Lerped point by point, a vessel whose course runs the other way in the circuit (the portal chain from the spleen to the liver, the left
// renal vein, the hepatic artery: its chord turns more than 120 degrees) crosses itself on the way: its points pass each other, it folds into
// a loop or a knot at the portal confluence. The trim that drew such a vessel out toward its downstream end and in from its upstream end
// (v3.4) cut it off the vessels it joins: in a chain of them every vessel stood alone, detached capsules with cut ends beside the portal vein
// (Mohammad, 13 Nov: "do NOT ship bugs like this"). Instead its ends move with their stations as every other point does (so it stays joined to
// its neighbours) and its shape is carried in the frame of its chord: each point's place along the chord and off it, eased from the anatomy's
// to the circuit's on the point's own share of the change. It turns and stretches with its two ends and never folds. At either end of the
// change it is exactly its anatomy or circuit course.
export const FLIP_COS = Math.cos((120 * Math.PI) / 180);
/** A course's points in the frame of its own chord: for each point, its share along the chord and off it (to the chord's left), [u, v, ...].
 *  (alloc-rare: once a course is made) */
export function chordShape(P) {
  const n = P.length, s = new Float64Array(2 * n);
  if (n < 2) return s;
  const x0 = P[0][0], y0 = P[0][1], dx = P[n - 1][0] - x0, dy = P[n - 1][1] - y0, L2 = dx * dx + dy * dy || 1;
  for (let i = 0; i < n; i++) { const px = P[i][0] - x0, py = P[i][1] - y0; s[2 * i] = (px * dx + py * dy) / L2; s[2 * i + 1] = (py * dx - px * dy) / L2; }
  return s;
}
/** Whether the course turns more than 120 degrees between the views, for the circuit's chord (cdx, cdy) as it is laid out now (turned or not). */
export function reverses(A, cdx, cdy) {
  const n = A.length, ax = A[n - 1][0] - A[0][0], ay = A[n - 1][1] - A[0][1], la = Math.hypot(ax, ay), lc = Math.hypot(cdx, cdy);
  return la > 1e-6 && lc > 1e-6 && (ax * cdx + ay * cdy) / (la * lc) < FLIP_COS;
}
/** Point i of a reversing vessel at its share w, between its ends as they stand (x0, y0) and (x1, y1): sA, sC its chordShape in each view. */
export function chordPointInto(out, sA, sC, i, w, x0, y0, x1, y1) {
  const u = sA[2 * i] + (sC[2 * i] - sA[2 * i]) * w, v = sA[2 * i + 1] + (sC[2 * i + 1] - sA[2 * i + 1]) * w, dx = x1 - x0, dy = y1 - y0;
  out[0] = x0 + u * dx - v * dy; out[1] = y0 + u * dy + v * dx;
  return out;
}
