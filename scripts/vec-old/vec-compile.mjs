// FROZEN SNAPSHOT of src/ui/vec-compile.js at ef44ef0 (the fixed 16-unit classification), kept by workstream L so the workload's "old" column can always be re-measured
// after the contract moves on (docs/vector-workload.md). Only the import paths of the live modules (veins-*.js) differ. Do not edit; do not import from the app.
// The vector renderer's interaction compiler (docs/recommendations/vector-renderer-plan.md section 4; workstream A). CPU only, no GL.
//
// compileGrid(graph, reach, out)   the vessel graph's world cut into veins-bin's CELL squares, each cell classified: empty, an ordinary stretch of
//                                  ONE vessel (its row and the run of segments [i0, i1] that can reach the cell), or an interaction region (a
//                                  connected junction, a crossing, a close approach, a hairpin or a long run) listing its members and joins. The
//                                  cell texels and region texels are written in the contract's layouts (vec-contract.js) into kept typed arrays.
// recompileRows(graph, rows, out)  the cells a changed row (or a join of it) can touch, classified again; only the cells and regions that differ
//                                  are written and listed (out.changed / out.changedRegions), for the renderer core's partial uploads.
// compileMorphSet(bins, out)       the same for a swept binning (veins-sweep.js binSwept): its cell lists already hold everything that can draw
//                                  in a cell anywhere in the stretch, so a cell of one vessel is ordinary and every other cell a K_MORPH region.
// reachOf(rec, look)               how far from a centreline a vessel can change a pixel: its lumen at REACH_HEADROOM times the radius, and the
//                                  casing, shadow offset and blur, glow (up to 1.3), selection ring and hover (veins-mesh.js padOf adds the pieces).
//
// A cell is touched by a vessel when a segment of its centreline comes within that reach of the cell's SQUARE (not its centre): every pixel of the
// cell a vessel can change is then inside the vessel's list for the cell. Nothing allocates on a repeated call (`// alloc-rare:` marks the growths).
import { CELL } from '../../src/ui/veins-bin.js';
import { createVecGraph } from './vec-graph.mjs';
import { N_SAMPLES, N_QUADS, padOf } from '../../src/ui/veins-mesh.js';
import {
  GRID_PAD, GRID_W, MASK_SPLIT, CELL_EMPTY, CELL_SIMPLE, CELL_REGION, WIN_MAX, REGION_TEXELS, MAX_MEMBERS, MAX_JOINS, JOIN0, FORK_BIT,
  K_JOIN, K_CROSS, K_HAIRPIN, K_CROSSTIER, K_NEAR, K_LONG, K_MORPH, M_LUMEN, M_JOINED, M_TRUNK, REACH_HEADROOM, REACH_GLOW, REACH_SHADOW_OFF, REACH_AA,
} from './vec-contract.mjs';

export const NS = N_SAMPLES;

// ── Reach ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The look's part of a reach: the shadow's offset [x, y] (world) and the antialiased edge. The defaults hold every look. */
export const DEFAULT_LOOK = Object.freeze({ shOff: [REACH_SHADOW_OFF, 0], glow: REACH_GLOW, aa: REACH_AA });

/** A vessel's pad beyond its lumen: casing + shadow offset + glow + the antialiased edge (veins-mesh.js padOf). */
export function padReach(rec, look = DEFAULT_LOOK) { return Math.fround(padOf(rec.casing, look.shOff, look.glow, look.aa / 2)); }   // (a float32 value: the kept bound is a Float32Array, and a compare must not see its rounding as a change)

/** How far from a centreline the vessel (a graph record) can change a pixel: its largest lumen at REACH_HEADROOM times the radius now, plus the pad. */
export function reachOf(rec, look = DEFAULT_LOOK) { return rec.rmax * REACH_HEADROOM + padReach(rec, look); }

/** The reach a compile was made with, kept between compiles: per sample the radius bound, per row the pad, per join the reach bound. */
export function createReach(look = DEFAULT_LOOK) {
  return { look, rb: new Float32Array(0), pad: new Float32Array(0), padNow: new Float32Array(0), jb: new Float32Array(0), nRows: 0, nJoins: 0 };
}

function sizeReach(reach, graph) {
  if (reach.rb.length < graph.nRows * NS) {
    reach.rb = new Float32Array(graph.nRows * NS);   // alloc-rare: grown with the vessel rows
    reach.pad = new Float32Array(graph.nRows);       // alloc-rare: as above
  }
  if (reach.jb.length < graph.joins.n) reach.jb = new Float32Array(graph.joins.n);   // alloc-rare: grown with the joins
  reach.nRows = graph.nRows; reach.nJoins = graph.joins.n;
}

function refreshRow(graph, reach, r) {
  const rec = graph.rows[r];
  for (let i = 0; i < NS; i++) reach.rb[r * NS + i] = graph.rad[r * NS + i] * REACH_HEADROOM;
  reach.pad[r] = padReach(rec, reach.look);
}
const refreshJoin = (graph, reach, j) => { reach.jb[j] = graph.joins.reach[j] * REACH_HEADROOM; };

/**
 * The rows past what `out` was compiled with: a radius now over its sample's bound (REACH_HEADROOM times the radius then), a pad over the pad
 * then (the casing grew), or a join of the row whose reach is over its bound. Written into `list` (an Int32Array, at least nRows long);
 * returns how many. A row past is what recompileRows is called with.
 */
export function rowsPast(graph, out, list) {
  const reach = out.reach;
  let n = 0;
  const J = graph.joins, mark = out.sc.rowMark;
  mark.fill(0, 0, graph.nRows);
  for (let r = 0; r < graph.nRows; r++) {
    const rec = graph.rows[r];
    if (!rec.on) continue;
    let past = padReach(rec, reach.look) > reach.pad[r];
    for (let i = 0; !past && i < NS; i++) if (graph.rad[r * NS + i] > reach.rb[r * NS + i]) past = true;
    if (past && !mark[r]) { mark[r] = 1; list[n++] = r; }
  }
  for (let j = 0; j < J.n; j++) {
    if (j < out.nJoinsCompiled && J.reach[j] <= reach.jb[j]) continue;
    for (let m = 0; m < 4; m++) { const r = J.mem[j * 4 + m]; if (r >= 0 && r < graph.nRows && !mark[r]) { mark[r] = 1; list[n++] = r; } }
  }
  return n;
}

// ── Geometry ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function pointSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const h = L2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
  const ex = ax + dx * h - px, ey = ay + dy * h - py;
  return ex * ex + ey * ey;
}
/** Squared distance from segment a→b to the axis-aligned rectangle [x0, x1] × [y0, y1] (0 when they meet). */
export function segRect2(ax, ay, bx, by, x0, y0, x1, y1) {
  if ((ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) || (bx >= x0 && bx <= x1 && by >= y0 && by <= y1)) return 0;
  // Liang–Barsky: does the segment cross the rectangle?
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay)) return 0;
  // Disjoint convex sets meet nearest at an endpoint of the segment or a corner of the rectangle.
  const ex = (px, py) => { const cx = clamp(px, x0, x1), cy = clamp(py, y0, y1); return (cx - px) * (cx - px) + (cy - py) * (cy - py); };
  return Math.min(ex(ax, ay), ex(bx, by), pointSeg2(x0, y0, ax, ay, bx, by), pointSeg2(x1, y0, ax, ay, bx, by), pointSeg2(x0, y1, ax, ay, bx, by), pointSeg2(x1, y1, ax, ay, bx, by));
}
/** Squared distance between segments a→b and c→d. */
export function segSeg2(ax, ay, bx, by, cx, cy, dx, dy) {
  const r = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (r !== 0) {
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / r, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / r;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSeg2(ax, ay, cx, cy, dx, dy), pointSeg2(bx, by, cx, cy, dx, dy), pointSeg2(cx, cy, ax, ay, bx, by), pointSeg2(dx, dy, ax, ay, bx, by));
}
function discRect2(x, y, x0, y0, x1, y1) {
  const cx = clamp(x, x0, x1), cy = clamp(y, y0, y1);
  return (cx - x) * (cx - x) + (cy - y) * (cy - y);
}

