// The one motion module (production review PR-22, PR-28, 4 Nov 2026): the duration scale, the three curves, and the one Reduce Motion read.
//   durations  D_FLIP, D_SMALL, D_SURFACE (tokens.css --d-flip, --d-small, --d-surface), CAM_MS_MIN/MAX for the camera
//   curves     EASE_ARRIVE, EASE_MOVE, EASE_IN as CSS text; easeArrive, easeMove, easeIn as functions; cssCurve(text) for any other
//   reduced    reduceMotionMQ, the page's one MediaQueryList for prefers-reduced-motion, and reduced() for its current answer
//   clocks     createReversible (a progress that turns round without a kink) and createStepClock (the one clock rule), below
// Policy (docs/ACCESSIBILITY.md): with Reduce Motion a state change is instant and the figure still follows the hand (following is not an
// animation). scripts/rules-lint.mjs keeps new code from reading the media query anywhere else or writing its own ease/lerp/cubic-bezier:
// import from here. (The scales themselves live in ease.js; this module is the name every other file imports.)
//
// Reduce Motion, the exceptions to "instant" (docs/ACCESSIBILITY.md says the same):
//   - A camera glide (stage-glide.js, the presenter's framing) keeps a short glide, REDUCED_MOVE_MS (300 ms), and never jumps: a jump of the
//     whole figure is harder to follow than a short move. It is the one move allowed to run, and only that short.
//   - The change between Anatomy and Circuit takes the same short form: the morph and its camera run REDUCED_MOVE_MS instead of 1.3 s, as a
//     crossfade-and-move (22 of docs/recommendations/animation-and-transitions.md). Fades that stand in for a move last D_FLIP.
//   - Everything else stays instant (the dive and the rise are skipped, the turn is set outright).
//
// One clock rule (item 19 of the same recommendations, 8 Nov 2026). A move runs on the honest wall clock (frame.js easeNow: a long frame
// shows the move where the wall clock puts it, so a move ends when its own duration says), with one exception: the FIRST_FRAMES first
// frames of any move advance it by at most FIRST_STEP_MAX ms each (glide-clock.js STEP_MAX, 40 ms). Those are the frames that follow the
// layout and label passes which set the move off, so they are the long ones, and a move that took their length at once would show its
// first third in one step. After them the move is on the wall clock for good. createStepClock and createReversible apply the rule; an
// ease timed from a start time (t0) that is not one of these has no cap and is the plain wall clock. simTime (200 ms) and the blood's
// clock (100 ms) are the model's own clocks, not moves, and keep their caps.
import { STEP_MAX } from './glide-clock.js';
import { D_FLIP, settleAt } from './ease.js';
export {
  D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN, RISE_PX, CAM_MS_MIN, CAM_MS_MAX,
  easeMove, easeArrive, easeIn, cubicBezier, cssCurve, camMs, settleAt,
} from './ease.js';

/** The page's one prefers-reduced-motion list (a stand-in with matches:false where there is no matchMedia, as in a unit test). */
export const reduceMotionMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {}, removeEventListener() {} };
/** Whether Reduce Motion is on right now. */
export const reduced = () => reduceMotionMQ.matches;

/** Under Reduce Motion, how long the moves that keep a short form take (the camera's glide, the change between the views), in ms. */
export const REDUCED_MOVE_MS = 300;
/** `ms` as Reduce Motion has it: the same, or at most REDUCED_MOVE_MS. (`on`: the answer to use, default reduced().) */
export const reducedMs = (ms, on = reduced()) => (on ? Math.min(ms, REDUCED_MOVE_MS) : ms);

/** How many frames at the start of a move are held to FIRST_STEP_MAX each (the clock rule above). */
export const FIRST_FRAMES = 2;
/** The most one of those first frames may advance a move, in ms. */
export const FIRST_STEP_MAX = STEP_MAX;

/**
 * The clock rule for a move that does its own sums (a velocity, an integral): start() when the move begins, then dt(now) each frame answers
 * the ms to advance by. The call that follows start() answers 0 (that frame draws the start), the next FIRST_FRAMES answer at most
 * FIRST_STEP_MAX, and every later one the true wall-clock gap. now: the frame's time in ms (frame.js easeNow(), or the frame's own).
 */
export function createStepClock() {
  let last = -1, n = 0;
  return {   // alloc-rare: once per clock, with the thing it times
    start() { last = -1; n = 0; },
    dt(now) {
      if (last < 0) { last = now; n = 0; return 0; }
      const gap = now - last;
      last = now;
      if (!(gap > 0)) return 0;
      return n < FIRST_FRAMES ? (n++, Math.min(gap, FIRST_STEP_MAX)) : gap;
    },
  };
}

