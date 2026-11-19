// A smooth path through chart points, shared by the course, all-patients and parameter-curve charts (moved out of tool-course.js, which tool-curve.js cannot import: it imports tool-curve).

/** A smooth path through points [x, y] (x rising): a cubic through each that never overshoots its neighbours (Fritsch–Carlson, so a flat
 *  stretch stays flat and a fall to zero does not dip under it). With join the path goes on from where one stands (L, not M). */
export function smoothPath(pts, join = false) {
  const n = pts.length, r = (v) => +v.toFixed(1);
  if (n < 2) return n ? `${join ? 'L' : 'M'}${r(pts[0][0])} ${r(pts[0][1])}` : '';
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0; }
  const s = [m[0]];
  for (let i = 1; i < n - 1; i++) s[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  s[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { s[i] = 0; s[i + 1] = 0; continue; }
    const a = s[i] / m[i], b = s[i + 1] / m[i], k = Math.hypot(a, b);
    if (k > 3) { s[i] = (3 * a / k) * m[i]; s[i + 1] = (3 * b / k) * m[i]; }
  }
  let d = `${join ? 'L' : 'M'}${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3, [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    d += `C${r(x0 + h)} ${r(y0 + s[i] * h)} ${r(x1 - h)} ${r(y1 - s[i + 1] * h)} ${r(x1)} ${r(y1)}`;
  }
  return d;
}
