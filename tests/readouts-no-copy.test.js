// Tests > Readouts has no "Abnormal readings" copy row (Mohammad, 16 Nov 2026: "remove this whole thing, the copy thing row"): the tab is its tiles and the systemic values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as text from '../src/ui/readouts-text.js';

test('the sentence the copy row wrote is gone, with its words', () => {
  assert.deepEqual(Object.keys(text), ['patientLabel']);
});
