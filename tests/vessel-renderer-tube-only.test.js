// The Tube is the only vessel renderer (owner, 11 Nov 2026). frame.js keeps no choice, and drops a tester's earlier one (Classic or Mesh,
// stored as pps.vesselRenderer or by the two switches it replaced) the first time it loads. The old renderers are shelved on
// shelf/classic-mesh-renderers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('frame.js: no vessel renderer choice is exported, and an old stored one is removed', async () => {
  const store = new Map([['pps.vesselRenderer', 'classic'], ['pps.vesselTube', '1'], ['pps.vesselMesh', '0'], ['pps.sharp', '1']]);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=${Math.random()}`);
  for (const n of ['vesselRenderer', 'vesselMesh', 'vesselTube', 'setVesselRenderer', 'onVesselRenderer', 'VESSEL_RENDERERS']) assert.equal(f[n], undefined, `${n} is gone`);
  assert.deepEqual([...store.keys()], ['pps.sharp'], 'the three old keys are removed, the rest left');
  delete globalThis.localStorage;
});
