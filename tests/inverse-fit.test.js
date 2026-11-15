// Work backward's live fit, run for real: the worker's loop (rank, refinePoints, run the engine on what it asks for, rank again) on the example
// "FHVP 24, WHVP 30 and nothing else", with the real engine. The fit must bring the leaders to the readings (a misfit under the allowed error),
// the settings it reports must give those readings back from the model, and Open as patient must load exactly those settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { rank, refinePoints, pointsOf, REFINE_ROUNDS, REFINE_PER_ROUND } from '../src/engine/inverse.js';
import { runPatient, readingsOf } from '../src/engine/inverse-run.js';
import { keyOf, FAMILY, settingsOf } from '../src/engine/inverse-families.js';
import { yoursRecord, setYours } from '../src/engine/yours.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

test('the fit on the real engine brings FHVP 24 with WHVP 30 to a misfit under the allowed error, and its settings give the readings back', { timeout: 300000 }, () => {
  const readings = { whvp: 30, fhvp: 24 };
  const known = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
  const first = rank(readings, [...known.values()]);
  for (let round = 1; round <= REFINE_ROUNDS; round++) {
    const res = rank(readings, [...known.values()]), todo = refinePoints(res, known, { families: 12, max: REFINE_PER_ROUND, round });
    if (!todo.length) break;
    for (const t of todo) known.set(keyOf(t.f, t.p), { f: t.f, p: t.p, r: runPatient(t.f, t.p) });
  }
  const res = rank(readings, [...known.values()]), lead = res.families[0];
  assert.ok(lead.best.chi < 3, `the leader is within the allowed error: chi ${lead.best.chi.toFixed(1)} (${lead.id})`);
  assert.ok(lead.score < first.families[0].score, 'the fit improved the best score the grid gave');
  const withHeart = res.families.filter((f) => f.status !== 'out' && FAMILY[f.id].axes.some((k) => k === 'rhf' || k === 'constr'));
  assert.ok(withHeart.some((f) => FAMILY[f.id].axes.includes('sinus')), 'cirrhosis with a heart lesion is a scenario the fit finds');
  assert.ok(res.families.slice(0, 5).some((f) => f.best.chi < 1), 'several scenarios fit the two pressures exactly');
  // The settings it reports are what the model runs: the readings come back as predicted, and Open as patient loads those same settings.
  const back = runPatient(lead.id, lead.best.p);
  for (const k of ['whvp', 'fhvp', 'ra', 'lsm', 'plt']) assert.equal(back[k], lead.best.pred[k], k);
  assert.ok(settingsOf(lead.id, lead.best.p).length >= 2);
  const rec = yoursRecord(lead.id, lead.best.p, readings, 1);
  setYours([rec]);
  try {
    const e = new Engine();
    e.loadPreset(rec.id);
    const m = readingsOf(computeMetrics(e));
    assert.equal(m.whvp, lead.best.pred.whvp);
    assert.equal(m.fhvp, lead.best.pred.fhvp);
  } finally { setYours([]); }
});
