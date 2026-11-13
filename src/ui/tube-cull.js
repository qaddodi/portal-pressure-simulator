// Which of the Tube's rows are outside the vessel layer (10 Nov 2026, docs/recommendations/tube-renderer-speed-plan.md item P3, brief P3): a pure test, no GL.
// Zoomed in (the lobule's dive, a zoomed Anatomy) most rows lie wholly off the layer and still go through both passes. Thread D wires these two functions
// (PD part 3) so that a row whose whole box is outside the layer is left out of the buckets; this file only answers "inside or not".
//
//   rowBoxes(pts, rad, rmax, nRows, out)          every row's world box, 4 floats a row (min x, min y, max x, max y) in out.boxes
//   rowBoxesBetween(ptsA, ptsB, rad, rmax, nRows, out)   the same for a stretch between two point sets: each box holds the row's points in BOTH sets
//   rowsInside(boxes, nRows, rect, pad, out)      out[r] = 1 when row r's box, grown by pad, meets the rectangle; returns true when out changed
//   countInside(flags, nRows)                     how many rows are 1
//
// Inputs (the layouts the renderer already holds):
//   pts     the rows' points as `meshGeo().pts` holds them: the object { pts (Float32Array, the points texture: row r sample i at
//           (r * 32 + (i >> 1)) * 4 + (i & 1) * 2, x then y), on (Uint8Array, 1 for a row with points) } (veins-mesh-data.js pointsFromEntries). The bare
//           Float32Array is accepted too; then a row is off when its first and last samples are both at the origin (tube-data.js hasPoints).
//   rad     optional: the radii as the renderer's kept mirror holds them (Float32Array, RGBA texels, row r sample i at (r * N_SAMPLES + i) * 4, the radius in
//           the first float), or null.
//   rmax    the widest lumen of a row, which the box is grown by: the renderer's per-row `rowMaxR` (an array indexed by row), or one number for every row.
//           A box grows by the larger of rmax and, when `rad` is given, the row's own widest sample, so a box never ends inside its lumen.
//   rect    the world rectangle the vessel layer covers: [minX, minY, maxX, maxY] (any array-like of four numbers). The caller gives it.
//   pad     world units: the widest thing a pass draws past the lumen (glow reach, selection pad, outline, the anti-alias skirt). The caller gives it; a
//           row is kept when its box grown by pad meets the rectangle, the edge counted as meeting.
//
// A row that is off gets an empty box (min +Infinity, max -Infinity), which meets nothing, so an off row is never inside.
//
// DURING THE CHANGE BETWEEN VIEWS the points move every frame, so a box made from one frame's points is wrong the next. The caller then has two choices
// (D decides): pass `rowBoxesBetween` made once at the start of the stretch (the stretch's start and end point sets; a row's points move along a straight
// blend between the two, so each point stays inside the box of the pair, and the box holds for the whole stretch), or skip culling for the stretch
// (every row inside). Never pass boxes of the end frame alone while the points are still moving.
//
// Nothing is made after the first call for a given size: `out` is kept by the caller (`out.boxes` a Float32Array of 4 * nRows, `out.n` rows), grown only
// when too small, marked `alloc-rare`. rowsInside makes nothing at all (its `out` is a kept Uint8Array of at least nRows).
import { N_SAMPLES } from './veins-mesh.js';

