// N1 (13 Nov 2026): one order for every change: the name, the cause, the pressure colour from the cause outward, the collaterals, the
// numbers. Nothing in a later step starts before an earlier one has started. These tests hold the written order (src/ui/change-order.js)
// and the places that keep it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGE_STEPS, STEP_AT, NAME_LEAD_MS, frontDelay, FRONT_MAX_MS, causeOf, hopsFrom, edgeHops, noteChange, changeDrawn, stepLeft, resetChange } from '../src/ui/change-order.js';
import { defaultParams, deepMerge } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
import { routeLine, alongPath, project, ROUTES, ALONG_STRETCH } from '../src/ui/cam-routes.js';

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
  assert.deepEqual(causeOf(cirr, tips).sort(), ['RHV', 'RPV']);
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
  const p = read('src/ui/presenter.js');
  const run = p.slice(p.indexOf('async function transitionRun('), p.indexOf('function paintOverlays('));
  const lens = run.indexOf('const lensGo = ');
  assert.ok(lens > 0);
  // (The words leave, the catheter retracts and the camera rises out of the lobule before the slide's colours come.)
  for (const k of ["tx?.phase('cath-out')", "tx?.phase('to-anatomy')"]) assert.ok(run.indexOf(k) > lens && !/lensGo\(\)/.test(run.slice(lens + 20, run.indexOf(k))), `${k} before the colours`);
  assert.match(run, /lensGo\(\); applyState\(st\)/, 'under the dip, with the new patient');
  assert.match(run, /lensGo\(\); if \(!await morphTo\(st, cut\)\)/, 'with the patient\'s change');
  assert.ok(run.indexOf("tx?.phase('cath-in')") > run.lastIndexOf('lensGo();'), 'or with the camera\'s move');
  assert.doesNotMatch(run.slice(0, lens), /store\.set\(\{ colorMode/, 'never as the old words leave');
});

test('the slide number never goes blank (T2)', () => {
  const p = read('src/ui/presenter.js');
  const chrome = p.slice(p.indexOf('function paintChrome()'), p.indexOf('const gear = () =>'));
  assert.doesNotMatch(chrome, /swapText\(k\.count/, 'no fade through nothing');
  assert.match(chrome, /k\.count\.textContent = countTxt/);
});

// ── T4: a glide follows the vessel ──

test('a route is one polyline, each vessel turned to run on from the last', () => {
  const pts = { a: [[0, 0], [10, 0]], b: [[20, 0], [10, 0]], c: [[20, 0], [20, 10]] };
  const line = routeLine(['a', 'b', 'c'], (id) => pts[id]);
  assert.deepEqual(line, [[0, 0], [10, 0], [10, 0], [20, 0], [20, 0], [20, 10]]);
  assert.equal(routeLine(['a', 'missing'], (id) => pts[id]), null, 'a vessel the patient lacks: no route');
  for (const ids of Object.values(ROUTES)) for (const id of ids) assert.ok(EDGES.some((e) => e.id === id), `${id} is a vessel of the circuit`);
});

test('between two framings on one path the camera runs along it, never across', () => {
  // An L-shaped vessel: along the bottom, then up. Two framings at its two ends; the straight move would cut the corner.
  const line = [];
  for (let x = 0; x <= 100; x += 5) line.push([x, 100]);
  for (let y = 95; y >= 0; y -= 5) line.push([100, y]);
  const vb = { w: 40, h: 40, cx: 20, cy: 20 };
  const view = (cx, cy, w) => { const k = vb.w / w; return { k, x: vb.cx - cx * k, y: vb.cy - cy * k }; };
  const from = view(0, 100, 30), to = view(100, 0, 30);
  const p = alongPath(from, to, [line], vb);
  assert.ok(p, 'it follows the vessel');
  assert.ok(p.stretch > 1 && p.stretch <= ALONG_STRETCH);
  for (let u = 0; u <= 1; u += 0.1) {
    const v = p.at(u), cx = (vb.cx - v.x) / v.k, cy = (vb.cy - v.y) / v.k;
    assert.ok(project(line, [cx, cy]).d < 1, `at ${u.toFixed(1)} the centre is on the vessel`);
  }
  const end = p.at(1);
  assert.deepEqual([end.k, end.x, end.y], [to.k, to.x, to.y], 'it lands exactly on the framing');
  assert.equal(alongPath(from, view(50, 40, 30), [line], vb), null, 'a framing off the vessel: the plain glide');
  assert.equal(alongPath(from, view(3, 100, 30), [line], vb), null, 'too short a stretch to follow');
});

test('the presenter asks for it between neighbouring slides only', () => {
  const p = read('src/ui/presenter.js');
  assert.match(p, /alongOk = Math\.abs\(to - lastAt\) === 1;/);
  assert.match(p, /frameTo\(cam, s, gl\);\n\s*alongOk = false;/);
  assert.match(p, /alongOk && !opt\.drift && !opt\.steady \? \{ \.\.\.opt, along: true \} : opt/);
  assert.match(read('src/ui/stage-glide.js'), /const along = alongAsk && live\.morphTarget === 0 && !store\.get\(\)\.lobule \? alongPath\(/);
});
