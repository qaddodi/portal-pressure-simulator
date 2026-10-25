// The teaching features of 25 Oct (review/deck-teaching-ideas/recommendations.md, Mohammad's "All"): the answer hold on question slides,
// the criteria card, Predict, the case card's question, self-study and the new cards. Each is opt-in: a built-in slide uses one only where
// tests/deck-adopted.js lists it, and the presenter's wiring is checked here from its source.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { criteriaRow, criteriaRows, criteriaMet, criteriaReading, CRITERIA_MAX } from '../src/ui/tool-criteria.js';
import teaching from '../src/ui/ext-teaching.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const slidesUsing = (f) => DECKS.flatMap((d) => d.slides.filter((s) => s[f] !== undefined).map((s) => [d, s]));

test('hold: only adopted question slides use it, each a true flag on a slide with a card and no preset answer', () => {
  const used = slidesUsing('hold');
  assert.ok(used.length >= 11, 'Where is the resistance? and Read the Doppler hold their question slides');
  for (const [d, s] of used) {
    assert.ok(adopted(d, s, 'hold'), `${d.id}/${s.id}: hold is opt-in (tests/deck-adopted.js)`);
    assert.equal(s.hold, true, `${d.id}/${s.id}: hold is true`);
    assert.ok(!s.visual && (s.tool || s.data), `${d.id}/${s.id}: a held slide has a data card to hold`);
    assert.ok(!s.site, `${d.id}/${s.id}: a question slide names no level`);
  }
  for (const d of DECKS.filter((x) => x.id === 'where-resistance' || x.id === 'read-doppler')) {
    for (const s of d.slides.filter((x) => /^q\d$/.test(x.id))) assert.equal(s.hold, true, `${d.id}/${s.id} holds its answer`);
  }
});

test('hold: the presenter sets it out of sight and lets the answer slide ease it in once it has landed', () => {
  const p = src('presenter.js');
  assert.match(p, /function holdAnswer\(on, instant = false\)/);
  assert.match(p, /holdAnswer\(!s\.visual && \(!!s\.hold \|\| holdEase/);
  assert.match(p, /paintOverlays\(s, to, st\);\n\s*if \(holdEase\) \{ holdEase = false; holdAnswer\(false\); \}/);
  assert.match(src('presenter-tools.js'), /holdAnswer\(on, instant = false\) \{ cur\?\.hold\?\.\(!!on, instant\); \}/);
  const prof = src('tool-profile.js');
  assert.match(prof, /new Set\(held \? \[\] : blocksOf\(goal, healthy\(\)\)\)/, 'held, the chart asks for no red blocks (they fade out as any block does)');
  assert.match(prof, /if \(hk < 0\.005\) return \[\];/, 'held, the brackets ease out');
  // (CSS: the rating words, the Doppler's words and the figure's alerts fade, never snap.)
  assert.match(css, /\.pz-data\[data-held\] \.pzt-r, \.pz-data\[data-held\] \.pz-tool :is\(\.dop-dir, \.dop-pattern, \.dop-note\) \{ opacity: 0; \}/);
  assert.match(css, /\.pz-data \.pzt-r, \.pz-data \.pz-tool :is\(\.dop-dir, \.dop-pattern, \.dop-note\) \{ transition: color \.4s var\(--ease\), opacity \.5s var\(--ease\); \}/);
  assert.match(css, /\.app\.pz-held \.lb-alert \{ fill-opacity: 0; \}/);
});


test('criteria card: rows read in every written form, at most four, live rows judged as their tile prints them', () => {
  assert.deepEqual(criteriaRow('Child–Pugh C'), { text: 'Child–Pugh C', note: null, lit: false, key: null, op: null, value: null });
  assert.deepEqual(criteriaRow(['HVPG 20 mmHg or more', 'hvpg', '>=', 20]), { text: 'HVPG 20 mmHg or more', note: null, lit: false, key: 'hvpg', op: '>=', value: 20 });
  assert.equal(criteriaRow({ text: 'x', key: 'hvpg', op: '~', value: 3 }).key, null, 'an unknown comparison is a plain row');
  assert.equal(criteriaRow({ text: '  ' }), null);
  assert.equal(criteriaRows({ rows: ['a', 'b', 'c', 'd', 'e'] }).length, CRITERIA_MAX);
  const r = criteriaRow(['HVPG 20 or more', 'hvpg', '>=', 20]);
  assert.equal(criteriaMet(r, { hvpg: 19.96 }), true, '19.96 prints as 20.0, so it meets 20 or more');
  assert.equal(criteriaMet(r, { hvpg: 19.94 }), false);
  assert.equal(criteriaMet(r, {}), null);
  assert.equal(criteriaReading(r, { hvpg: 21.34 }), '21.3 mmHg');
  const asc = criteriaRow(['No ascites', 'asc', '<', 0.15]);
  assert.equal(criteriaMet(asc, { asc: 40 }), true, 'ascites in mL reads in L, as its tile');
  assert.equal(criteriaMet(asc, { asc: 900 }), false);
  assert.equal(teaching.tools.criteria.title({ title: 'Sarin classes' }), 'Sarin classes');
});

test('criteria card: only adopted slides use it, each with 1 to 4 rows of words, and none keeps the same list in causes', () => {
  const used = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'criteria').map((s) => [d, s]));
  assert.ok(used.length >= 7);
  for (const [d, s] of used) {
    assert.ok(adopted(d, s, 'kind:criteria'), `${d.id}/${s.id}: the criteria card is opt-in (tests/deck-adopted.js)`);
    const rows = criteriaRows(s.tool);
    assert.equal(rows.length, s.tool.rows.length, `${d.id}/${s.id}: every row has words`);
    assert.ok(rows.length >= 1 && rows.length <= CRITERIA_MAX, `${d.id}/${s.id}: 1 to 4 rows`);
    assert.ok(s.tool.title && s.tool.title.length <= 36, `${d.id}/${s.id}: a short card title`);
    assert.ok(!s.causes, `${d.id}/${s.id}: the rules live in the card, not in the causes line a phone drops`);
    for (const r of rows) assert.ok(r.text.length <= 70, `${d.id}/${s.id}: "${r.text}" fits a row`);
  }
  const src2 = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src2, /s\.tool\?\.kind !== 'criteria'/, 'its tiles sit under it, never beside: the rules are sentences');
});

