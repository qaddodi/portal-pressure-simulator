// The six-case summary (visual: 'ladders', Sites 10 and Where-resistance 14): each case's Gut to heart chart in its cell, the
// site and the cause on its first row with no HVPG pill (the chart's bracket shows it), and on a phone one line a case with the red
// blocks, the stations named once over the six (Mohammad, 21 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.match(grid, /const k = h\('div', \{ class: 'pz-cell-k' \}, h\('div', \{ class: 'pz-kick', 'data-site': r\.site \|\| 'none' \}, r\.kicker\.replace\('Intrahepatic · ', ''\)\),\n\s*h\('div', \{ class: 'pz-cell-t' \}, r\.title\)\);/);
  assert.match(grid, /rowRO\?\.observe\(k\);/);
  assert.match(js, /if \(over > 0\.5 && t\.offsetWidth\) t\.style\.fontSize = `\$\{Math\.max\(12, fs \* \(t\.offsetWidth - over\) \/ t\.offsetWidth\)\.toFixed\(2\)\}px`;/);
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

test('the cause is fitted again when its own width changes (its font loading late), not only the row\'s', () => {
  assert.match(grid, /rowRO\?\.observe\(k\); rowRO\?\.observe\(k\.lastElementChild\);/);
  assert.match(js, /new ResizeObserver\(\(es\) => es\.forEach\(\(e\) => fitRow\(e\.target\.closest\('\.pz-cell-k'\)\)\)\)/);
});

test('a phone\'s station names carry the sinusoidal brace over Pre-, Intra- and Post-; each line has the LIVER tint behind those three readings', () => {
  const strip = prof.slice(prof.indexOf('export function createProfileStrip'));
  assert.match(strip, /sv\('g', \{ class: 'ppf-brace' \}, sv\('path', \{ d: braceD\(x\(i0\) - 0\.42 \* slot, x\(i1\) \+ 0\.42 \* slot, 0, 0\.55 \* f\), transform: `translate\(0 \$\{ends\.toFixed\(2\)\}\) scale\(1 -1\)` \}\),\n\s*sv\('text', \{ x: \(x\(i0\) \+ x\(i1\)\) \/ 2, y: 0\.95 \* f, 'text-anchor': 'middle' \}, BRACE_NAME\)\)/);
  assert.match(strip, /const fit = nameFit\(slot, tw\), ends = 1\.85 \* f, base = ends \+ 1\.05 \* f,/, 'the names stand under the brace, clear of it');
  // (Drawn first: under the blocks, the line and the numbers.)
  assert.match(strip, /i0 >= 0 \? sv\('g', \{ class: 'ppf-liver' \}, sv\('rect', \{ x: x\(i0\) - slot \/ 2, y: 0, width: slot \* \(i1 - i0 \+ 1\), height: hh, rx: 4 \}\)\) : null,\n(\s*\/\/[^\n]*\n)*\s*blocksOf\(p, hl\)/);
  assert.match(css, /\.ppf-liver rect \{ fill: var\(--chart-liver-band\); \}/);
});

test('Sites 10 has no line over the grid (Mohammad, 21 Oct: "get rid of that sentence above everything")', () => {
  const sites = readFileSync(new URL('../src/ui/decks/sites.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sites, /HVPG reads only the drop across the sinusoids/);
});
