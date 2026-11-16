// The HVPG tab's button stopped saying "Measuring…" once the result was on screen (tester, 16 Nov 2026: "Measuring…" for several seconds beside a finished 2.3).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLabel } from '../src/ui/hvpg-proc.js';

test('the button names the measurement until the result lands, then the catheter, then offers again', () => {
  assert.equal(measureLabel(false, false), 'Measure HVPG');
  assert.equal(measureLabel(true, false), 'Measuring…');
  assert.equal(measureLabel(true, true), 'Withdrawing the catheter…');
  assert.equal(measureLabel(false, true), 'Measure again');
});
