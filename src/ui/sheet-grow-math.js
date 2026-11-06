// The numbers of a Tests card's pull that a test can step (dock-sheet.js uses them; no page here). A pull holds each chart and what is under it
// at the place it is laid out at, measured once where it will be laid out at the stop the pull is headed for, and moves each from the one to the
// other by how far the card has grown toward that stop: every frame is between the two pictures, and the last is the landing's.

/** The share of the way to the stop, 0 to 1, in 1/500 steps: `G` the card's growth since the pull began (px), `gt` the growth that stop is (px; the
 *  other sign pulls the other way and holds at 0). */
export const growProgress = (G, gt) => Math.round(Math.min(1, Math.max(0, G / gt)) * 500) / 500;

/** Where an item is at progress p: { ty: its move down (px), sx, sy: its scales (1 for a thing that only moves) }. `dy` is its move down at the stop,
 *  `sx`/`sy` its scales there (a chart box: the stop's size over the one it is laid out at). */
export const itemAt = (dy, sx, sy, p) => ({ ty: dy * p, sx: Math.max(0.2, 1 + (sx - 1) * p), sy: Math.max(0.2, 1 + (sy - 1) * p) });

/** The opacity of the words inside a chart box, which are not stretched: gone by a sixth of the way, back by a fade at the landing. */
export const wordsOpacity = (p) => Math.max(0, 1 - p * 6);

/** The card's offset (px its content is held down) when the finger has gone `dy` (negative: up) from a card drawn `startH` tall, in a box `box` tall. */
export const pullOffset = (box, startH, dy) => Math.max(0, box - Math.max(60, startH - dy));