// ── Kept storage ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

function grow(a, Type, n) {   // (a kept array, made longer when n needs it; what it held is kept)
  if (a.length >= n) return a;
  const b = new Type(Math.max(n, (a.length * 1.5) | 0));   // alloc-rare: every call site is a growth of a kept array
  b.set(a);
  return b;
}

function scratch(out) {
  if (out.sc) return out.sc;
  out.sc = {   // alloc-rare: once per compiled grid
    rowMark: new Uint8Array(0), tCell: new Int32Array(0), tRS: new Int32Array(0), tD: new Float32Array(0), tOrd: new Int32Array(0), nT: 0,
    jCellA: new Int32Array(0), jIdxA: new Int32Array(0), jOrd: new Int32Array(0), nJT: 0,
    cellStart: new Int32Array(0), cellEnd: new Int32Array(0), jStart: new Int32Array(0), jEnd: new Int32Array(0),
    jrun: new Int16Array(0),
    vRow: new Int32Array(256), vI0: new Int32Array(256), vI1: new Int32Array(256), vCnt: new Int32Array(256), vD: new Float32Array(256), vFlag: new Int32Array(256), vOrd: new Int32Array(256), vGap: new Int32Array(256),
    cj: new Int32Array(64), rec: new Float32Array(REGION_TEXELS * 4),
    mask: new Uint8Array(0),
  };
  return out.sc;
}

/** A kept compile's storage object: `const out = createCompiled()`, then compileGrid(graph, reach, out). */
export function createCompiled() { return { sc: null }; }

// ── Rasterising the reach into cells ─────────────────────────────────────────────────────────────────────────────────────────────

// The cell range (inclusive, clamped to the grid) a rectangle of world space touches.
function cellRange(out, wx0, wy0, wx1, wy1, box) {
  box[0] = Math.max(0, Math.floor((wx0 - out.x0) / out.cs)); box[1] = Math.max(0, Math.floor((wy0 - out.y0) / out.cs));
  box[2] = Math.min(out.nx - 1, Math.floor((wx1 - out.x0) / out.cs)); box[3] = Math.min(out.ny - 1, Math.floor((wy1 - out.y0) / out.cs));
}
const BOX = new Int32Array(4);

// The conservative cell box of a row's whole footprint (its points widened by its largest reach), into box[0..3]; false when the row draws nothing.
function footprint(graph, reach, out, r, box) {
  const rec = graph.rows[r];
  if (!rec.on) { box[0] = 0; box[1] = 0; box[2] = -1; box[3] = -1; return false; }
  let rb = 0;
  for (let i = 0; i < NS; i++) rb = Math.max(rb, reach.rb[r * NS + i]);
  const R = rb + reach.pad[r];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < NS; i++) {
    const x = graph.pts[(r * NS + i) * 2], y = graph.pts[(r * NS + i) * 2 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  cellRange(out, x0 - R, y0 - R, x1 + R, y1 + R, box);
  return true;
}
function joinBox(graph, reach, out, j, box) {
  const J = graph.joins, R = reach.jb[j];
  cellRange(out, J.x[j] - R, J.y[j] - R, J.x[j] + R, J.y[j] + R, box);
}

// The grid: the world box of every footprint, on veins-bin's cell squares, grown by GRID_PAD cells.
function gridOf(graph, reach, out) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let r = 0; r < graph.nRows; r++) {
    const rec = graph.rows[r];
    if (!rec.on) continue;
    let rb = 0;
    for (let i = 0; i < NS; i++) rb = Math.max(rb, reach.rb[r * NS + i]);
    const R = rb + reach.pad[r];
    for (let i = 0; i < NS; i++) {
      const x = graph.pts[(r * NS + i) * 2], y = graph.pts[(r * NS + i) * 2 + 1];
      x0 = Math.min(x0, x - R); x1 = Math.max(x1, x + R); y0 = Math.min(y0, y - R); y1 = Math.max(y1, y + R);
    }
  }
  const J = graph.joins;
  for (let j = 0; j < J.n; j++) { const R = reach.jb[j]; x0 = Math.min(x0, J.x[j] - R); x1 = Math.max(x1, J.x[j] + R); y0 = Math.min(y0, J.y[j] - R); y1 = Math.max(y1, J.y[j] + R); }
  if (!(x0 < Infinity)) { x0 = y0 = 0; x1 = y1 = out.cs; }
  const cs = out.cs;
  out.x0 = (Math.floor(x0 / cs) - GRID_PAD) * cs; out.y0 = (Math.floor(y0 / cs) - GRID_PAD) * cs;
  out.nx = Math.max(1, Math.ceil((x1 - out.x0) / cs) + GRID_PAD); out.ny = Math.max(1, Math.ceil((y1 - out.y0) / cs) + GRID_PAD);
  out.tooWide = out.nx > GRID_W;
}

// Pushes the (cell, row, segment) triples of every row whose footprint meets `rect` (null: all), only in cells `mask` allows (null: all).
function raster(graph, reach, out, rect) {
  const sc = out.sc, nx = out.nx;
  sc.nT = 0;
  const mask = rect ? sc.mask : null;
  for (let r = 0; r < graph.nRows; r++) {
    const rec = graph.rows[r];
    if (!rec.on) continue;
    if (rect) {
      footprint(graph, reach, out, r, BOX);
      if (BOX[2] < rect[0] || BOX[0] > rect[2] || BOX[3] < rect[1] || BOX[1] > rect[3]) continue;
    }
    const pad = reach.pad[r];
    for (let i = 0; i < N_QUADS; i++) {
      if (!graph.seg[r * N_QUADS + i]) continue;
      const o = (r * NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3];
      const Rl = Math.max(reach.rb[r * NS + i], reach.rb[r * NS + i + 1]), R = Rl + pad, R2 = R * R, Rl2 = Rl * Rl;
      cellRange(out, Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, BOX);
      for (let cy = BOX[1]; cy <= BOX[3]; cy++) for (let cx = BOX[0]; cx <= BOX[2]; cx++) {
        const c = cy * nx + cx;
        if (mask && !mask[c]) continue;
        const wx = out.x0 + cx * out.cs, wy = out.y0 + cy * out.cs;
        const d2 = segRect2(ax, ay, bx, by, wx, wy, wx + out.cs, wy + out.cs);
        if (d2 > R2) continue;
        if (sc.nT === sc.tCell.length) {
          const n = Math.max(1024, sc.nT * 2);
          sc.tCell = grow(sc.tCell, Int32Array, n); sc.tRS = grow(sc.tRS, Int32Array, n); sc.tD = grow(sc.tD, Float32Array, n);   // alloc-rare: the triples of a compile
        }
        sc.tCell[sc.nT] = c; sc.tRS[sc.nT] = r * NS + i; sc.tD[sc.nT] = d2 <= Rl2 ? -d2 - 1 : d2;   // (a negative distance: the lumen can reach this cell)
        sc.nT++;
      }
    }
  }
}

// Counting sort of the triples by cell (stable: rows ascending, segments ascending inside a cell), giving cellStart / cellEnd into sc.tOrd.
function sortTriples(out) {
  const sc = out.sc, NC = out.nx * out.ny;
  sc.cellStart = grow(sc.cellStart, Int32Array, NC + 1); sc.cellEnd = grow(sc.cellEnd, Int32Array, NC + 1);   // alloc-rare: with the grid
  sc.tOrd = grow(sc.tOrd, Int32Array, sc.nT);   // alloc-rare: with the triples
  const cnt = sc.cellEnd;
  cnt.fill(0, 0, NC);
  for (let k = 0; k < sc.nT; k++) cnt[sc.tCell[k]]++;
  let at = 0;
  for (let c = 0; c < NC; c++) { sc.cellStart[c] = at; at += cnt[c]; cnt[c] = sc.cellStart[c]; }
  for (let k = 0; k < sc.nT; k++) sc.tOrd[cnt[sc.tCell[k]]++] = k;
  // (cellEnd now holds each cell's end.)
}

