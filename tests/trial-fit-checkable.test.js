// TC-F1 (trials card review, 15 Nov 2026): CAVARLY's "Varices >5 mm, or smaller with red signs", ATTIRE's "Serum albumin <3.0 g/dL" and Shah's varices
// were typed with `test: null`, so the card said "Not in the model" about facts the model holds, and a CSPH patient with a 3.8 mm varix "possibly fit"
// a trial of high-risk varices. The root cause was a record written from the abstract without asking, rule by rule, whether the model has the fact.
// This test asks it for every record: a rule with no test whose words name a fact the model holds fails, unless it is listed below with the part
// the model does not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS } from '../src/ui/trials.js';
import { FIT_TESTS } from '../src/ui/trial-fit.js';

// The facts the model holds, as words a rule would use, and the test that reads each.
const MODEL_FACTS = [
  [/\bHVPG\b/, 'hvpg_ge'],
  [/varic(es|eal)?\b.*(\d\s*mm|large|grade|red|high-risk)|^(esophageal )?varices$/i, 'varices_high_risk / varices_medium_large / varices_present'],
  [/\balbumin\b\s*[<≥>]/i, 'albumin_lt'],
  [/\bplatelets?\b/i, 'platelets_ge'],
  [/ascitic (fluid )?protein/i, 'ascitic_protein_lt'],
  [/^ascites$/i, 'ascites'],
  [/\bTIPS in place\b/i, 'tips / no_tips'],
  [/^(on )?diuretics$/i, 'diuretics'],
  [/^(compensated|decompensated)( cirrhosis)?$/i, 'compensated / decompensated'],
  [/fundal varices/i, 'gastric_varices'],
];
// Rules that name such a fact but turn on something the model lacks (a past event, a dose, a plan, a composite with facts it has not).
const NOT_THE_MODELS = {
  'No previous variceal bleeding': 'a past bleed',
  'No previous band ligation, TIPS or surgical shunt': 'past procedures',
  'Uncomplicated ascites on an aldosterone antagonist ≥200 mg/day and furosemide ≥25 mg/day': 'diuretic doses',
  'Elective TIPS planned, for intractable ascites or to prevent variceal rebleeding': 'a plan',
  'Bleeding controlled with glue and vasoactive drugs, stable ≥12 hours': 'treatment given and its timing',
  'At least 2 of ascites, severe malnutrition, encephalopathy or bilirubin >3 mg/dL': 'three of the four facts',
  'At least 2 large-volume paracenteses over at least 3 weeks': 'past procedures',
  'Recovered from an earlier SBP episode': 'a past infection',
  'Randomized within 24 hours of admission, after vasoactive drugs and endoscopic therapy': 'timing',
  'Treated first with vasoactive drugs and endoscopic therapy': 'treatment given',
  'Not already on a beta-blocker or band ligation for prophylaxis': 'past treatment',
};

test('every rule the model can answer has its test: none is left "not in the model"', () => {
  for (const t of Object.values(TRIALS)) for (const e of t.entry) {
    if (e.test !== null) { assert.ok(FIT_TESTS.includes(e.test), `${t.id}: "${e.rule}" names a test the vocabulary has`); continue; }
    if (Object.hasOwn(NOT_THE_MODELS, e.rule)) continue;
    for (const [re, tests] of MODEL_FACTS) assert.ok(!re.test(e.rule), `${t.id}: "${e.rule}" is a fact the model holds: give it a test (${tests}), or list what the model lacks in NOT_THE_MODELS`);
  }
});

test('the exceptions are real rules and say what the model lacks', () => {
  const rules = new Set(Object.values(TRIALS).flatMap((t) => t.entry.filter((e) => e.test === null).map((e) => e.rule)));
  for (const [rule, why] of Object.entries(NOT_THE_MODELS)) {
    assert.ok(rules.has(rule), `"${rule}" is no longer an unchecked rule: drop it from the list`);
    assert.ok(why.trim().length > 3, rule);
  }
});
