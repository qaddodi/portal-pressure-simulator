// How an instrument card puts a new drawing on its picture (Mohammad, 15 Nov 2026: "the indicator jumps from one place to another rather than
// transition smoothly; it has to glide"). The stiffness bar and the SAAG plane draw their whole picture again each time a reading changes, and
// both did it with show(model, false): the old model removed, the new one put down, so the patient's mark stood at its new place in the next frame.
// show(model, true) is the picture's own morph (svg-morph.js): every piece in both drawings glides from where it stood to where it goes (a mark,
// a dot, a bar's end), over D_SURFACE (420 ms, the number roll's 400 ms and its curve), a piece only one drawing has fades, and under Reduce
// Motion the new drawing crossfades over the old, never a jump. The morph needs the same box (viewBox, width and height): a drawing at another
// width or type size is another drawing (a resize), and is put down as it always was.
//
//   const put = cardShow(gl);   put(model, '300|12');   // the second argument: what the drawing's frame is made of (width, type size), a string
import { D_SURFACE } from './ease.js';
import { COUNT_MS } from './motion.js';

/** The longest the glide may differ from the number roll (ms): one surface glide, 420, against the roll's 400. */
export const GLIDE_SLACK_MS = 40;
/** The glide's length (ms): the morph's, which is the page's one surface duration. */
export const SHOW_GLIDE_MS = D_SURFACE;
/** Whether the glide keeps in step with the number roll beside it (a test holds this). */
export const glideInStep = () => Math.abs(SHOW_GLIDE_MS - COUNT_MS) <= GLIDE_SLACK_MS;

/** Whether this drawing glides from the one before: it does when there was one and its frame (width, type size) is the same. */
export const glides = (was, frame) => was !== null && was === frame;

/** A card's way of putting a drawing on `gl`: the first drawing, and any at a new frame, are put down; a later one at the same frame glides in from the one on show. */
export function cardShow(gl) {
  let was = null;
  return function put(model, frame) {
    gl.show(model, glides(was, frame));
    was = frame;
  };
}
