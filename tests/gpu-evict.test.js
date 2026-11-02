// The global GPU budget enforced (gpu-budget.js hold/enforce, review pass item 8, 2 Nov 2026): warm holders are bounded by count and by
// their share of the envelope, the one used longest ago let go first; retained ones go only over the envelope, after every warm one;
// release is the owner's, called once; a lost context's holders are forgotten without a call.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.screen = { width: 390, height: 844 };   // (a phone: 320 MB envelope)
let clock = 0;
globalThis.performance = { now: () => clock };
const { hold, enforce, holdersNow, WARM_MAX, WARM_SHARE, ENVELOPES } = await import('../src/ui/gpu-budget.js');
const env = ENVELOPES.phone;
const MB = 1e6;

function held(owner, mb, kind = 'warm', gl = null) {
  const h = { owner, released: 0 };
  h.handle = hold({ owner, kind, gl, bytes: () => mb * MB, release: () => { h.released++; } });
  clock += 10;
  return h;
}

test('rapid navigation: no more than WARM_MAX warm views, oldest let go first', () => {
  const hs = [];
  for (let i = 0; i < WARM_MAX + 3; i++) hs.push(held(`view${i}`, 1));
  assert.deepEqual(hs.map((h) => h.released), hs.map((_, i) => (i < 3 ? 1 : 0)));
  assert.equal(holdersNow().list.filter((x) => x.kind === 'warm').length, WARM_MAX);
  for (const h of hs) h.handle.drop();
});

test('warm views together stay within their share of the envelope, least recently used first', () => {
  const big = (env.mb * WARM_SHARE) / 2 + 1;
  const a = held('a', big), b = held('b', big);
  assert.equal(a.released, 1, 'two halves and a bit: the older goes');
  assert.equal(b.released, 0);
  b.handle.touch();
  const c = held('c', 1);
  assert.equal(b.released + c.released, 0);
  b.handle.drop(); c.handle.drop();
});

test('a touched holder goes after an untouched one', () => {
  const big = (env.mb * WARM_SHARE) / 2 - 1;
  const a = held('a', big), b = held('b', big);
  clock += 100; a.handle.touch();
  const c = held('c', 5);
  assert.equal(b.released, 1, 'b was used longest ago');
  assert.equal(a.released + c.released, 0);
  a.handle.drop(); c.handle.drop();
});

test('retained caches go only over the envelope, and only after the warm ones', () => {
  const r = held('chart layers', env.mb * 0.6, 'retained'), w = held('warm', 10);
  assert.equal(r.released + w.released, 0, 'under the envelope: nothing let go');
  const r2 = held('chart layers 2', env.mb * 0.45, 'retained');
  assert.equal(w.released, 1, 'the warm one first');
  assert.equal(r.released, 1, 'then the retained one used longest ago');
  assert.equal(r2.released, 0);
  r2.handle.drop();
});

test('release is called once, and a dropped holder is never released', () => {
  const a = held('a', 1);
  a.handle.drop();
  for (let i = 0; i < WARM_MAX + 2; i++) held(`x${i}`, 1).handle.drop();
  assert.equal(a.released, 0);
  assert.equal(enforce(), 0, 'nothing held: nothing to let go');
});

test('a lost context forgets its holders without calling them', () => {
  let lost = false;
  const gl = { isContextLost: () => lost };
  const a = held('a', 1, 'warm', gl);
  lost = true;
  enforce();
  assert.equal(a.handle.held, false);
  assert.equal(a.released, 0, 'its resources went with the context: the owner makes them again on restore');
});
