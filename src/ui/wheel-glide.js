// A mouse-wheel notch's zoom, glided (premium motion recs, item 11). One notch is a step of about 16 % that used to land in one frame;
// it now runs over WHEEL_GLIDE_MS on the camera's own curve (easeMove), and a notch that comes while the last is still moving starts
// from where the zoom is and at the speed it has (ease.js carried), so a run of notches reads as one continuous zoom, not as steps.
//
// A trackpad stays direct: its pinch (a wheel event with ctrlKey) and its two-finger scroll report many small deltas a frame, each
// one already the hand's own motion, and a glide over them would trail the fingers. The notch is told from them once per gesture by
// isPadWheel (the rule the stage and the lobule have always used): a trackpad reports its legacy wheelDeltaY as exactly three times
// its delta, or sends a sideways delta, or none at all (Safari's gesture events); Firefox reports a notch in lines (deltaMode 1).
//
// The glide works in the log of the zoom (a step is a factor), in its own chain: 0 at the first notch, the target `to` the sum of the
// notches so far, and `apply(dlog, px, py)` is handed what each frame adds, so the surface zooms by exp(dlog) about the pointer.
import { CARRY_MAX, carried, easeMove } from './ease.js';

export const WHEEL_GLIDE_MS = 100;   // (80 to 120 ms: long enough to read as a glide, short enough that the zoom is under the hand)

/** Whether a wheel event is a trackpad's scroll (many small deltas, a sideways delta, or none of the legacy wheelDeltaY a notch has). */
export function isPadWheel(ev) {
  return ev.deltaMode === 0 && (ev.deltaX !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1);
}

/** The slope of easeMove at t (30 t² (1 − t)²). */
const easeSlope = (t) => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (1 - t) * (1 - t));

/**
 * The glide. ask(cb) -> id and cancel(id) are the frame loop's (frameFor, cancelFrame); apply(dlog, px, py) is called in the frame with
 * what the zoom grows by (the log of the factor) about the pointer at (px, py), the pointer of the newest notch.
 */
export function createWheelGlide({ ask, cancel, apply, ms = WHEEL_GLIDE_MS }) {
  let id = 0, from = 0, to = 0, applied = 0, t0 = 0, c0 = 0, px = 0, py = 0;
  const raw = (now) => Math.min(1, Math.max(0, (now - t0) / ms));
  const posAt = (now) => { const r = raw(now); return from + (to - from) * carried(easeMove(r), r, c0); };
  // (The speed now, in log zoom per ms: the derivative of posAt.)
  const velAt = (now) => { const r = raw(now); return r >= 1 ? 0 : ((to - from) / ms) * (easeSlope(r) + (c0 > 0 ? Math.min(c0, CARRY_MAX) * (1 - r) * (1 - 3 * r) : 0)); };
  function step(now) {
    id = 0;
    const p = posAt(now), d = p - applied;
    applied = p;
    if (d !== 0) apply(d, px, py);
    if (raw(now) < 1) id = ask(step); else { from = to = applied = 0; c0 = 0; }
  }
  return {
    /** One notch: `d` the log of its zoom factor, about the pointer (x, y), at time `now`. */
    push(d, x, y, now) {
      if (!(d !== 0) || !Number.isFinite(d)) return;
      const running = id !== 0;
      const cur = running ? posAt(now) : 0, v = running ? velAt(now) : 0;
      if (running) { cancel(id); id = 0; }
      // (A step is taken up to now first: the frame may not have run since the last notch.)
      const owed = cur - applied;
      if (owed !== 0) { apply(owed, px, py); applied = cur; }
      const target = (running ? to : 0) + d;
      if (!running) applied = 0;
      from = cur; to = target; t0 = now; px = x; py = y;
      // (The old speed along the new way, as a share of this glide's progress: ease.js carried reads it as c·raw·(1−raw)².)
      c0 = (to - from) * v > 0 ? (v * ms) / (to - from) : 0;
      id = ask(step);
    },
    /** The zoom still owed (log): where the glide ends less where it has got to. 0 when it is not running. */
    left() { return id ? to - applied : 0; },
    get active() { return id !== 0; },
    /** A hand or a button takes over: the glide stops where it is and owes nothing. */
    cancel() { if (id) cancel(id); id = 0; from = to = applied = 0; c0 = 0; },
  };
}
