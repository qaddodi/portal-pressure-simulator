// The trial card on a phone (LT-1, landmark deck review, 16 Nov 2026): drawn full, it was 373 px with its card and too tall beside a slide's
// words and the figure, so every trial slide came in closed to its handle and the phone showed no trial at all. Compact, the two large numbers
// carry the arms (no bars, no people per arm: the source line keeps the trial's size) and "Kaplan–Meier" joins what was counted. And the
// endpoint line never names the same time twice ("Alive at 6 weeks, 6 weeks").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { trialLayout, endpointOf, sameTime } from '../src/ui/tool-trial.js';
import { TRIALS } from '../src/ui/trials.js';
import { measure } from '../src/ui/glyph-measure.js';

const FIT = { verdict: 'unknown', rows: [] };

test('compact, every trial card is shorter, keeps its two large numbers and draws no bar or arm size', () => {
  for (const t of Object.values(TRIALS)) {
    const full = trialLayout(t, 340, 12, measure, FIT), c = trialLayout(t, 340, 12, measure, FIT, { compact: true });
    if (t.arms.length) assert.ok(c.H < full.H, `${t.id}: compact ${c.H} px is not shorter than ${full.H}`);
    assert.equal(c.rects.filter((r) => r.look === 'trial.bar' || r.look === 'trial.track').length, 0, `${t.id}: a bar in the compact card`);
    assert.equal(c.texts.filter((s) => s.look === 'trial.n').length, 0, `${t.id}: an arm's size in the compact card`);
    assert.equal(c.texts.filter((s) => s.look === 'trial.pct').length, t.arms.length, `${t.id}: each arm keeps its large number`);
    if (t.km) assert.ok(c.texts.some((s) => /Kaplan–Meier/.test(s.t)), `${t.id}: Kaplan–Meier is said`);
  }
});

test('on a phone the landmark deck\'s trial cards draw at most 230 px (they were 229 to 269 full; 215 until the footnote stopped being cut with an ellipsis, B17), covered TIPS aside: its arm names stack', () => {
  for (const id of ['predesci', 'earlytips', 'lvtips', 'transfusion', 'rifaximin', 'groszmann', 'monescillo']) {
    const H = trialLayout(TRIALS[id], 340, 12, measure, FIT, { compact: true }).H;
    assert.ok(H <= 230, `${id}: ${H} px`);
  }
});

test('the endpoint line names its time once', () => {
  assert.equal(sameTime('Alive at 6 weeks', '6 weeks'), true);
  assert.equal(sameTime('Alive at 18 months', 'Up to 18 months'), true);
  assert.equal(sameTime('Alive at 3 months', '1 year'), false);
  assert.equal(sameTime('Alive at 1 year', 'Median 16 months'), false);
  for (const t of Object.values(TRIALS)) {
    const e = endpointOf(t), times = [...e.matchAll(/(\d[\d.]*)\s*(day|week|month|year)s?\b/gi)].map((m) => `${m[1]} ${m[2].toLowerCase()}`);
    assert.equal(new Set(times).size, times.length, `${t.id}: "${e}" names a time twice`);
  }
});
