// A slide's reading of a number the live model also shows (16 Nov 2026, play-test: the lobule said 17.3 where the slide's words and card said
// 16.7). On a slide, a figure label that agrees with the model to within a breath shows the slide's own number (the tile's, from its
// fingerprint), so every screen prints one value; a label that has really moved (a what-if, a time-lapse) shows the live one, and the
// slide's reading follows it (stage.siteFp). One rule, one tolerance, for the anatomy's stations and the lobule's alike.

/** How far the live model may breathe from a pinned number and still read it (mmHg or the number's own unit): 8 %, never less than 0.8. */
export const breath = (v) => Math.max(0.8, Math.abs(v) * 0.08);

/** The number to show: the pinned one while `live` is within a breath of it, else `live`. */
export const readAt = (live, pinned, tol = breath(pinned)) => (Number.isFinite(pinned) && Number.isFinite(live) && Math.abs(live - pinned) < tol ? pinned : live);
