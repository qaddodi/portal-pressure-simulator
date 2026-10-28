// A figure's numbered markers in the teaching card's words (Mohammad, 26 Oct: "the labels 1, 2, 3, 4 should also show up in the
// teaching cards in a similar way as they appear in the figure"). A slide with `steps: true` numbers its glow entries on the
// figure (V10); its line names each one in the words with {#1} after the phrase that names that site, drawn as the figure's own
// black circle and numeral (presenter.js stepMark, styles/app.css .pz-step). The same number is the same site, so the line and
// the figure can never disagree: every step of such a slide is named once, and no other slide has a marker.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';
import { lineText } from '../src/ui/handout.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const markers = (line) => [...(line || '').matchAll(/\{#(\d+)\}/g)].map((m) => +m[1]);
const ALL = [...DECKS, DEMO_ALL];

test('a slide that numbers its glow names every step in its line once, in the number the figure shows', () => {
  let n = 0;
  const bad = [];
  for (const d of ALL) for (const s of d.slides) {
    const want = s.steps ? (s.glow || []).map((_, i) => i + 1) : [];
    if (s.steps) n++;
    const got = markers(s.line);
    if (got.join() !== want.join()) bad.push(`${d.id}/${s.id}: line has {#${got.join('} {#')}}, figure shows ${want.join(', ') || 'none'}`);
  }
  assert.ok(n >= 3, `${n} numbered slides found (Circulation, Sites, the demo deck)`);
  assert.deepEqual(bad, []);
});

test('the line reads in order: the markers stand in the order of their numbers, each after words', () => {
  for (const d of ALL) for (const s of d.slides) {
    if (!s.steps) continue;
    assert.doesNotMatch(s.line, /(?:^|[.!?]\s)\{#\d+\}/, `${d.id}/${s.id}: a marker follows the phrase it names, never opens a sentence`);
    assert.doesNotMatch(s.line, /\{#\d+\}\s*\{#\d+\}/, `${d.id}/${s.id}: two markers never stand side by side`);
  }
});

test('the presenter draws a marker as the figure\'s circle, ahead of the typed values, and it keeps a typed number its pill', () => {
  const src = read('../src/ui/presenter.js');
  const fn = src.slice(src.indexOf('function rich('), src.indexOf('function wedgeColumn('));
  assert.match(fn, /const marked = \/\\\{\(\?!#\\d\+\\\}\)\[\^\}\]\+\\\}\/\.test\(t\)/, '{#1} is no typed value: a number with a unit keeps its automatic pill');
  assert.match(fn, /else if \(mk && \/\^#\\d\+\$\/\.test\(mk\)\) out\.push\(stepMark\(\+mk\.slice\(1\), mkStop\)\)/);
  assert.ok(fn.indexOf('stepMark(+mk.slice(1)') < fn.indexOf('else if (mk && TILE[mk])'), 'a marker is read before a reading\'s name');
  assert.match(fn, /class: 'pz-step', role: 'img', 'aria-label': `Step \$\{n\}`/, 'a screen reader hears "Step 2", as the figure\'s label says');
  assert.match(fn, /const stepMark = \(n, stop\) => \{ glue\(\);/, 'the word before it and the stop after it stay on its line');
});

test('the marker is the figure\'s dark circle with a light numeral, sized to the words, never under 12 px, inside the line\'s spacing', () => {
  const css = read('../styles/app.css');
  const rule = css.match(/\n\.pz-step \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, '.pz-step has a rule');
  assert.match(rule, /background: var\(--text\)/, 'the figure\'s fill (#labels .lb.fx-step .lb-bg)');
  assert.match(rule, /color: var\(--stage-bg\)/, 'the figure\'s numeral colour (#labels .lb.fx-step text), so it turns light on dark by theme');
  assert.match(rule, /border-radius: var\(--r-pill\)/);
  assert.match(rule, /font-size: max\(12px, \.68em\)/, 'scales with the line (Regular, Compact) and never under 12 px');
  assert.match(rule, /min-width: 1\.5em; height: 1\.5em/, 'a circle, sized from its own type');
  assert.match(rule, /margin-block: -\.3em/, 'the circle stays inside the line\'s 1.4 spacing, so no line grows');
  assert.doesNotMatch(rule, /box-shadow|\bborder:|border-(?:width|color|style|left|top|right|bottom)|gradient|animation|transition/, 'no glow, ring or gradient: the figure\'s marker has none');
  const stage = read('../styles/app.css');
  assert.match(stage, /#labels \.lb\.fx-step \.lb-bg \{ fill: var\(--text\)/);
  assert.match(stage, /#labels \.lb\.fx-step text \{ fill: var\(--stage-bg\)/);
});

test('a printed handout writes a marker as its number in brackets, after the phrase', () => {
  assert.equal(lineText('The first bed is the capillaries {#1}, the second the liver\'s sinusoids {#2}.'), 'The first bed is the capillaries (1), the second the liver\'s sinusoids (2).');
  assert.equal(lineText('The gut {#1} to the heart {#5}. HVPG is {hvpg}.', { hvpg: 11.64 }), 'The gut (1) to the heart (5). HVPG is 11.6 mmHg.');
});
