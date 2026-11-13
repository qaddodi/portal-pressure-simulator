// The numbers of a Tests card's pull that a test can step (dock-sheet.js uses them; no page here).
//
// A pull between Half and Full lays the card out once, at Full, for the whole gesture, and every part of the pane is drawn at the place it has
// between where Half lays it out (a) and where Full lays it out (b), by how far the card's drawn height has gone from Half's to Full's (p):
// each chart is drawn by the GPU at its in-between size (never a stretched picture), and what is not a chart is moved there by translate. At
// p = 0 the card is the Half card exactly, at p = 1 the Full card exactly, so neither end of the gesture changes anything on the screen.
import { clamp01 } from './num.js';


/** How far the card is from Half (0) to Full (1): `h` the height it is drawn at, `hH` and `hF` Half's and Full's heights (px), in 1/1000 steps. */
export const growProgress = (h, hH, hF) => {
  const d = hF - hH;
  if (!(Math.abs(d) >= 1)) return 1;   // (the two stops lay the pane out alike: nothing moves)
  return Math.round(clamp01((h - hH) / d) * 1000) / 1000 || 0;   // (never -0)
};

/** A length at p: `a` its Half value, `b` its Full value. */
export const lerpAt = (a, b, p) => a + (b - a) * p;

/** How far a part is held from where the Full layout puts it (px), at p: `a` where Half puts it, `b` where Full does. 0 at p = 1. */
export const shiftAt = (a, b, p) => (a - b) * (1 - p);

/** The clip that cuts a part laid out `bw` × `bh` (Full) to the size it is drawn at, `lw` × `lh`, its corners rounded `rad` px (a negative
 *  inset, a part larger at Half, reaches past its box). */
export const clipAt = (bw, bh, lw, lh, rad) => `inset(0px ${r2(bw - lw)}px ${r2(bh - lh)}px 0px round ${r2(rad)}px)`;

/** A length rounded to 1/100 px (what a translate or a clip is written with). */
export const r2 = (v) => Math.round(v * 100) / 100;

/** The card's offset (px its content is held down) when the finger has gone `dy` (negative: up) from a card drawn `startH` tall, in a box `box` tall. */
export const pullOffset = (box, startH, dy) => Math.max(0, box - Math.max(60, startH - dy));
