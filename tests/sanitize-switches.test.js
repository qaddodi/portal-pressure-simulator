// R07 (external production review, 15 Nov 2026): sanitizeParams turned any truthy value into an active treatment: tips.on 'false' read true. A switch, a drug,
// a procedure, a plug and an anatomical variant are real booleans at the boundary (a hand-edited link, an imported scenario, a console call), and anything
// else takes the parameter's default and is reported with its field path. Unknown nested keys never ride along to be read as a switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeParams, sanitizeParamsReport, defaultParams } from '../src/engine/scenario.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

const D = defaultParams();
// Everything a hand-edit can put where a boolean belongs, other than a boolean.
const NOT_BOOLEANS = ['false', 'true', 'no', 'yes', '', 'off', 1, 0, 2, -1, NaN, Infinity, null, undefined, [], [false], {}, { on: true }];

test('R07: a TIPS or a DIPS is on only for the boolean true', () => {
  assert.equal(sanitizeParams({ tips: { on: 'false', d: 8 } }).tips.on, false, 'the reviewer\'s case');
  for (const k of ['tips', 'dips']) {
    assert.equal(sanitizeParams({ [k]: { on: true, d: 8 } })[k].on, true);
    assert.equal(sanitizeParams({ [k]: { on: false, d: 8 } })[k].on, false);
    for (const v of NOT_BOOLEANS) assert.equal(sanitizeParams({ [k]: { on: v, d: 8 } })[k].on, false, `${k}.on = ${String(v)}`);
  }
});

test('R07: every top-level switch the model has (a drug, a procedure, a tube, a clock, a mode) is a real boolean or its default', () => {
  const switches = Object.keys(D).filter((k) => typeof D[k] === 'boolean');
  assert.ok(switches.length >= 12 && switches.includes('portocaval') && switches.includes('diuretics') && switches.includes('rex'));
  for (const k of switches) {
    for (const v of [true, false]) assert.equal(sanitizeParams({ [k]: v })[k], v, `${k} = ${v}`);
    for (const v of NOT_BOOLEANS) assert.equal(sanitizeParams({ [k]: v })[k], D[k], `${k} = ${String(v)} takes the default ${D[k]}`);
  }
});

test('R07: a drug is on only for true, and a drug the model does not have is dropped', () => {
  for (const k of Object.keys(D.drugs)) {
    assert.equal(sanitizeParams({ drugs: { [k]: true } }).drugs[k], true);
    for (const v of NOT_BOOLEANS) assert.equal(sanitizeParams({ drugs: { [k]: v } }).drugs[k], false, `drugs.${k} = ${String(v)}`);
  }
  const p = sanitizeParams({ drugs: { carvedilol: true, warfarin: true, __proto__: { x: true } } });
  assert.deepEqual(p.drugs, { ...D.drugs, carvedilol: true }, 'no extra key rides along');
  assert.deepEqual(sanitizeParams({ drugs: 'yes' }).drugs, D.drugs);
  assert.deepEqual(sanitizeParams({ drugs: ['carvedilol'] }).drugs, D.drugs);
});

test('R07: a plug (occluded) and an anatomical variant (spontaneous) are booleans; a string is never a closed collateral or a new shunt', () => {
  assert.equal(sanitizeParams({ occluded: { C5: true } }).occluded.C5, true);
  assert.equal(sanitizeParams({ occluded: { C5: 'false' } }).occluded.C5, undefined, 'a plug that is not a boolean is no plug');
  assert.equal(sanitizeParams({ occluded: { C5: 1 } }).occluded.C5, undefined);
  assert.equal(sanitizeParams({ spontaneous: { C6: true } }).spontaneous.C6, true);
  assert.equal(sanitizeParams({ spontaneous: { C6: 'true' } }).spontaneous.C6, false, 'a default key takes its default');
  assert.equal(sanitizeParams({ spontaneous: { C5: 'no' } }).spontaneous.C5, false);
  assert.equal(sanitizeParams({ spontaneous: { C5: 0 } }).spontaneous.C5, false);
});

test('R07: a custom shunt is a diameter, so a string or a bare true is no shunt', () => {
  for (const v of ['false', 'yes', true, [], {}, NaN, -3, 0, null]) assert.equal(sanitizeParams({ customShunts: { X_SV_RPV: v } }).customShunts.X_SV_RPV, undefined, String(v));
  assert.equal(sanitizeParams({ customShunts: { X_SV_RPV: 8 } }).customShunts.X_SV_RPV, 8);
  assert.equal(sanitizeParams({ customShunts: { X_SV_RPV: 99 } }).customShunts.X_SV_RPV, 16, 'a diameter is clamped');
});

test('R07: the catheter\'s wedge is a real boolean', () => {
  assert.equal(sanitizeParams({ catheter: { vein: 'RHV', wedged: true } }).catheter.wedged, true);
  for (const v of NOT_BOOLEANS) assert.equal(sanitizeParams({ catheter: { vein: 'RHV', wedged: v } }).catheter.wedged, false, String(v));
  assert.equal(sanitizeParams({ catheter: { vein: 7, wedged: false } }).catheter.vein, null);
});

