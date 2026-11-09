// The vector renderer's adaptive leaves (docs/recommendations/vector-renderer-plan-r1.md section 2.3; workstream K). CPU only, no GL.
//
// leafAt(tables, wx, wy)   the JS mirror of vecLeafAt (vec-hier-glsl.js): the leaf index at a world point, -1 for none. The same arithmetic in the
//                          same order, with every float32 step rounded (Math.fround), so a test can compare the two on any point.
// boundHit(...)            the JS mirror of vecBoundHit.
// (the builder, buildLeaves / rebuildLeaves, follows in this file)
import {
  CELL_SIZE, MAX_DEPTH, CELL_LEAF, C_LUMEN, C_SHADOW, C_GLOW, C_JOIN, RUN_TEXELS, RUNS_PER_ROW,
  CELL_KIND_SHIFT, CELL_INDEX_MASK, GRID_W,
} from './vec-leaves-pack.js';

const f = Math.fround;

/** The leaf at a world point (see vecLeafAt). `tables` = createLeafTables(): its grid, cells and nodes. */
export function leafAt(tables, wx, wy) {
  wx = f(wx); wy = f(wy);   // (the shader's world is a float32 vec2)
  const g = tables.grid;
  const cx = Math.floor(f(f(wx - g.x0) / CELL_SIZE)), cy = Math.floor(f(f(wy - g.y0) / CELL_SIZE));
  if (cx < 0 || cy < 0 || cx >= g.nx || cy >= g.ny) return -1;
  const o = (cy * GRID_W + cx) * 4, cells = tables.cells;
  const kind = cells[o];
  if (kind === 0) return -1;
  let idx = cells[o + 1] | (cells[o + 2] << 16);
  if (kind === CELL_LEAF) return idx;
  let ox = f(g.x0 + f(cx * CELL_SIZE)), oy = f(g.y0 + f(cy * CELL_SIZE)), h = f(CELL_SIZE * 0.5);
  const nodes = tables.nodes;
  for (let d = 0; d < MAX_DEPTH; d++) {
    const qx = wx >= f(ox + h) ? 1 : 0, qy = wy >= f(oy + h) ? 1 : 0;
    const ch = nodes[idx * 4 + 2 * qy + qx];
    const ck = ch >>> CELL_KIND_SHIFT, ci = ch & CELL_INDEX_MASK;
    if (ck === 0) return -1;
    if (ck === 1) return ci;
    idx = ci;
    ox = f(ox + f(qx * h)); oy = f(oy + f(qy * h)); h = f(h * 0.5);
  }
  return -1;
}

/**
 * Squared distance from a point to a run's bound for one contribution, or Infinity when the run has no bound for it (see vecBoundHit; the
 * builder compares this against the radius squared). `runs` = the run table's floats (RUN_TEXELS texels a run at (k · RUN_TEXELS + t, row),
 * RUNS_PER_ROW runs a row), `shOff` = [x, y].
 */
export function boundDist2(runs, runId, contribution, px, py, shOff) {
  const row = Math.floor(runId / RUNS_PER_ROW), k = runId % RUNS_PER_ROW;
  const base = (row * RUNS_PER_ROW * RUN_TEXELS + k * RUN_TEXELS) * 4;
  const r = runs[base + 4 + (contribution === C_LUMEN ? 0 : contribution === C_SHADOW ? 1 : contribution === C_GLOW ? 2 : 3)];
  if (contribution === C_JOIN || !(r > 0)) return Infinity;
  if (contribution === C_SHADOW) { px -= shOff[0]; py -= shOff[1]; }
  const ax = runs[base], ay = runs[base + 1], abx = runs[base + 2] - ax, aby = runs[base + 3] - ay, apx = px - ax, apy = py - ay;
  const l2 = abx * abx + aby * aby;
  const h = l2 > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby) / l2)) : 0;
  const dx = apx - abx * h, dy = apy - aby * h;
  return dx * dx + dy * dy;
}
/** Whether a point is inside a run's bound for one contribution (the mirror of vecBoundHit; the shader's float32 rounding is not replayed). */
export const boundHit = (runs, runId, contribution, px, py, shOff) => {
  if (contribution === C_JOIN) return true;
  const row = Math.floor(runId / RUNS_PER_ROW), k = runId % RUNS_PER_ROW;
  const r = runs[(row * RUNS_PER_ROW * RUN_TEXELS + k * RUN_TEXELS) * 4 + 4 + (contribution === C_LUMEN ? 0 : contribution === C_SHADOW ? 1 : contribution === C_GLOW ? 2 : 3)];
  return r > 0 && boundDist2(runs, runId, contribution, px, py, shOff) <= r * r;
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The builder: the quadtree under each 16-unit cell (plan 2.3).
//
//   const set = createLeafSet();                                  kept storage (the six GPU tables in set.tables, the lists, the scratch)
//   buildLeaves(runs, joins, grid, policy, set)                   the whole hierarchy; set.report says what it holds (classes, L_WIDE leaves, stop points)
//   rebuildLeaves(changedRuns, set, changedJoins?, nChanged?)     only the leaves the changed runs (and joins) reach, in place; set.stats says how many leaves/nodes were written
//
// `runs` is vec-runs.js's createRuns(graph) object (chord, rad, box, flags, seg, joinRunsOf, joinDisc), `joins` the graph's joins (graph.joins),
// `grid` { x0, y0, nx, ny } (gridOfRuns gives one), `policy` defaultPolicy() with any constant changed. Policy mode 'capsule' (a figure) tests
// bounds as capsules on the chord; 'box' (a morph set: runs.morphBoxes ran) tests the run's morph box, and a leaf holding several vessels or a
// join is L_MORPH.
//
// What a leaf is (the cost model, plan 2.3): a node splits into four when (a) its candidate vessels exceed SLOTS (always, down to MAX_DEPTH), or
// (b) the four children, each costed as a leaf, cost materially less than the node: cost = leafOverhead + pixels × (wBound × bound tests +
// wSeg × RUN_SEGS × the runs that survive their bounds at sample points + wJoin × the joins that cover the sample points), pixels = the leaf's
// area at the fit view (policy.fitScale device pixels a world unit). Children smaller than leafMinPx at the fit view are not made by (b). The
// decision never reads the camera, so a pinch never rebuilds anything. Nothing is ever dropped: lists are start + count into a list table.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import {
  CELL_NODE, RUN_SEGS, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS, SLOTS_WIDE, R_ON, LEAF_MIN_PX, LEAF_OVERHEAD, REFINE_GAIN,
  CLASS_CROSSTIER, NO_OWNER, CHILD_EMPTY, CHILD_LEAF, CHILD_NODE, createLeafTables, packBegin, setCell, setChild, setLeaf, setBox, reserveRunRefs,
  reserveJoinRefs, setRunRef, setJoinRef, refRun, refBits, leafRead,
} from './vec-leaves-pack.js';
import * as CONTRACT from './vec-contract.js';
import { GRID_PAD } from './vec-contract.js';
import { BOUND_HEADROOM } from './vec-leaves-pack.js';

