// The built site's service worker (scripts/build.mjs) keeps the previous version's cache on an update, so a tab left open
// across a deploy still finds its own hashed files (the server only has the new ones); older caches and the source
// site's go, and the other copy's (live site or preview) are never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const line = src.split('\n').find((l) => l.startsWith("self.addEventListener('activate'"));

test('an update keeps the previous cache and drops the older ones', async () => {
  assert.ok(line, 'the activate handler is on one line in scripts/build.mjs');
  const SCOPE = 'pps@/preview/@', CACHE = SCOPE + 'v3';
  let keys = ['pps-v3', 'pps@/@live1', SCOPE + 'v1', SCOPE + 'v2', CACHE];
  let onActivate = null, done = null;
  const self = { addEventListener: (t, fn) => { if (t === 'activate') onActivate = fn; }, clients: { claim: () => Promise.resolve() } };
  const caches = { keys: async () => [...keys], delete: async (k) => { keys = keys.filter((x) => x !== k); return true; } };
  new Function('self', 'caches', 'SCOPE', 'CACHE', line)(self, caches, SCOPE, CACHE);
  onActivate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual(keys, ['pps@/@live1', SCOPE + 'v2', CACHE]);
});
