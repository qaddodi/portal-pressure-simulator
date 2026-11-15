import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listMatrix } from '../src/ui/transform-read.js';

// A fake SVG transform list: items hold matrices; consolidate would rewrite the list (counted, so a read that calls it fails).
const mat = (a, b, c, d, e, f) => ({ a, b, c, d, e, f });
const list = (...ms) => {
  const l = { numberOfItems: ms.length, writes: 0, getItem: (i) => ({ matrix: ms[i] }), consolidate() { l.writes++; throw new Error('consolidate() rewrites the attribute'); } };
  return l;
};
const near = (m, e) => { for (const k of 'abcdef') assert.ok(Math.abs(m[k] - e[k]) < 1e-9, `${k}: ${m[k]} vs ${e[k]}`); };

test('listMatrix: an empty or absent list gives null; one item is its own matrix', () => {
  const out = mat(1, 0, 0, 1, 0, 0);
  assert.equal(listMatrix(null, out), null);
  assert.equal(listMatrix(list(), out), null);
  near(listMatrix(list(mat(2, 0, 0, 3, 4, 5)), out), mat(2, 0, 0, 3, 4, 5));
});

test('listMatrix: several items multiply left to right, as consolidate() would have made them (translate(10 20) scale(2): the point (1,1) lands at (12, 22))', () => {
  const out = mat(1, 0, 0, 1, 0, 0);
  const m = listMatrix(list(mat(1, 0, 0, 1, 10, 20), mat(2, 0, 0, 2, 0, 0)), out);
  near(m, mat(2, 0, 0, 2, 10, 20));
  assert.equal(m.a * 1 + m.c * 1 + m.e, 12); assert.equal(m.b * 1 + m.d * 1 + m.f, 22);
  // a rotate by 90 degrees after a translate: (1,0) -> rotated (0,1) -> moved to (10, 21)
  const r = listMatrix(list(mat(1, 0, 0, 1, 10, 20), mat(0, 1, -1, 0, 0, 0)), out);
  assert.equal(r.a * 1 + r.e, 10); assert.equal(r.b * 1 + r.f, 21);
});

test('listMatrix never writes to the list (OG-1: consolidate() rewrote the transform attribute and woke the page observers)', () => {
  const l = list(mat(1, 0, 0, 1, 1, 2), mat(1, 0, 0, 1, 3, 4));
  listMatrix(l, mat(1, 0, 0, 1, 0, 0));
  assert.equal(l.writes, 0);
});
