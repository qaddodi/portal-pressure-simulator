// The test clock (src/test-clock.js): the page's time on a clock that a pane the browser is not drawing cannot throttle. A stand-in page
// (its own timers, frames and clock, none of them ever firing by themselves) shows that every clock the app reads is swapped, runs in order
// and by app time, and is put back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClock } from '../src/test-clock.js';

function fakePage() {
  const calls = [];
  const g = {
    performance: { now: () => 5000 },
    Date: { now: () => 1_700_000_000_000 },
    setTimeout: (...a) => calls.push(['native setTimeout', a[1]]) && 7, clearTimeout: () => {}, setInterval: () => 8, clearInterval: () => {},
    requestAnimationFrame: () => { calls.push(['native raf']); return 3; }, cancelAnimationFrame: () => {},
    requestIdleCallback: () => 9, cancelIdleCallback: () => {},
    addEventListener() {}, removeEventListener() {},
  };
  return { g, calls };
}
// (a still real clock: no time goes by while the code runs, so the runs are exact)
const make = (o) => { const { g, calls } = fakePage(); const c = createTestClock(g, { realNow: () => 0, ...o }); c.install(); return { g, c, calls }; };

test('timers run in order of their time, by app time, and a setTimeout 0 is 1 ms on', () => {
  const { g, c } = make();
  const log = [];
  g.setTimeout(() => log.push(['b', c.now()]), 50);
  g.setTimeout(() => log.push(['a', c.now()]), 20);
  g.setTimeout(() => log.push(['z', c.now()]), 0);
  g.setTimeout((x, y) => log.push(['args', x + y]), 20, 1, 2);
  c.advance(100);
  assert.deepEqual(log, [['z', 1], ['a', 20], ['args', 3], ['b', 50]]);
  assert.equal(c.now(), 100);
});

test('performance.now, Date.now and the frame stamp are one clock', () => {
  const { g, c } = make();
  const seen = [];
  g.requestAnimationFrame((t) => seen.push(['frame', t, g.performance.now(), g.Date.now() - 1_700_000_000_000]));
  c.advance(40);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].slice(2), [seen[0][1], seen[0][1]], 'the clock a frame reads is its own stamp');
});

test('frames come every 1/60 s whatever the pane does, and a frame asked for in one comes in the next', () => {
  const { g, c } = make();
  const stamps = [];
  const go = (t) => { stamps.push(t); if (stamps.length < 6) g.requestAnimationFrame(go); };
  g.requestAnimationFrame(go);
  c.advance(1000);
  assert.equal(stamps.length, 6);
  for (let i = 1; i < stamps.length; i++) assert.ok(Math.abs(stamps[i] - stamps[i - 1] - 1000 / 60) < 1e-9, `gap ${stamps[i] - stamps[i - 1]}`);
});

test('a cancelled timer or frame never runs, one cancelled by an earlier callback of the same frame is skipped', () => {
  const { g, c } = make();
  const log = [];
  const t = g.setTimeout(() => log.push('timer'), 10); g.clearTimeout(t);
  let second;
  g.requestAnimationFrame(() => { log.push('first'); g.cancelAnimationFrame(second); });
  second = g.requestAnimationFrame(() => log.push('second'));
  const cancelled = g.requestAnimationFrame(() => log.push('cancelled')); g.cancelAnimationFrame(cancelled);
  c.advance(100);
  assert.deepEqual(log, ['first']);
});

test('setInterval repeats on its beat until cleared, and a callback that throws does not stop the others', async () => {
  const { g, c } = make();
  const log = [];
  let n = 0;
  const id = g.setInterval(() => { log.push(c.now()); if (++n === 3) g.clearInterval(id); }, 33);
  g.setTimeout(() => { throw new Error('boom'); }, 5);
  g.setTimeout(() => log.push('after'), 6);
  c.advance(500);
  assert.deepEqual(log, ['after', 33, 66, 99]);
});

test('requestIdleCallback is on the clock, with a deadline', () => {
  const { g, c } = make();
  let got = null;
  g.requestIdleCallback((d) => { got = d; });
  c.advance(10);
  assert.equal(got.didTimeout, false);
  assert.ok(got.timeRemaining() > 0);
});

test('time moves forward only, and a timer asked for from a timer runs in the same advance', () => {
  const { g, c } = make();
  const log = [];
  g.setTimeout(() => { log.push(c.now()); g.setTimeout(() => log.push(c.now()), 30); }, 10);
  c.advanceTo(100);
  c.advanceTo(50);   // (back: nothing)
  assert.deepEqual(log, [10, 40]);
  assert.equal(c.now(), 100);
});

test('the page is shown as in front, and what it did before the swap still clears', () => {
  const doc = Object.create({ hidden: true, visibilityState: 'hidden' });   // (as in a page: the getters sit on the prototype)
  const { g } = fakePage();
  g.document = doc;
  const c = createTestClock(g, { realNow: () => 0 });
  c.install();
  assert.equal(doc.hidden, false);
  assert.equal(doc.visibilityState, 'visible');
  assert.equal(g.clearTimeout(7), undefined, 'a real timer from before the swap goes to the real clear');
  c.dispose();
  assert.equal(doc.hidden, true, 'put back');
});

test('dispose gives what was waiting back to the real clocks, with the time it had left', () => {
  const { g, c, calls } = make();
  g.setTimeout(() => {}, 250);
  c.advance(100);
  g.requestAnimationFrame(() => {});
  c.dispose();
  assert.ok(calls.some(([k, d]) => k === 'native setTimeout' && d === 150), JSON.stringify(calls));
  assert.ok(calls.some(([k]) => k === 'native raf'));
  assert.equal(g.performance.now(), 5000 , 'the real clock is back (a still one here)');
});

test('the loop runs by itself, never faster than its rate, and sleeps with nothing to do', async () => {
  // (a real MessageChannel loop on a real clock: rate 4 means a 200 ms timer is not skipped to in under 50 ms of real time)
  const real = globalThis.performance.now.bind(globalThis.performance);
  const { g } = fakePage();
  const c = createTestClock(g, { realNow: real, rate: 4 });
  c.install(); c.start();
  const t0 = real();
  const log = [];
  g.setTimeout(() => log.push('a'), 200);
  g.requestAnimationFrame(function f(t) { log.push('f'); if (log.length < 10) g.requestAnimationFrame(f); });
  await new Promise((r) => { const poll = () => (log.includes('a') ? r() : setImmediate(poll)); poll(); });
  const took = real() - t0;
  c.dispose();
  assert.ok(took >= 200 / 4 - 5, `the 200 ms timer came after ${took.toFixed(0)} ms of real time`);
  assert.ok(took < 3000, 'and not at real pace either');
  assert.ok(log.filter((x) => x === 'f').length >= 5, 'frames ran meanwhile');
});

test('a gate holds the loop, and releasing it lets it go on', async () => {
  const real = globalThis.performance.now.bind(globalThis.performance);
  const { g } = fakePage();
  const c = createTestClock(g, { realNow: real, rate: 50 });
  c.install(); c.start();
  let open = false;
  c.hooks.gate = () => open;
  let ran = false;
  g.setTimeout(() => { ran = true; }, 5);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(ran, false, 'held');
  open = true;
  await new Promise((r) => { const poll = () => (ran ? r() : setImmediate(poll)); poll(); });
  c.dispose();
  assert.equal(ran, true);
});
