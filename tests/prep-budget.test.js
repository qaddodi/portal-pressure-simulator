// The shared preparation budget (review pass 2, priority 1): chunked jobs, the deadline checked between steps, fairness, no starvation,
// cancellation that leaves the queue, and the frame watchdog's prediction of a deferrable callback's cost before it starts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// (The budget's message port is unref'd in Node, as rest-pass.js's: a timer keeps the tests' event loop up.)
const keepUp = setInterval(() => {}, 1000);
after(() => clearInterval(keepUp));
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
// (The very module rest-pass.js and slide-prep.js import, by their own stamped address: one ledger, as in the browser.)
const restUrl = new URL('../src/ui/rest-pass.js', import.meta.url);
const spec = /from '(\.\/prep-budget\.js[^']*)'/.exec(readFileSync(restUrl, 'utf8'))[1];
const { prepJob, prepStats, prepReset, prepLeft, prepSpend, REST_CAP_MS, STARVE_MS } = await import(new URL(spec, restUrl).href);
const { frame, wouldShed, costOf, WATCH_SHARE } = await import('../src/ui/frame.js');
const { restPass, restStats } = await import(restUrl.href);

const spin = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (Which steps ran in the same task: a step notes the task it ran in, told apart by a microtask-free counter bumped by a zero timer.)
function taskClock() { let n = 0, on = true; const tick = () => { n++; if (on) setTimeout(tick, 0); }; setTimeout(tick, 0); return { now: () => n, stop: () => { on = false; } }; }

test('a job runs its steps in order, never more than the interval allows in one task', async () => {
  prepReset();
  const clock = taskClock(), seen = [];
  const steps = Array.from({ length: 12 }, (_, i) => () => { spin(2); seen.push([i, clock.now()]); });
  assert.equal(await prepJob('t-order', steps).done, true);
  clock.stop();
  assert.deepEqual(seen.map(([i]) => i), [...Array(12).keys()]);
  // (Twelve steps of 2 ms against a 6 ms interval: they cannot all have run in one task.)
  const perTask = new Map();
  for (const [, k] of seen) perTask.set(k, (perTask.get(k) || 0) + 1);
  assert.ok(perTask.size > 1, 'spread over several tasks');
  for (const n of perTask.values()) assert.ok(n * 2 <= REST_CAP_MS + 2 * 2 + 1, `at most the interval and one step a task (${n} steps)`);
  assert.ok(prepStats().deferred > 0);
});

test('a step that returns a promise parks its job; the continuation is admitted through the budget', async () => {
  prepReset();
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const j = prepJob('t-park', [() => { order.push('a'); return gate; }, () => order.push('b')]);
  await sleep(5);
  assert.deepEqual(order, ['a'], 'waits on the promise');
  release();
  assert.equal(await j.done, true);
  assert.deepEqual(order, ['a', 'b']);
});

test('jobs take turns: a second job is not starved behind a long one', async () => {
  prepReset();
  const log = [];
  const a = prepJob('t-a', Array.from({ length: 20 }, () => () => { spin(1.5); log.push('a'); }));
  const b = prepJob('t-b', Array.from({ length: 3 }, () => () => { spin(1.5); log.push('b'); }));
  await Promise.all([a.done, b.done]);
  assert.ok(log.lastIndexOf('b') < log.lastIndexOf('a'), 'b finishes before a long a does');
  assert.ok(log.indexOf('b') <= 2, `b's first step comes within a's first turns (${log.join('')})`);
});

test('a job is never deferred forever: past STARVE_MS it is admitted whatever the ledger says', async () => {
  prepReset();
  // (A step learned to cost more than any interval allows never fits: only the starvation bound lets the next one in.)
  await prepJob('t-big', [() => spin(REST_CAP_MS * 2)]).done;
  const t0 = performance.now();
  let ran = 0;
  const j = prepJob('t-big', [() => { ran = performance.now() - t0; }]);
  assert.equal(await Promise.race([j.done, sleep(STARVE_MS * 4).then(() => 'late')]), true);
  assert.ok(ran >= STARVE_MS * 0.9, `held back while it could not fit (${ran.toFixed(0)} ms)`);
  assert.ok(prepStats().starved >= 1);
  assert.ok(prepStats().deferred >= 1);
});

