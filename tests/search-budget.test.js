import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchBudget, SEARCH_LEVELS_MS } from '../src/ui/search-budget.js';

// LZ2-1 (full app review, 15 Nov 2026): the lobule's label search keeps to a deadline and is run again, longer, in a later frame. Node only (PR-02: the wiring is pinned in scripts/rules-lint.mjs).
const clock = () => { let t = 1000; return { now: () => t, tick: (ms) => { t += ms; } }; };

test('a search that finishes inside its deadline is not cut and asks for nothing more', () => {
  const c = clock(), b = createSearchBudget(SEARCH_LEVELS_MS, c.now);
  assert.equal(b.begin(), 0);
  c.tick(5);
  assert.equal(b.over(), false);
  assert.equal(b.end(), false);
});

test('a search past its deadline is cut, and asks to be run again at the next level, up to the longest', () => {
  const c = clock(), b = createSearchBudget([10, 40, 160], c.now);
  assert.equal(b.begin(), 0);
  c.tick(11);
  assert.equal(b.over(), true);
  assert.equal(b.end(), true, 'cut at 10 ms: run again');
  c.tick(16);
  assert.equal(b.begin(), 1, 'the next run has 40 ms');
  c.tick(41);
  assert.equal(b.over(), true);
  assert.equal(b.end(), true);
  c.tick(16);
  assert.equal(b.begin(), 2, 'then 160 ms');
  c.tick(161);
  assert.equal(b.over(), true);
  assert.equal(b.end(), false, 'the longest level is the last: the best layout so far stands');
  c.tick(16);
  assert.equal(b.begin(), 0, 'a later search starts again at the shortest');
});

test('a run is never longer than its level allows a search to go on: over stays true once passed', () => {
  const c = clock(), b = createSearchBudget([10, 40, 160], c.now);
  b.begin(); c.tick(20);
  assert.equal(b.over(), true);
  assert.equal(b.over(), true);
  assert.equal(b.cut, true);
});

test('a layout for another reason, long after a cut run, begins at the shortest level', () => {
  const c = clock(), b = createSearchBudget([10, 40, 160], c.now);
  b.begin(); c.tick(20); b.over(); assert.equal(b.end(), true);
  c.tick(5000);
  assert.equal(b.begin(), 0, 'the asked-for run never came (the view changed): not continued');
});

test('the levels are short first and at most a few hundred ms in all, where one frame once took 0.6 to 2.3 s', () => {
  assert.ok(SEARCH_LEVELS_MS[0] <= 16);
  assert.ok(SEARCH_LEVELS_MS.every((v, i, a) => i === 0 || v > a[i - 1]));
  assert.ok(Math.max(...SEARCH_LEVELS_MS) <= 34, 'no run holds a frame longer than two frames (a 160 ms last level was a stall after every lobule pick: the tester, 17 Nov 2026)');
});
