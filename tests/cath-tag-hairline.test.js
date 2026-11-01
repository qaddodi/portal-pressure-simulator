// The catheter's reading tags print with a hairline (1 Nov 2026, sprint brief 7): the outline path is stroked 2 px and clipped to its
// inside, so 1 px shows, in the strong border with a fifth of the reading's colour. ?cathtag=0 leaves the class off and the old ring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/ui/callout.js', import.meta.url), 'utf8');

test('the hairline rule: border colour with a fifth of the reading colour, 2 px stroke (1 px shows)', () => {
  assert.match(css, /\.cl-glass\.cl-hair path \{ stroke: color-mix\(in srgb, var\(--c\) 20%, var\(--border-strong\)\); stroke-width: 2; \}/);
});

test('the old ring stays as it was for ?cathtag=0', () => {
  assert.match(css, /\.cl-glass path \{ fill: none; stroke: var\(--rg\); stroke-width: 4; stroke-linejoin: miter; \}/);
});

test('callout.js adds the class unless the page says ?cathtag=0', () => {
  assert.match(src, /const HAIR = !\/\[\?&\]cathtag=0\\b\/\.test\(globalThis\.location\?\.search \|\| ''\);/);
  assert.match(src, /glass\.className = HAIR \? 'cl-glass cl-hair' : 'cl-glass';/);
});
