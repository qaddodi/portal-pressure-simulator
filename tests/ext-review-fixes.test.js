// External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is clock-and-morph-beat.test.js,
// EXT-ASY-1 is audit-correctness-b.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { createCore } from '../src/worker-core.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const messages = [];
  const core = createCore((m) => messages.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let i = 0; i < ms; i += 33) { now += 33; t.mock.timers.tick(33); } };
  return { core, messages, advance, jump: (ms) => { now += ms; }, frames: () => messages.filter((m) => m.type === 'frame') };
}

test('EXT-ENG-1: a restore returns the beat phase and the cardiac-output filter of the moment, so two engines agree after it', () => {
  const live = new Engine(); live.loadPreset('cirr-decomp');
  for (let i = 0; i < 100; i++) live.step(0.004);
  const snap = live.snapshot();
  const phase = live.phase(), co = live.COf;
  for (let i = 0; i < 400; i++) live.step(0.004);   // the model goes on: the phase and the filter move
  assert.notEqual(live.phase(), phase);
  live.restore(snap);
  assert.ok(Math.abs(live.phase() - phase) < 1e-12, 'the beat phase is the saved one');
  assert.equal(live.COf, co, 'the cardiac-output filter is the saved one');
  const scratch = new Engine(); scratch.restore(snap);   // (a fresh engine, whatever it held before)
  assert.ok(Math.abs(scratch.phase() - phase) < 1e-12);
  for (let i = 0; i < 5; i++) { live.step(0.004); scratch.step(0.004); }
  assert.ok(Math.abs(live.phase() - scratch.phase()) < 1e-12, 'one identical step later they still agree');
  const a = computeMetrics(live), b = computeMetrics(scratch);
  for (const k of ['co', 'map', 'hr', 'pv']) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${k}: ${a[k]} vs ${b[k]}`);
});

test('EXT-ENG-1: a snapshot from before they were kept starts the beat at 0 and the filter fresh, not from the engine it lands on', () => {
  const e = new Engine(); e.loadPreset('healthy');
  for (let i = 0; i < 100; i++) e.step(0.004);
  const old = e.snapshot(); delete old.cyc; delete old.COf;
  const other = new Engine(); for (let i = 0; i < 250; i++) other.step(0.004); other.COf = 12;
  other.restore(old);
  assert.equal(other.cyc, 0);
  assert.equal(other.COf, undefined);
});

test('EXT-WRK-1: a restore drops the samples of the state it replaces, and the frame names the new generation', async (t) => {
  const { core, advance, frames } = setup(t);
  await core.handle({ type: 'init' });
  const snap = core.engine().snapshot(), t0 = core.engine().t;
  advance(33);   // one tick: samples taken, not yet posted
  const before = frames().length, gen0 = frames().at(-1)?.gen ?? 0;
  await core.handle({ type: 'restore', snap });
  const f = frames().at(-1);
  assert.ok(frames().length > before, 'the restore posts its frame');
  assert.equal(f.t, t0);
  assert.ok(!f.samples || f.samples.t.every((x) => x >= t0 - 1e-9 && x <= t0 + 1e-9), 'no sample of the later moment goes out with the restored state');
  assert.equal(f.samples?.t.length || 0, 0);
  assert.ok(f.gen > gen0, 'the frame says the state was replaced');
});

test('EXT-WRK-2: loading a patient or a reset ends a time-lapse that was acting on the old one', async (t) => {
  const { core, advance, frames } = setup(t);
  await core.handle({ type: 'init' });
  await core.handle({ type: 'lapse', days: 10, speed: 1, ramp: { cirrhosis: [0, 1] }, bedside: true });
  advance(500);
  assert.ok(frames().at(-1).lapseDay > 0, 'the ramp is running');
  await core.handle({ type: 'preset', id: 'healthy', reqId: 1 });
  advance(500);
  assert.equal(core.engine().params.cirrhosis, 0, 'the new patient is not ramped');
  assert.equal(frames().at(-1).lapseDay, undefined, 'the frame no longer reports the old lapse');
  // The same through reset, with the disease clock running a presenter's days.
  await core.handle({ type: 'lapse', days: 30, speed: 5 });
  await core.handle({ type: 'reset' });
  const day = core.engine().day;
  advance(1000);
  assert.equal(core.engine().day, day, 'the new engine is not aged');
  assert.equal(frames().at(-1).clock, 'hemo');
});

test('EXT-WRK-3: a morph does not count the time the tab was hidden', async (t) => {
  const { core, advance, jump, frames } = setup(t);
  await core.handle({ type: 'init' });
  const snap = core.engine().snapshot();
  await core.handle({ type: 'morph', snap, ms: 1000 });
  advance(300);
  await core.handle({ type: 'visibility', visible: false });
  jump(5000);   // five seconds in the background
  await core.handle({ type: 'visibility', visible: true });
  advance(100);
  assert.equal(frames().at(-1).morphing, true, 'still in the morph: it had about 600 ms left');
  advance(900);
  assert.equal(frames().at(-1).morphing, false, 'and it ends on its own time');
});

test('EXT-HIS-1: the timeline cancels the debounce it owns and ignores a timer of an older edit or history', () => {
  const tl = readFileSync(new URL('../src/ui/timeline.js', import.meta.url), 'utf8');
  const fp = tl.slice(tl.indexOf('function flushParams()'), tl.indexOf('/** An engine action'));
  assert.match(fp, /clearTimeout\(pending\.timer\);\s*pending = null;/, 'a flush cancels its own timer');
  const rs = tl.slice(tl.indexOf('function reset(label)'), tl.indexOf('/** A change made by the learner'));
  assert.match(rs, /if \(pending\) clearTimeout\(pending\.timer\);\s*tlGen\+\+;/, 'a reset cancels it and starts a new history');
  assert.match(tl, /if \(pending && mine === editSeq\) flushParams\(\)/, 'a timer of an older edit does not flush the newer one');
  assert.match(tl, /later\(\(\) => snapInto\(e\), 80\)/);
  assert.match(tl, /later\(\(\) => snapInto\(e\), 120\)/);
  assert.match(tl, /if \(g !== tlGen\) return;/, 'a snapshot that comes back after a reset is not published');
});
