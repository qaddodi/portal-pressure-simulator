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

test('a key tile keeps its colours while the others turn grey: no accent line or ring (D5, revised)', () => {
  assert.ok(!/\.pz-tile\.key \{[^}]*--key-w/.test(css), 'no accent line or ring on a key tile');
  assert.match(css, /\.pz-tile\.key \.pzt-k \{ color: var\(--text\); \}/);
  assert.match(css, /\.pz-tiles:has\(\.pz-tile\.key\) \.pz-tile:not\(\.key\) :is\(\.pzt-v, \.pzt-r\) \{ color: var\(--text-2\); \}/);
  assert.match(css, /\.pz-tiles:has\(\.pz-tile\.key\) \.pz-tile:not\(\.key\) \.pzt-bar \{ filter: grayscale\(1\); opacity: \.7; \}/);
});

test('a card title never breaks at its hyphen, and a sideways phone takes the short title (I7)', () => {
  const ct = js.slice(js.indexOf('const cardTitle = '), js.indexOf('// The talk so far'));
  assert.match(ct, /\.replace\(\/-\/g, '\\u2011'\)/);
  assert.match(ct, /innerHeight <= 500/);
});

test('the ladder\'s PPG label sits in its first stretch, apart from the HVPG\'s (A6)', () => {
  assert.match(js, /if \(b\.i0 === 0 && b\.i1 - b\.i0 > 2 && X\(1\) - X\(0\) - w >= 20\) b\.mid = \(X\(0\) \+ X\(1\)\) \/ 2;/);
});

test('a lone folded ladder moves its Show into the teaching card\'s foot (A7)', () => {
  assert.match(js, /function footFold\(\)/);
  assert.match(css, /\.pz-data\.pz-folds\.pz-footfold:not\(\.tool-open\) \{ opacity: 0 !important; pointer-events: none; \}/);
});

test('what-if: a label naming the unit shows the bare number, on the label\'s row on a phone (C1, C2)', () => {
  const deck = readFileSync(new URL('../src/ui/decks/pregnancy.js', import.meta.url), 'utf8');
  assert.match(deck, /label: 'Weeks pregnant'/);
  assert.match(js, /const bare = !!w\.unit && w\.label\.toLowerCase\(\)\.startsWith\(w\.unit\.toLowerCase\(\)\)/);
  assert.match(css, /\.pz\.stack \.pz-wi > \.pzi-t \{ order: 1; \}/);
});

test('a phone card\'s level tag shares the deck tab\'s strip unless it would meet the tab (P1)', () => {
  assert.match(js, /const site = p && t && tabH \? ui\.text\.querySelector\(':scope > \.pz-site'\) : null;/);
  assert.match(js, /site\.getBoundingClientRect\(\)\.right \+ 10 \* k <= tabEl\.getBoundingClientRect\(\)\.left\) lift = Math\.max\(4, \(tabH - site\.offsetHeight\) \/ 2\) - site\.offsetTop;/);
});
