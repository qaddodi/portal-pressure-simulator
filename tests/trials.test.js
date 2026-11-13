// The trial card (tool { kind: 'trial', id }, tool-trial.js, trials.js): every trial it can show is listed in guidelines/trials.md with the
// status the file gives it, its numbers are whole percents, a slide may name only a trial that is listed, and the card's drawing keeps every word and
// bar inside its width. Item 39 of docs/recommendations/deck-content-and-new-decks.md.
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
  }
});

test('a trial is two arms of whole percents from 0 to 100, the treated arm first, with the words a card needs', () => {
  for (const id of TRIAL_IDS) {
    const t = TRIALS[id];
    assert.equal(t.arms.length, 2, `${id}: two arms`);
    assert.deepEqual(t.arms.map((a) => a.side), ['treat', 'control'], `${id}: treated arm first`);
    for (const a of t.arms) {
      assert.ok(Number.isInteger(a.rate) && a.rate >= 0 && a.rate <= 100, `${id}/${a.label}: a whole percent`);
      assert.ok(a.n == null || (Number.isInteger(a.n) && a.n > 0 && a.n <= t.n), `${id}/${a.label}: people in the arm`);
    }
    assert.ok(Number.isInteger(t.n) && t.n > 0, `${id}: n`);
    assert.ok(['lower', 'higher'].includes(t.better), `${id}: better`);
    for (const k of ['name', 'journal', 'firstAuthor', 'setting', 'followUp', 'endpoint']) assert.ok(typeof t[k] === 'string' && t[k].trim(), `${id}: ${k}`);
    assert.ok(t.pmid == null || /^\d+$/.test(t.pmid), `${id}: pmid`);
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
    assert.deepEqual(bars.map((b) => Math.round((b.w / W) * 100)), t.arms.map((a) => a.rate), `${id}@${W}: bars are the rates on a 0 to 100 scale`);
    assert.equal(L.rects.filter((r) => r.look === 'trial.track').length, 2);
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
