import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCALE, TILE, RATE, bandsOf, rateOf } from '../src/ui/table-marks.js';

// Each data card tile's scale bar (layout A): its bands take the tile's own rating, so the bar and the status word agree.
const bandRates = (k) => bandsOf(k).map((z) => rateOf(k, { asc: 1e4, [k]: z.m })[0] || 'info');

test('every rated tile has a scale, with its cut-offs in order inside it', () => {
  for (const k of Object.keys(RATE)) assert.ok(SCALE[k], `${k} has no scale`);
  for (const [k, [a, b, cuts]] of Object.entries(SCALE)) {
    assert.ok(TILE[k], `${k} is a tile`);
    assert.ok(a < b, k);
    cuts.forEach((c, i) => assert.ok(c > a && c < b && (i === 0 || c > cuts[i - 1]), `${k} cut-off ${c}`));
  }
});

test('the bands follow the ratings (Baveno VIII stiffness, platelets lower is worse)', () => {
  assert.deepEqual(bandRates('hvpg'), ['ok', 'mid', 'hi']);
  assert.deepEqual(bandRates('ppg'), ['ok', 'mid', 'hi']);
  assert.deepEqual(bandRates('lsm'), ['ok', 'mid', 'mid', 'hi']);
  assert.deepEqual(bandRates('plt'), ['hi', 'mid', 'ok']);
  assert.deepEqual(bandRates('asc'), ['ok', 'mid', 'hi', 'hi']);   // (litres shown, millilitres rated)
  assert.deepEqual(bandRates('hr'), ['info', 'ok', 'hi']);          // (slow is gray: a beta-blocked rate is the goal)
  assert.deepEqual(bandRates('shunt'), ['ok', 'mid', 'hi']);       // (percent shown, a fraction rated)
});

test('the bar takes the change line\'s place, so a tile never grows for it', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-tile:has\(\.pzb-was:not\(\[hidden\]\)\) \.pzt-d \{ display: none; \}/);
  assert.match(css, /\.pz-tile \.pzt-bar \{[^}]*height: calc\(/, 'the bar has a fixed height');
  assert.match(css, /\.pzt-bar\.empty \{ visibility: hidden; \}/, 'a tile with no scale keeps the room, so a row stays one height');
});