// The cells a join's disc reaches (its reach bound), as (cell, join) pairs; only inside `mask` when given.
function joinCells(graph, reach, out, rect) {
  const sc = out.sc, J = graph.joins, nx = out.nx, mask = rect ? sc.mask : null;
  sc.nJT = 0;
  for (let j = 0; j < J.n; j++) {
    if (!(J.reach[j] > 0)) continue;
    joinBox(graph, reach, out, j, BOX);
    if (rect && (BOX[2] < rect[0] || BOX[0] > rect[2] || BOX[3] < rect[1] || BOX[1] > rect[3])) continue;
    const R2 = reach.jb[j] * reach.jb[j];
    for (let cy = BOX[1]; cy <= BOX[3]; cy++) for (let cx = BOX[0]; cx <= BOX[2]; cx++) {
      const c = cy * nx + cx;
      if (mask && !mask[c]) continue;
      const wx = out.x0 + cx * out.cs, wy = out.y0 + cy * out.cs;
      if (discRect2(J.x[j], J.y[j], wx, wy, wx + out.cs, wy + out.cs) > R2) continue;
      if (sc.nJT === sc.jCellA.length) {
        const n = Math.max(256, sc.nJT * 2);
        sc.jCellA = grow(sc.jCellA, Int32Array, n); sc.jIdxA = grow(sc.jIdxA, Int32Array, n);   // alloc-rare: the (cell, join) pairs of a compile
      }
      sc.jCellA[sc.nJT] = c; sc.jIdxA[sc.nJT] = j; sc.nJT++;
    }
  }
  const NC = out.nx * out.ny;
  sc.jStart = grow(sc.jStart, Int32Array, NC + 1); sc.jEnd = grow(sc.jEnd, Int32Array, NC + 1);   // alloc-rare: with the grid
  sc.jOrd = grow(sc.jOrd, Int32Array, sc.nJT);   // alloc-rare: with the pairs
  const cnt = sc.jEnd;
  cnt.fill(0, 0, NC);
  for (let k = 0; k < sc.nJT; k++) cnt[sc.jCellA[k]]++;
  let at = 0;
  for (let c = 0; c < NC; c++) { sc.jStart[c] = at; at += cnt[c]; cnt[c] = sc.jStart[c]; }
  for (let k = 0; k < sc.nJT; k++) sc.jOrd[cnt[sc.jCellA[k]]++] = k;
}

// A join member's own run: the segments within the join's reach of its centre (the end stretch the join is made on), else the nearest segment.
function joinRuns(graph, reach, out) {
  const sc = out.sc, J = graph.joins;
  sc.jrun = grow(sc.jrun, Int16Array, J.n * 8);   // alloc-rare: with the joins
  for (let j = 0; j < J.n; j++) {
    for (let m = 0; m < 4; m++) {
      const r = J.mem[j * 4 + m], o = (j * 4 + m) * 2;
      sc.jrun[o] = -1; sc.jrun[o + 1] = -1;
      if (r < 0 || r >= graph.nRows || !graph.rows[r].on) continue;
      const lim = reach.jb[j] + reach.pad[r];
      let a = 1e9, b = -1, best = Infinity, bi = 0;
      for (let i = 0; i < N_QUADS; i++) {
        if (!graph.seg[r * N_QUADS + i]) continue;
        const p = (r * NS + i) * 2, d2 = pointSeg2(J.x[j], J.y[j], graph.pts[p], graph.pts[p + 1], graph.pts[p + 2], graph.pts[p + 3]);
        if (d2 < best) { best = d2; bi = i; }
        if (d2 <= lim * lim) { if (i < a) a = i; if (i > b) b = i; }
      }
      if (b < 0) { a = b = bi; }
      sc.jrun[o] = a; sc.jrun[o + 1] = b;
    }
  }
}

// ── Classifying a cell ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const stats = (out) => (out.stats ??= {   // alloc-rare: once
  empty: 0, simple: 0, regions: 0, join: 0, cross: 0, hairpin: 0, crosstier: 0, near: 0, long: 0, morph: 0,
  maxMembers: 0, maxJoins: 0, overMembers: 0, overJoins: 0, maxSpan: 0, spanOver: 0,
});

// Moves the MAX_JOINS joins nearest the cell's square (by the distance of the join's centre from it, ties by index) to the front of sc.cj[0 .. nJ).
function keepNearestJoins(graph, out, c, nJ) {
  const sc = out.sc, J = graph.joins, cj = sc.cj, cs = out.cs;
  const wx = out.x0 + (c % out.nx) * cs, wy = out.y0 + ((c / out.nx) | 0) * cs;
  for (let a = 0; a < MAX_JOINS; a++) {   // selection of the nearest, MAX_JOINS passes over at most 64
    let best = a, bd = discRect2(J.x[cj[a]], J.y[cj[a]], wx, wy, wx + cs, wy + cs);
    for (let b = a + 1; b < nJ; b++) {
      const d = discRect2(J.x[cj[b]], J.y[cj[b]], wx, wy, wx + cs, wy + cs);
      if (d < bd || (d === bd && cj[b] < cj[best])) { bd = d; best = b; }
    }
    const t = cj[a]; cj[a] = cj[best]; cj[best] = t;
  }
}

