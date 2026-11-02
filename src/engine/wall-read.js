// The Wall mechanics tiles (ui/instruments.js, createVarixWall) and the explainer (explain.js): the numbers they show, so that they multiply out. Laplace's
// index is ΔP · r / w; the tiles show ΔP to one decimal, r to two and w to three (a thin wall's third digit still moves the
// index), and the index is worked out from those shown values, not from the unrounded ones, so a reader who multiplies the
// tiles gets the index shown. (Rounding the factors to different places, with the index taken from the unrounded values, left
// it off by several units: 17.3 × 3.1 / 0.4 = 134 beside an index of 150.)
const DP = 1, DR = 2, DW = 3;
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** The index alone, as a number, worked out from the shown ΔP, r and w (the engine's ratioShown; nothing made). */
export function wallIndex(ptm, r, w) {
  const p = round(Math.max(0, ptm), DP), rr = round(r, DR), ww = round(w, DW);
  return Math.round(ww > 0 ? p * rr / ww : 0) + 0;
}
// (The text of a number is made once for each value it takes: the tiles show a few hundred different values at most, and a string is
// what the page wants, so a value seen before gives back the string it had. The table is emptied if it ever grows past a few thousand.)
const TXT_P = new Map(), TXT_R = new Map(), TXT_W = new Map(), TXT_I = new Map();
const shown = (tab, v, d) => {
  let t = tab.get(v);
  if (t === undefined) { if (tab.size > 4000) tab.clear(); t = v.toFixed(d); tab.set(v, t); }   // alloc-rare: a value's text is made the first time it is shown
  return t;
};
const READ = { ptm: '', r: '', w: '', index: '' };   // (kept: the record wallRead fills and gives back)
/** v: the engine's varix() result ({ ptm, r, w }); returns the text of the four tiles (a record kept here, good until the next call). */
export function wallRead(v) {
  const ptm = round(Math.max(0, v.ptm), DP), r = round(v.r, DR), w = round(v.w, DW);
  READ.ptm = shown(TXT_P, ptm, DP); READ.r = shown(TXT_R, r, DR); READ.w = shown(TXT_W, w, DW); READ.index = shown(TXT_I, Math.round(w > 0 ? ptm * r / w : 0), 0);
  return READ;
}
