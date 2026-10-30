// A data card with nothing to tuck behind its instrument is the instrument alone: no readings card, no handle (Mohammad, 29 Oct,
// Varices 3 on a Mac: the stacked look and a handle that opened nothing). Run over every talk, so a slide like it anywhere gets the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { tileKeys, toolOnly } from '../src/ui/card-tiles.js';

const cards = DECKS.flatMap((d) => withOverview(d).slides.map((s, i) => ({ d, s, at: `${d.id}/${s.id} (slide ${i + 1})` }))).filter(({ s }) => !s.visual && s.tool);

test('Varices 3: the endoscopic view stands behind the chart; its tiles are the chart\'s own two lines, so on a laptop or tablet the card is the chart alone, and on a phone it keeps its readings', () => {
  const s = DECKS.find((d) => d.id === 'varices').slides.find((x) => x.id === 'lapse');
  assert.equal(s.tool.kind, 'flowtime');
  assert.deepEqual(tileKeys(s, false), ['scope'], 'the chart already shows both numbers; the endoscopic view is what stands behind it');
  assert.equal(toolOnly(s, false), false, 'the endoscopic view is real content to tuck: the handle opens it');
  assert.deepEqual(tileKeys(s, true), ['hvpg', 'varix', 'scope']);
  assert.equal(toolOnly(s, true), false, 'a phone shows the chart without its numbers, so the readings stay behind it');
});

test('a card stacks only when readings stand behind its instrument, on every screen, in every talk', () => {
  assert.ok(cards.length > 100);
  const bad = [];
  for (const { s, at } of cards) {
    for (const phone of [false, true]) {
      const readings = !!s.data && tileKeys(s, phone).length > 0;
      if (toolOnly(s, phone) === readings) bad.push(`${at} phone=${phone}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('an instrument with no data card is the instrument alone, and one with tiles is not', () => {
  assert.equal(toolOnly({ tool: { kind: 'doppler' } }, false), true);
  assert.equal(toolOnly({ tool: { kind: 'doppler' }, data: 'tiles', tiles: ['hvpg'] }, false), false);
  assert.equal(toolOnly({ tool: { kind: 'doppler' }, data: 'tiles', tiles: [] }, false), true, 'an empty list of tiles holds nothing');
  assert.equal(toolOnly({ tool: { kind: 'doppler' }, data: 'tiles' }, true), true);
  assert.equal(toolOnly({ tool: { kind: 'hvpg' }, data: 'tiles', hvpgResp: true }, false), false, 'the response tile is one');
  assert.equal(toolOnly({ data: 'tiles', tiles: ['hvpg'] }, false), false, 'no instrument: a tiles card');
});

test('the card is built tool-only from it, and a card that is not a sheet shows no handle', () => {
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(js, /data\.classList\.toggle\('tool-only', toolOnly\(s, phone\(\)\)\);/);
  assert.match(js, /lip\.hidden = data\.hidden \|\| !data\.classList\.contains\('pz-sheet'\);/, 'and only a stack has a handle');
});
