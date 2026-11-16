// Learner text is written for US physicians (Mohammad, 13 Nov 2026: "X less Y is a stupid way of putting this minus that").
// Every string of every built-in deck passes the clinical wording rules of scripts/clinical-wording.mjs (docs/ai-humanizer.md
// section 6); `npm run lint` runs the same rules over the app's own text. A new phrase a clinician would correct joins RULES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { check, strings } from '../scripts/clinical-wording.mjs';

const rules = (s) => check(s).map((h) => h.rule);

test('the rules catch subtraction written as "less", and leave the comparative alone', () => {
  for (const s of [
    'The kidneys are fed at the MAP less the abdomen\'s pressure',
    'HVPG: the wedged pressure less the free pressure',
    'The PPG is this reading less the IVC reading of the first step',
    'the pressure across its wall is the pressure inside less the air\'s',
    '8 mmHg: 18 less 10.',
  ]) assert.ok(rules(s).includes('less-as-minus'), s);
  for (const s of [
    'The cost is less portal blood for the liver.',
    'the less portal blood the liver sees, the more reaches the brain',
    'Spleen stiffness is less reliable in obesity.',
    'Carvedilol lowers the HVPG more than propranolol, at less cost to the MAP.',
    'HVPG = WHVP − FHVP',
    'The PPG is the portal pressure minus the IVC pressure.',
  ]) assert.deepEqual(rules(s), [], s);
});

test('the rules catch lay words and British spelling a US clinician would correct', () => {
  assert.ok(rules('Ascites holds steady: the belly takes back the overflow.').includes('belly'));
  assert.ok(rules('120 leaks; the belly takes back 80.').includes('takes-back'));
  assert.ok(rules('Kidney pressure').includes('kidney-pressure'));
  assert.ok(rules('Renal perfusion pressure is the MAP minus the IAP').includes('renal-perfusion-pressure'));
  assert.ok(rules('The RPP tile turns red').includes('renal-perfusion-pressure'));
  assert.deepEqual(rules('The abdominal perfusion pressure (APP) is the MAP minus the IAP.'), []);
  assert.ok(rules('A tap of 5 liters of ascites lowers the pressure').includes('tap'));
  assert.deepEqual(rules('Tap a station to see its pressure.'), []);   // (a tap on the screen)
  assert.ok(rules('oesophageal varices').includes('british'));
  assert.ok(rules('the portal vein — the main inflow').includes('em-dash'));
  assert.deepEqual(rules('Large-volume paracentesis lowers the intra-abdominal pressure (IAP).'), []);
});

// Mohammad, 16 Nov 2026, on the title "Carvedilol restarts once the blood pressure has recovered": "Who restarts it? I don't understand."
// A drug or therapy does not start, stop, restart or continue by itself: the clinician does (docs/ai-humanizer.md section 5).
test('the rules catch a drug as the subject of start, stop, restart or continue, and leave imperatives and passives alone', () => {
  for (const s of [
    'Carvedilol restarts once the blood pressure has recovered',
    'With ascites and large varices, carvedilol continues',
    'CSPH has resolved, so carvedilol may stop',
    'Anticoagulation starts at once for ≥6 months',
    'Anticoagulation comes first and continues long term',
    'The earlier anticoagulation starts, the likelier recanalization',
    'Propranolol continues, and Baveno VIII 8.20 says it is safe',
    'Octreotide, albumin and the NSBB resume after the endoscopy',
    'The NSBB may continue after a bleed',
    'How long does anticoagulation continue after recent PVT?',
  ]) assert.ok(rules(s).includes('drug-as-subject'), s);
  for (const s of [
    'Restart carvedilol once the blood pressure has recovered',
    'Ascites and large varices despite carvedilol: continue it',
    'Carvedilol is restarted once the blood pressure has recovered',
    'Once CSPH has resolved, carvedilol may be stopped',
    'Start anticoagulation at once and continue it for ≥6 months',
    'Carvedilol lowers the HVPG more than propranolol',
    'Does ascites mean stopping carvedilol?',
    'Octreotide is stopped once the bleeding is controlled',
    'The bleeding stops once the varix is banded',
    'A TIPS returns portal blood directly to the heart',
    'Albumin expands the circulating volume as terlipressin constricts the arteries',
  ]) assert.ok(!rules(s).includes('drug-as-subject'), s);
});

test('the rules catch a guideline, an algorithm or a finding written as the one who acts, and colloquial verbs for pressures (wording audit, 16 Nov 2026)', () => {
  for (const [s, rule] of [
    ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'guideline-as-actor'],
    ['At this MAP, the algorithm continues carvedilol', 'guideline-as-actor'],
    ['Baveno VIII would start carvedilol now', 'guideline-as-actor'],
    ['Hypotension holds carvedilol for now', 'finding-as-actor'],
    ['Does the bilirubin withhold the preemptive TIPS?', 'finding-as-actor'],
    ['A MAP <65 mmHg or HRS-AKI holds it', 'finding-as-actor'],
    ['The portal vein runs at {pv} and the right atrium at {ra}.', 'pressure-motion'],
    ['At the same HVPG her PPG sits higher.', 'pressure-motion'],
    ['It rises. The HVPG cannot see a lesion upstream of the sinusoids.', 'sees'],
    ['Where in the lobule does the scar that stiffens the liver collect?', 'scar'],
  ]) assert.ok(rules(s).includes(rule), `${rule}: ${s}`);
  for (const s of [
    'When does Baveno VIII recommend starting carvedilol in compensated cirrhosis?',
    'At this MAP, continue carvedilol. The algorithm says to continue it.',
    'Reduce or hold carvedilol for hypotension',
    'Does the bilirubin rule out a preemptive TIPS?',
    'The portal vein pressure is {pv} and the right atrial pressure {ra}.',
    'The HVPG does not reflect a lesion upstream of the sinusoids.',
    'Neither Baveno VIII nor AASLD 2024 gives a cut-off for sinusoidal obstruction.',
    'The time-lapse runs at one month a second.',
  ]) assert.deepEqual(rules(s), [], s);
});

test('every string of every built-in deck passes the clinical wording rules', () => {
  const found = [];
  for (const d of DECKS) for (const [path, s] of strings(d)) for (const h of check(s)) found.push(`${d.id}.${path}: ${h.rule} "${h.match}" → ${h.fix}`);
  assert.deepEqual(found, []);
});
