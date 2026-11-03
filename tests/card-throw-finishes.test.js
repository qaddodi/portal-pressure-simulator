// A slide change's cards always finish their move (Mohammad, 2 Nov 2026, his iPhone: the data card stood still part way in, dim and a little
// to the right, with no glass, and stayed). Stepped here on a fake clock and a fake frame queue: whatever stops the frames, or makes one
// card's step throw, every card ends at its final look, and whoever waits for the cards out hears of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');

const mk = (cls = []) => {
  const s = new Map(), c = new Set(cls);
  return { style: { setProperty: (k, v) => s.set(k, v), removeProperty: (k) => s.delete(k), get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const later = () => new Promise((r) => setTimeout(r, 5));   // (class-soon lets go of a landed card in a task of its own)
const atRest = (el) => el.style.transform === '' && el.style.opacity === '';

// A slide change as the presenter makes it: the visible cards out on the tap, the next words after they are out, the new cards in.
async function slideChange(cards) {
  for (const el of cards) ct.throwOut(el, 'next', 366);
  const out = ct.throwsOut();
  let outDone = false; out.then(() => { outDone = true; });
  for (let i = 0; i < 80 && !outDone; i++) { tick(8); await Promise.resolve(); }
  for (const el of cards) ct.throwIn(el, 'next', 0);
}

test('a slide change on a fake clock ends with every card at rest, whole and in place', async () => {
  const cards = [mk(), mk(), mk()];
  await slideChange(cards);
  for (let i = 0; i < 100; i++) tick(8);
  await later();
  for (const el of cards) { assert.ok(!ct.throwing(el)); assert.ok(atRest(el), `card at rest: ${el.style.transform} ${el.style.opacity}`); }
});

test('one card whose step throws does not stop the others, and the card itself ends at its final look', async () => {
  const cards = [mk(), mk(), mk()];
  // (the first card's inline write throws part way in: the loop used to end there for every card, no next frame asked for)
  let writes = 0; const real = cards[0].style.setProperty;
  cards[0].style.setProperty = (k, v, i) => { if (k === 'opacity' && ++writes === 6) throw new Error('write failed'); return real(k, v, i); };
  const errs = []; process.on('uncaughtException', (e) => errs.push(e));
  await slideChange(cards);
  for (let i = 0; i < 100; i++) tick(8);
  await later();
  process.removeAllListeners('uncaughtException');
  for (const el of cards) { assert.ok(!ct.throwing(el), 'no card is left moving'); assert.ok(atRest(el), `card at rest: ${el.style.transform} ${el.style.opacity}`); }
});

test('frames that never come: the timer lands every move on its own end', async () => {
  const cards = [mk(), mk()];
  for (const el of cards) ct.throwIn(el, 'next', 0);
  tick(16); tick(16);   // (a few frames, then the loop stops: nothing is asked again)
  q = [];
  assert.ok(cards.every((el) => ct.throwing(el)));
  T += 560 + 100; ct.throwGuard();
  assert.ok(cards.every((el) => ct.throwing(el)), 'inside the guard\'s grace it leaves the move to the frames');
  T += 400; ct.throwGuard();
  await later();
  for (const el of cards) { assert.ok(!ct.throwing(el)); assert.ok(atRest(el), `card at rest: ${el.style.transform} ${el.style.opacity}`); }
});

test('a card thrown out whose frames stop is out of sight, and the one waiting for the cards out is told', async () => {
  const el = mk(['pz-leave']);
  ct.throwOut(el, 'next', 366);
  let told = false; ct.throwsOut().then(() => { told = true; });
  tick(16); q = [];
  T += 560 + 400; ct.throwGuard();
  await later();
  assert.ok(told, 'the next words are not held for ever');
  assert.ok(!ct.throwing(el));
  assert.equal(el.style.opacity, '0');
});