// Builds the cell's record into sc.rec (a region) or decides it is ordinary / empty. Returns the cell texel's kind and (G, B, A) in sc.res[0..3].
const RES = new Int32Array(4);
function classify(graph, reach, out, c, st) {
  const sc = out.sc, J = graph.joins;
  // 1. The vessels that touch the cell, from its triples.
  let nV = 0;
  for (let q = sc.cellStart[c]; q < sc.cellEnd[c]; q++) {
    const k = sc.tOrd[q], rs = sc.tRS[k], r = (rs / NS) | 0, i = rs - r * NS, d = sc.tD[k];
    if (nV === 0 || sc.vRow[nV - 1] !== r) {
      if (nV === sc.vRow.length) growV(sc);
      sc.vRow[nV] = r; sc.vI0[nV] = i; sc.vI1[nV] = i; sc.vCnt[nV] = 1; sc.vD[nV] = d < 0 ? -d - 1 : d; sc.vFlag[nV] = d < 0 ? M_LUMEN : 0; nV++;
    } else {
      const v = nV - 1;
      sc.vI1[v] = i; sc.vCnt[v]++;
      const dd = d < 0 ? -d - 1 : d;
      if (dd < sc.vD[v]) sc.vD[v] = dd;
      if (d < 0) sc.vFlag[v] |= M_LUMEN;
    }
  }
  for (let v = 0; v < nV; v++) sc.vGap[v] = sc.vCnt[v] < sc.vI1[v] - sc.vI0[v] + 1 ? 1 : 0;   // (segments within reach that are not one run: the vessel folds back on itself here)
  // 2. The joins whose disc reaches the cell, and their members (a member the cell's triples do not hold is added, with the run near the join).
  let nJ = 0;
  for (let q = sc.jStart[c]; q < sc.jEnd[c]; q++) {
    if (nJ < sc.cj.length) sc.cj[nJ++] = sc.jIdxA[sc.jOrd[q]];
  }
  if (nJ > MAX_JOINS) keepNearestJoins(graph, out, c, nJ);   // more than a region lists: the MAX_JOINS nearest the cell's square (the rest are counted in stats.overJoins)
  const nJk = Math.min(nJ, MAX_JOINS);
  if (nJk > 1) sortSmall(sc.cj, nJk);
  const crossTier = nJk > 0 && joinsCrossTiers(graph, sc.cj, nJk);
  for (let jj = 0; jj < nJk; jj++) {
    const j = sc.cj[jj];
    for (let m = 0; m < 4; m++) {
      const r = J.mem[j * 4 + m];
      if (r < 0 || r >= graph.nRows || !graph.rows[r].on) continue;
      const a = sc.jrun[(j * 4 + m) * 2], b = sc.jrun[(j * 4 + m) * 2 + 1];
      let v = -1;
      for (let u = 0; u < nV; u++) if (sc.vRow[u] === r) { v = u; break; }
      if (v < 0) {
        if (nV === sc.vRow.length) growV(sc);
        v = nV++;
        sc.vRow[v] = r; sc.vI0[v] = a; sc.vI1[v] = b; sc.vCnt[v] = b - a + 1; sc.vD[v] = 0; sc.vFlag[v] = 0; sc.vGap[v] = 0;
      } else {
        if (a < sc.vI0[v]) sc.vI0[v] = a;
        if (b > sc.vI1[v]) sc.vI1[v] = b;
      }
      sc.vFlag[v] |= M_JOINED;
      if (J.trunk[j] === r) sc.vFlag[v] |= M_TRUNK;
    }
  }
  if (nV === 0) { RES[0] = CELL_EMPTY; RES[1] = RES[2] = RES[3] = 0; return null; }
  // 3. Ordinary: one vessel, no join, its segments one run of at most WIN_MAX.
  if (nV === 1 && nJk === 0 && !sc.vGap[0] && sc.vCnt[0] <= (out.winMax ?? WIN_MAX)) {
    RES[0] = CELL_SIMPLE; RES[1] = sc.vRow[0]; RES[2] = sc.vI0[0]; RES[3] = sc.vI1[0];
    return null;
  }
  // 4. A region.
  let kind = 0;
  if (nJk > 0) kind |= K_JOIN;
  if (crossTier) kind |= K_CROSSTIER;
  let spanMax = 0;
  for (let v = 0; v < nV; v++) {
    const span = sc.vI1[v] - sc.vI0[v] + 1;
    if (span > spanMax) spanMax = span;
    if (sc.vGap[v]) kind |= K_HAIRPIN; else if (span > (out.winMax ?? WIN_MAX)) kind |= K_LONG;
  }
  // Pairs not connected here by a join: lumens that can overlap are a crossing, the rest only share a reach (a close approach).
  for (let u = 0; u < nV; u++) for (let v = u + 1; v < nV; v++) {
    if (joinedHere(graph, sc.cj, nJk, sc.vRow[u], sc.vRow[v])) continue;
    kind |= lumensMeet(graph, reach, sc.vRow[u], sc.vI0[u], sc.vI1[u], sc.vRow[v], sc.vI0[v], sc.vI1[v]) ? K_CROSS : K_NEAR;
  }
  // The members: every vessel the cell holds, joined ones first and then the nearest if there are more than MAX_MEMBERS; written in row order.
  let nM = nV;
  const ord = sc.vOrd;
  for (let u = 0; u < nV; u++) ord[u] = u;
  if (nV > MAX_MEMBERS) {
    const key = (u) => ((sc.vFlag[u] & M_JOINED) ? -1e9 : 0) + sc.vD[u];
    for (let u = 1; u < nV; u++) { const x = ord[u], kx = key(x); let w = u - 1; while (w >= 0 && key(ord[w]) > kx) { ord[w + 1] = ord[w]; w--; } ord[w + 1] = x; }
    nM = MAX_MEMBERS;
  }
  for (let u = 1; u < nM; u++) { const x = ord[u]; let w = u - 1; while (w >= 0 && sc.vRow[ord[w]] > sc.vRow[x]) { ord[w + 1] = ord[w]; w--; } ord[w + 1] = x; }
  if (nV > st.maxMembers) st.maxMembers = nV;
  if (nJ > st.maxJoins) st.maxJoins = nJ;
  if (nV > MAX_MEMBERS) st.overMembers++;
  if (nJ > MAX_JOINS) st.overJoins++;
  if (spanMax > st.maxSpan) st.maxSpan = spanMax;
  if (spanMax > WIN_MAX) st.spanOver++;
  const keep = ord;
  const rec = sc.rec;
  rec.fill(0);
  let maxReach = 0;
  for (let m = 0; m < nM; m++) {
    const u = keep[m], o = (1 + m) * 4;
    rec[o] = sc.vRow[u]; rec[o + 1] = sc.vI0[u]; rec[o + 2] = sc.vI1[u]; rec[o + 3] = sc.vFlag[u];
    let rb = 0;
    for (let i = sc.vI0[u]; i <= sc.vI1[u]; i++) rb = Math.max(rb, reach.rb[sc.vRow[u] * NS + i]);
    maxReach = Math.max(maxReach, rb + reach.pad[sc.vRow[u]]);
  }
  for (let jj = 0; jj < nJk; jj++) {
    const j = sc.cj[jj], o = (JOIN0 + 2 * jj) * 4;
    let lo = 0, hi = 0, trunk = -1;
    for (let m = 0; m < nM; m++) {
      const row = rec[(1 + m) * 4];
      for (let s = 0; s < 4; s++) if (J.mem[j * 4 + s] === row) { if (m < MASK_SPLIT) lo |= 1 << m; else hi |= 1 << (m - MASK_SPLIT); if (J.trunk[j] === row) trunk = m; }
    }
    rec[o] = J.x[j]; rec[o + 1] = J.y[j]; rec[o + 2] = J.k[j]; rec[o + 3] = J.reach[j];
    rec[o + 4] = lo; rec[o + 5] = trunk >= 0 && J.fork[j] ? trunk + FORK_BIT : trunk; rec[o + 6] = hi; rec[o + 7] = J.fillet[j];
  }
  rec[0] = kind; rec[1] = nM; rec[2] = nJk; rec[3] = maxReach;
  RES[0] = CELL_REGION; RES[1] = 0; RES[2] = 0; RES[3] = 0;
  return rec;
}

function growV(sc) {
  const n = sc.vRow.length * 2;
  for (const k of ['vRow', 'vI0', 'vI1', 'vCnt', 'vFlag', 'vOrd', 'vGap']) { const a = new Int32Array(n); a.set(sc[k]); sc[k] = a; }   // alloc-rare: a cell with more vessels than any before
  const d = new Float32Array(n); d.set(sc.vD); sc.vD = d;   // alloc-rare: as above
}
function sortSmall(a, n) { for (let i = 1; i < n; i++) { const x = a[i]; let w = i - 1; while (w >= 0 && a[w] > x) { a[w + 1] = a[w]; w--; } a[w + 1] = x; } }
function joinsCrossTiers(graph, cj, nJ) {
  const J = graph.joins;
  for (let jj = 0; jj < nJ; jj++) {
    let tier = -1;
    for (let m = 0; m < 4; m++) {
      const r = J.mem[cj[jj] * 4 + m];
      if (r < 0 || r >= graph.nRows || !graph.rows[r].on) continue;
      const t = graph.rows[r].tier;
      if (tier >= 0 && t !== tier) return true;
      tier = t;
    }
  }
  return false;
}
function joinedHere(graph, cj, nJ, ra, rb) {
  const J = graph.joins;
  for (let jj = 0; jj < nJ; jj++) {
    let a = false, b = false;
    for (let m = 0; m < 4; m++) { const r = J.mem[cj[jj] * 4 + m]; if (r === ra) a = true; if (r === rb) b = true; }
    if (a && b) return true;
  }
  return false;
}
// Whether the lumens of two vessels' runs can meet (a crossing) at the compiled bound: some pair of their segments closer than the two radii.
function lumensMeet(graph, reach, ra, a0, a1, rb, b0, b1) {
  for (let i = a0; i <= a1; i++) {
    if (!graph.seg[ra * N_QUADS + i]) continue;
    const p = (ra * NS + i) * 2, Ra = Math.max(reach.rb[ra * NS + i], reach.rb[ra * NS + i + 1]);
    for (let k = b0; k <= b1; k++) {
      if (!graph.seg[rb * N_QUADS + k]) continue;
      const q = (rb * NS + k) * 2, Rb = Math.max(reach.rb[rb * NS + k], reach.rb[rb * NS + k + 1]), lim = Ra + Rb;
      if (segSeg2(graph.pts[p], graph.pts[p + 1], graph.pts[p + 2], graph.pts[p + 3], graph.pts[q], graph.pts[q + 1], graph.pts[q + 2], graph.pts[q + 3]) <= lim * lim) return true;
    }
  }
  return false;
}

