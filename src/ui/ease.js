// One easing family and one duration scale for the camera and the things that arrive (combined plan M2), the same curves in CSS
// (tokens.css --ease-move, --ease-arrive) and here.
//
// easeMove: the quintic smoothstep 6t⁵ − 15t⁴ + 10t³, for symmetric moves (the camera's glides). Its speed and its acceleration
// both start and end at zero and change continuously, so a long glide has no catch half way, as the quadratic in-out it replaces
// had (its acceleration flips at once at the midpoint). CSS: cubic-bezier(.5, 0, .5, 1), within 0.9 % of it.
// easeArrive: cubic-bezier(.2, .8, .2, 1), quick off the mark and settling gently, for what comes in (cards); the curve --ease
// has always been.
//
// camMs: a camera glide's time from how far it goes on screen: 480 ms up to half a screen, then in proportion, at most 900 ms, so
// a short pan is not slow and a move across the figure is not rushed.

export const easeMove = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function of 0..1 (Newton's method on x, with bisection when it stalls). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x, d = dX(t);
      if (Math.abs(e) < 1e-7) return Y(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) { const v = X(t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
export const easeArrive = cubicBezier(0.2, 0.8, 0.2, 1);

export const CAM_MS_MIN = 480, CAM_MS_MAX = 900;
/**
 * A camera glide's time, from `a` to `b` (views { k, x, y }: the screen at k times, offset by x, y in units of a screen `w` wide).
 * Its reach on screen is the pan in screen widths and the zoom (a doubling counts as half a screen), together.
 */
export function camMs(a, b, w) {
  const pan = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-6, w);
  const zoom = Math.abs(Math.log(Math.max(1e-6, b.k) / Math.max(1e-6, a.k))) / (2 * Math.LN2);
  const d = Math.hypot(pan, zoom);
  return Math.round(Math.min(CAM_MS_MAX, CAM_MS_MIN * Math.max(1, d / 0.5)));
}
