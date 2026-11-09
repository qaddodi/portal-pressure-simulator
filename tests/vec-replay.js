// The vector renderer's fragment replay (workstream L, docs/recommendations/vector-renderer-plan-r1.md section 4). Not a *.test.js.
//
// Replays, in JS and for one world point, the steps a vector fragment takes on the tables the renderer uploads, and counts the work:
//   bound tests      a point against a run's contribution bound (a capsule: point-to-chord distance squared against a radius squared)
//   segment tests    one `segNear` call (a point against one segment of a vessel)
//   candidates       vessels that survive (new: a run bound the pixel is inside; old: min(d, h) < reach, the shader's slot admission, before
//                    the SLOTS cut; `kept` is what the old shader keeps)
//   joins            junction records looked at (`joinTests`) and joins that act on the pixel (`joins`: the disc covers it and two or more
//                    of the join's members are candidates)
//   walk             quadtree steps from the cell texel to the leaf (new)
// Two replays, over two kinds of tables:
//   replayOld(T, wx, wy, out)   the fixed 16-unit classification at ef44ef0, its member loop as it is (48 members, whole intervals, every
//                               member's vecNear run before the member is known to matter). T = oldTables(graph, view).
//   replayPixel(T, wx, wy, out) the adaptive hierarchy (plan revision 1, sections 2.3 and 2.4) over contract v2's tables (section 2.5):
//                               the cell texel, the quadtree to a leaf, the leaf's run references, a bound test a contribution a run, the
//                               surviving runs' segments, the joins whose disc covers the point. T = newTables(...) (a shape documented there).
// Both write into `out` (one kept record: `newCounts()`), allocate nothing per call, and return `out`.
//
// B's and C's tests use `replayPixel` to hold a shader's loop to the counts it must not exceed. The old replay is kept so the "old" column of
// docs/vector-workload.md can always be re-measured (it reads scripts/vec-old/, the frozen compiler, not the live one).
import { CELL } from '../src/ui/veins-bin.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import * as OLD from '../scripts/vec-old/vec-contract.mjs';

/** The replay's look: the contact shadow's offset (the stage's VLOOK) and the slot admission's reach (stage-vessels.js: 11, 20 with a glow lit). */
export const REPLAY_LOOK = Object.freeze({ shOff: Object.freeze([1.4, 2.8]), reachU: 11 });

/** The classes a pixel is counted under, both structures. */
export const CLASS_NAMES = Object.freeze(['empty', 'strip', 'region:join', 'region:crosstier', 'region:cross', 'region:hairpin', 'region:long', 'region:near', 'region:morph']);
export const C_EMPTY = 0, C_STRIP = 1;
const OLD_KIND_CLASS = [[OLD.K_JOIN, 2], [OLD.K_CROSSTIER, 3], [OLD.K_CROSS, 4], [OLD.K_HAIRPIN, 5], [OLD.K_LONG, 6], [OLD.K_NEAR, 7], [OLD.K_MORPH, 8]];

/** A count record (kept and written over by the replays). */
export function newCounts() {
  return { cls: 0, row: -1, leaf: -1, depth: 0, bound: 0, seg: 0, cand: 0, kept: 0, joins: 0, joinTests: 0, joinIters: 0, members: 0, walk: 0, work: 0, wide: 0, lumenD: 1e9 };
}
function clearCounts(o) {
  o.cls = 0; o.row = -1; o.leaf = -1; o.depth = 0; o.bound = 0; o.seg = 0; o.cand = 0; o.kept = 0; o.joins = 0; o.joinTests = 0; o.joinIters = 0; o.members = 0; o.walk = 0; o.work = 0; o.wide = 0; o.lumenD = 1e9;
}
/** The plan's cost model with equal weights: work = bound tests + segment tests + junction work (the disc tests and the member-mask iterations). */
export const workOf = (o) => o.bound + o.seg + o.joinTests + o.joinIters;

