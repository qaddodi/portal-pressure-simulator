// The teaching features of 25 Oct (review/deck-teaching-ideas/recommendations.md, Mohammad's "All"): the answer hold on question slides,
// the criteria card, the case card's question and the new cards (the question card, which replaced Predict, is tested in
// tests/question-card.test.js). Each is opt-in: a built-in slide uses one only where
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
  assert.ok(used.length >= 11, 'Where is the resistance? and Stage the patient at the first visit hold their question slides');
  for (const [d, s] of used) {
    assert.ok(adopted(d, s, 'hold'), `${d.id}/${s.id}: hold is opt-in (tests/deck-adopted.js)`);
    assert.equal(s.hold, true, `${d.id}/${s.id}: hold is true`);
    assert.ok(!s.visual && (s.tool || s.data), `${d.id}/${s.id}: a held slide has a data card to hold`);
    assert.ok(!s.site, `${d.id}/${s.id}: a question slide names no level`);
  }
  for (const d of DECKS.filter((x) => x.id === 'where-resistance')) {
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

test('every content slide of a built-in deck has a question for the handout', () => {
  for (const d of DECKS) for (const s of d.slides) if (!s.visual) assert.ok(Array.isArray(s.ask) || typeof s.ask === 'string', `${d.id}/${s.id}: has an ask`);
});

test('HVPG response tile: hvpgResp adds a live percent fall in the HVPG from a named slide, with 10% and 20% marks', async () => {
  const { RATE, TILE, DERIVED_TILE, SCALE } = await import('../src/ui/table-marks.js');
  assert.deepEqual(SCALE.hvpgFall, [0, 40, [10, 20]]);
  assert.equal(DERIVED_TILE.hvpgFall.u, '%');
  assert.equal(TILE.hvpgFall, undefined, 'worked out by the presenter, not read from the fingerprint');
  assert.deepEqual(RATE.hvpgFall(25, {}), ['ok', '≥ 20%']);
  assert.deepEqual(RATE.hvpgFall(15, { respAt: 14 }), ['mid', '≥ 10%']);
  assert.deepEqual(RATE.hvpgFall(15, { respAt: 12 }), ['ok', '≤12 mmHg'], 'to 12 mmHg or less is a response too');
  assert.deepEqual(RATE.hvpgFall(5, {}), ['hi', 'Under 10%']);
  const used = slidesUsing('hvpgResp');
  assert.ok(used.length >= 4);
  for (const [d, s] of used) {
    const at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'hvpgResp'), `${at}: opt-in (tests/deck-adopted.js)`);
    assert.ok(s.data === 'tiles', `${at}: a tiles slide`);
    assert.ok(s.hvpgResp === true || d.slides.findIndex((x) => x.id === s.hvpgResp) >= 0 && d.slides.findIndex((x) => x.id === s.hvpgResp) < d.slides.indexOf(s), `${at}: counted from an earlier slide`);
  }
  const p = src('presenter.js');
  assert.match(p, /const tileKeys = \(s\) => \[\.\.\.ownKeys\(s\), \.\.\.\(s\.hvpgResp && !s\.tiles\?\.includes\('hvpgFall'\) \? \['hvpgFall'\] : \[\]/, 'the tile joins the slide\'s tiles');
  assert.match(p, /hvpgFall: \(\(base - f\.hvpg\) \/ base\) \* 100/, 'the fall in percent, live');
  assert.match(p, /ui\.tiles\.set\(respFp\(s, now\.fp\)/);
  assert.match(p, /ui\.tiles\.set\(respFp\(s, f\)/);
});

test('Doppler reading grid: grid on a Doppler tool shows Direction, Speed and Shape under the trace, blank while held', () => {
  const used = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.grid !== undefined).map((s) => [d, s]));
  assert.ok(used.length >= 12, 'the ten Doppler slides that read a trace, and TIPS Doppler 9 and 13 (20 slides before Read the Doppler joined Doppler)');
  for (const [d, s] of used) {
    const at = `${d.id}/${s.id}`;
    assert.equal(s.tool.kind, 'doppler', `${at}: a Doppler slide`);
    assert.ok(adopted(d, s, 'tool.grid'), `${at}: opt-in (tests/deck-adopted.js)`);
    assert.ok(s.tool.grid === true || (Array.isArray(s.tool.grid) && s.tool.grid.length && s.tool.grid.every((k) => ['dir', 'speed', 'shape'].includes(k))), `${at}: true or the boxes to tint`);
  }
  const dop = src('doppler.js');
  assert.match(dop, /const GRID = \[\['dir', 'Direction'\], \['speed', 'Speed'\], \['shape', 'Shape'\]\];/);
  assert.match(dop, /setGrid\(it\.dir, none \? 'No flow' : /, 'the same reading as the strip\'s words');
  assert.match(css, /\.pz-data\[data-held\] \.pz-tool \.dop-grid dd \{ opacity: 0; \}/, 'held, the boxes keep their names and leave their readings blank');
});

test('bleed clock: clock on a tiles slide shows the hours since the bleed on a tile\'s own bar, 0 to 72 with the 12 and 72 hour marks', () => {
  const used = slidesUsing('clock');
  assert.ok(used.length >= 8, 'Variceal bleed 3 to 8, Gastric varices 5, Choose the treatment 2');
  for (const [d, s] of used) {
    const at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'clock'), `${at}: opt-in (tests/deck-adopted.js)`);
    assert.equal(s.data, 'tiles', `${at}: in the data card, under the tiles`);
    assert.ok(Number.isFinite(s.clock.at) && s.clock.at >= 0 && s.clock.at <= 72, `${at}: a moment within 72 hours`);
    assert.ok(s.clock.label.length <= 22 && s.clock.label.split(' ').length <= 5, `${at}: a short word for the tile, "${s.clock.label}"`);
  }
  // The clock never runs backward through a deck.
  for (const d of DECKS) { let t = -1; for (const s of d.slides) if (s.clock) { assert.ok(s.clock.at >= t, `${d.id}/${s.id}: later than the slide before`); t = s.clock.at; } }
  const p = src('presenter.js');
  assert.match(p, /export const CLOCK_END = 72, CLOCK_MARKS = \[12, 72\];/);
  assert.match(p, /ui\.clock\.set\(s\.data \? s\.clock : null\);/);
  assert.match(css, /\.pz-clock \.pzb-now \{ transition: left \.6s var\(--ease\)/, 'the dot eases to the slide\'s moment');
});

test('a slide that cannot land is not rebuilt without end (Variceal bleed 3 to 4 froze the talk, 25 Oct)', () => {
  const p = src('presenter.js');
  assert.match(p, /if \(tries > 2\) \{ console\.warn\(`presenter: slide \$\{want \+ 1\} did not land`\); break; \}/, 'the move loop gives up on a slide after two tries');
  const vb = DECKS.find((d) => d.id === 'variceal-bleed').slides.find((s) => s.id === 'minutes');
  assert.equal(vb.predict, undefined, 'Predict is gone: Variceal bleed 4 never had a choice question');
});
