// Anatomy -> Circuit on a phone (Mohammad, 4 Nov 2026): "nothing arrives then they show up pop in existence". The Circuit's solve is longer than
// the change on a phone and its ahead-of-time solve is cut by every Anatomy layout on a playing model, so the new labels were still being solved
// as the figure landed: the ghosts had faded out by the half (1 - 2p), the new labels were held at nothing, and a 160 ms timer faded them in after
// the figure had stopped. Now the old view's labels ride the figure as ghosts at full until the new ones are whole, the two cross over what is
// left of the change, and a solve that lands after the figure swaps in one frame: never a frame with no labels on the figure, and no timer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewXfMix } from '../src/ui/view-xf.js';

test('still solving: the ghosts at full, the new labels at nothing, at every progress', () => {
  for (const p of [0, 0.25, 0.5, 0.75, 1]) assert.deepEqual(viewXfMix(p, null), { o: 1, n: 0 });
});

test('solved ahead (at the tap): the crossfade is the change\'s own second half, as before', () => {
  assert.deepEqual(viewXfMix(0.2, 0), { o: 1, n: 0 });
  assert.deepEqual(viewXfMix(0.5, 0), { o: 1, n: 0 });
  const mid = viewXfMix(0.75, 0);
  assert.ok(mid.o < 0.03 && mid.n < 0.03, 'handed over at the middle: neither set strong on top of the other');
  assert.deepEqual(viewXfMix(1, 0), { o: 0, n: 1 });
  assert.deepEqual(viewXfMix(0.75, 0.3), viewXfMix(0.75, 0), 'landed before the half: the same law');
});

test('solved late in the change: the two cross over what is left of it, whole as the figure lands', () => {
  assert.deepEqual(viewXfMix(0.7, 0.7), { o: 1, n: 0 });
  const mid = viewXfMix(0.85, 0.7);
  assert.ok(mid.o < 0.03 && mid.n < 0.03, 'handed over at the middle of what is left');
  assert.deepEqual(viewXfMix(1, 0.7), { o: 0, n: 1 });
  const a = viewXfMix(0.8, 0.7), b = viewXfMix(0.9, 0.7);
  assert.ok(b.n >= a.n && b.o <= a.o, 'monotonic');
  for (let p = 0.7; p <= 1; p += 0.01) { const m = viewXfMix(p, 0.7); assert.ok(Math.min(m.o, m.n) < 0.03, `never both sets showing (p ${p.toFixed(2)}: ${m.o}, ${m.n})`); }
});

test('solved after the figure landed: the swap is that frame', () => {
  assert.deepEqual(viewXfMix(1, 1), { o: 0, n: 1 });
});
