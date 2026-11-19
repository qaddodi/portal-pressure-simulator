// A TIPS drains through the end of the right hepatic vein (TIPS deck review, 17 Nov 2026). Since 35723113 the engine joins the TIPS to the cava past that
// stretch (topology.js TIPS eto), and the stretch's clot was left behind: in Budd–Chiari, three occluded hepatic veins, the TIPS still drained 1.8 L/min
// to the cava and lowered the portal pressure below the DIPS's, where both Budd–Chiari slides say a TIPS cannot decompress the liver. Engine.shuntOutlet
// puts the stretch back in series: no change while the vein is open, a clot narrows the outlet, an occluded vein shuts it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { deepMerge, sanitizeParams } from '../src/engine/portal/scenario.js';
import { fingerprintOf } from '../src/engine/portal/fingerprint.js';
import { EDGES } from '../src/engine/portal/topology.js';

const run = (preset, params) => {
  const e = new Engine(); e.loadPreset(preset);
  e.setParams(sanitizeParams(deepMerge(e.params, params))); e.settle(3);
  return fingerprintOf(computeMetrics(e));
};

test('every shunt joined past the end of a vein drains through that stretch (the TIPS through the right hepatic vein)', () => {
  const e = new Engine();
  for (const [k, s] of EDGES.entries()) if (s.eto || s.efrom) assert.ok(e.through[k], `${s.id}: joined past a vein (${s.eto ?? s.efrom}) with no stretch of it in series`);
  const k = EDGES.findIndex((s) => s.id === 'TIPS');
  assert.equal(EDGES[e.through[k][0]].part ?? EDGES[e.through[k][0]].id, 'RHV_IVC');
  assert.ok(e.through[k][1] > 0 && e.through[k][1] < 1);
});

test('in Budd–Chiari a TIPS drains nothing and the portal pressure stays where it was; the DIPS lowers it', () => {
  const none = run('budd-chiari', {}), tips = run('budd-chiari', { tips: { on: true } }), dips = run('budd-chiari', { dips: { on: true } });
  assert.ok(!(tips.tipsFlow > 0.01), `TIPS flow ${tips.tipsFlow} L/min into occluded hepatic veins`);
  assert.ok(Math.abs(tips.pv - none.pv) < 0.2, `portal pressure ${none.pv.toFixed(1)} without, ${tips.pv.toFixed(1)} with the TIPS`);
  assert.ok(dips.pv < none.pv - 3, `the DIPS lowers it: ${none.pv.toFixed(1)} to ${dips.pv.toFixed(1)}`);
});

test('a clot in the right hepatic vein raises the PPG through a TIPS step by step; an open vein leaves it as tuned', () => {
  const at = (c) => run('cirr-decomp', { tips: { on: true, d: 8 }, thrombus: c ? { RHV_IVC: c } : {} });
  const open = at(0), r = [0.3, 0.6, 1].map(at);
  assert.ok(open.tipsFlow > 1 && open.ppg < 12, `open: PPG ${open.ppg}, flow ${open.tipsFlow}`);
  let last = open.ppg;
  for (const x of r) { assert.ok(x.ppg >= last, `PPG ${x.ppg} after ${last}`); last = x.ppg; }
  assert.ok(!(r[2].tipsFlow > 0.01), 'an occluded hepatic vein shuts the TIPS');
});
