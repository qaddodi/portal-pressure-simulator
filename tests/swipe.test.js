import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDir, ownsSideways } from '../src/ui/swipe.js';

test('swipe left goes next, right goes back', () => {
  assert.equal(swipeDir(-80, 5, 200), 1);
  assert.equal(swipeDir(80, -10, 200), -1);
});
test('taps, short moves, vertical scrolls, diagonals and slow drags are not swipes', () => {
  assert.equal(swipeDir(3, 2, 80), 0);
  assert.equal(swipeDir(-49, 0, 100), 0);
  assert.equal(swipeDir(-20, 200, 200), 0);
  assert.equal(swipeDir(-90, 70, 200), 0);
  assert.equal(swipeDir(-90, 0, 1200), 0);
  assert.equal(swipeDir(NaN, 0, 100), 0);
});
test('50 px exactly counts', () => assert.equal(swipeDir(-50, 0, 100), 1));

// (A pane that runs wider than its card, with a row inside that scrolls: nodes with the few fields ownsSideways reads.)
const node = (parentElement, over = {}) => ({ nodeType: 1, parentElement, matches: () => false, scrollWidth: 100, clientWidth: 100,
  ownerDocument: { defaultView: { getComputedStyle: () => ({ overflowX: 'auto' }) } }, ...over });
test('a sideways scroller owns a sideways drag, unless the Tests card asks for the swipe from anywhere', () => {
  const body = node(null), pane = node(body, { scrollWidth: 400 }), row = node(pane, { scrollWidth: 300 });
  assert.equal(ownsSideways(row, { stop: body }), true);
  assert.equal(ownsSideways(row, { stop: body, scrollers: false }), false);
  const slider = node(pane, { matches: (q) => q.includes('[role="slider"]') });
  assert.equal(ownsSideways(slider, { stop: body, scrollers: false }), true);   // (a slider keeps its own drag)
});
