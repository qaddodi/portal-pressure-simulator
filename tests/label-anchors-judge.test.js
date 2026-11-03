import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from './e2e/label-anchors.mjs';

const segs = [[0, 100, 400, 100, 4, 'v']];
const ok = { dots: [{ k: 'n:A', x: 100, y: 100 }], anchors: { 'n:A': { x: 100, y: 100 } }, lines: [{ k: 'n:A', x0: 100, y0: 100, x1: 130, y1: 60 }], segs, items: [{ key: 'n:A', x: 120, y: 40, w: 60, h: 24 }] };

test('a dot on its station on a vessel, its leader from the dot to its label, passes', () => {
  assert.deepEqual(judge(ok, 't'), []);
});
test('a dot off its station, off every vessel, or a leader to nothing, fails', () => {
  assert.match(judge({ ...ok, dots: [{ k: 'n:A', x: 300, y: 300 }] }, 't')[0], /from its station/, 'stale anchor');
  const empty = { ...ok, dots: [{ k: 'n:A', x: 100, y: 300 }], anchors: { 'n:A': { x: 100, y: 300 } }, lines: [] };
  assert.match(judge(empty, 't')[0], /from any vessel/);
  assert.match(judge({ ...ok, lines: [{ k: 'n:A', x0: 100, y0: 100, x1: 600, y1: 400 }] }, 't')[0], /ends .* from its label/);
  assert.match(judge({ ...ok, items: [] }, 't')[0], /no label drawn/);
  assert.match(judge({ ...ok, lines: [{ k: 'n:A', x0: 300, y0: 300, x1: 130, y1: 60 }] }, 't').join(), /does not start at its dot/);
});