// Revision 1.1 (plan-r1 section 2.2.1): a join's grown bound past a member's lumen and shadow bounds. A adds these two to the contract; until then the plan's numbers.
const G_JOIN = CONTRACT.G_JOIN ?? 2.2, G_JOIN_SH = CONTRACT.G_JOIN_SH ?? 1.25;
const CROSS_NEAR = 0.85;   // classic's jf: a lower-tier member is copied into the upper tier inside 0.85 R of the join

export const BOUND_EPS = 1e-3;   // (world units added to every bound when a run is listed: the shader's float32 distance must never reject what a leaf's double test kept out)
const BITS = [C_LUMEN, C_SHADOW, C_GLOW, 8];   // slot s ↔ contribution bit (lumen, shadow, glow, ring)

export const defaultPolicy = () => ({
  mode: 'capsule', maxDepth: MAX_DEPTH, slots: SLOTS, slotsWide: SLOTS_WIDE, refineGain: REFINE_GAIN, leafOverhead: LEAF_OVERHEAD, leafMinPx: LEAF_MIN_PX,
  fitScale: 2, wBound: 1, wSeg: 6, wJoin: 24, nSample: 3,
});

// ── Geometry (own copies: this file must not depend on the compiler it replaces) ──
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function pointSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const h = L2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
  const ex = ax + dx * h - px, ey = ay + dy * h - py;
  return ex * ex + ey * ey;
}
/** Squared distance from segment a→b to the rectangle [x0, x1] × [y0, y1] (0 when they meet). */
export function segRect2(ax, ay, bx, by, x0, y0, x1, y1) {
  if ((ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) || (bx >= x0 && bx <= x1 && by >= y0 && by <= y1)) return 0;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay)) return 0;
  return Math.min(pointSeg2(x0, y0, ax, ay, bx, by), pointSeg2(x1, y0, ax, ay, bx, by), pointSeg2(x0, y1, ax, ay, bx, by), pointSeg2(x1, y1, ax, ay, bx, by),
    rectPt2(ax, ay, x0, y0, x1, y1), rectPt2(bx, by, x0, y0, x1, y1));
}
function rectPt2(px, py, x0, y0, x1, y1) { const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0, dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0; return dx * dx + dy * dy; }
/** Squared distance between segments a→b and c→d. */
export function segSeg2(ax, ay, bx, by, cx, cy, dx, dy) {
  const r = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (r !== 0) {
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / r, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / r;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSeg2(ax, ay, cx, cy, dx, dy), pointSeg2(bx, by, cx, cy, dx, dy), pointSeg2(cx, cy, ax, ay, bx, by), pointSeg2(dx, dy, ax, ay, bx, by));
}

// ── Kept storage ──
const grow = (a, Type, n) => { if (a.length >= n) return a; const b = new Type(Math.max(n, (a.length * 1.5) | 0, 16)); b.set(a); return b; };   // alloc-rare: every call is a growth of a kept array

/** A list arena: per slot (a cell) start, count and capacity into one Int32Array; a list that outgrows its capacity moves to the end. */
function createLists() { return { start: new Int32Array(0), count: new Int32Array(0), cap: new Int32Array(0), data: new Int32Array(0), n: 0 }; }
function listsInit(L, nSlots) {
  L.start = new Int32Array(nSlots); L.count = new Int32Array(nSlots); L.cap = new Int32Array(nSlots); L.n = 0;   // alloc-rare: once a build
}
function listsFill(L, keys, nKeys, nSlots, stride) {   // keys: sorted Float64Array of slot * stride + value, unique
  let total = nKeys;
  L.data = new Int32Array(Math.max(16, total + (total >> 1)));   // alloc-rare: once a build
  L.count.fill(0); L.cap.fill(0);
  let i = 0, n = 0;
  while (i < nKeys) {
    const slot = Math.floor(keys[i] / stride);
    L.start[slot] = n;
    let c = 0;
    while (i < nKeys && Math.floor(keys[i] / stride) === slot) { L.data[n++] = keys[i] - slot * stride; i++; c++; }
    L.count[slot] = c; L.cap[slot] = c;
  }
  L.n = n; void nSlots;
}
function listRemove(L, slot, v) {
  const s = L.start[slot], c = L.count[slot];
  for (let i = 0; i < c; i++) if (L.data[s + i] === v) { for (let k = i; k < c - 1; k++) L.data[s + k] = L.data[s + k + 1]; L.count[slot] = c - 1; return true; }
  return false;
}
function listInsert(L, slot, v) {   // sorted, unique
  let s = L.start[slot], c = L.count[slot];
  let i = 0;
  while (i < c && L.data[s + i] < v) i++;
  if (i < c && L.data[s + i] === v) return false;
  if (c === L.cap[slot]) {   // moves to the end with room to grow
    const nc = Math.max(4, c * 2);
    L.data = grow(L.data, Int32Array, L.n + nc);
    L.data.copyWithin(L.n, s, s + c);
    s = L.n; L.start[slot] = s; L.cap[slot] = nc; L.n += nc;
  }
  for (let k = c; k > i; k--) L.data[s + k] = L.data[s + k - 1];
  L.data[s + i] = v; L.count[slot] = c + 1;
  return true;
}

export function createLeafSet() {
  return {
    tables: createLeafTables(), runs: null, joins: null, grid: null, policy: null, nIds: 0, nJoins: 0, nCells: 0,
    cap: new Float64Array(0),          // per run id, per slot (lumen, shadow, glow, ring): ax, ay, bx, by (or the morph box), radius (0: none)
    ext: new Float64Array(0),          // per run id: the world box of everything it can reach (x0, y0, x1, y1); NaN x0: the run is not drawn
    jext: new Float64Array(0),         // per join: disc x, y, r, and the box
    cg: createLists(), cj: createLists(),   // per cell: the runs whose bounds reach it, and the joins whose discs do
    lv: [], stamp: new Int32Array(0), stampN: 0,
    freeLeaves: [], freeNodes: [], nextLeaf: 0, nextNode: 0, garbage: 0,
    report: null, stats: { leavesWritten: 0, nodesWritten: 0, leavesFreed: 0, cellsTouched: 0 },
  };
}

