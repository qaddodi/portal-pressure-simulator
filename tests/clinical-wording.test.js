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
  assert.ok(rules('A tap of 5 liters of ascites lowers the pressure').includes('tap'));
  assert.deepEqual(rules('Tap a station to see its pressure.'), []);   // (a tap on the screen)
  assert.ok(rules('oesophageal varices').includes('british'));
  assert.ok(rules('the portal vein — the main inflow').includes('em-dash'));
  assert.deepEqual(rules('Large-volume paracentesis lowers the intra-abdominal pressure (IAP).'), []);
});

test('every string of every built-in deck passes the clinical wording rules', () => {
  const found = [];
  for (const d of DECKS) for (const [path, s] of strings(d)) for (const h of check(s)) found.push(`${d.id}.${path}: ${h.rule} "${h.match}" → ${h.fix}`);
  assert.deepEqual(found, []);
});
