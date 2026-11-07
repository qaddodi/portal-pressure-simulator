// An instrument card is one fixed card: no readings card tucks behind it or comes out, no handle (Mohammad, 7 Nov 2026: "get rid of tucking
// untucking card, and implement T3"). Its readings are numbers only in the header row beside its name: a rating dot, the short name, the
// number and its unit. Run over every talk, so a slide like it anywhere gets the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { tileKeys, toolOnly, headKeys } from '../src/ui/card-tiles.js';
import { tileOf } from '../src/ui/table-marks.js';
import { scopeLensFor } from '../src/ui/scope-lens-rule.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const cards = DECKS.flatMap((d) => withOverview(d).slides.map((s, i) => ({ s, at: `${d.id}/${s.id} (slide ${i + 1})` }))).filter(({ s }) => !s.visual && s.tool);

test('every slide with an instrument is an instrument card, on every screen: nothing stands behind it to tuck', () => {
  assert.ok(cards.length > 100);
  for (const { s } of cards) assert.equal(toolOnly(s), true);
  assert.equal(toolOnly({ data: 'tiles', tiles: ['hvpg'] }), false, 'no instrument: a tiles card, as before');
  assert.match(src('presenter.js'), /data\.classList\.toggle\('tool-only', toolOnly\(s\)\);/);
});

test('Varices 3: the chart\'s tiles are its own two lines, so a laptop or tablet shows none beside the name, a phone shows both, and the endoscopic view is the scope ring on the figure', () => {
  const s = DECKS.find((d) => d.id === 'varices').slides.find((x) => x.id === 'lapse');
  assert.equal(s.tool.kind, 'flowtime');
  assert.deepEqual(headKeys(s, false), [], 'the chart already shows both numbers');
  assert.deepEqual(headKeys(s, true), ['hvpg', 'varix']);
  assert.equal(scopeLensFor(s), true);
});

test('its readings stand in the header row: the tiles but for the endoscopic view, at most four, each with a short name and a unit to show', () => {
  const bad = [];
  let some = 0;
  for (const { s, at } of cards) {
    for (const phone of [false, true]) {
      const ks = headKeys(s, phone);
      if (!s.data) { if (ks.length) bad.push(`${at}: readings without a data card`); continue; }
      if (ks.includes('scope')) bad.push(`${at}: the scope picture is no reading`);
      if (ks.length > 4) bad.push(`${at}: ${ks.length} readings do not fit a header`);
      if (ks.length !== tileKeys(s, phone).filter((k) => k !== 'scope').length) bad.push(`${at}: lost a reading`);
      for (const k of ks) if (!tileOf(k)) bad.push(`${at}: no tile ${k}`);
      some += ks.length;
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(some > 200, 'most instrument cards have readings');
});

test('the tiles build the header readings from the same values, numbers as GPU words, and the card has no handle, fold key or wheel pull', () => {
  const js = src('presenter.js');
  assert.match(js, /const head = h\('span', \{ class: 'pz-hr', 'data-n': '0' \}\);/);
  assert.match(js, /h\('div', \{ class: 'pz-dh' \}, dhT, tiles\.head, fold, zbtn\)/, 'the readings sit in the header row, after the name');
  assert.match(js, /const hw = hi \? glWords\(hv\) : null;/, 'the number is GPU words');
  assert.match(js, /else if \(sync\) p\.hw\.now\(hs\); else p\.hw\.set\(hs\);|if \(!p\.hw\) setT\(p\.hv, hs\); else if \(sync\) p\.hw\.now\(hs\); else p\.hw\.set\(hs\);/);
  assert.match(js, /else ui\.tiles\.paintTiles\(now\.fp, \[\], \[\], null, 0, false\);/, 'a card with no readings clears the last slide\'s');
  assert.doesNotMatch(js, /stackFold/, 'no key or wheel works a readings card');
  assert.doesNotMatch(js, /k === 'ArrowUp' \|\| k === 'ArrowDown'\) \{ if \(!e\.repeat\)/);
  assert.doesNotMatch(src('main.js'), /tuck the readings/, 'the Guide lists no such key');
});

test('the header\'s readings are laid beside the name by styles alone: a dot rated like the tile, units dropped at three or more on a phone', () => {
  assert.match(css, /\.pz-hr \{ display: none; \}/);
  assert.match(css, /\.pz \.pz-data\.has-tool > \.pz-dh:has\(> \.pz-hr:not\(\[data-n="0"\]\)\) \{[^}]*justify-content: space-between;/);
  assert.match(css, /\.pz-hi\[data-rate="hi"\] > i \{ background: var\(--danger\); \}/);
  assert.match(css, /\.pz\.stack \.pz-hr:is\(\[data-n="3"\], \[data-n="4"\]\) \.pz-hi > small \{ display: none; \}/);
  const block = css.slice(css.indexOf('.pz-hr { display: none; }'));
  assert.doesNotMatch(block, /backdrop-filter|filter:|animation|transition/, 'no new glass or painted motion: the card\'s own glass holds them');
});
