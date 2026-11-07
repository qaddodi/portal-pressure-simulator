// The esophageal balloon of the tamponade tube, as an IR-style catheter balloon (pure, no DOM). The tube (its path and its
// gastric balloon, the first step: balloon-gas.js) runs down the esophagus; this long balloon lies on it, collapsed to a sheath
// until it is filled, the second step. It has tapered shoulders and two marker bands, follows the esophagus's own centreline
// and walls, so it bends with the tube, and stops just inside them.

// The esophagus's two walls as drawn in anatomy.js (ORGANS 'esophagus'): cubic Béziers, top to bottom.
const LEFT = [[776, 0], [781, 90], [787, 190], [792, 251]];
const RIGHT = [[798, 0], [800, 90], [805, 190], [813, 251]];
const bez = (P, u) => {
  const m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
};
/** The wall's x at height y (inverts the curve by bisection; y runs 0 … 251). */
function xAt(P, y) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (bez(P, mid)[1] < y) lo = mid; else hi = mid; }
  return bez(P, (lo + hi) / 2)[0];
}
/** The lumen at height y: { c: centre x, h: half width }. */
export function esoAt(y) {
  const yy = Math.min(251, Math.max(0, y)), l = xAt(LEFT, yy), r = xAt(RIGHT, yy);
  return { c: (l + r) / 2, h: (r - l) / 2 };
}

// The tube's own line through the esophagus (x at height y), set by balloon-gas.js once it has laid the tube: the tube starts its bend at
// the cardia a little above this balloon's lower end, so there it runs off the esophagus's middle. The balloon lies on the tube when it
// is collapsed and centres in the lumen as it fills. Until it is set, the tube is the esophagus's middle.
let tubeLine = null;
export function setTubeLine(fn) { tubeLine = fn; }
const tubeX = (y) => (tubeLine ? tubeLine(y) : esoAt(y).c);

export const BALLOON = { top: 170, bottom: 244, shaftR: 0.8, sleeve: 1.6, wall: 2.2, from: -40 };
/** How long the tube takes to go in (adv: it slides down to the stomach), its gastric balloon to fill and be drawn up against the cardia
 *  (inflate), and then the esophageal balloon to fill on top of it (eso), in ms, on screen (stage.js balloonStep).
 *  The engine presses a bleed shut after the first two (engine.js BALLOON_SEAL_S): the gastric balloon is the first step and holds on its own. */
export const BALLOON_MS = { adv: 900, inflate: 1500, eso: 1200 };

/** A smooth path through points (Catmull-Rom as cubic Béziers), so the outline has no facets at any zoom. */
export function smoothPath(P, closed = false) {
  const n = P.length, f = (v) => v.toFixed(2);
  if (n < 2) return '';
  const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + ' Z' : d;
}

/**
 * The balloon's geometry at inflation k (0 collapsed on the tube … 1 up): the outline as a closed ring of points, the two marker
 * bands on the tube (y) and half(y), the balloon's half width.
 * Shaped as the HVPG wedge balloon is (hvpg-balloon.js balloonOutline): a superellipse along its length that turns from
 * an ellipse (deflated) into a pillow with rounded ends (up), filling the esophagus to just inside its walls. Collapsed, it is a
 * sheath a little wider than the tube (BALLOON.sleeve).
 */
export function balloonShape(k, n = 64) {
  const { top, bottom, shaftR, sleeve, wall } = BALLOON;
  const mid = (top + bottom) / 2, rx = (bottom - top) / 2;
  const p = 2 + 2 * k, h0 = sleeve;
  const half = (y) => {
    const s = Math.abs(y - mid) / rx;
    if (s >= 1) return shaftR;
    const full = Math.max(h0, esoAt(y).h - wall), prof = (1 - s ** p) ** (1 / p);
    return Math.max(shaftR, (h0 + (full - h0) * k) * prof);
  };
  // Denser toward the ends, where the outline turns.
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(mid - rx * Math.cos((Math.PI * i) / n));
  const cx = (y) => { const c = esoAt(y).c; return c + (tubeX(y) - c) * (1 - k); };
  const L = ys.map((y) => [cx(y) - half(y), y]), R = ys.map((y) => [cx(y) + half(y), y]).reverse();
  return { outline: [...L, ...R], bands: [top + 3, bottom - 3], half };
}