// ── Geometry shared by both ──
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Squared distance from p to the segment a→b. */
export function pointSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const h = L2 > 1e-12 ? clamp01(((px - ax) * dx + (py - ay) * dy) / L2) : 0;
  const ex = ax + dx * h - px, ey = ay + dy * h - py;
  return ex * ex + ey * ey;
}

// ═══════════════════════════════ The old structure ═══════════════════════════════

/**
 * Tables for replayOld: the frozen compiler's graph (rows' points and radii) and its compiled view (cells, regions, grid).
 * graph: scripts/vec-old/vec-graph.mjs createVecGraph() after fromBins/attrs/radii; view: scripts/vec-old/vec-compile.mjs createVecCompiler().build(...).
 */
export function oldTables(graph, view) {
  return { kind: 'old', graph, cells: view.cells, regions: view.regions, gridO: view.gridO, gridN: view.gridN, cs: view.cellSize, look: REPLAY_LOOK, stats: view.stats };
}

// The signed distances of the nearest point of a vessel row, over segments i0 … i1 (at most WIN_MAX, as vecNearMore loops): [d (lumen), h (shadow)].
const NEAR = { d: 0, h: 0 };
function nearOld(graph, row, i0, i1, px, py, psx, psy, acc, counts) {
  let bd = acc.d, bs = acc.h;
  const P = graph.pts, R = graph.rad;
  for (let k = 0; k < OLD.WIN_MAX; k++) {
    const j = i0 + k;
    if (j > i1 || j > N_SAMPLES - 2) break;
    counts.seg++;
    const o = (row * N_SAMPLES + j) * 2, ax = P[o], ay = P[o + 1], bx = P[o + 2], by = P[o + 3];
    const r0 = R[row * N_SAMPLES + j], r1 = R[row * N_SAMPLES + j + 1];
    const dx = bx - ax, dy = by - ay, L2 = Math.max(dx * dx + dy * dy, 1e-8);
    let h = ((px - ax) * dx + (py - ay) * dy) / L2; h = clamp01(h);
    const qx = px - ax - dx * h, qy = py - ay - dy * h;
    const d = Math.hypot(qx, qy) - (r0 + (r1 - r0) * h);
    if (d < bd) bd = d;
    const hs = clamp01(((psx - ax) * dx + (psy - ay) * dy) / L2);
    const s = Math.hypot(psx - ax - dx * hs, psy - ay - dy * hs) - (r0 + (r1 - r0) * hs);
    if (s < bs) bs = s;
  }
  acc.d = bd; acc.h = bs;
}

const OLD_SLOT_ROW = new Int32Array(OLD.SLOTS), OLD_SLOT_KEY = new Float32Array(OLD.SLOTS), OLD_SLOT_D = new Float32Array(OLD.SLOTS), OLD_SLOT_H = new Float32Array(OLD.SLOTS);
const OLD_ACC = { d: 0, h: 0 }, OLD_MSL = new Int32Array(OLD.MAX_MEMBERS);

/**
 * One world point under the old structure, as the stretch and region fragments take it (vec-stretch-glsl.js, vec-region-glsl.js at ef44ef0).
 * px: world units per device pixel (the slot admission and the strip's early out use it). Returns `out`; out.cls is the pixel's class.
 */
