// The lobule's label search is bounded by a count of solves, not by a clock (19 Nov 2026, bible review STG-1): the same lobule state gives the same layout
// on a slow phone and a fast Mac.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchBudget, SEARCH_SOLVES } from '../src/ui/search-budget.js';

test('the budget is over after exactly its number of solves, whatever the clock says', () => {
  const b = createSearchBudget(5);
  b.begin();
  for (let i = 0; i < 5; i++) { assert.equal(b.over(), false, `solve ${i}`); b.spend(); }
  assert.equal(b.over(), true);
  assert.equal(b.spent, 5);
});

test('begin starts a new search from nothing spent', () => {
  const b = createSearchBudget(2);
  b.begin(); b.spend(); b.spend();
  assert.equal(b.over(), true);
  b.begin();
  assert.equal(b.over(), false);
  assert.equal(b.spent, 0);
});

test('the default allows the 720 orders of six labels to be cut, but a full order search of five (120) and a few retries to land', () => {
  assert.ok(SEARCH_SOLVES >= 120 + 8 * 20);
  assert.ok(SEARCH_SOLVES < 720 * 2);
  assert.equal(createSearchBudget().max, SEARCH_SOLVES);
});

test('no wall clock is read: a search budget never looks at performance.now', () => {
  const was = globalThis.performance.now;
  let calls = 0;
  globalThis.performance.now = () => { calls++; return was.call(globalThis.performance); };
  try {
    const b = createSearchBudget(3);
    b.begin(); b.spend(); b.over(); b.spend(); b.spend(); b.over();
  } finally { globalThis.performance.now = was; }
  assert.equal(calls, 0);
});