// ── The bounds of every run ──
function loadRun(set, id) {
  const R = set.runs, pol = set.policy, o = id * 4, c = set.cap, e = set.ext;
  const on = (R.flags[id] & R_ON) !== 0;
  const sx = R.look.shOff[0], sy = R.look.shOff[1];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let s = 0; s < 4; s++) {
    const q = (id * 4 + s) * 5, r = on ? R.rad[o + s] : 0;
    if (!(r > 0)) { c[q] = c[q + 1] = c[q + 2] = c[q + 3] = c[q + 4] = 0; continue; }
    if (pol.mode === 'box') { c[q] = R.box[o]; c[q + 1] = R.box[o + 1]; c[q + 2] = R.box[o + 2]; c[q + 3] = R.box[o + 3]; c[q + 4] = r; }
    else {
      const dx = s === 1 ? sx : 0, dy = s === 1 ? sy : 0;
      c[q] = R.chord[o] + dx; c[q + 1] = R.chord[o + 1] + dy; c[q + 2] = R.chord[o + 2] + dx; c[q + 3] = R.chord[o + 3] + dy; c[q + 4] = r;
    }
    const m = pol.mode === 'box' ? BOUND_EPS : r + BOUND_EPS;
    x0 = Math.min(x0, Math.min(c[q], c[q + 2]) - m); y0 = Math.min(y0, Math.min(c[q + 1], c[q + 3]) - m);
    x1 = Math.max(x1, Math.max(c[q], c[q + 2]) + m); y1 = Math.max(y1, Math.max(c[q + 1], c[q + 3]) + m);
  }
  if (x0 === Infinity) { e[id * 4] = NaN; e[id * 4 + 1] = e[id * 4 + 2] = e[id * 4 + 3] = 0; return; }
  e[id * 4] = x0; e[id * 4 + 1] = y0; e[id * 4 + 2] = x1; e[id * 4 + 3] = y1;
}

const JD = { x: 0, y: 0, r: 0 };
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// A join's record for the builder: its disc (A's joinDisc) and the box everything it can list reaches (the disc, or 0.85 R x headroom when cross-tier),
// which members are upper (the highest tier among them) and, for a cross-tier join, each upper member's one run nearest the join's centre (the presence run).
function loadJoin(set, j) {
  const d = set.runs.joinDisc(j, JD), q = j * 7, e = set.jext, J = set.joins, R = set.runs, rows = R.graph.rows;
  let tmax = -1, tmin = Infinity;
  for (let m = 0; m < 4; m++) { const r = J.mem[j * 4 + m]; if (r >= 0) { tmax = Math.max(tmax, rows[r].tier); tmin = Math.min(tmin, rows[r].tier); } }
  const cross = tmax !== tmin;
  set.jCross[j] = cross ? 1 : 0;
  for (let m = 0; m < 4; m++) {
    const r = J.mem[j * 4 + m];
    set.jUpper[j * 4 + m] = r >= 0 && cross && rows[r].tier === tmax ? 1 : 0;
    set.jPres[j * 4 + m] = -1;
    if (!set.jUpper[j * 4 + m]) continue;
    let best = Infinity;
    for (let k = 0; k < RUNS_PER_ROW; k++) {
      const id = r * RUNS_PER_ROW + k;
      if (!(R.flags[id] & R_ON)) continue;
      const o = id * 4, dd = pointSeg2(d.x, d.y, R.chord[o], R.chord[o + 1], R.chord[o + 2], R.chord[o + 3]);
      if (dd < best) { best = dd; set.jPres[j * 4 + m] = id; }
    }
  }
  const rr = (cross ? Math.max(d.r, CROSS_NEAR * J.reach[j] * BOUND_HEADROOM) : d.r) + BOUND_EPS;
  e[q] = d.x; e[q + 1] = d.y; e[q + 2] = d.r; e[q + 3] = d.x - rr; e[q + 4] = d.y - rr; e[q + 5] = d.x + rr; e[q + 6] = d.y + rr;
}
// whether the square is where join j can be listed (its disc, or 0.85 R of a cross-tier join): the cells' join lists
const discHits = (set, j, x0, y0, x1, y1) => {
  const q = j * 7, r = Math.max(set.jext[q + 2], set.jCross[j] ? CROSS_NEAR * set.joins.reach[j] * BOUND_HEADROOM : 0) + BOUND_EPS;
  return rectPt2(set.jext[q], set.jext[q + 1], x0, y0, x1, y1) <= r * r;
};
function slotHits(set, id, s, x0, y0, x1, y1) {
  const c = set.cap, q = (id * 4 + s) * 5, r = c[q + 4];
  if (!(r > 0)) return false;
  if (set.policy.mode === 'box') return c[q] <= x1 + BOUND_EPS && c[q + 2] >= x0 - BOUND_EPS && c[q + 1] <= y1 + BOUND_EPS && c[q + 3] >= y0 - BOUND_EPS;
  const rr = r + BOUND_EPS;
  return segRect2(c[q], c[q + 1], c[q + 2], c[q + 3], x0, y0, x1, y1) <= rr * rr;
}
function slotHitsPoint(set, id, s, px, py) {
  const c = set.cap, q = (id * 4 + s) * 5, r = c[q + 4];
  if (!(r > 0)) return false;
  if (set.policy.mode === 'box') return px >= c[q] && px <= c[q + 2] && py >= c[q + 1] && py <= c[q + 3];
  return pointSeg2(px, py, c[q], c[q + 1], c[q + 2], c[q + 3]) <= r * r;
}