test('predict: only adopted slides ask, each on a slide that changes the same patient, with 2 to 4 short choices and a right one', () => {
  const used = slidesUsing('predict');
  assert.ok(used.length >= 5, 'Circuit 6, Blood volume 3, Variceal bleed 4, Next bleed 4 and Beta-blockers 7 ask first');
  for (const [d, s] of used) {
    const p = s.predict, at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'predict'), `${at}: Predict is opt-in (tests/deck-adopted.js)`);
    assert.ok(!s.preset && !s.vignette && !s.visual && !s.cath, `${at}: Predict changes the patient already on screen`);
    assert.ok(s.lapse || s.params || s.action || s.days, `${at}: the answer is the model's own change`);
    assert.ok(typeof p.q === 'string' && p.q.trim().endsWith('?'), `${at}: the question asks`);
    assert.ok(p.q.split(/\s+/).length < 45, `${at}: the question is under 45 words, as a line`);
    assert.ok(!p.title || p.title.length <= 60, `${at}: a short predict title`);
    assert.ok(Array.isArray(p.options) && p.options.length >= 2 && p.options.length <= 4, `${at}: 2 to 4 choices`);
    for (const o of p.options) assert.ok(typeof o === 'string' && o.length <= 26, `${at}: "${o}" is a short choice`);
    assert.ok(Number.isInteger(p.answer) && p.options[p.answer], `${at}: answer names a choice`);
  }
});

