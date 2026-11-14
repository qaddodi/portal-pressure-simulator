// The trial card (tool { kind: 'trial', id }, tool-trial.js, trials.js): every trial it can show is listed in guidelines/trials.md with the
// status the file gives it, its numbers are percents with at most one decimal, its ratios, Baveno VIII statements and entry rules are well formed
// and in the file, a slide may name only a trial that is listed, and the card's drawing keeps every word and bar inside its width. Item 39 of
// docs/recommendations/deck-content-and-new-decks.md; the 21 audited trials of guidelines/trials-audit-2026-11-14.md (14 Nov 2026).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIALS, TRIAL_IDS, trialOf, trialSource, trialLines } from '../src/ui/trials.js';
import { trialLayout, wrapWords, trialWords, UNCHECKED, trialTool } from '../src/ui/tool-trial.js';
import { measure } from '../src/ui/glyph-measure.js';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import teaching from '../src/ui/ext-teaching.js';
import { EXT } from '../src/ui/slide-ext.js';
import { DECKS } from '../src/ui/decks.js';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';

const md = readFileSync(new URL('../guidelines/trials.md', import.meta.url), 'utf8');
/** guidelines/trials.md read into { id: { status, text } }: a section is "## <id>" to the next heading. */
const sections = Object.fromEntries(md.split(/^## /m).slice(1).map((b) => {
  const id = b.split('\n', 1)[0].trim(), status = /^Status:\s*(\w+)/m.exec(b)?.[1] ?? null;
  return [id, { status, text: b }];
}));

// Trials a deck may name while their numbers have not been read against the paper (none: the card says so on screen, but a talk should not rely on it).
const MAY_BE_UNCHECKED = new Set();

