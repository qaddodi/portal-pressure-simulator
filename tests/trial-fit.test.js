// Whether a trial enrolled a patient like this one (src/ui/trial-fit.js): each entry rule against the model's own numbers, 'na' where the model
// has no field for it, and a verdict that never reads an unknown as eligible. The trial records here carry the entry rules trials.js is gaining
// (the other fields as trials.js has them), so these tests do not wait on that file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTrial, failedRows, FIT_TESTS, NOT_IN_MODEL } from '../src/ui/trial-fit.js';
import { varixGrade, ascitesGrade } from '../src/engine/metrics.js';
import { HV_BLOCKED } from '../src/engine/pressure-cuts.js';

// A patient as computeMetrics and the params give it, with only the fields the tests read.
const patient = ({ hvpg = 11.6, varix = 3.8, asc = 0, gv = false, bleed = false, cirrhosis = 0.6, tips = false, rhv = 0 } = {}) => ({
  m: { hvpg, varix: { d: varix, grade: varixGrade(varix), present: varix >= 2.5 }, gastricVarix: { present: gv }, ascites: { volume: asc, ...ascitesGrade(asc) }, bleeding: bleed ? { site: 'VAR' } : null },
  p: { cirrhosis, tips: { on: tips, d: 8 }, thrombus: rhv ? { RHV_IVC: rhv } : {} },
});
const FIXTURES = {
  predesci: { id: 'predesci', name: 'PREDESCI', entry: [
    { rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'HVPG 10 mmHg or more', test: 'hvpg_ge', value: 10 },
    { rule: 'Never decompensated', test: 'compensated' }, { rule: 'No high-risk varices', test: 'varices_not_high_risk' },
    { rule: 'No earlier bleed or encephalopathy', test: null }] },
  // The same four rules the model can check, with nothing the model cannot: the one shape that can read "fits".
  predesci4: { id: 'predesci4', name: 'PREDESCI, checkable rules only', entry: [
    { rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'HVPG 10 mmHg or more', test: 'hvpg_ge', value: 10 },
    { rule: 'Never decompensated', test: 'compensated' }, { rule: 'No high-risk varices', test: 'varices_not_high_risk' }] },
  tripathi: { id: 'tripathi', name: 'Carvedilol vs EVL', entry: [{ rule: 'Medium or large esophageal varices', test: 'varices_medium_large' }] },
  earlytips: { id: 'earlytips', name: 'Early TIPS', entry: [{ rule: 'Acute variceal bleeding', test: 'acute_bleed' }, { rule: 'Randomized within 24 hours', test: null, minor: true }, { rule: 'No TIPS yet', test: 'no_tips' }] },
  // The defining rule the model cannot check (Child–Pugh class), as the real record has it.
  earlytipsCP: { id: 'earlytipsCP', name: 'Early TIPS, real shape', entry: [{ rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'Acute variceal bleeding', test: 'acute_bleed' }, { rule: 'Child–Pugh C, or B with active bleeding', test: null }, { rule: 'No TIPS yet', test: 'no_tips' }] },
  confirm: { id: 'confirm', name: 'CONFIRM', entry: [{ rule: 'Hepatorenal syndrome', test: null }, { rule: 'Serum creatinine rising', test: null }] },
};
const fit = (id, o) => { const { m, p } = patient(o); return fitTrial(FIXTURES[id], m, p); };

test('the test vocabulary is the one the trials use', () => {
  assert.deepEqual([...FIT_TESTS].sort(), ['acute_bleed', 'ascites', 'cirrhosis', 'compensated', 'gastric_varices', 'hvpg_ge', 'no_tips', 'tips', 'varices_medium_large', 'varices_not_high_risk']);
});

test('a compensated patient with CSPH and small varices does not "fit" PREDESCI while a defining rule stays open, and fits it once every rule was checked', () => {
  const r = fit('predesci');
  assert.equal(r.verdict, 'unknown', 'four rules met, one the model cannot check: cannot tell, never fits');
  assert.equal(fit('predesci4').verdict, 'fits');
  assert.deepEqual(r.rows.map((x) => x.state), ['yes', 'yes', 'yes', 'yes', 'na']);
  assert.equal(r.rows[1].value, 'HVPG 11.6 mmHg');
  assert.equal(r.rows[3].value, 'Small, 3.8 mm');
  assert.equal(r.rows[4].value, NOT_IN_MODEL);
});

