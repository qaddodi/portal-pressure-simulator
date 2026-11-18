// The relative arrow for ascites follows the grade, not its own ratio (16 Nov 2026: Two lesions' summary printed ↑↑ for 238 mL against a base
// with none, a grade-1 amount on ultrasound). One arrow is a change below the moderate grade (1500 mL); two arrows need a value that reaches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { dirRel, ASC_G2 } from '../src/ui/table-marks.js';
import { TWO_LESIONS as D } from '../src/ui/decks/two-lesions.js';
import { deckStates } from './deck-states.js';

const rel = (a, b) => dirRel('asc', { asc: a }, { asc: b });

test('ascites arrows: a small gain is one arrow, only a moderate or tense belly is two, a trivial change is none', () => {
  assert.equal(ASC_G2, 1500);
  assert.equal(rel(238, 0), 1);
  assert.equal(rel(600, 0), 1);
  assert.equal(rel(100, 0), 0);
  assert.equal(rel(1449, 0), 1);
  assert.equal(rel(1600, 0), 2);
  assert.equal(rel(7618, 238), 2);
  assert.equal(rel(0, 238), -1);
  assert.equal(rel(0, 7618), -2);
  assert.equal(rel(1600, 7000), -2);
});

// (Lymph model, 16 Nov 2026: ascites is the lymph made beyond the lymphatics' capacity. The clot's liver makes less lymph than the lymphatics carry,
// so "Cirrhosis and clot" has none, as the cirrhosis row has none: no arrow. Congestion past the capacity gives a tense belly: two.)
test('Two lesions: "Cirrhosis and clot" has no more ascites than the cirrhosis row and shows no arrow; congestion with it shows two', async () => {
  const fps = await deckStates(D), at = (id) => fps[D.slides.findIndex((s) => s.id === id)];
  const base = at('base'), clot = at('clot'), both = at('both');
  assert.ok(clot.asc < ASC_G2, `clot ascites ${clot.asc.toFixed(0)} mL is below the moderate grade`);
  assert.equal(dirRel('asc', clot, base), 0);
  assert.equal(dirRel('asc', both, base), 2);
});
