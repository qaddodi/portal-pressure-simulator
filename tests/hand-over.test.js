// Rotating an iPad from landscape (1024 x 768, side card) to portrait (768 x 1024, bottom sheet) hands the cards from one layout to the other (F35, play-test 17 Nov 2026):
// each is scrolled back to its top, so the Tests card's head, switch and tabs are in view and a value is never under its label's scrolled-off row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handOver } from '../src/ui/hand-over.js';

const sc = (top) => ({ scrollTop: top });
const layoutOf = (w, h) => (w >= 700 && w > h ? 'side' : 'sheet');   // (dock.js isSide: min-width 700 px and landscape)

test('landscape to portrait: the Tests card and the vessel card are scrolled back to their tops', () => {
  const keep = {}, tests = [sc(0), sc(310), sc(120)], card = [sc(40)];
  assert.equal(handOver(keep, layoutOf(1024, 768), tests), false, 'the first placement scrolls nothing');
  tests[1].scrollTop = 310;   // (the learner scrolled the pane)
  assert.equal(handOver(keep, layoutOf(1024, 768), tests), false, 'the same layout again (a resize): left where it is');
  assert.equal(tests[1].scrollTop, 310);
  assert.equal(handOver(keep, layoutOf(768, 1024), tests), true);
  assert.deepEqual(tests.map((t) => t.scrollTop), [0, 0, 0]);
  const k2 = {}; handOver(k2, 'shelf', card); card[0].scrollTop = 40;
  assert.equal(handOver(k2, 'sheet', card), true); assert.equal(card[0].scrollTop, 0);
});

test('and back to landscape, and a missing scroller is skipped', () => {
  const keep = {}, a = sc(5);
  handOver(keep, 'sheet', [a, null]); a.scrollTop = 99;
  assert.equal(handOver(keep, 'side', [a, null]), true);
  assert.equal(a.scrollTop, 0);
});
