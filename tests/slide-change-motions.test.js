// Three kinds of slide change, three motions (first-principles item 14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshPatient, changeKind } from '../src/ui/slide-motion.js';

test('a slide that loads a preset is a new patient: the figure dips', () => {
  assert.equal(freshPatient({ preset: 'csph' }, false, false), true);
  assert.equal(changeKind({ preset: 'csph', params: { x: 1 } }, false, false), 'patient');
});

test('a time-lapse is time passing and keeps the time-lapse', () => {
  assert.equal(freshPatient({ lapse: { seconds: 6 }, days: 365 }, true, false), false);
  assert.equal(changeKind({ lapse: { seconds: 6 }, days: 365 }, true, false), 'time');
  assert.equal(freshPatient({ preset: 'csph', lapse: { seconds: 6 } }, true, false), false);
});

test('the same patient treated eases, and a procedure keeps its own way in', () => {
  assert.equal(changeKind({ params: { tips: { d: 8 } } }, false, false), 'treat');
  assert.equal(changeKind({ action: 'beta-blocker' }, false, false), 'treat');
  assert.equal(freshPatient({ preset: 'cirr', procedure: 'tips' }, false, true), false);
  assert.equal(changeKind({ title: 'Words only' }, false, false), 'same');
});