// Whether join j is listed for the square [x0, x1] x [y0, y1] (a point when x0 = x1 and y0 = y1), and if so the member runs it requires are stamped
// (set.stamp2[id] = st). Plan-r1 2.2.1: the square reaches the disc and two different members have a run whose grown bound reaches it; or, cross-tier,
// the square is inside 0.85 R and a lower member's bound reaches it (then the upper members' presence runs are required too).
function joinTest(set, j, x0, y0, x1, y1, st) {
  const q = j * 7, J = set.joins, cx = set.jext[q], cy = set.jext[q + 1];
  const d2 = rectPt2(cx, cy, x0, y0, x1, y1), d = Math.sqrt(d2), R = J.reach[j];
  const r = set.jext[q + 2] + BOUND_EPS;
  const inDisc = d2 <= r * r, cross = set.jCross[j] === 1;
  const near = cross && d <= CROSS_NEAR * R * BOUND_HEADROOM + BOUND_EPS;
  if (!inDisc && !near) return false;
  const jk = J.k[j] * (1 - smooth01(0.55 * R, R, d));
  const pool = set.runs.joinRunsOf(j), mem = J.mem, c = set.cap;
  const gl = G_JOIN * jk, gs = G_JOIN_SH * jk;
  let seen = 0, nSeen = 0, lowerHit = false, n = 0;
  const hit = set.hitTmp = growTmp(set.hitTmp, pool.length);
  for (let i = 0; i < pool.length; i++) {
    const id = pool[i], row = rowOfId(id);
    let m = 0;
    while (m < 4 && mem[j * 4 + m] !== row) m++;
    if (m === 4) continue;   // (a run of a row that is not a member)
    let grown = false;
    const ql = id * 20, qs = id * 20 + 5;
    if (c[ql + 4] > 0) grown = slotGrownHits(set, ql, c[ql + 4] + gl, x0, y0, x1, y1);
    if (!grown && c[qs + 4] > 0) grown = slotGrownHits(set, qs, c[qs + 4] + gs, x0, y0, x1, y1);
    if (grown && inDisc) { hit[n++] = id; if (!(seen & (1 << m))) { seen |= 1 << m; nSeen++; } }
    if (near && !set.jUpper[j * 4 + m]) {   // a lower member: any of its bounds reaching the square
      let any = false;
      for (let s = 0; s < 4 && !any; s++) any = slotHits(set, id, s, x0, y0, x1, y1);
      if (any) { lowerHit = true; hit[n++] = id; }
    }
  }
  if (nSeen >= 2) { for (let i = 0; i < n; i++) set.stamp2[hit[i]] = st; if (near && lowerHit) for (let m = 0; m < 4; m++) if (set.jPres[j * 4 + m] >= 0) set.stamp2[set.jPres[j * 4 + m]] = st; return true; }
  if (near && lowerHit) {
    for (let i = 0; i < n; i++) set.stamp2[hit[i]] = st;
    for (let m = 0; m < 4; m++) if (set.jPres[j * 4 + m] >= 0) set.stamp2[set.jPres[j * 4 + m]] = st;
    return true;
  }
  return false;
}
function growTmp(a, n) { return a && a.length >= n ? a : new Int32Array(Math.max(64, n * 2)); }   // alloc-rare: grown with the largest join pool
// the capsule (or morph box) of slot q (an offset into set.cap) grown to radius rr, against a square
function slotGrownHits(set, q, rr, x0, y0, x1, y1) {
  const c = set.cap;
  if (set.policy.mode === 'box') return c[q] <= x1 + rr && c[q + 2] >= x0 - rr && c[q + 1] <= y1 + rr && c[q + 3] >= y0 - rr;
  const r = rr + BOUND_EPS;
  return segRect2(c[q], c[q + 1], c[q + 2], c[q + 3], x0, y0, x1, y1) <= r * r;
}
const popcount4 = (b) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
const rowOfId = (id) => Math.floor(id / RUNS_PER_ROW);

/** The cell grid for the runs and joins loaded in `set` (CELL squares over every bound, grown by GRID_PAD cells). */
export function gridOf(set) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let id = 0; id < set.nIds; id++) {
    const e = set.ext, q = id * 4;
    if (e[q] !== e[q]) continue;   // (NaN: not drawn)
    x0 = Math.min(x0, e[q]); y0 = Math.min(y0, e[q + 1]); x1 = Math.max(x1, e[q + 2]); y1 = Math.max(y1, e[q + 3]);
  }
  for (let j = 0; j < set.nJoins; j++) { const q = j * 7; x0 = Math.min(x0, set.jext[q + 3]); y0 = Math.min(y0, set.jext[q + 4]); x1 = Math.max(x1, set.jext[q + 5]); y1 = Math.max(y1, set.jext[q + 6]); }
  if (!(x0 < Infinity)) { x0 = y0 = 0; x1 = y1 = CELL_SIZE; }
  const gx = (Math.floor(x0 / CELL_SIZE) - GRID_PAD) * CELL_SIZE, gy = (Math.floor(y0 / CELL_SIZE) - GRID_PAD) * CELL_SIZE;
  return { x0: gx, y0: gy, nx: Math.max(1, Math.ceil((x1 - gx) / CELL_SIZE) + GRID_PAD), ny: Math.max(1, Math.ceil((y1 - gy) / CELL_SIZE) + GRID_PAD) };
}

// the inclusive cell range a world box touches, clamped to the grid, into RNG
const RNG = new Int32Array(4);
function cellRange(set, wx0, wy0, wx1, wy1) {
  const g = set.grid;
  RNG[0] = Math.max(0, Math.floor((wx0 - g.x0) / CELL_SIZE)); RNG[1] = Math.max(0, Math.floor((wy0 - g.y0) / CELL_SIZE));
  RNG[2] = Math.min(g.nx - 1, Math.floor((wx1 - g.x0) / CELL_SIZE)); RNG[3] = Math.min(g.ny - 1, Math.floor((wy1 - g.y0) / CELL_SIZE));
}

function prepare(set, runs, joins, grid, policy) {
  set.runs = runs; set.joins = joins; set.policy = policy;
  set.nIds = runs.nRows * RUNS_PER_ROW; set.nJoins = joins.n;
  if (set.cap.length < set.nIds * 20) { set.cap = new Float64Array(set.nIds * 20); set.ext = new Float64Array(set.nIds * 4); }   // alloc-rare: with the rows
  if (set.jext.length < set.nJoins * 7) set.jext = new Float64Array(set.nJoins * 7);   // alloc-rare: with the joins
  if (!set.jCross || set.jCross.length < set.nJoins) { set.jCross = new Uint8Array(set.nJoins); set.jUpper = new Uint8Array(set.nJoins * 4); set.jPres = new Int32Array(set.nJoins * 4); }   // alloc-rare: with the joins
  set.stamp = grow(set.stamp, Int32Array, set.nIds);
  set.stamp2 = grow(set.stamp2 ?? new Int32Array(0), Int32Array, set.nIds);
  set.tmp = grow(set.tmp ?? new Int32Array(0), Int32Array, set.nIds);
  for (let id = 0; id < set.nIds; id++) loadRun(set, id);
  for (let j = 0; j < set.nJoins; j++) loadJoin(set, j);
  set.rowJoins = Array.from({ length: runs.nRows }, () => []);   // alloc-rare: a build; the joins each row is a member of
  set.maxK = 0;
  for (let j = 0; j < set.nJoins; j++) { set.maxK = Math.max(set.maxK, joins.k[j]); for (let m = 0; m < 4; m++) { const r = joins.mem[j * 4 + m]; if (r >= 0 && r < runs.nRows) set.rowJoins[r].push(j); } }
  set.grid = grid ?? gridOf(set);
  set.nCells = set.grid.nx * set.grid.ny;
  // the per-depth scratch: a child's list is a subset of its parent's, so the cap is every run (and join) once
  while (set.lv.length <= policy.maxDepth + 1) set.lv.push({ id: new Int32Array(0), bits: new Uint8Array(0), n: 0, jn: new Int32Array(0), nj: 0 });   // alloc-rare: once
  for (const L of set.lv) {
    if (L.id.length < set.nIds) { L.id = new Int32Array(set.nIds); L.bits = new Uint8Array(set.nIds); }   // alloc-rare: with the rows
    if (L.jn.length < set.nJoins) L.jn = new Int32Array(set.nJoins);   // alloc-rare: with the joins
  }
  set.res = set.res ?? []; while (set.res.length <= policy.maxDepth + 1) set.res.push(new Uint32Array(4));   // alloc-rare: once
}

