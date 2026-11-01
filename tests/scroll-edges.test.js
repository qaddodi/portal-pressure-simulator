// Soft edges on lists that scroll (1 Nov 2026): a 12 px fade only at an end with more beyond it, eased, and off with ?edges=0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeState, edgesOff } from '../src/ui/scroll-edges.js';

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

test('?edges=0 turns it off: nothing is observed, no class is added', () => {
  assert.equal(edgesOff('?edges=0'), true);
  assert.equal(edgesOff('?a=1&edges=0'), true);
  assert.equal(edgesOff('?edges=1'), false);
  assert.equal(edgesOff(''), false);
  assert.match(js, /if \(!root \|\| edgesOff\(\)\) return null;/);
});

test('the handler reads only scrollTop, scrollHeight and clientHeight, in a frame (frameFor), from a passive listener', () => {
  assert.match(js, /addEventListener\('scroll', \(\) => schedule\(l\), \{ passive: true \}\)/);
  assert.match(js, /nextFrame/);
  assert.doesNotMatch(js, /getBoundingClientRect|offsetHeight|offsetTop/);
});

test('main.js loads it, and the stylesheet eases the two depths on the motion scale and draws them on the scrolling element', () => {
  assert.match(main, /import '\.\/scroll-edges\.js\?v=[0-9a-f]+';/);
  assert.match(css, /@property --sedge-t \{ syntax: '<number>'; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@property --sedge-b \{ syntax: '<number>'; inherits: true; initial-value: 0; \}/);
  const i = css.indexOf('.um-col.se, .um-cols.se,');
  assert.ok(i > css.indexOf('.um-col.more, .um-cols.more {'), 'after the .more fades it takes over from');
  const block = css.slice(i, css.indexOf('}', i));
  assert.match(block, /--se-d: 12px/);
  assert.match(block, /transition: --sedge-t var\(--d-small\) var\(--ease-move\), --sedge-b var\(--d-small\) var\(--ease-move\)/);
  assert.match(css, /\.menu\.se::before \{[^}]*opacity: var\(--sedge-t\)/, 'a menu is its own glass: a veil, not a mask');
  assert.match(css, /\.menu\.se::after \{[^}]*opacity: var\(--sedge-b\)/);
});

test('History keeps its own mask and the search palette is left to its own', () => {
  assert.match(js, /\.menu:not\(\.tl-history\)/);
  assert.doesNotMatch(js, /pal-list/);
});
