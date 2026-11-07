// The scheduler's asks kept without allocating (plan "Holding 120 Hz, always" rev 2 §2.8): parallel arrays in place of a Map of
// [tag, cb] pairs. The order, the phases, cancelling (also from inside the running frame) and asks made while a frame runs behave as
// requestAnimationFrame's would, and per-callback timing is kept to sampled frames unless watched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
const { frame, lateFrame, finalFrame, readFrame, cancelFrame, perf, TIME_EVERY } = await import('../src/ui/frame.js');
const next = () => new Promise((r) => finalFrame(() => r()));

test('callbacks run once, in request order, phase by phase; an ask made while a frame runs waits for the next one', async () => {
  const log = [];
  finalFrame(() => log.push('final'));
  lateFrame(() => log.push('late'));
  frame(() => { log.push('a'); frame(() => log.push('next frame')); lateFrame(() => log.push('late (asked early)')); }, 't-a');
  frame(() => log.push('b'), 't-b');
  readFrame(() => log.push('read'));
  await next();
  assert.deepEqual(log, ['read', 'a', 'b', 'late', 'late (asked early)', 'final']);
  await next();
  assert.deepEqual(log.slice(6), ['next frame']);
});

test('cancelFrame stops a waiting callback, and one of the running frame that has not run yet', async () => {
  const log = [];
  const gone = frame(() => log.push('cancelled'));
  cancelFrame(gone);
  let later = 0;
  frame(() => { log.push('first'); cancelFrame(later); });
  later = frame(() => log.push('cancelled in the frame'));
  frame(() => log.push('last'));
  await next();
  assert.deepEqual(log, ['first', 'last']);
  cancelFrame(gone);   // (twice, or after it ran: nothing)
});

test('more asks than the arrays start with are kept, and the waiting list names their surfaces', async () => {
  let n = 0;
  for (let i = 0; i < 200; i++) frame(() => n++, 't-many');
  assert.ok(perf().waiting.includes('t-many'));
  await next();
  assert.equal(n, 200);
  assert.ok(!perf().waiting.includes('t-many'));
});

test('a callback is timed only on a sampled frame (or while watched), counted TIME_EVERY times over', () => {
  const src = readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8');
  assert.equal(TIME_EVERY, 30);
  assert.match(src, /timeFrame = watching \|\| TIME_ALL \|\| allFrames % TIME_EVERY === 0;/);
  assert.match(src, /const t0 = timed \? performance\.now\(\) : 0;/);
  assert.match(src, /\(parts \|\| TIME_ALL \? ms : ms \* TIME_EVERY\)/);
  const run = src.slice(src.indexOf('function run(batch, now, phase) {'), src.indexOf('/** Calls fn({ now, gap, script, parts })'));
  assert.doesNotMatch(run, /\[tag, cb\]|for \(const \[/, 'no pair made per callback');
});