// The cells' lists of the runs and joins that reach them: keys cell · count + id, sorted (a Float64Array sort), then laid out as lists.
function buildCellLists(set) {
  const { nIds, nJoins, nCells } = set, g = set.grid;
  let keys = new Float64Array(1 << 16), n = 0;
  const push = (k) => { if (n === keys.length) { const b = new Float64Array(keys.length * 2); b.set(keys); keys = b; } keys[n++] = k; };   // alloc-rare: a build
  for (let id = 0; id < nIds; id++) {
    const e = set.ext, q = id * 4;
    if (e[q] !== e[q]) continue;
    cellRange(set, e[q], e[q + 1], e[q + 2], e[q + 3]);
    for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) {
      const x0 = g.x0 + cx * CELL_SIZE, y0 = g.y0 + cy * CELL_SIZE;
      let hit = false;
      for (let s = 0; s < 4 && !hit; s++) hit = slotHits(set, id, s, x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE);
      if (hit) push((cy * g.nx + cx) * nIds + id);
    }
  }
  const sorted = keys.subarray(0, n).sort();
  listsInit(set.cg, nCells);
  listsFill(set.cg, sorted, n, nCells, nIds);
  n = 0;
  for (let j = 0; j < nJoins; j++) {
    const q = j * 7;
    cellRange(set, set.jext[q + 3], set.jext[q + 4], set.jext[q + 5], set.jext[q + 6]);
    for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) {
      const x0 = g.x0 + cx * CELL_SIZE, y0 = g.y0 + cy * CELL_SIZE;
      if (discHits(set, j, x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE)) push((cy * g.nx + cx) * Math.max(1, nJoins) + j);
    }
  }
  const sortedJ = keys.subarray(0, n).sort();
  listsInit(set.cj, nCells);
  listsFill(set.cj, sortedJ, n, nCells, Math.max(1, nJoins));
}

/**
 * dst = the entries of the source list (runs, with the bits each still may have; null bits: all) and joins that reach the square. A run is listed
 * with every contribution bound that reaches the square, plus C_JOIN when a listed join requires it. Ascending run ids; one entry a run.
 */
function fillList(set, dst, sId, sBits, sOff, sN, jArr, jOff, jN, x0, y0, x1, y1) {
  const st = ++set.stampN;
  let nj = 0;
  for (let i = 0; i < jN; i++) {
    const j = jArr[jOff + i];
    if (joinTest(set, j, x0, y0, x1, y1, st)) dst.jn[nj++] = j;
  }
  let n = 0;
  for (let i = 0; i < sN; i++) {
    const id = sId[sOff + i], allowed = sBits ? sBits[sOff + i] : 15;
    let bits = 0;
    for (let s = 0; s < 4; s++) if ((allowed & BITS[s]) !== 0 && slotHits(set, id, s, x0, y0, x1, y1)) bits |= BITS[s];
    if (set.stamp2[id] === st) bits |= C_JOIN;
    if (bits !== 0) { dst.id[n] = id; dst.bits[n] = bits; n++; }
  }
  dst.n = n; dst.nj = nj;
}

// The cell's source list: its runs and every run its joins require, ascending and unique.
function fillCell(set, cell) {
  const L0 = set.lv[0], g = set.grid, cx = cell % g.nx, cy = (cell / g.nx) | 0;
  const st = ++set.stampN, tmp = set.tmp;
  let m = 0;
  const cg = set.cg, cj = set.cj;
  for (let i = 0; i < cg.count[cell]; i++) { const id = cg.data[cg.start[cell] + i]; set.stamp[id] = st; tmp[m++] = id; }
  for (let i = 0; i < cj.count[cell]; i++) {
    const jj = cj.data[cj.start[cell] + i], req = set.runs.joinRunsOf(jj);
    for (let k = 0; k < req.length; k++) { const id = req[k]; if (set.stamp[id] !== st && set.ext[id * 4] === set.ext[id * 4]) { set.stamp[id] = st; tmp[m++] = id; } }
    for (let q = 0; q < 4; q++) { const id = set.jPres[jj * 4 + q]; if (id >= 0 && set.stamp[id] !== st && set.ext[id * 4] === set.ext[id * 4]) { set.stamp[id] = st; tmp[m++] = id; } }
  }
  tmp.subarray(0, m).sort();
  const x0 = g.x0 + cx * CELL_SIZE, y0 = g.y0 + cy * CELL_SIZE;
  fillList(set, L0, tmp, null, 0, m, cj.data, cj.start[cell], cj.count[cell], x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE);
}

// ── Costing and classifying ──
function rowsIn(L) {
  let rows = 0, last = -1;
  for (let i = 0; i < L.n; i++) { const r = rowOfId(L.id[i]); if (r !== last) { rows++; last = r; } }
  return rows;
}

/** The estimated shader work of a square drawn as one leaf holding L (policy units: bound-test equivalents; leafOverhead is the fixed cost of its quad). */
function costOf(set, L, x0, y0, size) {
  if (L.n === 0 && L.nj === 0) return 0;
  const P = set.policy, ns = P.nSample;
  let bound = L.nj;
  for (let i = 0; i < L.n; i++) bound += popcount4(L.bits[i] & 15);
  let surv = 0, joins = 0;
  for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) {
    const px = x0 + size * (a + 0.5) / ns, py = y0 + size * (b + 0.5) / ns, st = ++set.stampN;
    for (let k = 0; k < L.nj; k++) if (joinTest(set, L.jn[k], px, py, px, py, st)) joins++;
    for (let i = 0; i < L.n; i++) {
      const id = L.id[i], bits = L.bits[i];
      let hit = set.stamp2[id] === st;
      for (let s = 0; s < 4 && !hit; s++) hit = (bits & BITS[s]) !== 0 && slotHitsPoint(set, id, s, px, py);
      if (hit) surv++;
    }
  }
  const nn = ns * ns, px2 = size * size * P.fitScale * P.fitScale;
  return P.leafOverhead + px2 * (P.wBound * bound + P.wSeg * RUN_SEGS * (surv / nn) + P.wJoin * (joins / nn));
}

function crossTierOf(set, L) {
  const tiers = set.runs.graph.rows, mem = set.joins.mem;
  for (let k = 0; k < L.nj; k++) {
    let t = -1;
    for (let m = 0; m < 4; m++) {
      const r = mem[L.jn[k] * 4 + m];
      if (r < 0) continue;
      const tr = tiers[r].tier;
      if (t >= 0 && tr !== t) return true;
      t = tr;
    }
  }
  return false;
}
function lumenOverlap(set, L) {
  const c = set.cap;
  for (let i = 0; i < L.n; i++) {
    if (!(L.bits[i] & C_LUMEN)) continue;
    const a = L.id[i], qa = a * 20, ra = rowOfId(a);
    for (let j = i + 1; j < L.n; j++) {
      const b = L.id[j];
      if (!(L.bits[j] & C_LUMEN) || rowOfId(b) === ra) continue;
      const qb = b * 20, rr = c[qa + 4] + c[qb + 4] + 2 * BOUND_EPS;
      if (set.policy.mode === 'box') return true;
      if (segSeg2(c[qa], c[qa + 1], c[qa + 2], c[qa + 3], c[qb], c[qb + 1], c[qb + 2], c[qb + 3]) <= rr * rr) return true;
    }
  }
  return false;
}

