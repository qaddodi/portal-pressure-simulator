// A what-if slider dragged on the live model: the change settles on a hidden copy of the model, so the beat runs on and
// the Doppler traces stay smooth (relaxing the live model itself flattened the beat on every tick and the restart jolted
// the flow: a comb of spikes in the hepatic vein trace for as long as the slider moved). The change still settles within
// the presenter's 1.2 s ease. Each new value is eased in rather than landing at once (a stent's width stepped the trace at
// every frame), and the Doppler's scale holds still until the change has settled, then fits it in one change (Mohammad,
// 20 Oct: "let it settle before changing the Doppler").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { fitScale } from '../src/ui/dopplerWindow.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };

function drive(t, preset, patch) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const frames = [], settling = [];
  const core = createCore((f) => { if (f.type !== 'frame') return; settling.push(f.settling); if (f.samples) frames.push(f.samples); });
  t.after(() => core.dispose());
  const e = new Engine(); run(e.loadPresetSteps(preset, {}));
  if (patch) { e.setParams(deepMerge(e.params, patch)); e.settle(); }
  core.handle({ type: 'init' });
  core.handle({ type: 'restore', snap: e.snapshot() });
  const advance = (ms) => { now += ms; t.mock.timers.tick(ms); };
  // The largest change in hepatic vein velocity from one sample to the next, over the frames posted since the last call.
  const jump = () => {
    let max = 0;
    for (const s of frames.splice(0)) for (let i = 1; i < s[key].length; i++) max = Math.max(max, Math.abs(s[key][i] - s[key][i - 1]));
    return max;
  };
  let key = 'hvVel';
  const probe = (id) => { core.handle({ type: 'probe', id }); key = 'vel'; };
  return { core, advance, jump, probe, settling };
}

test('dragging the Tricuspid leak slider leaves the hepatic vein trace as smooth as the beat alone', (t) => {
  const { core, advance, jump } = drive(t, 'rhf');
  const params = () => core.engine().params;
  for (let k = 0; k < 90; k++) advance(33);   // the beat under way
  jump();
  for (let k = 0; k < 90; k++) advance(33);
  const beat = jump();
  // The presenter's slider: the new value every frame, eased over 1.2 s, for a second and a half of dragging.
  const tr0 = params().tr;
  for (let k = 0; k < 45; k++) {
    core.handle({ type: 'setParams', params: deepMerge(params(), { tr: tr0 - 0.4 * (k + 1) / 45 }), ease: 1200 });
    advance(33);
  }
  const drag = jump();
  assert.ok(beat > 0.5, `the beat moves the trace (${beat.toFixed(1)} cm/s a sample)`);
  assert.ok(drag < 1.5 * beat, `no spikes while dragging: ${drag.toFixed(1)} cm/s a sample, against ${beat.toFixed(1)} from the beat alone`);
});

test('a live change still settles within the ease: buffer off leaves about 40% of liver flow after a portal clot', (t) => {
  const { core, advance } = drive(t, 'pvt-acute');
  for (let k = 0; k < 60; k++) advance(33);
  const on = computeMetrics(core.engine()).liverPerfPct;
  core.handle({ type: 'setParams', params: deepMerge(core.engine().params, { habrStrength: 0 }), ease: 1200 });
  for (let k = 0; k < 40; k++) advance(33);
  const off = computeMetrics(core.engine()).liverPerfPct;
  assert.ok(on > 60 && on < 80, `buffer on ${on.toFixed(0)}%`);
  assert.ok(off > 33 && off < 47, `buffer off ${off.toFixed(0)}% (the slide says about 40%)`);
});

