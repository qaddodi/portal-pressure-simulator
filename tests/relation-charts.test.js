// Relation charts (26 Oct): the curve card with a reading on its x axis, points run over model days, cut-offs on x, other patients
// as dots, a response zone and two drugs paired against the HVPG before them (tool-curve.js header).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { curveSteps, curveSeries, xKeyOf, axisMeta, xDomain, xCutsOf, yCutsOf, zoneEdge, dotsOf, dotSteps, ringAt, drawnLines, againstsOf, againstOf, ownIsRef, curveAt, patientOf, onCurve } from '../src/ui/tool-curve.js';

async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}

test('a reading on the x axis: named and scaled from its tile, round nice numbers', () => {
  assert.equal(xKeyOf({ x: 'lsm' }), 'lsm');
  assert.equal(xKeyOf({ x: 'nonsense' }), null);
  assert.deepEqual(axisMeta({ x: 'lsm', param: 'cirrhosis' }), { name: 'Liver stiffness', unit: 'kPa', d: 1, x: 1, k: 'lsm' });
  assert.equal(axisMeta({ x: 'wall' }).unit, '% of tear', 'the wall stress has no tile but a chart can draw it');
  assert.deepEqual(xDomain([5, 29.7]), [0, 30], 'from zero when zero is close');
  assert.deepEqual(xDomain([9, 18.2]), [8, 20]);
  assert.deepEqual(xDomain([9, 18.2], 8, 20), [8, 20]);
  assert.deepEqual(xDomain([9, 18.2], 0), [0, 20]);
});

test('cut-offs: the x reading\'s as listed or its tile\'s, the y reading\'s as listed, its tile\'s, or none', () => {
  assert.deepEqual(xCutsOf({ x: 'lsm', xCuts: [15, 25] }), [{ v: 15, rate: 'mid' }, { v: 25, rate: 'hi' }]);
  assert.deepEqual(xCutsOf({ x: 'hvpg', xCuts: true }), [{ v: 5, rate: 'mid' }, { v: 10, rate: 'hi' }]);
  assert.deepEqual(xCutsOf({ param: 'cirrhosis', xCuts: [10] }), [], 'only with a reading on x');
  assert.deepEqual(yCutsOf({}, 'hvpg'), [{ v: 5, rate: 'mid' }, { v: 10, rate: 'hi' }]);
  assert.deepEqual(yCutsOf({ cuts: [10] }, 'hvpg'), [{ v: 10, rate: 'hi' }]);
  assert.deepEqual(yCutsOf({ cuts: false }, 'hvpg'), []);
});

test('the response zone: under 12, or a fall of at least 10%, its corner where the two meet', () => {
  const e = zoneEdge({ fall: 10, under: 12 }, 8, 20);
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], [8, 12]);
  assert.ok(Math.abs(e[1][0] - 12 / 0.9) < 1e-9 && e[1][1] === 12);
  assert.ok(Math.abs(e[2][1] - 18) < 1e-9);
  assert.equal(zoneEdge(null, 0, 1), null);
});

test('against a drug on the x reading: the own line is the "no change" diagonal, the drugs paired with the HVPG before them', () => {
  const t = { x: 'hvpg', param: 'cirrhosis', from: 0.6, to: 0.8, step: 0.1, lines: ['hvpg'],
    against: [{ label: 'Carvedilol', params: { drugs: { carvedilol: true } }, pair: true, own: 'No change' }, { label: 'Propranolol', params: { drugs: { propranolol: true } }, pair: true }] };
  assert.equal(againstsOf(t).length, 2);
  assert.equal(againstOf(t).own, 'No change');
  assert.ok(ownIsRef(t));
  assert.deepEqual(drawnLines(t).map((l) => [l.name, !!l.ref]), [['No change', true], ['Carvedilol', false], ['Propranolol', false]]);
  assert.equal(curveSteps(t).length, 9);
  const fp = (v) => ({ fp: { hvpg: v } });
  const ser = curveSeries(t, [fp(10), fp(12), fp(14), fp(8.5), fp(10), fp(11.5), fp(9), fp(11), fp(12.5)]);
  assert.deepEqual(ser.lx, [[10, 12, 14], [10, 12, 14], [10, 12, 14]], 'paired: each drug read against the HVPG before it');
  assert.deepEqual(ser.ys[1], [8.5, 10, 11.5]);
  assert.deepEqual(curveAt(ser, 13), [13, 10.75, 11.75]);
  assert.deepEqual(ringAt(t, {}, { hvpg: 13 }), { x: 13, ys: [null, null, null] }, 'no ring on the diagonal; the drugs read theirs from their curves');
  // (Without pair each sweep is read against its own x: a healthy liver's flow, not the cirrhotic one's.)
  const u = { x: 'pvFlow', param: 'splanchnicTone', from: 1, to: 2, step: 1, lines: ['ppg'], against: { label: 'Healthy liver', params: { cirrhosis: 0 }, own: 'Cirrhosis' } };
  const s2 = curveSeries(u, [{ fp: { pvFlow: 0.8, ppg: 12 } }, { fp: { pvFlow: 1.2, ppg: 14 } }, { fp: { pvFlow: 1.1, ppg: 4 } }, { fp: { pvFlow: 2, ppg: 6 } }]);
  assert.deepEqual(s2.lx, [[0.8, 1.2], [1.1, 2]]);
  assert.ok(!ownIsRef(u));
});

