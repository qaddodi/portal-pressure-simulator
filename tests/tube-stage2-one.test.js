// ?tube=1 (brief S2-D): the Tube keeps stage 1 though the four programs are ready; the gauge says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '?tube=1' };
const { makeHarness } = await import('./tube-pass-harness.js');

test('?tube=1 keeps stage 1 with the stage 2 programs ready', () => {
  const h = makeHarness();
  h.run();
  const d = h.log.filter((c) => c.call === 'strips' || c.call === 'patch');
  assert.ok(d.length > 0 && d.every((c) => c.prog === 'tubeStrip' || c.prog === 'tubePatch'));
  assert.match(h.gauges[0][1], /^tube 1: set by \?tube=1, \d+ passes, \d+ strips, \d+ patches drawn$/);
});
