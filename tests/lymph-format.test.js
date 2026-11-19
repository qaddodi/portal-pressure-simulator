// The hepatic lymph prints one way everywhere (16 Nov 2026, play-test T06: the Lobule tile's hover said "Normal is about 860 mL/day" where a
// healthy patient settles at about 1,320, and the tile printed "1320" beside labels that print "1,320" and round to 10):
//   1. a mL/day number of a thousand or more takes its comma wherever it is printed (the dock's tiles, the compare card, the beat strip, the
//      fluid tool's words, the explain sentences);
//   2. the lymph tile's "normal" is the healthy patient's lymph from the model, printed as the tile prints it, never a typed number;
//   3. the tile's ticks are the model's too (1.5 times healthy; the lymphatics' healthy capacity).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOBULE_TILES, TILES } from '../src/ui/dock.js';
import { fmtG } from '../src/ui/num.js';
import { lymphText, lymphDay, LYMPH_UNIT } from '../src/ui/lymph-day.js';
import { fluidWords } from '../src/ui/tool-fluid.js';
import { LYMPH } from '../src/engine/portal/lymph.js';
import { runSteps } from './deck-states.js';

const tile = LOBULE_TILES.find((t) => t.id === 'lz-ly');
const frame = (fp) => ({ Q: fp.at.Q, metrics: { ascites: { hepLymph: fp.hepLymph } } });

test('fmtG groups thousands and leaves everything else as fmt prints it', () => {
  assert.equal(fmtG(1320, 0), '1,320');
  assert.equal(fmtG(14400, 0), '14,400');
  assert.equal(fmtG(1234567, 0), '1,234,567');
  assert.equal(fmtG(860, 0), '860');
  assert.equal(fmtG(12.34, 1), '12.3');
  assert.equal(fmtG(-1320, 0), '−1,320');
  assert.equal(fmtG(-860, 0), '−860');
});

test('the lymph tile counts in grouped numbers, as its labels print them', () => {
  assert.equal(tile.g, true);
  assert.equal(tile.u, LYMPH_UNIT);
  assert.equal(fmtG(lymphDay(0.917), 0), lymphText(0.917), 'the tile and the lobule label print the same text');
});

test('every whole-number tile that can reach a thousand groups it', () => {
  for (const t of [...TILES, ...LOBULE_TILES]) {
    if (t.d === 0 && t.scale && Math.max(...t.scale) >= 1000) assert.equal(t.g, true, `${t.id} counts to ${Math.max(...t.scale)}: it takes the comma`);
  }
});

test('the lymph tile\'s hover text reads "normal" from the healthy patient, as the tile prints it', async () => {
  const [healthy, cirr] = await runSteps([{ preset: 'healthy' }, { preset: 'cirr-decomp' }]);
  const f = frame(healthy), st = { healthy: f };
  const want = lymphText(healthy.hepLymph);
  assert.match(want, /^1,[23]\d0$/, `healthy settles at ${want} mL/day`);
  assert.doesNotMatch(tile.title, /\d/, 'the fixed title carries no typed number');
  assert.equal(tile.titleOf(f, st).includes(`Normal is about ${want} ${LYMPH_UNIT}`), true, tile.titleOf(f, st));
  assert.doesNotMatch(tile.titleOf(f, st), /860/);
  assert.equal(tile.titleOf(frame(cirr), st).includes(`Normal is about ${want} ${LYMPH_UNIT}`), true, 'a sicker patient still reads the healthy patient\'s lymph');
});

test('the lymph tile\'s ticks and scale are the model\'s', async () => {
  const [healthy] = await runSteps([{ preset: 'healthy' }]);
  const day = healthy.hepLymph * 1440;
  assert.ok(Math.abs(tile.ticks[0] / (1.5 * day) - 1) < 0.02, `the High tick ${tile.ticks[0]} is 1.5 times healthy (${(1.5 * day).toFixed(0)})`);
  assert.equal(tile.ticks[1], LYMPH.base * 1440);
  assert.equal(tile.scale[1], LYMPH.max * 1440);
});

test('the fluid tool groups a daily volume', () => {
  assert.equal(fluidWords({ perDay: 1320, net: 1, over: 1 }), 'Ascites accumulates at about 1,320 mL/day.');
  assert.equal(fluidWords({ perDay: -2480, net: -1, over: 1 }), 'Ascites decreases by about 2,480 mL/day.');
  assert.equal(fluidWords({ perDay: 480, net: 1, over: 1 }), 'Ascites accumulates at about 480 mL/day.');
});