/**
 * A reversible clock: a progress `x` (0 to 1 by default) that runs to a target at a steady rate, and when the target changes mid-way it
 * turns round by slewing its VELOCITY from one way to the other over `flip` ms (D_FLIP, 120 ms) instead of switching sign in one frame.
 * Position and velocity are continuous through the turn. Durations do not change: the rate is 1 / ms per unit of progress, so a full run
 * takes `ms`, as the plain clock it replaces. The caller shapes the progress with its own curve (easeMove, a smoothstep, settleAt): the
 * clock only decides where along the move it is, so the shape's own rest at both ends makes every landing soft, and a turn moves the
 * shaped value without a kink because the shape is a function of the position.
 *
 *   const c = createReversible({ ms: 1300 });
 *   c.aim(1);                      // the target (and, with a second argument, the full-run time in ms: it may change between legs)
 *   x = c.tick(now);               // each frame: the progress at the frame's time (ms), the clock rule above (a 0 step on the first frame,
 *                                  //   at most FIRST_STEP_MAX for the next two, then the true gap); or c.step(dtMs) with a gap you computed
 *   c.aim(0);                      // tapped back: v slews from +1/1300 to -1/1300 over 120 ms; x runs on a little, then returns
 *   c.sync(x)                      // before each tick, when something else also writes the position (a snap): a jump restarts from rest
 *
 * From rest a move starts at its full rate at once (its shape, not the clock, gives it a soft start; the camera glides do the same).
 * The last stretch before the target is a landing: unless `land: false`, a move that cannot stop in time at the slew's acceleration
 * brakes over the rest of the way with settleAt's Hermite (starting slope 2, a constant deceleration to rest exactly on the target),
 * so a progress used raw, without a shape of its own, still arrives at rest. A turn that would run past a bound (min, max) stops at the
 * bound and slews back from rest. Written in place: nothing is allocated by aim, tick or step.
 *
 *   x, v (per ms, signed), to, ms, moving (not landed), rest (at rest: the next move starts at full rate).
 *   set(x) jumps and lands there; stop() holds where it is; slewing at most 2 * rate / flip per ms per ms.
 */
export function createReversible({ ms = 1000, flip = D_FLIP, min = 0, max = 1, land = true, x: x0 = min } = {}) {
  let x = x0, v = 0, to = x0, full = ms, rate = 1 / ms, rest = true;
  let brk = false, bx = 0, bd = 0, bT = 1, bt = 0;   // (the landing: from bx, by bd, over bT ms, bt of them gone)
  let last = -1, n = 0;                              // (the clock rule's frame count and last time)
  const accel = () => (2 * rate) / flip;
  const landed = () => { x = to; v = 0; rest = true; brk = false; return x; };
  const begin = () => {   // (a move from rest: full rate at once)
    if (!rest || x === to) return;
    rest = false; v = x < to ? rate : -rate; last = -1; n = 0;
  };
  function step(dt) {
    if (x === to && !brk) { v = 0; rest = true; return x; }
    begin();
    if (!(dt > 0)) return x;
    if (brk) {
      bt += dt;
      if (bt >= bT) return landed();
      const k = bt / bT;
      x = bx + bd * settleAt(k, 2); v = (bd * 2 * (1 - k)) / bT;   // (settleAt(k, 2) = 1 - (1 - k)^2, its slope 2(1 - k))
      return x;
    }
    const dir = to > x ? 1 : -1, a = accel();
    if (land && v * dir > 0) {   // (it cannot stop in time at the slew's acceleration: brake over the rest of the way, settleAt's Hermite)
      const R = Math.abs(to - x);
      if (R <= (v * v) / (2 * a)) { brk = true; bx = x; bd = to - x; bT = (2 * R) / Math.abs(v); bt = 0; return step(dt); }
    }
    const vd = dir * rate, dv = vd - v, tS = Math.abs(dv) / a;
    let dx;
    if (dt >= tS) { dx = ((v + vd) / 2) * tS + vd * (dt - tS); v = vd; }
    else { const v1 = v + Math.sign(dv) * a * dt; dx = ((v + v1) / 2) * dt; v = v1; }
    const nx = x + dx;
    if (dir > 0 ? nx >= to : nx <= to) return landed();
    if (nx > max) { x = max; v = 0; return x; }
    if (nx < min) { x = min; v = 0; return x; }
    x = nx;
    return x;
  }
  return {   // alloc-rare: once per clock, with the thing it times
    step,
    /** The progress at the frame's time `now` (ms): the clock rule (createStepClock), then step. */
    tick(now) {
      if (x === to && !brk) { v = 0; rest = true; return x; }
      begin();
      if (last < 0) { last = now; n = 0; return x; }
      let dt = now - last;
      last = now;
      if (!(dt > 0)) return x;
      if (n < FIRST_FRAMES) { n++; dt = Math.min(dt, FIRST_STEP_MAX); }
      return step(dt);
    },
    /** The target (and, if given, the time of a full run in ms). The same target again changes nothing; a new one turns the move round. */
    aim(t, msFull) {
      if (msFull > 0 && msFull !== full) { full = msFull; rate = 1 / msFull; }   // (the velocity slews to the new rate like any other change)
      if (t === to) return;
      to = t; brk = false;
      if (x === to) landed();
    },
    /** Something else wrote the position: if it is not where the clock left it, restart from rest there (the target kept). */
    sync(px) { if (px !== x) { x = px; v = 0; rest = true; brk = false; last = -1; n = 0; } },
    /** Jump to `px` and land there. */
    set(px) { x = px; to = px; v = 0; rest = true; brk = false; last = -1; n = 0; },
    /** Hold where it is. */
    stop() { to = x; v = 0; rest = true; brk = false; },
    get x() { return x; },
    get v() { return v; },
    get to() { return to; },
    get ms() { return full; },
    get moving() { return x !== to || brk; },
    get rest() { return rest; },
    get flip() { return flip; },
  };
}
