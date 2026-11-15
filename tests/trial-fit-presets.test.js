// TR-5 (full app review, 15 Nov 2026): the trials pane said "Fits this patient" for trials the patient could never have entered, because
// "cirrhosis" was often the only rule the model could check. Every preset against every trial: a trial reads "fits" (now worded "Matches the modeled
// criteria", never eligible) only when each defining entry rule was checked and met, so a trial with a defining rule the model cannot check never
// matches, on any preset, bleeding or not, with a TIPS or not. R02 (external review, 15 Nov 2026): the model alone can never say a patient was never
// decompensated, so no preset matches PREDESCI on its own; only a case author's fact (CASE below) can complete that rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';
import { TRIALS } from '../src/ui/trials.js';
import { fitTrial } from '../src/ui/trial-fit.js';

const all = Object.values(TRIALS);
const CASE = { decompensated: false };   // (what a slide's author may supply: the patient has never decompensated)
const defining = (t) => t.entry.filter((e) => e.minor !== true);
// Trials whose every defining rule the model can check: the only ones that can ever read "fits".
const checkable = all.filter((t) => defining(t).length && defining(t).every((e) => e.test !== null)).map((t) => t.id);

/** Each preset, settled, as the Tests card sees it: [{ id, m, p }]. */
function patients() {
  return PRESETS.map((pr) => { const e = new Engine(); e.loadPreset(pr.id); e.settle(); return { id: pr.id, m: computeMetrics(e), p: e.params }; });
}

test('the trials that can read "fits" are the ones whose every defining rule the model can check', () => {
  assert.deepEqual(checkable.sort(), ['predesci', 'transfusion'],
    'a record whose defining rules are all checkable can read "fits"; add one only when the model really answers each rule');
});

test('without a case history no preset matches any trial in full (the model has no earlier decompensation); with it, only PREDESCI-shaped trials can', () => {
  for (const { id, m, p } of patients()) for (const t of all) {
    if (fitTrial(t, m, p).verdict === 'fits') assert.ok(!t.entry.some((e) => e.test === 'compensated'), `${id} × ${t.id}: "compensated" is never answered by the model alone`);
  }
  assert.ok(all.some((t) => t.entry.some((e) => e.test === 'compensated')), 'PREDESCI still lists the rule');
});

test('every preset against every trial: "fits" needs every defining rule checked and met, and none failing', () => {
  let fits = 0;
  for (const { id, m, p } of patients()) {
    // The patient as is, then bleeding now, then with a TIPS in place, then both: four variants of every preset.
    for (const [label, mm, pp] of [['', m, p], ['bleeding', { ...m, bleeding: { site: 'VAR' } }, p],
      ['TIPS', m, { ...p, tips: { ...p.tips, on: true } }], ['bleeding + TIPS', { ...m, bleeding: { site: 'VAR' } }, { ...p, tips: { ...p.tips, on: true } }]]) {
      for (const t of all) {
        const r = fitTrial(t, mm, pp, CASE);
        const where = `${id}${label ? ` (${label})` : ''} × ${t.id}`;
        assert.ok(['fits', 'no', 'unknown'].includes(r.verdict), where);
        assert.equal(r.rows.length, t.entry.length, `${where}: a row per rule`);
        const failing = r.rows.some((x) => x.state === 'no'), allDefiningMet = r.rows.filter((x) => x.defining).every((x) => x.state === 'yes');
        assert.equal(r.verdict === 'no', failing, `${where}: "no" exactly when a rule fails`);
        assert.equal(r.verdict === 'fits', !failing && allDefiningMet && r.rows.some((x) => x.defining), `${where}: "fits" exactly when no rule fails and every defining rule is met`);
        if (r.verdict === 'fits') { fits++; assert.ok(checkable.includes(t.id), `${where}: a trial with a defining rule the model cannot check read "fits"`); }
      }
    }
  }
  assert.ok(fits > 0, 'some preset really fits PREDESCI, so the test is not vacuous');
});

test('the compensated patient with CSPH (the review\'s example) fits only PREDESCI, and not the ascites, infection, HE or TIPS trials', () => {
  const { m, p } = patients().find((x) => x.id === 'csph');
  assert.equal(m.ascites.grade, 0, 'the preset has no ascites');
  const verdict = Object.fromEntries(all.map((t) => [t.id, fitTrial(t, m, p, CASE).verdict]));
  assert.deepEqual(Object.keys(verdict).filter((k) => verdict[k] === 'fits'), ['predesci'], 'with the case history: never decompensated');
  assert.equal(fitTrial(TRIALS.predesci, m, p).verdict, 'unknown', 'without it the model cannot say');
  for (const id of ['earlytips', 'lvtips', 'cavarly', 'sort', 'gines', 'sharma', 'fernandez2006', 'rifaximin', 'covered']) assert.notEqual(verdict[id], 'fits', id);
  // SBP happens in ascitic fluid: a patient with no ascites is not Sort's or Ginès's patient, not merely "cannot tell".
  assert.equal(verdict.sort, 'no');
  assert.equal(verdict.gines, 'no');
});

test('a TIPS already in place keeps a patient out of the trials that place one', () => {
  for (const { id, m, p } of patients()) {
    const withTips = { ...p, tips: { ...p.tips, on: true } };
    for (const t of all.filter((x) => x.entry.some((e) => e.test === 'no_tips'))) assert.equal(fitTrial(t, { ...m, bleeding: { site: 'VAR' } }, withTips).verdict, 'no', `${id} × ${t.id}`);
  }
  for (const id of ['earlytips', 'lvtips', 'gavaprosec', 'covered', 'rifaximin']) assert.ok(TRIALS[id].entry.some((e) => e.test === 'no_tips'), `${id} states that no TIPS is in place`);
});
