// The six-ladder summary's "Healthy, dashed" legend goes wherever the cells draw strips (the phone), which have no dashed line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the dashed-healthy legend is hidden on the phone layout and over strip cells', () => {
  assert.match(css, /\.pz\.stack \.pz-grid-key, \.pz-grid:has\(> \.pz-cell\.strip\) \.pz-grid-key \{ display: none; \}/);
  assert.match(css, /:is\(\.pz\.stack \.pz-cell, \.pz-cell\.strip\) > \.pz-ladder \{ display: none; \}/);
});
