// The clock a refit glide runs on. A glide that follows the cards (a data card tucked or untucked, a screen turned) starts just after a
// layout pass and a label pass, on a phone often a frame or two of 100 ms or more. Timed on the wall clock, that frame carries the
// glide a third of the way in one step: the view seems to snap to its new place and then settle. Here the clock moves on by what the
// frame took but never by more than STEP_MAX, so a slow frame holds the glide back a little instead of skipping part of it, and the first
// frame always draws the start. At 60 or 30 frames a second the clock is the wall clock; only a slow frame is held back.

/** The most one frame may advance a refit glide, in ms (two frames at 50 fps). */
export const STEP_MAX = 40;

/** The most any other glide of the camera moves on in one frame, in ms (a frame at 15 fps): a longer frame (a stall: the cards' entry, a label
 *  pass, a solve) holds the glide where it stood for the rest, so the move goes on from there and never lands its next part in one jump
 *  (16 Nov 2026, Sites and causes 2 to 3 on his Mac: a 1 s stall near the end landed the last 8 to 21 % of the move as a jump). stage-glide.js. */
export const STALL_MAX = 66;

/** A clock for one glide: call it with each frame's time; it answers the milliseconds into the glide (0 on the first frame). */
export function glideClock() {
  let last = null, at = 0;
  return (now) => {   // alloc-rare: once per glide, when a refit starts (the frames of the glide call the clock, not make it)
    if (last !== null) at += Math.min(Math.max(0, now - last), STEP_MAX);
    last = now;
    return at;
  };
}

/**
 * How far to move the start of a glide on the wall clock whose first frame comes `now - t0` ms after it was asked for: the layout and label
 * passes the same move set off make that frame a long one, and a glide drawn 150 ms in would show its view a third of the way at once, a snap.
 * The start moves to at most STEP_MAX ms before the frame (0 for a frame on time), and the glide's end with it (15 Nov 2026).
 */
export const lateShift = (now, t0) => (now - t0 > STEP_MAX ? now - t0 - STEP_MAX : 0);
