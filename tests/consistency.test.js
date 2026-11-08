// Teaching claims match the model: what the slides say happens over time to varices, ascites and
// stiffness must be what the simulation shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, PRESETS } from '../src/engine/scenario.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };

test('varices: thin varices grow large with red wale over six months', () => {
  const e = new Engine(); run(e.loadPresetSteps('csph', {}));
  assert.equal(computeMetrics(e).varix.grade.label, 'Small');
  e.setParams(deepMerge(e.params, { cirrhosis: 0.85 })); e.settle();
  run(e.advanceDaySteps(180)); e.settle();
  const m = computeMetrics(e);
  assert.equal(m.varix.grade.label, 'Large'); assert.ok(m.varix.redWale, 'red wale');
});
test('ascites: about 4 litres to tap, and it comes back without diuretics', () => {
  const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {}));
  e.setParams(deepMerge(e.params, { diuretics: false })); e.settle();
  run(e.advanceDaySteps(300)); e.settle();
  const v = computeMetrics(e).ascites.volume;
  assert.ok(v > 3500 && v < 5500, `ascites ${Math.round(v)} mL`);
  e.paracentesis(5000, true); run(e.advanceDaySteps(90)); e.settle();
  assert.ok(computeMetrics(e).ascites.volume > 2000, 'fluid returns');
});

test('liver stiffness estimate: congestion adds about 2 kPa per mmHg and the curve flattens above HVPG 12', () => {
  const lsm = (hvpg, fhvp) => 5 + 2.2 * Math.max(0, Math.min(hvpg, 12) - 3) + 0.8 * Math.max(0, hvpg - 12) + 2 * Math.max(0, fhvp - 6);
  assert.ok(lsm(10, 6) > 19 && lsm(10, 6) < 22);
  assert.ok(Math.abs(lsm(10, 11) - lsm(10, 6) - 10) < 1e-9);
  assert.ok(lsm(20, 6) - lsm(12, 6) < 0.8 * 8 + 1e-9);
});

// One test for "has varices": the figure, circuit and endoscopy pane all call varicesPresent, which reads the metrics' `present`
// flag: the model's varix diameter reaches the 2.5 mm "none" cut-off, or banded columns are still on the wall, so no view
// shows varices another hides.
test('varicesPresent follows the model varix diameter and bands', async () => {
  const { varicesPresent } = await import('../src/ui/store.js');
  const fr = (d, bands = 0) => ({ metrics: { varix: { d, present: d >= 2.5 || bands > 0 }, gastricVarix: { d, present: d >= 2.5 } }, bands });
  assert.equal(varicesPresent(fr(2.4)), false);
  assert.equal(varicesPresent(fr(2.5)), true);
  assert.equal(varicesPresent(fr(2.0, 2)), true);
  assert.equal(varicesPresent(fr(2.0, 2), 'GV'), false);
  // (The flag itself, from a real engine, is tested in varix-grade.test.js.)
});

// Varices grow with the portosystemic gradient, not with absolute venous pressure: congestion from the heart
// (right heart failure, constriction) lifts the whole venous bed and its gradient stays near zero.
for (const [id, grows] of [['rhf', false], ['constrictive', false], ['cirr-decomp', true]]) {
  test(`${id}: ${grows ? 'has' : 'has no'} esophageal varices`, () => {
    const e = new Engine(); run(e.loadPresetSteps(id, {})); e.settle();
    const d = computeMetrics(e).varix.d;
    assert.equal(d >= 2.5, grows, `${id} varix ${d.toFixed(1)} mm`);
  });
}

test('esophageal varix size follows the portal-to-right-atrial gradient across every preset', () => {
  for (const pr of PRESETS.filter((x) => x.days >= 30 && x.id !== 'gastric-varix')) {   // varices remodel over weeks: acute presets have not grown yet; IGV1 has none
    const e = new Engine(); run(e.loadPresetSteps(pr.id, {})); e.settle();
    const ex = e.routeExcess(['CONF', 'RA']), d = computeMetrics(e).varix.d;
    if (ex >= 11) assert.ok(d >= 2.5, `${pr.id}: gradient excess ${ex.toFixed(1)} but varix ${d.toFixed(1)} mm`);
    if (ex <= 6) assert.ok(d < 2.5, `${pr.id}: gradient excess ${ex.toFixed(1)} but varix ${d.toFixed(1)} mm`);
  }
});

