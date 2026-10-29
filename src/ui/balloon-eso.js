// The esophageal tamponade balloon as an IR-style catheter balloon (pure, no DOM). A thin shaft comes down the
// esophagus and a translucent balloon with tapered shoulders and two marker bands inflates on it; the balloon follows
// the esophagus's own centreline and walls, so it bends with the tube and stops just inside them.

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

export const BALLOON = { top: 168, bottom: 246, shoulder: 12, shaftR: 1.3, wall: 2.2, from: -40 };

/**
 * The balloon's geometry at inflation k (0 deflated … 1 up) with the shaft in by adv (0 … 1): the outline as a closed
 * polyline, the shaft's polyline, the centre line, and the two marker bands (y).
 */
export function balloonShape(k, adv = 1, n = 28) {
  const { top, bottom, shoulder, shaftR, wall } = BALLOON;
  const tipY = BALLOON.from + (bottom + 6 - BALLOON.from) * adv;
  const half = (y) => {
    const e = esoAt(y), full = Math.max(shaftR, e.h - wall);
    const s = Math.min((y - top) / shoulder, (bottom - y) / shoulder, 1);   // tapered shoulders at both ends
    const t = Math.min(1, Math.max(0, s)), sm = t * t * (3 - 2 * t);
    return shaftR + (full - shaftR) * k * sm;
  };
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(top + ((bottom - top) * i) / n);
  const L = ys.map((y) => [esoAt(y).c - half(y), y]), R = ys.map((y) => [esoAt(y).c + half(y), y]).reverse();
  const shaft = [];
  for (let y = BALLOON.from; y <= tipY; y += 12) shaft.push([esoAt(y).c, y]);
  shaft.push([esoAt(tipY).c, tipY]);
  return { outline: [...L, ...R], shaft, bands: [top + shoulder * 0.6, bottom - shoulder * 0.6], tipY, half };
}
