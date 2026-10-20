import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipBox, mapBox } from '../src/ui/fit-box.js';

test('a clipped part is measured only inside its clip box', () => {
  assert.deepEqual(clipBox({ x: 300, y: 500, width: 800, height: 700 }, { x: 420, y: 560, width: 520, height: 380 }), { x: 420, y: 560, width: 520, height: 380 });
  assert.equal(clipBox({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 }), null);
});
test('a group transform carries the box', () => {
  assert.deepEqual(mapBox({ x: 10, y: 20, width: 30, height: 40 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: -26 }), { x: 10, y: -6, width: 30, height: 40 });
  assert.deepEqual(mapBox({ x: 0, y: 0, width: 10, height: 10 }, { a: 2, b: 0, c: 0, d: 2, e: 5, f: 5 }), { x: 5, y: 5, width: 20, height: 20 });
});
