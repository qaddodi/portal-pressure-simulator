// The vector renderer's adaptive leaves (docs/recommendations/vector-renderer-plan-r1.md section 2.3; workstream K). CPU only, no GL.
//
// leafAt(tables, wx, wy)   the JS mirror of vecLeafAt (vec-hier-glsl.js): the leaf index at a world point, -1 for none. The same arithmetic in the
//                          same order, with every float32 step rounded (Math.fround), so a test can compare the two on any point.
// boundHit(...)            the JS mirror of vecBoundHit.
// (the builder, buildLeaves / rebuildLeaves, follows in this file)
import {
  CELL_SIZE, MAX_DEPTH, CELL_LEAF, C_LUMEN, C_SHADOW, C_GLOW, C_JOIN, RUN_F_MORPH, RUN_TEXELS, RUNS_PER_ROW,
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
  let dx, dy;
  if ((runs[base + 8 + 2] & RUN_F_MORPH) !== 0) {
    dx = Math.max(runs[base + 12] - px, px - runs[base + 14], 0); dy = Math.max(runs[base + 13] - py, py - runs[base + 15], 0);
  } else {
    const ax = runs[base], ay = runs[base + 1], abx = runs[base + 2] - ax, aby = runs[base + 3] - ay, apx = px - ax, apy = py - ay;
    const l2 = abx * abx + aby * aby;
    const h = l2 > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby) / l2)) : 0;
    dx = apx - abx * h; dy = apy - aby * h;
  }
  return dx * dx + dy * dy;
}
/** Whether a point is inside a run's bound for one contribution (the mirror of vecBoundHit; the shader's float32 rounding is not replayed). */
export const boundHit = (runs, runId, contribution, px, py, shOff) => {
  if (contribution === C_JOIN) return true;
  const row = Math.floor(runId / RUNS_PER_ROW), k = runId % RUNS_PER_ROW;
  const r = runs[(row * RUNS_PER_ROW * RUN_TEXELS + k * RUN_TEXELS) * 4 + 4 + (contribution === C_LUMEN ? 0 : contribution === C_SHADOW ? 1 : contribution === C_GLOW ? 2 : 3)];
  return r > 0 && boundDist2(runs, runId, contribution, px, py, shOff) <= r * r;
};
