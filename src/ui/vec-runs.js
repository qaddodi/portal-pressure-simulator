// The vector renderer's short runs and their bounds (docs/recommendations/vector-renderer-plan-r1.md sections 2.1, 2.2; workstream A).
//
// Every vessel row's 63 segments are cut once into runs of RUN_SEGS = 4 (run k holds segments 4k … 4k + 3; run id = row · RUNS_PER_ROW + k). A run is the unit
// the hierarchy (K's leaves), the strips (B) and the regions (C) refer to. A run keeps ONE conservative bound per contribution, each a capsule around its
// chord (the segment from its first point to its last) whose radius already includes the run's sagitta (how far its points stray from the chord):
//
//   C_LUMEN   rL = largest radius of the run × BOUND_HEADROOM + casing + antialiased edge (+ sagitta)                               every run
//   C_SHADOW  rS = rL + the shadow's blur (a selected vessel's, the larger), the chord moved by the shadow offset                  vessels with F_SHADOW
//   C_GLOW    rG = rL + the glow's width NOW (12 × the vessel's glow width factor, at most REACH_GLOW), never the widest possible   glowing vessels only
//   C_RING    rR = rL + the selection ring (REACH_RING)                                                                             the selected vessel only
//   C_JOIN    a join's disc (its reach + blend width, × BOUND_HEADROOM) and the REQUIRED runs: every run of a member that the disc reaches, as a list
//
// Nothing here widens a run over what lies between two runs, and nothing keeps "the nearest" of anything. The bounds are conservative: every point a
// contribution can change lies inside the run's capsule for it (tests/vec-runs.test.js samples this densely on every preset and the lobule).
//
// What moves a bound (and so rebuilds that row's runs): a radius past its bound (BOUND_HEADROOM × the radius then), a casing change, glow on, off or wider,
// selection on or off, the shadow flag. A colour or a pressure change moves nothing. `pastRows` finds the rows, `rebuildRows` rebuilds them and says which
// runs' numbers changed, so only the leaves those runs reach are rebuilt (K).
//
// SIGNATURES (K, B, C, L code against these):
//   const runs = createRuns(graph, look?)       graph: vec-graph.js createVecGraph(); look: { shOff: [x, y], glow, aa } (default vec-compile DEFAULT_LOOK's numbers)
//   runs.build()                                 every row's runs made from the graph as it stands; returns runs
//   runs.runsOf(row)        → Int32Array view    the row's run ids, in order (a kept view; its length is the count; runs with no segment in the binning are left out)
//   runs.boundOf(run, C_*, out?) → out | null    the capsule { ax, ay, bx, by, r } for that contribution, or null when the run has none (no shadow, glow not on, not selected, off)
//   runs.joinRunsOf(join)   → Int32Array view    the join's required run ids (a list, never an interval); runs.joinDisc(join, out?) → { x, y, r }
//   runs.pastRows(list)     → n                  rows (into the Int32Array `list`, at least nRows long) whose runs' bounds no longer hold what the graph has now
//   runs.rebuildRows(rows, n?) → n               rebuilds those rows' runs (and the required runs of the joins they are members of); the run ids whose numbers
//                                                changed are in runs.changed[0 .. n) (kept), the joins whose required list changed in runs.changedJoins[0 .. runs.nChangedJoins)
//   runs.packRuns(out, rows?, n?) → out          the RUN texture's data in the contract's layout (RUN_TEXELS): out = { data: Float32Array, width, height, dirty: [row0, row1] | null }
//                                                written in place (grown when too small); with `rows` only those rows are written
//   runs.packJoins(out)     → out                the JOIN texture's data (JOIN_TEXELS): { data: Float32Array, count }
//   runs.morphBoxes(tubes)                       the t3 box of every run over a morph stretch: tubes = veins-sweep.js binSwept's input [{ id, path: [P0 … Pm] }], slack (world)
import {
  RUN_SEGS, RUNS_PER_ROW, RUN_TEXELS, R_ON, R_SHADOW, R_GLOW, R_RING, C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN,
  BOUND_HEADROOM, REACH_GLOW, REACH_RING, REACH_SHADOW_BLUR, REACH_SHADOW_OFF, REACH_AA,
} from './vec-contract.js';
import { N_SAMPLES, N_QUADS } from './veins-mesh.js';
import { F_SHADOW } from './veins-mesh-data.js';

