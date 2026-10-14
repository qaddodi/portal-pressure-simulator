import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Side by side (1100 px and up) the play bar packs its controls and the readouts take the freed
// width with two more key tiles; students in Patients keep their two gradients and the old dock.
test('a wide dock packs the play bar and shows varix and ascites', () => {
  const js = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(js, /WIDE_PRIMARY = new Set\(\['varix', 'ascites'\]\)/);
  assert.match(js, /matchMedia\('\(min-width: 1100px\)'\)/);
  assert.match(js, /wide = !on && !student/);
  const wide = css.slice(css.indexOf('dock.js WIDE_PRIMARY'));
  assert.match(wide, /grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.match(wide, /:not\(\[data-role="student"\]\[data-mode="explore"\]\)/);
});
