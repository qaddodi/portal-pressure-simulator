// A Doppler on a vessel with no flow draws no line. When the probe moves to a vessel, the worker sends the samples it took on the old one in a
// frame of their own, named for the old vessel (worker-core.js probe). The paint gate paints only the newest frame, and the samples of the frames
// taken in meanwhile are joined into it (frame-samples.js): joined under the new vessel's name they were read as its own, and 0.1 s of the old
// vessel's flow drew as a bright streak on a Budd–Chiari right hepatic vein reading "No flow · No signal" (Mohammad, 16 Nov 2026, slide 3/14).
// No browser: the worker's own core and its frames through the same owing the page uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { createCore } from '../src/worker-core.js';
import { createSampleOwing, joinSamples } from '../src/ui/frame-samples.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frameOf = (gen, probe, t0, n, vel) => ({ gen, clock: 'hemo', morphing: false, probe, samples: { t: Float64Array.from({ length: n }, (_, i) => t0 + i * 0.004), ph: new Float64Array(n), vel: new Float64Array(n).fill(vel) } });

test('samples taken on the old vessel are not read as the new vessel\'s when the painted frame carries them', () => {
  const o = createSampleOwing();
  o.take(frameOf(1, 'PV_TRUNK', 10, 25, -18));          // (the frame the worker sends as the probe moves: the old vessel, with flow)
  const f2 = frameOf(1, 'RHV_IVC', 10.1, 25, 0); o.take(f2);   // (the new vessel's own, with none)
  const p = o.forPaint(f2);
  assert.equal(p.samples.t.length, 50, 'every sample still goes in, so the beats and times are unbroken');
  assert.equal([...p.samples.vel].filter((v) => v !== 0 && Number.isFinite(v)).length, 0, 'no velocity of the old vessel on the new one');
  assert.equal([...p.samples.vel.slice(0, 25)].every(Number.isNaN), true, 'the old vessel\'s stretch has no velocity');
  assert.equal(p.samples.ph.length, 50);
  // (the same vessel throughout joins as it always did)
  const q = createSampleOwing(), a = frameOf(1, 'RHV_IVC', 0, 5, 3), b = frameOf(1, 'RHV_IVC', 1, 5, 4); q.take(a); q.take(b);
  assert.deepEqual([...q.forPaint(b).samples.vel], [3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  assert.deepEqual([...joinSamples([a.samples, b.samples]).vel].length, 10);
});

test('through the worker: a probe moved to a vessel with no flow, in a patient whose portal vein flows, shows no flow on the new probe', async (t) => {
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  await core.handle({ type: 'preset', id: 'budd-chiari' });
  core.handle({ type: 'probe', id: 'PV_TRUNK' });
  core.handle({ type: 'traces', on: false });   // (no trace is drawing yet, as before the Doppler's card comes in: the worker sends a frame about once a second and the samples wait for it)
  core.handle({ type: 'run', running: true });
  await wait(1700);
  const before = msgs.length;
  core.handle({ type: 'probe', id: 'RHV_IVC' });
  core.handle({ type: 'traces', on: true });    // (the card is up: its frames come about ten times a second)
  await wait(900);
  const frames = msgs.slice(before).filter((m) => m.type === 'frame');
  assert.ok(frames.some((f) => f.probe === 'PV_TRUNK' && f.samples?.vel?.some((v) => Math.abs(v) > 0.3)), 'the worker flushes the old vessel\'s samples, with flow, under its own name');
  assert.ok(frames.some((f) => f.probe === 'RHV_IVC'), 'and then sends the new vessel\'s');
  const o = createSampleOwing();
  for (const f of frames) o.take(f);                    // (every frame taken in, none painted: the gate paints only the newest)
  const last = frames.at(-1), p = o.forPaint(last);
  assert.equal(last.probe, 'RHV_IVC');
  const live = [...p.samples.vel].filter((v) => Number.isFinite(v));
  assert.ok(live.length > 100, 'the new vessel\'s own samples are there');
  assert.ok(live.every((v) => Math.abs(v) < 0.05), 'and none of the old vessel\'s flow with them');
});
