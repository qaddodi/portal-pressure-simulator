// M19 (docs/recommendations/implicit-state-machines.md): the crossfade's frame pump is a counted lease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { createLease } = await import('../src/ui/slide-txn.js');

test('M19 two overlapping crossfade callbacks: the first one finishing leaves the pump on', () => {
  let pump = false;
  const lease = createLease(() => { pump = true; }, () => { pump = false; });
  const a = lease.take(), b = lease.take();
  assert.equal(pump, true);
  a(); a();
  assert.equal(pump, true, 'the second callback still holds it');
  b();
  assert.equal(pump, false);
});
