// Closing a talk (Esc, ✕, Finish) puts back the patient and the clock the viewer started it from, not the healthy preset (play-test 16 Nov 2026: a viewer who had
// picked decompensated cirrhosis before Present landed on Healthy at 0:03). Every exit goes through stop() -> stopNow() -> putHealthy(live.saved) in presenter-start.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the engine snapshot a talk captures brings the same patient and clock back after the healthy preset was loaded', async () => {
  const { Engine } = await import('../src/engine/portal/engine.js');
  const { computeMetrics } = await import('../src/engine/portal/metrics.js');
  const e = new Engine(); e.loadPreset('cirr-decomp');
  for (let i = 0; i < 500; i++) e.step(0.02);
  const snap = e.snapshot(), t0 = e.t, hvpg0 = computeMetrics(e).hvpg;
  e.loadPreset('healthy');
  assert.ok(Math.abs(computeMetrics(e).hvpg - hvpg0) > 3, 'the healthy preset is another patient');
  e.restore(snap);
  assert.equal(e.t, t0, 'the clock comes back');
  assert.ok(Math.abs(computeMetrics(e).hvpg - hvpg0) < 1, 'and the patient');
});