// ── Writing the cells and regions ────────────────────────────────────────────────────────────────────────────────────────────

function ensureStorage(out) {
  const rows = out.ny, cellN = GRID_W * rows * 4;
  if (!out.cells || out.cells.length < cellN) out.cells = new Uint16Array(cellN);   // alloc-rare: with the grid
  out.cells.fill(0, 0, cellN);
  if (!out.regions) { out.regions = new Float32Array(64 * REGION_TEXELS * 4); out.regionCell = new Int32Array(64); out.free = new Int32Array(64); }   // alloc-rare: once
  out.nRegions = 0; out.nFree = 0;
  out.texRows = rows;
}

function newRegion(out) {
  if (out.nFree > 0) return out.free[--out.nFree];
  if (out.nRegions === out.regionCell.length) {
    const n = out.nRegions * 2;
    const R = new Float32Array(n * REGION_TEXELS * 4); R.set(out.regions); out.regions = R;   // alloc-rare: a region count over any before
    const C = new Int32Array(n); C.set(out.regionCell); out.regionCell = C;                  // alloc-rare: as above
    const F = new Int32Array(n); F.set(out.free); out.free = F;                               // alloc-rare: as above
    out.grew = true;
  }
  return out.nRegions++;
}

// Writes cell c's result (RES, and the region record `rec` when it is a region), freeing or reusing its region slot; true when anything differs.
function writeCell(out, c, rec) {
  const cx = c % out.nx, cy = (c / out.nx) | 0, t = (cy * GRID_W + cx) * 4, cells = out.cells;
  const was = cells[t], wasG = cells[t + 1];
  let slot = was === CELL_REGION ? wasG : -1;
  let changed = false;
  if (RES[0] === CELL_REGION) {
    if (slot < 0) { slot = newRegion(out); out.regionCell[slot] = t / 4; changed = true; }
    const base = slot * REGION_TEXELS * 4, R = out.regions;
    let same = !changed;
    if (same) for (let k = 0; k < REGION_TEXELS * 4; k++) if (R[base + k] !== rec[k]) { same = false; break; }
    if (!same) {
      R.set(rec, base); changed = true;
      if (out.nChangedRegions === out.changedRegions.length) { const L = new Int32Array(out.changedRegions.length * 2); L.set(out.changedRegions); out.changedRegions = L; }   // alloc-rare: a list longer than any before
      out.changedRegions[out.nChangedRegions++] = slot;
    }
    if (cells[t] !== CELL_REGION || cells[t + 1] !== slot) { cells[t] = CELL_REGION; cells[t + 1] = slot; cells[t + 2] = 0; cells[t + 3] = 0; changed = true; }
  } else {
    if (slot >= 0) {   // (a region cell no more: its slot goes back)
      if (out.nFree === out.free.length) { const F = new Int32Array(out.free.length * 2); F.set(out.free); out.free = F; }   // alloc-rare: a free list longer than any before
      out.free[out.nFree++] = slot; out.regionCell[slot] = -1; changed = true;
    }
    if (cells[t] !== RES[0] || cells[t + 1] !== RES[1] || cells[t + 2] !== RES[2] || cells[t + 3] !== RES[3]) { cells[t] = RES[0]; cells[t + 1] = RES[1]; cells[t + 2] = RES[2]; cells[t + 3] = RES[3]; changed = true; }
  }
  if (changed) {
    if (out.nChanged === out.changed.length) { const L = new Int32Array(out.changed.length * 2); L.set(out.changed); out.changed = L; }   // alloc-rare: a change list longer than any before
    out.changed[out.nChanged++] = t / 4;
  }
  return changed;
}

function tally(out) {
  const st = stats(out), cells = out.cells;
  st.empty = st.simple = st.regions = st.join = st.cross = st.hairpin = st.crosstier = st.near = st.long = st.morph = 0;
  for (let cy = 0; cy < out.ny; cy++) for (let cx = 0; cx < out.nx; cx++) {
    const t = (cy * GRID_W + cx) * 4, kd = cells[t];
    if (kd === CELL_SIMPLE) st.simple++;
    else if (kd === CELL_REGION) {
      st.regions++;
      const k = out.regions[cells[t + 1] * REGION_TEXELS * 4];
      if (k & K_JOIN) st.join++; if (k & K_CROSS) st.cross++; if (k & K_HAIRPIN) st.hairpin++; if (k & K_CROSSTIER) st.crosstier++;
      if (k & K_NEAR) st.near++; if (k & K_LONG) st.long++; if (k & K_MORPH) st.morph++;
    } else st.empty++;
  }
}

function prepare(graph, reach, out) {
  scratch(out);
  const sc = out.sc;
  sc.rowMark = grow(sc.rowMark, Uint8Array, graph.nRows);   // alloc-rare: with the vessel rows
  out.changed = out.changed || new Int32Array(256);          // alloc-rare: once
  out.changedRegions = out.changedRegions || new Int32Array(256);   // alloc-rare: once
}

/**
 * The whole grid, compiled. graph: createVecGraph() after fromBins (and attrs, radii); reach: createReach(look) (its bounds are set here from the
 * graph); out: createCompiled(), filled in place: out.x0 / y0 (the grid's world origin, gridO), nx / ny (cells across and down), out.cells
 * (Uint16Array, GRID_W × ny RGBA16UI texels: kind, vessel row | region index, i0, i1), out.regions (Float32Array, REGION_TEXELS RGBA32F texels a
 * region, nRegions regions), out.stats (counts by kind, the largest member and join counts, overMembers: regions over MAX_MEMBERS, a stop point).
 */
export function compileGrid(graph, reach, out) {
  prepare(graph, reach, out);
  out.cs = out.cell ?? CELL;
  sizeReach(reach, graph);
  const fixed = out.fixed === true && out.nx > 0;   // (tests: the bounds and the grid box as given, to compare a patched grid with a whole one)
  if (!fixed) {
    for (let r = 0; r < graph.nRows; r++) refreshRow(graph, reach, r);
    for (let j = 0; j < graph.joins.n; j++) refreshJoin(graph, reach, j);
  }
  out.reach = reach;
  if (!fixed) gridOf(graph, reach, out);
  ensureStorage(out);
  const sc = out.sc, st = stats(out);
  st.maxMembers = st.maxJoins = st.overMembers = st.overJoins = st.maxSpan = st.spanOver = 0;
  out.rowBox = grow(out.rowBox || new Int32Array(0), Int32Array, graph.nRows * 4);   // alloc-rare: with the vessel rows
  out.joinBox = grow(out.joinBox || new Int32Array(0), Int32Array, graph.joins.n * 4);   // alloc-rare: with the joins
  out.nJoinsCompiled = graph.joins.n; out.nRowsCompiled = graph.nRows;
  out.nChanged = 0; out.nChangedRegions = 0; out.grew = false; out.full = true;
  joinRuns(graph, reach, out);
  raster(graph, reach, out, null);
  sortTriples(out);
  joinCells(graph, reach, out, null);
  const NC = out.nx * out.ny;
  for (let c = 0; c < NC; c++) {
    const rec = classify(graph, reach, out, c, st);
    writeCell(out, c, rec);
  }
  for (let r = 0; r < graph.nRows; r++) footprint(graph, reach, out, r, out.rowBox.subarray(r * 4, r * 4 + 4));
  for (let j = 0; j < graph.joins.n; j++) joinBox(graph, reach, out, j, out.joinBox.subarray(j * 4, j * 4 + 4));
  tally(out);
  void sc;
  return out;
}

