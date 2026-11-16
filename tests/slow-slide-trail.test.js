// A slow slide change says where its time went in the ?perf copy (play-test, 16 Nov 2026: Carvedilol slide 5 showed no card for 10 s and nothing said why).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slowTrail, createTxns } from '../src/ui/slide-txn.js';

test('a slow change lists each step and how long it ran, the last one up to now', () => {
  const trail = ['leave', 1000, 'state-ready', 1150, 'settle', 10950, 'cards-in', 11250];
  assert.equal(slowTrail(trail, 11300, 'slide 5'), 'slide 5 took 10300 ms: leave 150, state-ready 9800, settle 300, cards-in 50');
});

test('a quick change, or one with no steps, says nothing', () => {
  assert.equal(slowTrail(['leave', 1000, 'settle', 1200], 1900), '');
  assert.equal(slowTrail([], 5000), '');
  assert.equal(slowTrail(undefined, 5000), '');
});

test('a transaction keeps enough steps for the longest slide change (cards-in is the 12th and later)', () => {
  const t = createTxns().begin({});
  for (let k = 0; k < 18; k++) t.phase(`p${k}`, k);
  assert.equal(t.trail.length, 36, 'eighteen steps kept, two entries each');
});
