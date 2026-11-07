// W1: the model's clock keeps the part of a tick that is not a whole step, so over any stretch model time equals real time x speed
// (the steps were rounded up, which ran it about 6% fast at 1x). W2: the beat runs on through a presenter's eased change of patient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const messages = [];
  const core = createCore((m) => messages.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let i = 0; i < ms; i += 33) { now += 33; t.mock.timers.tick(33); } };
  return { core, messages, advance };
}

test('W1: at 1x and 4x the model clock gains no time on the wall clock', async (t) => {
  const { core, advance } = setup(t);
  await core.handle({ type: 'init' });
  for (const speed of [1, 4]) {
    await core.handle({ type: 'run', speed, clock: 'hemo' });
    advance(33);
    const eng = core.engine(), t0 = eng.t;
    const ticks = 300;   // 9.9 s of real time
    advance(33 * ticks);
    const model = eng.t - t0, real = 0.033 * ticks * speed;
    assert.ok(Math.abs(model - real) < 0.02 * real, `${speed}x: ${model.toFixed(3)} s of model time for ${real.toFixed(3)} s (was about 6% / 3% over)`);
  }
});

test('W2: the cardiac phase advances during a morph', async (t) => {
  const { core, advance } = setup(t);
  await core.handle({ type: 'init' });
  advance(2000);
  const snap = core.engine().snapshot();
  await core.handle({ type: 'morph', snap, ms: 1200 });
  const eng = core.engine(), c0 = eng.cyc;
  advance(600);
  const moved = eng.cyc - c0;
  assert.ok(moved > 0.3 * (eng.hr || 60) / 60 * 0.6 * 0.9, `phase moved ${moved.toFixed(3)} beats in 0.6 s of morph; it was frozen`);
});

// 3 Nov regression (HVPG catheter tracing and Pressure gut to heart drew no line): the morph's blended clock runs backwards, so a
// sample taken from it each tick made every frame look like a jump to the traces. A morph posts no samples, and after it they run on in order.
test('a morph posts no samples, and the samples after it are a steady, increasing stream', async (t) => {
  const { core, messages, advance } = setup(t);
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  const snap = core.engine().snapshot();
  await core.handle({ type: 'preset', id: 'healthy', reqId: 2 });
  advance(500);
  messages.length = 0;
  await core.handle({ type: 'morph', snap, ms: 1200 });
  advance(2500);
  const frames = messages.filter((m) => m.type === 'frame');
  const during = frames.filter((m) => m.morphing);
  assert.ok(during.length > 0);
  assert.ok(during.every((m) => !m.samples || m.samples.t.length === 0), 'no sample is posted from the blend');
  const after = frames.filter((m) => !m.morphing && m.samples?.t.length > 1);
  assert.ok(after.length >= 3, 'samples come in batches after it');
  let last = -Infinity;
  for (const m of after) for (const x of m.samples.t) { assert.ok(x > last, `time goes forward (${x} after ${last})`); last = x; }
});
