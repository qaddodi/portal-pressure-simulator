// The trial card on a deck slide (design A, "the two numbers", Mohammad 14 Nov 2026): a slide's tool { kind: 'trial' } is the slide's instrument
// card, one more instrument a deck can use, in the slot every instrument card has (Mohammad, 14 Nov 2026: "Just another instrument card that
// decks can use"; never part of the teaching card); its drawing lays out two or three arms' numbers, says when its rates are
// Kaplan–Meier estimates, and ends with one line on whether the slide's patient fits the trial. The Landmark trials deck closes on the trials'
// ratios on one scale (tool { kind: 'forest' }) before its model summary.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIALS, TRIAL_IDS, trialOf } from '../src/ui/trials.js';
import { trialLayout, createTrial, fitWords, effectOf, endpointOf, trialWords, fitOf } from '../src/ui/tool-trial.js';
import { TYPE } from '../src/ui/chart-looks/trial.js';
import { measure } from '../src/ui/glyph-measure.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { EXT, warmOf } from '../src/ui/slide-ext.js';
import { LANDMARK_TRIALS } from '../src/ui/decks/landmark-trials.js';
import { createForest, forestLayout } from '../src/ui/trial-forest.js';
import { fitTrial, metricsOfFp } from '../src/ui/trial-fit.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const inside = (L, W) => {
  for (const r of L.rects) assert.ok(r.x >= 0 && r.x + r.w <= W + 1e-6 && r.y >= 0 && r.y + r.h <= L.H, `${r.look} inside`);
  for (const s of L.texts) {
    const [wt, k] = TYPE[s.look], f = L.f, w = measure(s.t, `${wt} ${k * f}px Inter`), x0 = s.anchor === 'end' ? s.x - w : s.x;
    assert.ok(x0 >= -1e-6 && x0 + w <= W + 1e-6, `"${s.t}" inside at its own size (${x0.toFixed(1)}..${(x0 + w).toFixed(1)} of ${W})`);
    assert.ok(s.y <= L.H, `"${s.t}" above the foot`);
  }
};

