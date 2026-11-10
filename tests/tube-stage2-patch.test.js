// ?tubejoin=patch (brief S2-D): stage 2 with the patches as the joins: the strips as in stage 2, the patches in the webs' place, the web programs unused.
// The query is read once, when the stage module is loaded, so this file sets it first and has the module to itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '?perf&tubejoin=patch' };
const { makeHarness } = await import('./tube-pass-harness.js');
const { tubeStage } = await import('../src/ui/tube-stage2.js');

test('the page\'s query is read: stage 2 with patches', () => {
  assert.deepEqual({ ...tubeStage(true) }, { stage: 2, joins: 'patch' });
  assert.deepEqual({ ...tubeStage(false) }, { stage: 1, joins: 'patch' });
});

test('stage 2 with patch joins: lean and depth strips, patches in two parts, no web program drawn', () => {
  const h = makeHarness({ patches: true });
  h.run();
  const d = h.log.filter((c) => c.call === 'strips' || c.call === 'patch');
  assert.ok(d.length > 0);
  assert.ok(!d.some((c) => c.prog === 'tubeWeb' || c.prog === 'tubeWebDepth'), 'no web');
  assert.ok(d.some((c) => c.prog === 'tubeDepth') && d.some((c) => c.prog === 'tubeLean'));
  assert.deepEqual(d.filter((c) => c.call === 'patch').map((c) => `${c.prog}:${c.mask === false ? 'pre' : 'col'}`), ['tubePatch:pre', 'tubePatch:pre', 'tubePatch:col', 'tubePatch:col'], 'one group, two parts, in the prepass and in colour');
  assert.match(h.gauges[0][1], /^tube 2: \d+ passes, strips drawn \d+ of \d+( \(not culled\))?, \d+ strip draws \(\d+ plain\), \d+ patches$/);
});
