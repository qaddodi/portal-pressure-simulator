// Settings > Display > "Tube vessel renderer" (10 Nov 2026): the choice frame.js keeps. Default OFF; pps.vesselTube is '1' when on, the key is removed when off.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function withStore(seed) {
  const store = new Map(seed);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return store;
}
const load = () => import(`../src/ui/frame.js?t=${Math.random()}`);

test('vessel tube: off by default, nothing stored', async () => {
  const store = withStore([]);
  const f = await load();
  assert.equal(f.vesselTube(), false);
  assert.equal(store.has('pps.vesselTube'), false);
  delete globalThis.localStorage;
});

test('vessel tube: a stored 1 starts it on; any other stored value starts it off', async () => {
  withStore([['pps.vesselTube', '1']]);
  assert.equal((await load()).vesselTube(), true);
  withStore([['pps.vesselTube', '0']]);
  assert.equal((await load()).vesselTube(), false);
  delete globalThis.localStorage;
});

test('vessel tube: on stores 1, off removes the key', async () => {
  const store = withStore([]);
  const f = await load();
  f.setVesselTube(true);
  assert.equal(f.vesselTube(), true);
  assert.equal(store.get('pps.vesselTube'), '1');
  f.setVesselTube(false);
  assert.equal(f.vesselTube(), false);
  assert.equal(store.has('pps.vesselTube'), false);
  delete globalThis.localStorage;
});

test('vessel tube: listeners hear each change once, not a repeat, and stop after the unsubscribe', async () => {
  withStore([]);
  const f = await load();
  const heard = [];
  const off = f.onVesselTube((v) => heard.push(v));
  f.setVesselTube(false);   // (already off: nothing to say)
  f.setVesselTube(true);
  f.setVesselTube(true);
  f.setVesselTube(false);
  assert.deepEqual(heard, [true, false]);
  off();
  f.setVesselTube(true);
  assert.deepEqual(heard, [true, false]);
  delete globalThis.localStorage;
});

test('vessel tube: the figure is drawn again on a change (the render subscribers hear it), and not on a repeat', async () => {
  withStore([]);
  const f = await load();
  let n = 0;
  const off = f.onRenderScale(() => { n++; });
  f.setVesselTube(true);
  f.setVesselTube(true);
  assert.equal(n, 1);
  off();
  delete globalThis.localStorage;
});

test('vessel tube: unavailable storage still works in memory', async () => {
  globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const f = await load();
  assert.equal(f.vesselTube(), false);
  f.setVesselTube(true);
  assert.equal(f.vesselTube(), true);
  delete globalThis.localStorage;
});
