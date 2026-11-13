// Perf C4/C5/C3: how many frames the worker builds and posts when the page paints slowly, and the history it keeps.
// A fake clock (performance.now and setInterval) and a fake page that acknowledges a paint every PAINT_MS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';

const stateOf = (patch) => { const e = new Engine(); e.setParams(deepMerge(e.params, patch)); e.settle(); return e.snapshot(); };

// A core on a fake clock; page(ms, each) runs ms of it in 1 ms ticks, calling each(now) every tick; ack: the page's paint ack every PAINT_MS.
function rig(t, { ack, paintMs = 100 }) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push({ at: now, m }); });
  t.after(() => core.dispose());
  let nextPaint = Infinity;
  const run = (ms, each) => {
    for (let i = 0; i < ms; i++) {
      now += 1; t.mock.timers.tick(1);
      if (each) each(now);
      if (ack && now >= nextPaint) { nextPaint = now + paintMs; core.handle({ type: 'painted' }); }
    }
  };
  return { core, frames, run, start: async () => {
    await core.handle({ type: 'init' });
    if (ack) { await core.handle({ type: 'ackPaint', on: true }); nextPaint = now + paintMs; }
    run(300);
    frames.length = 0;
  } };
}

test('Perf C4: a morph posts no frame while the page has not painted the last one, and still lands exactly', async (t) => {
  const healthy = stateOf({}), sick = stateOf({ cirrhosis: 0.7 });
  const out = {};
  for (const [name, opts] of [['noAck', { ack: false }], ['slow', { ack: true, paintMs: 100 }]]) {
    await t.test(name, async (st) => {
      const r = rig(st, opts);
      await r.start();
      await r.core.handle({ type: 'restore', snap: healthy });
      r.frames.length = 0;
      await r.core.handle({ type: 'morph', snap: sick, ms: 1500 });
      r.run(1500);
      r.run(200);
      out[name] = r;
      st.mock.timers.reset();
    });
  }
  const n0 = out.noAck.frames.length, n1 = out.slow.frames.length;
  console.log(`# C4 morph 1.5 s: ${n0} frames with no ack, ${n1} with a 100 ms paint`);
  assert.ok(n0 >= 45, `a page that does not acknowledge still gets a frame every tick (${n0})`);
  assert.ok(n1 <= n0 / 2, `a page that paints every 100 ms is sent about one frame a paint, not one a tick (${n1} against ${n0})`);
  const end = out.slow.frames.at(-1).m;
  assert.equal(end.morphing, false, 'the landing frame is posted');
  assert.ok(Math.abs(out.slow.core.engine().params.cirrhosis - 0.7) < 1e-9, 'it lands on the slide state');
  assert.ok(out.slow.frames.some((f) => f.m.params), 'the params throttle still posts the params');
});

test('Perf C5: a slider drag while the page has not painted is answered by one frame a paint, not one an input', async (t) => {
  const out = {};
  for (const [name, opts] of [['noAck', { ack: false }], ['slow', { ack: true, paintMs: 50 }]]) {
    await t.test(name, async (st) => {
      const r = rig(st, opts);
      await r.start();
      const base = structuredClone(r.core.engine().params);
      let n = 0;
      // A 60 Hz drag for a second: an input every 16 ms.
      r.run(1000, (now) => {
        if (now % 16 === 0) {
          n++;
          r.core.handle({ type: 'setParams', params: deepMerge(base, { cirrhosis: 0.1 + 0.0005 * n }) });
        }
      });
      out[name] = { frames: r.frames.length, inputs: n, last: r.core.engine().paramsTarget().cirrhosis, r };
      r.run(500);
      out[name].after = r.core.engine().params.cirrhosis;
      out[name].lastFrame = r.frames.at(-1).m;
      st.mock.timers.reset();
    });
  }
  const a = out.noAck, b = out.slow;
  console.log(`# C5 drag, ${a.inputs} inputs in 1 s: ${a.frames} frames with no ack, ${b.frames} with a 50 ms paint`);
  assert.ok(a.frames >= a.inputs, `a page that does not acknowledge gets a frame an input (${a.frames} for ${a.inputs})`);
  assert.ok(b.frames <= 25, `a page that paints every 50 ms gets about one frame a paint (${b.frames})`);
  assert.equal(b.last, a.last, 'the model is where the same drag leaves it');
  assert.ok(b.lastFrame.changed !== undefined && b.r.frames.length > b.frames, 'the frames go on after the drag ends');
});

test('Perf C3: the same history asked for again on an unchanged model is the kept one, and any change makes a new one', async (t) => {
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  core.handle({ type: 'run', running: true });
  await new Promise((r) => setTimeout(r, 400));
  await core.handle({ type: 'run', running: false });
  const step = t.mock.method(Engine.prototype, 'step');
  const ask = async (secs, reqId) => {
    const at = msgs.length;
    core.handle({ type: 'history', secs, reqId });
    for (let i = 0; i < 400; i++) {
      const m = msgs.slice(at).find((x) => x.type === 'history' && x.reqId === reqId);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no history');
  };
  const a = await ask(6, 1), steps = step.mock.callCount();
  assert.ok(a.samples && steps > 1000, `a first history is run (${steps} steps)`);
  const b = await ask(6, 2);
  assert.equal(step.mock.callCount(), steps, 'the second costs no model steps');
  assert.deepEqual(b.samples, a.samples, 'and is the same history');
  assert.equal(b.t, a.t);
  assert.notEqual(b.samples, a.samples, 'each is its own object');
  b.samples.t[0] = -1;
  assert.notEqual((await ask(6, 3)).samples.t[0], -1, 'what the page does to one does not reach the kept one');
  assert.equal(step.mock.callCount(), steps);
  await ask(8, 4);
  assert.ok(step.mock.callCount() > steps, 'another window is a new history');
  const s2 = step.mock.callCount();
  await core.handle({ type: 'setParams', params: deepMerge(core.engine().params, { cirrhosis: 0.5 }), settle: true });
  await ask(8, 5);
  assert.ok(step.mock.callCount() > s2, 'a changed model is a new history');
  const s3 = step.mock.callCount();
  await ask(8, 6);
  assert.equal(step.mock.callCount(), s3, 'and that one is kept in turn');
  await core.handle({ type: 'action', action: { kind: 'infuse', fluid: 'saline' } });
  await ask(8, 7);
  assert.ok(step.mock.callCount() > s3, 'an action makes a new one');
  const s4 = step.mock.callCount();
  core.handle({ type: 'run', running: true });
  await new Promise((r) => setTimeout(r, 100));
  await core.handle({ type: 'run', running: false });
  await ask(8, 8);
  assert.ok(step.mock.callCount() > s4 + 1000, 'a clock that has run since makes a new one');
});
