// A sheet that is closing keeps its glass until its leave has played (17 Nov 2026, the tester: closing Treat, History and the other sheets, the glass was gone on the first frame
// and the paper and words then went over bare figure, then popped to nothing). main.js sets the sheet's hidden attribute as the close begins and the stylesheet still shows it
// (.card-leaving, app-08-cards.css), so neither the list of glass plates (main.js sheetGlass, kept by scripts/source-shapes/cards-one-motion-17nov.mjs) nor the glass's per-frame
// check (hiddenIn, here) may take hidden alone for gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenIn } from '../src/ui/glass-motion.js';

const el = (hidden, ...classes) => ({ hidden, classList: { contains: (c) => classes.includes(c) } });

test('an element hidden by its attribute, or under one that is, is gone from the glass', () => {
  assert.equal(hiddenIn([el(false), el(true), el(false)]), true);
  assert.equal(hiddenIn([el(true)]), true);
  assert.equal(hiddenIn([el(false), el(false)]), false);
});

test('a sheet that is leaving (.card-leaving) is shown by the stylesheet whatever its hidden attribute says: its glass stays', () => {
  assert.equal(hiddenIn([el(false), el(true, 'card-leaving')]), false);
  assert.equal(hiddenIn([el(true, 'card-leaving'), el(true)]), true, 'a parent that is hidden for good still hides it');
});
