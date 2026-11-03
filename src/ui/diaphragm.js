// The diaphragm's line over the organs (no DOM): one smooth dome a little above the liver, the stomach and the spleen,
// from the foot of its fade on the right flank to the left. Mohammad, 20 Oct: one smooth dome above the organs, no corners,
// kinks, hooks or V dips, never morphing to the liver's nodules; the heart rests on it.
//
// The dome is the convex hull of the organs (cut off at the foot), so it can never dip between them, hook or loop, and it
// wraps their sides as closely as their tops. The hull is taken with each point lifted by ARCH·(x − mid)², which turns
// every straight run of the hull (from the liver across to the spleen) into a gentle arch, still tangent where it leaves
// an organ. It is then pushed out GAP along its normals, and eased down under the heart's base where the two would meet,
// so the heart rests on it in a soft saddle, never a notch.
export const DIA = { gap: 11, foot: 420, arch: 0.0004, step: 6 };

// What the line is worked in: flat coordinate lists (x and y apart), kept between calls and written in place, with a count for each
// (the diaphragm is redrawn from the stage's frame whenever the liver or the spleen has moved a notch, and builds nothing but the path text).
// P: the organs' points (then the same lifted, sorted); LO, UP: the hull's two chains, as indices into P; H: the hull; T: its top;
// L: the top cut into steps; OF: that pushed out along its normals; E, F: the evenly spaced line and the smoothing's other half.
const PX = [], PY = [], LO = [], UP = [], HX = [], HY = [], TX = [], TY = [], LX = [], LY = [], OFX = [], OFY = [], EX = [], EY = [], FX = [], FY = [];
const GAPS = [701, 301, 132, 57, 23, 10, 4, 1];   // (a shell sort's gaps)
const noFloor = () => -Infinity;
const liftOf = (arch, mid, x) => arch * (x - mid) ** 2;
const onFoot = (x, y, arch, mid, foot) => y + liftOf(arch, mid, x) >= foot - 1e-6;
const f1 = (v) => v.toFixed(1);

/** The line diaphragmFill makes: its points' x and y, in these two lists (valid up to the count diaphragmFill returned). */
export const LINE_X = EX, LINE_Y = EY;

// The first n points of P in order of x, then y (as the pairs were sorted).
function sortPoints(n) {
  for (const gap of GAPS) for (let i = gap; i < n; i++) {
    const x = PX[i], y = PY[i];
    let j = i;
    while (j >= gap && (PX[j - gap] > x || (PX[j - gap] === x && PY[j - gap] > y))) { PX[j] = PX[j - gap]; PY[j] = PY[j - gap]; j -= gap; }
    PX[j] = x; PY[j] = y;
  }
}
const cross = (o, a, b) => (PX[a] - PX[o]) * (PY[b] - PY[o]) - (PY[a] - PY[o]) * (PX[b] - PX[o]);
// One smoothing pass: each inner point is a quarter of each neighbour and half itself (the ends stay).
function smooth(sx, sy, tx, ty, n) {
  tx[0] = sx[0]; ty[0] = sy[0]; tx[n - 1] = sx[n - 1]; ty[n - 1] = sy[n - 1];
  for (let i = 1; i < n - 1; i++) { tx[i] = (sx[i - 1] + 2 * sx[i] + sx[i + 1]) / 4; ty[i] = (sy[i - 1] + 2 * sy[i] + sy[i + 1]) / 4; }
}

/**
 * The diaphragm's line, left foot to right foot over the top, worked into LINE_X / LINE_Y without building anything; returns how many
 * points it has. What diaphragmLine returns as pairs.
 * @param {number[][][]} organs closed outlines (world units) of the organs it passes over
 * @param {(x: number) => number} [floor] under the heart, the highest the line may run at x (-Infinity elsewhere)
 */