// ── Making the nodes ──
const KIND_SHIFT = 30, IDX_MASK = 0x3fffffff;
const word = (kind, idx) => ((kind << KIND_SHIFT) | idx) >>> 0;
const kindOf = (w) => w >>> KIND_SHIFT, idxOf = (w) => w & IDX_MASK;
const EMPTY_WORD = 0;

function freeSubtree(set, w) {
  const k = kindOf(w), i = idxOf(w), T = set.tables;
  if (k === CHILD_LEAF) {
    const m = leafRead(T, i);
    set.garbage += m.runCount + m.joinCount; set.stats.leavesFreed++;
    setLeaf(T, i, 0, 0, 0, 0, 0, 0, 0, NO_OWNER); setBox(T, i, 0, 0, 0, 0);
    set.freeLeaves.push(i);
  } else if (k === CHILD_NODE) {
    for (let q = 0; q < 4; q++) freeSubtree(set, T.nodes[i * 4 + q]);
    set.freeNodes.push(i);
  }
}

// Writes the leaf for square (x0, y0, size) holding L; reuses `existing` (a leaf word) when it is one, and writes nothing when it already says the same.
function makeLeaf(set, depth, x0, y0, size, L, existing) {
  const T = set.tables, P = set.policy;
  const rows = rowsIn(L), hasJoin = L.nj > 0, over = rows > P.slots;
  let cls, owner = NO_OWNER;
  if (over) cls = L_WIDE;
  else if (P.mode === 'box' && (rows >= 2 || hasJoin)) cls = L_MORPH;
  else if (hasJoin) cls = L_JOIN;
  else if (rows === 1) { cls = L_SINGLE; owner = rowOfId(L.id[0]); }
  else cls = lumenOverlap(set, L) ? L_CROSS : L_LAYERED;
  if (hasJoin && crossTierOf(set, L)) cls |= CLASS_CROSSTIER;
  const cls8 = cls & 255;
  let id = -1, old = null;
  if (kindOf(existing) === CHILD_LEAF) { id = idxOf(existing); old = leafRead(T, id); }
  if (old) {
    let same = (old.cls | (old.crossTier ? CLASS_CROSSTIER : 0)) === cls && old.runCount === L.n && old.joinCount === L.nj && old.candMax === rows && old.depth === depth && old.owner === (owner === NO_OWNER ? -1 : owner);
    for (let i = 0; same && i < L.n; i++) same = T.runRefs[old.runStart + i] === (((L.bits[i] << 24) | L.id[i]) >>> 0);
    for (let i = 0; same && i < L.nj; i++) same = T.joinRefs[old.joinStart + i] === L.jn[i];
    if (same) return existing;
  }
  if (id < 0) id = set.freeLeaves.length ? set.freeLeaves.pop() : set.nextLeaf++;
  let rs, js;
  if (old && L.n <= old.runCount) { rs = old.runStart; set.garbage += old.runCount - L.n; } else { rs = reserveRunRefs(T, L.n); if (old) set.garbage += old.runCount; }
  if (old && L.nj <= old.joinCount) { js = old.joinStart; set.garbage += old.joinCount - L.nj; } else { js = reserveJoinRefs(T, L.nj); if (old) set.garbage += old.joinCount; }
  for (let i = 0; i < L.n; i++) setRunRef(T, rs + i, L.id[i], L.bits[i]);
  for (let i = 0; i < L.nj; i++) setJoinRef(T, js + i, L.jn[i]);
  setLeaf(T, id, cls, rs, L.n, js, L.nj, rows, depth, owner);
  setBox(T, id, x0, y0, size, cls8);
  set.stats.leavesWritten++;
  return word(CHILD_LEAF, id);
}

// Processes the square (x0, y0, size) at depth d, whose candidate list is set.lv[d]; `existing` is the word that is there now (EMPTY_WORD when fresh).
// Returns the word that is there after. `rebuild`: skip children no touched box meets when there is an existing node to keep.
function processNode(set, d, x0, y0, size, existing, rebuild) {
  const L = set.lv[d], P = set.policy;
  if (L.n === 0 && L.nj === 0) { freeSubtree(set, existing); return EMPTY_WORD; }
  const rows = rowsIn(L);
  let split = false;
  if (d < P.maxDepth) {
    if (rows > P.slots) split = true;
    else if (size * P.fitScale * 0.5 >= P.leafMinPx) {
      const here = costOf(set, L, x0, y0, size), h = size / 2, C = set.lv[d + 1];
      let kids = 0;
      for (let q = 0; q < 4 && kids < here; q++) {
        const cx = x0 + (q & 1 ? h : 0), cy = y0 + (q >> 1 ? h : 0);
        fillList(set, C, L.id, L.bits, 0, L.n, L.jn, 0, L.nj, cx, cy, cx + h, cy + h);
        kids += costOf(set, C, cx, cy, h);
      }
      split = kids < here * (1 - P.refineGain);
    }
  }
  if (!split) {
    if (kindOf(existing) === CHILD_NODE) freeSubtree(set, existing);
    return makeLeaf(set, d, x0, y0, size, L, kindOf(existing) === CHILD_NODE ? EMPTY_WORD : existing);
  }
  const h = size / 2, C = set.lv[d + 1], T = set.tables, res = set.res[d];
  const had = kindOf(existing) === CHILD_NODE;
  let any = false;
  for (let q = 0; q < 4; q++) {
    const cx = x0 + (q & 1 ? h : 0), cy = y0 + (q >> 1 ? h : 0);
    const was = had ? T.nodes[idxOf(existing) * 4 + q] : EMPTY_WORD;
    if (rebuild && had && !touched(set, cx, cy, cx + h, cy + h)) { res[q] = was; if (was !== EMPTY_WORD) any = true; continue; }
    fillList(set, C, L.id, L.bits, 0, L.n, L.jn, 0, L.nj, cx, cy, cx + h, cy + h);
    res[q] = processNode(set, d + 1, cx, cy, h, kindOf(was) === CHILD_EMPTY ? EMPTY_WORD : was, rebuild);
    if (res[q] !== EMPTY_WORD) any = true;
  }
  if (!any) { if (had) { set.freeNodes.push(idxOf(existing)); } else if (kindOf(existing) === CHILD_LEAF) freeSubtree(set, existing); return EMPTY_WORD; }
  if (kindOf(existing) === CHILD_LEAF) freeSubtree(set, existing);
  const n = had ? idxOf(existing) : (set.freeNodes.length ? set.freeNodes.pop() : set.nextNode++);
  for (let q = 0; q < 4; q++) {
    if (had && T.nodes[n * 4 + q] === res[q]) continue;
    setChild(T, n, q, kindOf(res[q]), idxOf(res[q]));
    set.stats.nodesWritten++;
  }
  return word(CHILD_NODE, n);
}
function touched(set, x0, y0, x1, y1) {
  const t = set.touch;
  for (let i = 0; i < set.nTouch; i++) { const q = i * 4; if (t[q] <= x1 && t[q + 2] >= x0 && t[q + 1] <= y1 && t[q + 3] >= y0) return true; }
  return false;
}

