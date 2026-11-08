// The encephalopathy index (metrics.js heRisk): weighted by the portal blood that skips the liver and by the liver's own perfusion, so stents of
// 6, 8, 10 and 12 mm read apart and monotonically, it stays inside its 0 to 1 tile, no patient starts above 1 before a TIPS, and a healthy
// liver stays low. (Until 8 Nov 2026 it was the shunted share alone, near 94% after any TIPS: 1.20 for every width, and 1.03 before the
// TIPS in the TIPS Doppler patient.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSteps } from './deck-states.js';

const PRESETS = ['healthy', 'pvt-acute', 'pvt-chronic', 'svt', 'schisto', 'cirr-comp', 'csph', 'masld-csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'sos', 'budd-chiari'];
const tipsSweep = (preset, extra = {}) => [6, 8, 10, 12].map((d) => ({ preset, params: { ...extra, tips: { on: true, d } } }));

test('the index stays inside its 0 to 1 tile in every preset, with and without a TIPS or a spontaneous shunt', async () => {
  const steps = [...PRESETS.map((preset) => ({ preset })), ...tipsSweep('cirr-decomp'), { preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30 }];
  const fps = await runSteps(steps);
  fps.forEach((f, i) => assert.ok(f.he >= 0 && f.he < 1, `step ${i} (${steps[i].preset}): index ${f.he}`));
});

test('a healthy liver stays low, and the acute portal vein thrombosis with a normal liver reads about 0.34', async () => {
  const [healthy, pvt, comp] = await runSteps([{ preset: 'healthy' }, { preset: 'pvt-acute' }, { preset: 'cirr-comp' }]);
  assert.ok(healthy.he < 0.05, `healthy ${healthy.he}`);
  assert.ok(Math.abs(pvt.he - 0.34) < 0.03, `pvt-acute ${pvt.he}`);
  assert.ok(comp.he < 0.2, `compensated cirrhosis (Low) ${comp.he}`);
});

test('6, 8, 10 and 12 mm stents read differently and rise with the width, in a healthy, a compensated and a decompensated liver', async () => {
  for (const preset of ['healthy', 'cirr-comp', 'csph', 'cirr-decomp']) {
    const he = (await runSteps(tipsSweep(preset))).map((f) => f.he);
    for (let i = 1; i < he.length; i++) assert.ok(he[i] > he[i - 1] && Math.round(he[i] * 100) > Math.round(he[i - 1] * 100), `${preset}: ${he.map((v) => v.toFixed(3))} must rise by a hundredth or more at each width`);
    assert.ok(he.every((v) => v < 1), `${preset}: ${he}`);
  }
});

test('no patient starts above 1 before a TIPS: the TIPS Doppler patient (1.03 before) is High but under 1, and the stent raises it', async () => {
  const before = { preset: 'cirr-decomp', params: { cirrhosis: 0.92 } };
  const [a, b] = await runSteps([before, { ...before, params: { cirrhosis: 0.92, tips: { on: true, d: 10 } }, days: 30 }]);
  assert.ok(a.he > 0.45 && a.he < 1, `before the TIPS ${a.he}`);
  assert.ok(b.he > a.he && b.he < 1, `after the TIPS ${b.he}`);
});

test('the liver\'s own perfusion counts: a narrowed stent reads lower than the open one, and plugging a splenorenal shunt lowers the index', async () => {
  const [open, narrowed, shunt, plugged] = await runSteps([
    { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } } },
    { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.5 } } },
    { preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30 },
    { params: { occluded: { C6: true } }, days: 90 },
  ]);
  assert.ok(narrowed.he < open.he && narrowed.liver > open.liver, `narrowed ${narrowed.he} against open ${open.he}`);
  assert.ok(plugged.he < shunt.he - 0.15, `plugged ${plugged.he} against open ${shunt.he}`);
});
