// A summary table's rows are one state each, and the same one for every row: the case as it presents, before the treatment in its
// Choice column (16 Nov 2026: Choose the treatment mixed the post-TIPS state, a recovered clot row of dashes and a bleed row with ascites its
// case never had). The rows come from the model, and the same patients are the rings of the relation chart just before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHOOSE_TREATMENT as D } from '../src/ui/decks/choose-treatment.js';
import { deckStates, runSteps } from './deck-states.js';

const table = D.slides.find((s) => s.id === 'summary'), rel = D.slides.find((s) => s.id === 'relation');
const patient = (o) => ({ preset: o.preset, params: o.params, relax: o.relax });

test('every case row of the summary is its patient before treatment, the same patient as its ring on the relation chart', () => {
  const cases = table.of.filter((o) => !o.ref);
  assert.equal(cases.length, 5);
  for (const o of cases) {
    assert.ok(o.id && o.at?.preset, `${o.title}: links to its slide and shows the presenting patient (at)`);
    const ring = rel.of.find((r) => r.id === o.id);
    assert.deepEqual(patient(o.at), patient(ring.from), `${o.title}: the same patient as the relation chart's ring`);
  }
});

test('each row is the case before its treatment: the treatment lowers its PPG, and the case shows what its words say', async () => {
  const fps = await deckStates(D), cases = table.of.filter((o) => !o.ref);
  const at = await runSteps(cases.map((o) => patient(o.at)));
  cases.forEach((o, n) => {
    const after = fps[D.slides.findIndex((s) => s.id === o.id)], before = at[n];
    assert.ok(before.ppg > after.ppg + 1, `${o.title}: PPG ${before.ppg.toFixed(1)} before, ${after.ppg.toFixed(1)} after the treatment`);
  });
  // Her case says ascites (small, on ultrasound): the model gives it, and the PVT without cirrhosis has none to speak of.
  assert.ok(at[0].asc > 150, 'the bleed case has the ascites its vignette names');
  assert.match(D.slides.find((s) => s.id === 'a1').vignette, /ascites/);
  assert.ok(at[3].asc < 150, 'recent PVT without cirrhosis has no ascites');
  assert.ok(at[3].ppg > 12 && at[2].ppg > 12, 'the clot rows are not the recovered, normal-PPG state');
});
