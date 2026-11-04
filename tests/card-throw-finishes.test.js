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
// (The guard's timer is held here, never fired by real time: a timer left from one test going off during the next, on a loaded machine,
// landed its moves early and failed it once in a full run. The tests call throwGuard themselves.)
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => (f?.name === 'guard' ? { unref() {}, ref() {} } : realTimeout(f, ms, ...a));
const ct = await import('../src/ui/card-throw.js');

const mk = (cls = []) => {
  const s = new Map(), pr = new Map(), c = new Set(cls);
  return { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
// (class-soon lets go of a landed card in a task of its own, a MessageChannel message: on a busy machine (a full `npm test`) that task can
// come well after 5 ms, which failed this test once. Wait for the let-go, up to two seconds, never a fixed pause.)
const later = async (done = () => true) => { for (let i = 0; i < 400 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); await new Promise((r) => setTimeout(r, 5)); };
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
  await later(() => cards.every(atRest));
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
  await later(() => cards.every(atRest));
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
  await later(() => cards.every(atRest));
  for (const el of cards) { assert.ok(!ct.throwing(el)); assert.ok(atRest(el), `card at rest: ${el.style.transform} ${el.style.opacity}`); }
});

test('a card thrown out whose frames stop is out of sight, and the one waiting for the cards out is told', async () => {
  const el = mk(['pz-leave']);
  ct.throwOut(el, 'next', 366);
  let told = false; ct.throwsOut().then(() => { told = true; });
  tick(16); q = [];
  T += 560 + 400; ct.throwGuard();
  await later(() => !ct.throwing(el));
  assert.ok(told, 'the next words are not held for ever');
  assert.ok(!ct.throwing(el));
  assert.equal(el.style.opacity, '0');
});

// A move that ends any way but landing must still give the figure back (the dimmed figure stood behind a stopped card).
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
test('presenter: a finished move that is the current one gives the figure back, whatever ended it', () => {
  const presenter = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));
  const fin = presenter.slice(presenter.indexOf('try { await transitionRun(to); } finally {'), presenter.indexOf('async function transitionRun(to)'));
  assert.match(fin, /if \(mine && want === to && view\.classList\.contains\('pz-out'\)\) figureIn\(\);/);
  assert.ok(fin.indexOf('figureIn()') < fin.indexOf('tx.end()'), 'before the move is ended');
});

// Presses landing mid-move, in any order, on a stepped clock (the presenter's calls: out on the tap, pinned, in, released, a leave class
// put on and taken off): whatever the order, once the frames have run no card is left moving or part way (opacity strictly between 0 and 1).
test('presses landing mid-move in any order leave no card moving or part way', async () => {
  let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let run = 0; run < 400; run++) {
    seed = run + 1;
    const els = [mk(), mk(), mk()];
    for (let i = 0, n = 2 + Math.floor(rnd() * 8); i < n; i++) {
      const el = els[Math.floor(rnd() * 3)], op = Math.floor(rnd() * 6);
      if (op === 0) ct.throwOut(el, rnd() < 0.5 ? 'next' : 'back', 366);
      else if (op === 1) ct.throwOutNow(el, 'next', 366);
      else if (op === 2) ct.throwIn(el, 'next', rnd() < 0.5 ? 0 : 40);
      else if (op === 3) ct.throwRelease(el);
      else if (op === 4) el.classList.toggle('pz-leave', rnd() < 0.5);
      else tick(Math.floor(rnd() * 300));
      if (rnd() < 0.5) tick(8);
    }
    for (let i = 0; i < 200; i++) tick(8);
    ct.throwGuard();
    await later();
    for (const el of els) {
      const o = el.style.opacity;
      assert.ok(!ct.throwing(el) && (o === '' || o === '0'), `run ${run}: card left moving or part way: ${el.style.transform} ${o}`);
    }
  }
});

test('window.pps keeps caught(): main.js builds pps with it, so the counted errors can be read', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ caught, caughtNow \} from '\.\/caught\.js/);
  assert.match(main, /window\.pps = \{[^\n]*caught: caughtNow \}/);
});
