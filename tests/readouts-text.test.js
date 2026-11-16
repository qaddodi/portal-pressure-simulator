// The patient's name for the timeline's first entry and a history line (readouts-text.js). (The Readouts tab's "Copy as text" row and its sentence were
// removed on 16 Nov 2026 at Mohammad's request; tests/no-copy-text.test.js keeps them out.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientLabel } from '../src/ui/readouts-text.js';

test('the patient is the preset label, or Custom once the parameters moved', () => {
  const st = { presetList: [{ id: 'a', label: 'Acute PVT' }], presetId: 'a' };
  assert.equal(patientLabel(st), 'Acute PVT');
  assert.equal(patientLabel({ ...st, presetId: null }), 'Custom');
});
