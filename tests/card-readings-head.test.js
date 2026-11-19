// An instrument card is one fixed card: no readings card tucks behind it or comes out, no handle (Mohammad, 7 Nov 2026: "get rid of tucking
// untucking card, and implement T3"). Its readings are numbers only in the header row beside its name: a rating dot, the short name, the
// number and its unit. Run over every talk, so a slide like it anywhere gets the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { tileKeys, toolOnly, headKeys, shownBy } from '../src/ui/card-tiles.js';
import { tileOf } from '../src/ui/table-marks.js';
import { scopeLensFor } from '../src/ui/scope-lens-rule.js';

const cards = DECKS.flatMap((d) => withOverview(d).slides.map((s, i) => ({ s, at: `${d.id}/${s.id} (slide ${i + 1})` }))).filter(({ s }) => !s.visual && s.tool);

test('every slide with an instrument is an instrument card, on every screen: nothing stands behind it to tuck', () => {
  assert.ok(cards.length > 100);
  for (const { s } of cards) assert.equal(toolOnly(s), true);
  assert.equal(toolOnly({ data: 'tiles', tiles: ['hvpg'] }), false, 'no instrument: a tiles card, as before');
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

test('an instrument that already shows a number large never repeats it in the header (FibroScan its stiffness, the monitor its vitals)', () => {
  const liver = { tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt', 'hvpg'] };
  const spleen = { tool: { kind: 'fibroscan', organ: 'spleen' }, data: 'tiles', tiles: ['ssm', 'lsm', 'hvpg'] };
  for (const phone of [false, true]) {
    assert.deepEqual(headKeys(liver, phone), ['plt', 'hvpg'], 'the liver scan shows its kPa large: no stiffness above it');
    assert.deepEqual(headKeys(spleen, phone), ['lsm', 'hvpg'], 'the spleen probe shows the spleen\'s kPa; the liver\'s is a different number and stays');
    assert.deepEqual(headKeys({ tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm'] }, phone), [], 'nothing left: no readings row');
  }
  assert.deepEqual(headKeys({ tool: { kind: 'vitals', show: ['hr', 'map'] }, data: 'tiles', tiles: ['hr', 'map', 'co'] }, false), ['co']);
  const bad = [];
  for (const { s, at } of cards) for (const k of shownBy(s)) for (const phone of [false, true]) if (headKeys(s, phone).includes(k)) bad.push(`${at}: ${k} repeated`);
  assert.deepEqual(bad, []);
  assert.ok(cards.some(({ s }) => shownBy(s).length && (s.tiles || []).some((k) => shownBy(s).includes(k))), 'some real slide had one');
});

