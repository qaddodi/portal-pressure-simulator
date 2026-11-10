import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoopAsk, RUNNING } from '../src/ui/loop-ask.js';

// 10 Nov 2026 (Mohammad's Mac ?perf, the lobule at rest: "asked for 360 frames/s, drew 24/s"): a wake that came while the lobule's loop ran asked
// for a second copy of the loop, and every later wake inside a run added one more. One loop at a time, whatever wakes it and when.

// A tiny frame scheduler: ask(cb) queues for the next frame, frame() runs what was queued (an ask made while it runs waits for the frame after).
function sched() {
  let q = new Map(), next = 1;
  return {
    ask: (cb) => { const id = next++; q.set(id, cb); return id; },
    cancel: (id) => { q.delete(id); },
    frame(now = 0) { const run = q; q = new Map(); for (const cb of run.values()) cb(now); },
    get size() { return q.size; },
  };
}

test('a wake while the loop runs asks for no second copy: one run a frame', () => {
  const s = sched();
  let runs = 0, wakeInside = true;
  const L = createLoopAsk(s.ask, s.cancel, () => { runs++; if (wakeInside) L.want(); L.again(); });
  L.want();
  for (let f = 0; f < 20; f++) { s.frame(f * 16); assert.ok(s.size <= 1, `frame ${f}: ${s.size} loops queued`); }
  assert.equal(runs, 20);
  wakeInside = false;
  for (let f = 0; f < 5; f++) s.frame();
  assert.equal(runs, 25);
});

test('a wake while the loop runs and then sleeps is answered in the next frame', () => {
  const s = sched();
  let runs = 0;
  const L = createLoopAsk(s.ask, s.cancel, () => { runs++; if (runs === 1) L.want(); /* sleeps: no again() */ });
  L.want();
  s.frame();
  assert.equal(s.size, 1, 'the wake inside the run asked for the next frame');
  s.frame();
  assert.equal(runs, 2);
  assert.equal(s.size, 0, 'asleep: nothing asked');
  assert.equal(L.pending, false);
});

test('wakes outside a run while a frame is asked for ask for nothing more; want(false) asks for nothing', () => {
  const s = sched();
  const L = createLoopAsk(s.ask, s.cancel, () => {});
  L.want(false);
  assert.equal(s.size, 0);
  L.want(); L.want(); L.want();
  assert.equal(s.size, 1);
  assert.equal(L.pending, true);
});

test('again() called twice in a run asks once', () => {
  const s = sched();
  const L = createLoopAsk(s.ask, s.cancel, () => { L.again(); L.again(); });
  L.want();
  s.frame();
  assert.equal(s.size, 1);
});

test('stop() cancels the frame asked for, and inside a run leaves nothing asked even after a wake before it', () => {
  const s = sched();
  let stopIn = false;
  const L = createLoopAsk(s.ask, s.cancel, () => { L.want(); if (stopIn) L.stop(); else L.again(); });
  L.want();
  L.stop();
  assert.equal(s.size, 0);
  assert.equal(L.pending, false);
  L.want(); stopIn = true;
  s.frame();
  assert.equal(s.size, 0);
  assert.equal(L.pending, false);
});

test('a run that throws is never left marked as running: the next wake asks again', () => {
  const s = sched();
  const L = createLoopAsk(s.ask, s.cancel, () => { throw new Error('boom'); });
  L.want();
  assert.throws(() => s.frame());
  assert.equal(L.pending, false);
  L.want();
  assert.equal(s.size, 1);
  assert.notEqual(RUNNING, 1);
});