/**
 * The cells that the rows `rows[0 .. n)` (rows whose points, radii or attributes changed, or that a join which changed or grew past its bound
 * names) can touch, classified again, old footprint and new. Only a cell or region that comes out different is written and listed:
 * out.changed[0 .. out.nChanged) the cell texels (index cy · GRID_W + cx), out.changedRegions[0 .. out.nChangedRegions) the region slots.
 * Returns out; out.full is true when the change left the grid (or the join set differs) and the whole grid was compiled again instead.
 */
export function recompileRows(graph, rows, out, n = rows.length) {
  const reach = out.reach;
  if (graph.nRows !== out.nRowsCompiled || graph.joins.n !== out.nJoinsCompiled) return compileGrid(graph, reach, out);
  const sc = out.sc, st = stats(out);
  sizeReach(reach, graph);
  out.nChanged = 0; out.nChangedRegions = 0; out.grew = false; out.full = false;
  const NC = out.nx * out.ny;
  sc.mask = grow(sc.mask, Uint8Array, NC);   // alloc-rare: with the grid
  sc.mask.fill(0, 0, NC);
  const rect = RECT; rect[0] = 1e9; rect[1] = 1e9; rect[2] = -1; rect[3] = -1;
  const add = (b) => {
    if (b[2] < b[0] || b[3] < b[1]) return;
    for (let cy = b[1]; cy <= b[3]; cy++) for (let cx = b[0]; cx <= b[2]; cx++) sc.mask[cy * out.nx + cx] = 1;
    if (b[0] < rect[0]) rect[0] = b[0]; if (b[1] < rect[1]) rect[1] = b[1]; if (b[2] > rect[2]) rect[2] = b[2]; if (b[3] > rect[3]) rect[3] = b[3];
  };
  const J = graph.joins;
  sc.rowMark.fill(0, 0, graph.nRows);
  for (let k = 0; k < n; k++) sc.rowMark[rows[k]] = 1;
  // The rows' new bounds, and where they were and are.
  for (let k = 0; k < n; k++) {
    const r = rows[k];
    if (r < 0 || r >= graph.nRows) continue;
    add(out.rowBox.subarray(r * 4, r * 4 + 4));
    refreshRow(graph, reach, r);
    // a point of the row outside the grid: the whole grid again
    if (!footprintInside(graph, reach, out, r)) return compileGrid(graph, reach, out);
    footprint(graph, reach, out, r, BOX); add(BOX);
    out.rowBox.set(BOX, r * 4);
  }
  // The joins of those rows: their new bounds and boxes.
  for (let j = 0; j < J.n; j++) {
    let touch = false;
    for (let m = 0; m < 4; m++) { const r = J.mem[j * 4 + m]; if (r >= 0 && r < graph.nRows && sc.rowMark[r]) touch = true; }
    if (!touch) continue;
    add(out.joinBox.subarray(j * 4, j * 4 + 4));
    refreshJoin(graph, reach, j);
    joinBox(graph, reach, out, j, BOX); add(BOX);
    out.joinBox.set(BOX, j * 4);
  }
  if (rect[2] < rect[0]) return out;
  joinRuns(graph, reach, out);
  raster(graph, reach, out, rect);
  sortTriples(out);
  joinCells(graph, reach, out, rect);
  for (let cy = rect[1]; cy <= rect[3]; cy++) for (let cx = rect[0]; cx <= rect[2]; cx++) {
    const c = cy * out.nx + cx;
    if (!sc.mask[c]) continue;
    const rec = classify(graph, reach, out, c, st);
    writeCell(out, c, rec);
  }
  tally(out);
  return out;
}
const RECT = new Int32Array(4);
// Whether the row's footprint lies inside the grid.
function footprintInside(graph, reach, out, r) {
  let rb = 0;
  for (let i = 0; i < NS; i++) rb = Math.max(rb, reach.rb[r * NS + i]);
  const R = rb + reach.pad[r];
  for (let i = 0; i < NS; i++) {
    const x = graph.pts[(r * NS + i) * 2], y = graph.pts[(r * NS + i) * 2 + 1];
    if (x - R < out.x0 || y - R < out.y0 || x + R > out.x0 + out.nx * out.cs || y + R > out.y0 + out.ny * out.cs) return false;
  }
  return true;
}

// ── The partition rule, in JS ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The one formula every program uses to find a pixel's cell (the JS twin of the GLSL cell test): world = inv × (fx, fy) with inv as the uniform
 * (a, b, c, d, tx, ty: x = a · fx + c · fy + tx, y = b · fx + d · fy + ty, in float32), then cell = floor((world − gridO) / CELL). Returns the texel
 * index cy · GRID_W + cx, or −1 outside the grid.
 */
export function cellOfPixel(out, inv, fx, fy) {
  const f = Math.fround;
  const wx = f(f(f(inv[0] * fx) + f(inv[2] * fy)) + inv[4]), wy = f(f(f(inv[1] * fx) + f(inv[3] * fy)) + inv[5]);
  const cx = Math.floor(f(f(wx - out.x0) / out.cs)), cy = Math.floor(f(f(wy - out.y0) / out.cs));
  if (cx < 0 || cy < 0 || cx >= out.nx || cy >= out.ny) return -1;
  return cy * GRID_W + cx;
}
/** The kind and ids at a texel: { kind, row | region, i0, i1 }. */
export function cellAt(out, t) { const c = out.cells; return { kind: c[t * 4], id: c[t * 4 + 1], i0: c[t * 4 + 2], i1: c[t * 4 + 3] }; }
/** The cell texel containing a world point, or −1. */
export function cellOfWorld(out, x, y) {
  const cx = Math.floor((x - out.x0) / out.cs), cy = Math.floor((y - out.y0) / out.cs);
  return cx < 0 || cy < 0 || cx >= out.nx || cy >= out.ny ? -1 : cy * GRID_W + cx;
}
/** A region slot's record as a plain view: { kind, members: [{ row, i0, i1, flags }], joins: [{ x, y, k, reach, mask, trunk, fork, fillet }] }. */
export function regionOf(out, slot) {
  const R = out.regions, b = slot * REGION_TEXELS * 4, nM = R[b + 1], nJ = R[b + 2];
  const members = [], joins = [];
  for (let m = 0; m < nM; m++) { const o = b + (1 + m) * 4; members.push({ row: R[o], i0: R[o + 1], i1: R[o + 2], flags: R[o + 3] }); }
  for (let j = 0; j < nJ; j++) { const o = b + (JOIN0 + 2 * j) * 4; const t = R[o + 5], fork = t >= FORK_BIT - 0.5; joins.push({ x: R[o], y: R[o + 1], k: R[o + 2], reach: R[o + 3], mask: R[o + 4] + R[o + 6] * 2 ** MASK_SPLIT, trunk: fork ? t - FORK_BIT : t, fork, fillet: R[o + 7] }); }
  return { kind: R[b], members, joins, maxReach: R[b + 3] };
}

