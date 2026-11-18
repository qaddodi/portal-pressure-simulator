// frame.js settleGate (15 Nov 2026, his Safari ?perf in a time-lapse): work made for a state that keeps changing waits until it holds still; a lone
// change begins at once, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleGate } from '../src/ui/frame.js';

test('a first key and a change after a quiet spell begin at once', () => {
  const g = settleGate(1500);
  assert.equal(g('a', 0), 0, 'the first key');
  assert.equal(g('a', 100), 0, 'the same key again');
  assert.equal(g('b', 5000), 0, 'a change after 5 s of quiet');
});

test('a change soon after another waits until its key has held for the gate\'s time, and a key changing all the while never begins', () => {
  const g = settleGate(1500);
  g('a', 0);
  assert.equal(g('b', 1000), 1500, 'a change 1 s after the last waits 1.5 s');
  assert.equal(g('b', 2000), 500);
  assert.equal(g('b', 2500), 0, 'held 1.5 s: it may begin');
  // A time-lapse: a new key every second for a minute.
  const h = settleGate(1500);
  h('k0', 0);
  let began = 0;
  for (let t = 1000; t <= 60000; t += 1000) if (h(`k${t}`, t) === 0) began++;
  assert.equal(began, 0, 'nothing begins while it keeps changing');
  assert.equal(h('k60000', 61500), 0, 'and it begins once the lapse holds still');
});

test('a key that changed unseen during a wait the gate gave waits again', () => {
  const g = settleGate(1500);
  g('a', 0);
  assert.equal(g('b', 1000), 1500, 'told to wait');
  assert.equal(g('c', 2500), 1500, 'back at the end of the wait with another key: it changed meanwhile, so it waits again');
  assert.equal(g('c', 4000), 0, 'held: it may begin');
  assert.equal(g('d', 9000), 0, 'and a later lone change begins at once');
});
