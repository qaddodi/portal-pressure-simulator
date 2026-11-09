// The vector renderer's adaptive leaves, packed for the GPU (docs/recommendations/vector-renderer-plan-r1.md section 2.3 and 2.5; workstream K).
// CPU only, no GL. The six tables the leaf lookup (vec-hier-glsl.js) reads, as kept typed arrays in the contract v2 layouts, written in place;
// every write marks the texture rows it touches (`dirty`), so the renderer core (E) uploads only those rows (texSubImage2D) after a rebuild.
//
//   cells     RGBA16UI  GRID_W wide, one texel a cell:  R kind (CELL_EMPTY, CELL_LEAF, CELL_NODE), G index low 16 bits, B index high 16 bits, A 0
//   nodes     RGBA32UI  NODE_W wide, one texel a node:  the four children q = 2 · (y ≥ centre) + (x ≥ centre), each  kind << 30 | index
//                       (kind 0 empty, 1 leaf, 2 node, index 30 bits)
//   leaves    RGBA32UI  LEAF_ROW leaves a row, LEAF_TEXELS (2) texels a leaf, leaf l at texel (2 · (l % LEAF_ROW) + t, l / LEAF_ROW):
//                       t0  class | crossTier << 8, runStart, runCount, joinStart      t1  joinCount, candMax, depth, owner row (0xffffffff: none)
//   boxes     RGBA32F   one texel a leaf, BOX_W a row:  x0, y0, size, class (the leaf's square: the region quad's)
//   runRefs   R32UI     LIST_W a row:  runId | bits << 24, runId = row · RUNS_PER_ROW + k. One ref a run a leaf, bits OR'd; a leaf's refs run in
//                       ascending runId (so the runs of one vessel are together)
//   joinRefs  R32UI     LIST_W a row:  join index (ascending)
// Constants not in the contract yet (LEAF_ROW, BOX_W, the cell texel's high index word) are defined here and go to A for the contract.
import * as C from './vec-contract.js';
import { CELL } from './veins-bin.js';

const pick = (name, dflt) => (C[name] === undefined ? dflt : C[name]);   // (contract v2's name when A has published it, section 2.5's value until then)

export const CELL_SIZE = CELL;
export const GRID_W = pick('GRID_W', 256);
export const CELL_EMPTY = pick('CELL_EMPTY', 0), CELL_LEAF = pick('CELL_LEAF', 3), CELL_NODE = pick('CELL_NODE', 4);
export const NODE_W = pick('NODE_W', 1024);
export const MAX_DEPTH = pick('MAX_DEPTH', 6);
export const LEAF_TEXELS = pick('LEAF_TEXELS', 2);
export const LIST_W = pick('LIST_W', 4096);
export const RUNS_PER_ROW = pick('RUNS_PER_ROW', 16), RUN_SEGS = pick('RUN_SEGS', 4), RUN_TEXELS = pick('RUN_TEXELS', 4);
export const JOIN_TEXELS = pick('JOIN_TEXELS', 3);
export const C_LUMEN = pick('C_LUMEN', 1), C_SHADOW = pick('C_SHADOW', 2), C_GLOW = pick('C_GLOW', 4), C_RING = pick('C_RING', 8), C_JOIN = pick('C_JOIN', 16);
export const L_SINGLE = pick('L_SINGLE', 1), L_LAYERED = pick('L_LAYERED', 2), L_CROSS = pick('L_CROSS', 3), L_JOIN = pick('L_JOIN', 4), L_WIDE = pick('L_WIDE', 5), L_MORPH = pick('L_MORPH', 6);
/** Bit 8 of a leaf's class word: a join here joins members of different tiers (the contract's K_CROSSTIER, kept as a bit of the class word). */
export const CLASS_CROSSTIER = 256;
export const SLOTS = pick('SLOTS', 8), SLOTS_WIDE = pick('SLOTS_WIDE', 32);
/** A run's bounds are its morph box (texel 3) over the whole morph stretch, not a capsule on its chord (run flags, texel 2 .z). */
export const RUN_F_MORPH = pick('RUN_F_MORPH', 1);
export const NO_OWNER = 0xffffffff;
/** Leaves a row of the leaf table (two texels each), and leaves a row of the leaf-box table. */
export const LEAF_ROW = pick('LEAF_ROW', 1024), BOX_W = pick('BOX_W', 4096);
export const CELL_KIND_SHIFT = 30, CELL_INDEX_MASK = 0x3fffffff;
export const CHILD_EMPTY = 0, CHILD_LEAF = 1, CHILD_NODE = 2;

