import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweptRowBoxes, rowBoxesFromSwept, rowsInside, BOX_FLOATS } from '../src/ui/tube-cull.js';

// R1b-13 (full app review, 15 Nov 2026): the change between the views is culled by the boxes of its stretch, made once from the stretch's samples.
// Node only; the sources' shapes are pinned in scripts/rules-lint.mjs (PR-02).

const N = 8;   // (points a row: the box maths does not care how many)
const rowAt = (cx, cy, wob) => Array.from({ length: N }, (_, i) => [cx + i * 10 + wob, cy + Math.sin(i + wob) * 20]);
// A stretch of three moments for rows 1, 2 and 4 of six; the frames between lie on the straight blend of two neighbouring moments (plus up to the slack).
const path = new Map([[1, [rowAt(0, 0, 0), rowAt(200, 100, 5), rowAt(400, 0, 9)]], [2, [rowAt(-300, 50, 0), rowAt(-250, 80, 1)]], [4, [rowAt(1000, 1000, 0)]]]);
const SLACK = 6;

test('sweptRowBoxes: a row not in the stretch keeps the empty box; a listed row holds every sample grown by the slack', () => {
  const b = sweptRowBoxes(path, SLACK, 6, null);
  for (const r of [0, 3, 5]) { assert.equal(b[r * BOX_FLOATS], Infinity); assert.equal(b[r * BOX_FLOATS + 2], -Infinity); }
  for (const [row, moments] of path) for (const P of moments) for (const [x, y] of P) {
    const o = row * BOX_FLOATS;
    assert.ok(b[o] <= x - SLACK && b[o + 1] <= y - SLACK && b[o + 2] >= x + SLACK && b[o + 3] >= y + SLACK, `row ${row} holds sample ${x},${y} with its slack`);
  }
});

test('every frame between two moments, a point off the straight line by up to the slack, lies inside its row\'s box', () => {
  const b = sweptRowBoxes(path, SLACK, 6, null);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [row, moments] of path) for (let m = 0; m + 1 < moments.length; m++) for (let t = 0; t <= 1; t += 0.05) for (let i = 0; i < N; i++) {
    const x = moments[m][i][0] + (moments[m + 1][i][0] - moments[m][i][0]) * t + (rnd() * 2 - 1) * SLACK * 0.7;
    const y = moments[m][i][1] + (moments[m + 1][i][1] - moments[m][i][1]) * t + (rnd() * 2 - 1) * SLACK * 0.7;
    const o = row * BOX_FLOATS;
    assert.ok(x >= b[o] && x <= b[o + 2] && y >= b[o + 1] && y <= b[o + 3], `row ${row}, t ${t.toFixed(2)}, point ${i}`);
  }
});

test('rowBoxesFromSwept: grown by each row\'s lumen; an off row is empty; a row with points the stretch does not list is never left out', () => {
  const swept = sweptRowBoxes(path, SLACK, 6, null), on = new Uint8Array([0, 1, 1, 1, 1, 0]), hr = new Float32Array([0, 10, 10, 10, 10, 0]);
  const out = rowBoxesFromSwept(swept, hr, 6, on, {});
  assert.equal(out.n, 6); assert.equal(out.on, 4);
  assert.equal(out.boxes[0], Infinity); assert.equal(out.boxes[5 * BOX_FLOATS], Infinity);
  assert.ok(out.boxes[1 * BOX_FLOATS] <= swept[1 * BOX_FLOATS] - 10 + 1e-3, 'grown by the lumen');
  // row 3 has points in the bundle but no samples in the stretch: its box covers the whole world
  assert.ok(out.boxes[3 * BOX_FLOATS] < -1e8 && out.boxes[3 * BOX_FLOATS + 2] > 1e8);
  // with no boxes at all, every row with points is kept
  const none = rowBoxesFromSwept(null, hr, 6, on, {});
  assert.ok(none.boxes[1 * BOX_FLOATS] < -1e8);
});

test('rows far from the layer are left out for the whole stretch, rows the stretch passes through it are kept, whatever the frame', () => {
  const swept = sweptRowBoxes(path, SLACK, 6, null), on = new Uint8Array([0, 1, 1, 0, 1, 0]), hr = new Float32Array(6).fill(5);
  const out = rowBoxesFromSwept(swept, hr, 6, on, {}), inside = new Uint8Array(6).fill(2);
  rowsInside(out.boxes, 6, [100, 0, 300, 120], 0, inside);   // (the layer: the middle of row 1's journey)
  assert.equal(inside[1], 1, 'row 1 crosses the layer');
  assert.equal(inside[2], 0, 'row 2 stays left of it');
  assert.equal(inside[4], 0, 'row 4 stays far below');
});
