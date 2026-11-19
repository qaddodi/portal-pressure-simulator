// N1 (13 Nov 2026): one order for every change: the name, the cause, the pressure colour from the cause outward, the collaterals, the
// numbers. Nothing in a later step starts before an earlier one has started. These tests hold the written order (src/ui/change-order.js)
// and the places that keep it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGE_STEPS, STEP_AT, NAME_LEAD_MS, frontDelay, FRONT_MAX_MS, causeOf, hopsFrom, edgeHops, noteChange, changeDrawn, stepLeft, resetChange } from '../src/ui/change-order.js';
import { defaultParams, deepMerge } from '../src/engine/portal/scenario.js';
import { EDGES } from '../src/engine/portal/topology.js';
import { presenterSource } from './split-src.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the steps start in the written order', () => {
  assert.deepEqual(CHANGE_STEPS, ['name', 'cause', 'pressure', 'collaterals', 'numbers']);
  const at = CHANGE_STEPS.slice(1).map((k) => STEP_AT[k]);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] >= at[i - 1], `${CHANGE_STEPS[i + 1]} starts before ${CHANGE_STEPS[i]}`);
  assert.ok(NAME_LEAD_MS > 0 && NAME_LEAD_MS <= 400, 'the name leads, briefly');
});

test('the colour front waits more the farther a vessel is from the cause, and never more than its cap', () => {
  assert.equal(frontDelay(0), 0);
  for (let h = 1; h < 30; h++) assert.ok(frontDelay(h) >= frontDelay(h - 1));
  assert.equal(frontDelay(Infinity), FRONT_MAX_MS);
  assert.equal(frontDelay(NaN), 0);
});

test('the cause is where the change is made', () => {
  const healthy = defaultParams();
  const cirr = deepMerge(healthy, { cirrhosis: 0.85 });
  assert.deepEqual(causeOf(healthy, cirr).sort(), ['SIN_L', 'SIN_R']);
  const pvt = deepMerge(healthy, { thrombus: { PV_TRUNK: 1 } });
  assert.deepEqual(causeOf(healthy, pvt).sort(), ['CONF', 'PVH']);
  const tips = deepMerge(cirr, { tips: { on: true, d: 8 } });
  assert.deepEqual(causeOf(cirr, tips).sort(), ['RHV_T', 'RPV_T']);
  assert.deepEqual(causeOf(healthy, deepMerge(healthy, { contractility: 0.25 })), ['RA']);
  assert.equal(causeOf(healthy, structuredClone(healthy)), null, 'nothing changed on the circuit: no cause');
  assert.equal(causeOf(healthy, deepMerge(healthy, { albumin: 2.8 })), null, 'albumin alone has no place on the circuit');
});

test('hops run along the circuit from the cause outward', () => {
  const hops = hopsFrom(['SIN_R', 'SIN_L']);
  const e = (id) => EDGES.find((x) => x.id === id);
  assert.equal(edgeHops(hops, e('SIN_RR')), 0);
  assert.ok(edgeHops(hops, e('PVH_R')) < edgeHops(hops, e('PV_TRUNK')), 'the right portal vein before the trunk');
  assert.ok(edgeHops(hops, e('PV_TRUNK')) < edgeHops(hops, e('V_INT')), 'the trunk before the gut');
  assert.equal(edgeHops(hops, { from: 'NOWHERE', to: 'ELSE' }), Infinity);
});

test('a noted change holds the later steps until the figure has drawn it, then times them from that moment', () => {
  resetChange();
  assert.equal(stepLeft('numbers', 0), 0, 'no change under way: nothing waits');
  noteChange(defaultParams(), deepMerge(defaultParams(), { cirrhosis: 0.6 }), 1000);
  assert.equal(stepLeft('numbers', 1010), STEP_AT.numbers, 'noted, not drawn: the numbers wait their whole time');
  const hops = changeDrawn(1100);
  assert.ok(hops instanceof Map && hops.get('SIN_R') === 0);
  assert.equal(stepLeft('collaterals', 1100), STEP_AT.collaterals);
  assert.equal(stepLeft('numbers', 1100 + STEP_AT.numbers), 0);
  assert.equal(changeDrawn(5000), null, 'a jump nobody noted keeps no order');
  assert.equal(stepLeft('numbers', 5001), 0);
  resetChange();
});

