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

// Upper and lower chains of the hull (Andrew's monotone chain), as one counter-clockwise cycle (in y-down coordinates).
function hull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * The diaphragm as a polyline, left foot to right foot over the top.
 * @param {number[][][]} organs closed outlines (world units) of the organs it passes over
 * @param {(x: number) => number} [floor] under the heart, the highest the line may run at x (-Infinity elsewhere)
 */
export function diaphragmLine(organs, floor = () => -Infinity) {
  const { gap, foot, arch, step } = DIA;
  // Every point at or above the foot, and where each outline crosses it.
  const pts = [];
  for (const o of organs) for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    if (a[1] <= foot) pts.push(a);
    if ((a[1] - foot) * (b[1] - foot) < 0) pts.push([a[0] + ((b[0] - a[0]) * (foot - a[1])) / (b[1] - a[1]), foot]);
  }
  let xa = Infinity, xb = -Infinity;
  for (const [x] of pts) { if (x < xa) xa = x; if (x > xb) xb = x; }
  const mid = (xa + xb) / 2, lift = (x) => arch * (x - mid) ** 2;
  // The hull with the arch's lift (the lift depends on x only, so it is undone point by point and along each edge).
  const H = hull(pts.map(([x, y]) => [x, y - lift(x)]));
  // The cycle runs left to right over the top, then back along the bottom (the foot): start where the top begins, at the
  // last vertex on the foot (in the warped frame the foot's points sit on lift's curve), and stop at the next.
  const onFoot = (q) => q[1] + lift(q[0]) >= foot - 1e-6;
  let s = 0;
  for (let i = 0; i < H.length; i++) if (onFoot(H[i]) && !onFoot(H[(i + 1) % H.length])) { s = i; break; }
  const top = [];
  for (let k = 0; k < H.length; k++) {
    const q = H[(s + k) % H.length];
    top.push(q);
    if (k > 0 && onFoot(q)) break;
  }
  // Each edge in small steps, the lift undone.
  const line = [];
  for (let i = 0; i < top.length - 1; i++) {
    const [ax, ay] = top[i], [bx, by] = top[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 0; j < n; j++) { const t = j / n, x = ax + (bx - ax) * t; line.push([x, ay + (by - ay) * t + lift(x)]); }
  }
  line.push([top.at(-1)[0], top.at(-1)[1] + lift(top.at(-1)[0])]);
  // Out along the normals (the hull is convex, so this never loops), then evenly spaced again.
  const off = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] + (gap * dy) / l, p[1] - (gap * dx) / l];
  });
  let even = [off[0]];
  let carry = 0;
  for (let i = 1; i < off.length; i++) {
    const a = off[i - 1], b = off[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let u = step - carry;
    for (; u <= l; u += step) even.push([a[0] + ((b[0] - a[0]) * u) / l, a[1] + ((b[1] - a[1]) * u) / l]);
    carry = l - (u - step);
  }
  if (Math.hypot(off.at(-1)[0] - even.at(-1)[0], off.at(-1)[1] - even.at(-1)[1]) > step / 3) even.push(off.at(-1)); else even[even.length - 1] = off.at(-1);
  // Two light smoothing passes even out the hull's vertices (each moves a point well under a unit).
  for (let k = 0; k < 2; k++) even = even.map((p, i) => (i === 0 || i === even.length - 1 ? p : [0, 1].map((j) => (even[i - 1][j] + 2 * p[j] + even[i + 1][j]) / 4)));
  // Under the heart: eased down as far as its base needs, flat across where it is needed and easing back over W each side
  // (cos²), so the heart rests in a soft saddle, never a notch.
  let m = 0, xn0 = Infinity, xn1 = -Infinity;
  for (const [x, y] of even) { const v = floor(x) - y; if (v > 0) { m = Math.max(m, v); xn0 = Math.min(xn0, x); xn1 = Math.max(xn1, x); } }
  if (m > 0) {
    const W = 80;
    for (let i = 0; i < even.length; i++) {
      const [x, y] = even[i], o = x < xn0 ? xn0 - x : x > xn1 ? x - xn1 : 0;
      if (o < W) even[i] = [x, y + m * Math.cos((Math.PI / 2) * (o / W)) ** 2];
    }
  }
  return even;
}

/** Through every point (Catmull-Rom as cubic Béziers). */
export function diaphragmD(out) {
  const f1 = (v) => v.toFixed(1);
  let d = `M${f1(out[0][0])} ${f1(out[0][1])}`;
  for (let i = 0; i < out.length - 1; i++) {
    const p0 = out[Math.max(0, i - 1)], p1 = out[i], p2 = out[i + 1], p3 = out[Math.min(out.length - 1, i + 2)];
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
