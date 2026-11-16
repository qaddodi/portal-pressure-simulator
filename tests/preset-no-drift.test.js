// A patient picked opens at its bedside rest (play-test A1, 16 Nov 2026). The settle that makes a patient runs without the breath and the pulse, and
// the beating model's means sit a little off it (HVPG by up to 0.6 mmHg, MAP by about 1), so a picked patient's readings drifted for 8 to 10 s after
// it was chosen (Decompensated: HVPG 16.7, then 16.0). The worker now runs the live clock's own steps before it says the patient is loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

for (const id of ['cirr-decomp', 'csph', 'sos', 'healthy']) {
  test(`${id}: the readings the page gets on loading are the ones the patient settles at`, async (t) => {
    const msgs = [];
    const core = createCore((m) => msgs.push(structuredClone(m)));
    t.after(() => core.dispose());
    await core.handle({ type: 'run', running: false });
    await core.handle({ type: 'preset', id, reqId: 1 });
    await core.handle({ type: 'metrics', reqId: 2 });
    const got = msgs.find((m) => m.reqId === 2).result;
    const e = new Engine(); e.loadPreset(id); e.beat = true;
    for (let i = 0; i < 12000; i++) e.step(0.004);   // (48 s at the bedside: well past the run-in)
    const rest = computeMetrics(e);
    assert.ok(Math.abs(got.hvpg - rest.hvpg) <= 0.15, `${id}: HVPG ${got.hvpg} on loading, ${rest.hvpg.toFixed(2)} at rest`);
    assert.ok(Math.abs(got.ppg - rest.ppg) <= 0.2, `${id}: PPG ${got.ppg} on loading, ${rest.ppg.toFixed(2)} at rest`);
    assert.ok(Math.abs(got.map - rest.map) <= 0.8, `${id}: MAP ${got.map} on loading, ${rest.map.toFixed(1)} at rest`);
  });
}
