import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutDp, SCALE } from '../src/ui/table-marks.js';
import './dom-shim.js';
const { fmt } = await import('../src/ui/util.js');

// Tile, menu and number polish, 31 Oct (the "Polish tiles, cards and tables" sprint thread).
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = src('styles/app.css'), presenter = src('src/ui/presenter.js'), menu = src('src/ui/menu.js'), dock = src('src/ui/dock.js');

test('a scale bar prints every cut-off with the decimals it has', () => {
  assert.equal(fmt(0.15, cutDp(0.15)), '0.15');
  assert.equal(fmt(0.45, cutDp(0.45)), '0.45');
  assert.equal(fmt(2.5, cutDp(2.5)), '2.5');
  assert.equal(fmt(1.1, cutDp(1.1)), '1.1');
  assert.equal(fmt(10, cutDp(10)), '10');
  assert.equal(fmt(0, cutDp(0)), '0');
  // every cut-off on every bar reads back as the number it is (none rounds to a different one)
  for (const [k, [, , cuts]] of Object.entries(SCALE)) for (const c of cuts) assert.equal(+fmt(c, cutDp(c)).replace('−', '-'), c, `${k} ${c}`);
  assert.match(presenter, /fmt\(c, cutDp\(c\)\)/);
});

test('a percent tile sits its unit against the number, and the High word is mixed with the text as the amber word is', () => {
  assert.match(presenter, /class: 'pzt-vu' \+ \(T\.u === '%' \? ' pct' : ''\)/);
  assert.match(css, /\.pz \.pz-data \.pz-tiles \.pz-tile \.pzt-vu\.pct\.pct \{ column-gap: \.06em; \}/);
  assert.match(css, /\.pz-tile\[data-rate="hi"\] \.pzt-r \{ color: color-mix\(in srgb, var\(--danger\) 85%, var\(--text\)\); \}/);
});

test('the patient preview prints its gradients to one decimal and rates the number it prints', () => {
  assert.match(menu, /const one = \(v\) => fmt\(v, 1\);/);
  assert.match(menu, /sev\(HVPG_CUTS, shownOf\(s\.hvpg\)\)/);
  assert.match(menu, /sev\(PPG_CUTS, shownOf\(fp\.ppg\)\)/);
  assert.doesNotMatch(menu, /toFixed\(v < 10/);
});

test('the instrument chips agree with the tiles (the breath-averaged velocity, one decimal of stiffness)', () => {
  assert.match(dock, /pvVelMean \?\? f\.metrics\.pvVel/);
  assert.match(dock, /fmt\(f\.metrics\.lsm, 1\)\} kPa/);
});

test('About the model lists its cut-offs the way the tiles and decks write them, with no value between two bands', () => {
  const a = dock.indexOf('export const CUTOFFS = ['), rows = dock.slice(a, dock.indexOf('];', a));
  const cells = [...rows.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  for (const c of cells) {
    assert.doesNotMatch(c, /[<>≤≥] /, `a symbol sits hard against its number: ${c}`);
    assert.doesNotMatch(c, / %/, `no space before a percent: ${c}`);
    assert.doesNotMatch(c, /\d–\d/, `a range says "to": ${c}`);
  }
  for (const c of ['5 to 9.9 (subclinical)', '6 to 11.9', '10.1 to 14.9', '13.1 to 16 cm']) assert.ok(cells.includes(c), c);
});

test('a toggle row in a menu is a plain row with a switch, not a card with a ring', () => {
  assert.match(css, /\.lens-opt \{ grid-template-columns: var\(--ic-s\) 1fr; column-gap: 12px; align-items: center; margin: 0; padding: 8px 12px; border: 0; background: transparent; \}/);
  assert.match(css, /\.lens-opt\.on \{ box-shadow: none; background: transparent; \}/);
  assert.match(css, /\.lens-opt:hover, \.lens-opt\.on:hover \{ background: var\(--surface-2\); \}/);
  assert.match(css, /\.menu-item:focus-visible, \.lens-opt:focus-visible \{ outline-offset: -2px; \}/);
  assert.doesNotMatch(css, /\.blood-pop \.menu-title \{ text-align: center; \}/);
});

test('the iPhone full-screen hint and the text-size letters use the type scale', () => {
  assert.match(css, /\.fs-hint \{ display: block; padding: 4px 12px 8px; font-size: var\(--fs-12\);/);
  assert.match(css, /\.text-size \.ts-sm \{ font-size: var\(--fs-12\); \} \.text-size \.ts-lg \{ font-size: var\(--fs-20\); \}/);
  assert.doesNotMatch(css, /max\(9px, calc\(var\(--s-cap\) \* \.75\)\)/, 'the site pill never drops under 12 px');
});

test('no stale "Measure" call to action on the bar\'s tile, which is not a button', () => {
  assert.doesNotMatch(css, /\.metric \.status\.unmeas::after \{ content: 'Measure'/);
});
