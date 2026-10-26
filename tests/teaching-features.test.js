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
import { criteriaRow, criteriaRows, criteriaMet, criteriaReading, criteriaHasCase, cutParts, verdictParts, CRITERIA_MAX } from '../src/ui/tool-criteria.js';
import teaching from '../src/ui/ext-teaching.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const slidesUsing = (f) => DECKS.flatMap((d) => d.slides.filter((s) => s[f] !== undefined).map((s) => [d, s]));

test('hold: only adopted question slides use it, each a true flag on a slide with a card and no preset answer', () => {
  const used = slidesUsing('hold');
  // (No count asserted: the deck rebuild (E4) took Where is the resistance? off hold, after Stiffness took in the first visit's five. The
  // feature stays in the presenter for a deck that adopts it.)
  for (const [d, s] of used) {
    assert.ok(adopted(d, s, 'hold'), `${d.id}/${s.id}: hold is opt-in (tests/deck-adopted.js)`);
    assert.equal(s.hold, true, `${d.id}/${s.id}: hold is true`);
    assert.ok(!s.visual && (s.tool || s.data), `${d.id}/${s.id}: a held slide has a data card to hold`);
    assert.ok(!s.site, `${d.id}/${s.id}: a question slide names no level`);
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
  assert.deepEqual(criteriaRow('Child–Pugh C'), { text: 'Child–Pugh C', bold: null, note: null, lit: false, met: null, cut: null, key: null, op: null, value: null });
  assert.deepEqual(criteriaRow(['HVPG 20 mmHg or more', 'hvpg', '>=', 20]), { text: 'HVPG 20 mmHg or more', bold: null, note: null, lit: false, met: null, cut: null, key: 'hvpg', op: '>=', value: 20 });
  assert.deepEqual(criteriaRow({ text: 'C', cut: ' C 10–13 ', note: 'C 10', met: true }), { text: 'C', bold: null, note: 'C 10', lit: false, met: true, cut: 'C 10–13', key: null, op: null, value: null });
  assert.equal(criteriaRow({ text: 'C', met: 'yes' }).met, null, 'met is true, false or unsaid');
  assert.deepEqual(criteriaRow('Child–Pugh B, **over 7**, bleeding'), { ...criteriaRow('Child–Pugh B, over 7, bleeding'), bold: ['Child–Pugh B, ', 'over 7', ', bleeding'] }, 'numbers in bold; the plain words for the handout and the label');
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

test('criteria card V3: cut-offs split for the sans signs and units, the bold lead of the verdict, the case column only with a case', () => {
  assert.deepEqual(cutParts('≥20 mmHg'), { sign: '≥', num: '20', unit: 'mmHg' }, 'the serif has no ≥: the sign is set apart');
  assert.deepEqual(cutParts('C 10–13'), { sign: '', num: 'C 10–13', unit: '' });
  assert.deepEqual(cutParts('15–25 kPa'), { sign: '', num: '15–25', unit: 'kPa' });
  assert.equal(cutParts(''), null);
  assert.deepEqual(verdictParts('He qualifies on the first rule: a TIPS within 72 hours.'), { bold: 'He qualifies on the first rule:', rest: 'a TIPS within 72 hours.' });
  assert.deepEqual(verdictParts('No colon here.'), { bold: '', rest: 'No colon here.' });
  assert.equal(verdictParts('  '), null);
  assert.equal(criteriaHasCase({ rows: ['a', 'b'] }), false, 'a plain list keeps its full width, no case column');
  assert.equal(criteriaHasCase({ rows: ['a', { text: 'b', note: 'not B' }] }), true);
  assert.equal(criteriaHasCase({ rows: [['No ascites', 'asc', '<', 0.15]] }), true, 'a live reading is the case\'s own value');
});

test('criteria card, plain rules (his pick 26 Oct, C with D\'s key words): a mark per row, numerals when ordered, key words marked, a foot line for a lead that follows its list', () => {
  const used = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'criteria').map((s) => [d, s]));
  for (const [d, s] of used) {
    const t = s.tool, id = `${d.id}/${s.id}`, rows = criteriaRows(t);
    if (rows.some((r) => r.cut)) continue;
    for (const r of rows) if (!r.lit) assert.ok(r.bold, `${id}: "${r.text}" marks its key words with **...**`);
    assert.equal(!!t.ordered, /order/i.test(t.lead || ''), `${id}: a list that says "in this order" is ordered, and only that list`);
  }
  const look = DECKS.find((d) => d.id === 'encephalopathy').slides.find((s) => s.tool?.title === 'Look first for').tool;
  assert.equal(look.lead, undefined, '"Treating them" reads after the list it points at');
  assert.deepEqual(verdictParts(look.verdict), { bold: '', rest: 'Treating them comes first.' });
  const src = readFileSync(new URL('../src/ui/tool-criteria.js', import.meta.url), 'utf8');
  assert.match(src, /classList\.toggle\('ordered', t\?\.ordered === true\)/);
  assert.match(src, /classList\.toggle\('has-lit', rows\.some\(\(r\) => r\.lit\)\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* Plain rules, no cut-off column'), css.indexOf("/* A case card's own question"));
  assert.ok(block.length > 400);
  assert.doesNotMatch(block, /border-(left|right)|inset \d+px 0 0|box-shadow: inset [^0]/, 'no side stripes: a ring is an outline all round');
  assert.match(block, /\.pzc-row:not\(\.pzc-hrow\) \.pzc-c::before \{[^}]*border-radius: 50%[^}]*transition: background-color \.4s var\(--ease\), box-shadow \.4s var\(--ease\)/, 'a ring, its fill easing with the reading');
  assert.match(block, /\[data-lit\], \[data-met="yes"\]\) \.pzc-c::before \{ background: var\(--text\)/, 'filled: the row that applies to the case');
  assert.match(block, /counter-increment: pzcn; content: counter\(pzcn\)/, 'numerals when the order matters');
  assert.match(block, /\.pz-crit\.has-lit:not\(\.has-cut\) \.pzc-row:not\(\[data-lit\]\) \.pzc-t > b \{ font-weight: 500/, 'key words go quiet on the rows that do not apply');
  assert.match(block, /\.pz-crit:not\(\.has-cut\) \.pzc-row:not\(\.pzc-hrow\) \{ font-size: 1\.12em; \}/, 'the words a step larger, the case header unchanged');
});

test('criteria card V3 in the decks: every rule pill is cited in its slide\'s notes, short leads, cut-offs and verdicts, one row met at most', () => {
  const used = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'criteria').map((s) => [d, s]));
  for (const [d, s] of used) {
    const t = s.tool, id = `${d.id}/${s.id}`;
    if (t.rule != null) {
      const m = /^(Baveno VIII|AASLD 2024) ([\d.]+(?:, [\d.]+)*)$/.exec(t.rule);
      assert.ok(m, `${id}: the pill names one guideline and its statements ("${t.rule}")`);
      for (const n of m[2].split(', ')) assert.ok(new RegExp(`\\b${n.replace('.', '\\.')}\\b`).test(s.notes || ''), `${id}: ${m[1]} ${n} is cited in the slide's notes (a pill only for a sourced rule)`);
    }
    if (t.lead != null) assert.ok(typeof t.lead === 'string' && t.lead.length <= 48 && /\.$/.test(t.lead), `${id}: one short lead sentence`);
    if (t.verdict != null) assert.ok(verdictParts(t.verdict) && t.verdict.length <= 70, `${id}: a verdict on one or two lines`);
    const rows = criteriaRows(t);
    assert.ok(rows.filter((r) => r.met === true).length <= 1, `${id}: the case meets one row at most`);
    for (const r of rows) {
      if (r.cut) assert.ok(cutParts(r.cut) && r.cut.length <= 10, `${id}: "${r.cut}" is a short cut-off`);
      if (r.note) assert.ok(r.note.length <= 20, `${id}: "${r.note}" fits the case column`);
    }
    if (rows.some((r) => r.cut)) assert.ok(rows.filter((r) => r.cut).length >= 2, `${id}: cut-offs on more than one row, or none`);
  }
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* The criteria card'), css.indexOf("/* A case card's own question"));
  assert.ok(block.length > 200);
  assert.doesNotMatch(block, /border-(left|right)|inset \d+px 0 0|box-shadow: inset [^0]/, 'no vertical lines or side stripes in the criteria card (his rule)');
  assert.match(block, /\.pzc-row \{[^}]*font: 400 1\.07em\/1\.35 var\(--font-display\)/, 'the rules in the serif');
  assert.match(block, /\.pzc-end \{[^}]*padding-left: 22px/, 'the case column set apart by space alone');
  assert.match(block, /\.pz-crit \{[^}]*width: 100%/, 'the card full width: a phone had centred it shrunk and pushed the case out');
  for (const [c, n] of [['c', 1], ['t', 2], ['end', 3]]) assert.match(block, new RegExp(`\\.pzc-${c} \\{[^}]*grid-column: ${n};`), `.pzc-${c} in column ${n}, so a hidden cut-off moves nothing`);
  assert.match(block, /\.pz-crit\.has-cut \.pzc-c \{ display: block;/, 'the cut-offs at every width, a phone too (his V3 mock)');
  assert.match(block, /\.pzc-end \{[^}]*white-space: nowrap/, 'the case column on one line (an iPhone wrapped "This case" and "C 10")');
  assert.match(block, /\.pzc-m > i \{[^}]*transition: opacity/, 'the marks of a live row cross-fade, never snap');
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
