// App review fixes (5 Nov 2026): open TIPS stents read as patent, a beta-blocker does not regrade varices in seconds,
// the laser's long press is armed by one finger only, and the sinusoid, laser and pen are made again after a lost context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, dopplerK } from '../src/engine/topology.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const vel = (e, id) => { const k = e.ei[id], d = e.diameter(id) / 10; return (e.Q[k] / (Math.PI * d * d / 4)) * dopplerK(EDGES[k]); };

test('open 8 and 10 mm stents read inside 90-190 cm/s in compensated and decompensated cirrhosis', () => {
  for (const pre of ['csph', 'cirr-decomp']) for (const d of [8, 10]) {
    const e = new Engine(); e.loadPreset(pre); e.setParams(deepMerge(e.params, { tips: { on: true, d } })); e.settle();
    const v = vel(e, 'TIPS');
    assert.ok(v * 0.9 >= 90 && v <= 190, `${pre} ${d} mm reads ${v.toFixed(0)} cm/s`);
  }
});

test('a beta-blocker or terlipressin does not regrade varices within seconds', () => {
  for (const drug of ['propranolol', 'carvedilol', 'terlipressin']) {
    const e = new Engine(); e.loadPreset('cirr-decomp');
    assert.equal(computeMetrics(e).varix.grade.label, 'Large');
    e.setParams(deepMerge(e.params, { drugs: { [drug]: true } }));
    for (let i = 0; i < 40; i++) e.step(0.1);
    assert.equal(computeMetrics(e).varix.grade.label, 'Large', `${drug}: still Large after 4 s`);
  }
});
