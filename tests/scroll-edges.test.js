// Soft edges on lists that scroll (1 Nov 2026): a 12 px fade only at an end with more beyond it, eased.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeState } from '../src/ui/scroll-edges.js';
import { appCss } from './split-src.js';

const css = appCss();

test('a list shows a fade only at the ends that have more beyond them', () => {
  assert.equal(edgeState(0, 400, 400), null, 'a list that does not scroll has no fade at all');
  assert.equal(edgeState(0, 400.5, 400), null, 'half a pixel of overflow is not more');
  assert.deepEqual(edgeState(0, 900, 400), [0, 1], 'at the top: bottom fade only');
  assert.deepEqual(edgeState(200, 900, 400), [1, 1], 'in the middle: both');
  assert.deepEqual(edgeState(500, 900, 400), [1, 0], 'at the end: top fade only');
  assert.deepEqual(edgeState(499.5, 900, 400), [1, 0], 'a fraction short of the end counts as the end');
});



test('main.js loads it, and the stylesheet eases the two depths on the motion scale and draws them on the scrolling element', () => {
  const i = css.indexOf('.um-col.se, .um-cols.se,');
  assert.ok(i > css.indexOf('.um-col.more, .um-cols.more {'), 'after the .more fades it takes over from');
});


test('a card\'s face and its details fade at their foot while there is more below them, from the same edge state the lists use', () => {
  const m = css.match(/\.action-card > \.ac-body\.se, \.ad-scroll\.se \{([^}]*)\}/);
  assert.ok(m, 'one rule for every card face and its details');
  assert.match(m[1], /--se-d: 28px/);
  assert.match(m[1], /mask-image: linear-gradient\(to bottom, transparent, #000 calc\(var\(--sedge-t\) \* var\(--se-d\)\), #000 calc\(100% - var\(--sedge-b\) \* var\(--se-d\)\), transparent\)/, 'only the ends with more beyond them fade');
  assert.deepEqual(edgeState(0, 520, 400), [0, 1], 'a card face at its top with more below: foot fade only');
});