test('cancel stops a job at once, takes it out of the queue, and its later steps never run', async () => {
  prepReset();
  let n = 0;
  const j = prepJob('t-cancel', Array.from({ length: 50 }, () => () => { spin(1); n++; }));
  await sleep(0);
  j.cancel();
  assert.equal(await j.done, false);
  const at = n;
  await sleep(30);
  assert.equal(n, at, 'nothing after the cancel');
  assert.equal(prepStats().queued, 0);
});

test('a generation that goes stale stops the job after its promise, and a parked job of a dead generation is dropped even if its promise never settles', async () => {
  prepReset();
  let gen = 1;
  const ran = [];
  const j1 = prepJob('t-gen', [() => sleep(5), () => ran.push('late')], { alive: () => gen === 1 });
  gen = 2;
  assert.equal(await j1.done, false);
  assert.deepEqual(ran, []);
  let alive = true;
  const j2 = prepJob('t-never', [() => new Promise(() => {}), () => ran.push('never')], { alive: () => alive });
  await sleep(2);
  alive = false;
  prepJob('t-poke', [() => {}]);   // (any pump sweeps the dead)
  assert.equal(await Promise.race([j2.done, sleep(200).then(() => 'stuck')]), false);
  assert.equal(prepStats().queued, 0);
});

test('at rest the interval allows REST_CAP_MS; spending is charged and the ledger rolls each interval', async () => {
  prepReset();
  assert.ok(Math.abs(prepLeft() - REST_CAP_MS) < 1e-6);
  prepSpend(4);
  assert.ok(prepLeft() <= REST_CAP_MS - 4 + 1e-6);
  await sleep(20);
  assert.ok(Math.abs(prepLeft() - REST_CAP_MS) < 1e-6, 'a new interval');
});

test('rest passes draw from the same ledger: what a drain spends is charged, and a spent interval holds them back, never forever', async () => {
  prepReset();
  const before = prepStats().spentMs;
  await new Promise((done) => { let k = 0; for (let i = 0; i < 4; i++) restPass(() => { spin(2); if (++k === 4) done(); }); });
  assert.ok(prepStats().spentMs - before >= 7, 'the drains were charged');
  await sleep(10);
  prepSpend(1000);   // (this interval spent)
  const t0 = performance.now(), w0 = restStats().waited;
  let at = 0;
  await new Promise((done) => restPass(() => { at = performance.now() - t0; done(); }));
  assert.ok(restStats().waited > w0, 'held back while the interval was spent');
  assert.ok(at < STARVE_MS, `and run in a later interval (${at.toFixed(0)} ms)`);
});

test('the watchdog judges a deferrable callback by its predicted cost before it starts', async () => {
  // (Rev 2 step 6: one rule for every priority above 0: the frame's script so far plus the callback's predicted cost against SCRIPT_SHARE;
  // a callback that has never run is predicted at CARRY_SEED_MS, so a first heavy run is not let through blind. No modes.)
  const B = 1000 / 120, limit = WATCH_SHARE * B;
  assert.equal(wouldShed('credit', limit + 0.1, B), true, 'past the share');
  assert.equal(wouldShed('figure', 100, B), false, 'a surface that draws the moving picture is never carried');
  assert.equal(wouldShed('credit', limit - 1.5, B), false, 'room for its seed cost while its own is unknown');
  await new Promise((done) => frame(() => { spin(5); done(); }, 'credit'));
  assert.ok(costOf('credit') >= 4.5, `its cost learned (${costOf('credit').toFixed(1)} ms)`);
  assert.equal(wouldShed('credit', 1, B), true, '1 ms used + 5 ms predicted passes the share of 8.3 ms: it waits');
  const c = costOf('credit'), roomy = c + 2;
  assert.equal(wouldShed('credit', 1, roomy), 1 + c > WATCH_SHARE * roomy, 'the same share of any budget');
});
