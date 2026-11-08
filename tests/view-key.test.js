import test from 'node:test';
import assert from 'node:assert/strict';
import { store, viewKey, setViewKey, viewIllegal, VIEW_KEYS } from '../src/ui/store.js';

// The view key (implicit-state-machines M6/M7): four legal views over the store's view, lobule and sinusoid fields, one writer that is
// always legal, and the two bugs the doc found (a sinusoid asked for mid-dive written true, false, true; a circuit turned to during the
// dive's paint wait leaving lobule: true on the circuit).
const rest = () => { store.set({ view: 'anatomic', lobule: false, sinusoid: false }); };

test('viewKey names the four views from the three fields', () => {
  assert.deepEqual([...VIEW_KEYS], ['anatomy', 'circuit', 'lobule', 'sinusoid']);
  assert.equal(viewKey({ view: 'anatomic', lobule: false, sinusoid: false }), 'anatomy');
  assert.equal(viewKey({ view: 'circuit', lobule: false, sinusoid: false }), 'circuit');
  assert.equal(viewKey({ view: 'anatomic', lobule: true, sinusoid: false }), 'lobule');
  assert.equal(viewKey({ view: 'anatomic', lobule: true, sinusoid: true }), 'sinusoid');
});

test('the illegal combinations are named', () => {
  assert.equal(viewIllegal({ view: 'anatomic', lobule: false, sinusoid: true }), 'sinusoid without the lobule');
  assert.equal(viewIllegal({ view: 'circuit', lobule: true, sinusoid: false }), 'lobule over the circuit');
  for (const k of VIEW_KEYS) { rest(); setViewKey(k); assert.equal(viewIllegal(), null); }
  rest();
});

test('every transition between the four views is legal and is one store write', () => {
  for (const from of VIEW_KEYS) for (const to of VIEW_KEYS) {
    rest(); setViewKey(from);
    let writes = 0; const off = store.on('*', () => writes++);
    try {
      setViewKey(to);
      assert.equal(viewKey(), to, `${from} to ${to}`);
      assert.equal(viewIllegal(), null, `${from} to ${to} is legal`);
      assert.equal(writes, from === to ? 0 : 1, `${from} to ${to} sends ${from === to ? 'nothing' : 'one write'}`);
    } finally { off(); }
  }
  rest();
});

test('a field that does not change is not written, so no listener hears a value it had', () => {
  rest();
  const heard = [];
  const offs = ['view', 'lobule', 'sinusoid'].map((k) => store.on(k, (v) => heard.push([k, v])));
  try {
    setViewKey('lobule');
    assert.deepEqual(heard, [['lobule', true]]);
    heard.length = 0; setViewKey('sinusoid');
    assert.deepEqual(heard, [['sinusoid', true]]);
    heard.length = 0; setViewKey('circuit');   // out of the sinusoid and the lobule in the one write
    assert.deepEqual(heard.map((h) => h[0]).sort(), ['lobule', 'sinusoid', 'view']);
    assert.equal(viewKey(), 'circuit');
  } finally { for (const o of offs) o(); rest(); }
});

test('bug (a): Sinusoid pressed mid-dive is one store change, not true, false, true', () => {
  rest(); setViewKey('lobule');
  const heard = [];
  const off = store.on('sinusoid', (v) => heard.push(v));
  try {
    // The stage keeps the ask in the lobule while it fades in (askSinusoid returns true) and leaves the store alone ...
    setViewKey('lobule');   // (a second tap of Lobule: nothing to write)
    assert.deepEqual(heard, []);
    // ... and writes it once, at the landing (sinOnLanding).
    setViewKey('sinusoid');
    assert.deepEqual(heard, [true]);
  } finally { off(); rest(); }
  // the source shapes of the ask (it writes no store field; the stage writes the sinusoid once at the landing) are in scripts/source-shapes/c.mjs
});

test('bug (b): a turn to the circuit during the dive paint wait ends the wait and the store stops saying lobule', () => {
  // and the view buttons, the A key and the palette write the circuit through setViewKey, which clears the lobule in the same write
  rest(); setViewKey('lobule');
  setViewKey('circuit');
  assert.equal(store.get().lobule, false);
  assert.equal(viewKey(), 'circuit');
  rest();
});