function processCell(set, cell, rebuild) {
  const g = set.grid, T = set.tables, cx = cell % g.nx, cy = (cell / g.nx) | 0;
  const o = (cy * GRID_W + cx) * 4;
  const was = T.cells[o] === 0 ? EMPTY_WORD : word(T.cells[o] === CELL_NODE ? CHILD_NODE : CHILD_LEAF, T.cells[o + 1] | (T.cells[o + 2] << 16));
  fillCell(set, cell);
  const w = processNode(set, 0, g.x0 + cx * CELL_SIZE, g.y0 + cy * CELL_SIZE, CELL_SIZE, was, rebuild);
  if (w === was) return;
  const k = kindOf(w);
  setCell(T, cx, cy, k === CHILD_EMPTY ? 0 : k === CHILD_NODE ? CELL_NODE : CELL_LEAF, k === CHILD_EMPTY ? 0 : idxOf(w));
}

/** Builds the whole hierarchy. grid null: gridOf. Returns set. set.report: see summarize. */
export function buildLeaves(runs, joins, grid, policy, set) {
  prepare(set, runs, joins, grid, policy ?? defaultPolicy());
  packBegin(set.tables, set.grid);
  set.freeLeaves.length = 0; set.freeNodes.length = 0; set.nextLeaf = 0; set.nextNode = 0; set.garbage = 0;
  set.stats.leavesWritten = 0; set.stats.nodesWritten = 0; set.stats.leavesFreed = 0; set.stats.cellsTouched = 0;
  set.nTouch = 0; set.touch = set.touch ?? new Float64Array(0);
  buildCellLists(set);
  for (let c = 0; c < set.nCells; c++) { if (set.cg.count[c] || set.cj.count[c]) processCell(set, c, false); }
  set.report = summarize(set);
  return set;
}

/**
 * What the hierarchy holds: { cells, leaves, nodes, byClass { class: leaves }, depth [leaves per depth], runRefs, joinRefs, wide [{ leaf, x, y, size, rows [..], joins, lumenOverlap }],
 * overWide [same, rows > slotsWide: a stop point, nothing truncated], falseProximity [wide leaves with no join and no lumen overlap: soft bounds piled up] }.
 * Walks the tree, so it is always what is really there.
 */
export function summarize(set) {
  const T = set.tables, P = set.policy, g = set.grid;
  const rep = { cells: 0, leaves: 0, nodes: 0, byClass: { [L_SINGLE]: 0, [L_LAYERED]: 0, [L_CROSS]: 0, [L_JOIN]: 0, [L_WIDE]: 0, [L_MORPH]: 0 }, depth: new Array(P.maxDepth + 1).fill(0), area: { [L_SINGLE]: 0, [L_LAYERED]: 0, [L_CROSS]: 0, [L_JOIN]: 0, [L_WIDE]: 0, [L_MORPH]: 0 }, runRefs: 0, joinRefs: 0, wide: [], overWide: [], falseProximity: [], wideHard: { le8: 0, le32: 0, more: 0, softOnlyRows: 0, joinOnlyRows: 0, maxHard: 0 } };
  const visit = (w) => {
    const k = kindOf(w), i = idxOf(w);
    if (k === CHILD_NODE) { rep.nodes++; for (let q = 0; q < 4; q++) visit(T.nodes[i * 4 + q]); return; }
    if (k !== CHILD_LEAF) return;
    const m = leafRead(T, i);
    rep.leaves++; rep.byClass[m.cls]++; rep.area[m.cls] += T.boxes[i * 4 + 2] * T.boxes[i * 4 + 2]; rep.depth[m.depth]++; rep.runRefs += m.runCount; rep.joinRefs += m.joinCount;
    if (m.cls !== L_WIDE) return;
    const rows = [], hard = new Set(), soft = new Set(), jo = new Set();
    for (let n = 0; n < m.runCount; n++) {
      const ref = T.runRefs[m.runStart + n], r = rowOfId(refRun(ref)), b = refBits(ref);
      if (!rows.length || rows[rows.length - 1] !== r) rows.push(r);
      if (b & C_LUMEN) hard.add(r); else if (b & (C_SHADOW | C_GLOW | 8)) soft.add(r); else jo.add(r);
    }
    for (const r of jo) if (!hard.has(r)) hard.add(r);
    const W = rep.wideHard;   // how many of a wide leaf's vessels reach it by their lumen or a junction, not only by shadow, glow or ring (what a slot is for)
    if (hard.size <= P.slots) W.le8++; else if (hard.size <= P.slotsWide) W.le32++; else W.more++;
    W.maxHard = Math.max(W.maxHard, hard.size); W.softOnlyRows += soft.size; W.joinOnlyRows += jo.size;
    const e = { leaf: i, x: T.boxes[i * 4], y: T.boxes[i * 4 + 1], size: T.boxes[i * 4 + 2], rows, joins: m.joinCount, lumenOverlap: leafLumenOverlap(set, m) };
    rep.wide.push(e);
    if (rows.length > P.slotsWide) rep.overWide.push(e);
    if (!m.joinCount && !e.lumenOverlap) rep.falseProximity.push(e);
  };
  for (let cy = 0; cy < g.ny; cy++) for (let cx = 0; cx < g.nx; cx++) {
    const o = (cy * GRID_W + cx) * 4, k = T.cells[o];
    if (k === 0) continue;
    rep.cells++;
    visit(word(k === CELL_NODE ? CHILD_NODE : CHILD_LEAF, T.cells[o + 1] | (T.cells[o + 2] << 16)));
  }
  return rep;
}
function leafLumenOverlap(set, m) {
  const T = set.tables, c = set.cap;
  for (let i = 0; i < m.runCount; i++) {
    const ra = T.runRefs[m.runStart + i], a = refRun(ra);
    if (!(refBits(ra) & C_LUMEN)) continue;
    for (let j = i + 1; j < m.runCount; j++) {
      const rb = T.runRefs[m.runStart + j], b = refRun(rb);
      if (!(refBits(rb) & C_LUMEN) || rowOfId(b) === rowOfId(a)) continue;
      const rr = c[a * 20 + 4] + c[b * 20 + 4] + 2 * BOUND_EPS;
      if (set.policy.mode === 'box') return true;
      if (segSeg2(c[a * 20], c[a * 20 + 1], c[a * 20 + 2], c[a * 20 + 3], c[b * 20], c[b * 20 + 1], c[b * 20 + 2], c[b * 20 + 3]) <= rr * rr) return true;
    }
  }
  return false;
}

