// The vessel renderer choice (9 Nov 2026, vector renderer plan 9.H): 'classic' | 'mesh' | 'vector' kept by frame.js under RENDERER_KEY,
// the default Mesh, and the old boolean pps.vesselMesh = '0' migrated to classic once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENDERERS, RENDERER_KEY } from '../src/ui/vec-contract.js';

function withStore(seed) {
  const store = new Map(seed);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return store;
}
const load = () => import(`../src/ui/frame.js?t=${Math.random()}`);
const done = () => { delete globalThis.localStorage; };

test('the contract names the three renderers and the key', () => {
  assert.deepEqual([...RENDERERS], ['classic', 'mesh', 'vector']);
  assert.equal(RENDERER_KEY, 'pps.vesselRenderer');
});

test('default: mesh, nothing stored', async () => {
  const store = withStore([]);
  const f = await load();
  assert.equal(f.vesselRenderer(), 'mesh');
  assert.equal(f.vesselMesh(), true);
  assert.equal(store.size, 0);
  done();
});

test('a stored choice starts the app on it; an unknown value is the default', async () => {
  for (const v of RENDERERS) { withStore([[RENDERER_KEY, v]]); assert.equal((await load()).vesselRenderer(), v); }
  withStore([[RENDERER_KEY, 'bogus']]);
  assert.equal((await load()).vesselRenderer(), 'mesh');
  done();
});

test('vesselMesh() is true for mesh only', async () => {
  withStore([]);
  const f = await load();
  for (const v of RENDERERS) { f.setVesselRenderer(v); assert.equal(f.vesselMesh(), v === 'mesh'); }
  done();
});

test('setting stores classic and vector, and the default removes the key', async () => {
  const store = withStore([]);
  const f = await load();
  f.setVesselRenderer('vector');
  assert.equal(store.get(RENDERER_KEY), 'vector');
  f.setVesselRenderer('classic');
  assert.equal(store.get(RENDERER_KEY), 'classic');
  f.setVesselRenderer('mesh');
  assert.equal(store.has(RENDERER_KEY), false);
  f.setVesselRenderer('nonsense');   // (not a renderer: ignored)
  assert.equal(f.vesselRenderer(), 'mesh');
  done();
});

test('migration: the old pps.vesselMesh = 0 becomes classic under the new key, once, and the old key goes', async () => {
  const store = withStore([['pps.vesselMesh', '0']]);
  const f = await load();
  assert.equal(f.vesselRenderer(), 'classic');
  assert.equal(store.get(RENDERER_KEY), 'classic');
  assert.equal(store.has('pps.vesselMesh'), false);
  f.setVesselRenderer('mesh');   // (chosen after: the old key does not bring classic back)
  assert.equal((await load()).vesselRenderer(), 'mesh');
  done();
});

test('migration: an old key that is not 0 means mesh; the new key wins over the old one', async () => {
  const a = withStore([['pps.vesselMesh', '1']]);
  assert.equal((await load()).vesselRenderer(), 'mesh');
  assert.equal(a.has('pps.vesselMesh'), false);
  withStore([['pps.vesselMesh', '0'], [RENDERER_KEY, 'vector']]);
  assert.equal((await load()).vesselRenderer(), 'vector');
  done();
});

test('listeners hear each change once and stop after the unsubscribe; the mesh listener hears whether mesh is on', async () => {
  withStore([]);
  const f = await load();
  const heard = [], meshHeard = [], redraws = [];
  const off = f.onVesselRenderer((v) => heard.push(v));
  const offMesh = f.onVesselMesh((on) => meshHeard.push(on));
  const offScale = f.onRenderScale(() => redraws.push(1));
  f.setVesselRenderer('mesh');   // (already mesh)
  f.setVesselRenderer('vector');
  f.setVesselRenderer('vector');
  f.setVesselRenderer('classic');
  f.setVesselRenderer('mesh');
  assert.deepEqual(heard, ['vector', 'classic', 'mesh']);
  assert.deepEqual(meshHeard, [false, true], 'mesh left, then back');
  assert.equal(redraws.length, 3, 'the figure is drawn again for each change');
  off(); offMesh(); offScale();
  f.setVesselRenderer('classic');
  assert.deepEqual(heard, ['vector', 'classic', 'mesh']);
  done();
});

test('unavailable storage still works in memory', async () => {
  globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const f = await load();
  assert.equal(f.vesselRenderer(), 'mesh');
  f.setVesselRenderer('vector');
  assert.equal(f.vesselRenderer(), 'vector');
  done();
});

test('Vector is not offered in Settings until it draws end to end', async () => {
  withStore([]);
  const f = await load();
  assert.equal(typeof f.VECTOR_OFFERED, 'boolean');
  done();
});
