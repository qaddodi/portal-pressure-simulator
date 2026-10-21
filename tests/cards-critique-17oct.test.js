import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCALE, bandsOf } from '../src/ui/table-marks.js';

// Titles, labels and data cards from the design critique Mohammad answered on 17 Oct.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('slide titles: weight 540, no rule under them, the rule\'s room kept as space (T5, T6)', () => {
  assert.match(css, /\n\.pz-h \{ margin: 0; font: 540 /);
  assert.ok(!/\.pz-h::after/.test(css), 'no rule under a title');
  assert.match(css, /\.pz-text \.pz-h, \.pz-ph \.pz-h \{ padding-bottom: calc\(\.3em \+ 2px\); \}/);
});

test('one capital-letter style: 600 weight, .06em spacing, for tile names, the header, the tab, table heads, kickers and figure labels (T4)', () => {
  assert.match(tokens, /--caps-w: 600; --caps-ls: \.06em;/);
  for (const sel of ['.pzt-k {', '.pz-dh {', '.pz-tabname {', '.pz-table thead th {', '.pz-kick {']) {
    const at = css.indexOf('\n' + sel), rule = css.slice(at, css.indexOf('}', at));
    assert.ok(at >= 0, sel);
    assert.match(rule, /var\(--caps-w\)/, `${sel} weight`); assert.match(rule, /letter-spacing: var\(--caps-ls\)/, `${sel} spacing`);
  }
  assert.match(css, /\.sv-region \{ position: absolute;[^}]*font: var\(--caps-w\)[^}]*letter-spacing: var\(--caps-ls\)/, 'figure part labels');
  assert.match(css, /\.lz-zone \{[^}]*font: var\(--caps-w\)[^}]*letter-spacing: var\(--caps-ls\)/, 'lobule zone labels');
  const wi = css.slice(css.indexOf('\n.pzi-k {'), css.indexOf('}', css.indexOf('\n.pzi-k {')));
  assert.ok(!/uppercase/.test(wi), '"What if" in sentence case');
});

test('a scale bar shows all its cut-off numbers or none (D2)', () => {
  const pass = js.slice(js.indexOf("for (const bar of el.querySelectorAll('.pz-tiles .pzt-bar'))"), js.indexOf('fitHeads(el);'));
  assert.match(pass, /clash = true/);
  assert.match(pass, /if \(clash\) for \(const l of ls\) l\.classList\.add\('off'\)/);
});

test('Volume and Output get a plain bar: no bands, no cut-offs (D4)', () => {
  for (const k of ['bv', 'co']) { assert.ok(SCALE[k], k); assert.deepEqual(SCALE[k][2], []); assert.deepEqual(bandsOf(k), []); }
});

test('cards of tiles alone drop their header on every screen, folded cards keep it (D1, DG2)', () => {
  assert.match(css, /\n\.pz \.pz-data\.tiles-only:not\(\.has-tool\):not\(\.pz-folds\) > \.pz-dh \{ display: none; \}/);
});

test('no tile is marked: no accent line, ring, full-ink name or greyed neighbours (D5, 17 Oct)', () => {
  assert.ok(!/\.pz-tile\.key/.test(css), 'no key tile styling');
  assert.ok(!/\.pz-tiles:has\(\.pz-tile\.key\)/.test(css), 'no greyed neighbours');
});

test('a card title never breaks at its hyphen, and a sideways phone takes the short title (I7)', () => {
  const ct = js.slice(js.indexOf('const cardTitle = '), js.indexOf('// The talk so far'));
  assert.match(ct, /\.replace\(\/-\/g, '\\u2011'\)/);
  assert.match(ct, /innerHeight <= 500/);
});

// (A6 and A7 were the old ladder's: its PPG label's stretch and a lone folded ladder's Show in the teaching card's foot. Both went
// with the ladder on 21 Oct, one chart everywhere; the Gut to heart chart labels its brackets inside them (tests/deck-charts.test.js)
// and folds only as an instrument does.)
test('the old ladder\'s A6 and A7 fixes left nothing behind', () => {
  assert.doesNotMatch(js, /b\.i0 === 0 && b\.i1 - b\.i0 > 2|function footFold\(\)|pz-tfold/);
  assert.doesNotMatch(css, /pz-footfold|pz-tfold/);
});

test('what-if: a label naming the unit shows the bare number, on the label\'s row on a phone (C1, C2)', () => {
  const deck = readFileSync(new URL('../src/ui/decks/pregnancy.js', import.meta.url), 'utf8');
  assert.match(deck, /label: 'Weeks pregnant'/);
  assert.match(js, /const bare = !!w\.unit && w\.label\.toLowerCase\(\)\.startsWith\(w\.unit\.toLowerCase\(\)\)/);
  assert.match(css, /\.pz\.stack \.pz-wi > \.pzi-t \{ order: 1; \}/);
});

test('the level tab and the deck tab share the glass\'s top edge; the deck\'s gives way where they would meet (P1)', () => {
  assert.match(js, /const tight = !!\(stab && tabEl && stab\.getBoundingClientRect\(\)\.right \+ 8 \* k > tabEl\.getBoundingClientRect\(\)\.left\);/);
  assert.match(js, /if \(t && tabsTight\(k\)\) ui\.shade\.classList\.add\('pz-tabs-tight'\);/);
  assert.match(js, /const tabH = Math\.max\(tabEl && !tight \? tabEl\.offsetHeight : 0, stab\?\.offsetHeight \|\| 0\);/);
  assert.match(js, /return Math\.max\(16, tabH \+ 8\);/);
  assert.match(js, /const lift = p && t \? glassLift\(k\) : 16;/);
  assert.match(css, /\.pz-sitetab\[hidden\], \.pz-shade\.pz-tabs-tight \.pz-tabname \{ display: none; \}/);
});