test('the patient loader names the patient before it asks the model for them, and notes the change before the params land', () => {
  const src = read('src/ui/main.js');
  const body = src.slice(src.indexOf('async function loadPreset('), src.indexOf('function encodeShare('));
  const named = body.indexOf('await atMost(nameFirst?.(id), NAME_LEAD_MS)'), asked = body.indexOf("host.request('preset'");
  assert.ok(named > 0 && asked > named, 'the name leads the request');
  const noted = body.indexOf('noteChange(store.get().params, res.params)'), replaced = body.indexOf('replaceParams(res.params)');
  assert.ok(noted > 0 && replaced > noted, 'the change is noted with the old params before they are replaced');
  assert.match(src, /\['dock update', numbersLater\('dock'/, 'the dock\'s readings are the last step');
});

test('the figure keeps the order: the colour front, and collaterals after it', () => {
  const v = read('src/ui/stage-vessels.js');
  assert.match(v, /if \(jumped\) \{ const hops = changeDrawn\(\);/);
  assert.match(v, /easeNow\(\) - live\.lensT0 - frontWait\(x\.e\)/);
  const t = read('src/ui/stage-transitions.js');
  assert.match(t, /const t0 = now \+ stepLeft\('collaterals'\);/);
});

test('a slide\'s colours come with its scene, never onto the leaving one (T1)', () => {
  const p = presenterSource();
  const run = p.slice(p.indexOf('async function transitionRun('), p.indexOf('const reFit = '));
  const lens = run.indexOf('const lensGo = ');
  assert.ok(lens > 0);
  // (The words leave, the catheter retracts and the camera rises out of the lobule before the slide's colours come.)
  for (const k of ["tx?.phase('cath-out')", "tx?.phase('to-anatomy')"]) assert.ok(run.indexOf(k) > lens && !/lensGo\(\)/.test(run.slice(lens + 20, run.indexOf(k))), `${k} before the colours`);
  assert.match(run, /lensGo\(\); applyState\(st\)/, 'under the dip, with the new patient');
  assert.match(run, /lensGo\(\); if \(ct && stage\.canDrift\?\.\(\)\) \{ morphCt = morphTo\(st, cut\); \} else \{ if \(!await morphTo\(st, cut\)\)/, 'with the patient\'s change (a catheter slide with GPU organs runs it under its cards)');
  assert.ok(run.indexOf("tx?.phase('cath-in')") > run.lastIndexOf('lensGo();'), 'or with the camera\'s move');
  assert.doesNotMatch(run.slice(0, lens), /store\.set\(\{ colorMode/, 'never as the old words leave');
});

test('the slide number never goes blank (T2)', () => {
  const p = presenterSource();
  const chrome = p.slice(p.indexOf('function paintChrome()'), p.indexOf('\n  }\n', p.indexOf('function paintChrome()')));
  assert.doesNotMatch(chrome, /swapText\(k\.(count|num)/, 'no fade through nothing');
  assert.match(chrome, /k\.num\.textContent = countTxt/);
});

// ── T4, the glide that followed a vessel, was taken out on 16 Nov 2026 ──
// (Mohammad: every slide-to-slide camera move is one straight glide. A path along a vessel curved up to 18 % of the move off its line. The
// replay of every deck's moves is tests/camera-replay.test.js.)

test('no camera move follows a vessel path', () => {
  assert.doesNotMatch(read('src/ui/stage-glide.js'), /cam-routes|alongPath|along:/);
  assert.doesNotMatch(presenterSource(), /alongOk|along: true/);
  assert.throws(() => read('src/ui/cam-routes.js'), 'the module is gone');
});
