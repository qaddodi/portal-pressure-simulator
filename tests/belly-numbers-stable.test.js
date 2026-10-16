// The ascites belly gauge: the litres, grade and mL/day lines sit in fixed places. The daily-rate line is empty when the
// rate rounds to zero, but must keep its height (never display: none), or the litres and grade re-centre and jump.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the belly rate line keeps its room when empty', () => {
  assert.doesNotMatch(css, /\.ab-rate:empty\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.ab-rate\s*\{[^}]*min-height:\s*1\.1em/);
});
