// The vector renderer's hierarchy owner (docs/recommendations/vector-renderer-plan-r1.md sections 2 and 3; workstream E). CPU only, no GL.
//
// One hierarchy is the chain A and K defined: the persistent graph (A, vec-graph.js) -> the runs and their bounds (A, vec-runs.js) -> the adaptive
// leaves under the 16-unit cells (K, vec-leaves.js), packed in K's tables (vec-leaves-pack.js) with A's run and join tables beside them. The renderer
// uploads exactly what changed (vec-hier-gpu.js). The figure has one; a morph set has its own (box bounds over the whole sweep), sharing the figure's graph.
//
// What changes what:
//   a camera change         nothing here (the tables are in world units; nothing is uploaded)
//   colour / pressure       nothing here (no bound moves)
//   glow, selection, shadow, casing, a radius past BOUND_HEADROOM, a tier, a moved point   flush(): A's rebuildRows -> K's rebuildLeaves -> dirty rows
//   a new geometry          build()
// flush() is the only place that rebuilds; it runs once a frame at most, before the passes, and does nothing when nothing was noted.
import { createVecGraph } from './vec-graph.js';
import { createRuns } from './vec-runs.js';
import { createLeafSet, buildLeaves, rebuildLeaves, defaultPolicy } from './vec-leaves.js';
import { GRID_W, RUNS_PER_ROW, REACH_AA, L_SINGLE, L_MORPH } from './vec-contract.js';

/** The world slack added to a morph set's boxes (the radius between two moments the sweep samples). */
export const MORPH_SLACK = 4;

/** The graph one figure's hierarchies share. */
export const createHierGraph = () => createVecGraph();

/**
 * A hierarchy over `graph`. opts: { look: { shOff: [x, y] } (the shadow offset the bounds are made with), tubes: the sweep's input for a morph set
 * (box bounds; null for the figure), slack }.
 */
