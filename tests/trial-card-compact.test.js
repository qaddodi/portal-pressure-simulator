// The trial card on a phone (LT-1, landmark deck review, 16 Nov 2026): drawn full, it was 373 px with its card and too tall beside a slide's
// words and the figure, so every trial slide came in closed to its handle and the phone showed no trial at all. Compact, the two large numbers
// carry the arms (no bars, no people per arm: the source line keeps the trial's size) and "Kaplan–Meier" joins what was counted. And the
// endpoint line never names the same time twice ("Alive at 6 weeks, 6 weeks").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { trialLayout, endpointOf, sameTime, trialWords } from '../src/ui/tool-trial.js';
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
  for (const id of ['predesci', 'earlytips', 'lvtips', 'transfusion', 'rifaximin', 'groszmann', 'monescillo', 'covered']) {
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

// Mohammad, 17 Nov 2026 (TIPS deck, iPhone): the covered-TIPS card stacked its two arms because "Large-volume paracentesis" did not fit half the
// card, and the words' card under it shrank, as it takes its size from what the data card leaves. An arm names itself short (a.short) where its
// full name does not fit its column, so every two-arm card keeps its numbers on one line; the name is drawn once (the card's header says it).
test('on a phone every two-arm trial card has its two large numbers on one line, covered TIPS with "LVP"', () => {
  for (const t of Object.values(TRIALS)) {
    if (t.arms.length !== 2) continue;
    const c = trialLayout(t, 340, 12, measure, FIT, { compact: true });
    const ys = new Set(c.texts.filter((s) => s.look === 'trial.pct').map((s) => s.y.toFixed(1)));
    assert.equal(ys.size, 1, `${t.id}: the two arms stack`);
  }
  const cov = trialLayout(TRIALS.covered, 340, 12, measure, FIT, { compact: true }), names = cov.texts.filter((s) => s.look === 'trial.lab').map((s) => s.t);
  assert.deepEqual(names, ['Covered TIPS', 'LVP']);
  assert.equal(trialLayout(TRIALS.covered, 600, 12, measure, FIT, { compact: true }).texts.filter((s) => s.look === 'trial.lab')[1].t, 'Large-volume paracentesis', 'wide enough, the full name');
  assert.match(trialWords(TRIALS.covered, FIT), /Large-volume paracentesis 52%/, 'the spoken card keeps the full name');
});

test('compact, the card does not draw the trial name its header already says; the full card still does', () => {
  for (const t of Object.values(TRIALS)) {
    const c = trialLayout(t, 340, 12, measure, FIT, { compact: true }), full = trialLayout(t, 340, 12, measure, FIT);
    assert.equal(c.texts.filter((s) => s.look === 'trial.name').length, 0, `${t.id}: name in the compact card`);
    assert.ok(full.texts.some((s) => s.look === 'trial.name'), `${t.id}: name in the full card`);
  }
});
