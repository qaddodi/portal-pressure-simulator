// An element's box in stage px, for the label solve (moved out of stage-label-solve.js, 19 Nov 2026, to keep that part under its 1,500 lines).
// The element's own box (a clamp's words are measured by clampTextBox, any other by elBoxInto) turned through the figure's matrix at its four corners.
export function createBoxOfEl({ EBOX, clampTextBox, elBoxInto, worldToLocalInto }) {
  const A = [0, 0], TMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** `el`'s box in stage px, `m` px grown, written into `out` (or null when it has none). */
  function boxOfElInto(out, el, m = 2) {
    const b = el._txt != null ? clampTextBox(el) : elBoxInto(el, EBOX, clampTextBox);
    if (!b?.width) return null;
    const bx = b.x, by = b.y, bw = b.width, bh = b.height;
    worldToLocalInto(A, bx, by); let x0 = A[0], y0 = A[1], x1 = x0, y1 = y0;
    worldToLocalInto(A, bx + bw, by); x0 = Math.min(x0, A[0]); y0 = Math.min(y0, A[1]); x1 = Math.max(x1, A[0]); y1 = Math.max(y1, A[1]);
    worldToLocalInto(A, bx, by + bh); x0 = Math.min(x0, A[0]); y0 = Math.min(y0, A[1]); x1 = Math.max(x1, A[0]); y1 = Math.max(y1, A[1]);
    worldToLocalInto(A, bx + bw, by + bh); x0 = Math.min(x0, A[0]); y0 = Math.min(y0, A[1]); x1 = Math.max(x1, A[0]); y1 = Math.max(y1, A[1]);
    out.x0 = x0 - m; out.y0 = y0 - m; out.x1 = x1 + m; out.y1 = y1 + m;
    return out;
  }
  /** The same as a fresh box. */
  function boxOfEl(el, m = 2) { const b = boxOfElInto(TMP, el, m); return b && { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
  return { boxOfElInto, boxOfEl };
}
