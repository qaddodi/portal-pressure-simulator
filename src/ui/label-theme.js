// The page's look, told to every label-gl layer (the stage's, and each caption layer's: label-captions.js makes its own). What sits above a
// layer's SVG and changes how its labels look (the theme, the palette, the glass, the presenter's and the colour map's classes, the text
// size) is written by a few places; each calls themeChanged() as it writes, and no observer on the layer's ancestors watches for it
// (5 Nov 2026, L3 P7). The ride's lb-ride on the stage view changes the leaders' layer only: rideChanged(). A write inside one label by a
// writer that does not hold its layer: labelWritten(el).
// (Kept free of imports, so a writer can call it without loading the renderer.)

const layers = new Set();   // alloc-rare: one entry per label-gl layer, taken out when it is disposed

/** A label-gl layer joins (`l.theme()`: its looks read again; `l.ride()`: whether the stage is in a ride, read again). Returns its removal. */
export function addLabelLayer(l) { layers.add(l); return () => { layers.delete(l); }; }

/** Something above the labels' SVGs that sets their look changed: every layer reads its labels' and marks' looks again. */
export function themeChanged() { for (const l of layers) l.theme(); }

/** The stage view's lb-ride came or went: every layer under it reads its marks' looks again (the labels' looks stay). */
export function rideChanged() { for (const l of layers) l.ride(); }

/** Something inside a label was written (a class, a style, its words) by a writer that does not hold its layer: the page's words landing
 *  between frames (gl-words.js, util.js putText), a menu's class, a focus ring's hold. The layer that holds `el` reads that label again; the
 *  others pass it over. (No layer observes its labels, L3 P5: a writer that holds the layer calls its dirty(el) itself.) */
export function labelWritten(el) { if (el) for (const l of layers) l.dirty?.(el); }

/** Whether any layer still has a label or mark to read or draw again (after a look change: the crossfade waits for it). */
export function labelsBusy() { for (const l of layers) if (l.busy?.()) return true; return false; }
