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
// How much of the tissue (surround and all) the dive keeps at rho lobule radii from the lobule's centre.
export const rimKeep = (rho) => Math.min(1, Math.max(0, (DIVE_RIM.clear - rho) / (DIVE_RIM.clear - DIVE_RIM.solid)));
// One premultiplied [r, g, b, a] pixel of the dive's copy: the tissue (the lobule's own drawing over the surround) × keep, plus the
// lobule's own drawing × (1 − keep). That is the lobule's drawing over the surround faded by keep: the drawing itself is never faded.
export const diveRimMix = (tissue, own, keep) => tissue.map((t, i) => keep * t + (1 - keep) * own[i]);