// ── A swept binning (the morph) ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A morph set (veins-sweep.js binSwept: bins.cells, bins.ent, bins.nCells) compiled. The swept lists already hold every segment and join that can
 * draw in a cell at ANY frame of the stretch, so a cell the lists give one vessel (one run of at most WIN_MAX segments, no join) is ordinary for
 * every frame, and any other cell is a K_MORPH region listing every vessel and join its lists name: a crossing that happens mid-change is already a
 * region. K_JOIN / K_HAIRPIN / K_LONG are set on the way; K_CROSSTIER too when `graph` (for the rows' tiers) is given. A region's join texel A
 * holds (the join's index in the frame's join rows, 0, k, reach): the shader reads the join as the frame has it (veins-sweep.js writeJoinNow).
 * Same storage and layouts as compileGrid. The grid is the lists' own cell box grown by GRID_PAD.
 */
export function compileMorphSet(bins, out, graph = null) {
  scratch(out);
  const sc = out.sc, st = stats(out);
  out.changed = out.changed || new Int32Array(256); out.changedRegions = out.changedRegions || new Int32Array(256);   // alloc-rare: once
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let c = 0; c < bins.nCells; c++) { const x = bins.cells[c * 6], y = bins.cells[c * 6 + 1]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + CELL); y1 = Math.max(y1, y + CELL); }
  if (!(x0 < Infinity)) { x0 = y0 = 0; x1 = y1 = CELL; }
  out.x0 = x0 - GRID_PAD * CELL; out.y0 = y0 - GRID_PAD * CELL;
  out.nx = Math.round((x1 - x0) / CELL) + 2 * GRID_PAD; out.ny = Math.round((y1 - y0) / CELL) + 2 * GRID_PAD;
  out.cs = CELL;
  out.tooWide = out.nx > GRID_W;
  ensureStorage(out);
  st.maxMembers = st.maxJoins = st.overMembers = st.overJoins = st.maxSpan = st.spanOver = 0;
  out.nChanged = 0; out.nChangedRegions = 0; out.grew = false; out.full = true; out.reach = null; out.nJoinsCompiled = 0; out.nRowsCompiled = 0;
  const ent = bins.ent, rec = sc.rec, nx = out.nx;
  for (let c = 0; c < bins.nCells; c++) {
    const cx = Math.round((bins.cells[c * 6] - out.x0) / CELL), cy = Math.round((bins.cells[c * 6 + 1] - out.y0) / CELL), cell = cy * nx + cx;
    const s0 = bins.cells[c * 6 + 2], sn = bins.cells[c * 6 + 3], j0 = bins.cells[c * 6 + 4], jn = bins.cells[c * 6 + 5];
    // The vessels the cell lists (a vessel can come in two stretches of the list: merged), as segment spans.
    let nV = 0, segs = 0;
    for (let e = s0; e < s0 + sn; e++) {
      const r = ent[e * 8 + 4], i = ent[e * 8 + 5];
      if (!(r >= 0)) continue;
      let v = -1;
      for (let u = nV - 1; u >= 0; u--) if (sc.vRow[u] === r) { v = u; break; }
      if (v < 0) {
        if (nV === sc.vRow.length) growV(sc);
        v = nV++;
        sc.vRow[v] = r; sc.vI0[v] = 1e9; sc.vI1[v] = -1; sc.vCnt[v] = 0; sc.vD[v] = 0; sc.vFlag[v] = M_LUMEN; sc.vGap[v] = 0;
      }
      if (i >= 0) { if (i < sc.vI0[v]) sc.vI0[v] = i; if (i > sc.vI1[v]) sc.vI1[v] = i; sc.vCnt[v]++; segs++; }
    }
    if (nV === 0) { RES[0] = CELL_EMPTY; RES[1] = RES[2] = RES[3] = 0; writeCell(out, cell, null); continue; }
    for (let v = 0; v < nV; v++) sc.vGap[v] = sc.vCnt[v] < sc.vI1[v] - sc.vI0[v] + 1 ? 1 : 0;
    if (nV === 1 && jn === 0 && sc.vI1[0] >= 0 && !sc.vGap[0] && sc.vCnt[0] <= WIN_MAX) {
      RES[0] = CELL_SIMPLE; RES[1] = sc.vRow[0]; RES[2] = sc.vI0[0]; RES[3] = sc.vI1[0];
      writeCell(out, cell, null);
      continue;
    }
    // A region. Its joins first (entry x is the join's index in the frame's rows): they name members the lists may hold no segment of here.
    let nJ = 0, crossTier = false;
    sc.cj.fill(-1);
    for (let q = j0; q < j0 + jn && nJ < MAX_JOINS; q++) {
      const ji = ent[q * 8];
      let dup = false;
      for (let k = 0; k < nJ; k++) if (ent[sc.cj[k] * 8] === ji) dup = true;
      if (dup) continue;
      sc.cj[nJ++] = q;
      let tier = -1;
      for (let s = 0; s < 4; s++) {
        const v = ent[q * 8 + 4 + s];
        if (!(v > -0.5)) continue;
        const row = Math.floor(v + 0.5);
        let u = -1;
        for (let k = 0; k < nV; k++) if (sc.vRow[k] === row) { u = k; break; }
        if (u < 0) {
          if (nV === sc.vRow.length) growV(sc);
          u = nV++;
          sc.vRow[u] = row; sc.vI0[u] = 0; sc.vI1[u] = 0; sc.vCnt[u] = 1; sc.vD[u] = 0; sc.vFlag[u] = 0; sc.vGap[u] = 0;
        }
        sc.vFlag[u] |= M_JOINED;
        if (v - row > 0.1) sc.vFlag[u] |= M_TRUNK;
        if (graph && row < graph.nRows) { const t = graph.rows[row].tier; if (tier >= 0 && t !== tier) crossTier = true; tier = t; }
      }
    }
    let kind = K_MORPH;
    if (nJ) kind |= K_JOIN;
    if (crossTier) kind |= K_CROSSTIER;
    let spanMax = 0;
    for (let u = 0; u < nV; u++) {
      const span = sc.vI1[u] - sc.vI0[u] + 1;
      spanMax = Math.max(spanMax, span);
      if (sc.vGap[u]) kind |= K_HAIRPIN; else if (span > WIN_MAX) kind |= K_LONG;
    }
    // The members: joined ones first (their order is the joins' masks'), then the rest, each by row, the most MAX_MEMBERS.
    const ord = sc.vOrd;
    for (let u = 0; u < nV; u++) ord[u] = u;
    for (let u = 1; u < nV; u++) {
      const x = ord[u], kx = (sc.vFlag[x] & M_JOINED ? -1e9 : 0) + sc.vRow[x];
      let w = u - 1;
      while (w >= 0 && (sc.vFlag[ord[w]] & M_JOINED ? -1e9 : 0) + sc.vRow[ord[w]] > kx) { ord[w + 1] = ord[w]; w--; }
      ord[w + 1] = x;
    }
    const nM = Math.min(nV, MAX_MEMBERS);
    if (nV > st.maxMembers) st.maxMembers = nV;
    if (nJ > st.maxJoins) st.maxJoins = nJ;
    if (nV > MAX_MEMBERS) st.overMembers++;
    if (spanMax > st.maxSpan) st.maxSpan = spanMax;
    if (spanMax > WIN_MAX) st.spanOver++;
    rec.fill(0);
    for (let m = 0; m < nM; m++) {
      const u = ord[m], o = (1 + m) * 4;
      rec[o] = sc.vRow[u]; rec[o + 1] = Math.max(0, sc.vI0[u]); rec[o + 2] = Math.max(0, sc.vI1[u]); rec[o + 3] = sc.vFlag[u];
    }
    for (let k = 0; k < nJ; k++) {
      const q = sc.cj[k], o = (JOIN0 + 2 * k) * 4, w = ent[q * 8 + 3], I = Math.floor(w);
      let lo = 0, hi = 0, trunk = -1, fork = 0;
      for (let s = 0; s < 4; s++) {
        const v = ent[q * 8 + 4 + s];
        if (!(v > -0.5)) continue;
        const row = Math.floor(v + 0.5);
        for (let m = 0; m < nM; m++) if (rec[(1 + m) * 4] === row) { if (m < MASK_SPLIT) lo |= 1 << m; else hi |= 1 << (m - MASK_SPLIT); if (v - row > 0.1) { trunk = m; fork = v - row > 0.3 ? 1 : 0; } }
      }
      rec[o] = ent[q * 8]; rec[o + 1] = 0; rec[o + 2] = I / 100; rec[o + 3] = ent[q * 8 + 2];
      rec[o + 4] = lo; rec[o + 5] = trunk >= 0 && fork ? trunk + FORK_BIT : trunk; rec[o + 6] = hi; rec[o + 7] = Math.min(1, Math.max(0, (w - I) / 0.99));
    }
    rec[0] = kind; rec[1] = nM; rec[2] = nJ; rec[3] = 0;
    RES[0] = CELL_REGION; RES[1] = RES[2] = RES[3] = 0;
    writeCell(out, cell, rec);
    void segs;
  }
  tally(out);
  return out;
}