export const BOX_FLOATS = 4;
const TEXELS_ROW = N_SAMPLES / 2;
const ptX = (a, row, i) => a[(row * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2];
const ptY = (a, row, i) => a[(row * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2 + 1];
const arrayOf = (p) => (p && p.pts ? p.pts : p);

/** Whether row has points: the object's `on` flag, else (a bare array) not both end samples at the origin. */
function rowOn(p, a, row) {
  if (p && p.on) return p.on[row] !== 0;
  const need = (row * TEXELS_ROW + TEXELS_ROW) * 4;
  return !!a && a.length >= need && (ptX(a, row, 0) !== 0 || ptY(a, row, 0) !== 0 || ptX(a, row, N_SAMPLES - 1) !== 0 || ptY(a, row, N_SAMPLES - 1) !== 0);
}

/** The row's growth: its rmax (array or number) or, if larger and `rad` is given, its widest sample. */
function growth(rad, rmax, row) {
  let g = typeof rmax === 'number' ? rmax : (rmax && rmax[row]) || 0;
  if (rad) {
    const base = row * N_SAMPLES * 4;
    if (rad.length >= base + N_SAMPLES * 4) for (let i = 0; i < N_SAMPLES; i++) { const v = rad[base + i * 4]; if (v > g) g = v; }
  }
  return g > 0 ? g : 0;
}

function ensure(out, nRows) {
  if (!out.boxes || out.boxes.length < nRows * BOX_FLOATS) out.boxes = new Float32Array(nRows * BOX_FLOATS);   // alloc-rare: grown with the vessel rows
  return out.boxes;
}

/** Grow `b` at o by the points of row in array a (x, y over every sample). Returns false when the array has no such row. */
function extend(b, o, a, row) {
  if (!a || a.length < (row * TEXELS_ROW + TEXELS_ROW) * 4) return false;
  let x0 = b[o], y0 = b[o + 1], x1 = b[o + 2], y1 = b[o + 3];
  for (let i = 0; i < N_SAMPLES; i++) {
    const x = ptX(a, row, i), y = ptY(a, row, i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  b[o] = x0; b[o + 1] = y0; b[o + 2] = x1; b[o + 3] = y1;
  return true;
}

/**
 * Every row's world box into out.boxes (BOX_FLOATS a row, nRows rows): the min and max of its N_SAMPLES points, grown on every side by the row's widest
 * lumen. A row that is off gets the empty box. out.n = nRows, out.on = rows with points. Returns out.
 */
export function rowBoxes(pts, rad, rmax, nRows, out) {
  return boxes(pts, null, rad, rmax, nRows, out);
}

/**
 * rowBoxes for a stretch between two point sets (the views' change: ptsA the start, ptsB the end, each as rowBoxes takes them): a row's box holds its points
 * in both sets, so it holds at every frame of the stretch while the points move between the two. A row that is on in only one set takes that set's points.
 */
export function rowBoxesBetween(ptsA, ptsB, rad, rmax, nRows, out) {
  return boxes(ptsA, ptsB, rad, rmax, nRows, out);
}

function boxes(pA, pB, rad, rmax, nRows, out) {
  const b = ensure(out, nRows), a = arrayOf(pA), c = pB ? arrayOf(pB) : null;
  let on = 0;
  for (let r = 0; r < nRows; r++) {
    const o = r * BOX_FLOATS;
    b[o] = Infinity; b[o + 1] = Infinity; b[o + 2] = -Infinity; b[o + 3] = -Infinity;
    let any = false;
    if (rowOn(pA, a, r) && extend(b, o, a, r)) any = true;
    if (pB && rowOn(pB, c, r) && extend(b, o, c, r)) any = true;
    if (!any) continue;
    const g = growth(rad, rmax, r);
    // (The box is stored as float32, which rounds to nearest: a hair of slack, a few float32 steps of the largest coordinate, so rounding never shrinks it.)
    const big = Math.max(1, Math.abs(b[o]), Math.abs(b[o + 1]), Math.abs(b[o + 2]), Math.abs(b[o + 3])) + g, e = g + big * 4.8e-7;
    b[o] -= e; b[o + 1] -= e; b[o + 2] += e; b[o + 3] += e;
    on++;
  }
  out.n = nRows; out.on = on;
  return out;
}

/**
 * out[r] = 1 when row r's box (boxes, from rowBoxes), grown by pad on every side, meets rect ([minX, minY, maxX, maxY]); else 0. out: a kept Uint8Array of at
 * least nRows. Returns true when any entry differs from what out held, so the caller rebuckets only then. Nothing is made.
 */
export function rowsInside(boxes, nRows, rect, pad, out) {
  const rx0 = rect[0] - pad, ry0 = rect[1] - pad, rx1 = rect[2] + pad, ry1 = rect[3] + pad;   // (the box grown by pad meets rect <=> the box meets rect grown by pad)
  let changed = false;
  for (let r = 0; r < nRows; r++) {
    const o = r * BOX_FLOATS;
    const v = boxes[o] <= rx1 && boxes[o + 2] >= rx0 && boxes[o + 1] <= ry1 && boxes[o + 3] >= ry0 ? 1 : 0;   // (an empty box has min > max: it fails the tests)
    if (out[r] !== v) { out[r] = v; changed = true; }
  }
  return changed;
}

/** How many of the first nRows flags are 1. */
export function countInside(flags, nRows) {
  let n = 0;
  for (let r = 0; r < nRows; r++) if (flags[r]) n++;
  return n;
}
