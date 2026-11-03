// Soft edges on lists that scroll (1 Nov 2026): a 12 px fade only at an end with more beyond it, eased.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeState } from '../src/ui/scroll-edges.js';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/scroll-edges.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('a list shows a fade only at the ends that have more beyond them', () => {
  assert.equal(edgeState(0, 400, 400), null, 'a list that does not scroll has no fade at all');
  assert.equal(edgeState(0, 400.5, 400), null, 'half a pixel of overflow is not more');
  assert.deepEqual(edgeState(0, 900, 400), [0, 1], 'at the top: bottom fade only');
  assert.deepEqual(edgeState(200, 900, 400), [1, 1], 'in the middle: both');
  assert.deepEqual(edgeState(500, 900, 400), [1, 0], 'at the end: top fade only');
  assert.deepEqual(edgeState(499.5, 900, 400), [1, 0], 'a fraction short of the end counts as the end');
});

test('it is always on: no switch in the address turns it off', () => {
  assert.match(js, /if \(!root\) return null;/);
  assert.doesNotMatch(js, /edges=0|edgesgpu=0|location\.search/);
});

test('nothing is read as a list scrolls or in a frame: the ends come from an IntersectionObserver on the list\'s children, the overflow and padding from a resize', () => {
  assert.doesNotMatch(js, /addEventListener\('scroll'/, 'no scroll listener');
  assert.match(js, /new IntersectionObserver\(/);
  assert.match(js, /\{ root: el, threshold: STEPS \}/);
  assert.doesNotMatch(js, /\.scrollTop|\.scrollHeight|\.clientHeight|getBoundingClientRect|offsetHeight|offsetTop/);
  const apply = js.slice(js.indexOf('function apply(l)'), js.indexOf('function watch(el)'));
  assert.doesNotMatch(apply, /getComputedStyle/, 'the writes read nothing');
});

test('main.js loads it, and the stylesheet eases the two depths on the motion scale and draws them on the scrolling element', () => {
  assert.match(main, /import '\.\/scroll-edges\.js';/);
  assert.match(css, /@property --sedge-t \{ syntax: '<number>'; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@property --sedge-b \{ syntax: '<number>'; inherits: true; initial-value: 0; \}/);
  const i = css.indexOf('.um-col.se, .um-cols.se,');
  assert.ok(i > css.indexOf('.um-col.more, .um-cols.more {'), 'after the .more fades it takes over from');
  const block = css.slice(i, css.indexOf('}', i));
  assert.match(block, /--se-d: 12px/);
  assert.doesNotMatch(css, /transition: --sedge/, 'a mask is never eased by its variables (the list repainted every frame); a menu\'s veils ease by their opacity');
  assert.match(css, /\.menu\.se::before, \.menu\.se::after \{[^}]*transition: opacity var\(--d-small\) var\(--ease-move\);/);
  assert.match(css, /\.menu\.se::before \{[^}]*opacity: var\(--sedge-t\)/, 'a menu is its own glass: a veil, not a mask');
  assert.match(css, /\.menu\.se::after \{[^}]*opacity: var\(--sedge-b\)/);
});

test('History keeps its own mask and the search palette is left to its own', () => {
  assert.match(js, /\.menu:not\(\.tl-history\)/);
  assert.doesNotMatch(js, /pal-list/);
});