export function diaphragmFill(organs, floor = noFloor) {
  const { gap, foot, arch, step } = DIA;
  // Every point at or above the foot, and where each outline crosses it.
  let n = 0;
  for (const o of organs) for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    if (a[1] <= foot) { PX[n] = a[0]; PY[n] = a[1]; n++; }
    if ((a[1] - foot) * (b[1] - foot) < 0) { PX[n] = a[0] + ((b[0] - a[0]) * (foot - a[1])) / (b[1] - a[1]); PY[n] = foot; n++; }
  }
  let xa = Infinity, xb = -Infinity;
  for (let i = 0; i < n; i++) { const x = PX[i]; if (x < xa) xa = x; if (x > xb) xb = x; }
  const mid = (xa + xb) / 2;
  // The hull with the arch's lift (the lift depends on x only, so it is undone point by point and along each edge).
  for (let i = 0; i < n; i++) PY[i] -= liftOf(arch, mid, PX[i]);
  sortPoints(n);
  let nlo = 0, nup = 0;
  for (let i = 0; i < n; i++) { while (nlo > 1 && cross(LO[nlo - 2], LO[nlo - 1], i) <= 0) nlo--; LO[nlo++] = i; }
  for (let i = n - 1; i >= 0; i--) { while (nup > 1 && cross(UP[nup - 2], UP[nup - 1], i) <= 0) nup--; UP[nup++] = i; }
  let hn = 0;
  for (let i = 0; i < nlo - 1; i++, hn++) { HX[hn] = PX[LO[i]]; HY[hn] = PY[LO[i]]; }
  for (let i = 0; i < nup - 1; i++, hn++) { HX[hn] = PX[UP[i]]; HY[hn] = PY[UP[i]]; }
  // The cycle runs left to right over the top, then back along the bottom (the foot): start where the top begins, at the
  // last vertex on the foot (in the warped frame the foot's points sit on lift's curve), and stop at the next.
  let s = 0;
  for (let i = 0; i < hn; i++) {
    const nx = (i + 1) % hn;
    if (onFoot(HX[i], HY[i], arch, mid, foot) && !onFoot(HX[nx], HY[nx], arch, mid, foot)) { s = i; break; }
  }
  let tn = 0;
  for (let k = 0; k < hn; k++) {
    const q = (s + k) % hn;
    TX[tn] = HX[q]; TY[tn] = HY[q]; tn++;
    if (k > 0 && onFoot(HX[q], HY[q], arch, mid, foot)) break;
  }
  if (!tn) throw new TypeError('diaphragmFill: no organ reaches the foot');
  // Each edge in small steps, the lift undone.
  let ln = 0;
  for (let i = 0; i < tn - 1; i++) {
    const ax = TX[i], ay = TY[i], bx = TX[i + 1], by = TY[i + 1], cnt = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 0; j < cnt; j++) { const t = j / cnt, x = ax + (bx - ax) * t; LX[ln] = x; LY[ln] = ay + (by - ay) * t + liftOf(arch, mid, x); ln++; }
  }
  LX[ln] = TX[tn - 1]; LY[ln] = TY[tn - 1] + liftOf(arch, mid, TX[tn - 1]); ln++;
  // Out along the normals (the hull is convex, so this never loops), then evenly spaced again.
  for (let i = 0; i < ln; i++) {
    const a = Math.max(0, i - 1), b = Math.min(ln - 1, i + 1);
    const dx = LX[b] - LX[a], dy = LY[b] - LY[a], l = Math.hypot(dx, dy) || 1;
    OFX[i] = LX[i] + (gap * dy) / l; OFY[i] = LY[i] - (gap * dx) / l;
  }
  EX[0] = OFX[0]; EY[0] = OFY[0];
  let en = 1, carry = 0;
  for (let i = 1; i < ln; i++) {
    const ax = OFX[i - 1], ay = OFY[i - 1], bx = OFX[i], by = OFY[i], l = Math.hypot(bx - ax, by - ay);
    let u = step - carry;
    for (; u <= l; u += step) { EX[en] = ax + ((bx - ax) * u) / l; EY[en] = ay + ((by - ay) * u) / l; en++; }
    carry = l - (u - step);
  }
  if (Math.hypot(OFX[ln - 1] - EX[en - 1], OFY[ln - 1] - EY[en - 1]) > step / 3) en++;
  EX[en - 1] = OFX[ln - 1]; EY[en - 1] = OFY[ln - 1];
  // Two light smoothing passes even out the hull's vertices (each moves a point well under a unit).
  smooth(EX, EY, FX, FY, en);
  smooth(FX, FY, EX, EY, en);
  // Under the heart: eased down as far as its base needs, flat across where it is needed and easing back over W each side
  // (cos²), so the heart rests in a soft saddle, never a notch.
  let m = 0, xn0 = Infinity, xn1 = -Infinity;
  for (let i = 0; i < en; i++) { const x = EX[i], v = floor(x) - EY[i]; if (v > 0) { m = Math.max(m, v); xn0 = Math.min(xn0, x); xn1 = Math.max(xn1, x); } }
  if (m > 0) {
    const W = 80;
    for (let i = 0; i < en; i++) {
      const x = EX[i], o = x < xn0 ? xn0 - x : x > xn1 ? x - xn1 : 0;
      if (o < W) EY[i] = EY[i] + m * Math.cos((Math.PI / 2) * (o / W)) ** 2;
    }
  }
  return en;
}

/**
 * The diaphragm as a polyline, left foot to right foot over the top (diaphragmFill's points as a fresh list of pairs).
 * @param {number[][][]} organs closed outlines (world units) of the organs it passes over
 * @param {(x: number) => number} [floor] under the heart, the highest the line may run at x (-Infinity elsewhere)
 */
export function diaphragmLine(organs, floor = noFloor) {
  const n = diaphragmFill(organs, floor), out = [];
  for (let i = 0; i < n; i++) out.push([EX[i], EY[i]]);
  return out;
}

// The line in LINE_X / LINE_Y (n points) as a path through every point (Catmull-Rom as cubic Béziers).
function lineD(n) {
  let d = `M${f1(EX[0])} ${f1(EY[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2), p0x = EX[i0], p0y = EY[i0], p1x = EX[i], p1y = EY[i], p2x = EX[i + 1], p2y = EY[i + 1], p3x = EX[i3], p3y = EY[i3];
    d += ` C${f1(p1x + (p2x - p0x) / 6)} ${f1(p1y + (p2y - p0y) / 6)} ${f1(p2x - (p3x - p1x) / 6)} ${f1(p2y - (p3y - p1y) / 6)} ${f1(p2x)} ${f1(p2y)}`;
  }
  return d;
}

/** The diaphragm over the organs as a path through every point of its line (diaphragmFill, then diaphragmD's path): the one call that builds nothing but the text. */

/** Through every point (Catmull-Rom as cubic Béziers). */
export function diaphragmD(out) {
  const n = out.length;
  if (!n) throw new TypeError('diaphragmD: no points');
  for (let i = 0; i < n; i++) { EX[i] = out[i][0]; EY[i] = out[i][1]; }
  return lineD(n);
}