export function replayOld(T, wx, wy, px, out = newCounts()) {
  clearCounts(out);
  const cx = Math.floor((wx - T.gridO[0]) / T.cs), cy = Math.floor((wy - T.gridO[1]) / T.cs);
  if (cx < 0 || cy < 0 || cx >= T.gridN[0] || cy >= T.gridN[1]) return out;
  const t = (cy * OLD.GRID_W + cx) * 4, kind = T.cells[t];
  if (kind === OLD.CELL_EMPTY) return out;
  const psx = wx - T.look.shOff[0], psy = wy - T.look.shOff[1];
  if (kind === OLD.CELL_SIMPLE) {
    // The strip's fragment: the cell test, then vecNear over the window about the strip's own sample (STRETCH_WIN each side).
    const row = T.cells[t + 1], i0 = T.cells[t + 2], i1 = T.cells[t + 3];
    let ic = i0, best = Infinity;
    for (let j = i0; j <= i1 && j <= N_SAMPLES - 2; j++) {
      const o = (row * N_SAMPLES + j) * 2, d2 = pointSeg2(wx, wy, T.graph.pts[o], T.graph.pts[o + 1], T.graph.pts[o + 2], T.graph.pts[o + 3]);
      if (d2 < best) { best = d2; ic = j; }
    }
    const lo = Math.max(i0, ic - 8), hi = Math.min(i1, ic + 8);
    OLD_ACC.d = 1e9; OLD_ACC.h = 1e9;
    nearOld(T.graph, row, lo, hi, wx, wy, psx, psy, OLD_ACC, out);
    out.cls = C_STRIP; out.row = row; out.cand = 1; out.kept = 1; out.members = 1; out.lumenD = OLD_ACC.d < 1e8 ? OLD_ACC.d : lumenDistance(T.graph, row, wx, wy);
    out.work = workOf(out);
    return out;
  }
  // A region: the member loop, every member's vecNear before it is known to matter, the nearest SLOTS kept.
  const slot = T.cells[t + 1], b = slot * OLD.REGION_TEXELS * 4, R = T.regions;
  const rk = R[b] | 0, nm = Math.min((R[b + 1] + 0.5) | 0, OLD.MAX_MEMBERS), njr = Math.min((R[b + 2] + 0.5) | 0, OLD.MAX_JOINS);
  let cls = 7;
  for (const [bit, c] of OLD_KIND_CLASS) if (rk & bit) { cls = c; break; }
  out.cls = cls; out.members = nm;
  const reach = T.look.reachU + 2 * px;
  let n = 0, cands = 0;
  for (let m = 0; m < nm; m++) {
    const mo = b + (1 + m) * 4, row = (R[mo] + 0.5) | 0, i0 = (R[mo + 1] + 0.5) | 0, i1 = (R[mo + 2] + 0.5) | 0;
    OLD_MSL[m] = -1;
    let at = -1;
    for (let s = 0; s < n; s++) if (OLD_SLOT_ROW[s] === row) at = s;
    if (at >= 0) {   // (vecNearMore: a second run of a vessel already in a slot)
      OLD_ACC.d = OLD_SLOT_D[at]; OLD_ACC.h = OLD_SLOT_H[at];
      nearOld(T.graph, row, i0, i1, wx, wy, psx, psy, OLD_ACC, out);
      OLD_SLOT_D[at] = OLD_ACC.d; OLD_SLOT_H[at] = OLD_ACC.h; OLD_SLOT_KEY[at] = OLD_ACC.d;
      continue;
    }
    OLD_ACC.d = 1e9; OLD_ACC.h = 1e9;
    nearOld(T.graph, row, i0, i1, wx, wy, psx, psy, OLD_ACC, out);
    if (Math.min(OLD_ACC.d, OLD_ACC.h) < reach) {
      cands++;
      let sl = n;
      const key = OLD_ACC.d;
      if (n === OLD.SLOTS) {
        sl = 0;
        for (let s = 1; s < OLD.SLOTS; s++) if (OLD_SLOT_KEY[s] > OLD_SLOT_KEY[sl]) sl = s;
        if (key >= OLD_SLOT_KEY[sl]) sl = -1;
      } else n++;
      if (sl >= 0) { OLD_SLOT_KEY[sl] = key; OLD_SLOT_ROW[sl] = row; OLD_SLOT_D[sl] = OLD_ACC.d; OLD_SLOT_H[sl] = OLD_ACC.h; }
    }
  }
  out.cand = cands; out.kept = n;
  if (n === 0) { out.work = workOf(out); return out; }
  if (n === 1) { out.work = workOf(out); return out; }   // (one vessel: the single path, no junction loop)
  for (let m = 0; m < nm; m++) {
    const row = (R[b + (1 + m) * 4] + 0.5) | 0;
    OLD_MSL[m] = -1;
    for (let s = 0; s < n; s++) if (OLD_SLOT_ROW[s] === row) OLD_MSL[m] = s;
  }
  for (let k = 0; k < njr; k++) {
    const ja = b + (OLD.JOIN0 + 2 * k) * 4, jb = ja + 4;
    out.joinTests++;
    const dc = Math.hypot(wx - R[ja], wy - R[ja + 1]);
    if (dc > R[ja + 3]) continue;
    const mlo = (R[jb] + 0.5) | 0, mhi = (R[jb + 2] + 0.5) | 0;
    let mask = 0, c = 0;
    for (let m = 0; m < OLD.MAX_MEMBERS; m++) {
      out.joinIters++;
      if ((m < OLD.MASK_SPLIT ? (mlo & (1 << m)) : (mhi & (1 << (m - OLD.MASK_SPLIT)))) === 0 || OLD_MSL[m] < 0) continue;
      const s = OLD_MSL[m];
      if ((mask & (1 << s)) !== 0) continue;
      mask |= 1 << s; c++;
    }
    if (c >= 2) out.joins++;
  }
  out.work = workOf(out);
  return out;
}

