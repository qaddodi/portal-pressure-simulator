// Soft edges on lists that scroll (1 Nov 2026): a 12 px fade only at an end with more beyond it, eased.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


test('a sticky foot in a menu sits above the menu\'s scroll-edge veils, so a veil never washes over its buttons', () => {
  const z = (re) => Number((css.match(re) || [])[1]);
  const veil = z(/\.menu\.se::before, \.menu\.se::after \{[^}]*z-index: (\d+)/);
  assert.ok(veil >= 1, 'the veils have a z-index');
  // every rule that makes something inside a menu stick to the bottom must out-stack them
  const all = appCss() + '\n' + readFileSync(new URL('../styles/from-readings.css', import.meta.url), 'utf8');
  const feet = [...all.matchAll(/(\.fr-foot) \{([^}]*position: sticky[^}]*bottom:[^}]*)\}/g)];
  assert.ok(feet.length >= 1, 'the From readings foot is a sticky foot');
  for (const [, sel, body] of feet) assert.ok(Number((body.match(/z-index: (\d+)/) || [])[1]) > veil, `${sel} stacks above the veils`);
});
