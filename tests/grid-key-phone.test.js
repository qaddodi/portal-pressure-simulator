// The six-ladder summary's "Healthy, dashed" legend goes wherever the cells draw strips (the phone), which have no dashed line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the dashed-healthy legend is hidden on the phone layout and over strip cells', () => {
  assert.match(css, /\.pz\.stack \.pz-grid-key, \.pz-grid:has\(> \.pz-cell\.strip\) \.pz-grid-key \{ display: none; \}/);
  assert.match(css, /:is\(\.pz\.stack \.pz-cell, \.pz-cell\.strip\) > \.pz-ladder \{ display: none; \}/);
});

test('the strip sits at the bottom of its tile', () => {
  assert.match(css, /\.pz-cell > \.pz-strip \{ margin-top: auto; \}/);
});

test('every tile shows its HVPG as a nowrap pill at the top right, beside the site tag', () => {
  assert.match(css, /\.pz-cell-k \{ display: flex; align-items: center; justify-content: space-between;[^}]*flex-wrap: nowrap;/);
  assert.match(css, /\.pz-cell-pill \{ flex: none; margin-left: auto;[^}]*white-space: nowrap;/);
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(js, /class: 'pz-cell-pill', 'data-rate': rateOf\('hvpg', r\.f\)\[0\]/);
});