test('dragging a stent\'s width moves the stent\'s trace without a step at each new width', (t) => {
  const { core, advance, jump, probe } = drive(t, 'cirr-decomp', { tips: { on: true, d: 8 } });
  probe('TIPS');
  for (let k = 0; k < 90; k++) advance(33);
  jump();
  for (let k = 0; k < 90; k++) advance(33);
  const beat = jump();
  // The slider's 1 mm steps, 8 to 12 mm and back, a new value every frame.
  for (const [a, b] of [[8, 12], [12, 8]]) for (let k = 0; k < 45; k++) {
    core.handle({ type: 'setParams', params: deepMerge(core.engine().params, { tips: { d: Math.round(a + (b - a) * (k + 1) / 45) } }), ease: 1200 });
    advance(33);
  }
  const drag = jump();
  // (Each width landing at once stepped the trace by about 7 to 9 cm/s.)
  assert.ok(drag < 2, `the stent's velocity moves in steps of ${drag.toFixed(1)} cm/s a sample (the beat alone: ${beat.toFixed(1)})`);
});

test('the frames say a live change is settling while a slider moves and until it has settled', (t) => {
  const { core, advance, settling } = drive(t, 'cirr-decomp', { tips: { on: true, d: 8 } });
  for (let k = 0; k < 30; k++) advance(33);
  assert.equal(settling.splice(0).some(Boolean), false, 'nothing settling before the slider moves');
  for (let k = 0; k < 20; k++) { core.handle({ type: 'setParams', params: deepMerge(core.engine().params, { tips: { d: 8 + (k + 1) / 5 } }), ease: 1200 }); advance(33); }
  assert.ok(settling.splice(0).every(Boolean), 'settling all through the drag');
  for (let k = 0; k < 30; k++) advance(33);
  assert.ok(settling.splice(0).every(Boolean), 'and through the ease after it');
  for (let k = 0; k < 30; k++) advance(33);
  assert.equal(settling.at(-1), false, 'settled once the ease is over');
  // A change in Patients (no ease): settling while its numbers ease in, a fraction of a second.
  settling.length = 0;
  core.handle({ type: 'setParams', params: deepMerge(core.engine().params, { tips: { d: 11 } }) });
  advance(33);
  assert.equal(settling.at(-1), true);
  for (let k = 0; k < 40; k++) advance(33);
  assert.equal(settling.at(-1), false);
});

test('the Doppler\'s scale and baseline hold while a change settles, then fit it in one change', () => {
  const st = { scale: 30, baseF: 0.9, settleAt: 0, refit: false };
  const step = (o) => fitScale(st, { fixed: null, holding: false, fits: true, target: 30, tbF: 0.9, ...o });
  // While the slider moves: the trace clips and reverses, and the scale stays.
  for (let t = 1; t < 3; t += 0.1) step({ tNow: t, holding: true, fits: false, target: t < 2 ? 60 : 40, tbF: t < 2 ? 0.9 : 0.1 });
  assert.deepEqual([st.scale, st.baseF], [30, 0.9]);
  // Settled: one change to what the signal asks for now, even a smaller scale (no 3 s wait), and then it stays.
  step({ tNow: 3.1, fits: true, target: 20, tbF: 0.1 });
  assert.deepEqual([st.scale, st.baseF], [20, 0.1]);
  for (let t = 3.2; t < 6; t += 0.1) step({ tNow: t, target: 20, tbF: 0.1 });
  assert.deepEqual([st.scale, st.baseF], [20, 0.1]);
  // Without a change under way, a clip still refits at once and a smaller signal waits 3 s, as before.
  step({ tNow: 6, fits: false, target: 40, tbF: 0.1 });
  assert.equal(st.scale, 40);
  step({ tNow: 7, target: 20, tbF: 0.1 });
  assert.equal(st.scale, 40);
  step({ tNow: 9.1, target: 20, tbF: 0.1 });
  assert.equal(st.scale, 20);
  // A slide's fixed scale holds whatever happens.
  fitScale(st, { fixed: { nyq: 80, base: 0.5 }, holding: true, fits: false, target: 200, tbF: 0.9, tNow: 10 });
  assert.deepEqual([st.scale, st.baseF], [80, 0.5]);
});
