// The clock a refit glide runs on. A glide that follows the cards (a data card tucked or untucked, a screen turned) starts just after a
// layout pass and a label pass, on a phone often a frame or two of 100 ms or more. Timed on the wall clock, that frame carries the
// glide a third of the way in one step: the view seems to snap to its new place and then settle. Here the clock moves on by what the
// frame took but never by more than STEP_MAX, so a slow frame holds the glide back a little instead of skipping part of it, and the first
// frame always draws the start. At 60 or 30 frames a second the clock is the wall clock; only a slow frame is held back.

/** The most one frame may advance a refit glide, in ms (two frames at 50 fps). */
export const STEP_MAX = 40;

/** A clock for one glide: call it with each frame's time; it answers the milliseconds into the glide (0 on the first frame). */
export function glideClock() {
  let last = null, at = 0;
  return (now) => {
    if (last !== null) at += Math.min(Math.max(0, now - last), STEP_MAX);
    last = now;
    return at;
  };
}
