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
//   runRefs   R32UI     LIST_W a row, ONE list for both kinds of reference (16 fragment texture units on a phone: E, 9 Nov):
//                       a leaf's run refs  runId | bits << 24, runId = row · RUNS_PER_ROW + k (one ref a run a leaf, bits OR'd, ascending runId, so the
//                       runs of one vessel are together), and its join refs  join index (ascending) at joinStart, an absolute index into this same list.
//                       `joinRefs` on the tables is the same array (a getter), kept so a reader of joinStart + i still works.
// Not in the contract yet (K asks A): LEAF_ROW, BOX_W, and the cell texel's high index word (B).
import {
  GRID_W, CELL_EMPTY, CELL_LEAF, CELL_NODE, NODE_W, MAX_DEPTH, LEAF_TEXELS, LIST_W, RUNS_PER_ROW, RUN_SEGS, RUN_TEXELS, JOIN_TEXELS,
  C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, L_CROSSTIER_BIT, SLOTS, SLOTS_WIDE, OWNER_NONE,
  NODE_KIND_EMPTY, NODE_KIND_LEAF, NODE_KIND_NODE, R_ON, BOUND_HEADROOM, LEAF_MIN_PX, LEAF_OVERHEAD, REFINE_GAIN, TOLERANCE_8BIT,
} from './vec-contract.js';
import { CELL } from './veins-bin.js';

export {
  GRID_W, CELL_EMPTY, CELL_LEAF, CELL_NODE, NODE_W, MAX_DEPTH, LEAF_TEXELS, LIST_W, RUNS_PER_ROW, RUN_SEGS, RUN_TEXELS, JOIN_TEXELS,
  C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS, SLOTS_WIDE, R_ON,
  BOUND_HEADROOM, LEAF_MIN_PX, LEAF_OVERHEAD, REFINE_GAIN, TOLERANCE_8BIT,
};
export const CELL_SIZE = CELL;
/** Bit 8 of a leaf's class word (the contract's L_CROSSTIER_BIT): a join here joins members of different tiers. */
export const CLASS_CROSSTIER = L_CROSSTIER_BIT;
export const NO_OWNER = OWNER_NONE;
export const CHILD_EMPTY = NODE_KIND_EMPTY, CHILD_LEAF = NODE_KIND_LEAF, CHILD_NODE = NODE_KIND_NODE;
/** Leaves a row of the leaf table (two texels each), and leaves a row of the leaf-box table. (Not in the contract yet: K's to A.) */
export const LEAF_ROW = 1024, BOX_W = 4096;
export const CELL_KIND_SHIFT = 30, CELL_INDEX_MASK = 0x3fffffff;

/** The tables' names, in the order the dirty report lists them. */
export const TABLES = Object.freeze(['cells', 'nodes', 'leaves', 'boxes', 'runRefs']);

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
    runRefs: new Uint32Array(0), get joinRefs() { return this.runRefs; },
    n: { leaves: 0, nodes: 0, runRefs: 0, joinRefs: 0 },   // (runRefs: the whole shared list in use; joinRefs: how many of its entries are join refs, a count only)
    resized: { cells: false, nodes: false, leaves: false, boxes: false, runRefs: false },
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

/** Makes room for `n` more entries at the end of the shared ref list; returns the first index. The caller writes them with setRunRef / setJoinRef. */
export function reserveRunRefs(p, n) { const s = p.n.runRefs; p.n.runRefs += n; growTo(p, 'runRefs', Uint32Array, p.n.runRefs); return s; }
export function reserveJoinRefs(p, n) { const s = p.n.runRefs; p.n.runRefs += n; p.n.joinRefs += n; growTo(p, 'runRefs', Uint32Array, p.n.runRefs); return s; }
export function setRunRef(p, i, runId, bits) { p.runRefs[i] = ((bits << 24) | runId) >>> 0; mark(p, 'runRefs', i / LIST_W | 0); }
export function setJoinRef(p, i, join) { p.runRefs[i] = join; mark(p, 'runRefs', i / LIST_W | 0); }

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

// ── One float texture for runs and joins (16 fragment texture units: E, 9 Nov) ──
// A's run table is RUNS_PER_ROW · RUN_TEXELS (64) texels wide, a vessel row a texel row. The joins go below it in the same texture: join j's JOIN_TEXELS (3) texels
// at x = (j % JOIN_PER_ROW) · 3 + t, y = joinRow0 + floor(j / JOIN_PER_ROW), JOIN_PER_ROW = 21 joins a row (63 of the 64 texels).
export const RUN_TABLE_W = RUNS_PER_ROW * RUN_TEXELS;
export const JOIN_PER_ROW = Math.floor(RUN_TABLE_W / JOIN_TEXELS);
/** The texel of join j's texture t (0 … JOIN_TEXELS − 1) relative to joinRow0: { x, y }. */
export const joinTexel = (j, t) => ({ x: (j % JOIN_PER_ROW) * JOIN_TEXELS + t, y: Math.floor(j / JOIN_PER_ROW) });
/**
 * Writes A's run texture data (runsOut = packRuns' { data, width, height, dirty }) and join data (joinsOut = packJoins' { data, count }, 12 floats a join) into
 * one RGBA32F table `out` = { data, width, height, joinRow0, dirty: [row0, row1] | null (null: all) } in place. The runs' dirty rows only are copied when the
 * shape did not change; the joins (a few hundred texels) always.
 */
export function combineRunJoin(out, runsOut, joinsOut) {
  const W = runsOut.width, rows = runsOut.height, jr = Math.ceil((joinsOut.count || 0) / JOIN_PER_ROW), total = rows + jr;
  let full = !out.data || out.data.length < total * W * 4 || out.joinRow0 !== rows || out.width !== W;
  if (full) { const d = new Float32Array(Math.max(total * W * 4, 4)); if (out.data && out.joinRow0 === rows) d.set(out.data.subarray(0, Math.min(out.data.length, d.length))); out.data = d; }   // alloc-rare: with the rows and joins
  out.width = W; out.height = total; out.joinRow0 = rows;
  let lo, hi;
  if (full || !runsOut.dirty) { out.data.set(runsOut.data.subarray(0, rows * W * 4)); lo = 0; hi = rows - 1; full = true; }
  else { const a = runsOut.dirty[0], b = runsOut.dirty[1]; out.data.set(runsOut.data.subarray(a * W * 4, (b + 1) * W * 4), a * W * 4); lo = a; hi = b; }
  for (let j = 0; j < (joinsOut.count || 0); j++) {
    const dst = ((rows + Math.floor(j / JOIN_PER_ROW)) * W + (j % JOIN_PER_ROW) * JOIN_TEXELS) * 4;
    for (let k = 0; k < JOIN_TEXELS * 4; k++) out.data[dst + k] = joinsOut.data[j * JOIN_TEXELS * 4 + k];
  }
  if (jr) { if (lo > rows) lo = rows; hi = total - 1; }
  out.dirty = full ? null : [lo, hi];
  return out;
}