test('predict: lands on the state before, asks, and plays the change as the answer only on its reveal', () => {
  const p = src('presenter.js');
  assert.match(p, /const predictable = \(s, to, ct\) => !!ui && !booting && !s\.visual && !ct && !s\.vignette && predictOk\(s\.predict\) && to > 0 && to === lastAt \+ 1 && !s\.preset/);
  assert.match(p, /const si = lap \|\| ask \? stateOf\[to - 1\] : stateOf\[to\];/, 'it lands on the slide before\'s state');
  assert.match(p, /if \(ask\) \{ pred = \{ i: to, s, gen: g \}; return; \}/, 'nothing plays until the reveal');
  assert.match(p, /if \(pred && shown\?\.i === pred\.i && want === pred\.i\) \{ predictReveal\(-1\); return; \}/, 'Next reveals first');
  assert.match(p, /if \(s\.lapse\) await playLapse\(s, i, \(\) => !mine\(\)\);/);
  assert.match(p, /const done = await morphTo\(end, \(\) => !mine\(\), reduce\.matches \? 0 : MORPH_MS, false\);/, 'the change eases, never snaps');
  assert.match(p, /holdAnswer\(!s\.visual && \(!!s\.hold \|\| holdEase \|\| predArm\?\.i === i\), true\);/);
  // (The card is sized for both words, one grid cell; the reveal cross-fades.)
  assert.match(css, /\.pz-swap > :is\(\.pz-pa, \.pz-pb\) \{ grid-area: 1 \/ 1;/);
  assert.match(css, /\.pz-text\.pz-asking:not\(\.pz-told\) > \.pz-pwait \{ opacity: 0; visibility: hidden;/);
  assert.match(src('handout.js'), /<p class="cap">Predict<\/p>/, 'the handout prints the question and its answer');
});

test('case-card question: only adopted case slides end on one, a question, the case and its question together under 220 characters', () => {
  const used = slidesUsing('caseQ');
  assert.ok(used.length >= 15);
  for (const [d, s] of used) {
    const at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'caseQ'), `${at}: the case-card question is opt-in (tests/deck-adopted.js)`);
    assert.ok(s.vignette && s.preset, `${at}: only on a slide with a case`);
    assert.ok(/^[A-Z].*\?$/.test(s.caseQ) && !s.caseQ.slice(0, -1).includes('?'), `${at}: one question`);
    assert.ok(`${s.vignette} ${s.caseQ}`.length < 220, `${at}: case and question under 220 characters (${`${s.vignette} ${s.caseQ}`.length})`);
  }
  assert.match(src('presenter.js'), /s\.caseQ \? h\('p', \{ class: 'pz-case-p pz-case-q' \}, nb\(s\.caseQ\)\) : null/, 'its own line on the card, fitted with the case');
});

test('self-study: a per-viewer setting, off by default, that shows each slide\'s handout question with its answer hidden', () => {
  const p = src('presenter.js');
  assert.match(p, /const STUDY = 'pps\.selfStudy';/);
  assert.match(p, /localStorage\.getItem\(STUDY\) === '1'/, 'off unless this device turned it on');
  assert.match(p, /const q = studyOn && s && !s\.visual \? askOf\(s\) : null;/, 'content slides with a question only');
  assert.match(p, /el\.dataset\.sig !== sig \|\| !now/, 'each slide opens closed, its answer hidden');
  assert.match(p, /settings: \(\) => \(\{[^}]*study: studyOn, setStudy \}\)/);
  assert.match(src('main.js'), /menuToggle\(ps\.study, 'book', 'Self-study'/, 'the switch in Settings while presenting');
  // It leaves with the teaching card, under a case card and on a black screen, and the answer eases open; the teaching card is not touched.
  assert.match(css, /\.pz-study\.pz-leave, \.pz-case:not\(\[hidden\]\) ~ \.pz-study, \.app\.pz-blacked \.pz-study \{ opacity: 0;/);
  assert.match(css, /\.pzq-a \{ display: grid; grid-template-rows: 0fr;[^}]*transition: grid-template-rows/);
  assert.match(css, /\.pz-study\.told \.pzq-a, \.pz-study\.pzq-fit \.pzq-a \{ grid-template-rows: 1fr; opacity: 1; \}/);
  assert.doesNotMatch(css, /\.pz-study[^{]*\.pz-text/);
  // Every content slide of a built-in deck has a question to show.
  for (const d of DECKS) for (const s of d.slides) if (!s.visual) assert.ok(Array.isArray(s.ask) || typeof s.ask === 'string', `${d.id}/${s.id}: has an ask`);
});