test('varices take weeks to form, rise with the gradient at once and fall from it over weeks', () => {
  const e = new Engine(); run(e.loadPresetSteps('healthy', {}));
  assert.ok(computeMetrics(e).varix.d < 2.5);
  e.setParams(deepMerge(e.params, { cirrhosis: 1 })); e.settle();
  assert.ok(computeMetrics(e).varix.d < 2.5, 'none at onset');
  e.advanceDays(90, { noRupture: true, silent: true }); e.settle();
  assert.ok(computeMetrics(e).varix.d >= 5, `varix ${computeMetrics(e).varix.d.toFixed(1)} mm`);
  // (4.1: the resting size falls on a first-order lag, VARIX.tauFall, so a cured cause does not make them vanish in a second.)
  e.setParams(deepMerge(e.params, { cirrhosis: 0 })); e.settle();
  const d0 = computeMetrics(e).varix.d;
  assert.ok(d0 >= 5, `still ${d0.toFixed(1)} mm the moment the gradient is gone`);
  e.advanceDays(30, { noRupture: true, silent: true }); e.settle();
  const d30 = computeMetrics(e).varix.d;
  assert.ok(d30 < d0 - 1 && d30 > 2.5, `shrinking after a month (${d0.toFixed(1)} → ${d30.toFixed(1)} mm)`);
  e.advanceDays(300, { noRupture: true, silent: true }); e.settle();
  assert.ok(computeMetrics(e).varix.d < 2.5, 'and they are gone some months after the gradient is');
});

test('the lag on a varix\'s fall does not depend on the time step, and the rise is not lagged', () => {
  const from = () => { const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {})); e.settle(); e.setParams(deepMerge(e.params, { drugs: { carvedilol: true } })); e.settle(); return e; };
  const a = from(), b = from(), c = from();
  a.advanceDays(60, { noRupture: true, silent: true });
  for (let i = 0; i < 60; i++) b.advanceDays(1, { noRupture: true, silent: true });
  for (let i = 0; i < 240; i++) c.advanceFraction(0.25);
  for (const e of [a, b, c]) e.settle();
  const [da, db, dc] = [a, b, c].map((e) => computeMetrics(e).varix.d);
  assert.ok(Math.abs(da - db) < 0.1 && Math.abs(da - dc) < 0.1, `60 days in one, 60 and 240 steps: ${da.toFixed(2)}, ${db.toFixed(2)}, ${dc.toFixed(2)} mm`);
  assert.ok(da < 6.5 && da > 4.5, `after two months on carvedilol ${da.toFixed(2)} mm`);
  // The rise: a worse gradient is a larger varix the moment it is, not weeks later.
  const e = new Engine(); run(e.loadPresetSteps('csph', {})); e.settle();
  const d0 = computeMetrics(e).varix.d;
  e.setParams(deepMerge(e.params, { cirrhosis: 1 })); e.settle();
  assert.ok(computeMetrics(e).varix.d > d0 + 0.5, `${d0.toFixed(2)} → ${computeMetrics(e).varix.d.toFixed(2)} mm at once`);
});

test('two inflows: with the buffer off a portal clot leaves about 40% of liver flow, reached within the button\'s ease', () => {
  const e = new Engine(); run(e.loadPresetSteps('pvt-acute', {})); e.settle(2);
  const on = computeMetrics(e).liverPerfPct;
  e.setParams(deepMerge(e.params, { habrStrength: 0 }));
  // The presenter's button: 1.2 s of quiet relaxation (36 ticks) while the clock runs at real time.
  for (let k = 0; k < 36; k++) { e.relax(); e.step(0.033); }
  const off = computeMetrics(e).liverPerfPct;
  assert.ok(on > 60 && on < 80, `buffer on ${on.toFixed(0)}%`);
  assert.ok(off > 33 && off < 47, `buffer off ${off.toFixed(0)}% (the slide says about 40%)`);
});