test('one rule that fails is enough: ascites, a large varix or an HVPG under the line', () => {
  assert.equal(fit('predesci', { asc: 1000 }).verdict, 'no');
  assert.deepEqual(failedRows(fit('predesci', { asc: 1000 })).map((x) => [x.rule, x.value]), [['Never decompensated', 'Ascites 1.0 L']]);
  assert.equal(fit('predesci', { varix: 7.2 }).verdict, 'no');
  assert.equal(fit('predesci', { hvpg: 9.9 }).verdict, 'no');
  assert.equal(fit('predesci4', { hvpg: 10 }).verdict, 'fits', 'at the line counts as reached');
  assert.equal(fit('predesci', { cirrhosis: 0 }).verdict, 'no');
});

test('the varix rules read the model\'s grading: Small under 5 mm, Large from 5', () => {
  assert.equal(fit('tripathi', { varix: 4.9 }).verdict, 'no');
  assert.equal(fit('tripathi', { varix: 5.0 }).verdict, 'fits');
  assert.equal(fit('tripathi', { varix: 4.96 }).verdict, 'fits', 'graded as printed: 4.96 reads 5.0 mm, Large');
  assert.equal(fit('tripathi', { varix: 1 }).rows[0].value, 'No varices');
  assert.equal(fit('predesci', { varix: 1 }).rows[3].state, 'yes', 'no varices are not high-risk varices');
});

test('a bleed and a TIPS are read from the model', () => {
  assert.equal(fit('earlytips').verdict, 'no');
  assert.equal(fit('earlytips', { bleed: true }).verdict, 'fits', 'a minor rule the model cannot check does not hold "fits" back');
  assert.equal(fit('earlytips', { bleed: true, tips: true }).verdict, 'no');
  assert.equal(fit('earlytipsCP', { bleed: true }).verdict, 'unknown', 'a bleeding patient with the Child–Pugh class unknown is not "fits"');
  const { m, p } = patient({ tips: true });
  assert.equal(fitTrial({ entry: [{ rule: 'TIPS placed', test: 'tips' }] }, m, p).verdict, 'fits');
  assert.equal(fitTrial({ entry: [{ rule: 'Fundal varices', test: 'gastric_varices' }] }, m, p).verdict, 'no');
  assert.equal(fitTrial({ entry: [{ rule: 'Ascites', test: 'ascites' }] }, patient({ asc: 2000 }).m, p).verdict, 'fits');
});

test('a trial with no rule the model can check is unknown, never eligible', () => {
  const r = fit('confirm');
  assert.equal(r.verdict, 'unknown');
  assert.ok(r.rows.every((x) => x.state === 'na'));
  assert.equal(fitTrial({ id: 'x' }, patient().m, patient().p).verdict, 'unknown', 'a trial with no entry list');
  assert.equal(fitTrial({ entry: [{ rule: 'Something new', test: 'creatinine_ge', value: 1.5 }] }, patient().m, patient().p).rows[0].state, 'na', 'a test it does not know is open, not passed');
});

test('an HVPG that is not known leaves its rule open: hidden, not measured, or the hepatic veins thrombosed', () => {
  const { m, p } = patient();
  assert.equal(fitTrial(FIXTURES.predesci, { ...m, hvpg: null }, p).rows[1].state, 'na');
  const bc = patient({ hvpg: 0.3, rhv: HV_BLOCKED });
  const r = fitTrial(FIXTURES.predesci, bc.m, bc.p);
  assert.equal(r.rows[1].state, 'na', 'Budd–Chiari: the HVPG reads low and is not measurable');
  assert.equal(r.rows[1].value, 'HVPG not measurable');
});

test('pure: the same input gives the same answer and nothing is written into it', () => {
  const { m, p } = patient({ asc: 800 });
  const before = JSON.stringify([m, p, FIXTURES.predesci]);
  assert.deepEqual(fitTrial(FIXTURES.predesci, m, p), fitTrial(FIXTURES.predesci, m, p));
  assert.equal(JSON.stringify([m, p, FIXTURES.predesci]), before);
});

test('TR-5: cirrhosis alone, or any one rule the model can check, never reads "fits"', () => {
  const cirrhosisPlusOpen = fitTrial({ entry: [{ rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'Defining rule the model cannot check', test: null }] }, patient().m, patient().p);
  assert.equal(cirrhosisPlusOpen.verdict, 'unknown');
  const minorOnly = fitTrial({ entry: [{ rule: 'Age under 75', test: null, minor: true }] }, patient().m, patient().p);
  assert.equal(minorOnly.verdict, 'unknown', 'a trial whose only rules are fine print has no defining rule to pass');
  assert.deepEqual(fit('earlytipsCP', { bleed: true }).rows.map((x) => x.defining), [true, true, true, true]);
  assert.equal(fit('earlytips', { bleed: true }).rows[1].defining, false);
  assert.equal(fit('earlytipsCP').verdict, 'no', 'one rule that fails still wins: not bleeding');
});
