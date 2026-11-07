// Keyboard focus rings (sprint 1 Nov): eased in, inside where a clip would cut them, none after a click.
// The geometry is tested as functions; the wiring is read from source, as the repo's other review tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ringClipped } from '../src/ui/focus-ring.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

test('a ring that would reach past a clipping box is clipped; one with room, or inside, is not', () => {
  const clip = box(0, 0, 200, 100);
  assert.equal(ringClipped(box(10, 10, 60, 40), [clip], 4), false, 'room to spare');
  assert.equal(ringClipped(box(2, 10, 60, 40), [clip], 4), true, 'the left edge is 2 px from the wall');
  assert.equal(ringClipped(box(10, 10, 198, 40), [clip], 4), true, 'right');
  assert.equal(ringClipped(box(10, 0, 60, 40), [clip], 4), true, 'top, flush');
  assert.equal(ringClipped(box(10, 10, 60, 98), [clip], 4), true, 'bottom');
  assert.equal(ringClipped(box(0, 0, 200, 100), [clip], 0), false, 'an inset ring reaches nowhere');
  assert.equal(ringClipped(box(0, 0, 200, 100), [clip], -2), false);
  assert.equal(ringClipped(box(10, 10, 60, 40), [clip, box(0, 0, 61, 100)], 4), true, 'any one clip is enough');
});

test('the file is wired in once, eases with the app\'s own curve, and leaves high contrast to the system', () => {
  const f = read('src/ui/focus-ring.js'), main = read('src/ui/main.js');
  assert.match(main, /import '\.\/focus-ring\.js';/);
  assert.match(f, /forced-colors: active/);
  assert.match(f, /--ease-arrive/);
  assert.match(f, /D_SMALL/);
  assert.match(f, /prefers-reduced-motion: reduce/);
  assert.match(f, /if \(!root \|\| typeof root\.addEventListener !== 'function'\) return null;/);
  assert.doesNotMatch(f, /focusring=0|ringgpu=0|location\.search/);
  assert.match(f, /isTextEntry\(el\)/, 'a text field keeps its ring after a click');
  assert.match(f, /holdStyle\(el, 'outline-offset', `\$\{-w\}px`\)/, 'a clipped ring moves inside');
  assert.doesNotMatch(f, /animate\(\[?\{ ?outline/, 'an outline is never animated (it repaints the control each frame)');
});

test('the stylesheet\'s ring colours and offsets alike are behind html.fr', () => {
  const css = read('styles/app.css');
  assert.match(css, /html\.fr :is\([^)]*\.ps-btn[^)]*\):focus-visible \{ outline-offset: 2px; \}/);
  assert.match(css, /html\.fr :is\([^)]*\.nb-tab[^)]*\):focus-visible \{ outline-color: var\(--focus\); \}/);
});
