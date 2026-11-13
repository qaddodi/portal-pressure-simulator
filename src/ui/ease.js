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
// a short pan is not slow and a move across the figure is not rushed. lobuleMs: the same reach on the lobule's own view, 480 ms up to
// half a screen and then in proportion, at most LOBULE_MS_MAX (its long dives are the longest camera moves that are not a view change).

export const D_FLIP = 120, D_SMALL = 240, D_SURFACE = 420;   // (a state change; a word, chip, row or popover; a card, sheet, menu or lens crossfade)
export const EASE_ARRIVE = 'cubic-bezier(.2, .8, .2, 1)', EASE_MOVE = 'cubic-bezier(.5, 0, .5, 1)', EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
export const RISE_PX = 6;   // (fade-rise: how far a word, row or chip rises into place; its CSS twin is --rise-y in app.css, motion-scale.test.js keeps the two equal)

export const easeMove = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

// (The curve's polynomial and its slope at t, for coefficients a, b, c: plain functions, so a curve makes no closure but its own.)
const poly = (a, b, c, t) => ((a * t + b) * t + c) * t, slope = (a, b, c, t) => (3 * a * t + 2 * b) * t + c;
/** A CSS cubic-bezier(x1, y1, x2, y2) as a function of 0..1 (Newton's method on x, with bisection when it stalls).
 *  It makes the curve once: callers keep it (module constants, label-track's memo, cssCurve's map), never one per frame. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  // alloc-rare: the curve itself, made once per easing (callers memoize it: label-track memo, cssCurve curves, module constants)
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = poly(ax, bx, cx, t) - x, d = slope(ax, bx, cx, t);
      if (Math.abs(e) < 1e-7) return poly(ay, by, cy, t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) { const v = poly(ax, bx, cx, t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return poly(ay, by, cy, t);
  };
}
export const easeArrive = cubicBezier(0.2, 0.8, 0.2, 1);
export const easeIn = cubicBezier(0.4, 0, 1, 1);   // (EASE_IN as a function)
// (The ease-out cubic 1 − (1 − u)³, as five moves have always run it (13 Nov 2026, unification audit 9: one name for it, no curve changed): the
// number roll (util.js countTo), the catheter's glide, the timeline's day count, the readings slide, a trace marker's drop. Not clamped: callers give 0..1. No CSS twin.)
export const easeOut3 = (u) => 1 - (1 - u) ** 3;
// (A CSS easing as a function of 0..1: cubic-bezier(...) as given, the named curves by their CSS values. 2 Nov 2026: an ease the page
// runs, worked out in script where the drawing follows it on the GPU. 13 Nov 2026, unification audit 9: the one CSS-curve reader;
// cssCurveOf gives null for a curve it does not follow exactly (steps, linear() with stops), cssCurve linear for it.)
const NAMED = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const LINEAR = (t) => t;
const curves = new Map();
export function cssCurveOf(easing) {
  let f = curves.get(easing);
  if (f === undefined) {
    // alloc-rare: only the first time an easing text is met (the curve is then kept by its text)
    const s = String(easing ?? 'linear').trim() || 'linear', m = /^cubic-bezier\(([^)]*)\)$/.exec(s), v = m ? m[1].split(',').map(Number) : NAMED[s];
    // alloc-rare: only the first time an easing text is met
    f = s === 'linear' ? LINEAR : v?.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : null;
    if (curves.size >= 400) curves.clear();   // (bounded: easing texts are read from page styles, so a long session cannot grow it without end)
    curves.set(easing, f);
  }
  return f;
}
export const cssCurve = (easing) => cssCurveOf(easing) || LINEAR;

export const CAM_MS_MIN = 480, CAM_MS_MAX = 900, LOBULE_MS_MAX = 1500;
/**
 * A camera glide's time, from `a` to `b` (views { k, x, y }: the screen at k times, offset by x, y in units of a screen `w` wide).
 * Its reach on screen is the pan in screen widths and the zoom (a doubling counts as half a screen), together. `max`: the longest it takes.
 */
