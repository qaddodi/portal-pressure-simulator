// 22 Oct deck review, model fix 1: BRTO used to make the fundal varix grow. The varix was sized from the
// splenic-to-caval gradient, which climbs once the gastrorenal shunt is plugged, so obliterating the shunt
// swelled the varix it was meant to close. After BRTO the fundal varix is back to a resting vein; the
// esophageal varices still grow (the portal pressure they see has risen), as the acceptance tests check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const preset = (id) => { const e = new Engine(); e.loadPreset(id); return e; };
const M = (e) => computeMetrics(e);
const patch = (e, p) => { e.setParams(deepMerge(e.params, p)); e.settle(); };

test('BRTO shrinks the fundal varix to a resting vein while the portal pressure rises', () => {
  for (const id of ['gastric-varix', 'svt']) {
    const e = preset(id);
    const m0 = M(e);
    assert.ok(m0.gastricVarix.d >= 4, `${id}: fundal varix ${m0.gastricVarix.d.toFixed(2)} mm before BRTO`);
    patch(e, { occluded: { C5: true } });
    const m1 = M(e);
    assert.ok(m1.gastricVarix.d < m0.gastricVarix.d / 2, `${id}: fundal varix ${m0.gastricVarix.d.toFixed(2)} → ${m1.gastricVarix.d.toFixed(2)} mm after BRTO`);
    assert.ok(m1.gastricVarix.d < 3, `${id}: ${m1.gastricVarix.d.toFixed(2)} mm is not a resting vein`);
    assert.ok(m1.gastricVarix.ratio < 1, `${id}: wall index ${m1.gastricVarix.ratio.toFixed(2)} should be under the tear point`);
    // The shunt drained the splenic side: plugging it raises the splenic vein pressure (the portal vein too in
    // cirrhosis; in splenic vein thrombosis the portal vein lies beyond the clot and barely notices).
    assert.ok(m1.sv > m0.sv, `${id}: splenic vein pressure ${m0.sv.toFixed(1)} → ${m1.sv.toFixed(1)} should rise`);
    if (id === 'gastric-varix') assert.ok(m1.pv > m0.pv, `${id}: portal pressure ${m0.pv.toFixed(1)} → ${m1.pv.toFixed(1)} should rise`);
  }
});

test('after BRTO the fundal varix stays small however high the gradient climbs', () => {
  const e = preset('gastric-varix');
  patch(e, { occluded: { C5: true }, cirrhosis: 0.95 });
  const m = M(e);
  assert.ok(m.gastricVarix.d < 3, `fundal varix ${m.gastricVarix.d.toFixed(2)} mm at HVPG ${m.hvpg.toFixed(1)}`);
  assert.ok(m.varix.d > 4, `esophageal varices ${m.varix.d.toFixed(2)} mm should carry the pressure instead`);
});
