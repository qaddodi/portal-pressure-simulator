// The question card (deck rebuild plan A2): the case card's glass with one short question and no new patient. It replaces Predict, which
// asked with choices, kept an answer and held the numbers back. A slide carries question: '...'; the slide is its answer. Each rule here
// is one the decks must keep and the presenter's wiring is checked from its source, as the other teaching-feature tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { keepData, keepText } from '../src/ui/card-keep.js';
import { handoutHTML } from '../src/ui/handout.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const presenter = read('../src/ui/presenter.js');
const css = read('../styles/app.css');
const asked = DECKS.flatMap((d) => withOverview(d).slides.map((s, i, all) => ({ d, s, i, all }))).filter(({ s }) => s.question !== undefined);

test('question cards: the four Predict slides and the bleed deck two ask first, each adopted and under 100 characters with no number in it', () => {
  assert.deepEqual(asked.map(({ d, s }) => `${d.id}/${s.id}`).sort(), ['beta-blockers/carv-pre', 'circuit/both', 'hyperdynamic/loss', 'next-bleed/slough', 'variceal-bleed/band', 'variceal-bleed/minutes']);
  for (const { d, s } of asked) {
    const at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'question'), `${at}: a question card is opt-in (tests/deck-adopted.js)`);
    assert.equal(typeof s.question, 'string');
    assert.ok(s.question.length < 100, `${at}: under 100 characters (${s.question.length})`);
    assert.ok(/^[A-Z][^?]*\?$/.test(s.question), `${at}: one question`);
    assert.ok(!/\d/.test(s.question), `${at}: no number in the question`);
  }
});

test('question cards: never with a case, a catheter, a procedure or a held answer, and the slide answers it', () => {
  for (const { d, s } of asked) {
    const at = `${d.id}/${s.id}`;
    for (const f of ['vignette', 'caseQ', 'preset', 'cath', 'procedure', 'hold']) assert.equal(s[f], undefined, `${at}: a question card and ${f} on one slide`);
    const changes = !!(s.lapse || s.params || s.action || s.days);
    assert.ok(changes || s.compare || s.whatIf || s.visual, `${at}: the slide changes the model, or has a control the learner moves, or is a visual`);
  }
});

test('question cards: never twice in a row, at most one in any three slides, one per section and three per deck', () => {
  const byDeck = new Map();
  for (const a of asked) byDeck.set(a.d.id, [...(byDeck.get(a.d.id) || []), a]);
  for (const [id, list] of byDeck) {
    assert.ok(list.length <= 3, `${id}: at most three question cards`);
    for (let k = 1; k < list.length; k++) assert.ok(list[k].i - list[k - 1].i >= 3, `${id}: ${list[k - 1].s.id} and ${list[k].s.id} are under three slides apart`);
    const secs = list.map(({ s }) => (s.sec ? s.sec[0] : s.kicker));
    assert.equal(new Set(secs).size, secs.length, `${id}: two question cards in one section`);
  }
});