test('points over days and on a patient of the chart\'s own each start afresh; a what-if slider no longer rides such a curve', () => {
  const t = { x: 'lsm', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 0.5, step: 0.25, days: 365, lines: ['hvpg', 'plt'] };
  const st = curveSteps(t);
  assert.deepEqual(st[1], { preset: 'healthy', presetDays: undefined, params: { cirrhosis: 0.25 }, days: 365, restart: true });
  assert.ok(patientOf(t));
  assert.equal(onCurve(t, { cirrhosis: 0.3 }, { cirrhosis: 0.5 }), false);
  assert.ok(curveSteps({ param: 'cirrhosis', from: 0, to: 0.5, step: 0.25, days: 30 }).every((s) => s.restart && s.days === 30));
  assert.ok(curveSteps({ param: 'cirrhosis', from: 0, to: 0.5, step: 0.25 }).every((s) => !s.restart), 'a plain curve chains as before');
});

test('dots: other slides or presets, only with a reading on x', () => {
  const t = { x: 'lsm', dots: [{ slide: 'a1', name: 'Case 1' }, { preset: 'rhf', name: 'Heart failure' }, { name: 'nothing' }] };
  assert.equal(dotsOf(t).length, 2);
  assert.deepEqual(dotSteps(t), [{ preset: 'rhf', params: undefined, presetDays: undefined, days: undefined, restart: true }]);
  assert.deepEqual(dotsOf({ param: 'cirrhosis', dots: [{ slide: 'a1' }] }), []);
});

test('the model: stiffness against HVPG and platelets over a year a point, every point a fresh start, and a preset dot is that preset', async () => {
  const t = { x: 'lsm', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.4, to: 0.8, step: 0.2, days: 365, lines: ['hvpg', 'plt'], dots: [{ preset: 'rhf', name: 'Heart failure' }] };
  const [slide] = await seq([{ preset: 'schisto' }]);
  const ser = curveSeries(t, await seq(curveSteps(t), null));
  assert.deepEqual(ser.lx[0].map((x) => Math.round(x * 10) / 10), [12.4, 23.7, 27.7], 'the stiffness of compensated cirrhosis, CSPH and beyond');
  for (let i = 1; i < 3; i++) assert.ok(ser.ys[0][i] > ser.ys[0][i - 1] && ser.ys[1][i] < ser.ys[1][i - 1], 'the HVPG climbs and the platelets fall');
  const r = ringAt(t, slide.params, slide.fp);
  assert.ok(r.x < 7 && r.ys[1] < 80, `the schistosomiasis ring sits off the line: ${r.x} kPa, platelets ${r.ys[1]}`);
  const [hf] = await seq(dotSteps(t), null);
  assert.ok(hf.fp.lsm > 30 && hf.fp.hvpg < 1, 'heart failure: a stiff liver with a flat HVPG');
});

test('the model: carvedilol lowers the HVPG further than propranolol at every HVPG before them', async () => {
  const t = { x: 'hvpg', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.6, to: 0.9, step: 0.15, lines: ['hvpg'],
    against: [{ label: 'Carvedilol', params: { drugs: { carvedilol: true } }, pair: true, own: 'No change' }, { label: 'Propranolol', params: { drugs: { propranolol: true } }, pair: true }] };
  const ser = curveSeries(t, await seq(curveSteps(t), null));
  for (let i = 0; i < ser.xs.length; i++) {
    assert.ok(ser.ys[1][i] < ser.ys[2][i] && ser.ys[2][i] < ser.lx[0][i], `at ${ser.lx[0][i].toFixed(1)}: carvedilol ${ser.ys[1][i].toFixed(1)} < propranolol ${ser.ys[2][i].toFixed(1)} < before`);
  }
});
