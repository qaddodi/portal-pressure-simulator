// The six-case summary (visual: 'ladders', Sites 10 and Where-resistance 14): each case's Gut to heart chart in its cell, the
// site and the cause on its first row with no HVPG pill (the chart's bracket shows it), and on a phone one line a case with the red
// blocks, the stations named once over the six (Mohammad, 21 Oct).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { causeFit } from '../src/ui/cause-fit.js';
import { DECKS } from '../src/ui/decks.js';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const grid = js.match(/function laddersGrid\(s\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';

test('each cell draws the Gut to heart chart and its one-line strip, with no legend or old ladder', () => {
  assert.match(grid, /const P = createProfileTool\(\), S = createProfileStrip\(\);/);
  assert.match(grid, /P\.configure\(\{ kind: 'profile' \}, \{ fp: r\.f, healthy: \(\) => base \}\);/, 'read against the healthy line, as on every card');
  assert.match(grid, /S\.set\(r\.f, \(\) => base\);/);
  assert.match(grid, /grid\.append\(h\('div', \{ class: 'pz-cell' \}, k, P\.el, S\.el\)\);/);
  assert.doesNotMatch(js, /bigLadder|pz-grid-key|RUNGS|gridOwn|gridNames/);
  assert.doesNotMatch(css, /pz-grid-key|\.pz-cell\.strip|\.pz-grid\.big/);
});

test('the first row names the site and the cause, the cause stepping down to fit, never under 12 px, never wrapped; no HVPG pill', () => {
  assert.match(grid, /const k = h\('div', \{ class: 'pz-cell-k' \}, h\('div', \{ class: 'pz-kick', 'data-site': r\.site \|\| 'none' \}, r\.kicker\.replace\('Intrahepatic · ', ''\)\),\n\s*h\('div', \{ class: 'pz-cell-t' \}, r\.name\)\);/);
  assert.match(grid, /rowRO\?\.observe\(k\);/);
  // (The size and the move under the site come from the measured row: the room the site and the gap leave, the cause's own width, the floor 12 px on the screen.)
  assert.match(js, /const room = k\.clientWidth - tag\.offsetWidth - \(parseFloat\(getComputedStyle\(k\)\.columnGap\) \|\| 0\) - 1;/);
  assert.match(js, /const fit = causeFit\(fs, t\.offsetWidth, room, 12 \/ z\);/);
  assert.match(js, /if \(fit\.size !== fs\) t\.style\.fontSize = `\$\{fit\.size\.toFixed\(2\)\}px`;\n\s*k\.classList\.toggle\('under', fit\.under\);/);
  assert.match(css, /\.pz-cell-k \{ display: flex; align-items: baseline; gap: 0 \.6em; flex-wrap: nowrap; \}/);
  assert.match(css, /\.pz-cell-k \.pz-kick \{ flex: none; white-space: nowrap;/);
  assert.match(css, /\.pz-cell-k \.pz-cell-t \{ flex: none; white-space: nowrap; \}/);
  assert.doesNotMatch(js + css, /pz-cell-pill/);
  assert.doesNotMatch(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell-k \{ display: contents; \}/, 'a phone keeps the one row too');
});

test('a wide screen shows the chart; a phone, upright or sideways, the line, under one row of station names', () => {
  assert.match(css, /\.pz-cell > \.pz-prof \{ flex: 1 1 0; min-height: 0; height: auto; font-size: var\(--ch-cap, 12px\); \}/);
  assert.match(css, /\.pz-pstrip \{ display: none; width: 100%; \}/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell > \.pz-prof \{ display: none; \}/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell > \.pz-pstrip \{ display: block;/);
  assert.match(grid, /h\('div', \{ class: 'pz-grid-head', 'aria-hidden': 'true' \}, createProfileStrip\(true\)\.el, createProfileStrip\(true\)\.el\)/);
  assert.match(css, /\.pz-grid-head \{ display: none; \}/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-grid-head \{ display: grid; grid-column: 1 \/ -1; grid-template-columns: inherit; gap: inherit; \}/);
  // (Each name over its column: the head is as wide as a cell's line, its cell's padding in.)
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-grid-head > \.pz-pstrip \{ display: block; width: auto; margin: 0 12px;/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell \{ display: block; padding: 7px 12px 4px;/);
  assert.match(css, /\.pz\.low \.pz-cell \{ padding: 4px 10px 1px; line-height: 1\.15; \} \.pz\.low \.pz-grid-head > \.pz-pstrip \{ margin: 0 10px; \}/);
  assert.match(css, /\.pz\.stack \.pz-grid-head > :nth-child\(2\) \{ display: none; \}/);
  assert.match(css, /\.pz\.low \.pz-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test('the line shares the chart\'s stations, names, colours and blocks, and is lettered at 12 px or more', () => {
  const strip = prof.slice(prof.indexOf('export function createProfileStrip'));
  assert.match(strip, /const slot = \(w - 10\) \/ STATIONS\.length; return \{ slot, x: \(i\) => slot \* \(i \+ 0\.5\) \};/, 'the names and the lines measure their columns alike');
  assert.match(strip, /const f = Math\.max\(12, parseFloat\(getComputedStyle\(el\)\.fontSize\) \|\| 12\)/);
  assert.match(strip, /const fit = nameFit\(slot, tw\)/);
  assert.match(strip, /blocksOf\(p, hl\)\.map\(/);
  assert.match(strip, /'stop-color': pressureColor\(v\)/);
  assert.match(strip, /x\(i\) \+ hw\[i\] \+ pad\)\.toFixed\(1\)\} \$\{cy\}H\$\{\(x\(i \+ 1\) - hw\[i \+ 1\] - pad\)/, 'the line stops short of each reading');
});

test('a phone\'s line puts each block on its station\'s column, behind the line and the reading, which keeps an outline in the cell\'s colour', () => {
  const strip = prof.slice(prof.indexOf('export function createProfileStrip'));
  assert.match(strip, /const box = \(i\) => blockSpan\(x\(i\), slot, tw\);/, 'the chart\'s own width rule, centred on its column');
  const at = (re) => { const m = strip.search(re); assert.ok(m > 0, String(re)); return m; };
  assert.ok(at(/class: 'ppf-blk'/) < at(/class: 'pps-line'/) && at(/class: 'pps-line'/) < at(/class: 'pps-v'/), 'block, line, readings: back to front');
  assert.match(css, /\.pps-v \{[^}]*paint-order: stroke; stroke: var\(--surface-2\); stroke-width: 4px;/);
});

test('the cause is fitted again when its own width changes (its font loading late), not only the row\'s', () => {
  assert.match(grid, /rowRO\?\.observe\(k\); rowRO\?\.observe\(k\.firstElementChild\); rowRO\?\.observe\(k\.lastElementChild\);/, 'the site\'s own width too: its font loading late');
  assert.match(js, /new ResizeObserver\(\(es\) => es\.forEach\(\(e\) => fitRow\(e\.target\.closest\('\.pz-cell-k'\)\)\)\)/);
});

test('a phone\'s station names carry the sinusoidal brace over Pre-, Intra- and Post-; each line has the three zones\' tints behind its readings', () => {
  const strip = prof.slice(prof.indexOf('export function createProfileStrip'));
  assert.match(strip, /sv\('g', \{ class: 'ppf-brace' \}, sv\('path', \{ d: braceD\(x\(i0\) - 0\.42 \* slot, x\(i1\) \+ 0\.42 \* slot, 0, 0\.55 \* f\), transform: `translate\(0 \$\{ends\.toFixed\(2\)\}\) scale\(1 -1\)` \}\),\n\s*sv\('text', \{ x: \(x\(i0\) \+ x\(i1\)\) \/ 2, y: 0\.95 \* f, 'text-anchor': 'middle' \}, BRACE_NAME\)\)/);
  assert.match(strip, /const fit = nameFit\(slot, tw\), ends = 1\.85 \* f, base = ends \+ 1\.05 \* f,/, 'the names stand under the brace, clear of it');
  // (Drawn first: under the blocks, the line and the numbers. Pre-hepatic: Gut and PV; intrahepatic: the liver's three; post-hepatic: HV, IVC and RA.)
  assert.match(strip, /zoneSpans\(\)\.map\(\(\[a, b\], k\) => sv\('g', \{ class: ZONES\[k\]\.cls \},\n\s*sv\('rect', \{ x: x\(a\) - slot \/ 2 \+ 0\.5, y: 0, width: slot \* \(b - a \+ 1\) - 1, height: hh, rx: 4 \}\)\)\),\n(\s*\/\/[^\n]*\n)*\s*blocksOf\(p, hl\)/);
  assert.match(css, /\.ppf-liver rect \{ fill: var\(--chart-liver-band\); \}/);
  assert.match(css, /\.ppf-pre rect \{ fill: var\(--chart-pre-band\); \}/);
  assert.match(css, /\.ppf-post rect \{ fill: var\(--chart-post-band\); \}/);
});

test('Sites 10 has no line over the grid (Mohammad, 21 Oct: "get rid of that sentence above everything")', () => {
  const sites = readFileSync(new URL('../src/ui/decks/sites.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sites, /HVPG reads only the drop across the sinusoids/);
});

test('causeFit: a cause that fits stays, one a little wide steps down in proportion, one that cannot fit at 12 px goes under the site, none grows', () => {
  assert.deepEqual(causeFit(13.85, 150, 180, 12), { size: 13.85, under: false });
  const a = causeFit(13.85, 190, 180, 12);
  assert.ok(Math.abs(a.size - 13.85 * 180 / 190) < 1e-9 && !a.under, '5% over: 5% down');
  assert.deepEqual(causeFit(14, 140, 120, 12), { size: 12, under: false }, 'it fills the room exactly at the floor');
  assert.deepEqual(causeFit(13.85, 223, 179, 12), { size: 12, under: true }, 'never under the floor: it moves under the site instead');
  assert.deepEqual(causeFit(12, 200, 150, 13.8), { size: 12, under: true }, 'a floor above its size never makes it larger');
});

test('on an iPhone, "Sinusoidal obstruction syndrome" cannot share a row with POSTSINUSOIDAL at 12 px; "Sinusoidal obstr. synd." can', () => {
  // (Widths worked out from the font files, Source Serif 4 at 600 for the cause and Inter at 600 with the card's letter-spacing for the
  // site, within about 3 % of the browser's, which kerns: the card's row is the screen's width less 77 px, its site 134 px wide at
  // 13.8 px, the gap .6em. The site shares the row, so the cause has the row less the site, not the whole row.)
  const room = (screen) => screen - 77 - 134 - 8.3 - 1;
  const FULL = [223.2, 197.7], SHORT = [153.1, 135.5];   // (px at 13.85 and at 12)
  for (const screen of [375, 390, 402, 430]) {
    const r = room(screen), full = causeFit(13.85, FULL[0], r, 12), short = causeFit(13.85, SHORT[0], r, 12);
    assert.ok(screen >= 430 || full.under, `the full name does not fit on ${screen} px`);
    assert.ok(!short.under && SHORT[1] < r, `the short name fits on ${screen} px, with ${(r - SHORT[1]).toFixed(0)} px to spare at 12 px`);
  }
  assert.ok(causeFit(13.85, SHORT[0], room(320), 12).under, 'a 320 px screen puts it under the site, whole, rather than past the card edge');
});

test('Sites 10 and Where-resistance 14 name sinusoidal obstruction syndrome short on the grid; its slide and the table keep the full name', () => {
  const SHORT = 'Sinusoidal obstr. synd.';
  const deck = (id) => DECKS.find((d) => d.id === id), slide = (d, id) => d.slides.find((x) => x.id === id);
  for (const [d, row] of [['sites', 'postsin'], ['where-resistance', 'a4']]) {
    const grid = slide(deck(d), 'ladders'), table = slide(deck(d), 'summary');
    assert.equal(grid.of.find((o) => o.id === row)?.name, SHORT, `${d} grid`);
    assert.equal(table.of.find((o) => o.id === row)?.name, SHORT, `${d} table rows carry it too (its column shows the title)`);
    assert.doesNotMatch(SHORT, /…|\.\.\./);
  }
  assert.equal(slide(deck('sites'), 'postsin').title, 'Sinusoidal obstruction syndrome');
  assert.match(css, /\.pz-cell-k\.under \{ flex-wrap: wrap; \}/);
});