// ── The compiler as the renderer core uses it ────────────────────────────────────────────────────────────────────────────────────

/**
 * graph + reach + compiled grid behind the calls the renderer core (vec-renderer.js parts.compile) makes. Every call that can change the grid
 * returns the grid view (below) or null when nothing in it changed:
 *   build(bins, nTubes, shared)  a whole binning (setGeometry): the graph made again and the whole grid compiled. `shared` = { tubeNow, radAll }
 *                                (the instance's mirrors, read in place; also remembered from earlier attrs / radii calls) so the first compile
 *                                already has the tiers and radii.
 *   patch(bins)                  a binning patched in place (patchGeometry): the rows whose points moved and the members of the joins that changed.
 *   attrs(tubeNow)               the tube attributes (setTubes): rows whose tier or casing changed are compiled again.
 *   radii(radAll)                the radii (setRadii): the rows past their compiled reach are compiled again.
 *   exceeds(row, r)              records r (N_SAMPLES radii) as the row's, and says whether they are past the compiled reach.
 *   rows(list)                   these rows compiled again.
 *   morph(bins)                  a swept binning compiled to a grid of its own (kept by the caller, one a set).
 *   current()                    the figure's grid.
 * The grid view: { cells (Uint16Array, GRID_W × rowsH RGBA16UI texels), regions (Float32Array, REGION_TEXELS RGBA32F texels a region), nRegions,
 *   gridO [x, y], gridN [w, h], rowsH, cellSize, dirtyRows ([first, last] cell texture rows written, or null), dirtyRegions ([first, last] region
 *   rows written, or null), full (the whole grid was compiled), grew (the region storage was replaced: upload it whole), changed / nChanged,
 *   changedRegions / nChangedRegions, stats, tooWide }.
 */
export function createVecCompiler(look = DEFAULT_LOOK) {
  const graph = createVecGraph(), reach = createReach(look);
  let out = createCompiled(), tubeRef = null, radRef = null, rowsBuf = new Int32Array(64), mark = new Uint8Array(0);
  function viewOf(o) {
    const v = o.view ??= { cells: null, regions: null, nRegions: 0, gridO: [0, 0], gridN: [0, 0], rowsH: 0, cellSize: CELL, dirtyRows: null, dirtyRegions: null, full: true, grew: false,
      changed: null, nChanged: 0, changedRegions: null, nChangedRegions: 0, stats: null, tooWide: false, _r: [0, 0], _g: [0, 0] };   // alloc-rare: once a grid
    v.cells = o.cells; v.regions = o.regions; v.nRegions = o.nRegions; v.gridO[0] = o.x0; v.gridO[1] = o.y0; v.gridN[0] = o.nx; v.gridN[1] = o.ny; v.rowsH = o.ny; v.cellSize = o.cs;
    v.full = o.full; v.grew = o.grew; v.changed = o.changed; v.nChanged = o.nChanged; v.changedRegions = o.changedRegions; v.nChangedRegions = o.nChangedRegions;
    v.stats = o.stats; v.tooWide = o.tooWide;
    if (o.full) { v._r[0] = 0; v._r[1] = o.ny - 1; v.dirtyRows = v._r; v._g[0] = 0; v._g[1] = Math.max(0, o.nRegions - 1); v.dirtyRegions = v._g; return v; }
    let r0 = 1e9, r1 = -1;
    for (let k = 0; k < o.nChanged; k++) { const row = (o.changed[k] / GRID_W) | 0; if (row < r0) r0 = row; if (row > r1) r1 = row; }
    v._r[0] = r0; v._r[1] = r1; v.dirtyRows = r1 >= 0 ? v._r : null;
    let g0 = 1e9, g1 = -1;
    for (let k = 0; k < o.nChangedRegions; k++) { const s = o.changedRegions[k]; if (s < g0) g0 = s; if (s > g1) g1 = s; }
    if (o.grew) { g0 = 0; g1 = Math.max(0, o.nRegions - 1); }
    v._g[0] = g0; v._g[1] = g1; v.dirtyRegions = g1 >= 0 ? v._g : null;
    return v;
  }
  const changedAny = (o) => o.full || o.grew || o.nChanged > 0 || o.nChangedRegions > 0;
  function recompile(list, n) {
    if (!n || !out.reach) return null;
    recompileRows(graph, list, out, n);
    return changedAny(out) ? viewOf(out) : null;
  }
  function take(list, n) {   // (a copy of the graph's kept row list: the next graph call writes it again)
    if (rowsBuf.length < n + graph.nRows) rowsBuf = new Int32Array((n + graph.nRows) * 2);   // alloc-rare: grown with the vessel rows
    if (mark.length < graph.nRows) mark = new Uint8Array(graph.nRows);   // alloc-rare: as above
    for (let k = 0; k < n; k++) rowsBuf[k] = list[k];
    return n;
  }
  const api = {
    graph, reach,
    build(bins, nTubes, shared = null) {
      if (shared?.tubeNow) tubeRef = shared.tubeNow;
      if (shared?.radAll) radRef = shared.radAll;
      graph.fromBins(bins, nTubes);
      if (tubeRef) graph.attrs(tubeRef);
      if (radRef) graph.radii(radRef);
      compileGrid(graph, reach, out);
      return viewOf(out);
    },
    patch(bins) {
      if (!out.reach) return null;
      graph.patch(bins);
      let n = take(graph.list, graph.n);
      mark.fill(0, 0, graph.nRows);
      for (let k = 0; k < n; k++) mark[rowsBuf[k]] = 1;
      const J = graph.joins;
      for (let q = 0; q < graph.nj; q++) for (let m = 0; m < 4; m++) {
        const r = J.mem[graph.jlist[q] * 4 + m];
        if (r >= 0 && r < graph.nRows && !mark[r]) { mark[r] = 1; if (n === rowsBuf.length) { const b = new Int32Array(n * 2); b.set(rowsBuf); rowsBuf = b; } rowsBuf[n++] = r; }   // alloc-rare: as above
      }
      return recompile(rowsBuf, n);
    },
    attrs(tubeNow) {
      tubeRef = tubeNow;
      if (!out.reach) return null;
      graph.attrs(tubeNow);
      const n = take(graph.list, graph.n);
      return recompile(rowsBuf, n);
    },
    radii(radAll) {
      radRef = radAll;
      if (!out.reach) return null;
      graph.radii(radAll);
      const n = rowsPast(graph, out, graphScratch(graph));
      return recompile(graphScratch(graph), n);
    },
    exceeds(row, r) {
      if (!out.reach || row < 0 || row >= graph.nRows) return false;
      const rec = graph.rows[row];
      let mx = 0, past = false;
      for (let i = 0; i < NS; i++) {
        const v = r[i];
        graph.rad[row * NS + i] = v;
        if (v > mx) mx = v;
        if (v > reach.rb[row * NS + i]) past = true;
      }
      rec.rmax = mx;
      return rec.on ? past : false;
    },
    rows(list, n = list.length) {
      const k = take(list, n);
      return recompile(rowsBuf, k);
    },
    morph(bins) {
      const o = createCompiled();
      compileMorphSet(bins, o, graph.nRows ? graph : null);
      return viewOf(o);
    },
    current() { return out.cells ? viewOf(out) : null; },
    get compiled() { return out; },
  };
  let scratchList = new Int32Array(0);
  function graphScratch(g) { if (scratchList.length < g.nRows) scratchList = new Int32Array(g.nRows * 2); return scratchList; }   // alloc-rare: grown with the vessel rows
  return api;
}