test('R07: unknown nested keys are dropped (a procedure record, a fibrosis lobe, a zone)', () => {
  const p = sanitizeParams({ tips: { on: true, d: 8, stent: 'gore' }, dips: { on: false, d: 8, extra: true }, fibrosis: { R: { pre: 2, sin: 1, post: 1, lobe: 9 }, X: { pre: 5 } }, __proto__: { polluted: true } });
  assert.deepEqual(Object.keys(p.tips).sort(), ['d', 'on']);
  assert.deepEqual(Object.keys(p.dips).sort(), ['d', 'on']);
  assert.deepEqual(Object.keys(p.fibrosis).sort(), ['L', 'R']);
  assert.deepEqual(Object.keys(p.fibrosis.R).sort(), ['post', 'pre', 'sin']);
  assert.equal(p.fibrosis.R.pre, 2);
  assert.equal({}.polluted, undefined);
});

test('R07: nothing a hand-made link can contain switches a treatment on: the model stays the untreated patient', () => {
  const junk = {}; for (const k of Object.keys(D)) junk[k] = typeof D[k] === 'boolean' ? 'true' : D[k];
  junk.tips = { on: 'true', d: 8 }; junk.dips = { on: [true], d: 8 }; junk.drugs = { propranolol: 'true', carvedilol: 1, terlipressin: {}, octreotide: 'yes' };
  junk.occluded = { C5: 'true', C1a: 1 }; junk.customShunts = { X_SV_RPV: 'on' };
  const p = sanitizeParams(junk);
  assert.deepEqual([p.tips.on, p.dips.on, ...Object.values(p.drugs)], [false, false, false, false, false, false]);
  for (const k of Object.keys(D)) if (typeof D[k] === 'boolean') assert.equal(p[k], D[k], `${k} took its default`);
  assert.deepEqual(p.occluded, {});
  assert.deepEqual(p.customShunts, {});
  // The model runs it and the numbers are the untreated patient's, not a TIPS patient's.
  const a = new Engine(); a.loadPreset('cirr-decomp'); const base = computeMetrics(a).ppg;
  const b = new Engine(); b.loadPreset('cirr-decomp'); b.setParams(sanitizeParams({ ...b.params, tips: { on: 'true', d: 8 } })); b.settle();
  const c = new Engine(); c.loadPreset('cirr-decomp'); c.setParams(sanitizeParams({ ...c.params, tips: { on: true, d: 8 } })); c.settle();
  assert.ok(computeMetrics(b).ppg > computeMetrics(c).ppg + 3, 'a real TIPS lowers the PPG; the string did not');
  assert.ok(Math.abs(computeMetrics(b).ppg - base) < 3, `the 'true' string left the PPG at ${computeMetrics(b).ppg} (untreated ${base})`);
});

test('R07: the repairs are reported with a readable field path, and a clean record reports none', () => {
  const r = sanitizeParamsReport({ tips: { on: 'false', d: 8 }, drugs: { carvedilol: 'yes' }, cirrhosis: 7, albumin: 'x', mystery: 1, occluded: { C5: 'true' } });
  const by = Object.fromEntries(r.repairs.map((x) => [x.path, x]));
  assert.deepEqual(by['tips.on'], { path: 'tips.on', was: 'false', now: false });
  assert.deepEqual(by['drugs.carvedilol'], { path: 'drugs.carvedilol', was: 'yes', now: false });
  assert.equal(by.cirrhosis.now, 1);
  assert.equal(by.albumin.now, D.albumin);
  assert.equal(by.mystery.now, 'dropped');
  assert.equal(by['occluded.C5'].now, 'dropped');
  assert.equal(r.params.tips.on, false);
  assert.deepEqual(r.params, sanitizeParams({ tips: { on: 'false', d: 8 }, drugs: { carvedilol: 'yes' }, cirrhosis: 7, albumin: 'x', mystery: 1, occluded: { C5: 'true' } }), 'the report changes nothing');
  assert.deepEqual(sanitizeParamsReport(D).repairs, []);
  assert.deepEqual(sanitizeParamsReport({ tips: { on: true, d: 8 }, drugs: { carvedilol: true } }).repairs, []);
  assert.deepEqual(sanitizeParamsReport(undefined).repairs, []);
  assert.deepEqual(sanitizeParamsReport('junk').repairs, [{ path: '', was: 'junk', now: 'defaults' }]);
});

test('R07: every preset passes through unchanged, so no honest scenario is repaired', () => {
  const e = new Engine();
  for (const id of ['healthy', 'cirr-comp', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'budd-chiari', 'pregnancy']) {
    e.loadPreset(id);
    assert.deepEqual(sanitizeParamsReport(e.params).repairs, [], id);
  }
});
