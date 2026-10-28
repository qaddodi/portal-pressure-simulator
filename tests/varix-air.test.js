// Air in the lumen is a view-only read of the engine (insufflation lesson, deck rebuild plan B1): `varix(site, P, air)` takes the air's
// pressure off the pressure across the wall and the diameter follows, and metrics.varix.air holds the diameters at 0 to 20 mmHg. The
// solver is never told: the varix's own pressure, the HVPG and the portal pressure are the same with any air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };
const patient = (preset) => { const e = new Engine(); run(e.loadPresetSteps(preset, {})); e.settle(); return e; };
const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, `${what}: ${v.toFixed(2)} mm, wanted ${want} ± ${tol}`);

test('the decompensated patient: 7.2 mm at rest, 6.2 at 10 mmHg, 5.7 at 14, 4.6 at 16, 2.7 at 18 and 2.1 at 20', () => {
  const m = computeMetrics(patient('cirr-decomp')), t = m.varix.air;
  assert.equal(t.length, 21, 'one diameter for each mmHg from 0 to 20');
  near(t[0], 7.2, 0.15, '0 mmHg'); near(t[10], 6.2, 0.15, '10 mmHg'); near(t[14], 5.7, 0.15, '14 mmHg');
  near(t[16], 4.6, 0.15, '16 mmHg'); near(t[18], 2.7, 0.15, '18 mmHg'); near(t[20], 2.1, 0.15, '20 mmHg');
  assert.equal(t[0], m.varix.d, 'no air is the diameter the model reads');
  for (let k = 1; k < t.length; k++) assert.ok(t[k] <= t[k - 1] + 1e-9, `air never widens the varix (${k - 1} → ${k} mmHg)`);
});

test('the pressure inside the varix, the HVPG and the portal pressure are the same with any air', () => {
  const e = patient('cirr-decomp'), before = computeMetrics(e), P0 = Float64Array.from(e.P);
  const rest = { ...before.varix }; delete rest.air;
  for (const a of [0, 5, 10, 20]) e.varix('VAR', e.P, a);
  e.varixAir('VAR');
  const after = computeMetrics(e);
  assert.deepEqual(Array.from(e.P), Array.from(P0), 'the node pressures are untouched');
  near(e.P[e.ni.VAR], 18.2, 0.05, 'the pressure inside the varix');
  assert.equal(after.hvpg, before.hvpg);
  assert.deepEqual({ ...after, varix: null }, { ...before, varix: null }, 'every other reading is the same');
  const restAfter = { ...after.varix }; delete restAfter.air;
  assert.deepEqual(restAfter, rest);
  // The pressure across the wall is the pressure inside less the air's: 8.2 at 10 mmHg, none left at 18.
  near(e.varix('VAR', e.P, 10).ptm, 8.2, 0.05, 'across the wall at 10 mmHg');
  near(e.varix('VAR', e.P, 18).ptm, 0.2, 0.05, 'across the wall at 18 mmHg');
});

test('no air changes nothing: varix() reads as it did before the argument', () => {
  const e = patient('cirr-decomp');
  assert.deepEqual(e.varix('VAR'), e.varix('VAR', e.P, 0));
  assert.deepEqual(e.varix('GV'), e.varix('GV', e.P, 0));
});

test('the CSPH patient flattens near 15 mmHg', () => {
  const t = computeMetrics(patient('csph')).varix.air;
  near(t[0], 3.8, 0.15, 'CSPH at rest');
  assert.ok(t[15] < 2.6, `flat by 15 mmHg (${t[15].toFixed(2)} mm)`);
  assert.ok(t[10] > 3.3, `still seen at 10 mmHg (${t[10].toFixed(2)} mm)`);
});

test('a patient with no varix has a flat table', () => {
  const t = computeMetrics(patient('healthy')).varix.air;
  assert.ok(t.every((d) => d === t[0]), 'nothing to flatten');
});
