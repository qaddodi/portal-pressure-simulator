// An element's box in stage pixels for the label solver (moved out of stage-label-solve.js, which had grown past the 1,500 lines a part may have, SHL-2/STG-3).
// The text is the solver's own: the element's page box (a text node's by clampTextBox), its four corners carried into the stage's local space, grown by `m` px.
import { elBoxInto } from './shape-gl.js';

/** @param {{ worldToLocalInto: Function, clampTextBox: Function, EBOX: any, SB_A: number[] }} d  (the solver's own scratch: EBOX the element box, SB_A a point) */
export function createBoxOfEl({ worldToLocalInto, clampTextBox, EBOX, SB_A }) {
  const BOX_TMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
  // An element's box in stage px, `m` px grown, written into `out` (or null when it has none).
  function boxOfElInto(out, el, m = 2) {
    const b = el._txt != null ? clampTextBox(el) : elBoxInto(el, EBOX, clampTextBox);
    if (!b?.width) return null;
    const bx = b.x, by = b.y, bw = b.width, bh = b.height;
    worldToLocalInto(SB_A, bx, by); let x0 = SB_A[0], y0 = SB_A[1], x1 = x0, y1 = y0;
    worldToLocalInto(SB_A, bx + bw, by); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx + bw, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    out.x0 = x0 - m; out.y0 = y0 - m; out.x1 = x1 + m; out.y1 = y1 + m;
    return out;
  }
  function boxOfEl(el, m = 2) { const b = boxOfElInto(BOX_TMP, el, m); return b && { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
  return { boxOfElInto, boxOfEl };
}
