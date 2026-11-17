// A deck opens at once, however many rows of the Present menu the pointer crossed first (17 Nov 2026, Mohammad: "whenever I open a new deck, it loads
// forever, then an empty card with only its title, 1-2 minutes"). Every row the pointer reached warmed its deck: a whole deck's states, two to forty
// seconds, queued on the one worker, in order, so the deck opened came last. src/ui/solve-lane.js: one deck at a time, only once the pointer has
// rested on its row, the deck being opened first. Here the lane runs against a fake worker that does one job at a time (as the real one does) and
// a fake clock, driven the way presenter.js drives it (warm, solve, claim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSolveLane, INTENT_MS } from '../src/ui/solve-lane.js';

const COST = 30000;   // (ms of worker time for one deck: carvedilol took 38 s in node, a typical deck 3 to 10 s)
const STARTUP = 300;  // (a fresh worker's start)

function world() {
  let t = 0;
  const timers = [], calcs = [], cache = new Map(), arrived = {}, log = [];
  const later = (fn, ms) => { const id = { fn, at: t + ms }; timers.push(id); return id; };
  const clear = (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); };
  function makeCalc() {
    const c = { jobs: [], dead: false, startAt: t + STARTUP, broken: false,
      sequence(key) { return new Promise((done) => { c.jobs.push({ key, left: COST, done }); }); },
      kill() { c.dead = true; c.broken = true; log.push(`kill ${c.jobs.map((j) => j.key).join(',') || '-'}`); for (const j of c.jobs.splice(0)) j.done({ type: 'error' }); } };
    calcs.push(c); return c;
  }
  const lane = createSolveLane({ makeCalc, cache, later, clear });
  // (As presenter.js: the lane's engine runs the deck's sequence; an error settles it, and a cancelled warm says nothing.)
  function solve(key) {
    const mine = [], c = lane.begin(key); cache.set(key, { states: mine, done: false });
    c.sequence(key).then((end) => {
      lane.end(key);
      if (end?.type === 'error') { if (!mine.cancelled && cache.get(key)?.states === mine) cache.delete(key); return; }
      arrived[key] = t; cache.get(key).done = true;
    });
  }
  const warm = (key) => { if (!cache.has(key)) lane.warm(key, () => solve(key)); };
  const open = (key) => { lane.claim(key); if (!cache.has(key)) solve(key); return key; };
  async function advance(ms) {
    for (let i = 0; i < ms; i += 10) {
      t += 10;
      for (const x of timers.filter((y) => y.at <= t)) { timers.splice(timers.indexOf(x), 1); x.fn(); }
      for (const c of calcs) if (!c.dead && t >= c.startAt && c.jobs[0] && (c.jobs[0].left -= 10) <= 0) { const j = c.jobs.shift(); j.done({ type: 'sequence' }); await new Promise((r) => setImmediate(r)); }
    }
    await new Promise((r) => setImmediate(r));
  }
  return { lane, cache, arrived, log, warm, open, advance, calcs, now: () => t };
}

test('a pointer moved down the list queues nothing: a row warms only once it has been rested on', async () => {
  const w = world();
  for (const k of 'abcdefgh') { w.warm(k); await w.advance(INTENT_MS - 60); }   // (each row held for less than the rest)
  await w.advance(INTENT_MS);
  assert.equal(w.calcs.length, 1, 'one worker, for the row stood on, none for the rows crossed');
  assert.equal(w.cache.size, 1, 'only the row the pointer finally stood on is warmed');
  assert.ok(w.cache.has('h'));
});

test('a deck opened after a pointer crossed ten rows is ready in its own time, not the sum of every row crossed', async () => {
  const w = world();
  // (Rows rested on briefly one after the other: each rest starts its warm, and the next row cancels the one before.)
  for (const k of 'abcdefghij') { w.warm(k); await w.advance(INTENT_MS + 40); }
  const at0 = w.now();
  w.warm('k'); await w.advance(INTENT_MS + 10); w.open('k');   // (the pointer rests on k, then clicks it)
  await w.advance(COST + 2000);
  const took = w.arrived.k - at0;
  assert.ok(w.arrived.k, 'the deck was computed');
  assert.ok(took < COST + 2 * INTENT_MS + STARTUP + 100, `ready ${took} ms after the pointer reached it (its own compute ${COST} ms, not 10 decks ahead of it)`);
  assert.ok(!w.cache.has('a') && !w.cache.has('j'), 'the rows crossed left no half-computed entries behind');
});

test('opening a deck cancels another row\'s warm at once, and joins its own warm without losing the work done', async () => {
  const w = world();
  w.warm('a'); await w.advance(INTENT_MS + 10);   // a is running
  await w.advance(10000);
  w.warm('b'); await w.advance(INTENT_MS + 10);   // b replaces it
  assert.ok(!w.cache.has('a'));
  await w.advance(12000);                          // b has run 12 s of its 30
  w.open('b');                               // the click: b's own warm is joined, not restarted
  await w.advance(COST - 12000 + 1000);
  assert.ok(w.arrived.b, 'b finished when its own remaining time was up');
  assert.ok(w.arrived.b < INTENT_MS * 3 + 10000 + STARTUP + COST + 600, `b ready at ${w.arrived.b} ms: its own ${COST} ms from when its row was rested on, no restart at the click`);
  // (And a warm of another deck that was running when a different one is opened is cancelled.)
  const x = world();
  x.warm('p'); await x.advance(INTENT_MS + 10); await x.advance(5000);
  x.open('q');
  assert.ok(!x.cache.get('p'), 'p is dropped');
  await x.advance(COST + STARTUP + 500);
  assert.ok(x.arrived.q, 'q is not queued behind p');
  assert.equal(x.arrived.p, undefined);
});

test('while a deck is being opened no row is warmed, and its states are never cancelled by one', async () => {
  const w = world();
  w.open('a');
  await w.advance(5000);
  w.warm('z'); await w.advance(INTENT_MS * 3);
  assert.ok(!w.cache.has('z'), 'z is not warmed under the opened deck');
  assert.ok(w.cache.has('a') && !w.cache.get('a').done);
  await w.advance(COST);
  assert.ok(w.arrived.a);
  w.lane.claim(null);   // (the talk ended)
  w.warm('z'); await w.advance(INTENT_MS + 20);
  assert.ok(w.cache.has('z'), 'rows warm again once the talk is over');
});

test('a row already computed, or computing, is not warmed again', async () => {
  const w = world();
  w.warm('a'); await w.advance(INTENT_MS + 20);
  const n = w.calcs.length;
  w.warm('a'); await w.advance(INTENT_MS * 2);
  assert.equal(w.calcs.length, n);
});

test('the cause, kept as a control: on one first-come worker, ten rows crossed put the deck opened ten decks of compute behind', async () => {
  const w = world();
  const shared = w.lane.calc();   // (what the presenter had: every warm and the opened deck on the one engine, in the order asked)
  const done = {};
  for (const k of 'abcdefghij') shared.sequence(k).then(() => { done[k] = w.now(); });
  const open = shared.sequence('k').then(() => { done.k = w.now(); });
  await w.advance(11 * COST + 2000);
  await open;
  assert.ok(done.k > 10 * COST, `the deck opened came ${Math.round(done.k / 1000)} s after the first row`);
});
