// Whether a trial enrolled a patient like this one (src/ui/trial-fit.js): each entry rule against the model's own numbers, 'na' where the model
// has no field for it, and a verdict that never reads an unknown as eligible. The trial records here carry the entry rules trials.js is gaining
// (the other fields as trials.js has them), so these tests do not wait on that file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTrial, failedRows, FIT_TESTS, NOT_IN_MODEL, groupOf, possiblyWords, whyNot, lcFirst, openRows, stillNeeded, fitsWords, FITS_WORDS, metricsOfFp } from '../src/ui/trial-fit.js';
import { varixGrade, ascitesGrade } from '../src/engine/portal/metrics.js';
import { HV_BLOCKED } from '../src/engine/portal/pressure-cuts.js';

// A patient as computeMetrics and the params give it, with only the fields the tests read.
// (rw: the red wale signs the model reads on the varix: true, false, or null for a record that does not carry them.)
const patient = ({ hvpg = 11.6, varix = 3.8, asc = 0, gv = false, bleed = false, cirrhosis = 0.6, tips = false, rhv = 0, rw = false } = {}) => ({
  m: { hvpg, varix: { d: varix, grade: varixGrade(varix), present: varix >= 2.5, ...(rw === null ? {} : { redWale: rw }) }, gastricVarix: { present: gv }, ascites: { volume: asc, ...ascitesGrade(asc) }, bleeding: bleed ? { site: 'VAR' } : null },
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
// What only a case author can say: the patient has never decompensated (no earlier ascites, bleed, encephalopathy or jaundice).
const CASE = { decompensated: false };
const fit = (id, o, facts = null) => { const { m, p } = patient(o); return fitTrial(FIXTURES[id], m, p, facts); };

test('the test vocabulary is the one the trials use', () => {
  assert.deepEqual([...FIT_TESTS].sort(), ['acute_bleed', 'albumin_lt', 'ascites', 'ascitic_protein_lt', 'cirrhosis', 'compensated', 'decompensated', 'diuretics', 'gastric_varices', 'hvpg_ge', 'no_tips', 'no_varices', 'platelets_ge', 'tips', 'varices_high_risk', 'varices_medium_large', 'varices_not_high_risk', 'varices_present']);
});

test('a patient with CSPH, small varices and no ascites does not "fit" PREDESCI while a defining rule stays open, and matches it once every rule was checked', () => {
  const r = fit('predesci', {}, CASE);
  assert.equal(r.verdict, 'unknown', 'four rules met, one the model cannot check: cannot tell, never fits');
  assert.equal(fit('predesci4', {}, CASE).verdict, 'fits');
  assert.deepEqual(r.rows.map((x) => x.state), ['yes', 'yes', 'yes', 'yes', 'na']);
  assert.equal(r.rows[1].value, 'HVPG 11.6 mmHg');
  assert.equal(r.rows[3].value, 'Small, 3.8 mm, no red wale signs');
  assert.equal(r.rows[4].value, NOT_IN_MODEL);
});

test('one rule that fails is enough: ascites, a large varix or an HVPG under the line', () => {
  assert.equal(fit('predesci', { asc: 1000 }).verdict, 'no');
  assert.deepEqual(failedRows(fit('predesci', { asc: 1000 })).map((x) => [x.rule, x.value]), [['Never decompensated', 'Ascites 1.0 L']]);
  assert.equal(fit('predesci', { varix: 7.2 }).verdict, 'no');
  assert.equal(fit('predesci', { hvpg: 9.9 }).verdict, 'no');
  assert.equal(fit('predesci4', { hvpg: 10 }, CASE).verdict, 'fits', 'at the line counts as reached');
  assert.equal(fit('predesci', { cirrhosis: 0 }).verdict, 'no');
});

test('the varix rules read the model\'s grading: Small under 5 mm, Large from 5', () => {
  assert.equal(fit('tripathi', { varix: 4.9 }).verdict, 'no');
  assert.equal(fit('tripathi', { varix: 5.0 }).verdict, 'fits');
  assert.equal(fit('tripathi', { varix: 4.96 }).verdict, 'fits', 'graded as printed: 4.96 reads 5.0 mm, Large');
  assert.equal(fit('tripathi', { varix: 1 }).rows[0].value, 'No varices');
  assert.equal(fit('predesci', { varix: 1, rw: null }).rows[3].state, 'yes', 'no varices are not high-risk varices, whatever the red wale record says');
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

test('F18: a trial with some defining rules checked and met is "possibly fits", with the count; none checked is "cannot tell"', () => {
  const r = fit('predesci', {}, CASE);   // four rules checked and met, the fifth (no earlier bleed or encephalopathy) not in the model; cirrhosis is context
  assert.deepEqual([r.verdict, r.met, r.of, groupOf(r)], ['unknown', 3, 4, 'possible']);
  assert.equal(possiblyWords(r), 'Possibly fits: 3 of 4 key rules met');
  assert.deepEqual(openRows(r).map((x) => x.rule), ['No earlier bleed or encephalopathy']);
  assert.equal(groupOf(fit('predesci4', {}, CASE)), 'fits');
  assert.equal(groupOf(fit('predesci4')), 'possible', 'without the case history the rule "never decompensated" is open');
  assert.equal(groupOf(fit('predesci', { asc: 1000 })), 'no');
  const none = fit('confirm');
  assert.deepEqual([none.met, none.of, groupOf(none)], [0, 2, 'unknown']);
  assert.equal(possiblyWords({ met: 1, of: 1 }), 'Possibly fits: 1 of 1 key rule met');
  assert.equal(groupOf({ verdict: 'unknown', rows: [] }), 'unknown', 'a trial with no rules listed is not "possibly"');
});

test('F4: the one rule the patient fails, as a line: "HVPG 8.2, needs ≥10"', () => {
  assert.equal(whyNot(fit('predesci', { hvpg: 8.2 })), 'HVPG 8.2, needs ≥10');
  assert.equal(whyNot(fit('predesci', { asc: 1000 })), 'Ascites 1.0 L, needs never decompensated');
  assert.equal(whyNot(fit('predesci', { varix: 7.2 })), 'Large, 7.2 mm, needs no high-risk varices');
  assert.equal(whyNot(fit('predesci4', {}, CASE)), null, 'a patient who fits has no rule to name');
  assert.equal(whyNot(null), null);
});

test('a rule is lower-cased in a sentence unless it starts with a name (HVPG, Child–Pugh)', () => {
  assert.equal(lcFirst('Cirrhosis'), 'cirrhosis');
  assert.equal(lcFirst('Grade II or larger esophageal varices'), 'grade II or larger esophageal varices');
  assert.equal(lcFirst('Child–Pugh B or C'), 'Child–Pugh B or C');
  assert.equal(lcFirst('HVPG ≥10 mmHg'), 'HVPG ≥10 mmHg');
});

// ---- R02 of the external production review (15 Nov 2026): a clinical concept is not its nearest number --------------------------------------------------
test('R02: "no ascites" is not "compensated": the rule is open until a case author says the patient never decompensated', () => {
  const none = fit('predesci4');
  assert.deepEqual(none.rows.map((x) => x.state), ['yes', 'yes', 'na', 'yes'], 'no ascites alone leaves compensated unknown');
  assert.equal(none.rows[2].value, 'No ascites; earlier decompensation not in the model');
  assert.equal(none.verdict, 'unknown');
  assert.equal(none.rows[2].source, null, 'a row the model could not answer has no source');
  const authored = fit('predesci4', {}, CASE);
  assert.equal(authored.rows[2].state, 'yes');
  assert.equal(authored.rows[2].value, 'No decompensation (case history)');
  assert.equal(authored.rows[2].source, 'case', 'a rendered row says the fact was authored');
  assert.equal(authored.rows[1].source, 'model', 'and the HVPG row says it came from the model');
  // A fact that is not a real boolean is no fact: the rule stays open.
  for (const bad of ['false', 0, null, 'no', [], {}]) assert.equal(fit('predesci4', {}, { decompensated: bad }).rows[2].state, 'na', `decompensated: ${JSON.stringify(bad)}`);
  // What the model does know still excludes: ascites, a bleed now, or an authored earlier decompensation.
  assert.equal(fit('predesci4', { asc: 1000 }, CASE).rows[2].state, 'no', 'the model\'s ascites beats the author');
  assert.equal(fit('predesci4', { bleed: true }, CASE).rows[2].state, 'no');
  assert.equal(fit('predesci4', {}, { decompensated: true }).rows[2].state, 'no');
  assert.equal(fit('predesci4', {}, { decompensated: true }).verdict, 'no');
});

test('R02: red wale signs are high-risk varices, whatever the size; unknown signs stay unknown', () => {
  const rule = (o, facts) => fit('predesci4', o, facts).rows[3];
  assert.deepEqual([rule({ varix: 3.8, rw: true }).state, rule({ varix: 3.8, rw: true }).value], ['no', 'Small, 3.8 mm, red wale signs'], 'small varices with red wale: high risk');
  assert.equal(fit('predesci4', { varix: 3.8, rw: true }, CASE).verdict, 'no', 'one known exclusion decides');
  assert.equal(rule({ varix: 3.8, rw: false }).state, 'yes');
  assert.equal(rule({ varix: 3.8, rw: null }).state, 'na', 'a record without the signs cannot say they are absent');
  assert.equal(rule({ varix: 3.8, rw: null }).value, 'Small, 3.8 mm; red wale signs not recorded');
  assert.equal(rule({ varix: 7.2, rw: null }).state, 'no', 'Large is high risk without looking');
  assert.equal(fit('predesci4', { varix: 3.8, rw: null }, CASE).verdict, 'unknown', 'one open defining rule: cannot tell');
  // The slide's record (the fingerprint) carries the signs as a boolean, and metricsOfFp passes only a boolean on.
  assert.equal(metricsOfFp({ varix: 3.8, redWale: true }).varix.redWale, true);
  assert.equal(metricsOfFp({ varix: 3.8, redWale: false }).varix.redWale, false);
  assert.equal('redWale' in metricsOfFp({ varix: 3.8 }).varix, false);
  assert.equal('redWale' in metricsOfFp({ varix: 3.8, redWale: 'yes' }).varix, false);
});

test('R01: a full match says what is unchecked, never "fits", "eligible" or "enrolled"', () => {
  const r = fit('earlytips', { bleed: true });   // every defining rule met; the randomization window is a minor rule the model cannot check
  assert.equal(r.verdict, 'fits');
  assert.equal(stillNeeded(r), 'Still needed: randomized within 24 hours');
  assert.equal(fitsWords(r), `${FITS_WORDS} Still needed: randomized within 24 hours.`);
  assert.equal(FITS_WORDS, "Matches the modeled criteria. The protocol's other entry rules, such as its exclusions, are not checked.");
  assert.equal(fitsWords(fit('predesci4', {}, CASE)), `${FITS_WORDS} From the case history: never decompensated.`, 'nothing open: the head, the caveat, and the rule that rests on the case author\'s word');
  for (const w of [FITS_WORDS, fitsWords(r)]) assert.ok(!/\b(eligible|enrolled|fits)\b/i.test(w), w);
});

test('R01: a passing rule plus an unknown one never gives a favorable headline', () => {
  const one = fitTrial({ entry: [{ rule: 'Ascites', test: 'ascites' }, { rule: 'Creatinine below 1.5', test: null }] }, patient({ asc: 1500 }).m, patient().p);
  assert.equal(one.verdict, 'unknown');
  assert.equal(groupOf(one), 'possible');
  assert.equal(possiblyWords(one), 'Possibly fits: 1 of 2 key rules met');
  assert.equal(stillNeeded(one), 'Still needed: creatinine below 1.5');
});

// ---- TC-F2 (trials card review, 15 Nov 2026): cirrhosis and "no TIPS" are true of nearly every patient; they were lifting trials into "Possibly fits"
test('TC-F2: context rules (cirrhosis, no TIPS) can exclude but never make a trial "possibly fits"', () => {
  const ctx = fitTrial({ entry: [{ rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'No TIPS in place', test: 'no_tips' }, { rule: 'Recovered from overt HE', test: null }] }, patient().m, patient().p);
  assert.deepEqual([ctx.verdict, ctx.met, ctx.of, groupOf(ctx)], ['unknown', 0, 1, 'unknown'], 'met on context alone: cannot tell');
  assert.deepEqual(ctx.rows.map((r) => r.context), [true, true, false]);
  const out = fitTrial({ entry: [{ rule: 'Cirrhosis', test: 'cirrhosis' }, { rule: 'Recovered from overt HE', test: null }] }, patient({ cirrhosis: 0 }).m, patient({ cirrhosis: 0 }).p);
  assert.equal(out.verdict, 'no', 'a context rule still excludes');
  const marked = fitTrial({ entry: [{ rule: 'Chronic liver disease', test: 'cirrhosis', context: false }, { rule: 'Open', test: null }] }, patient().m, patient().p);
  assert.equal(groupOf(marked), 'possible', 'a record may say a rule is evidence after all');
});

// ---- TC-F1: rules whose fact the model holds are checked, never "not in the model"
test('TC-F1: high-risk varices, varices at all, albumin, platelets, ascitic protein, diuretics and decompensation are read from the model', () => {
  const T = (test, value) => ({ entry: [{ rule: 'R', test, ...(value != null ? { value } : {}) }] });
  const st = (t, o = {}, extra = {}) => { const { m, p } = patient(o); return fitTrial(t, { ...m, ...extra.m }, { ...p, ...extra.p }, extra.facts).rows[0].state; };
  assert.equal(st(T('varices_high_risk'), { varix: 3.8, rw: false }), 'no', 'small, no red wale signs');
  assert.equal(st(T('varices_high_risk'), { varix: 3.8, rw: true }), 'yes');
  assert.equal(st(T('varices_high_risk'), { varix: 6 }), 'yes', 'large');
  assert.equal(st(T('varices_high_risk'), { varix: 3.8, rw: null }), 'na', 'signs not recorded');
  assert.equal(st(T('varices_high_risk'), { varix: 1 }), 'no', 'no varix');
  assert.equal(st(T('varices_present'), { varix: 3.8 }), 'yes');
  assert.equal(st(T('varices_present'), { varix: 1 }), 'no');
  assert.equal(st(T('no_varices'), { varix: 1 }), 'yes', 'Groszmann 2005: no varices yet');
  assert.equal(st(T('no_varices'), { varix: 3.8 }), 'no');
  assert.equal(st(T('albumin_lt', 3), {}, { p: { albumin: 2.8 } }), 'yes');
  assert.equal(st(T('albumin_lt', 3), {}, { p: { albumin: 4 } }), 'no');
  assert.equal(st(T('albumin_lt', 3)), 'na', 'no albumin in the params');
  assert.equal(st(T('platelets_ge', 30), {}, { m: { spleen: { platelets: 25 } } }), 'no');
  assert.equal(st(T('platelets_ge', 30), {}, { m: { spleen: { platelets: 120 } } }), 'yes');
  assert.equal(st(T('ascitic_protein_lt', 1.5), { asc: 3000 }, { m: { ascites: { volume: 3000, ...ascitesGrade(3000), totalProtein: 1.1 } } }), 'yes');
  assert.equal(st(T('ascitic_protein_lt', 1.5), { asc: 3000 }, { m: { ascites: { volume: 3000, ...ascitesGrade(3000), totalProtein: 2.4 } } }), 'no');
  assert.equal(st(T('ascitic_protein_lt', 1.5)), 'na', 'no ascites to tap');
  assert.equal(st(T('diuretics'), {}, { p: { diuretics: true } }), 'yes');
  assert.equal(st(T('diuretics'), {}, { p: { diuretics: false } }), 'no');
  assert.equal(st(T('decompensated'), { asc: 2000 }), 'yes');
  assert.equal(st(T('decompensated'), { bleed: true }), 'yes');
  assert.equal(st(T('decompensated')), 'na', 'no ascites says nothing of the past');
  assert.equal(st(T('decompensated'), {}, { facts: { decompensated: false } }), 'no');
  assert.equal(st(T('decompensated'), {}, { facts: { decompensated: true } }), 'yes');
  const { m, p } = patient();
  assert.equal(whyNot(fitTrial(T('albumin_lt', 3), m, { ...p, albumin: 4 })), 'Albumin 4.0 g/dL, needs <3.0');
});
