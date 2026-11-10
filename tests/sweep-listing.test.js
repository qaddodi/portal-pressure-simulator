// binSwept's cell lists against the exact distance (R1, 10 Nov 2026). The lists were found by the exact distance from every candidate cell's
// centre to every pair of neighbouring moments' hull of a segment; they are now found by the same comparison without the distance, passing
// a hull over when the centre is farther from its box than the limit. The lists must be the same: sweptDist2, kept as the exact distance,
// is the oracle. (Vessels here have no zero-length segments: two samples on one point make a hull with every cross product zero, which
// the exact test took as holding every point, so a cell beside such a segment, past its reach, was listed; it no longer is.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { binSwept, sweptDist2 } from '../src/ui/veins-sweep.js';
import { CELL } from '../src/ui/veins-bin.js';

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const N = 12, SLACK = 6, HALF = CELL * Math.SQRT1_2;
function course(moments) {
  const x0 = 30 + rnd() * 160, y0 = 30 + rnd() * 160, ang = rnd() * Math.PI * 2, len = 60 + rnd() * 160, mx = (rnd() - 0.5) * 90, my = (rnd() - 0.5) * 90;
  return Array.from({ length: moments }, (_, m) => Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1), bend = Math.sin(u * Math.PI * (1 + m * 0.4)) * 10 * (m + 1);
    return [x0 + Math.cos(ang) * len * u - Math.sin(ang) * bend + mx * m / 3, y0 + Math.sin(ang) * len * u + Math.cos(ang) * bend + my * m / 3];
  }));
}

test('the cells and segments binSwept lists are those the exact distance to the swept segment reaches', () => {
  const tubes = [4, 9, 12, 20].map((id, k) => ({ id, path: course(k % 2 ? 3 : 6), reach: 8 + Math.round(rnd() * 10), core: 2 + Math.round(rnd() * 10) }));
  const b = binSwept(tubes, [], { rows: 32, samples: N, slack: SLACK, tight: true });
  // The grid, as binSwept lays it out.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) for (const P of t.path) for (const q of P) { const r = t.reach + SLACK; x0 = Math.min(x0, q[0] - r); y0 = Math.min(y0, q[1] - r); x1 = Math.max(x1, q[0] + r); y1 = Math.max(y1, q[1] + r); }
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const want = new Set(), wet = new Set();
  for (const t of tubes) {
    const lim2 = (t.reach + SLACK + HALF) ** 2, limC2 = (Math.min(t.core, t.reach) + SLACK + HALF) ** 2;
    const R = t.reach + SLACK;
    for (let i = 0; i < N - 1; i++) {
      // (The cells a segment is tried in: those its box, widened by the reach, touches.)
      let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
      for (const P of t.path) for (const q of [P[i], P[i + 1]]) { ax0 = Math.min(ax0, q[0]); ay0 = Math.min(ay0, q[1]); ax1 = Math.max(ax1, q[0]); ay1 = Math.max(ay1, q[1]); }
      const cx0 = Math.max(0, Math.floor((ax0 - R - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((ax1 + R - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((ay0 - R - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((ay1 + R - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const d = sweptDist2(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, t.path, i);
      if (d <= lim2) want.add(`${x0 + cx * CELL},${y0 + cy * CELL},${t.id},${i}`);
      if (d <= limC2) wet.add(`${x0 + cx * CELL},${y0 + cy * CELL}`);
      }
    }
  }
  const got = new Set(), gotWet = new Set();
  for (let c = 0; c < b.nCells; c++) {
    const o = c * 6, key = `${b.cells[o]},${b.cells[o + 1]}`;
    for (let e = b.cells[o + 2]; e < b.cells[o + 2] + b.cells[o + 3]; e++) if (b.ent[e * 8 + 5] !== -1) got.add(`${key},${b.ent[e * 8 + 4]},${b.ent[e * 8 + 5]}`);
  }
  for (let k = 0; k < b.nBlood; k++) gotWet.add(`${b.blood[k * 6]},${b.blood[k * 6 + 1]}`);
  assert.ok(want.size > 200, `${want.size} segment entries to judge`);
  assert.deepEqual([...got].sort(), [...want].sort());
  assert.deepEqual([...gotWet].sort(), [...wet].sort());
});

test('a vessel that stands still is listed by its distance, not everywhere', () => {
  const P = Array.from({ length: N }, (_, i) => [20 + i * 10, 40]);
  const b = binSwept([{ id: 3, path: [P, P, P], reach: 8, core: 4 }], [], { rows: 16, samples: N, slack: SLACK });
  assert.ok(b.nCells > 0 && b.nCells < 80, `${b.nCells} cells`);
});
