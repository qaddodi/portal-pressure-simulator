// B27/B28: the worker's fetch handler stores every successful hashed asset it fetches (the optional lighter-art chunks are left out of the
// install list), and the store runs under waitUntil with a failed write swallowed. Run against the source template and, when built, dist/sw.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const texts = { build: readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8') };
const dist = new URL('../dist/sw.js', import.meta.url);
if (existsSync(dist)) texts.dist = readFileSync(dist, 'utf8');

function load(text) {
  const lines = text.split('\n'), a = lines.findIndex((l) => l.startsWith('const keep = ')), b = lines.findIndex((l) => l.startsWith("self.addEventListener('fetch'"));
  assert.ok(a > 0 && b > a, 'keep and the fetch handler are in the worker');
  const end = lines.findIndex((l, i) => i > b && l.startsWith('});'));
  const code = lines.slice(a, end + 1).join('\n').replace(/\\`/g, '`');
  let onFetch = null;
  const state = { store: new Map(), putGate: null, putFails: false, online: true, waits: [] };
  const cache = { put: async (r, v) => { if (state.putGate) await state.putGate; if (state.putFails) throw new Error('quota'); state.store.set(r.url, v); }, match: async (r) => state.store.get(r.url) };
  const caches = { open: async () => cache, match: async (r) => state.store.get(r.url) };
  const mk = (body) => ({ ok: true, status: 200, body, clone() { return this; } });
  const fetch = async (r) => { if (!state.online) throw new Error('offline'); return mk('net:' + (r.url || r)); };
  const self = { addEventListener: (t, fn) => { if (t === 'fetch') onFetch = fn; } };
  new Function('self', 'caches', 'fetch', 'location', 'CACHE', 'LATER', 'Response', 'URL', code)(self, caches, fetch, { origin: 'https://x.test' }, 'c1', ['assets/inter-greek-1.woff2'], { error: () => 'err' }, URL);
  const run = async (url, mode = 'cors') => {
    const e = { request: { url, method: 'GET', mode }, respondWith: (p) => { e.p = p; }, waitUntil: (p) => state.waits.push(p) };
    onFetch(e); return e.p;
  };
  return { state, run };
}

for (const [name, text] of Object.entries(texts)) {
  test(`${name}: an optional chunk fetched online is served from the cache once offline`, async () => {
    const { state, run } = load(text);
    const url = 'https://x.test/preview/assets/organ-art-lite-ABC123.js';
    assert.equal((await run(url)).body, 'net:' + url);
    await Promise.all(state.waits);
    state.online = false;
    assert.equal((await run(url)).body, 'net:' + url, 'the stored module comes back with the network gone');
  });
  test(`${name}: the write is held by waitUntil until it ends, and a failed write is swallowed`, async () => {
    const { state, run } = load(text);
    let open; state.putGate = new Promise((r) => { open = r; });
    await run('https://x.test/a.json');
    assert.equal(state.waits.length, 1, 'the write is retained through waitUntil');
    let settled = false; state.waits[0].then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(settled, false, 'the event stays alive while the write is pending');
    state.putFails = true; open();
    await state.waits[0];
    const r2 = load(text); r2.state.putFails = true;
    assert.equal((await r2.run('https://x.test/assets/x-1.js')).body, 'net:https://x.test/assets/x-1.js');
    await assert.doesNotReject(Promise.all(r2.state.waits));
  });
}
