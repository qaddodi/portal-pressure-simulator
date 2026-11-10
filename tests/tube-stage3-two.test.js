// ?tube=2 (brief S3-D): the Tube keeps stage 2 though the stage 3 programs are ready; the lumen pass draws nothing and the layer pass writes its second flow target.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '?perf&tube=2' };
const { makeHarness } = await import('./tube-pass-harness.js');
const { tubeStage } = await import('../src/ui/tube-stage2.js');

test('the page\'s query is read: stage 2 with the stage 3 programs ready', () => {
  assert.deepEqual({ ...tubeStage(true, undefined, true) }, { stage: 2, joins: 'web' });
});

test('?tube=2: stage 2 draws, the lumen pass does not, and the layer pass keeps all its draw buffers', () => {
  const h = makeHarness({ withStage3: true });
  h.run();
  assert.match(h.gauges[0][1], /^tube 2: /);
  assert.ok(h.log.filter((c) => c.call === 'drawBuffers').every((c) => c.bufs.length === 1));
  assert.equal(h.tubePass.stage(), 2);
  assert.equal(h.runLumen(), false);
  assert.ok(!h.log.some((c) => c.call === 'strips'));
});
