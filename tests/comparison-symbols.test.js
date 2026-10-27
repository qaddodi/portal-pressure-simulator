// A comparison is a symbol, never words (Mohammad, 26 Oct: "don't be shy to use > instead of 'more than'... your usage sucks, something
// 150,000+, sometimes 'more than'"): > < ≥ ≤ in every card, tile, table, pill and instrument text, "≥150,000/µL", "<20 kPa", never
// "150,000+", "more than 6 months", "5 or more", "under 10 kPa". The speaker notes (the Print notes handout) stay prose, and so do
// comparatives with no number ("lowers the HVPG more than propranolol") and durations ("Over 3 weeks she has developed").
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { CUT, RATE, cutText } from '../src/ui/table-marks.js';
import { criteriaRows, cutParts } from '../src/ui/tool-criteria.js';

const WORDS = /\b(more|less|fewer|greater|higher|lower) than [\d{]|\d[\d,.]*(?:\/µL|%)?\+(?![\w])|(?:[\d}%)*]|mmHg|kPa|mm|cm\/s|g\/dL|mg\/dL|µL|points?|months?|weeks?|days?|hours?|minutes?|liters?|L) or (more|less|fewer|higher|lower|greater|above|below|over|under)\b|\b(one|two|three|four|five|six) or (more|fewer)\b|\bat (least|most) [\d{]|\b(over|under|above|below) [\d{]|\bat or (above|below)\b|\bjust (above|below)\b|\b(age|aged) \d+ or (over|more|older)\b/i;
// What stays, with its reason: a range's edge ("above 10 to 12" is not one cut-off) and a duration in a case story.
const KEEP = ['Above 10 to 12 mmHg', 'Over 3 weeks'];

function strings(v, path, out) {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) if (k !== 'notes') strings(v[k], `${path}.${k}`, out);
  return out;
}

test('no deck words a comparison as words: symbols, in every title, line, check, card row and table note (notes stay prose)', () => {
  const bad = [];
  for (const d of DECKS) for (const [p, t] of strings(d, '', [])) if (WORDS.test(t) && !KEEP.some((k) => t.includes(k))) bad.push(`${d.id}${p}: ${t.slice(0, 120)}`);
  assert.deepEqual(bad, []);
});

test('the tables\' cut-off heading and the response tile write their cut-offs with symbols', () => {
  for (const [k, c] of Object.entries(CUT)) assert.doesNotMatch(c, WORDS, `${k}: "${c}"`);
  assert.equal(CUT.pv, '↑ >10, ↑↑ ≥15 mmHg');
  assert.equal(CUT.plt, '↓ <150, ↓↓ <100 × 10³/µL');
  assert.equal(CUT.hb, '↓ <12, ↓↓ <7 g/dL');
  for (const v of [25, 15, 5]) assert.doesNotMatch(RATE.hvpgFall(v, {})[1], /[a-z]/i, 'the response tile\'s band is a symbol and a number, "<10%" not "Under 10%"');
});

test('a cut-off in the words keeps its sign: {>=10 mmHg} reads "≥10 mmHg"', () => {
  assert.equal(cutText('>=10 mmHg'), '≥10 mmHg');
  assert.equal(cutText('<= 12 mmHg'), '≤12 mmHg');
  assert.equal(cutText('> 5 mm'), '>5 mm');
  assert.equal(cutText('≥25 kPa'), '≥25 kPa');
  assert.equal(cutText('6 to 8 g'), '6 to 8 g');
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /out\.push\(pill\(cutText\(mk\), mkStop, ' cut'\)\)/, 'the pill shows the sign');
  assert.match(pres, /const VAL = String\.raw`\(\?:\[<>≥≤\]\\s\?\)\?/, 'a value with a unit and a sign before it is one pill, "<10 kPa"');
  const hand = readFileSync(new URL('../src/ui/handout.js', import.meta.url), 'utf8');
  assert.match(hand, /return cutText\(mk\)/, 'the printed handout keeps the sign too');
});

test('the legend ends and the model\'s checks use the symbol, not a trailing plus or "at least"', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /'12\+'|'15\+'/);
  assert.match(main, /\[100, '≥12'\]/);
  const ver = readFileSync(new URL('../src/version.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ver, /at least [\d]|below (HVPG )?12/);
});

test('Stiffness, the first visit: the platelets sit with the kPa cut-off on one line, both values read together, lowest kPa first', () => {
  const s = DECKS.find((d) => d.id === 'stiffness').slides.find((x) => x.id === 'rules');
  const rows = criteriaRows(s.tool), withPlt = rows.filter((r) => r.and);
  assert.equal(withPlt.length, 2, 'the rule-out and the scope-sparing rule each take platelets');
  for (const r of withPlt) {
    assert.ok(cutParts(r.cut)?.unit === 'kPa', `${r.text}: its cut-off is the stiffness`);
    assert.match(r.and, /^PLT ≥150K$/, 'the platelet cut-off, a symbol and the number, short enough for the cut-off\'s own line');
    assert.doesNotMatch(r.text, /150,000|platelets/i, 'the row\'s words do not say it again');
  }
  assert.deepEqual(rows.map((r) => r.cut), ['≤15 kPa', '<20 kPa', '15–25 kPa', '≥25 kPa'], 'the rows run from the lowest kPa to the highest');
  const js = readFileSync(new URL('../src/ui/tool-criteria.js', import.meta.url), 'utf8');
  assert.match(js, /r\.and \? h\('span', \{ class: 'pzc-and' \}, `\+ \$\{r\.and\}`\) : null/, 'the second condition is set inside the cut-off\'s own cell');
  assert.match(js, /\.\.\.\(r\.and \? \{\} : \{ 'aria-hidden': 'true' \}\)/, 'a screen reader reads a cell that holds more than the row\'s words');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pzc-and \{[^}]*font: 500 max\(12px,/, 'on the cut-off\'s own line, 12 px or more');
  assert.doesNotMatch(css.slice(css.indexOf('.pzc-and {'), css.indexOf('.pzc-and {') + 120), /display: block/, 'not a second line');
  assert.doesNotMatch(css.slice(css.indexOf('.pzc-and {'), css.indexOf('.pzc-and {') + 400), /border-(left|right)|box-shadow|ellipsis/, 'no stripe, glow or ellipsis');
});
