// The Wall mechanics tiles (ui/instruments.js, createVarixWall) and the explainer (explain.js): the numbers they show, so that they multiply out. Laplace's
// index is ΔP · r / w; the tiles show ΔP to one decimal, r to two and w to three (a thin wall's third digit still moves the
// index), and the index is worked out from those shown values, not from the unrounded ones, so a reader who multiplies the
// tiles gets the index shown. (Rounding the factors to different places, with the index taken from the unrounded values, left
// it off by several units: 17.3 × 3.1 / 0.4 = 134 beside an index of 150.)
const DP = 1, DR = 2, DW = 3;
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** v: the engine's varix() result ({ ptm, r, w }); returns the text of the four tiles. */
export function wallRead(v) {
  const ptm = round(Math.max(0, v.ptm), DP), r = round(v.r, DR), w = round(v.w, DW);
  return { ptm: ptm.toFixed(DP), r: r.toFixed(DR), w: w.toFixed(DW), index: String(Math.round(w > 0 ? ptm * r / w : 0)) };
}
