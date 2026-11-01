// One easing family and one duration scale for the camera and the things that arrive (combined plan M2), the same curves in CSS
// (tokens.css --ease-move, --ease-arrive) and here.
//
// One motion scale (premium-feel R3): D_FLIP, D_SMALL and D_SURFACE are tokens.css --d-flip, --d-small and --d-surface in ms, and
// EASE_ARRIVE, EASE_MOVE and EASE_IN are --ease-arrive, --ease-move and --ease-in as strings for the Web Animations API and inline
// transitions. Nothing outside this file writes a cubic-bezier or a bare duration (tests/motion-scale.test.js reads the CSS and the
// sources). A leave takes the step below its entrance.
//
// easeMove: the quintic smoothstep 6t⁵ − 15t⁴ + 10t³, for symmetric moves (the camera's glides). Its speed and its acceleration
// both start and end at zero and change continuously, so a long glide has no catch half way, as the quadratic in-out it replaces
// had (its acceleration flips at once at the midpoint). CSS: cubic-bezier(.5, 0, .5, 1), within 0.9 % of it.
// easeArrive: cubic-bezier(.2, .8, .2, 1), quick off the mark and settling gently, for what comes in (cards); the curve --ease
// has always been.
//
// camMs: a camera glide's time from how far it goes on screen: 480 ms up to half a screen, then in proportion, at most 900 ms, so
// a short pan is not slow and a move across the figure is not rushed.

export const D_FLIP = 120, D_SMALL = 240, D_SURFACE = 420;   // (a state change; a word, chip, row or popover; a card, sheet, menu or lens crossfade)
export const EASE_ARRIVE = 'cubic-bezier(.2, .8, .2, 1)', EASE_MOVE = 'cubic-bezier(.5, 0, .5, 1)', EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
export const RISE_PX = 6;   // (fade-rise: how far a word, row or chip rises into place; its CSS twin is --rise-y in app.css, motion-scale.test.js keeps the two equal)

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

// A glide begun while another is still moving (the zoom pill pressed twice, a Fit or a refit mid-glide) starts from where the view is and
// at the speed it has, instead of from rest (R13: nothing snaps, and nothing stops dead and starts over). The new glide's progress p(t)
// runs from 0 to 1 along the same path, p = ease(t) + c·t(1−t)², t the glide's own 0..1 clock: the extra term has slope c at the start
// and nothing at the end (value, slope), and the eased progress has no slope at its start, so p'(0) = c per glide: the old speed
// carried onto the new path. Capped, so the progress never passes 1 on the way.
export const CARRY_MAX = 0.8;
const LN2_2 = 2 * Math.LN2;   // (a doubling of the zoom counts as half a screen, as camMs counts it)

/**
 * The speed, in the new glide's own progress per ms, at which a view moving at `v` ({ dlogk, x, y } per ms) is already going along the
 * even glide (lerpVT) from `from` to `to`; 0 when it is still, or going away. w: the screen's width in the views' x, y units.
 */
export function carryRate(v, from, to, w) {
  if (!v || !(w > 0) || !(from.k > 0) || !(to.k > 0)) return 0;
  const r = to.k / from.k, lr = Math.log(r), s = Math.abs(lr) < 1e-9 ? 1 : lr / (r - 1);   // (the pan moves with the zoom, as lerpVT ties them)
  const T = [lr / LN2_2, ((to.x - from.x) * s) / w, ((to.y - from.y) * s) / w];
  const tt = T[0] * T[0] + T[1] * T[1] + T[2] * T[2];
  if (tt < 1e-12) return 0;
  const dot = (v.dlogk / LN2_2) * T[0] + (v.x / w) * T[1] + (v.y / w) * T[2];
  return Number.isFinite(dot) ? Math.max(0, dot / tt) : 0;
}
/** The glide's progress at its clock `raw` (0..1), its eased value `eased`, with the old speed (carryRate × ms) as `c`. */
export const carried = (eased, raw, c) => (c > 0 ? Math.min(1, eased + Math.min(c, CARRY_MAX) * raw * (1 - raw) * (1 - raw)) : eased);

/**
 * How fast a finger was moving down the screen when it lifted, in px per ms (negative: up): over the last 100 ms of its trail
 * [[time, y], …], and 0 if it had paused for 80 ms or more before lifting (a held finger lets go at rest).
 */
export function releaseSpeed(trail, now) {
  if (!trail?.length) return 0;
  const last = trail[trail.length - 1];
  if (now - last[0] > 80) return 0;
  let i = trail.length - 1;
  while (i > 0 && last[0] - trail[i - 1][0] <= 100) i--;
  const dt = last[0] - trail[i][0];
  return dt > 0 ? (last[1] - trail[i][1]) / dt : 0;
}

/**
 * The slope a settle should start with so it carries the finger's speed on: the speed toward the target (`v` px per ms along +y,
 * the target `dist` px away, + or − along y) as a fraction of the distance per `ms`, between 0 and `max`.
 */
export function settleSlope(v, dist, ms, max = 3) {
  if (!dist || !Number.isFinite(v)) return 0;
  const toward = (dist > 0 ? v : -v) * ms / Math.abs(dist);
  return Math.min(max, Math.max(0, toward));
}
/**
 * The CSS curve a sheet or a page settles on, as an inline transition: its opening slope is the finger's speed toward the target (settleSlope,
 * up to the .2/.8 curve's own, 4), so a slow let-go starts slowly and a flick carries on at its speed, and it comes to rest as every other curve
 * does. v: px per ms along +axis as the finger lifted; dist: px to go (+ or −, along the same axis); ms: the transition's time.
 */
export const carryCurve = (v, dist, ms) => `cubic-bezier(.2, ${(0.2 * settleSlope(v, dist, ms, 4)).toFixed(3)}, .2, 1)`;

/**
 * Whether a pull of `dy` px down (past `far`) was a flick: fast as the finger lifted (`speed`, releaseSpeed, px/ms down), or fast over the whole
 * pull (`avg`, px/ms) and not coming back up as it lifted. Judged by the release alone it caught a quick flick after a slow start, which the
 * whole pull's average (a held finger, a slow start) had let fall short; a pull turned back up before it lifted is not one either way.
 */
export function isFlick(dy, speed, avg, min, far) {
  if (!(dy > far)) return false;
  return speed > min || (avg > min && speed >= 0);
}

/**
 * Where a sheet let go at `frac` of its room (0..1) is headed: carried on a little by the finger's speed (`speed`, px per ms down, `room` px
 * the sheet may fill), as a scroll view's detents are chosen, so a quick flick up reaches the next height without crossing half way to it. A
 * finger slower than FLICK_V carries nothing, and it never carries more than FLICK_REACH of the room (never past the next height).
 */
export const FLICK_V = 0.3, FLICK_MS = 150, FLICK_REACH = 0.3;
export function flickAim(frac, speed, room) {
  if (!(room > 0) || !Number.isFinite(frac) || !Number.isFinite(speed) || Math.abs(speed) < FLICK_V) return frac;
  const carry = Math.max(-FLICK_REACH, Math.min(FLICK_REACH, (-speed * FLICK_MS) / room));
  return frac + carry;
}

/** The Hermite settle from 0 to 1 over its clock `k` (0..1), starting with slope `m0` and ending at rest: m0 = 0 is the smoothstep. */
export const settleAt = (k, m0 = 0) => (k <= 0 ? 0 : k >= 1 ? 1 : (k * k * k - 2 * k * k + k) * m0 + (3 * k * k - 2 * k * k * k));
