// The Doppler talk's meal slide (on screen 4) plays its meal on the seconds clock: the beat runs and the Doppler keeps
// recording while splanchnic tone falls, so the portal trace visibly rises, instead of pausing on the disease clock
// ("Not available during time lapse") and leaving the monitor acquiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOPPLER } from '../src/ui/decks/doppler.js';
import { createCore } from '../src/worker-core.js';

test('the meal slide is a bedside time-lapse with its meal ramp', () => {
  const s = DOPPLER.slides.find((x) => x.id === 'meal');
  assert.equal(s.lapse.clock, 'seconds');
  assert.equal(s.tool.kind, 'doppler');
  assert.deepEqual(s.ramp.splanchnicTone, [1, 0.72]);
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /ramp: s\.ramp \|\| null, bedside: bedside\(s\)/);
  assert.match(pres, /type: 'lapseFast', ms: 600/);
});

test('a bedside lapse runs time on the seconds clock, ramps the meal, keeps sampling and the portal flow rises', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let k = 0; k < ms; k += 33) { now += 33; t.mock.timers.tick(33); } };
  core.handle({ type: 'init', params: { respiration: false } });
  advance(2000);
  const t0 = core.engine().t, day0 = core.engine().day;
  core.handle({ type: 'lapse', days: 8, speed: 8 / 6, ramp: { splanchnicTone: [1, 0.72] }, bedside: true });
  advance(3000);
  const mid = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.equal(mid.clock, 'hemo', 'the seconds clock: the Doppler records');
  assert.ok(mid.lapseDay > 3 && mid.lapseDay < 5, `halfway through its days (${mid.lapseDay})`);
  assert.ok(core.engine().params.splanchnicTone < 0.9 && core.engine().params.splanchnicTone > 0.8);
  const during = msgs.filter((m) => m.type === 'frame' && m.lapseDay != null);
  assert.ok(during.length > 50 && during.every((m) => !m.settling), 'the Doppler never holds its scale during the meal: it follows the rise');
  assert.ok(mid.samples?.t.length || msgs.some((m) => m.type === 'frame' && m.samples?.t.length > 0), 'the trace keeps sampling');
  advance(4000);
  const end = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.equal(end.lapseDay, undefined, 'the lapse has ended');
  assert.ok(Math.abs(core.engine().params.splanchnicTone - 0.72) < 1e-9);
  assert.ok(core.engine().t > t0 + 6, 'time ran');
  assert.equal(core.engine().day, day0, 'no disease days');
  const q0 = msgs.find((m) => m.type === 'frame' && m.lapseDay != null).metrics.pvFlowMean, q1 = end.metrics.pvFlowMean;
  assert.ok(q1 > q0 * 1.2, `portal flow rose with the meal as it played (${q0.toFixed(2)} → ${q1.toFixed(2)} L/min)`);
});