/** The tables' names, in the order the dirty report lists them. */
export const TABLES = Object.freeze(['cells', 'nodes', 'leaves', 'boxes', 'runRefs', 'joinRefs']);

function emptyDirty() { const d = {}; for (const t of TABLES) d[t] = { lo: -1, hi: -1 }; return d; }
function mark(p, name, row) {
  const d = p.dirty[name];
  if (d.lo < 0 || row < d.lo) d.lo = row;
  if (row > d.hi) d.hi = row;
}

/**
 * Kept storage for one hierarchy. `grid` = { x0, y0, nx, ny } is the cell grid (the compiler's: world origin of cell (0, 0) and the cells across
 * and down; x0 and y0 are multiples of CELL, so the halving below is exact). `n` counts what is in use; `resized[name]` is set when a table grew
 * (its texture is to be made again, whole); `dirty[name]` = { lo, hi } the texture rows written since the last clearDirty (lo < 0: none).
 */
export function createLeafTables() {
  return {
    grid: { x0: 0, y0: 0, nx: 0, ny: 0 },
    cells: new Uint16Array(0), nodes: new Uint32Array(0), leaves: new Uint32Array(0), boxes: new Float32Array(0),
    runRefs: new Uint32Array(0), joinRefs: new Uint32Array(0),
    n: { leaves: 0, nodes: 0, runRefs: 0, joinRefs: 0 },
    resized: { cells: false, nodes: false, leaves: false, boxes: false, runRefs: false, joinRefs: false },
    dirty: emptyDirty(),
  };
}

const rowsOf = (n, w) => Math.max(1, Math.ceil(n / w));
/** The texture size (width × rows) of a table for the counts now in use. */
export function tableSize(p, name) {
  switch (name) {
    case 'cells': return { w: GRID_W, h: Math.max(1, p.grid.ny) };
    case 'nodes': return { w: NODE_W, h: rowsOf(p.n.nodes, NODE_W) };
    case 'leaves': return { w: LEAF_ROW * LEAF_TEXELS, h: rowsOf(p.n.leaves, LEAF_ROW) };
    case 'boxes': return { w: BOX_W, h: rowsOf(p.n.leaves, BOX_W) };
    case 'runRefs': return { w: LIST_W, h: rowsOf(p.n.runRefs, LIST_W) };
    case 'joinRefs': return { w: LIST_W, h: rowsOf(p.n.joinRefs, LIST_W) };
    default: throw new Error(`vec-leaves-pack: no table ${name}`);
  }
}

function growTo(p, name, Type, len) {
  if (p[name].length >= len) return;
  const b = new Type(Math.max(len, (p[name].length * 1.5) | 0));   // alloc-rare: a table made longer, once, as the hierarchy grows
  b.set(p[name]);
  p[name] = b;
  p.resized[name] = true;
}

/** Sizes the cell table for the grid (all cells empty) and keeps the grid. */
export function packBegin(p, grid) {
  p.grid.x0 = grid.x0; p.grid.y0 = grid.y0; p.grid.nx = grid.nx; p.grid.ny = grid.ny;
  const len = GRID_W * Math.max(1, grid.ny) * 4;
  if (p.cells.length < len) { p.cells = new Uint16Array(len); p.resized.cells = true; }   // alloc-rare: sized with the grid
  p.cells.fill(0, 0, len);
  p.n.leaves = 0; p.n.nodes = 0; p.n.runRefs = 0; p.n.joinRefs = 0;
  clearDirty(p);
  for (const t of TABLES) p.resized[t] = true;   // (a new grid: every texture is made again)
}

