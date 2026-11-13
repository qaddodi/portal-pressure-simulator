// The catheter's two readings travel into the summary from where their pills stood (stage.js cathLabels), eased over D_SURFACE (420 ms).
// It was a CSS transform transition, which the browser runs on its compositor, a frame ahead of anything the page draws: the
// callouts' glass is drawn from the page's layout on the main thread (glass-gl.js), so each pill's background trailed its words by
// up to a few dozen pixels while they travelled. Here the offset is worked out and written each frame, on the same thread and in the
// same frame as the glass, so the words and the glass move as one. Nothing here touches the page.

import { D_SURFACE, easeMove } from './motion.js';

/** How long a reading takes to travel to its new place: a surface step of the motion scale (it was 600 ms). It was on screen already, so it
 *  travels on the move curve (easeMove), not the arrive curve it had as a transition, which starts at four times its mean speed. */
export const FLIP_MS = D_SURFACE;
const EASE = easeMove;

/** A reading's travel, begun at `t0` (ms) from `dx`, `dy` px away from where it now stands. */
export const flipFrom = (dx, dy, t0) => ({ dx, dy, t0 });   // alloc-rare: one small record for each flip, made when a reading starts to flip to a new place (a placement change), kept by the stage while it flips

/** Where the travel stands at `now`: the pixels still to go, `x` and `y`, and `done` once it has landed. The answer is one kept object,
 *  rewritten by each call (the stage writes the pill's transform from it at once, a pill after a pill). */
const AT = { x: 0, y: 0, done: false };
export function flipAt(f, now, ms = FLIP_MS) {
  const u = Math.min(1, Math.max(0, (now - f.t0) / ms)), left = 1 - EASE(u);
  AT.x = f.dx * left || 0; AT.y = f.dy * left || 0; AT.done = u >= 1;   // (|| 0: never a minus zero)
  return AT;
}
