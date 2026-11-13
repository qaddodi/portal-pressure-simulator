// The lumen layer keeps its depth (brief PD part 2, 10 Nov 2026): the stale rule as a function of its events, and the lumen pass with a fresh depth (no clear, no prepass).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDepthStamp } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';

const M = [1, 0, 0, 1, 10, 20], WO = [0, 0], LA = [0, 0];

test('a depth is stale until it has been drawn, fresh after, and any layer draw, new target or loss makes it stale', () => {
  const d = createDepthStamp();
  assert.equal(d.needs(M, WO, LA, 640, 480), true, 'never drawn');
  d.drawn(M, WO, LA, 640, 480);
  assert.equal(d.needs(M, WO, LA, 640, 480), false, 'fresh: kept');
  assert.equal(d.needs(M, WO, LA, 640, 480), false, 'still');
  d.stale();                       // the vessel layer was drawn (whole, a piece, marked cells), the target was made again, or the context was lost
  assert.equal(d.needs(M, WO, LA, 640, 480), true);
  d.drawn(M, WO, LA, 640, 480);
  assert.equal(d.fresh, true);
});

test('a changed view matrix, wrap, window or size makes a fresh depth stale, and it stays so until drawn again', () => {
  const d = createDepthStamp();
  for (const [m, wo, la, w, h] of [[[1, 0, 0, 1, 11, 20], WO, LA, 640, 480], [[2, 0, 0, 1, 10, 20], WO, LA, 640, 480], [M, [1, 0], LA, 640, 480], [M, WO, [0, 3], 640, 480], [M, WO, LA, 641, 480], [M, WO, LA, 640, 481]]) {
    d.drawn(M, WO, LA, 640, 480);
    assert.equal(d.needs(m, wo, la, w, h), true, JSON.stringify([m, wo, la, w, h]));
    assert.equal(d.needs(M, WO, LA, 640, 480), true, 'not fresh again by itself');
  }
});

test('the lumen pass with a fresh depth: no depth clear, no prepass, the lumens on LEQUAL with the bands the prepass used', () => {
  const h = makeHarness({ withStage3: true });
  h.runLumen(true);
  const bands = h.sets.filter((s) => s.name === 'keyBase' && s.prog === 'tubeLumen').map((s) => s.v);
  assert.ok(bands.length > 0);
  h.runLumen(false);
  const draws = h.log.filter((c) => c.call === 'strips' || c.call === 'patch');
  assert.deepEqual(draws.map((c) => `${c.prog}:${c.n}:${c.mask}:${c.depth}`), ['tubeLumen:3:true:LEQUAL', 'tubeWebLumen:4:true:LEQUAL']);
  assert.ok(!h.log.some((c) => c.call === 'clear' && c.what === 'DEPTH'), 'the depth is not cleared');
  assert.ok(!h.log.some((c) => c.call === 'invalidate'), 'nor invalidated');
  assert.deepEqual(h.sets.filter((s) => s.name === 'keyBase' && s.prog === 'tubeLumen').map((s) => s.v), bands, 'the same bands');
});