test('the presenter asks it only going forward one step, on the case card\'s glass, with no camera retreat and no new patient', () => {
  assert.match(presenter, /const questionable = \(s, to, ct\) => !!ui && !booting && !noCase && typeof s\.question === 'string' && !!s\.question\.trim\(\) && !ct && !s\.vignette && !s\.preset && !s\.procedure && to > 0 && to === lastAt \+ 1;/);
  assert.match(presenter, /cardUp\('Question', h\('p', \{ class: 'pz-case-p' \}, nb\(s\.question\)\)\)/, 'the pill says Question');
  assert.match(presenter, /cardUp\('Case', h\('p', \{ class: 'pz-case-p' \}, nb\(s\.vignette\)\)/, 'the case card shares the same card');
  const run = presenter.slice(presenter.indexOf('async function questionRun'), presenter.indexOf('// Lifted (tap, Next, a swipe anywhere)'));
  assert.ok(run.length > 80);
  for (const retreat of ['toAnatomy', 'fitSlow', 'morphTo', 'liveOff']) assert.ok(!run.includes(retreat), `the question card path does not call ${retreat}`);
  // (a slide cannot be jumped to or gone back to with a card: it is asked only when its number follows the last one shown)
  assert.match(presenter, /else if \(ask\) \{ if \(!await questionRun\(s, cut\)\) return; \}/);
});

test('a slide that changes the model lands holding the state before it and plays its change after the lift', () => {
  assert.match(presenter, /const ask = questionable\(s, to, ct\), holdQ = ask && !s\.visual && \(!!s\.lapse \|\| changes\(s\)\);/);
  assert.match(presenter, /const si = lap \|\| holdQ \? stateOf\[to - 1\] : stateOf\[to\];/, 'it lands on the slide before\'s state');
  assert.match(presenter, /const said = lap \|\| holdQ \? await stateReady\(stateOf\[to\]\) : st;/);
  assert.match(presenter, /if \(lap\) await playLapse\(s, to, cut\);\n\s*else if \(holdQ\) await answerPlay\(s, to, cut\);/, 'its change plays after its cards are in');
  // (the card is lifted before the camera and the cards move: the case card's own waits)
  assert.match(presenter, /if \(caseCard\) \{ await caseLifted\(cut\); if \(cut\(\)\) return; \}/);
  const play = presenter.slice(presenter.indexOf('async function answerPlay'), presenter.indexOf('// ── The answer held back ──'));
  assert.match(play, /const done = await morphTo\(end, cut, reduce\.matches \? 0 : MORPH_MS, false\);/, 'the change eases, never snaps');
  assert.match(play, /dataTo\(s, liveFp\(fr\), ref, 280\)/, 'the numbers follow the model as it eases');
  assert.ok(!play.includes('holdAnswer'), 'nothing is held back on a question card');
});

test('a slide with a question keeps no card from the slide before and gives none to the next', () => {
  const plain = { tool: { kind: 'doppler' }, data: 'tiles', tiles: ['pv'] }, asking = { ...plain, question: 'Will it rise?' };
  const plan = JSON.stringify([plain.tool, plain.data, ['pv'], false, null, '', null, false, false, false]);
  assert.equal(keepData({ from: plan, to: plan, prev: plain, next: plain }), true, 'the same card stays between plain slides');
  assert.equal(keepData({ from: plan, to: plan, prev: plain, next: asking }), false, 'its cards are built after the card is lifted');
  assert.equal(keepData({ from: plan, to: plan, prev: asking, next: plain }), false);
  assert.equal(keepText({ from: 'a', to: 'a', prev: asking, next: plain }), false);
});

test('the handout prints the question before the slide\'s words, with no answer line', () => {
  const html = handoutHTML({ title: 'T', mine: true, slides: [{ id: 'a', title: 'The slide title', question: 'Will it rise?', line: 'It rises.' }] });
  const q = html.indexOf('<p class="cap">Question</p><p>Will it rise?</p>');
  assert.ok(q > 0, 'the question is printed');
  assert.ok(q < html.indexOf('<h2>The slide title</h2>'), 'before the slide\'s title');
  assert.ok(!/Answer:/.test(html.slice(q, q + 200)), 'the slide is its answer');
});

test('Predict is gone: no choices, chips, reveal, answer line, handout block or Settings row remains', () => {
  for (const [name, text] of [['presenter.js', presenter], ['app.css', css], ['handout.js', read('../src/ui/handout.js')]]) {
    assert.doesNotMatch(text, /predictReveal|predictOk|predictable|predArm|pz-pchip|pz-pchips|pz-asking|pz-told|pz-pwait|predictText/, `${name} still has Predict`);
  }
  for (const { d, s } of DECKS.flatMap((d) => d.slides.map((s) => ({ d, s })))) assert.equal(s.predict, undefined, `${d.id}/${s.id} still has predict`);
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const f of walk(new URL('../src/ui', import.meta.url).pathname)) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /selfStudy|Self-study|pzq-h\b/, `${f}: a study setting`);
  }
  // (The quick check's rows keep their own "Show answer"; the question card path has none.)
  const card = presenter.slice(presenter.indexOf('function cardUp'), presenter.indexOf('// Lifted (tap, Next, a swipe anywhere)')) + presenter.slice(presenter.indexOf('async function answerPlay'), presenter.indexOf('// ── The answer held back ──'));
  assert.doesNotMatch(card, /Show answer|answer line|aria-pressed|pz-abb/, 'no choices and no Show answer on the question card path');
  assert.match(css, /\.pz-case-p \{/, 'the case card\'s own words style serves the question');
});
