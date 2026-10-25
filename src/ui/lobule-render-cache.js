// Keep the vessel bitmap until a caliber change is visible at the current zoom.
// Compare with the last uploaded radii, so small changes still accumulate.
export function radiiChanged(previous, next, tolerance) {
  return !previous || previous.length !== next.length || next.some((r, i) => Math.abs(r - previous[i]) >= tolerance);
}

// A canvas size in whole pixels: a canvas truncates a fractional width, so comparing it with an unrounded
// size (the resolution governor's steps) never matched, and the canvas was reallocated every frame.
export const canvasPx = (css, dpr) => Math.max(1, Math.round(css * dpr));

// Whether anything on the effects layer moves from frame to frame: the lymph (drops or streaks), or the
// red cells drawn there when the vessels have no WebGL. Otherwise it holds only still shapes, drawn once.
export const fxMoves = ({ lymph, flat, hide, flow }) => !!lymph || (!!flat && !hide && flow !== false);

// The dive's soft rim, in lobule radii: the scaled-down tissue's surround is opaque to `solid` and gone by `clear` (diveCopy).
export const DIVE_RIM = { solid: 1.02, clear: 1.2 };
