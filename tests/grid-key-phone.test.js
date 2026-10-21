// The six-case summary (visual: 'ladders', Sites 10 and Where-resistance 14): each case's Gut to heart chart in its cell, the
// healthy line named on each chart (no legend under the grid), and on a phone the station names only under the bottom row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const grid = js.match(/function laddersGrid\(s\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';

test('each cell draws the Gut to heart chart, with no legend, names row or strip of its own', () => {
  assert.match(grid, /const P = createProfileTool\(\);/);
  assert.match(grid, /P\.configure\(\{ kind: 'profile', names: gridNames, own: gridOwn \}, \{ fp: r\.f, healthy: \(\) => base \}\);/, 'read against the healthy line, as on every card');
  assert.match(grid, /h\('div', \{ class: 'pz-cell-t' \}, r\.title\), P\.el\);/);
  assert.doesNotMatch(js, /bigLadder|pz-grid-key|pz-grid-head|RUNGS/);
  assert.doesNotMatch(css, /pz-grid-key|pz-grid-head|\.pz-cell\.strip|\.pz-grid\.big/);
});

test('a wide screen\'s cell gives its chart the room under the title; a phone\'s chart is as tall as it needs', () => {
  assert.match(css, /\.pz-cell > \.pz-prof \{ flex: 1 1 0; min-height: 0; height: auto; font-size: var\(--ch-cap, 12px\); \}/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell > \.pz-prof \{ display: block; flex: none; margin-top: 4px; \}/);
  assert.match(js, /const gridOwn = \(el\) => !!el\.closest\('\.pz\.stack, \.pz\.low'\);/);
  // (own: the chart's height is the need of its own layout, set before it is drawn, so the cell never clips it.)
  assert.match(prof, /hh = Math\.ceil\(profileGeo\(w, 0, f, tw, false, nm\)\.need\);\n\s*if \(el\.style\.height !== `\$\{hh\}px`\) el\.style\.height = `\$\{hh\}px`;/);
  assert.match(prof, /\} else if \(el\.style\.height\) el\.style\.removeProperty\('height'\);/, 'turned to a wide screen, the cell sizes it again');
});

test('on a phone only the bottom row names the stations, the rows above sharing them', () => {
  assert.match(js, /return !gridOwn\(el\) \|\| !c \|\| c\.offsetTop >= last\.offsetTop - 2;/);
  assert.match(prof, /const T = 1\.5 \* f, nameH = names \? fit\.rows \* 1\.25 \* f \+ 0\.4 \* f : 0;/);
  assert.match(prof, /const braceH = names \? 1\.85 \* f : 0;/);
  assert.match(prof, /!nm \? null : STATIONS\.map\(/, 'no names under a chart that shares them');
  assert.match(prof, /nm && i0 >= 0 \? sv\('g', \{ class: 'ppf-brace' \}/, 'nor the brace');
  assert.match(prof, /nm \? sv\('text', \{ class: 'ptk-unit'/, 'nor the unit');
  assert.match(prof, /if \(!plan \|\| stale \|\| plan\.nm !== nm\) \{/, 'a chart that gains or loses its names is laid out again');
});

test('every tile shows its HVPG as a nowrap pill at the top right, beside the site tag, as its chart\'s bracket reads it', () => {
  assert.match(css, /\.pz-cell-k \{ display: flex; align-items: center; justify-content: space-between;[^}]*flex-wrap: nowrap;/);
  assert.match(css, /\.pz-cell-pill \{ flex: none; margin-left: auto;[^}]*white-space: nowrap;/);
  // (The chart's bracket rounds the true HVPG, Mohammad's pick: the pill reads the same number.)
  assert.match(grid, /const hv = Math\.round\(r\.f\.hvpg\);/);
  assert.match(grid, /h\('span', \{ class: 'pz-cell-pill', 'data-rate': rateOf\('hvpg', \{ hvpg: hv \}\)\[0\] \}, 'HVPG ', h\('b', \{\}, String\(hv\)\)\)/);
  assert.match(prof, /const v = shown\[k\], rate = RATE\[k\]\(v\)\[0\];/);
  assert.match(prof, /export const whole = \(v\) => String\(Math\.round\(v\)\);/);
});
