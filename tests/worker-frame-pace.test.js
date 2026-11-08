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
