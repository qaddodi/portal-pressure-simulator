// The Trials tab's four groups (F18, TR-5): every trial is in exactly one, on every preset; "Fits this patient" holds only trials whose every
// defining rule was checked and met; "Possibly fits" says how many were; a trial in "Not this patient" names a rule it fails.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';
import { TRIAL_IDS } from '../src/ui/trials.js';
import { sortTrials, reasonOf, GROUPS } from '../src/ui/trials-pane.js';

test('every preset: each trial sits in exactly one group, and each group\'s reason line says what its group means', () => {
  assert.deepEqual(GROUPS.map(([k]) => k), ['fits', 'possible', 'no', 'unknown']);
  for (const pr of PRESETS) {
    const e = new Engine(); e.loadPreset(pr.id); e.settle();
    const m = computeMetrics(e), g = sortTrials(TRIAL_IDS, m, e.params, { hvpg: m.hvpg });
    const all = GROUPS.flatMap(([k]) => g[k].map((q) => q.t.id));
    assert.deepEqual([...all].sort(), [...TRIAL_IDS].sort(), `${pr.id}: every trial once`);
    for (const { t, fit } of g.fits) assert.ok(fit.rows.filter((r) => r.defining).every((r) => r.state === 'yes'), `${pr.id} × ${t.id}`);
    for (const { t, fit } of g.possible) {
      assert.ok(fit.met > 0 && fit.met < fit.of, `${pr.id} × ${t.id}`);
      assert.match(reasonOf(t, fit), new RegExp(`^Possibly fits: ${fit.met} of ${fit.of} entry rules? checked\\. Not in the model: `));
    }
    for (const { t, fit } of g.no) assert.ok(reasonOf(t, fit).length > 0 && fit.rows.some((r) => r.state === 'no'), `${pr.id} × ${t.id}`);
    for (const { t, fit } of g.unknown) assert.match(reasonOf(t, fit), /^(Not in the model: |Its entry rules)/, `${pr.id} × ${t.id}`);
  }
});
