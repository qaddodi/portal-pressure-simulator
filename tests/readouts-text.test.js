// Tests > Readouts > "Copy as text" (F14): the sentence names only readings past a cut-off, with the tiles' own band words, in the order of the tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phrase, readoutsSentence, patientLabel, SPOKEN } from '../src/ui/readouts-text.js';

test('a reading is written with its number, unit and band word', () => {
  assert.equal(phrase({ id: 'hvpg', v: 15.66, d: 1, u: 'mmHg', word: 'CSPH' }), 'HVPG 15.7 mmHg (CSPH)');
  assert.equal(phrase({ id: 'liver', v: 62, d: 0, u: '%', word: 'Low' }), 'sinusoidal flow 62% (Low)');
  assert.equal(phrase({ id: 'varix', v: 71, d: 0, u: '%', ux: ' of rupture', word: 'Large' }), 'varix wall stress 71% of rupture (Large)');
  assert.equal(phrase({ id: 'pvflow', v: -0.3, d: 1, u: 'L/min', word: 'Reversed' }), 'portal flow −0.3 L/min (Reversed)');
  assert.equal(phrase({ id: 'map', text: '82/50 (61)', u: 'mmHg', word: 'Low' }), 'blood pressure 82/50 (61) mmHg (Low)');
});

test('the sentence leads with the patient and ends with a full stop; nothing abnormal says so', () => {
  assert.equal(readoutsSentence('Cirrhosis', ['HVPG 15.7 mmHg (CSPH)', 'ascites 3.2 L (Grade 2)']), 'Cirrhosis: HVPG 15.7 mmHg (CSPH), ascites 3.2 L (Grade 2).');
  assert.equal(readoutsSentence('Healthy', []), 'Healthy: no reading is past its cut-off.');
});

test('the patient is the preset label, or Custom once the parameters moved', () => {
  const st = { presetList: [{ id: 'a', label: 'Acute PVT' }], presetId: 'a' };
  assert.equal(patientLabel(st), 'Acute PVT');
  assert.equal(patientLabel({ ...st, presetId: null }), 'Custom');
});

test('every systemic value has a spoken name', async () => {
  const { VITALS } = await import('../src/ui/vital-read.js');
  for (const v of VITALS) assert.ok(SPOKEN[v.id], `${v.id} has a spoken name`);
  for (const id of ['hvpg', 'ppg', 'pv', 'rpp', 'pvflow', 'liver', 'shunt', 'varix', 'ascites', 'spleen']) assert.ok(SPOKEN[id], `${id} has a spoken name`);
});
