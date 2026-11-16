// A reading chip (From readings: "Your readings", the review list, the patient's summary) prints the number as typed with its unit, one rule for
// every reading: no "24.0", no missing unit. The lesion names are the diagnoses, not shorthand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { READINGS, READING_KEYS, chipText } from '../src/engine/inverse.js';
import { LESION } from '../src/engine/inverse-families.js';

test('every numeric chip carries its unit and no trailing zero', () => {
  const sample = { whvp: 24, fhvp: 7, ra: 6, lsm: 45, spleen: 16, plt: 60, saag: 1.9, hvpg: 17.04 };
  const want = { whvp: '24 mmHg', fhvp: '7 mmHg', ra: '6 mmHg', lsm: '45 kPa', spleen: '16 cm', plt: '60 ×10⁹/L', saag: '1.9 g/dL', hvpg: '17 mmHg' };
  for (const [k, v] of Object.entries(sample)) assert.equal(chipText(k, v), want[k], k);
  for (const k of READING_KEYS) if (READINGS[k].kind !== 'grade') assert.ok(chipText(k, 5).endsWith(READINGS[k].unit), `${k} has its unit`);
});

test('a grade chip is its word', () => {
  assert.equal(chipText('asc', 2), 'Grade 2');
  assert.equal(chipText('varix', 1), 'Small');
});

test('lesion names are the diagnoses', () => {
  assert.equal(LESION.pvt.short, 'Portal vein thrombosis');
  assert.equal(LESION.constr.short, 'Constrictive pericarditis');
  assert.equal(LESION.post.short, 'Sinusoidal obstruction syndrome');
  assert.equal(LESION.bcs.short, 'Budd–Chiari syndrome');
});
