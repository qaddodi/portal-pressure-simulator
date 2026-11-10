// Settings > Display > "Vessel renderer" (10 Nov 2026): the one choice frame.js keeps, 'classic' | 'mesh' | 'tube'. Default mesh; pps.vesselRenderer holds the
// other two and the key is removed for the default. The two switches it replaced (pps.vesselMesh from 8 Nov, pps.vesselTube from 10 Nov) are carried over once.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function withStore(seed) {
  const store = new Map(seed);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return store;
}
const load = () => import(`../src/ui/frame.js?t=${Math.random()}`);

test('vessel renderer: mesh by default, nothing stored, and the derived readers agree', async () => {
  const store = withStore([]);
  const f = await load();
  assert.equal(f.vesselRenderer(), 'mesh');
  assert.equal(f.vesselMesh(), true);
  assert.equal(f.vesselTube(), false);
  assert.equal(store.size, 0);
  delete globalThis.localStorage;
});

test('vessel renderer: a stored choice starts it; anything else starts mesh', async () => {
  for (const v of ['classic', 'tube']) { withStore([['pps.vesselRenderer', v]]); assert.equal((await load()).vesselRenderer(), v); }
  withStore([['pps.vesselRenderer', 'vector']]);
  assert.equal((await load()).vesselRenderer(), 'mesh');
  delete globalThis.localStorage;
});

test('vessel renderer: each choice sets its own reader and only its own; mesh removes the key, the others store their name', async () => {
  const store = withStore([]);
  const f = await load();
  f.setVesselRenderer('tube');
  assert.deepEqual([f.vesselMesh(), f.vesselTube()], [false, true]);
  assert.equal(store.get('pps.vesselRenderer'), 'tube');
  f.setVesselRenderer('classic');
  assert.deepEqual([f.vesselMesh(), f.vesselTube()], [false, false]);
  assert.equal(store.get('pps.vesselRenderer'), 'classic');
  f.setVesselRenderer('mesh');
  assert.deepEqual([f.vesselMesh(), f.vesselTube()], [true, false]);
  assert.equal(store.has('pps.vesselRenderer'), false);
  f.setVesselRenderer('vector');   // (not a choice: ignored)
  assert.equal(f.vesselRenderer(), 'mesh');
  delete globalThis.localStorage;
});

test('vessel renderer: a tester\'s earlier switches carry over once and are removed (tube wins over mesh off)', async () => {
  let store = withStore([['pps.vesselTube', '1'], ['pps.vesselMesh', '0']]);
  let f = await load();
  assert.equal(f.vesselRenderer(), 'tube');
  assert.deepEqual([...store.entries()], [['pps.vesselRenderer', 'tube']]);
  store = withStore([['pps.vesselMesh', '0']]);
  f = await load();
  assert.equal(f.vesselRenderer(), 'classic');
  assert.deepEqual([...store.entries()], [['pps.vesselRenderer', 'classic']]);
  store = withStore([['pps.vesselMesh', '1'], ['pps.vesselTube', '0']]);
  f = await load();
  assert.equal(f.vesselRenderer(), 'mesh');
  assert.equal(store.size, 0, 'the default stores nothing and the old keys are gone');
  delete globalThis.localStorage;
});

test('vessel renderer: listeners hear each change once, not a repeat, and stop after the unsubscribe', async () => {
  withStore([]);
  const f = await load();
  const heard = [];
  const off = f.onVesselRenderer((v) => heard.push(v));
  f.setVesselRenderer('mesh');   // (already mesh: nothing to say)
  f.setVesselRenderer('tube');
  f.setVesselRenderer('tube');
  f.setVesselRenderer('classic');
  assert.deepEqual(heard, ['tube', 'classic']);
  off();
  f.setVesselRenderer('mesh');
  assert.deepEqual(heard, ['tube', 'classic']);
  delete globalThis.localStorage;
});

test('vessel renderer: the figure is drawn again on a change (the render subscribers hear it), and not on a repeat', async () => {
  withStore([]);
  const f = await load();
  let n = 0;
  const off = f.onRenderScale(() => { n++; });
  f.setVesselRenderer('tube');
  f.setVesselRenderer('tube');
  assert.equal(n, 1);
  off();
  delete globalThis.localStorage;
});

test('vessel renderer: unavailable storage still works in memory', async () => {
  globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const f = await load();
  assert.equal(f.vesselRenderer(), 'mesh');
  f.setVesselRenderer('tube');
  assert.equal(f.vesselRenderer(), 'tube');
  delete globalThis.localStorage;
});
