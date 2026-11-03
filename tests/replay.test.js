// Replay the change (N8): which slides can be replayed, what they replay, and the presenter's wiring.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayable, replayKind, replayFrom } from '../src/ui/replay.js';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('only a slide that plays a change, after the first, can be replayed', () => {
  assert.equal(replayable({ params: { a: 1 } }, 3), true);
  assert.equal(replayable({ days: 90, lapse: {} }, 2), true);
  assert.equal(replayable({ procedure: 'tips' }, 2), true);
  assert.equal(replayable({ params: { a: 1 } }, 0), false);
  assert.equal(replayable({ line: 'words only' }, 3), false);
  assert.equal(replayable({ params: {}, visual: 'table' }, 3), false);
  assert.equal(replayable({ params: {}, cath: {} }, 3), false);
  assert.equal(replayable({ preset: 'x', vignette: 'a case' }, 3), false);
  assert.equal(replayable(null, 3), false);
});

test('a lapse replays its days, a procedure its steps, anything else the change', () => {
  assert.equal(replayKind({ lapse: {}, days: 5 }), 'lapse');
  assert.equal(replayKind({ procedure: 'tips' }), 'procedure');
  assert.equal(replayKind({ params: {} }), 'change');
});

test('it eases back to the state the change began from', () => {
  const states = [{ n: 'a' }, { n: 'b', start: { n: 'b0' }, before: { n: 'b1' } }, { n: 'c' }];
  const stateOf = [0, 1, 1, 2];
  assert.equal(replayFrom({ params: {} }, 3, states, stateOf).n, 'b');
  assert.equal(replayFrom({ lapse: {} }, 1, states, stateOf).n, 'b0');
  assert.equal(replayFrom({ procedure: 'x' }, 1, states, stateOf).n, 'b1');
  assert.equal(replayFrom({ params: {} }, 5, states, stateOf), null);
});

test('the presenter wires the button and R, and a newer slide cuts a replay', () => {
  assert.match(PZ, /replayable\(s, i\) \? replayEl\(s, i\) : null/);
  assert.match(PZ, /lk === 'r'\) replay\(\)/);
  const i = PZ.indexOf('async function replay()');
  const body = PZ.slice(i, PZ.indexOf('const REPLAY_BACK_MS', i));
  assert.match(body, /rid !== id/);
  assert.match(body, /want !== to/);
  assert.doesNotMatch(body, /requestAnimationFrame|getContext\('2d'\)/);
});
