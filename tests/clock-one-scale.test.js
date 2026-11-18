// The clock never puts a day count beside the seconds of the run ("Day 180 · 8:35" read as a time of day after a +6-month jump, 16 Nov 2026).

import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtClock } from '../src/ui/timeline.js';

test('past day 0 the clock is the day alone', () => {
  assert.equal(fmtClock(515, 180), 'Day 180');
  assert.equal(fmtClock(515, 1), 'Day 1');
});

test('on day 0 it is the run clock', () => {
  assert.equal(fmtClock(515, 0), '8:35');
  assert.equal(fmtClock(3725, 0), '1:02:05');
});