export function createHier(graph, opts = {}) {
  const box = !!opts.tubes;
  const H = {
    graph, box, tubes: opts.tubes || null, slack: opts.slack ?? MORPH_SLACK,
    shOff: [opts.look?.shOff?.[0] ?? 0, opts.look?.shOff?.[1] ?? 0],
    runs: null, set: createLeafSet(),
    runsPack: { data: null, width: RUNS_PER_ROW * 4, height: 0, dirty: null }, joinsPack: { data: null, count: 0 },
    // what the GPU side has to take: the run rows written (lo..hi), whether the join table is, and a counter of the leaf set's changes (the instance lists)
    runsLo: 1e9, runsHi: -1, runsWhole: true, joinsDirty: true, leafVer: 0,
    built: false, tooWide: false,
    mark: new Uint8Array(0), marked: new Int32Array(0), nMarked: 0, jmark: new Uint8Array(0), jmarked: new Int32Array(0), nJmarked: 0,
    tier: new Uint8Array(0), rows: new Int32Array(0), jscratch: new Int32Array(0),
    // the world box a rebuilt row's runs reached before the rebuild (until the next frame has drawn it away): x0, y0, x1, y1 a row; oldHas[r] = 1 when set
    oldBox: new Float64Array(0), oldHas: new Uint8Array(0), oldList: new Int32Array(0), nOld: 0,
    stats: { builds: 0, flushes: 0, rowsRebuilt: 0, leavesRebuilt: 0, full: 0, lastMs: 0 },
  };
  const policy = () => (box ? { ...defaultPolicy(), mode: 'box' } : defaultPolicy());

  function size() {
    const n = graph.nRows, nj = graph.joins.n;
    if (H.mark.length < n) { H.mark = new Uint8Array(n); H.marked = new Int32Array(n); H.tier = new Uint8Array(n); H.rows = new Int32Array(n * 2); H.oldBox = new Float64Array(n * 4); H.oldHas = new Uint8Array(n); H.oldList = new Int32Array(n); H.nOld = 0; }   // alloc-rare: with the vessel rows
    if (H.jmark.length < nj) { H.jmark = new Uint8Array(nj * 2 + 8); H.jmarked = new Int32Array(nj * 2 + 8); H.jscratch = new Int32Array(nj * 2 + 8); }   // alloc-rare: with the joins
  }
  const noteRun = (r0, r1) => { if (r0 < H.runsLo) H.runsLo = r0; if (r1 > H.runsHi) H.runsHi = r1; };

  // The box of everything row r's runs reach now (the set's per-run extents), joined into oldBox[r].
  function stash(r) {
    const E = H.set.ext, v = H.runs.runsOf(r);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let q = 0; q < v.length; q++) { const o = v[q] * 4; if (E[o] !== E[o]) continue; if (E[o] < x0) x0 = E[o]; if (E[o + 1] < y0) y0 = E[o + 1]; if (E[o + 2] > x1) x1 = E[o + 2]; if (E[o + 3] > y1) y1 = E[o + 3]; }
    if (!(x0 < Infinity)) return;
    const o = r * 4;
    if (!H.oldHas[r]) { H.oldHas[r] = 1; H.oldList[H.nOld++] = r; H.oldBox[o] = x0; H.oldBox[o + 1] = y0; H.oldBox[o + 2] = x1; H.oldBox[o + 3] = y1; return; }
    if (x0 < H.oldBox[o]) H.oldBox[o] = x0; if (y0 < H.oldBox[o + 1]) H.oldBox[o + 1] = y0; if (x1 > H.oldBox[o + 2]) H.oldBox[o + 2] = x1; if (y1 > H.oldBox[o + 3]) H.oldBox[o + 3] = y1;
  }
  /** The frame that drew the rebuilt rows has been planned: their old boxes are spent. */
  H.forgetOld = function forgetOld() { for (let i = 0; i < H.nOld; i++) H.oldHas[H.oldList[i]] = 0; H.nOld = 0; };
  /** The next call to flush() builds everything again (a new geometry). */
  H.invalidate = function invalidate() { H.built = false; };

  /** Everything again from the graph (a new geometry, or a shadow offset the bounds were not made with). */
  H.build = function build() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    size();
    H.runs = createRuns(graph, { shOff: [H.shOff[0], H.shOff[1]], aa: REACH_AA });
    H.runs.build();
    if (box) H.runs.morphBoxes(H.tubes, H.slack);
    buildLeaves(H.runs, graph.joins, null, policy(), H.set);
    H.tooWide = H.set.grid.nx > GRID_W;
    H.runs.packRuns(H.runsPack); H.runs.packJoins(H.joinsPack);
    H.runsWhole = true; H.joinsDirty = true; H.runsLo = 1e9; H.runsHi = -1;
    for (let r = 0; r < graph.nRows; r++) H.tier[r] = graph.rows[r].tier;
    H.nMarked = 0; H.mark.fill(0); H.nJmarked = 0; H.jmark.fill(0);
    H.leafVer++; H.built = true; H.stats.builds++;
    H.stats.lastMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return H;
  };
  /** The graph's rows (and joins) that changed in a way the runs cannot see by themselves (moved points, a patched join). */
  H.note = function note(rows, n, joins = null, nj = 0) {
    if (!H.built) return;
    size();
    for (let i = 0; i < n; i++) { const r = rows[i]; if (r >= 0 && r < graph.nRows && !H.mark[r]) { H.mark[r] = 1; H.marked[H.nMarked++] = r; } }
    for (let i = 0; i < nj; i++) { const j = joins[i]; if (j >= 0 && j < H.jmark.length && !H.jmark[j]) { H.jmark[j] = 1; H.jmarked[H.nJmarked++] = j; } }
  };
  /**
   * Brings the hierarchy up to the graph: the rows the runs flag (material or radius past its bound) and the rows noted are rebuilt (A), the leaves
   * they reach are rebuilt (K), the changed tables are marked for upload. Returns the number of runs that changed (0: nothing was written).
   */
  H.flush = function flush() {
    if (!H.built) return 0;
    if (graph.nRows * RUNS_PER_ROW !== H.set.nIds || graph.joins.n !== H.set.nJoins) { H.build(); return H.set.nIds; }
    size();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    // The rows: those past their bound (A) and the noted ones, once each.
    let n = H.runs.pastRows(H.rows);
    for (let i = 0; i < n; i++) H.mark[H.rows[i]] = 2;
    for (let i = 0; i < H.nMarked; i++) { const r = H.marked[i]; if (H.mark[r] !== 2) { H.mark[r] = 2; H.rows[n++] = r; } }
    H.nMarked = 0;
    for (let i = 0; i < n; i++) H.mark[H.rows[i]] = 0;
    // A tier that changed alters whether the joins of that row cross tiers (K reads it when it loads a join): those joins are rebuilt too.
    const J = graph.joins;
    for (let r = 0; r < graph.nRows; r++) {
      const t = graph.rows[r].tier;
      if (t === H.tier[r]) continue;
      H.tier[r] = t;
      for (let j = 0; j < J.n; j++) for (let m = 0; m < 4; m++) if (J.mem[j * 4 + m] === r && !H.jmark[j]) { H.jmark[j] = 1; H.jmarked[H.nJmarked++] = j; }
    }
    if (!n && !H.nJmarked) return 0;
    if (n) {
      for (let i = 0; i < n; i++) stash(H.rows[i]);
      H.runs.rebuildRows(H.rows, n);
      if (box) H.runs.morphBoxes(H.tubes, H.slack);   // (the rebuilt rows' boxes are the sweep's again)
    }
    // The joins K must load again: those whose run lists changed (A) and those noted.
    const R = H.runs, nc = n ? R.nChanged : 0, ncj = n ? R.nChangedJoins : 0;
    for (let i = 0; i < ncj; i++) { const j = R.changedJoins[i]; if (!H.jmark[j]) { H.jmark[j] = 1; H.jmarked[H.nJmarked++] = j; } }
    const nj = H.nJmarked;
    for (let i = 0; i < nj; i++) { H.jscratch[i] = H.jmarked[i]; H.jmark[H.jmarked[i]] = 0; }
    H.nJmarked = 0;
    if (nc || nj) {
      rebuildLeaves(R.changed, H.set, nc, H.jscratch, nj);
      H.tooWide = H.set.grid.nx > GRID_W;
      H.leafVer++;
      if (H.set.stats.full) H.stats.full++;
      H.stats.leavesRebuilt += H.set.stats.leavesWritten;
    }
    // The run table: the rows written (all of them after a full rebuild); the join table whole when any join changed.
    if (n) { H.runs.packRuns(H.runsPack, H.rows, n); if (H.runsPack.dirty) noteRun(H.runsPack.dirty[0], H.runsPack.dirty[1]); }
    if (nj || ncj) { H.runs.packJoins(H.joinsPack); H.joinsDirty = true; }
    H.stats.flushes++; H.stats.rowsRebuilt += n;
    H.stats.lastMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return nc || nj ? nc + nj : 0;
  };
  /** The rows a bound reaches in a box (world) -> a callback per run box: for the blood pass's boxes (rows marked 1 in `marks`). Returns how many runs were visited. */
  H.eachRunBox = function eachRunBox(marks, fn) {
    if (!H.built) return 0;
    const set = H.set, E = set.ext;
    let n = 0;
    for (let r = 0; r < graph.nRows; r++) {
      if (!marks[r]) continue;
      const v = H.runs.runsOf(r);
      for (let q = 0; q < v.length; q++) {
        const id = v[q], o = id * 4;
        if (E[o] !== E[o]) continue;   // (not drawn)
        fn(E[o], E[o + 1], E[o + 2], E[o + 3]); n++;
      }
      if (H.oldHas[r]) { const o = r * 4; fn(H.oldBox[o], H.oldBox[o + 1], H.oldBox[o + 2], H.oldBox[o + 3]); n++; }
    }
    return n;
  };
  /** The leaf counts by class, for the gauge and L's panel: index = class - 1. */
  H.counts = function counts(out) {
    const rep = H.set.report;
    for (let c = 0; c < 6; c++) out[c] = rep ? rep.byClass[c + 1] | 0 : 0;
    return out;
  };
  void L_SINGLE; void L_MORPH;
  return H;
}