const NS = N_SAMPLES;
/** The usual glow width past the casing (world); a vessel's glow width factor (at most 1.3) multiplies it. */
export const GLOW_USUAL = REACH_GLOW / 1.3;
export const DEFAULT_RUN_LOOK = Object.freeze({ shOff: [REACH_SHADOW_OFF, 0], aa: REACH_AA });
const f32 = Math.fround;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function ptSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}

/** The glow width now (world past the wall) of a graph record: 0 unless it glows. */
export function glowReachOf(rec) { return rec.glow > 0 ? GLOW_USUAL * clamp(rec.glowW > 0 ? rec.glowW : 1, 0, 1.3) : 0; }

export function createRuns(graph, look = DEFAULT_RUN_LOOK) {
  const R = {
    graph, look, nRows: 0, nRuns: 0,
    /** Per run: chord (ax, ay, bx, by), bound radii (rL, rS, rG, rR), segments (i0, i1), flags, morph box, the largest radius used (for pastRows). */
    chord: new Float32Array(0), rad: new Float32Array(0), seg: new Int16Array(0), flags: new Uint8Array(0), box: new Float32Array(0), radB: new Float32Array(0),
    count: new Uint8Array(0),                 // per row: how many runs
    ids: new Int32Array(0),                   // per row, RUNS_PER_ROW run ids
    views: [],                                // per row: the kept view of ids
    mat: new Float32Array(0),                 // per row: the material the bounds were made with (casing, glow reach now, selected, shadow)
    changed: new Int32Array(0), nChanged: 0, changedJoins: new Int32Array(0), nChangedJoins: 0,
    joinStart: new Int32Array(0), joinCount: new Int32Array(0), joinList: new Int32Array(0), joinViews: [], nJoins: 0,
    version: 0,
  };
  const MAT = 4;
  let slack = 0;

  function size() {
    const nRows = graph.nRows;
    if (R.count.length < nRows) {   // alloc-rare: grown with the vessel rows
      R.chord = new Float32Array(nRows * RUNS_PER_ROW * 4); R.rad = new Float32Array(nRows * RUNS_PER_ROW * 4); R.seg = new Int16Array(nRows * RUNS_PER_ROW * 2);
      R.flags = new Uint8Array(nRows * RUNS_PER_ROW); R.box = new Float32Array(nRows * RUNS_PER_ROW * 4); R.radB = new Float32Array(nRows * RUNS_PER_ROW);
      R.count = new Uint8Array(nRows); R.ids = new Int32Array(nRows * RUNS_PER_ROW); R.mat = new Float32Array(nRows * MAT);
      R.changed = new Int32Array(nRows * RUNS_PER_ROW);
      R.views = [];
      for (let r = 0; r < nRows; r++) R.views.push(R.ids.subarray(r * RUNS_PER_ROW, r * RUNS_PER_ROW));
    }
    R.nRows = nRows; R.nRuns = nRows * RUNS_PER_ROW;
  }

  const matOf = (rec, o) => {
    R.mat[o] = rec.casing; R.mat[o + 1] = glowReachOf(rec); R.mat[o + 2] = rec.sel > 0 ? 1 : 0; R.mat[o + 3] = (rec.flags & F_SHADOW) ? 1 : 0;
  };

  // One run of row r, from the graph: returns true when any of its numbers differ from what it held.
  function makeRun(r, k, rec, fresh) {
    const id = r * RUNS_PER_ROW + k, i0 = k * RUN_SEGS, i1 = Math.min(N_QUADS - 1, i0 + RUN_SEGS - 1), P = graph.pts, rad = graph.rad;
    const ax = P[(r * NS + i0) * 2], ay = P[(r * NS + i0) * 2 + 1], bx = P[(r * NS + i1 + 1) * 2], by = P[(r * NS + i1 + 1) * 2 + 1];
    let sag2 = 0, rmax = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, seen = false;
    for (let i = i0; i <= i1 + 1; i++) {
      const x = P[(r * NS + i) * 2], y = P[(r * NS + i) * 2 + 1];
      const d2 = ptSeg2(x, y, ax, ay, bx, by);
      if (d2 > sag2) sag2 = d2;
      if (rad[r * NS + i] > rmax) rmax = rad[r * NS + i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (let i = i0; i <= i1; i++) if (graph.seg[r * N_QUADS + i]) seen = true;
    const sag = Math.sqrt(sag2) + 1e-3;   // (1e-3: float32 rounding of the stored chord and radii)
    const lum = rmax * BOUND_HEADROOM + rec.casing + R.look.aa * 0.5 + sag;
    const glowR = glowReachOf(rec);
    const shadow = (rec.flags & F_SHADOW) !== 0;
    const rL = f32(lum), rS = shadow ? f32(lum + REACH_SHADOW_BLUR) : 0, rG = glowR > 0 ? f32(lum + glowR) : 0, rR = rec.sel > 0 ? f32(lum + REACH_RING) : 0;
    const fl = (seen ? R_ON : 0) | (shadow ? R_SHADOW : 0) | (glowR > 0 ? R_GLOW : 0) | (rec.sel > 0 ? R_RING : 0);
    // the morph box of a figure's run: its own box widened by the largest radius it can reach with (a morph set's is written by morphBoxes)
    const reachMax = Math.max(rL, rS, rG, rR) + Math.hypot(R.look.shOff[0], R.look.shOff[1]);
    const o4 = id * 4;
    let diff = !!fresh;
    const set = (arr, o, v) => { if (arr[o] !== v) { arr[o] = v; diff = true; } };
    set(R.chord, o4, f32(ax)); set(R.chord, o4 + 1, f32(ay)); set(R.chord, o4 + 2, f32(bx)); set(R.chord, o4 + 3, f32(by));
    set(R.rad, o4, rL); set(R.rad, o4 + 1, rS); set(R.rad, o4 + 2, rG); set(R.rad, o4 + 3, rR);
    set(R.seg, id * 2, i0); set(R.seg, id * 2 + 1, i1); set(R.flags, id, fl);
    set(R.box, o4, f32(x0 - reachMax)); set(R.box, o4 + 1, f32(y0 - reachMax)); set(R.box, o4 + 2, f32(x1 + reachMax)); set(R.box, o4 + 3, f32(y1 + reachMax));
    R.radB[id] = f32(rmax * BOUND_HEADROOM);
    return diff;
  }

  function rowRuns(r, fresh) {
    const rec = graph.rows[r];
    let n = 0, used = 0;   // (used: bit k set when run k is listed)
    if (rec.on) {
      for (let k = 0; k < RUNS_PER_ROW; k++) {
        const i0 = k * RUN_SEGS;
        if (i0 >= N_QUADS) break;
        let any = false;
        for (let i = i0; i < Math.min(N_QUADS, i0 + RUN_SEGS); i++) if (graph.seg[r * N_QUADS + i]) any = true;
        if (!any) continue;
        const id = r * RUNS_PER_ROW + k;
        R.ids[r * RUNS_PER_ROW + n++] = id; used |= 1 << k;
        if (makeRun(r, k, rec, fresh) && R.nChanged < R.changed.length) R.changed[R.nChanged++] = id;
      }
    }
    for (let k = 0; k < RUNS_PER_ROW; k++) {   // a run no longer listed: its numbers go to zero (and count as changed)
      if (used & (1 << k)) continue;
      const id = r * RUNS_PER_ROW + k, o = id * 4;
      if (R.flags[id] || R.rad[o] || fresh) {
        R.flags[id] = 0; R.chord.fill(0, o, o + 4); R.rad.fill(0, o, o + 4); R.box.fill(0, o, o + 4); R.seg[id * 2] = R.seg[id * 2 + 1] = 0; R.radB[id] = 0;
        if (!fresh && R.nChanged < R.changed.length) R.changed[R.nChanged++] = id;
      }
    }
    if (R.count[r] !== n || fresh) { R.count[r] = n; R.views[r] = R.ids.subarray(r * RUNS_PER_ROW, r * RUNS_PER_ROW + n); }   // alloc-rare: a view when the row's run count changes
    else if (n) { /* the ids are rewritten in place, the view stays */ }
    matOf(rec, r * MAT);
  }

  // The required runs of every join: every run of a member whose capsule the join's disc reaches.
  function joinRuns(only) {
    const J = graph.joins;
    R.nJoins = J.n;
    if (R.joinStart.length < J.n) { R.joinStart = new Int32Array(J.n); R.joinCount = new Int32Array(J.n); R.joinViews = []; }   // alloc-rare: grown with the joins
    if (R.changedJoins.length < J.n) R.changedJoins = new Int32Array(J.n);   // alloc-rare: as above
    if (!only) { R.joinList = new Int32Array(Math.max(16, J.n * 8)); R.joinViews.length = 0; }
    R.nChangedJoins = 0;
    // (Lists are rebuilt whole each time they are asked for: a join's list is short and a rebuild is rare. A list longer than the kept one grows it.)
    const lists = [];
    for (let j = 0; j < J.n; j++) {
      const l = [], rr = (J.reach[j] + J.k[j]) * BOUND_HEADROOM;
      for (let m = 0; m < 4; m++) {
        const row = J.mem[j * 4 + m];
        if (row < 0 || row >= graph.nRows) continue;
        const view = R.views[row];
        for (let q = 0; q < view.length; q++) {
          const id = view[q], o = id * 4;
          if (ptSeg2(J.x[j], J.y[j], R.chord[o], R.chord[o + 1], R.chord[o + 2], R.chord[o + 3]) <= (rr + R.rad[o]) * (rr + R.rad[o])) l.push(id);
        }
      }
      lists.push(l);
    }
    let total = 0;
    for (const l of lists) total += l.length;
    if (R.joinList.length < total) R.joinList = new Int32Array(total * 2);   // alloc-rare: a list longer than any before
    let at = 0;
    for (let j = 0; j < J.n; j++) {
      const l = lists[j], was0 = R.joinViews[j];
      let same = !!was0 && was0.length === l.length;
      if (same) for (let q = 0; q < l.length; q++) if (was0[q] !== l[q]) { same = false; break; }
      R.joinStart[j] = at; R.joinCount[j] = l.length;
      for (let q = 0; q < l.length; q++) R.joinList[at++] = l[q];
      R.joinViews[j] = R.joinList.subarray(R.joinStart[j], at);
      if (!same) R.changedJoins[R.nChangedJoins++] = j;
    }
  }

  R.build = function build() {
    size();
    R.nChanged = 0;
    R.ids.fill(0, 0, R.nRows * RUNS_PER_ROW);
    for (let r = 0; r < R.nRows; r++) { R.count[r] = 255; rowRuns(r, true); }
    joinRuns(false);
    R.version++;
    return R;
  };
  R.runsOf = (row) => R.views[row];
  R.boundOf = function boundOf(run, c, out = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 }) {   // (out kept by a caller that asks per frame)
    if (!(R.flags[run] & R_ON)) return null;
    const o = run * 4;
    let r;
    let dx = 0, dy = 0;
    if (c === C_LUMEN || c === C_JOIN) r = R.rad[o];
    else if (c === C_SHADOW) { r = R.rad[o + 1]; dx = R.look.shOff[0]; dy = R.look.shOff[1]; }
    else if (c === C_GLOW) r = R.rad[o + 2];
    else if (c === C_RING) r = R.rad[o + 3];
    else return null;
    if (!(r > 0)) return null;
    out.ax = R.chord[o] + dx; out.ay = R.chord[o + 1] + dy; out.bx = R.chord[o + 2] + dx; out.by = R.chord[o + 3] + dy; out.r = r;
    return out;
  };
  R.joinRunsOf = (j) => R.joinViews[j];
  R.joinDisc = function joinDisc(j, out = { x: 0, y: 0, r: 0 }) {
    const J = graph.joins;
    out.x = J.x[j]; out.y = J.y[j]; out.r = (J.reach[j] + J.k[j]) * BOUND_HEADROOM;
    return out;
  };
  R.pastRows = function pastRows(list) {
    let n = 0;
    for (let r = 0; r < graph.nRows; r++) {
      const rec = graph.rows[r];
      let past = false;
      const o = r * MAT, wasOn = R.count[r] > 0;
      if (!!rec.on !== wasOn && (rec.on || wasOn)) past = true;
      else if (rec.on) {
        if (R.mat[o] !== rec.casing || R.mat[o + 1] !== glowReachOf(rec) || R.mat[o + 2] !== (rec.sel > 0 ? 1 : 0) || R.mat[o + 3] !== ((rec.flags & F_SHADOW) ? 1 : 0)) past = true;
        else {
          for (let q = 0; q < R.views[r].length && !past; q++) {
            const id = R.views[r][q], i0 = R.seg[id * 2], i1 = Math.min(N_SAMPLES - 1, R.seg[id * 2 + 1] + 1);
            for (let i = i0; i <= i1; i++) if (graph.rad[r * NS + i] * BOUND_HEADROOM > R.radB[id] + 1e-4) { past = true; break; }
          }
        }
      }
      if (past) list[n++] = r;
    }
    return n;
  };
  R.rebuildRows = function rebuildRows(rows, n = rows.length) {
    R.nChanged = 0;
    if (graph.nRows !== R.nRows) return R.build().nChanged;
    for (let k = 0; k < n; k++) { const r = rows[k]; if (r >= 0 && r < graph.nRows) rowRuns(r, false); }
    joinRuns(true);
    R.version++;
    return R.nChanged;
  };
  R.packRuns = function packRuns(out, rows = null, n = 0) {
    const W = RUNS_PER_ROW * RUN_TEXELS, need = W * R.nRows * 4;
    if (!out.data || out.data.length < need) { const d = new Float32Array(need); if (out.data) d.set(out.data); out.data = d; out.dirty = null; rows = null; }   // alloc-rare: with the vessel rows
    out.width = W; out.height = R.nRows;
    const lo = rows ? 1e9 : 0, hiInit = rows ? -1 : R.nRows - 1;
    let r0 = lo, r1 = hiInit;
    const put = (r) => {
      for (let k = 0; k < RUNS_PER_ROW; k++) {
        const id = r * RUNS_PER_ROW + k, t = (r * W + k * RUN_TEXELS) * 4, o = id * 4, on = R.flags[id] & R_ON;
        const d = out.data;
        d[t] = on ? R.chord[o] : 0; d[t + 1] = on ? R.chord[o + 1] : 0; d[t + 2] = on ? R.chord[o + 2] : 0; d[t + 3] = on ? R.chord[o + 3] : 0;
        d[t + 4] = on ? R.rad[o] : 0; d[t + 5] = on ? R.rad[o + 1] : 0; d[t + 6] = on ? R.rad[o + 2] : 0; d[t + 7] = on ? R.rad[o + 3] : 0;
        d[t + 8] = R.seg[id * 2]; d[t + 9] = R.seg[id * 2 + 1]; d[t + 10] = R.flags[id]; d[t + 11] = 0;
        d[t + 12] = R.box[o]; d[t + 13] = R.box[o + 1]; d[t + 14] = R.box[o + 2]; d[t + 15] = R.box[o + 3];
      }
    };
    if (rows) for (let q = 0; q < n; q++) { const r = rows[q]; if (r < 0 || r >= R.nRows) continue; put(r); if (r < r0) r0 = r; if (r > r1) r1 = r; }
    else for (let r = 0; r < R.nRows; r++) put(r);
    out.dirty = r1 >= r0 ? (out.dirtyBuf ??= [0, 0]) : null;   // alloc-rare: once
    if (out.dirty) { out.dirty[0] = r0; out.dirty[1] = r1; }
    return out;
  };
  R.packJoins = function packJoins(out) {
    const J = graph.joins, need = J.n * 3 * 4;
    if (!out.data || out.data.length < need) out.data = new Float32Array(need);   // alloc-rare: with the joins
    for (let j = 0; j < J.n; j++) {
      const t = j * 12, d = out.data;
      d[t] = J.x[j]; d[t + 1] = J.y[j]; d[t + 2] = J.k[j]; d[t + 3] = J.reach[j];
      for (let m = 0; m < 4; m++) d[t + 4 + m] = J.mem[j * 4 + m];
      d[t + 8] = J.trunk[j]; d[t + 9] = J.fork[j]; d[t + 10] = J.fillet[j]; d[t + 11] = 0;
    }
    out.count = J.n;
    return out;
  };
  R.morphBoxes = function morphBoxes(tubes, slackWorld = 0) {
    slack = slackWorld;
    // every run's box (t3) over all moments: the points' hull over the stretch, widened by the largest bound radius and the slack between moments
    const byRow = new Map();
    for (const t of tubes) byRow.set(t.id, t);
    for (let r = 0; r < R.nRows; r++) {
      const tb = byRow.get(r);
      for (let q = 0; q < R.views[r].length; q++) {
        const id = R.views[r][q], i0 = R.seg[id * 2], i1 = Math.min(NS - 1, R.seg[id * 2 + 1] + 1), o = id * 4;
        if (!tb) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const P of tb.path) for (let i = i0; i <= i1; i++) { const x = P[i][0], y = P[i][1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const m = Math.max(R.rad[o], R.rad[o + 1], R.rad[o + 2], R.rad[o + 3]) + Math.hypot(R.look.shOff[0], R.look.shOff[1]) + slack;
        R.box[o] = f32(x0 - m); R.box[o + 1] = f32(y0 - m); R.box[o + 2] = f32(x1 + m); R.box[o + 3] = f32(y1 + m);
      }
    }
    return R;
  };
  void slack; void C_JOIN; void R_GLOW; void R_RING; void R_SHADOW;
  return R;
}