test('every trial is listed in guidelines/trials.md with the same status, and the file lists no trial the app lacks', () => {
  assert.deepEqual(Object.keys(sections).sort(), [...TRIAL_IDS].sort(), 'the sections of guidelines/trials.md are the trials of src/ui/trials.js');
  for (const id of TRIAL_IDS) {
    const t = TRIALS[id], sec = sections[id];
    assert.equal(t.id, id, `${id}: the key is the id`);
    assert.equal(sec.status, t.status, `${id}: status in trials.md`);
    assert.ok(['checked', 'unchecked'].includes(t.status), `${id}: status`);
    assert.ok(sec.text.includes(t.firstAuthor), `${id}: trials.md names ${t.firstAuthor}`);
    assert.ok(sec.text.includes(String(t.year)), `${id}: trials.md gives ${t.year}`);
    assert.ok(t.pmid == null ? /PMID: not looked up/.test(sec.text) : sec.text.includes(`PMID ${t.pmid}`), `${id}: trials.md gives the PMID the app holds`);
    // (Every percent on the card is in the section's own reading of the abstract.)
    for (const a of t.arms) assert.ok(sec.text.includes(`${a.rate}%`), `${id}: trials.md reads ${a.rate}% for ${a.label}`);
    if (t.n) assert.ok(sec.text.includes(String(t.n)), `${id}: trials.md reads ${t.n} randomized`);
    for (const a of t.arms) for (const k of ['n', 'events']) if (a[k] != null) assert.ok(new RegExp(`\\b${a[k]}\\b`).test(sec.text), `${id}/${a.label}: trials.md reads ${k} ${a[k]}`);
    assert.ok(t.doi == null || sec.text.includes(`DOI ${t.doi}`), `${id}: trials.md gives the DOI the app holds`);
    // (Every ratio is on the section's Ratios line as "HR 0.51 (0.26–0.97)", a trailing zero allowed: 0.5 is printed 0.50.)
    const ratioLine = /^Ratios:(.*)$/m.exec(sec.text)?.[1] ?? '';
    const num = (x) => `${String(x).replace('.', '\\.')}0*`;
    for (const r of t.ratios) assert.match(ratioLine, new RegExp(`${r.kind} ${num(r.est)} \\(${num(r.lo)}–${num(r.hi)}\\)`), `${id}: trials.md's Ratios line gives ${r.kind} ${r.est} (${r.lo}–${r.hi})`);
    if (!t.ratios.length) assert.match(ratioLine, /none reported/, `${id}: trials.md says no ratio was reported`);
    // (The Baveno VIII line names exactly the statements the trial holds, or says none; each was found in guidelines/baveno-viii-2026.pdf.)
    const bavLine = /^Baveno VIII:\s*(.*)$/m.exec(sec.text)?.[1] ?? '';
    const named = bavLine.split(/\(|\.\s/)[0].match(/\b\d\.\d{1,2}\b/g) ?? [];
    assert.deepEqual(named, t.bav, `${id}: trials.md's Baveno VIII line names ${t.bav.join(', ') || 'none'}`);
    if (!t.bav.length) assert.match(bavLine, /^none\b/, `${id}: trials.md says no Baveno VIII statement corresponds`);
  }
});

// Trials that reported no result per arm, so the card has no bars (MACHT: the audit says not to show efficacy counts until they are verified).
const NO_ARMS = new Set(['macht']);
const GROUPS = ['decomp', 'bleed', 'ascites', 'kidney', 'infection', 'he'];
const FIT_TESTS = ['cirrhosis', 'hvpg_ge', 'compensated', 'ascites', 'varices_not_high_risk', 'varices_medium_large', 'gastric_varices', 'acute_bleed', 'tips', 'no_tips'];

test('a trial is two or three arms of percents from 0 to 100 (at most one decimal), the treated arm first, with the words a card needs', () => {
  const shorts = new Set();
  for (const id of TRIAL_IDS) {
    const t = TRIALS[id];
    if (NO_ARMS.has(id)) assert.equal(t.arms.length, 0, `${id}: listed as a trial with no arms`);
    else {
      assert.ok(t.arms.length === 2 || t.arms.length === 3, `${id}: two or three arms`);
      assert.equal(t.arms[0].side, 'treat', `${id}: treated arm first`);
      assert.deepEqual(t.arms.slice(1).map((a) => a.side), t.arms.slice(1).map(() => 'control'), `${id}: the other arms are controls`);
    }
    for (const a of t.arms) {
      assert.ok(typeof a.rate === 'number' && a.rate >= 0 && a.rate <= 100 && /^\d{1,3}(\.\d)?$/.test(String(a.rate)), `${id}/${a.label}: a percent from 0 to 100 with at most one decimal`);
      assert.ok(a.n == null || (Number.isInteger(a.n) && a.n > 0 && a.n <= t.n), `${id}/${a.label}: people in the arm`);
      if (a.events != null) {
        assert.ok(Number.isInteger(a.events) && a.events >= 0 && a.n != null && a.events <= a.n, `${id}/${a.label}: events are a whole number of the arm's people`);
        // (The reported percent is the count's share: within a point for a whole percent, a tenth for one decimal, as reported, cut or rounded.)
        assert.ok(Math.abs((100 * a.events) / a.n - a.rate) < (Number.isInteger(a.rate) ? 1 : 0.1), `${id}/${a.label}: ${a.events} of ${a.n} is ${a.rate}%`);
        assert.equal(t.km, false, `${id}: counted events are not Kaplan–Meier rates`);
      }
    }
    assert.ok(Number.isInteger(t.n) && t.n > 0, `${id}: n`);
    assert.ok(['lower', 'higher'].includes(t.better), `${id}: better`);
    for (const k of ['name', 'short', 'journal', 'firstAuthor', 'setting', 'endpoint', 'verified']) assert.ok(typeof t[k] === 'string' && t[k].trim(), `${id}: ${k}`);
    assert.ok(t.followUp === null || (typeof t.followUp === 'string' && t.followUp.trim()), `${id}: followUp is words or null`);
    assert.ok(t.short.length <= 22, `${id}: short "${t.short}" is at most 22 characters`);
    assert.ok(!shorts.has(t.short), `${id}: short "${t.short}" is not another trial's`); shorts.add(t.short);
    assert.ok(GROUPS.includes(t.group), `${id}: group ${t.group}`);
    assert.ok(typeof t.pmid === 'string' && /^\d+$/.test(t.pmid), `${id}: pmid`);
    assert.ok(t.doi === null || /^10\.\d{4,}\//.test(t.doi), `${id}: doi`);
    assert.equal(typeof t.km, 'boolean', `${id}: km`);
    // (Ratios: the trial's own, with a 95% CI around the estimate.)
    assert.ok(Array.isArray(t.ratios), `${id}: ratios`);
    for (const r of t.ratios) {
      assert.ok(['HR', 'OR', 'RR'].includes(r.kind), `${id}: ratio kind ${r.kind}`);
      assert.ok([r.est, r.lo, r.hi].every((x) => Number.isFinite(x) && x > 0) && r.lo <= r.est && r.est <= r.hi, `${id}: ${r.kind} ${r.est} (${r.lo}–${r.hi}) has lo ≤ est ≤ hi`);
      assert.ok(typeof r.of === 'string' && r.of.trim(), `${id}: a ratio names its endpoint`);
      assert.ok(r.vs == null || (typeof r.vs === 'string' && r.vs.trim()), `${id}: vs`);
    }
    if (t.arms.length > 2) for (const r of t.ratios) assert.ok(r.vs, `${id}: a three-arm trial's ratio names its comparison`);
    // (Baveno VIII statement numbers, panel.statement, no repeats; the trials.md test above ties each to the section that found it in the PDF.)
    assert.ok(Array.isArray(t.bav) && t.bav.every((b) => /^[1-9]\.\d{1,2}$/.test(b)) && new Set(t.bav).size === t.bav.length, `${id}: bav`);
    // (Entry rules: short sentence-case words, a test from the trial-fit vocabulary or null, a value only for a test that compares one.)
    assert.ok(Array.isArray(t.entry) && t.entry.length > 0, `${id}: entry rules`);
    for (const e of t.entry) {
      assert.ok(typeof e.rule === 'string' && /^[A-Z0-9]/.test(e.rule) && !/\.$/.test(e.rule), `${id}: rule "${e.rule}" is sentence case with no full stop`);
      assert.ok(e.test === null || FIT_TESTS.includes(e.test), `${id}: test ${e.test} is in the vocabulary or null`);
      if (e.test === 'hvpg_ge') assert.ok(Number.isFinite(e.value) && e.value > 0, `${id}: hvpg_ge has a value`);
      else assert.equal(e.value, undefined, `${id}: only a comparing test has a value`);
    }
    for (const k of ['setting', 'followUp', 'endpoint', 'effect', 'note']) assert.ok(t[k] == null || !/\b(utilize|leverage|crucial|important to note)\b/i.test(t[k]), `${id}: ${k} is plain`);
  }
});

test('a slide names only a trial the app lists, and an unchecked one only where the list allows', () => {
  const decks = [...DECKS, DEMO_ALL];
  let used = 0;
  for (const d of decks) for (const s of d.slides) {
    if (s.tool?.kind !== 'trial') continue;
    used++;
    assert.ok(trialOf(s.tool.id), `${d.id}/${s.id}: trial "${s.tool.id}" is not in src/ui/trials.js and guidelines/trials.md`);
    assert.ok(TRIALS[s.tool.id].status === 'checked' || MAY_BE_UNCHECKED.has(`${d.id}/${s.id}`), `${d.id}/${s.id}: its trial's numbers have not been read against the paper`);
  }
  assert.ok(used >= 1, 'the Testing deck shows the card');
  assert.equal(trialTool({ id: 'predesci' }), true);
  assert.equal(trialTool({ id: 'nope' }), false);
  assert.equal(trialOf('constructor'), null, 'an id is a key of the list, never a property of Object');
});

test('the tool is registered in package H with its trial\'s name as the title, and the type is the trial host\'s', () => {
  assert.equal(EXT.owner.tools.trial, 'H');
  assert.equal(teaching.tools.trial.title({ id: 'predesci' }), 'PREDESCI');
  assert.equal(teaching.tools.trial.short({ id: 'rifaximin' }), 'Rifaximin before TIPS');
  assert.equal(teaching.tools.trial.title({ id: 'nope' }), 'Trial');
  assert.equal(HOSTS.trial({ scale: { sm: 13 } }), 13);
  // (Every look the drawing asks for is in the table, and the table holds no trial look the drawing never asks for.)
  const asked = new Set();
  for (const id of TRIAL_IDS) for (const st of ['checked', 'unchecked']) {
    const L = trialLayout({ ...TRIALS[id], status: st }, 360, 12, measure);
    for (const x of [...L.texts, ...L.rects]) asked.add(x.look);
  }
  for (const k of asked) assert.ok(LOOKS[k], `${k} is in the looks table`);
  for (const k of Object.keys(LOOKS).filter((x) => x.startsWith('trial.'))) assert.ok(asked.has(k), `${k} is used by the card`);
});

test('wrapWords cuts at the width, keeps the words and ends a cut line with an ellipsis', () => {
  const m = (s, f) => measure(s, f);
  const text = 'Cirrhosis with ascites that came back after at least two large-volume paracenteses';
  const lines = wrapWords(text, 200, 12, 500, m, 4);
  assert.equal(lines.join(' '), text);
  for (const l of lines) assert.ok(m(l, '500 12px Inter') <= 200 + 1e-6, `"${l}" fits`);
  const cut = wrapWords(text, 120, 12, 500, m, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…') && m(cut[1], '500 12px Inter') <= 120 + 1e-6);
  assert.deepEqual(wrapWords('', 100, 12, 500, m, 3), []);
});

test('the drawing keeps every word and bar inside the card, the bars proportional to the rates, at phone to desktop widths', () => {
  for (const id of TRIAL_IDS) for (const W of [240, 320, 420, 620]) for (const f of [12, 14]) {
    const t = TRIALS[id], L = trialLayout(t, W, f, measure);
    assert.ok(L.H > 0 && Number.isInteger(L.H), `${id}@${W}: a height`);
    for (const r of L.rects) assert.ok(r.x >= 0 && r.x + r.w <= W + 1e-6 && r.y >= 0 && r.y + r.h <= L.H, `${id}@${W}: ${r.look} inside`);
    for (const s of L.texts) {
      const wt = { 'trial.arm': 650, 'trial.eff': 650, 'trial.pct': 700, 'trial.warn': 600 }[s.look] ?? 500;
      const w = measure(s.t, `${wt} ${f}px Inter`), x0 = s.anchor === 'end' ? s.x - w : s.x;
      assert.ok(x0 >= -1e-6 && x0 + w <= W + 1e-6, `${id}@${W}/${f}: "${s.t}" inside (${x0.toFixed(1)}..${(x0 + w).toFixed(1)})`);
      assert.ok(s.y <= L.H, `${id}@${W}: "${s.t}" above the foot`);
      assert.ok(LOOKS[s.look], `${s.look} exists`);
    }
    const bars = L.rects.filter((r) => r.look === 'trial.bar');
    assert.equal(bars.length, t.arms.length, `${id}@${W}: a bar per arm`);
    bars.forEach((b, i) => assert.ok(Math.abs((b.w / W) * 100 - t.arms[i].rate) < 1e-6, `${id}@${W}: bar ${i} is the rate ${t.arms[i].rate} on a 0 to 100 scale`));
    assert.equal(L.rects.filter((r) => r.look === 'trial.track').length, t.arms.length);
    const words = L.texts.map((s) => s.t);
    for (const a of t.arms) assert.ok(words.includes(`${a.rate}%`) && words.includes(a.label), `${id}@${W}: ${a.label} and its percent`);
    assert.ok(words.includes(trialSource(t) + ` · ${t.n} randomized`) || words.some((w) => w.startsWith(t.journal) || w.endsWith('randomized')), `${id}@${W}: the source line`);
    assert.deepEqual(trialLayout(t, W, f, measure), L, `${id}@${W}: the same drawing every time`);
  }
});

test('a trial not yet read against its paper says so on the card, in the handout and to a screen reader; a checked one does not', () => {
  const t = { ...TRIALS.predesci, status: 'unchecked' };
  assert.ok(trialLayout(t, 400, 12, measure).texts.some((s) => s.t === UNCHECKED && s.look === 'trial.warn'));
  assert.ok(!trialLayout(TRIALS.predesci, 400, 12, measure).texts.some((s) => s.look === 'trial.warn'));
  assert.ok(trialLines(t).includes(UNCHECKED));
  assert.ok(!trialLines(TRIALS.predesci).includes(UNCHECKED));
  assert.match(trialWords(t), /Not yet checked against the paper\.$/);
  assert.doesNotMatch(trialWords(TRIALS.predesci), /Not yet checked/);
  assert.match(trialWords(TRIALS.predesci), /Beta-blocker 16%, Placebo 27%/);
});
