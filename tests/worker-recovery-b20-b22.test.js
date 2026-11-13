import { stageSource } from './stage-src.js';
// B20 (a failed sweep worker is dropped and replaced or bypassed), B21 (a clear leaves no elapsed-time debt) and B22 (a failed dye
// worker is terminated and its running injections go on locally). Fake workers, so the message order is driven by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSweepClient } from '../src/ui/sweep-client.js';
import { DYE_BINS } from '../src/ui/blood.js';

// (dye-remote.js reads `Worker` once, when it loads: it must exist then.)
globalThis.Worker ??= function Worker() {};
const { createDyeRemote } = await import('../src/ui/dye-remote.js');

class FakeWorker {
  constructor() { this.sent = []; this.terminated = false; FakeWorker.all.push(this); }
  postMessage(m) { this.sent.push(m); }
  terminate() { this.terminated = true; }
}
FakeWorker.all = [];

test('B20: after a worker error the next binning gets a new worker and settles', async () => {
  FakeWorker.all = [];
  const c = createSweepClient(() => new FakeWorker());
  const first = c.request({ kind: 'bin' });
  const [w1] = FakeWorker.all;
  w1.onerror();
  await assert.rejects(first, /worker/);
  assert.equal(w1.terminated, true);
  assert.equal(w1.onmessage, null);
  assert.equal(c.alive, false);
  assert.equal(c.pending, 0);
  const second = c.request({ kind: 'bin' });
  assert.equal(FakeWorker.all.length, 2);
  const w2 = FakeWorker.all[1];
  w2.onmessage({ data: { id: w2.sent[0].id, b: 'binned' } });
  assert.equal(await second, 'binned');
});

test('B20: repeated failures stop restarting and reject at once; one good reply resets the count', async () => {
  FakeWorker.all = [];
  const c = createSweepClient(() => new FakeWorker(), { maxFails: 2 });
  for (let i = 0; i < 2; i++) { const p = c.request({}); FakeWorker.all.at(-1).onerror(); await assert.rejects(p); }
  assert.equal(FakeWorker.all.length, 2);
  await assert.rejects(c.request({}), /failed/);
  assert.equal(FakeWorker.all.length, 2, 'no third worker is made');
  const d = createSweepClient(() => new FakeWorker(), { maxFails: 2 });
  const p1 = d.request({}); FakeWorker.all.at(-1).onerror(); await assert.rejects(p1);
  const p2 = d.request({}); const w = FakeWorker.all.at(-1); w.onmessage({ data: { id: w.sent[0].id, b: 1 } }); await p2;
  const p3 = d.request({}); FakeWorker.all.at(-1).onerror(); await assert.rejects(p3);
  const p4 = d.request({}); assert.equal(FakeWorker.all.length, 5, 'the count began again after the good reply');
  FakeWorker.all.at(-1).onerror(); await assert.rejects(p4);
});

test('B20: a request the worker never answers times out, drops the worker and rejects the others it held', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FakeWorker.all = [];
  const c = createSweepClient(() => new FakeWorker(), { timeout: 1000 });
  const a = c.request({}), b = c.request({});
  t.mock.timers.tick(1000);
  await assert.rejects(a, /timeout/);
  await assert.rejects(b, /timeout/);
  assert.equal(FakeWorker.all[0].terminated, true);
  assert.equal(c.pending, 0);
  const next = c.request({});
  assert.equal(FakeWorker.all.length, 2);
  const w = FakeWorker.all[1];
  w.onmessage({ data: { id: w.sent[0].id, error: 'bad input' } });
  await assert.rejects(next, /bad input/);
  assert.equal(c.alive, true, 'an error for one request is not a dead worker');
});

