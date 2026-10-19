// A what-if slider dragged on the live model: the change settles on a hidden copy of the model, so the beat runs on and
// the Doppler traces stay smooth (relaxing the live model itself flattened the beat on every tick and the restart jolted
// the flow: a comb of spikes in the hepatic vein trace for as long as the slider moved). The change still settles within
// the presenter's 1.2 s ease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };

function drive(t, preset) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const frames = [];
  const core = createCore((f) => { if (f.samples) frames.push(f.samples); });
  t.after(() => core.dispose());
  const e = new Engine(); run(e.loadPresetSteps(preset, {}));
  core.handle({ type: 'init' });
  core.handle({ type: 'restore', snap: e.snapshot() });
  const advance = (ms) => { now += ms; t.mock.timers.tick(ms); };
  // The largest change in hepatic vein velocity from one sample to the next, over the frames posted since the last call.
  const jump = () => {
    let max = 0;
    for (const s of frames.splice(0)) for (let i = 1; i < s.hvVel.length; i++) max = Math.max(max, Math.abs(s.hvVel[i] - s.hvVel[i - 1]));
    return max;
  };
  return { core, advance, jump };
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