/** The signed distance from p to a vessel row's lumen edge (the graph's points and radii): what the BLOOD pass's strip coverage is judged by. */
export function lumenDistance(graph, row, wx, wy) {
  let best = 1e9;
  const P = graph.pts, R = graph.rad;
  for (let j = 0; j < N_SAMPLES - 1; j++) {
    const o = (row * N_SAMPLES + j) * 2, ax = P[o], ay = P[o + 1], bx = P[o + 2], by = P[o + 3];
    const dx = bx - ax, dy = by - ay, L2 = Math.max(dx * dx + dy * dy, 1e-8), h = clamp01(((wx - ax) * dx + (wy - ay) * dy) / L2);
    const d = Math.hypot(wx - ax - dx * h, wy - ay - dy * h) - (R[row * N_SAMPLES + j] + (R[row * N_SAMPLES + j + 1] - R[row * N_SAMPLES + j]) * h);
    if (d < best) best = d;
  }
  return best;
}

// ═══════════════════════════════ The adaptive hierarchy ═══════════════════════════════
//
// Tables (contract v2, plan section 2.5; flat typed arrays in the uploaded textures' own order and layouts):
//   gridO [x, y], gridN [nx, ny]       the broad index, cells of CELL world units
//   cells       Uint16Array  RGBA16UI, `gridW` (GRID_W) cells a row: R = kind (CELL_EMPTY 0, CELL_LEAF 3, CELL_NODE 4), G = leaf or node index
//   nodes       Uint32Array  RGBA32UI, one texel (4 words) a node: child q = 2·(y ≥ centre) + (x ≥ centre), each `kind << 30 | index` (0 empty, 1 leaf, 2 node)
//   leaves      Uint32Array  2 texels a leaf (8 words): t0 class, runStart, runCount, joinStart; t1 joinCount, candMax, depth, owner row or 0xffffffff
//   leafBox     Float32Array one texel a leaf: x0, y0, size, class
//   runRef      Uint32Array  `runId | bits << 24`, runId = row · RUNS_PER_ROW + k
//   joinRef     Uint32Array  join indices
//   joins       Float32Array 3 texels a join: t0 x, y, k, reach; t1 member rows (−1 none); t2 trunk, fork, fillet, 0
//   runs        Float32Array 4 texels a run, run k of row r at texel (4k + t, r), `runsW` = 4 · RUNS_PER_ROW texels a row: t0 chord a.xy b.xy; t1 radii rL rS rG rR; t2 i0 i1 flags 0; t3 morph box
//   consts      { gridW, runsPerRow, leafClass: { SINGLE, LAYERED, CROSS, JOIN, WIDE, MORPH }, bits: { LUMEN, SHADOW, GLOW, RING, JOIN }, cellLeaf, cellNode }
// Until A and K's modules are in, these are the contract's own words; `newTables` builds them from whatever those modules export.
export const K_NEW = Object.freeze({
  gridW: 256, runsPerRow: 16, cellLeaf: 3, cellNode: 4,
  leafClass: Object.freeze({ SINGLE: 1, LAYERED: 2, CROSS: 3, JOIN: 4, WIDE: 5, MORPH: 6 }),
  bits: Object.freeze({ LUMEN: 1, SHADOW: 2, GLOW: 4, RING: 8, JOIN: 16 }),
});
/** Leaf class → the pixel class names (index into CLASS_NAMES is not used for the new structure: see NEW_CLASS_NAMES). */
export const NEW_CLASS_NAMES = Object.freeze(['empty', 'L_SINGLE', 'L_LAYERED', 'L_CROSS', 'L_JOIN', 'L_WIDE', 'L_MORPH']);

