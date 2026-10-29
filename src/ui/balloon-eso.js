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

export const BALLOON = { top: 166, bottom: 246, shoulder: 18, shaftR: 0.8, wall: 2.2, from: -40 };

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
 * The balloon's geometry at inflation k (0 deflated … 1 up) with the shaft in by adv (0 … 1): the outline as a closed
 * ring of points, the shaft's points, the two marker bands on the shaft (y), a soft highlight that follows the balloon's
 * curve (a closed ring of points, a thin crescent on the lit side), and half(y), the balloon's half width.
 * The shoulders taper smoothly (smootherstep) into the shaft, so the ends are round, never stepped.
 */
export function balloonShape(k, adv = 1, n = 64) {
  const { top, bottom, shoulder, shaftR, wall } = BALLOON;
  const tipY = BALLOON.from + (bottom + 7 - BALLOON.from) * adv;
  const half = (y) => {
    const e = esoAt(y), full = Math.max(shaftR, e.h - wall);
    const t = Math.min(1, Math.max(0, Math.min((y - top) / shoulder, (bottom - y) / shoulder)));
    const sm = t * t * t * (t * (6 * t - 15) + 10);
    return shaftR + (full - shaftR) * k * sm;
  };
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(top + ((bottom - top) * i) / n);
  const L = ys.map((y) => [esoAt(y).c - half(y), y]), R = ys.map((y) => [esoAt(y).c + half(y), y]).reverse();
  const shaft = [];
  for (let y = BALLOON.from; y < tipY; y += 8) shaft.push([esoAt(y).c, y]);
  shaft.push([esoAt(tipY).c, tipY]);
  // The highlight: inside the lit (left) side, following the wall, widest at the middle and fading to a point at the shoulders.
  const a = top + shoulder * 0.55, b = bottom - shoulder * 0.55, m = 24, out = [], inn = [];
  for (let i = 0; i <= m; i++) {
    const y = a + ((b - a) * i) / m, u = Math.sin((Math.PI * i) / m), h = half(y), c = esoAt(y).c;
    out.push([c - h * 0.72, y]);
    inn.push([c - h * (0.72 - 0.2 * u), y]);
  }
  return { outline: [...L, ...R], shaft, bands: [top + 2, bottom - 2], sheen: [...out, ...inn.reverse()], tipY, half };
}
