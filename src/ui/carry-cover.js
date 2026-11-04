// A picture drawn for one view and carried to another by the GPU (the lobule's pinch, pan and wheel: lobule-zoom.js layShared) is laid
// at p' = a p + (tx, ty) (CSS px, a the scale). It may be carried only while it still covers the whole W × H screen: a gap at its edges
// would show the page's colour until the picture is drawn again for the view. Other layers that carry a picture the same way (the cards'
// zoom) call this too. `scaleMax` keeps a picture from being stretched soft: past it, draw again.
export const CARRY_SCALE_MAX = 1.6;

/** Whether the picture [0, W] × [0, H] laid at p' = a p + (tx, ty) covers [0, W] × [0, H] (`slack` px to spare), and a is within (1 - eps, scaleMax]. */
export function carryCovers(a, tx, ty, W, H, scaleMax = CARRY_SCALE_MAX, slack = 0.5) {
  if (!(a > 0) || a > scaleMax) return false;
  return tx <= slack && ty <= slack && a * W + tx >= W - slack && a * H + ty >= H - slack;
}

/** The carry from a picture drawn for the view (k0, x0, y0) to the view (k, x, y): { a, tx, ty } written into out. */
export function carryBetween(k0, x0, y0, k, x, y, out) {
  const a = k / k0;
  out.a = a; out.tx = x - a * x0; out.ty = y - a * y0;
  return out;
}