/**
 * Rebuilds only what the changed runs (and joins) reach, in place (a material that moved a bound: glow, selection, casing, a radius past its bound). The tree
 * decisions are the ones buildLeaves makes, applied again to every square the old or the new bounds meet; every other leaf and node stays as it is, byte for byte.
 * `changedRuns`: run ids (runs.changed, n = runs.nChanged); `changedJoins`: join indices (runs.changedJoins, nJoins). A different count of rows or joins than the
 * build had builds everything again (set.stats.full is true). set.stats says what was written; the tables' dirty rows say what to upload.
 */
export function rebuildLeaves(changedRuns, set, n = changedRuns.length, changedJoins = null, nChangedJoins = 0) {
  const R = set.runs;
  if (R.nRows * RUNS_PER_ROW !== set.nIds || set.joins.n !== set.nJoins) { buildLeaves(R, set.joins, null, set.policy, set); set.stats.full = true; return set; }
  set.stats.full = false; set.stats.leavesWritten = 0; set.stats.nodesWritten = 0; set.stats.leavesFreed = 0;
  const need = (n + nChangedJoins + set.nJoins) * 8;
  if (!set.touch || set.touch.length < need) set.touch = new Float64Array(Math.max(need, 64));   // alloc-rare: grown with the changes
  set.nTouch = 0;
  const addTouch = (x0, y0, x1, y1) => { const q = set.nTouch++ * 4; set.touch[q] = x0; set.touch[q + 1] = y0; set.touch[q + 2] = x1; set.touch[q + 3] = y1; };
  const g = set.grid;
  set.cellStamp = grow(set.cellStamp ?? new Int32Array(0), Int32Array, set.nCells);
  const cellsList = set.cellsList = grow(set.cellsList ?? new Int32Array(0), Int32Array, set.nCells);
  let nc = 0;
  const st = ++set.stampN;
  const mark = (x0, y0, x1, y1) => {
    cellRange(set, x0, y0, x1, y1);
    for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) { const c = cy * g.nx + cx; if (set.cellStamp[c] !== st) { set.cellStamp[c] = st; cellsList[nc++] = c; } }
  };
  const E = set.ext;
  const stj = ++set.stampN;
  set.jStamp = grow(set.jStamp ?? new Int32Array(0), Int32Array, set.nJoins);
  set.jList = grow(set.jList ?? new Int32Array(0), Int32Array, set.nJoins);
  let nJ = 0;
  const addJoin = (j) => { if (set.jStamp[j] !== stj) { set.jStamp[j] = stj; set.jList[nJ++] = j; } };
  for (let i = 0; i < nChangedJoins; i++) addJoin(changedJoins[i]);
  for (let i = 0; i < n; i++) {
    const id = changedRuns[i], q = id * 4, row = rowOfId(id);
    const rj = set.rowJoins[row] ?? [];
    for (let k = 0; k < rj.length; k++) addJoin(rj[k]);   // (a member's bound moved: the join's grown test, and its presence run, may have)
    const pad = rj.length ? G_JOIN * set.maxK + 2 * BOUND_EPS : 0;
    const ox0 = E[q], oy0 = E[q + 1], ox1 = E[q + 2], oy1 = E[q + 3];
    const wasDrawn = ox0 === ox0;
    loadRun(set, id);
    const isDrawn = E[q] === E[q];
    if (isDrawn && (E[q] - pad < g.x0 || E[q + 1] - pad < g.y0 || E[q + 2] + pad > g.x0 + g.nx * CELL_SIZE || E[q + 3] + pad > g.y0 + g.ny * CELL_SIZE)) {   // grew past the grid: everything again
      buildLeaves(R, set.joins, null, set.policy, set); set.stats.full = true; return set;
    }
    if (wasDrawn) {   // out of every cell the old bounds reached
      addTouch(ox0 - pad, oy0 - pad, ox1 + pad, oy1 + pad); mark(ox0 - pad, oy0 - pad, ox1 + pad, oy1 + pad);
      cellRange(set, ox0, oy0, ox1, oy1);
      for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) listRemove(set.cg, cy * g.nx + cx, id);
    }
    if (isDrawn) {   // into every cell the new ones reach
      addTouch(E[q] - pad, E[q + 1] - pad, E[q + 2] + pad, E[q + 3] + pad); mark(E[q] - pad, E[q + 1] - pad, E[q + 2] + pad, E[q + 3] + pad);
      cellRange(set, E[q], E[q + 1], E[q + 2], E[q + 3]);
      for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) {
        const x0 = g.x0 + cx * CELL_SIZE, y0 = g.y0 + cy * CELL_SIZE;
        let hit = false;
        for (let s = 0; s < 4 && !hit; s++) hit = slotHits(set, id, s, x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE);
        if (hit) listInsert(set.cg, cy * g.nx + cx, id);
      }
    }
  }
  for (let i = 0; i < nJ; i++) {
    const j = set.jList[i], q = j * 7, e = set.jext;
    addTouch(e[q + 3], e[q + 4], e[q + 5], e[q + 6]); mark(e[q + 3], e[q + 4], e[q + 5], e[q + 6]);
    cellRange(set, e[q + 3], e[q + 4], e[q + 5], e[q + 6]);
    for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) listRemove(set.cj, cy * g.nx + cx, j);
    loadJoin(set, j);
    addTouch(e[q + 3], e[q + 4], e[q + 5], e[q + 6]); mark(e[q + 3], e[q + 4], e[q + 5], e[q + 6]);
    cellRange(set, e[q + 3], e[q + 4], e[q + 5], e[q + 6]);
    for (let cy = RNG[1]; cy <= RNG[3]; cy++) for (let cx = RNG[0]; cx <= RNG[2]; cx++) {
      const x0 = g.x0 + cx * CELL_SIZE, y0 = g.y0 + cy * CELL_SIZE;
      if (discHits(set, j, x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE)) listInsert(set.cj, cy * g.nx + cx, j);
    }
  }
  cellsList.subarray(0, nc).sort();
  set.stats.cellsTouched = nc;
  for (let i = 0; i < nc; i++) processCell(set, cellsList[i], true);
  set.report = summarize(set);
  const used = set.tables.n.runRefs + set.tables.n.joinRefs;
  if (set.garbage > Math.max(8192, used >> 1)) { buildLeaves(R, set.joins, null, set.policy, set); set.stats.full = true; set.stats.compacted = true; }
  return set;
}
