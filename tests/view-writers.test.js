// R08 (external production review, 15 Nov 2026): the store has four legal views over three fields (view, lobule, sinusoid), and setViewKey writes them in one
// legal set. Some procedures still wrote the fields one by one (`if (st.lobule) set({ lobule: false }); if (st.view !== 'anatomic') set({ view: 'anatomic' })`), which
// leaves 'sinusoid without the lobule' for a listener to hear. Every writer now goes through setViewKey, and any other write of the three fields is a
// development-time error (PPS_STRICT_VIEWS) and a count in production.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store, setViewKey, viewKey, viewIllegal, VIEW_KEYS, viewWrites } from '../src/ui/store.js';

const strict = (fn) => { const had = globalThis.PPS_STRICT_VIEWS; globalThis.PPS_STRICT_VIEWS = true; try { return fn(); } finally { globalThis.PPS_STRICT_VIEWS = had; } };
const reset = () => { strict(() => setViewKey('anatomy')); viewWrites.stray = viewWrites.illegal = 0; viewWrites.last = ''; };

test('R08: no listener ever hears an illegal view, for every move from every view and 3000 random ones', () => {
  reset();
  const heard = [];
  const off = store.on('*', () => { const why = viewIllegal(store.get()); if (why) heard.push(why); });
  strict(() => {
    for (const a of VIEW_KEYS) for (const b of VIEW_KEYS) { setViewKey(a); assert.equal(viewIllegal(store.get()), null, `${a}`); setViewKey(b); assert.equal(viewKey(store.get()), b); assert.equal(viewIllegal(store.get()), null, `${a} to ${b}`); }
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 3000; i++) { const k = VIEW_KEYS[Math.floor(rnd() * 4)]; assert.equal(setViewKey(k), k); assert.equal(viewKey(store.get()), k); }
  });
  off();
  assert.deepEqual(heard, []);
  assert.deepEqual([viewWrites.stray, viewWrites.illegal], [0, 0]);
  reset();
});

test('R08: setViewKey writes only the fields that change, in one set', () => {
  reset();
  const sets = []; const off = store.on('*', (keys) => sets.push([...keys]));
  setViewKey('sinusoid'); setViewKey('sinusoid'); setViewKey('lobule'); setViewKey('anatomy'); setViewKey('circuit'); setViewKey('circuit');
  off();
  assert.deepEqual(sets, [['lobule', 'sinusoid'], ['sinusoid'], ['lobule'], ['view']]);
  assert.throws(() => setViewKey('bogus'), /setViewKey: bogus/);
  reset();
});

test('R08: a direct write of view, lobule or sinusoid is an error where strict, and a count where not', () => {
  reset();
  strict(() => {
    assert.throws(() => store.set({ lobule: true }), /written outside setViewKey/);
    assert.throws(() => store.set({ sinusoid: true }), /written outside setViewKey/);
    assert.throws(() => store.set({ view: 'circuit' }), /written outside setViewKey/);
    assert.throws(() => store.set1('lobule', false), /written outside setViewKey/);
    assert.throws(() => store.setSoon({ view: 'anatomic' }), /written outside setViewKey/);
    store.set({ selection: null, lobuleLayers: { zones: false, lymph: true } });   // (everything else is free)
  });
  assert.equal(viewWrites.stray, 5);
  reset();
  const quiet = console.error; let said = 0; console.error = () => { said++; };
  try { store.set({ lobule: true }); store.set({ lobule: false }); } finally { console.error = quiet; }
  assert.deepEqual([viewWrites.stray, said], [2, 1], 'counted always, logged once');
  assert.equal(viewWrites.last, 'lobule written outside setViewKey');
  reset();
});

test('R08: a procedure that needs the anatomy asks for it once, from any view (the shape of its call is a rule in scripts/source-shapes/review-fixes.mjs)', () => {
  strict(() => { for (const from of VIEW_KEYS) { setViewKey(from); const st = store.get(); if (st.lobule || st.view !== 'anatomic') setViewKey('anatomy'); assert.equal(viewKey(store.get()), 'anatomy', from); assert.equal(viewIllegal(store.get()), null); } });
  reset();
});
