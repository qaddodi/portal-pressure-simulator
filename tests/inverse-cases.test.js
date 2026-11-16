// The 27 clinical cases of the independent review of From readings (recs/from-readings-review.md, 15 Nov 2026), ranked on the shipped grid alone (no fit:
// the worker's Gauss-Newton rounds only sharpen what is found here; `node scripts/inverse-cases.mjs` runs them with it). Each check is something the review found
// wrong: a healthy patient given a disease, readings that contradict each other given a confident answer, a presinusoidal patient given only cirrhosis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { rank, pointsOf } from '../src/engine/inverse.js';
import { CASES } from '../scripts/inverse-cases.mjs';
import { TRY_CASES } from '../src/engine/inverse-try-cases.js';

const POINTS = pointsOf(LIBRARY);
const run = (id) => { const c = CASES.find((x) => x.id === id); assert.ok(c, id); return { c, r: rank(c.readings, POINTS) }; };
const leaders = (r) => r.families.filter((f) => (f.status === 'best' || f.status === 'tie') && !f.redundant).map((f) => f.id);
const inPlay = (r) => r.families.filter((f) => f.status !== 'out' && !f.redundant).map((f) => f.id);

test('there are 27 cases, one each, with readings the search takes', () => {
  assert.equal(CASES.length, 27);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 27);
  for (const c of CASES) assert.ok(rank(c.readings, POINTS).ready, c.id);
});

test('normal readings are healthy, not a disease at its mildest (review E2)', () => {
  for (const id of ['C19', 'C20']) {
    const { r } = run(id);
    assert.equal(r.healthy, true, id);
    assert.equal(r.families[0].id, 'none', id);
    assert.deepEqual(leaders(r), ['none'], id);
  }
  assert.equal(run('C01').r.healthy, false);
});

test('readings that contradict each other get no scenario to trust (review E1)', () => {
  const { r } = run('C17');   // HVPG 18 with a soft liver and normal platelets
  assert.equal(r.fit.ok, false);
  assert.deepEqual(r.play, []);
  assert.equal(r.next, null);
  assert.ok(r.fit.worst && r.fit.conflict, 'it says which reading is furthest off');
});

test('a free pressure below the right atrial pressure is flagged as physiologically impossible (review E8)', () => {
  const { r } = run('C18');
  assert.ok(r.warnings.some((w) => w.code === 'fhvp-below-ra'), 'warning');
  assert.equal(r.fit.ok, false);
});

test('the lesion the case is meant to be stays among the leaders', () => {
  for (const id of ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09', 'C14', 'C15', 'C16', 'C22', 'C26']) {
    const { c, r } = run(id);
    assert.ok(leaders(r).includes(c.truth), `${id} ${c.name}: ${c.truth} is not among ${leaders(r)}`);
  }
});

test('presinusoidal disease is in the tie for PSVD and schistosomiasis, with sparse readings it is not hidden by cirrhosis (review E4)', () => {
  for (const id of ['C04', 'C05']) assert.ok(leaders(run(id).r).includes('presin'), id);
  assert.ok(inPlay(run('C24').r).includes('presin'), 'a noisy wedge');
});

test('a case with a harder truth is still in play, never ruled out', () => {
  for (const id of ['C08', 'C10', 'C11', 'C12', 'C23', 'C27']) {
    const { c, r } = run(id);
    assert.ok(inPlay(r).includes(c.truth), `${id}: ${c.truth} in play of ${inPlay(r)}`);
  }
});

test('cirrhosis with a clot reads as cirrhosis: the one lesion that explains most of it leads (C13)', () => {
  const { r } = run('C13');
  assert.ok(leaders(r).includes('sinus'));
});

test('sparse readings give a short labelled list, not one answer', () => {
  for (const id of ['C14', 'C15', 'C16', 'C26']) {
    const { r } = run(id);
    assert.ok(r.few || r.n < 4, id);
    assert.ok(leaders(r).length >= 2, `${id}: two readings cannot decide it, ${leaders(r)}`);
  }
});

test('every ranked family carries its Occam fields', () => {
  const { r } = run('C12');
  for (const f of r.families) {
    assert.equal(typeof f.score, 'number', f.id);
    assert.ok(f.rating >= 0 && f.rating <= 1, f.id);
    assert.ok(['best', 'tie', 'possible', 'out'].includes(f.status), f.id);
  }
  const share = r.families.filter((f) => !f.redundant).reduce((n, f) => n + f.rating, 0);
  assert.ok(Math.abs(share - 1) < 1e-6, 'the ratings of the families that are not redundant add to one: ' + share);
});

test('"Try a case" loads readings the search recovers, the same numbers as the review cases', () => {
  const want = { normal: 'C19', compensated: 'C01', decompensated: 'C02', psvd: 'C04', pvt: 'C06', ivcweb: 'C08', rhf: 'C10', 'cirrhosis-rhf': 'C12' };
  assert.equal(TRY_CASES.length, Object.keys(want).length);
  for (const t of TRY_CASES) {
    const { c, r } = run(want[t.id]);
    assert.deepEqual(t.readings, c.readings, t.id);
    assert.ok(t.label && t.note && t.leads.length, t.id);
    assert.ok(t.leads.some((id) => inPlay(r).includes(id)), `${t.id}: ${t.leads} among ${inPlay(r)}`);
  }
});