test('the trial card is an instrument card: a slide keeps it as its tool, in the instrument card\'s slot on every device, never inside the teaching card', () => {
  const pres = read('src/ui/presenter.js'), tt = read('src/ui/tool-trial.js');
  assert.doesNotMatch(pres, /trialBelow|trialUnder|trialNow|s\.trial\b|tool-trial\.js/, 'the presenter builds no trial card of its own: the words\' card holds none');
  assert.match(pres, /\.map\(oneLadder\)\.map\(zoneCam\);/, 'a deck\'s slides keep their tool as written');
  assert.doesNotMatch(tt, /export function trial(Below|Under)/);
  assert.doesNotMatch(read('index.html'), /trial-card\.css/, 'no plate of its own: the instrument card\'s glass');
  // (Every trial slide of every deck names it as its tool, so the presenter's one instrument path shows it: presenter-tools.js make, EXT.tools.)
  let n = 0;
  for (const s of LANDMARK_TRIALS.slides) if (s.tool?.kind === 'trial') { n++; assert.ok(trialOf(s.tool.id), `${s.id}: a trial the app has`); assert.equal(s.trial, undefined); }
  assert.ok(n >= 6);
  assert.match(read('src/ui/presenter-tools.js'), /EXT\.tools\[k\]\.make\(/);
  assert.equal(typeof EXT.tools.trial.make, 'function');
  assert.equal(typeof EXT.tools.trial.warm, 'function');
  assert.ok(warmOf({ tool: { kind: 'trial', id: 'predesci' } }, null) != null, 'its glyph metrics are warmed before the slide shows');
});

test('the instrument card asks its fit line of the slide\'s own patient (configure(tool, ctx): ctx.fp, ctx.params, the presenter\'s ctxOf)', () => {
  const tt = read('src/ui/tool-trial.js'), pres = read('src/ui/presenter.js');
  assert.match(tt, /configure\(t, ctx = null\) \{[^}]*fitOf\(next, ctx\)/, 'configure asks the fit of the context it is given');
  assert.match(read('src/ui/presenter-tools.js'), /inst\.configure\?\.\(t, ctx\)/, 'the instrument path hands every instrument its slide\'s context');
  assert.match(pres, /params: st\?\.params \?\? null, fp: st\?\.fp \?\? null/, 'a context carries the slide\'s own patient');
  const t = TRIALS.predesci, ctx = { fp: { hvpg: 14, varix: 3, gv: 0, asc: 0 }, params: { cirrhosis: 1, tips: { on: false } } };
  const fit = fitOf(t, ctx);
  assert.equal(fit.verdict, 'fits', 'CSPH, small varices, no ascites: PREDESCI\'s patient');
  assert.notEqual(fitOf(t, { fp: { hvpg: 6 }, params: { cirrhosis: 1 } }).verdict, 'fits', 'an HVPG under 10 does not fit');
  assert.equal(fitOf(t, null), null);
  assert.match(trialWords(t, fit), new RegExp(fitWords(fit)));
});

test('design A: the name, the source line, the endpoint, each arm\'s share large, the bars on one scale and the effect, inside the card at every width', () => {
  for (const id of TRIAL_IDS) for (const W of [240, 300, 360, 460, 600]) for (const f of [12, 14, 16]) {
    const t = TRIALS[id], L = { ...trialLayout(t, W, f, measure, { verdict: 'fits', rows: [] }), f };
    inside(L, W);
    const words = L.texts.map((s) => s.t);
    assert.ok(words.includes(t.name) || words[0].startsWith(t.name.split(' ')[0]), `${id}: the name first`);
    for (const a of t.arms) assert.ok(words.includes(`${a.rate}%`) && L.texts.some((s) => s.t === `${a.rate}%` && s.look === 'trial.pct'), `${id}@${W}: ${a.rate}% large`);
    assert.ok(words.some((w) => w.startsWith(t.endpoint.split(' ')[0])), `${id}: the endpoint`);
    if (effectOf(t)) assert.ok(L.texts.some((s) => s.look === 'trial.eff'), `${id}: the effect`);
    const bars = L.rects.filter((r) => r.look === 'trial.bar');
    assert.deepEqual(bars.map((b) => b.tone), t.arms.map((a) => (a.side === 'treat' ? 's1' : 'text-3')), `${id}: the treated arm s1, a control the muted tone`);
    assert.equal(L.texts.filter((s) => s.look === 'trialfit.t').map((s) => s.t).join(' '), 'The patient on this slide fits', `${id}@${W}: the fit line, whole`);
  }
  assert.equal(endpointOf(TRIALS.predesci), 'Decompensation or death', 'no follow-up the audit does not give');
  assert.equal(endpointOf(TRIALS.tripathi), `${TRIALS.tripathi.endpoint}, median 20 months`);
});

test('two arms stand side by side where their names fit; three arms lay out three numbers; Kaplan–Meier rates say so', () => {
  const two = trialLayout(TRIALS.predesci, 360, 13, measure);
  const pc = two.texts.filter((s) => s.look === 'trial.pct');
  assert.equal(pc.length, 2);
  assert.equal(pc[0].y, pc[1].y, 'side by side');
  assert.ok(pc[1].x > pc[0].x);
  const three = { ...TRIALS.predesci, id: 'three', km: true, arms: [{ label: 'Carvedilol', rate: 12, n: 80, side: 'treat' }, { label: 'Propranolol', rate: 18, n: 81, side: 'treat' }, { label: 'Placebo', rate: 27, n: 79, side: 'control' }] };
  for (const W of [240, 360, 520]) {
    const L = { ...trialLayout(three, W, 13, measure), f: 13 };
    inside(L, W);
    assert.equal(L.texts.filter((s) => s.look === 'trial.pct').length, 3, `${W}: three numbers`);
    assert.equal(L.rects.filter((r) => r.look === 'trial.bar').length, 3);
    assert.ok(L.texts.some((s) => /Kaplan–Meier/.test(s.t)), `${W}: Kaplan–Meier rates are marked`);
  }
  assert.match(trialWords(three), /Carvedilol 12%, Propranolol 18%, Placebo 27% \(Kaplan–Meier\)/);
  // (Names too wide to share a row: one arm under another, each number over its own bar.)
  const wide = { ...TRIALS.covered };
  const L = trialLayout(wide, 240, 16, measure), p = L.texts.filter((s) => s.look === 'trial.pct');
  assert.ok(p[1].y > p[0].y, 'stacked where the names would not fit');
});

test('the fit line: a filled accent disc and tick when the patient fits, a ring when not or when the model cannot tell', () => {
  assert.equal(fitWords(null), null);
  assert.equal(fitWords({ verdict: 'fits', rows: [] }), 'The patient on this slide fits');
  assert.equal(fitWords({ verdict: 'unknown', rows: [] }), 'Cannot tell from the model');
  assert.equal(fitWords({ verdict: 'unknown', rows: [], met: 2, of: 5 }), 'Possibly fits: 2 of 5 entry rules checked');
  assert.equal(fitWords({ verdict: 'no', rows: [{ rule: 'HVPG 10 mmHg or more', state: 'no', value: '8.2 mmHg' }] }), 'Does not fit: HVPG 10 mmHg or more (this patient: 8.2 mmHg)');
  assert.equal(fitWords({ verdict: 'no', rows: [{ rule: 'Never decompensated', state: 'no' }] }), 'Does not fit: never decompensated');
  const t = TRIALS.predesci, looks = new Set();
  for (const verdict of ['fits', 'no', 'unknown']) {
    const L = trialLayout(t, 360, 13, measure, { verdict, rows: [{ rule: 'No high-risk varices', state: verdict === 'no' ? 'no' : 'yes' }] });
    for (const x of [...L.texts, ...L.rects, ...L.paths]) looks.add(x.look);
    assert.equal(L.rects.some((r) => r.look === 'trialfit.mk'), verdict === 'fits', `${verdict}: the filled disc only when the patient fits`);
    assert.equal(L.rects.some((r) => r.look === 'trialfit.ring'), verdict !== 'fits');
    assert.equal(L.paths.length, 1);
  }
  for (const k of Object.keys(LOOKS).filter((x) => x.startsWith('trialfit.'))) assert.ok(looks.has(k), `${k} is drawn`);
  for (const k of looks) assert.ok(LOOKS[k], `${k} is in the looks table`);
  assert.equal(trialLayout(t, 360, 13, measure).paths.length, 0, 'no fit line without a slide');
  // (Asked of the slide's own state, never of a frame; no state yet, no line.)
  assert.equal(fitOf(t, null), null);
  assert.deepEqual(fitOf(t, { fp: { hvpg: 12 }, params: {} }), fitTrial(t, metricsOfFp({ hvpg: 12 }), {}));
});

test('the Landmark trials deck closes on the trials\' ratios on one scale, before its model summary', () => {
  const sl = LANDMARK_TRIALS.slides, i = sl.findIndex((s) => s.id === 'forest'), j = sl.findIndex((s) => s.id === 'summary');
  assert.ok(i > 0 && j === i + 1, 'the forest slide is right before the summary table');
  const lastTrial = sl.map((s, k) => (s.tool?.kind === 'trial' ? k : -1)).filter((k) => k >= 0).at(-1);
  assert.ok(i > lastTrial, 'after the last trial slide');
  const f = sl[i];
  assert.equal(f.tool.kind, 'forest');
  assert.deepEqual(f.tool.highlight, []);
  const deckTrials = new Set(sl.filter((s) => s.tool?.kind === 'trial').map((s) => s.tool.id));
  for (const id of f.tool.ids) {
    const t = trialOf(id);
    assert.ok(t && deckTrials.has(id), `${id}: one of the deck's trials`);
    assert.ok((t.ratios ?? []).length > 0 || /\b(HR|OR|RR)\b/.test(t.effect || ''), `${id}: reports a ratio`);
  }
  for (const id of deckTrials) if (!f.tool.ids.includes(id)) assert.ok(!(trialOf(id).ratios ?? []).length && !/\b(HR|OR|RR)\b/.test(trialOf(id).effect || ''), `${id}: left out only when it has no ratio`);
  assert.equal(f.kicker, 'Summary');
  assert.ok(Array.isArray(f.ask) && f.ask.length === 2);
  assert.match(f.line, /<1 favors the treatment/);
  assert.match(f.notes, /never pools/);
  assert.doesNotMatch(`${f.line} ${f.notes}`, /\d\.\d/, 'no trial number typed into the words');
  assert.equal(EXT.owner.tools.forest, 'H', 'the forest tool is registered in package H');
  assert.equal(EXT.tools.forest.title(f.tool), 'The trials on one scale');
});

test('the forest card keeps its API: createForest({ host }) → { el, configure, dispose }, and a pure layout', () => {
  assert.equal(typeof createForest, 'function');
  assert.match(read('src/ui/ext-teaching.js'), /forest: \{ make: \(\) => createForest\(\{ host: 'forest' \}\)/);
  const ts = ['predesci', 'lvtips'].map(trialOf), L = forestLayout(ts, 320, 12, measure, {});
  assert.ok(L.H > 0);
  assert.deepEqual(forestLayout(ts, 320, 12, measure, {}), L);
});
