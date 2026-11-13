// The catheter's reading tags print with a hairline (1 Nov 2026, sprint brief 7): the outline path is stroked 2 px and clipped to its
// inside, so 1 px shows, in the strong border with a fifth of the reading's colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/ui/callout.js', import.meta.url), 'utf8');

test("the hairline rule: the one glass's edge (13 Nov 2026), 2 px stroke (1 px shows)", () => {
  assert.match(css, /\.cl-glass\.cl-hair path \{ stroke: var\(--glass-edge\); stroke-width: 2; \}/);
});

test('the base ring rule the hairline overrides', () => {
  assert.match(css, /\.cl-glass path \{ fill: none; stroke: var\(--rg\); stroke-width: 4; stroke-linejoin: miter; \}/);
});

test('callout.js always adds the class', () => {
  assert.match(src, /glass\.className = 'cl-glass cl-hair';/);
  assert.doesNotMatch(src, /cathtag/);
});
