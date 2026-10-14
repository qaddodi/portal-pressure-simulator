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

test('live monitors fill the card width and get shorter when tight, never narrower', () => {
  assert.ok(css.includes('.pz-data > .pz-tool:is([data-kind="doppler"], [data-kind="fibroscan"], [data-kind="beats"]) { width: 100%; }'));
  assert.match(css, /\.pz-tool\[data-kind="fibroscan"\] \.fibroscan-box \{ width: 100%; height: clamp\([^}]*\); \}/);
});

test('the FibroScan reads the model median, the number in the tile and words', () => {
  const src = readFileSync(new URL('../src/ui/fibroscan.js', import.meta.url), 'utf8');
  assert.match(src, /shown = shown === null \|\| Math\.abs\(model - shown\) < 0\.05 \? model/);
});

test('a ladder card shows no HVPG or PPG tiles: its brackets give them, so no number is shown twice, rounded two ways', () => {
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /const tileKeys = \(s\) => s\.tiles \|\| \[\];/);
  assert.match(pres, /if \(sg !== sig \|\| !draw\)/, 'an empty tile set still builds');
  assert.ok(css.includes('.pz-tiles[data-n="0"] { display: none; }'));
  const decks = ['hvpg', 'ncph', 'one-year', 'outflow', 'prehepatic', 'pvt-cirrhosis', 'recompensation', 'right-heart', 'treatment']
    .map((d) => readFileSync(new URL(`../src/ui/decks/${d}.js`, import.meta.url), 'utf8')).join('\n');
  for (const line of decks.split('\n').filter((l) => l.includes("data: 'ladder'"))) assert.doesNotMatch(line, /tiles: \[[^\]]*'(hvpg|ppg)'/, line.slice(0, 60));
});

test('compact tiles on Mac and iPad landscape: the status and change sit small beside the number', () => {
  assert.match(css, /\.pz-tiles:not\(\[data-n="3"\]\) \.pzt-r \{ grid-area: 2 \/ 2 \/ 3 \/ 3;/);
  assert.match(css, /\.pz-tiles:not\(\[data-n="3"\]\) \.pzt-d \{ grid-area: 3 \/ 2 \/ 4 \/ 3;/);
  assert.ok(css.includes('.pz:not(.stack) .pz-data:is(.col, .under, .has-tool) .pz-tiles .pzt-v { font-size: min(var(--s-val), 26cqi); }'));
});
