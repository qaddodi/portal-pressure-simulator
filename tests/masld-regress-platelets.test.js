// MASLD 7 (play-test 16 Nov 2026): during the weight-loss year the platelet tile fell from 160 to 142 before it rose to 175, because the patient the lapse started from was
// not settled (the preset's own platelets were still falling). The slide's patient is now settled at its start, and the year's platelets only rise while the LSM only falls.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { createCore } from '../src/worker-core.js';

test('over the weight-loss year the platelets only rise and the LSM only falls, from a start that rules CSPH out', async () => {
  const deck = DECKS.find((d) => d.id === 'masld'), i = deck.slides.findIndex((s) => s.id === 'regress');
  const M = ['preset', 'presetDays', 'params', 'action', 'days'];
  const steps = deck.slides.slice(0, i + 1).map((s) => (M.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse, trail: s.id === 'regress' ? ['plt', 'lsm'] : false } : {}));
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m.trail; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  const t = out[i], plt = t.map((r) => r[1]), lsm = t.map((r) => r[2]);
  assert.ok(plt[0] >= 150 && lsm[0] <= 15, `starts at platelets ${plt[0]}, LSM ${lsm[0]}: the rule-out the previous slide states`);
  for (let k = 1; k < t.length; k++) { assert.ok(plt[k] >= plt[k - 1] - 0.3, `platelets fall on day ${k}`); assert.ok(lsm[k] <= lsm[k - 1] + 0.05, `LSM rises on day ${k}`); }
  assert.ok(1 - lsm.at(-1) / lsm[0] >= 0.3, 'a fall of 30% or more, as the slide says');
});
