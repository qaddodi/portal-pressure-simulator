// The bedside clock's step: 4 ms with the pulse at 1× and 2× (every Present slide), 8 ms at 4× and 8× so a phone keeps up,
// and the larger step reads the same as the smaller to a few hundredths of a mmHg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { hemoStep } from '../src/worker-core.js';

test('the step is 4 ms with the pulse below 4×, 8 ms at 4× and 8×, 20 ms without the pulse', () => {
  for (const s of [0.25, 0.5, 1, 2]) assert.equal(hemoStep(true, s), 0.004);
  for (const s of [4, 8]) assert.equal(hemoStep(true, s), 0.008);
  for (const s of [0.25, 1, 2, 4, 8]) assert.equal(hemoStep(false, s), 0.02);
});

// Beat-averaged readings over 6 s after 14 s of running, as 1× and 8× would step them.
function readings(id, h) {
  const e = new Engine(); e.loadPreset(id);
  for (let i = 0, n = Math.round(14 / h); i < n; i++) e.step(h);
  const keys = ['pv', 'ivc', 'whvp', 'fhvp', 'hvpg', 'ppg', 'ra', 'map', 'hr'], sum = Object.fromEntries(keys.map((k) => [k, 0]));
  let c = 0;
  for (let i = 0, n = Math.round(6 / h), every = Math.round(0.02 / h); i < n; i++) {
    e.step(h);
    if (i % every === 0) { const m = computeMetrics(e); for (const k of keys) sum[k] += m[k]; c++; }
  }
  for (const k of keys) sum[k] /= c;
  sum.ppgRaw = sum.pv - sum.ivc; sum.hvpgRaw = sum.whvp - sum.fhvp;
  return sum;
}

test('8 ms steps read the same as 4 ms steps (pressures and the model\'s gradients within 0.05 mmHg, the printed gradients within their tenth, MAP and heart rate within 0.3)', () => {
  for (const id of ['healthy', 'cirr-decomp', 'rhf']) {
    const a = readings(id, 0.004), b = readings(id, 0.008);
    for (const k of Object.keys(a)) {
      // (The printed gradients are the difference of two readings at one decimal, metrics.js tenthGap: where a pressure's mean sits on a twentieth the
      // printed gap's mean flips by up to a tenth with no change in the model (cirr-decomp, 16 Nov 2026: the portal pressure 22.570 against 22.587 read
      // 16.945 against 17.000). The model's own gaps, unrounded, hold the 0.05; the printed ones hold their own decimal.)
      const tol = k === 'map' || k === 'hr' ? 0.3 : k === 'ppg' || k === 'hvpg' ? 0.1 : 0.05;
      assert.ok(Math.abs(a[k] - b[k]) <= tol, `${id} ${k}: ${a[k].toFixed(3)} at 4 ms vs ${b[k].toFixed(3)} at 8 ms`);
    }
  }
});
