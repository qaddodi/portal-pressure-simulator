// The corner credit's art test, kept in the figure's own (world) coordinates instead of the screen's, so a camera move changes
// nothing in it. Pure arithmetic, no DOM: credit.js reads each shape once (its outline, its matrix inside the world, its stroke)
// and draws the grid from those; here are the matrices, the cells and the queries.
//
//   cellFor(sc)             the cell's side in world units: the largest power of two that is no more than CELL screen px at scale `sc`
//                           (so a cell is between CELL / 2 and CELL px on screen, never coarser than the screen grid this replaces)
//   regionFor(view, c, pad) the world rectangle one grid covers: the view and a margin round it, on the lattice of c-sized cells
//   cellRange(reg, q)       the cells a world box touches (clamped to the grid), [c0, c1, r0, r1]
//   boxThrough(m, …)        the world box (axis aligned) of a screen rectangle, through the inverse of the world's matrix: a turned
//                           view (the Circuit on a phone) gives the box round the turned rectangle, which only ever errs on the safe side

/** The finest the cells get on screen (px): the old screen grid's cell. */
export const CELL = 6;
/** Most cells in one grid. A view and its margin fits it at any zoom the app allows; beyond it the caller falls back to the screen grid. */
export const MAX_CELLS = 700000;

export const cellFor = (sc) => 2 ** Math.floor(Math.log2(CELL / sc));

export const multiply = (p, q) => ({ a: p.a * q.a + p.c * q.b, b: p.b * q.a + p.d * q.b, c: p.a * q.c + p.c * q.d, d: p.b * q.c + p.d * q.d, e: p.a * q.e + p.c * q.f + p.e, f: p.b * q.e + p.d * q.f + p.f });

/** The inverse of an affine matrix {a…f}, or null when it has none. */
export function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!det || !Number.isFinite(det)) return null;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}

/** The box {l, t, r, b} round rectangle (l, t)–(r, b) once every corner has gone through matrix m. Written into `into` when given. */
export function boxThrough(m, l, t, r, b, into = {}) {
  const x0 = m.a * l + m.c * t + m.e, y0 = m.b * l + m.d * t + m.f;
  const x1 = m.a * r + m.c * t + m.e, y1 = m.b * r + m.d * t + m.f;
  const x2 = m.a * l + m.c * b + m.e, y2 = m.b * l + m.d * b + m.f;
  const x3 = m.a * r + m.c * b + m.e, y3 = m.b * r + m.d * b + m.f;
  into.l = Math.min(x0, x1, x2, x3); into.r = Math.max(x0, x1, x2, x3);
  into.t = Math.min(y0, y1, y2, y3); into.b = Math.max(y0, y1, y2, y3);
  return into;
}

/**
 * The world rectangle one grid covers, on the lattice of c-sized cells: `view` (a world box) with a margin of half its own size on
 * every side (so a pan of up to half a screen, or a zoom out by up to twice, still lands inside it) and `pad` more (world units: what a
 * candidate's own padding reaches past the view). A grid over the cap gets a smaller margin, then none; null when even that is over it.
 */
export function regionFor(view, c, pad, maxCells = MAX_CELLS) {
  for (const k of [0.5, 0.25, 0]) {
    const mw = (view.r - view.l) * k + pad, mh = (view.b - view.t) * k + pad;
    const x0 = Math.floor((view.l - mw) / c) * c, y0 = Math.floor((view.t - mh) / c) * c;
    const cols = Math.ceil((view.r + mw - x0) / c) + 1, rows = Math.ceil((view.b + mh - y0) / c) + 1;
    if (cols * rows <= maxCells) return { x0, y0, cols, rows, c };
  }
  return null;
}

/** True when world box q lies wholly inside the grid's region. */
export const contains = (reg, q) => q.l >= reg.x0 && q.t >= reg.y0 && q.r <= reg.x0 + reg.cols * reg.c && q.b <= reg.y0 + reg.rows * reg.c;

/** Where a shape's box (world units, its stroke's reach included) can touch the grid at all, for skipping the shapes that cannot. */
export const touches = (reg, s) => s.r + reg.c >= reg.x0 && s.l - reg.c <= reg.x0 + reg.cols * reg.c && s.b + reg.c >= reg.y0 && s.t - reg.c <= reg.y0 + reg.rows * reg.c;

/** The cells a world box touches, clamped to the grid: [first column, last column, first row, last row] (empty when last < first). */
export function cellRange(reg, q, into = [0, 0, 0, 0]) {
  into[0] = Math.max(0, Math.floor((q.l - reg.x0) / reg.c));
  into[1] = Math.min(reg.cols - 1, Math.floor((q.r - reg.x0) / reg.c));
  into[2] = Math.max(0, Math.floor((q.t - reg.y0) / reg.c));
  into[3] = Math.min(reg.rows - 1, Math.floor((q.b - reg.y0) / reg.c));
  return into;
}

/**
 * The credit's art test over a built grid, for the view the world matrix `wm` gives: test(box, { pad, org, ves }) in wrap px
 * (wr: the wrap's client rectangle), true when the box grown by pad touches organ art (org) or vessel art (ves);
 * test.cover(box): how much art the box covers, an organ cell counting 1 and a vessel cell 3, on the old screen grid's scale.
 */
export function artTest(grid, wm, wr) {
  const { reg, org, ves } = grid, inv = invert(wm), sc = Math.hypot(wm.a, wm.b), unit = (reg.c * sc / CELL) ** 2;
  const q = {}, rg = [0, 0, 0, 0];
  const range = (box, pad) => cellRange(reg, boxThrough(inv, wr.left + box.l - pad, wr.top + box.t - pad, wr.left + box.r + pad, wr.top + box.b + pad, q), rg);
  const test = (box, { pad = 18, org: o = true, ves: v = true } = {}) => {
    const [c0, c1, r0, r1] = range(box, pad);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if ((o && org[j * reg.cols + i]) || (v && ves[j * reg.cols + i])) return true;
    return false;
  };
  test.cover = (box) => {
    const [c0, c1, r0, r1] = range(box, 0);
    let n = 0;
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) n += org[j * reg.cols + i] + 3 * ves[j * reg.cols + i];
    return n * unit;
  };
  return test;
}
