import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// An upright iPad takes the phone's layout (Mohammad, 17 Oct: "replicate the phone cards and behavior of the bottom bar and cards
// to the upright iPad"): its cards, sheets, bottom bar, menus and the Tests card's one column. Its decks' instrument cards open
// their readings on a card of their own under the instrument ("The top data card doesn't truly open as an extended card under
// the Doppler. It should.").
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const util = read('../src/ui/util.js');
const js = read('../src/ui/presenter.js');
const UP = '(max-width: 1100px) and (orientation: portrait)';

test('one query names the phone layout, and it takes in an upright tablet', () => {
  assert.match(util, /export const UPRIGHT_MQ = '\(max-width: 1100px\) and \(orientation: portrait\)';/);
  assert.match(util, /export const PHONE_MQ = `\(max-width: 767px\), \(max-width: 1023px\) and \(max-height: 500px\) and \(orientation: landscape\), \$\{UPRIGHT_MQ\}`;/);
  assert.match(util, /const asSheet = sheet && \(innerWidth < 768 \|\| matchMedia\(UPRIGHT_MQ\)\.matches\);/, 'menus rise as sheets');
  assert.match(read('../src/ui/main.js'), /const isPhone = isPhoneLayout;/, 'the dock, the cards\' sheets, History and the occupancy');
  assert.match(read('../src/ui/card.js'), /if \(isPhoneLayout\(\)\) \{\n\s*if \(el\.parentNode !== dockHost\) dockHost\.append\(el\);/, 'the vessel card docks over the tab row');
  assert.match(read('../src/ui/menu.js'), /const sheetMQ = matchMedia\(PHONE_MQ\);/);
  const dock = read('../src/ui/dock.js');
  assert.match(dock, /const ratio = heightRatio \?\? \(isPhoneLayout\(\) \? 0\.56 : 0\.46\);/);
  // (The thumb dock is the same screens: an upright tablet had the phone's tab row but not its cards.)
  assert.match(read('../src/ui/main.js'), /const thumbMQ = matchMedia\('\(max-width: 1100px\) and \(orientation: portrait\)'\);/);
  for (const f of ['main.js', 'card.js', 'menu.js', 'dock.js']) {
    assert.doesNotMatch(read(`../src/ui/${f}`), /matchMedia\('\(max-width: 767px\)[^']*'\)/, `${f}: no phone query of its own that leaves the upright tablet out`);
  }
});

test('every phone block in the stylesheet takes in the upright tablet, and every wide one leaves it out', () => {
  const blocks = [...css.matchAll(/@media ([^{]*)\{/g)].map((m) => m[1].trim());
  const phone = blocks.filter((q) => /\(max-width: 767px\)/.test(q));
  assert.ok(phone.length >= 37, `${phone.length} phone blocks`);
  for (const q of phone) assert.ok(q.includes(UP), `phone block without the upright tablet: @media ${q}`);
  for (const q of blocks.filter((b) => /\(min-width: 768px\)/.test(b) && !b.includes('max-width: 1100px'))) {
    assert.equal(q, '(min-width: 768px) and (orientation: landscape), (min-width: 1101px)', `a wide block that still takes the upright tablet: @media ${q}`);
  }
  assert.doesNotMatch(css, /--nb-l|--nb-r/, 'no tablet-only placing of Treat and Tests beside the phone\'s');
});

test('an upright tablet\'s Tests card keeps the phone\'s one column, its picture the card\'s width', () => {
  const m = css.match(/@media \(min-width: 768px\) and \(max-width: 1100px\) and \(orientation: portrait\) \{\n {2}\.app\.thumb \.instrument-workspace\.float-ui:not\(\.side\) \{ --one-col: 1; \}[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(m, 'the block');
  assert.match(m, /:is\(\.instrument-view, \.dop-main, \.hv-main, \.ab-main\) \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'Doppler\'s monitor no longer shares its row with a column of readings');
  assert.match(m, /\.ab-ctl \{ margin-top: var\(--ab-g\);[^}]*border-left: 0;/, 'Ascites stacks its controls under the belly');
});

test('an upright tablet\'s deck instrument card opens its readings on a card of their own under it', () => {
  assert.match(js, /const tabSheet = \(d\) => !!ui\?\.root\.classList\.contains\('tab'\) && d\.classList\.contains\('pz-sheet'\);/, 'upright tablet only: the iPhone keeps its three states');
  // (The glass in two pieces: the instrument's down to --pz-top, the readings' 8 px under it, nothing while they are tucked.)
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet\.pz-sheet \{ background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-color: transparent; box-shadow: none; overflow: visible; isolation: isolate; \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet::before \{ top: -1px; height: calc\(var\(--pz-top, 100%\) \+ 1px\); \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet::after \{ bottom: -1px; height: max\(0px, calc\(100% \+ 1px - var\(--pz-top, 100%\) - 8px\)\); \}/);
  assert.match(js, /return `\$\{\(\(t\.getBoundingClientRect\(\)\.bottom - r\.top\) \/ k - d\.clientTop \+ 10\)\.toFixed\(1\)\}px`;/, '--pz-top: under the instrument plus its 10 px foot');
  // Open: 8 + 10 px over the readings (with the card's 6 px gap, 22), 16 + 10 under them; tucked: as the phone's.
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet\.tool-open \{ padding-bottom: 10px; \}/, 'padding never eases: the margins do');
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet\.tool-open > \.pz-strip, \.pz\.stack\.tab \.pz-data\.pz-sheet\.tiles-only\.tool-open > \.pz-tiles \{ margin-top: 22px; \}/);
  assert.match(js, /open: \[p\.classList\.contains\('pz-strip'\) \|\| d\.classList\.contains\('tiles-only'\) \? 22 : 0, 16\], shut: \[-6, 0\]/, 'the drag follows the same margins');
  // A glass piece inside a fading card loses its blur: the card stays opaque and its parts fade.
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet\.pz-hide \{ opacity: 1; visibility: hidden; transition: transform \.32s var\(--ease\), visibility 0s linear \.32s; \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet\.pz-hide::before, \.pz\.stack\.tab \.pz-data\.pz-sheet\.pz-hide::after, \.pz\.stack\.tab \.pz-data\.pz-sheet\.pz-hide > :is\(\.pz-dh, \.pz-tool, \.pz-tiles, \.pz-strip\) \{ opacity: 0; \}/);
});

test('the first close tucks the readings\' card away, the next closes the instrument card', () => {
  // A push up from fully open is the fold's, not the dock drag's, on an upright tablet.
  assert.match(js, /\(sheet && open && !tab\) \|\| dock\.lvl > 0/);
  assert.match(js, /if \(show !== gg\.open\) \{ if \(gg\.tab && !show\) dock\.down = want; setFold\(show\); return; \}/);
  // The handle's tap: partly, fully, partly (tucked), closed, partly again.
  assert.match(js, /else if \(data\.classList\.contains\('tool-open'\)\) \{ if \(tab\) \{ dock\.down = want; setFold\(false\); \}/);
  assert.match(js, /else if \(tab && dock\.down === want\) \{ dock\.auto = false; dockTo\(1\); \}/);
  assert.match(js, /dock\.to = to;\n\s*if \(!to\) dock\.down = -1;/, 'opened again, the cycle starts over');
  assert.match(js, /open \? \(tab \? 'Hide the readings' : 'Close the card'\) : tab && dock\.down === want \? 'Close the card' : 'Show the rest of the card'/);
});
