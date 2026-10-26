// Liver stiffness follows the scarring, not a beta-blocker's fall in the HVPG (AASLD 2024 p. 1189: no role for LSM in
// judging the HVPG response to NSBB). metrics.lsm reads the gradient the liver would have without the drug (Engine.hvNoBlocker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const preset = (id) => { const e = new Engine(); e.loadPreset(id); e.settle(); return e; };
const on = (e, drugs) => { const f = new Engine(); f.restore(e.snapshot()); f.setParams(deepMerge(f.params, { drugs })); f.settle(); return f; };

for (const id of ['cirr-comp', 'csph', 'cirr-decomp']) {
  test(`${id}: a beta-blocker lowers the HVPG and leaves the stiffness where it was`, () => {
    const e = preset(id), m0 = computeMetrics(e);
    for (const drug of ['propranolol', 'carvedilol']) {
      const m1 = computeMetrics(on(e, { [drug]: true }));
      assert.ok(m1.hvpg < m0.hvpg - 0.5, `${drug} lowers the HVPG (${m0.hvpg} → ${m1.hvpg})`);
      assert.ok(Math.abs(m1.lsm - m0.lsm) < 0.05, `${drug} leaves the stiffness (${m0.lsm.toFixed(2)} → ${m1.lsm.toFixed(2)})`);
    }
  });
}

test('without a beta-blocker the stiffness is the gradient formula as before, and scarring still raises it under the drug', () => {
  const e = preset('csph'), m = computeMetrics(e);
  const lsm = 5 + 2.2 * Math.max(0, Math.min(m.hvpg, 12) - 3) + 0.8 * Math.max(0, m.hvpg - 12) + 2 * Math.max(0, m.fhvp - 6);
  assert.ok(Math.abs(m.lsm - lsm) < 0.2, `${m.lsm} against ${lsm}`);
  const c = on(e, { carvedilol: true }), a = computeMetrics(c).lsm;
  c.setParams(deepMerge(c.params, { cirrhosis: c.params.cirrhosis + 0.1 })); c.settle();
  assert.ok(computeMetrics(c).lsm > a + 1, 'more scarring, a stiffer liver, drug or not');
});