/** Walks the quadtree under a cell, as vec-hier-glsl.js does and K's leafAt mirrors: returns the leaf index, or −1 (an empty child). Steps in out.walk, depth in out.depth. */
export function leafOf(T, wx, wy, out) {
  const K = T.consts ?? K_NEW, cs = T.cs ?? CELL;
  const cx = Math.floor((wx - T.gridO[0]) / cs), cy = Math.floor((wy - T.gridO[1]) / cs);
  out.walk = 0; out.depth = 0;
  if (cx < 0 || cy < 0 || cx >= T.gridN[0] || cy >= T.gridN[1]) return -1;
  const t = (cy * K.gridW + cx) * 4, kind = T.cells[t], id = T.cells[t + 1];
  if (kind === K.cellLeaf) return id;
  if (kind !== K.cellNode) return -1;
  let node = id, x0 = T.gridO[0] + cx * cs, y0 = T.gridO[1] + cy * cs, size = cs;
  for (let level = 0; level < 32; level++) {
    out.walk++;
    const half = size / 2, mx = x0 + half, my = y0 + half;   // (the centre by exact halving from the cell's corner)
    const q = (wy >= my ? 2 : 0) + (wx >= mx ? 1 : 0);
    const e = T.nodes[node * 4 + q], ek = e >>> 30, ei = e & 0x3fffffff;
    if (ek === 0) return -1;
    out.depth = level + 1;
    if (ek === 1) return ei;
    node = ei; size = half;
    if (q & 1) x0 = mx;
    if (q & 2) y0 = my;
  }
  return -1;
}

const NEW_ROWS = new Int32Array(256), NEW_MASK = new Uint8Array(256);   // (candidate rows of one pixel, and the contributions each survived)

/**
 * One world point under the adaptive hierarchy: the quadtree walk, the leaf's runs each tested against the bound of every contribution its
 * bits list, `vecNear` (4 segments a run) over the surviving runs, the joins whose disc covers the point. Returns `out`.
 * px: world units per device pixel (the antialiasing width in the bounds is the table's own; px is accepted for the shape of the call).
 */
