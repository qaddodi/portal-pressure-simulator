// The free stage (16 Nov 2026, play-test, 1024 x 768): the window less the open side cards, the left action card, the top bar and
// the bottom bar. Floating pieces and sheets were each placed against the whole window, so a menu ran over the view switch, the zoom
// pill slid 412 px left for a card that ended 160 px above it, and a toast stood over the Tests card. One rect, worked out once per
// layout change from the cards' resting boxes (main.js publish), is what they all read:
//   - CSS: --fs-l, --fs-r (what the cards leave of the stage's two sides, over the whole figure), --fs-zoom-r, --fs-foot-l, --fs-foot-r,
//     --fs-top-l, --fs-top-r (the same for the band each piece stands in), --fs-t (the free stage's top), --fs-b (its bottom, from the
//     window's foot) and --fs-h (its height), all on the root;
//   - script: freeStage(), the same numbers, and clearAt(side, y0, y1) for any other band.
// A card counts only on the bands it reaches: Treat ends at y 360, so the zoom pill at y 520 to 640 does not move for it.
// Pure arithmetic, no DOM and no reads: the tests run it (tests/free-stage.test.js).

/** A side card as the free stage counts it: `side` 'l' or 'r', `c` the room it takes from that side of the window in px (its
 *  resting width plus the cards beside it nearer the edge, and the gap), `y0` and `y1` the rows it covers. */
export const sideBlock = (side, c, y0, y1) => ({ side, c, y0, y1 });

/** The room the cards take from one side over the band y0..y1 (the widest of those that reach into it). */
export function clearAt(blocks, side, y0, y1) {
  let c = 0;
  for (let i = 0; i < blocks.length; i++) {
    const k = blocks[i];
    if (k.side === side && k.c > c && k.y0 < y1 && k.y1 > y0) c = k.c;
  }
  return c;
}

/** The free stage of a W x H window: `t` the bar's foot, `b` the room under the free stage (the bottom bar and the view switch, from the
 *  window's foot), `l` and `r` over the whole stretch between them, `bands` the cards (for clearAt). */
export function freeStageOf(W, H, t, b, blocks) {
  const y0 = Math.max(0, t), y1 = Math.max(y0, H - Math.max(0, b));
  return { W, H, t: y0, b: Math.max(0, b), h: y1 - y0, l: clearAt(blocks, 'l', y0, y1), r: clearAt(blocks, 'r', y0, y1), blocks };
}

/** The free stage's left and right edges for a band, as the room to leave from each side: { l, r }. */
export const bandOf = (fs, y0, y1) => ({ l: clearAt(fs.blocks, 'l', y0, y1), r: clearAt(fs.blocks, 'r', y0, y1) });

/** The x shift, from the window's centre, that centres a piece in the free part of a band: half the difference of the two sides' room. */
export const bandShift = (fs, y0, y1) => { const { l, r } = bandOf(fs, y0, y1); return (l - r) / 2; };

/** The width a piece may take in a band (the window less the room both sides' cards take, and `margin` each side). */
export const bandWidth = (fs, y0, y1, margin = 8) => { const { l, r } = bandOf(fs, y0, y1); return Math.max(0, fs.W - l - r - 2 * margin); };

// The kept rect (main.js publish writes it; the readers below take it).
let kept = null;
export const setFreeStage = (fs) => { kept = fs; };
/** The free stage as last published (null before the first layout). */
export const freeStage = () => kept;
/** Its room for a band at the foot of the stage, just above the bottom bar: where the toasts and the credit stand. */
export const FOOT_BAND = 96;
