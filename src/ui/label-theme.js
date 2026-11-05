// The page's look, told to every label-gl layer (the stage's, and each caption layer's: label-captions.js makes its own). What sits above a
// layer's SVG and changes how its labels look (the theme, the palette, the glass, the presenter's and the colour map's classes, the text
// size) is written by a few places; each calls themeChanged() as it writes, and no observer on the layer's ancestors watches for it
// (5 Nov 2026, L3 P7). The ride's lb-ride on the stage view changes the leaders' layer only: rideChanged().
// (Kept free of imports, so a writer can call it without loading the renderer.)

const layers = new Set();   // alloc-rare: one entry per label-gl layer, taken out when it is disposed

/** A label-gl layer joins (`l.theme()`: its looks read again; `l.ride()`: whether the stage is in a ride, read again). Returns its removal. */
export function addLabelLayer(l) { layers.add(l); return () => { layers.delete(l); }; }

/** Something above the labels' SVGs that sets their look changed: every layer reads its labels' and marks' looks again. */
export function themeChanged() { for (const l of layers) l.theme(); }

/** The stage view's lb-ride came or went: every layer under it reads its marks' looks again (the labels' looks stay). */
export function rideChanged() { for (const l of layers) l.ride(); }
