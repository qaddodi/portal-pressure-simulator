// A tap on the Lobule picks the vessel drawn on top where it lands (lobule-pick.js): with Wet Disse the space of Disse wraps its sinusoid,
// and a tap in the sinusoid picked the lymph (Mohammad, 16 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRank, tierOf } from '../src/ui/lobule-pick.js';

// Depths as the lobule draws them (lobule-zoom-field.js Z_OF): the sleeve of Disse under the sinusoids, the twig over them.
const Z = { s0: 0.1, ly: 0.05, tw: 0.2, in: 0.3, lt: 0.25 };
const rank = (c) => pickRank(c.d, c.r, Z[c.k], c.bias, tierOf(c.k));
const best = (cands) => cands.reduce((a, c) => (rank(c) < rank(a) ? c : a));

test('inside a sinusoid the sinusoid wins over the sleeve that wraps it', () => {
  // the same axis: the sinusoid 2 wide, the sleeve 5; the tap 1 from the axis (in the lumen)
  assert.equal(best([{ k: 'ly', d: 1, r: 5 }, { k: 's0', d: 1, r: 2 }]).k, 's0');
  assert.equal(best([{ k: 's0', d: 0, r: 2 }, { k: 'ly', d: 0, r: 5 }]).k, 's0');
});

test('in the band outside the wall the sleeve wins', () => {
  assert.equal(best([{ k: 'ly', d: 3.5, r: 5 }, { k: 's0', d: 3.5, r: 2 }]).k, 'ly');
});

test('a vessel drawn over another wins where they cross; off every vessel the nearest edge wins', () => {
  assert.equal(best([{ k: 's0', d: 0.5, r: 2 }, { k: 'tw', d: 0.3, r: 0.8, bias: 2 }]).k, 'tw');
  assert.equal(best([{ k: 's0', d: 4, r: 2 }, { k: 'in', d: 9, r: 3 }]).k, 's0');
  assert.equal(best([{ k: 'ly', d: 7, r: 5 }, { k: 'in', d: 4, r: 3 }]).k, 'in');
});

test('the lymph is drawn in a tier under every blood vessel, so the sinusoid keeps its own wall line over its sleeve', () => {
  for (const l of ['ly', 'lt', 'lv']) for (const k of ['s0', 's1', 's2', 'an', 'in', 'tw', 'pv', 'cv', 'ha', 'bd', 'sh']) assert.ok(tierOf(l) < tierOf(k), `${l} under ${k}`);
  // vessels that join one another share a tier, so no line crosses their join: sinusoids at every anastomosis, the sleeve where it drains into the terminal lymphatic
  assert.equal(tierOf('s0'), tierOf('s1')); assert.equal(tierOf('s1'), tierOf('s2')); assert.equal(tierOf('s0'), tierOf('an'));
  assert.equal(tierOf('ly'), tierOf('lt')); assert.equal(tierOf('lt'), tierOf('lv'));
});
