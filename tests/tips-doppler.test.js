// The TIPS Doppler talk teaches what the model shows: with a working stent every intrahepatic branch flows toward it
// (left portal vein reversed, right portal vein before the stent hepatopetal, the right branches beyond it reversed),
// the stent runs at 90–190 cm/s and the main portal vein speeds up past 30 cm/s; narrowed, the stent slows under 90 cm/s, the main
// portal vein slows under 30 cm/s and the left portal vein turns back toward the liver. The slides are run as the presenter runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, dopplerK } from '../src/engine/topology.js';
import { deepMerge } from '../src/engine/scenario.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { TIPS_DOPPLER } from '../src/ui/decks/tips-doppler.js';

// The Doppler's reading: flow over the lumen, scaled to the spectrum's peak (topology.js dopplerK).
const vel = (e, id) => { const k = e.ei[id], d = e.diameter(id) / 10; return (e.Q[k] / (Math.PI * d * d / 4)) * dopplerK(EDGES[k]); };
const slide = (id) => TIPS_DOPPLER.slides.find((s) => s.id === id);
function run(upTo) {
  const e = new Engine();
  for (const s of TIPS_DOPPLER.slides) {
    if (s.preset) e.loadPreset(s.preset);
    if (s.params) { e.setParams(deepMerge(e.params, s.params)); e.settle(); }
    if (s.days) { e.advanceDays(s.days, { noRupture: true, silent: true }); e.settle(); }
    if (s.id === upTo) return e;
  }
  throw new Error(`no slide ${upTo}`);
}

test('a working TIPS: fast stent, faster portal vein, every branch toward the stent', () => {
  const before = run('before'), e = run('stent');
  assert.ok(vel(e, 'TIPS') >= 90 && vel(e, 'TIPS') <= 190, `stent ${vel(e, 'TIPS')}`);
  assert.ok(vel(e, 'PV_TRUNK') > 30 && vel(e, 'PV_TRUNK') > vel(before, 'PV_TRUNK') + 10, `the main portal vein speeds up past 30 cm/s (${vel(e, 'PV_TRUNK')})`);
  assert.ok(vel(before, 'PV_TRUNK') < 15, 'slow before the stent');
  assert.ok(vel(before, 'PVH_L') > 9, 'the left portal vein is hepatopetal before the stent');
  assert.ok(vel(e, 'PVH_L') < -5, `left portal vein toward the stent (${vel(e, 'PVH_L')})`);
  assert.ok(vel(e, 'PVH_R') > 9, 'right portal vein before the stent runs on into it');
  assert.ok(e.Q[e.ei.PRE_R] < 0, 'right branches beyond the stent drain back toward it');
  assert.ok(computeMetrics(e).ppg < 12, 'the PPG falls under 12 mmHg');
});

test('a narrowed TIPS: slow stent, slower portal vein, a hepatopetal left portal vein, varices back', () => {
  const ok = run('stent'), e = run('narrow');
  assert.ok(vel(e, 'TIPS') > 2 && vel(e, 'TIPS') < 90, `stent ${vel(e, 'TIPS')}`);
  assert.ok(vel(e, 'PV_TRUNK') < 30 && vel(e, 'PV_TRUNK') < vel(ok, 'PV_TRUNK') - 5, `the main portal vein slows under 30 cm/s (${vel(e, 'PV_TRUNK')})`);
  assert.ok(vel(e, 'PVH_L') > 9, `left portal vein back toward the liver (${vel(e, 'PVH_L')})`);
  const m = computeMetrics(e);
  assert.ok(m.ppg >= 12 && m.ascites.volume > 150, 'the gradient and the fluid come back');
  assert.ok(m.varix.r > computeMetrics(ok).varix.r, 'the varices grow again');
});

test('the talk uses the lenses it teaches, and every lens is one the presenter knows', () => {
  const lenses = new Set(TIPS_DOPPLER.slides.map((s) => s.lens).filter(Boolean));
  for (const k of ['velocity', 'flow', 'direction', 'heat']) assert.ok(lenses.has(k), k);
  for (const k of lenses) assert.ok(['velocity', 'flow', 'direction', 'heat', 'drop', 'delta', 'origin'].includes(k), k);
  assert.equal(slide('left').tool.vessel, 'PVH_L');
  assert.equal(slide('warn').whatIf.param, 'stenosis.TIPS');
});

test('proximal, mid and distal stent velocities: the narrowed stent slows along its length and speeds up at its hepatic vein end', async () => {
  const { stentSegments } = await import('../src/engine/topology.js');
  const ok = run('stent'), [p0, m0, d0] = stentSegments(vel(ok, 'TIPS'), 0);
  assert.ok(p0 === m0 && m0 === d0 && p0 >= 90 && p0 <= 190, `a working stent reads the same at all three points (${p0})`);
  const e = run('narrow'), [p, m, d] = stentSegments(vel(e, 'TIPS'), slide('narrow').params.stenosis.TIPS);
  assert.ok(p < 90 && m < 90, `proximal and mid slow under 90 (${p})`);
  assert.ok(d > 2.5 * p, `the distal stent speeds up through the narrowing (${d} vs ${p})`);
});