export function camMs(a, b, w, max = CAM_MS_MAX) {
  const pan = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-6, w);
  const zoom = Math.abs(Math.log(Math.max(1e-6, b.k) / Math.max(1e-6, a.k))) / (2 * Math.LN2);
  const d = Math.hypot(pan, zoom);
  return Math.round(Math.min(max, CAM_MS_MIN * Math.max(1, d / 0.5)));
}
/** The lobule view's glide time (camMs on its own ceiling): `a` and `b` are its views, in the host's px, `w` its width. */
export const lobuleMs = (a, b, w) => camMs(a, b, w, LOBULE_MS_MAX);

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
  const T0 = lr / LN2_2, T1 = ((to.x - from.x) * s) / w, T2 = ((to.y - from.y) * s) / w;
  const tt = T0 * T0 + T1 * T1 + T2 * T2;
  if (tt < 1e-12) return 0;
  const dot = (v.dlogk / LN2_2) * T0 + (v.x / w) * T1 + (v.y / w) * T2;
  return Number.isFinite(dot) ? Math.max(0, dot / tt) : 0;
}
/**
 * The one carry-over tracker every camera glide uses (stage view, lobule view): sample() each frame with the camera ({ k, x, y }) it just
 * wrote, and take() at the start of the next glide for the speed to carry on (carryRate), null if the last frames are older than 80 ms
 * (or than `maxAge`: a trackpad pinch's spring-back waits a quarter second for the pinch to be over).
 * Written in place, nothing allocated per frame. begin() forgets the last sample (a new glide's first frame has no speed yet).
 */
export function createGlideTracker() {
  const vel = { t: 0, dlogk: 0, x: 0, y: 0 }, last = { t: 0, k: 1, x: 0, y: 0 };
  let haveVel = false, haveLast = false;
  return {
    begin() { haveLast = false; },
    sample(cam, now) {
      if (haveLast && now > last.t && now - last.t < 100) { const dt = now - last.t; vel.t = now; vel.dlogk = Math.log(cam.k / last.k) / dt; vel.x = (cam.x - last.x) / dt; vel.y = (cam.y - last.y) / dt; haveVel = true; }
      last.t = now; last.k = cam.k; last.x = cam.x; last.y = cam.y; haveLast = true;
    },
    take(now, maxAge = 80) { return haveVel && now - vel.t < maxAge ? vel : null; },
  };
}
/**
 * The slope (in the new glide's own progress per glide) at which a view moving at `v` ({ dlogk, x, y } per ms) starts its glide `from` to
 * `to` over `ms`: carryRate along the even glide, and for a pure pan (no zoom between the two) the hand's speed along the way home as a
 * sheet's settle takes the finger's (settleSlope), so a pan let go while still coming back keeps going at its speed. 0 when it is still
 * or going away.
 */
export function springSlope(v, from, to, w, ms) {
  if (!v || !(ms > 0)) return 0;
  if (Math.abs(Math.log(to.k / from.k)) < 1e-6) {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    return dist > 1e-9 ? settleSlope((v.x * dx + v.y * dy) / dist, dist, ms, CARRY_MAX) : 0;
  }
  return carryRate(v, from, to, w) * ms;
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
// alloc-rare: the curve's string is made once per let-go (a swipe or sheet release), not per frame
export const carryCurve = (v, dist, ms) => `cubic-bezier(.2, ${(0.2 * settleSlope(v, dist, ms, 4)).toFixed(3)}, .2, 1)`;

/** The release rules every sheet over the thumb dock shares, cards and menus (dock-sheet.js, util.js swipeSheet): a flick is faster than SHEET_FLICK_MIN px/ms as the finger lifted (or over the pull) and further than SHEET_FLICK_FAR px; a pull down past SHEET_CLOSE_PX (or SHEET_CLOSE_SHARE of the sheet's height) closes it. */
export const SHEET_FLICK_MIN = 0.9, SHEET_FLICK_FAR = 40, SHEET_CLOSE_PX = 90, SHEET_CLOSE_SHARE = 0.3;

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
