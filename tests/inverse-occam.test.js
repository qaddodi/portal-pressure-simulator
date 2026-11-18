// Review E2 to E8 and T3 to T5 of From readings, one behaviour each: the healthy answer, the small-severity cost, the scales without flat stretches, the nested
// rule, the heart's validity, the LSM that follows the cirrhosis slider, the physiology warnings, why one scenario beats the next, the natural ties, ascitic protein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { rank, pointsOf, costOf, normalise, whyBeats, READINGS, LESION_COST, SEVERITY_COST, HEART_RA } from '../src/engine/inverse.js';
import { FAMILIES, FAMILY } from '../src/engine/inverse-families.js';

const POINTS = pointsOf(LIBRARY);
const NAMES = ['whvp', 'fhvp', 'hvpg', 'pv', 'ppg', 'ra', 'ivc', 'lsm', 'ssm', 'spleen', 'plt', 'pvVel', 'saag', 'asctp', 'asc', 'varix'];
const readingsOfRow = (row) => Object.fromEntries(NAMES.map((k, i) => [k, row[2][i]]).filter(([, v]) => v != null));

test('E2: the healthy family is a real answer with no lesion and no cost', () => {
  assert.deepEqual(FAMILY.none.axes, []);
  assert.equal(costOf('none', {}), 0);
  assert.equal(FAMILIES.length, 67);
});

test('E3: a lesion costs its share and a very mild one costs almost nothing more (the severity cost is linear)', () => {
  assert.ok(Math.abs(costOf('sinus', { sinus: 0.1 }) - costOf('sinus', { sinus: 0 }) - SEVERITY_COST * 0.1) < 1e-9);
  assert.ok(Math.abs(costOf('sinus+rhf', { sinus: 0.5, rhf: 0.5 }) - (2 * LESION_COST + 2 * SEVERITY_COST * 0.5)) < 1e-9);
});

test('E4: every lesion\'s scale moves the readings the whole way (no flat stretch at the top of the library)', () => {
  for (const id of ['sinus', 'presin', 'pvt', 'rhf', 'constr', 'bcs', 'ivcweb', 'post']) {
    const pts = LIBRARY.filter((row) => row[0] === id).sort((a, b) => a[1][0] - b[1][0]);
    assert.ok(pts.length >= 6, id);
    let moved = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = readingsOfRow(pts[i - 1]), b = readingsOfRow(pts[i]);
      if (NAMES.some((k) => k in a && k in b && Math.abs(Math.log((b[k] + 1) / (a[k] + 1))) > 0.02)) moved++;
    }
    assert.ok(moved >= pts.length - 2, `${id}: ${moved} of ${pts.length - 1} steps change a reading`);
  }
});

test('E6: a mix is redundant when the lesion it adds buys less than the lesion costs', () => {
  const sinus = LIBRARY.filter((r) => r[0] === 'sinus')[3];
  const r = rank(readingsOfRow(sinus), POINTS);
  assert.equal(r.families[0].id, 'sinus', 'one lesion explains one lesion\'s readings');
  const live = r.families.filter((f) => !f.redundant && (f.status === 'best' || f.status === 'tie'));
  assert.ok(live.every((f) => FAMILY[f.id].axes.length === 1), 'no two-lesion mix is a leader: ' + live.map((f) => f.id));
  assert.ok(r.families.some((f) => f.redundant), 'a mix whose parent fits as well is marked redundant');
});

test('E7: a heart lesion needs a raised right atrial pressure', () => {
  const r = rank({ whvp: 18, fhvp: 6, ra: 3, lsm: 28, plt: 95, spleen: 14 }, POINTS);
  const hearts = r.families.filter((f) => /rhf|constr/.test(f.id) && !f.redundant && f.status !== 'out');
  assert.deepEqual(hearts.filter((f) => f.best.pred.ra < HEART_RA).map((f) => f.id), [], 'a heart family\'s best point has RA ≥ ' + HEART_RA);
});

test('E5: stiffness keeps rising with the cirrhosis slider past where the pressure gradient alone stopped (30 kPa)', () => {
  const lsm = LIBRARY.filter((r) => r[0] === 'sinus').sort((x, y) => x[1][0] - y[1][0]).map((r) => readingsOfRow(r).lsm);
  for (let i = 1; i < lsm.length; i++) assert.ok(lsm[i] >= lsm[i - 1], 'stiffness never falls as the slider rises: ' + lsm);
  assert.ok(lsm[lsm.length - 1] > 40, 'a fully cirrhotic liver is stiffer than the gradient formula alone allowed: ' + lsm);
  assert.ok(lsm[0] < 10, 'and a slider at the bottom is a soft liver: ' + lsm);
});

test('E8: pressures that cannot all be true are kept and flagged, not read as a disease', () => {
  const w = (raw) => normalise(raw).warnings.map((x) => x.code);
  assert.ok(w({ whvp: 12, fhvp: 5, ra: 15 }).includes('fhvp-below-ra'));
  assert.ok(w({ whvp: 4, fhvp: 8 }).includes('whvp-below-fhvp'));
  assert.deepEqual(w({ whvp: 18, fhvp: 6, ra: 5 }), []);
});

test('T3: the readings that make the first scenario beat the next, with what each predicts', () => {
  const r = rank({ whvp: 8, fhvp: 5, lsm: 5.5, spleen: 15, plt: 100, pvVel: 0, varix: 2 }, POINTS);
  const top = r.families.find((f) => !f.redundant);
  assert.ok(top.why && top.why.length >= 1 && top.why.length <= 3);
  for (const x of top.why) { assert.ok(x.key in READINGS); assert.equal(typeof x.entered, 'number'); assert.ok('mine' in x && 'theirs' in x); }
  const [a, b] = r.families.filter((f) => !f.redundant);
  assert.deepEqual(whyBeats(r.readings, a, b), top.why);
});

test('T5: scenarios the model cannot tell apart are one group with the sentence that says what decides', () => {
  const r = rank({ whvp: 8, fhvp: 4.5, ppg: 14, lsm: 6.5, ssm: 68, spleen: 16, plt: 78, asc: 0 }, POINTS);
  assert.ok(r.tieNotes.length >= 1);
  assert.ok(r.tieNotes.every((t) => t.ids.length >= 2 && t.text.length > 20));
  const grouped = r.families.filter((f) => f.tieGroup);
  assert.ok(grouped.length >= 2 && new Set(grouped.map((f) => f.tieGroup)).size >= 1);
});

test('T4: ascitic total protein is a reading the model makes', () => {
  assert.ok(READINGS.asctp && READINGS.asctp.unit);
  const rows = LIBRARY.filter((r) => r[0] === 'rhf' || r[0] === 'sinus').map(readingsOfRow).filter((x) => x.asctp != null);
  assert.ok(rows.length > 0, 'the library carries it');
  const { readings } = normalise({ whvp: 20, fhvp: 18, ra: 18, asctp: 4.2 });
  assert.equal(readings.asctp, 4.2);
});