/** Cell (cx, cy): its kind and the leaf or node index. */
export function setCell(p, cx, cy, kind, idx) {
  const o = (cy * GRID_W + cx) * 4;
  p.cells[o] = kind; p.cells[o + 1] = idx & 0xffff; p.cells[o + 2] = idx >>> 16; p.cells[o + 3] = 0;
  mark(p, 'cells', cy);
}

/** Node n, child q (0..3): kind (CHILD_*) and index. */
export function setChild(p, n, q, kind, idx) {
  if (n >= p.n.nodes) p.n.nodes = n + 1;
  growTo(p, 'nodes', Uint32Array, (n + 1) * 4);
  p.nodes[n * 4 + q] = ((kind << CELL_KIND_SHIFT) | (idx & CELL_INDEX_MASK)) >>> 0;
  mark(p, 'nodes', n / NODE_W | 0);
}

/** Leaf l: class (with the cross-tier bit), its run refs [runStart, +runCount), its join refs [joinStart, +joinCount), candMax, depth, owner row (NO_OWNER: none). */
export function setLeaf(p, l, cls, runStart, runCount, joinStart, joinCount, candMax, depth, owner) {
  if (l >= p.n.leaves) p.n.leaves = l + 1;
  growTo(p, 'leaves', Uint32Array, (l + 1) * LEAF_TEXELS * 4);
  const o = l * LEAF_TEXELS * 4;
  p.leaves[o] = cls; p.leaves[o + 1] = runStart; p.leaves[o + 2] = runCount; p.leaves[o + 3] = joinStart;
  p.leaves[o + 4] = joinCount; p.leaves[o + 5] = candMax; p.leaves[o + 6] = depth; p.leaves[o + 7] = owner >>> 0;
  mark(p, 'leaves', l / LEAF_ROW | 0);
}

/** Leaf l's square: x0, y0, size, class (the class word's low byte). */
export function setBox(p, l, x0, y0, size, cls) {
  if (l >= p.n.leaves) p.n.leaves = l + 1;
  growTo(p, 'boxes', Float32Array, (l + 1) * 4);
  const o = l * 4;
  p.boxes[o] = x0; p.boxes[o + 1] = y0; p.boxes[o + 2] = size; p.boxes[o + 3] = cls & 255;
  mark(p, 'boxes', l / BOX_W | 0);
}

/** Makes room for `n` more entries at the end of the run-ref (or join-ref) list; returns the first index. The caller writes them with setRunRef / setJoinRef. */
export function reserveRunRefs(p, n) { const s = p.n.runRefs; p.n.runRefs += n; growTo(p, 'runRefs', Uint32Array, p.n.runRefs); return s; }
export function reserveJoinRefs(p, n) { const s = p.n.joinRefs; p.n.joinRefs += n; growTo(p, 'joinRefs', Uint32Array, p.n.joinRefs); return s; }
export function setRunRef(p, i, runId, bits) { p.runRefs[i] = ((bits << 24) | runId) >>> 0; mark(p, 'runRefs', i / LIST_W | 0); }
export function setJoinRef(p, i, join) { p.joinRefs[i] = join; mark(p, 'joinRefs', i / LIST_W | 0); }

/** Forgets what was written since the last call (after the renderer core uploaded it). */
export function clearDirty(p) {
  for (const t of TABLES) { p.dirty[t].lo = -1; p.dirty[t].hi = -1; p.resized[t] = false; }
}

// ── Reading back (the CPU side of what the shader reads; tests and the compiler's checks use these) ──
export const refRun = (ref) => ref & 0xffffff;
export const refBits = (ref) => ref >>> 24;

/** Leaf l as an object: { cls, crossTier, runStart, runCount, joinStart, joinCount, candMax, depth, owner (-1: none) }. */
export function leafRead(p, l) {
  const o = l * LEAF_TEXELS * 4, w = p.leaves;
  return {
    cls: w[o] & 255, crossTier: (w[o] & CLASS_CROSSTIER) !== 0, runStart: w[o + 1], runCount: w[o + 2], joinStart: w[o + 3],
    joinCount: w[o + 4], candMax: w[o + 5], depth: w[o + 6], owner: w[o + 7] === NO_OWNER ? -1 : w[o + 7],
  };
}
