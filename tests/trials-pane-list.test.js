// The Trials tab's list (trials card review, 15 Nov 2026): the closest trial leads (TC-L1), the rest fold under the rule that keeps them out,
// rows read their outcome word (TC-L2, A5), presets and the session give the case history (TC-F3), Baveno VIII in words (TC-T2), lessons short (TC-T1).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';
import { TRIAL_IDS, trialOf, BAVENO_VIII } from '../src/ui/trials.js';
import { sortTrials, closestOf, chipsOf, chipOf, ratesOf, historyOf, sourceLine, pipsOf, ruleRows, today531, modelRx, hasEvlArm, patientFacts } from '../src/ui/trials-pane.js';
import { failedRows } from '../src/ui/trial-fit.js';

const at = (id) => { const e = new Engine(); e.loadPreset(id); e.settle(); return { e, m: computeMetrics(e) }; };
const groupsAt = (id, seen = false) => { const { e, m } = at(id); return sortTrials(TRIAL_IDS, m, e.params, { hvpg: m.hvpg }, historyOf(id, seen)); };

test('TC-F3: the CSPH and compensated presets carry their history, so PREDESCI matches and leads', () => {
  for (const id of ['csph', 'masld-csph']) {
    const S = closestOf(groupsAt(id));
    assert.equal(S.closest[0]?.t.id, 'predesci', `${id}: PREDESCI first`);
    const row = S.closest[0].fit.rows.find((r) => /compensated/i.test(r.rule));
    assert.equal(row.state, 'yes'); assert.equal(row.source, 'case');
  }
  // (Without the preset's word the model cannot know there was never a decompensation.)
  const { e, m } = at('csph');
  const bare = sortTrials(TRIAL_IDS, m, e.params, { hvpg: m.hvpg });
  assert.ok(!bare.fits.some((q) => q.t.id === 'predesci'));
});

test('TC-F3: every preset with facts says a boolean; the session\'s decompensation reads as its own source', () => {
  for (const pr of PRESETS) if (pr.facts) assert.equal(typeof pr.facts.decompensated, 'boolean', pr.id);
  assert.deepEqual(historyOf('csph', false), { decompensated: false });
  assert.deepEqual(historyOf('csph', true), { decompensated: true, source: 'session' });
  assert.deepEqual(historyOf('cirr-decomp', true), { decompensated: true });
  assert.equal(historyOf('healthy', false), null);
  const g = groupsAt('csph', true), p = [...g.no, ...g.fits, ...g.possible].find((q) => q.t.id === 'predesci');
  const row = p.fit.rows.find((r) => /compensated/i.test(r.rule));
  assert.equal(row.state, 'no'); assert.equal(row.value, 'Decompensated earlier in this session'); assert.equal(row.source, 'session');
});

test('TC-L1: closest holds at most two, every trial sits in one section, and the chips count each failing trial once', () => {
  for (const pr of PRESETS) {
    const g = groupsAt(pr.id), S = closestOf(g);
    assert.ok(S.closest.length <= 2, pr.id);
    const all = [...S.closest, ...S.also, ...S.no, ...S.unknown].map((q) => q.t.id).sort();
    assert.deepEqual(all, [...TRIAL_IDS].sort(), `${pr.id}: each trial once`);
    if (g.fits.length) assert.equal(S.closest[0].t.id, g.fits[0].t.id, `${pr.id}: a match leads`);
    const chips = chipsOf(S.no);
    assert.equal(chips.reduce((n, c) => n + c.ids.length, 0), S.no.length, `${pr.id}: chips cover the trials that fail`);
    for (let i = 1; i < chips.length; i++) assert.ok(chips[i - 1].ids.length >= chips[i].ids.length, 'most common first');
    for (const c of chips) assert.ok(c.label.length <= 22, `${pr.id}: chip "${c.label}" is short`);
    for (const q of S.closest) assert.ok(pipsOf(q.fit).length >= 1 && /^[yxo]+$/.test(pipsOf(q.fit)), `${pr.id} × ${q.t.id}: pips`);
  }
});

test('chip words: what the trial needs', () => {
  assert.equal(chipOf({ test: 'hvpg_ge', need: '≥10', rule: 'HVPG ≥10 mmHg' }), 'HVPG ≥10');
  assert.equal(chipOf({ test: 'acute_bleed', rule: 'Acute variceal bleeding' }), 'Bleeding now');
  assert.equal(chipOf({ test: 'albumin_lt', need: '<3.0', rule: 'Serum albumin <3.0 g/dL' }), 'Albumin <3.0');
  const g = groupsAt('cirr-comp');
  for (const q of g.no) assert.ok(chipOf(failedRows(q.fit)[0]), q.t.id);
});

test('TC-L2, A5: a row\'s numbers carry the outcome word; MACHT, with no per-arm result, says so', () => {
  for (const id of TRIAL_IDS) {
    const t = trialOf(id), [a, b] = ratesOf(t);
    assert.ok(a.length > 0, `${id}: never an empty number`);
    if (t.arms?.length) assert.match(`${a}${b}`, new RegExp(`%.*${t.outcome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), id);
  }
  assert.deepEqual(ratesOf(trialOf('macht')), ['No difference (P = 0.402)', '']);
  assert.deepEqual(ratesOf(trialOf('predesci')), ['16%', ' vs 27% decompensated']);
});

test('TC-T1, T2: every trial has a short lesson and outcome word; every Baveno VIII number it cites has its words', () => {
  for (const id of TRIAL_IDS) {
    const t = trialOf(id);
    assert.ok(t.lesson && t.lesson.length <= 160, `${id}: lesson ${t.lesson?.length}`);
    assert.ok(['approved', 'draft'].includes(t.lessonStatus), `${id}: lessonStatus`);
    assert.ok(t.outcome && t.outcome.length <= 16, `${id}: outcome "${t.outcome}"`);
    for (const k of t.bav || []) assert.ok(BAVENO_VIII[k], `${id}: Baveno VIII ${k} has its words`);
    assert.match(sourceLine(t), new RegExp(`${t.n} randomized${t.pmid ? ` · PMID ${t.pmid}` : ''}$`));
  }
});

test('TC-L3: the checklist puts defining rules before the fine print', () => {
  for (const id of TRIAL_IDS) {
    const g = groupsAt('cirr-decomp'), q = Object.values(g).flat().find((x) => x.t.id === id);
    const R = ruleRows(q.fit), firstMinor = R.findIndex((r) => !r.defining);
    if (firstMinor >= 0) assert.ok(R.slice(firstMinor).every((r) => !r.defining), id);
  }
});

test('TC-A2: Baveno VIII 5.31\'s HVPG rule, checked at a bleed', () => {
  assert.match(today531(21.3, true), /meets the HVPG rule/);
  assert.match(today531(14, true), /under the HVPG rule/);
  assert.match(today531(14, false), /applies at a bleed/);
  assert.match(today531(null, true), /not measured/);
  for (const id of ['earlytips', 'lvtips']) assert.ok(trialOf(id).bav.includes('5.31'), id);
});

test('TC-T5: albumin trials get a Model line; band ligation arms are named', () => {
  for (const id of ['answer', 'attire', 'sort']) assert.equal(modelRx(trialOf(id))?.kind, 'albumin', id);
  for (const id of ['tripathi', 'shah', 'calibre', 'cavarly', 'earlytips']) assert.ok(hasEvlArm(trialOf(id)), id);
  assert.ok(!hasEvlArm(trialOf('predesci')));
  const { e, m } = at('csph');
  assert.ok(Number.isFinite(patientFacts(m, e.params, { params: e.params }).hvpg));
});
