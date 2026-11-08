// Settings > Display > "Mesh vessel renderer" (8 Nov 2026): the choice frame.js keeps. Default ON; pps.vesselMesh is '0' when off, the key is removed when on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function withStore(seed) {
  const store = new Map(seed);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return store;
}
const load = () => import(`../src/ui/frame.js?t=${Math.random()}`);

test('vessel mesh: on by default, nothing stored', async () => {
  const store = withStore([]);
  const f = await load();
  assert.equal(f.vesselMesh(), true);
  assert.equal(store.has('pps.vesselMesh'), false);
  delete globalThis.localStorage;
});

test('vessel mesh: a stored 0 starts it off; any other stored value starts it on', async () => {
  withStore([['pps.vesselMesh', '0']]);
  assert.equal((await load()).vesselMesh(), false);
  withStore([['pps.vesselMesh', '1']]);
  assert.equal((await load()).vesselMesh(), true);
  delete globalThis.localStorage;
});

test('vessel mesh: off stores 0, on removes the key', async () => {
  const store = withStore([]);
  const f = await load();
  f.setVesselMesh(false);
  assert.equal(f.vesselMesh(), false);
  assert.equal(store.get('pps.vesselMesh'), '0');
  f.setVesselMesh(true);
  assert.equal(f.vesselMesh(), true);
  assert.equal(store.has('pps.vesselMesh'), false);
  delete globalThis.localStorage;
});

test('vessel mesh: listeners hear each change once, not a repeat, and stop after the unsubscribe', async () => {
  withStore([]);
  const f = await load();
  const heard = [];
  const off = f.onVesselMesh((v) => heard.push(v));
  f.setVesselMesh(true);   // (already on: nothing to say)
  f.setVesselMesh(false);
  f.setVesselMesh(false);
  f.setVesselMesh(true);
  assert.deepEqual(heard, [false, true]);
  off();
  f.setVesselMesh(false);
  assert.deepEqual(heard, [false, true]);
  delete globalThis.localStorage;
});

test('vessel mesh: unavailable storage still works in memory', async () => {
  globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const f = await load();
  assert.equal(f.vesselMesh(), true);
  f.setVesselMesh(false);
  assert.equal(f.vesselMesh(), false);
  delete globalThis.localStorage;
});
