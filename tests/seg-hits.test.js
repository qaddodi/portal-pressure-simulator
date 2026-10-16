// The figure's label placement asks, thousands of times a frame while a pinch re-solves the labels, which vessel segments
// a label's box touches. The allocation-free version must answer exactly as the original did, edge cases included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segHitsBox, gridHits } from '../src/ui/seg-hits.js';

// The original (stage.js before 16 Oct 2026), kept as the reference.
function refHits(sg, r, m) {
  const x0 = r.x0 - m, y0 = r.y0 - m, x1 = r.x1 + m, y1 = r.y1 + m;
  let t0 = 0, t1 = 1;
  const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
  for (const [p, q] of [[-dx, sg.x0 - x0], [dx, x1 - sg.x0], [-dy, sg.y0 - y0], [dy, y1 - sg.y0]]) {
    if (p === 0) { if (q < 0) return false; } else { const u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  }
  return true;
}
function refCount(grid, cell, r, margin, stamp) {
  let n = 0;
  for (let gx = Math.floor((r.x0 - margin) / cell); gx <= Math.floor((r.x1 + margin) / cell); gx++) {
    for (let gy = Math.floor((r.y0 - margin) / cell); gy <= Math.floor((r.y1 + margin) / cell); gy++) {
      const c = grid.get(gx * 4096 + gy);
      if (!c) continue;
      for (const sg of c) { if (sg.stamp === stamp) continue; sg.stamp = stamp; if (refHits(sg, r, sg.hw + margin)) n++; }
    }
  }
  return n;
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// Coordinates on a coarse lattice too, so segments run exactly along, end exactly on, and stand exactly at a box's edges.
const coord = (span) => (rnd() < 0.4 ? Math.round(rnd() * 8) * (span / 8) : rnd() * span);

test('segHitsBox answers exactly as the original, edge cases included', () => {
  let hits = 0;
  for (let i = 0; i < 200000; i++) {
    const sg = { x0: coord(400), y0: coord(400), x1: rnd() < 0.1 ? NaN : coord(400), y1: coord(400) };
    if (Number.isNaN(sg.x1)) sg.x1 = sg.x0;   // vertical, and with y equal too, a point
    if (rnd() < 0.1) sg.y1 = sg.y0;           // horizontal
    const x = coord(400), y = coord(400), r = { x0: x, y0: y, x1: x + coord(120), y1: y + coord(60) };
    const m = [0, 3, 2.5, rnd() * 10][i % 4];
    const want = refHits(sg, r, m);
    assert.equal(segHitsBox(sg, r, m), want, JSON.stringify({ sg, r, m }));
    hits += want;
  }
  assert.ok(hits > 10000 && hits < 190000, `a fair mix of hits and misses (${hits})`);
});

test('gridHits counts exactly as the original, and `any` is whether that count is above zero', () => {
  const CELL = 64;
  for (let trial = 0; trial < 40; trial++) {
    const grid = new Map(), segs = [];
    for (let i = 0; i < 300; i++) {
      const x0 = coord(1200) - 200, y0 = coord(1600) - 200, sg = { x0, y0, x1: x0 + (rnd() - 0.5) * 300, y1: y0 + (rnd() - 0.5) * 300, hw: rnd() * 12, stamp: 0 };
      segs.push(sg);
      for (let gx = Math.floor((Math.min(sg.x0, sg.x1) - sg.hw) / CELL); gx <= Math.floor((Math.max(sg.x0, sg.x1) + sg.hw) / CELL); gx++) {
        for (let gy = Math.floor((Math.min(sg.y0, sg.y1) - sg.hw) / CELL); gy <= Math.floor((Math.max(sg.y0, sg.y1) + sg.hw) / CELL); gy++) {
          const k = gx * 4096 + gy;
          (grid.get(k) || grid.set(k, []).get(k)).push(sg);
        }
      }
    }
    let stamp = 0;
    for (let i = 0; i < 400; i++) {
      const x = coord(1200) - 200, y = coord(1600) - 200, r = { x0: x, y0: y, x1: x + 20 + rnd() * 140, y1: y + 14 + rnd() * 50 };
      for (const margin of [0, 3]) {
        const want = refCount(grid, CELL, r, margin, ++stamp);
        assert.equal(gridHits(grid, CELL, r, margin, ++stamp), want);
        assert.equal(gridHits(grid, CELL, r, margin, ++stamp, true) > 0, want > 0);
      }
    }
  }
});