test('B20: stage.js uses the client, not a retained worker', () => {
  const src = stageSource();
  assert.match(src, /createSweepClient\(/);
  assert.doesNotMatch(src, /mt\.worker/);
});

const EDGES = [{ id: 'a', from: 'n0', to: 'n1', kind: 'vein' }, { id: 'b', from: 'n1', to: 'n2', kind: 'vein' }];
const NODES = [{ id: 'n0' }, { id: 'n1' }, { id: 'n2' }];
const net = () => ({ Q: [1, 1], vd: [1, 1], len: [10, 10] });
const reply = (w, step, over = {}) => w.onmessage({ data: { seq: step.seq, fields: new Float32Array(EDGES.length * DYE_BINS), has: new Uint8Array(EDGES.length), active: true, injecting: true, ...over } });
const steps = (w) => w.sent.filter((m) => m.t === 'step');

test('B21: the first step after a clear carries only time after the clear', () => {
  FakeWorker.all = [];
  const d = createDyeRemote(EDGES, NODES, () => new FakeWorker());
  const w = FakeWorker.all[0];
  d.step(0.1, net());                 // sent, awaiting a reply
  d.step(0.2, net()); d.step(0.3, net());   // owed 0.5, before the clear
  d.clear();
  d.inject(0, 0, {});
  d.step(0.05, net());                // after the clear
  assert.equal(steps(w).length, 2, 'the post-clear step is sent at once, not held behind the old reply');
  assert.ok(Math.abs(steps(w)[1].dt - 0.05) < 1e-12, 'only post-clear time: ' + steps(w)[1].dt);
  reply(w, steps(w)[0]);              // the old reply arrives late
  assert.equal(steps(w).length, 2, 'the old reply sends nothing');
  assert.equal(d.active, true);
  assert.equal(d.injecting, true, 'the old reply does not end the new injection\'s pending state early');
  reply(w, steps(w)[1]);
  assert.equal(d.seq, steps(w)[1].seq);
});

test('B21: time between a clear and the old reply is kept for the new generation', () => {
  FakeWorker.all = [];
  const d = createDyeRemote(EDGES, NODES, () => new FakeWorker());
  const w = FakeWorker.all[0];
  d.step(0.1, net()); d.step(0.4, net());
  d.clear();
  d.step(0.02, net());                // sent now (out was reset)
  d.step(0.03, net());                // owed behind the new step
  reply(w, steps(w)[1]);
  assert.ok(Math.abs(steps(w)[2].dt - 0.03) < 1e-12);
});

test('B22: a worker error terminates it and running injections, held ones included, go on locally; nothing is left pending', () => {
  FakeWorker.all = [];
  const warn = console.warn; console.warn = () => {};
  try {
    const d = createDyeRemote(EDGES, NODES, () => new FakeWorker());
    const w = FakeWorker.all[0];
    d.inject(0, 0, { hold: true });
    d.inject(1, 0.5, { seconds: 6 });
    d.step(2, net());                   // a step out; the worker holds the dye in transit
    w.onerror();
    assert.equal(w.terminated, true);
    assert.equal(w.onmessage, null);
    assert.equal(d.failed, true);
    assert.equal(d.remote, false, 'a paused step of no time is not sent to the local bolus');
    assert.equal(d.injecting, true, 'the injections still running are started again');
    assert.equal(d.active, true);
    d.step(0.05, net());                // on the main thread now
    assert.equal(steps(w).length, 1, 'no more messages to the dead worker');
    d.release();
    d.step(5, net());
    const row = new Float32Array(DYE_BINS);
    assert.equal(d.field(0, net(), row), true, 'the held injection laid dye locally');
    d.clear();
    assert.equal(d.active, false);
  } finally { console.warn = warn; }
});

test('B22: a step unanswered past the timeout fails the worker over; dispose ends it', (t) => {
  FakeWorker.all = [];
  t.mock.method(console, 'warn', () => {});
  let clock = 0;
  const d = createDyeRemote(EDGES, NODES, () => new FakeWorker(), { now: () => clock, timeout: 1000 });
  const w = FakeWorker.all[0];
  d.inject(0, 0, { seconds: 6 });
  d.step(0.1, net());
  clock = 1500;
  d.step(0.1, net());
  assert.equal(d.failed, true);
  assert.equal(w.terminated, true);
  assert.equal(d.injecting, true);
  const e = createDyeRemote(EDGES, NODES, () => new FakeWorker());
  const w2 = FakeWorker.all[1];
  e.inject(0, 0, { hold: true });
  e.dispose();
  assert.equal(w2.terminated, true);
  assert.equal(e.active, false);
});
