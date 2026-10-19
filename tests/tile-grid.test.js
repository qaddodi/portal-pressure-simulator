import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mac and iPad landscape: every data card lays its tiles on one grid across its full inner width, every row full.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const G = '.pz:not(.stack) .pz-data:is(.col, .under, .has-tool) .pz-tiles';

test('one to three tiles take one row (any width), four go two by two, one gap', () => {
  assert.ok(css.includes(`${G}[data-n="1"] { grid-template-columns: minmax(0, 1fr); }`));
  assert.ok(css.includes(`${G}:is([data-n="2"], [data-n="4"]) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`));
  assert.ok(css.includes(`${G}[data-n="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }`), 'three in one row at any card width');
  assert.doesNotMatch(css, /\[data-n="3"\] > \.pz-tile:last-child \{ grid-column: 1 \/ -1; \}/, 'never two and a lone one');
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
  assert.match(pres, /const tileKeys = \(s\) => \(s\.tiles \|\| \[\]\)\.filter\(\(k\) => !\(s\.tool\?\.kind === 'flowtime' && s\.tool\.lines\?\.includes\(k\) && !phone\(\)\)\);/, 'a chart over the days drops tiles for its own two lines, on a laptop or tablet');
  assert.match(pres, /if \(sg !== sig \|\| !draw\)/, 'an empty tile set still builds');
  assert.ok(css.includes('.pz-tiles[data-n="0"] { display: none; }'));
  const decks = ['hvpg', 'ncph', 'one-year', 'outflow', 'prehepatic', 'pvt-cirrhosis', 'recompensation', 'right-heart', 'treatment']
    .map((d) => readFileSync(new URL(`../src/ui/decks/${d}.js`, import.meta.url), 'utf8')).join('\n');
  for (const line of decks.split('\n').filter((l) => l.includes("data: 'ladder'"))) assert.doesNotMatch(line, /tiles: \[[^\]]*'(hvpg|ppg)'/, line.slice(0, 60));
});

test('one tile design on Mac and iPad landscape: centred lines, two sizes (the number and one small size)', () => {
  assert.ok(css.includes('.pz:not(.stack) .pz-data .pz-tiles .pz-tile { display: flex; flex-direction: column; align-items: center; justify-content: center;'));
  assert.ok(css.includes('.pz:not(.stack) .pz-data .pz-tiles .pzt-v { font-size: min(var(--pz-num), 26cqi); }'));
  for (const sel of ['.pzt-k { font-size: var(--pz-sm);', '.pzt-vu small { font-size: var(--pz-sm); }', ':is(.pzt-r, .pzt-d) { font-size: var(--pz-sm);']) assert.ok(css.includes(`.pz:not(.stack) .pz-data .pz-tiles ${sel}`), sel);
  assert.doesNotMatch(css, /\.pz-tiles:not\(\[data-n="3"\]\) \.pzt-r \{ grid-area/, 'the old two-column compact tile is gone');
});

test('an instrument with tiles: the instrument on the left, the tiles stacked beside it, counted once by the card fit', () => {
  const B = '.pz:not(.stack):not(.low) .pz-data.pz-beside';
  assert.ok(css.includes(`${B} { display: grid; grid-template-columns: minmax(0, 1fr) max(150px, 31%);`));
  assert.ok(css.includes(`${B} > .pz-tool { grid-column: 1 / 2; grid-row: 2;`));
  assert.ok(css.includes(`${B} > .pz-tiles:not([data-n="0"]) { grid-column: 2 / 3; grid-row: 2;`));
  assert.doesNotMatch(css, /pz-data[^{]*:has\(> \.pz-tiles/, 'no :has() on the data card (it made every layout of the page slow)');
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  // (All but the portal blood bar, which needs the card's full width for its segments' names: its tiles go under it.)
  assert.match(pres, /data\.classList\.toggle\('pz-beside', \(!!s\.tool \|\| lad\) && !!s\.data && tileKeys\(s\)\.length > 0 && s\.tool\?\.kind !== 'flows'\)/, 'every instrument and every ladder, not only the FibroScan');
  assert.match(pres, /if \(c === side\) continue;/);
});

test('every instrument is one screen: a reading top left, its status top right, the picture under them, words zoomed only as a last resort', () => {
  const B = '.pz:not(.stack):not(.low) .pz-data.pz-beside', S = ':is(.pz:not(.stack):not(.low) .pz-data.pz-beside, .pz:not(.stack):not(.low) .pz-data.has-tool, .pz.stack .pz-data.has-tool, .pz.low .pz-data.has-tool) .pz-tool';
  assert.ok(css.includes(`${B} > .pz-tool { --bs: var(--pz-sm);`));
  assert.ok(css.includes(`.pz:not(.stack):not(.low) .pz-data.col.pz-beside > * { zoom: var(--pz-z, 1); }`), 'the card fit shortens the picture; the words zoom only past its last step');
  assert.ok(css.includes(`${S}[data-kind="doppler"] .dop-report { display: contents; }`));
  assert.ok(css.includes(`${S}[data-kind="doppler"] :is(.dop-range, .dop-stats, .dop-note) { display: none; }`));
  assert.ok(css.includes(`${S}[data-kind="abdomen"] :is(.ab-trend, .ab-iap, .ab-tiles) { display: none; }`));
  assert.match(css, /dop-box \{[^}]*min-height: calc\(\(58cqi \+ var\(--dop-free, 0px\)\) \* var\(--pz-fit, 1\)\)/);
  // The reading, direction and waveform name sit in the monitor's top strip; the trace takes the rows they freed.
  assert.ok(css.includes(`${S}[data-kind="doppler"] .dop-box { --dop-ov: 1; grid-area: 1 / 1 / 2 / -1; }`));
  assert.match(css, /\[data-kind="doppler"\] \.dop-report \{ grid-area: 1 \/ 1 \/ 2 \/ -1; align-self: start;/);
  assert.ok(css.includes('.pz-tool .pt-smooth { display: none; }'));
});

test('the FibroScan draws its words at the card\'s small size: map fills the card, reading in its top right corner, no LIVE tag, units on the 60 mm and 0 ms ticks', () => {
  const src = readFileSync(new URL('../src/ui/fibroscan.js', import.meta.url), 'utf8');
  assert.match(src, /getComputedStyle\(cv\)\.fontSize/);
  assert.doesNotMatch(src, /LIVE\b|LIVE ·/);
  assert.match(src, /'60 mm'/); assert.match(src, /'0 ms'/);
  assert.match(src, /const ex = 0, top = 0, ew = w, ph = hh/, 'the map is the whole instrument');
  assert.match(src, /ctx\.strokeText\('kPa', ux, RY\)/, 'the reading sits inside the map, top right');
  assert.ok(css.includes('.pz-tool .fibroscan-box > canvas { font-size: var(--pz-sm, 14px); }'));
});

test('the FibroScan names its depths and times at even gaps, and the probe\'s head gives way to a card over it', () => {
  const src = readFileSync(new URL('../src/ui/fibroscan.js', import.meta.url), 'utf8');
  assert.match(src, /for \(let d = 40; d <= 80; d \+= 20\)/);
  assert.match(src, /bx = c0 \+ i \* \(c1 - c0\) \/ \(tks\.length - 1\)/);
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /classList\.toggle\('head-off', hit\)/);
  assert.match(css, /\.scan-probe\.head-off :is\(\.sp-head, \.sp-cable\) \{ opacity: 0; \}/);
});
