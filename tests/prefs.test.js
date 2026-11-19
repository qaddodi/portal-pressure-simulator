// One door to the device's storage (SHL-6, 19 Nov 2026): the preview keeps its own copy of the keys, so neither copy can read, change or delete the other's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyFor, scopeOf, migrateToPreview, clearAll, persist } from '../src/ui/prefs.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() }; };

test('the scope comes from the path; only the preview renames keys', () => {
  assert.equal(scopeOf('/portal-pressure-simulator/'), 'live');
  assert.equal(scopeOf('/portal-pressure-simulator/preview/'), 'preview');
  assert.equal(scopeOf('/portal-pressure-simulator/preview'), 'preview');
  assert.equal(scopeOf('/preview-notes/'), 'live');
  assert.equal(keyFor('pps.scripts', 'live'), 'pps.scripts');
  assert.equal(keyFor('pps.scripts', 'preview'), 'ppsPreview.scripts');
  assert.equal(keyFor('other.key', 'preview'), 'other.key');
});

test('the first preview visit copies the live keys once, never deletes, and keeps what the preview already has', () => {
  const s = mem({ 'pps.theme': 'navy', 'pps.scripts': '[1]', 'ppsPreview.theme': 'dark', 'unrelated': 'x' });
  assert.equal(migrateToPreview(s), true);
  assert.equal(s.getItem('ppsPreview.scripts'), '[1]');
  assert.equal(s.getItem('ppsPreview.theme'), 'dark', 'a preview value is not overwritten');
  assert.equal(s.getItem('pps.scripts'), '[1]', 'the live keys stay');
  assert.equal(s.getItem('ppsPreview.unrelated'), null);
  assert.equal(migrateToPreview(s), false, 'once');
});

test('Delete everything on the preview leaves the live site\'s data; on the live site it leaves the preview\'s', async () => {
  const caches = new Map([['pps@/app/@v1', 1], ['pps@/app/preview/@v1', 1], ['other-app', 1]]);
  const cacheApi = { keys: async () => [...caches.keys()], delete: async (k) => caches.delete(k) };
  const run = async (scope, path) => {
    const store = mem({ 'pps.scripts': '[live]', 'ppsPreview.scripts': '[prev]', 'ppsPreview.migrated': '1', 'other': 'x' });
    const session = mem({ 'pps.ring': 'r' });
    globalThis.localStorage = store;
    await clearAll({ store, session, cacheApi, scope, path });
    return { store, session };
  };
  let r = await run('preview', '/app/preview/');
  assert.equal(r.store.getItem('pps.scripts'), '[live]', 'the live scripts survive the preview\'s Delete everything');
  assert.equal(r.store.getItem('ppsPreview.scripts'), null);
  assert.equal(r.store.getItem('other'), 'x');
  assert.equal(r.session.length, 0, 'session data goes too');
  assert.deepEqual([...caches.keys()].sort(), ['other-app', 'pps@/app/@v1'], 'only this copy\'s offline cache, not the live copy\'s nor another app\'s');
  caches.set('pps@/app/preview/@v1', 1);
  r = await run('live', '/app/');
  assert.equal(r.store.getItem('ppsPreview.scripts'), '[prev]', 'the preview\'s data survives the live site\'s');
  assert.equal(r.store.getItem('pps.scripts'), null);
  delete globalThis.localStorage;
});

test('persist() asks the browser to keep the data and never throws', async () => {
  assert.equal(await persist(), false);
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { persist: async () => true } }, configurable: true });
  assert.equal(await persist(), true);
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { persist: async () => { throw new Error('no'); } } }, configurable: true });
  assert.equal(await persist(), false);
});
