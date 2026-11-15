// The round trip (15 Nov 2026): a virtual patient from the model's own sliders, run to its readings and given back to the search, must come back as the same
// patient or one as simple that reads the same. The model is deterministic, so a reading set the model can make is a reading set the search must be able to find.
// scripts/inverse-roundtrip.mjs runs it at any size (`node scripts/inverse-roundtrip.mjs 12 1 --max=3`); the test is the fast part: every shipped patient on the
// library alone, Mohammad's own case with the fit, and a few seeded patients with side sliders drawn off their defaults, each fitted as the worker does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { rank, pointsOf, costOf, normalise, HEART_RA } from '../src/engine/inverse.js';
import { ENTERED, fit, roundTrip, randomPatient } from '../scripts/inverse-roundtrip.mjs';

const POINTS = pointsOf(LIBRARY);
const found = (res, n, cost) => res.families.find((f) => !f.redundant && f.status !== 'out' && f.best.chi <= 0.5 * n && f.best.cost <= cost + 1.5);

test('every shipped patient is found again from its own readings (a heart lesion that leaves the atrium normal is not a scenario, review E7)', () => {
  let n = 0, misses = [];
  for (const pt of POINTS) {
    if (pt.f === 'none') continue;
    const { readings } = normalise(Object.fromEntries(ENTERED.filter((k) => pt.r[k] != null).map((k) => [k, pt.r[k]])));
    n++;
    if (!found(rank(readings, POINTS), Object.keys(readings).length, costOf(pt.f, pt.p))) misses.push(pt);
  }
  assert.ok(n > 400);
  const real = misses.filter((pt) => !(/rhf|constr/.test(pt.f) && !(pt.r.ra >= HEART_RA)));
  assert.ok(real.length / n < 0.02, `${real.length} of ${n} not found again: ${real.slice(0, 5).map((p) => p.f + JSON.stringify(p.p))}`);
});

test('a random patient is drawn from the lesions and their side sliders, and runs to readings', () => {
  const p = randomPatient(() => 0.5, 2);
  assert.ok(p.f && Object.keys(p.p).length >= 1);
});

test('WHVP 30 with FHVP 24: right heart failure with cirrhosis is a leading scenario, at the cirrhosis the model needs for an HVPG of 6 under that congestion', { timeout: 300000 }, () => {
  const res = fit({ whvp: 30, fhvp: 24 });
  const f = res.families.find((x) => x.id === 'sinus+rhf');
  assert.ok(f && (f.status === 'best' || f.status === 'tie') && !f.redundant, 'sinus+rhf: ' + (f && f.status));
  assert.ok(f.best.chi < 3, 'it gives both pressures: chi ' + f.best.chi);
  assert.ok(f.best.p.sinus >= 0.5 && f.best.p.sinus <= 0.8, 'cirrhosis ' + f.best.p.sinus);
});

for (const seed of [12, 22, 34]) {
  test(`seeded round trip ${seed}: one or two lesions with side sliders off their defaults`, { timeout: 400000 }, () => {
    const t = roundTrip(seed, { maxLesions: 2 });
    assert.ok(t.ok, `drawn ${t.drawn.f} ${JSON.stringify(t.drawn.p)} (cost ${t.drawnCost.toFixed(1)}), found ${t.found.f} ${JSON.stringify(t.found.p)} chi ${t.found.chi.toFixed(2)} for ${JSON.stringify(t.readings)}`);
  });
}