export function replayPixel(T, wx, wy, px = 1, out = newCounts()) {
  clearCounts(out);
  const K = T.consts ?? K_NEW, look = T.look ?? REPLAY_LOOK;
  const leaf = leafOf(T, wx, wy, out);
  if (leaf < 0) return out;
  const L = leaf * 8, cls = T.leaves[L], runStart = T.leaves[L + 1], runCount = T.leaves[L + 2], joinStart = T.leaves[L + 3], joinCount = T.leaves[L + 4];
  out.cls = cls; out.leaf = leaf; out.wide = cls === K.leafClass.WIDE ? 1 : 0;
  if (cls === K.leafClass.SINGLE) out.row = T.leaves[L + 7];
  const psx = wx - look.shOff[0], psy = wy - look.shOff[1];
  let nc = 0;
  const rpr = K.runsPerRow, rw = rpr * 4;
  for (let q = 0; q < runCount; q++) {
    const ref = T.runRef[runStart + q], id = ref & 0xffffff, bits = ref >>> 24, row = (id / rpr) | 0, k = id - row * rpr;
    const o = (row * rw + k * 4) * 4, ax = T.runs[o], ay = T.runs[o + 1], bx = T.runs[o + 2], by = T.runs[o + 3];
    let hit = 0;
    if (bits & K.bits.LUMEN) { out.bound++; const r = T.runs[o + 4]; if (pointSeg2(wx, wy, ax, ay, bx, by) <= r * r) hit |= K.bits.LUMEN; }
    if (bits & K.bits.SHADOW) { out.bound++; const r = T.runs[o + 5]; if (pointSeg2(psx, psy, ax, ay, bx, by) <= r * r) hit |= K.bits.SHADOW; }
    if (bits & K.bits.GLOW) { out.bound++; const r = T.runs[o + 6]; if (pointSeg2(wx, wy, ax, ay, bx, by) <= r * r) hit |= K.bits.GLOW; }
    if (bits & K.bits.RING) { out.bound++; const r = T.runs[o + 7]; if (pointSeg2(wx, wy, ax, ay, bx, by) <= r * r) hit |= K.bits.RING; }
    if (!hit) continue;
    out.seg += Math.max(0, Math.min(T.runs[o + 9], N_SAMPLES - 2) - T.runs[o + 8] + 1);   // (run t2: i0, i1)
    let at = -1;
    for (let s = 0; s < nc; s++) if (NEW_ROWS[s] === row) { at = s; break; }
    if (at < 0 && nc < NEW_ROWS.length) { at = nc++; NEW_ROWS[at] = row; NEW_MASK[at] = 0; }
    if (at >= 0) NEW_MASK[at] |= hit;
  }
  out.cand = nc;
  if (cls === K.leafClass.SINGLE && T.graph && nc > 0) out.lumenD = lumenDistance(T.graph, NEW_ROWS[0], wx, wy);   // (for the blood-only frame's strip share; not counted as work)
  if (nc > 1 || joinCount > 0) {
    for (let q = 0; q < joinCount; q++) {
      const j = T.joinRef[joinStart + q], o = j * 12;
      out.joinTests++;
      const dc = Math.hypot(wx - T.joins[o], wy - T.joins[o + 1]);
      if (dc > T.joins[o + 3] + T.joins[o + 2]) continue;   // (the disc: its reach + the fillet's blend width)
      let c = 0;
      for (let m = 0; m < 4; m++) {
        const mr = T.joins[o + 4 + m];
        out.joinIters++;
        if (mr < 0) continue;
        for (let s = 0; s < nc; s++) if (NEW_ROWS[s] === mr) { c++; break; }
      }
      if (c >= 2) out.joins++;
    }
  }
  out.kept = nc;
  out.work = workOf(out);
  return out;
}

// ═══════════════════════════════ Aggregates ═══════════════════════════════

/** A running summary of one count over many pixels: n, sum, max, and a histogram for the p95 (counts are whole numbers; values past HIST are bucketed). */
const HIST = 4096;
export function newStat() { return { n: 0, sum: 0, max: 0, hist: new Uint32Array(HIST + 1) }; }
export function addStat(s, v) { s.n++; s.sum += v; if (v > s.max) s.max = v; s.hist[v > HIST ? HIST : v | 0]++; }
export function meanOf(s) { return s.n ? s.sum / s.n : 0; }
export function pctOf(s, p) { if (!s.n) return 0; const want = Math.ceil(s.n * p); let c = 0; for (let i = 0; i <= HIST; i++) { c += s.hist[i]; if (c >= want) return i; } return HIST; }

export const FIELDS = Object.freeze(['bound', 'seg', 'cand', 'kept', 'joins', 'joinTests', 'work']);
/** A class's tally: pixel count and one stat per field. */
export function newTally() { const t = { px: 0 }; for (const f of FIELDS) t[f] = newStat(); return t; }
export function addCounts(t, c) { t.px++; for (const f of FIELDS) addStat(t[f], c[f]); }
export function tallyRow(t, scale = 1) {
  const o = { px: t.px * scale };
  for (const f of FIELDS) { o[`${f}_mean`] = +meanOf(t[f]).toFixed(2); o[`${f}_p95`] = pctOf(t[f], 0.95); o[`${f}_max`] = t[f].max; }
  return o;
}
