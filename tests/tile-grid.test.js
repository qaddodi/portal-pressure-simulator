import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mac and iPad landscape: every data card lays its tiles on one grid across its full inner width, every row full.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const G = '.pz:not(.stack) .pz-data:is(.col, .under, .has-tool) .pz-tiles';

test('one to three tiles take one row, four go two by two, one gap', () => {
  assert.ok(css.includes(`${G}[data-n="1"] { grid-template-columns: minmax(0, 1fr); }`));
  assert.ok(css.includes(`${G}:is([data-n="2"], [data-n="3"], [data-n="4"]) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`));
  assert.match(css, /@container pzd \(min-width: 420px\) \{\s*\.pz:not\(\.stack\) \.pz-data:is\(\.col, \.under, \.has-tool\) \.pz-tiles\[data-n="3"\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.ok(css.includes(`${G} { gap: var(--pz-tg); }`));
});

test('no tile sits alone, centred at half width, and no tile grid auto-fits to a ragged row', () => {
  assert.doesNotMatch(css, /justify-self: center; width: calc\(50%/);
  assert.doesNotMatch(css, /\.pz-data\.has-tool:not\(\.tool-only\) \.pz-tiles \{ grid-template-columns: repeat\(auto-fit/);
});
