// The guideline lens reads the Baveno VII rules correctly at their cut-offs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidelineLens, GUIDE_TABLE } from '../src/engine/guidelines.js';

const M = (o = {}) => ({
  lsm: 8, fhvp: 5, ppg: 4, map: 85, bleeding: null,
  spleen: { platelets: 220 }, ascites: { grade: 0 },
  varix: { d: 0, redWale: false, grade: { code: '—' } }, ...o,
});
const P = (o = {}) => ({ cirrhosis: 0.5, fibrosis: { R: { sin: 1 }, L: { sin: 1 } }, drugs: {}, ...o });
const rule = (L, id) => L.rules.find((r) => r.id === id);

test('every rule has a criterion from the table', () => {
  const L = guidelineLens(M(), P(), 4);
  for (const r of L.rules) assert.ok(r.rule, `${r.id}: no criterion`);
  assert.equal(L.rules.length, GUIDE_TABLE.length);
});

test('rule of five and CSPH rule in / rule out', () => {
  assert.equal(rule(guidelineLens(M({ lsm: 9 }), P(), 4), 'acld').verdict, 'Ruled out');
  assert.equal(rule(guidelineLens(M({ lsm: 12 }), P(), 4), 'acld').verdict, 'Suggestive');
  const out = guidelineLens(M({ lsm: 14, spleen: { platelets: 160 } }), P(), null);
  assert.equal(rule(out, 'csph').verdict, 'Ruled out');
  assert.equal(rule(out, 'scope').verdict, 'Can be avoided');
  const inn = guidelineLens(M({ lsm: 26, spleen: { platelets: 160 } }), P(), null);
  assert.equal(rule(inn, 'csph').verdict, 'Ruled in');
  assert.equal(rule(inn, 'nsbb').verdict, 'Indicated');
  assert.equal(inn.stage, 'cACLD with CSPH');
  assert.equal(rule(guidelineLens(M({ lsm: 21, spleen: { platelets: 120 } }), P(), null), 'csph').verdict, 'Probable');
});

test('HVPG uses the project cut-offs (5 and 10 mmHg)', () => {
  assert.equal(rule(guidelineLens(M(), P(), 4.9), 'hvpg').verdict, 'Normal');
  assert.equal(rule(guidelineLens(M(), P(), 5), 'hvpg').verdict, 'Subclinical');
  assert.equal(rule(guidelineLens(M(), P(), 10), 'hvpg').verdict, 'CSPH');
  assert.equal(rule(guidelineLens(M(), P(), null), 'hvpg').verdict, 'Not measured');
});

test('overt ascites is decompensation; grade 1 is not', () => {
  assert.equal(rule(guidelineLens(M({ ascites: { grade: 1 } }), P(), 8), 'decomp').verdict, 'Compensated');
  const d = guidelineLens(M({ ascites: { grade: 2 } }), P({ drugs: { carvedilol: true } }), 16);
  assert.equal(d.stage, 'Decompensated cirrhosis');
  assert.equal(rule(d, 'asc').verdict, 'Continue');
});

test('non-cirrhotic portal hypertension: the rules do not apply', () => {
  const L = guidelineLens(M({ ppg: 18 }), P({ cirrhosis: 0 }), 3);
  assert.equal(L.applies, false);
  assert.equal(rule(L, 'csph').state, 'na');
  assert.equal(rule(L, 'hvpg').verdict, 'Normal');
  assert.match(L.notes[0], /gradients/);
});

test('ascites controlled by diuretics still counts as decompensated', () => {
  assert.equal(guidelineLens(M({ ascites: { grade: 1 } }), P({ diuretics: true }), 16).stage, 'Decompensated cirrhosis');
});
