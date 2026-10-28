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
import { ZONES, keyLine } from '../src/ui/tool-criteria.js';

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

test('Stiffness, the first visit: a graph of distinct zones, the EGD area hatched over them, short key lines in symbols (his G2, 27 Oct)', () => {
  const s = DECKS.find((d) => d.id === 'stiffness').slides.find((x) => x.id === 'rules');
  assert.equal(s.tool.zones, 'first-visit');
  const z = ZONES['first-visit'];
  // Baveno VIII 1.15, 1.16, 1.19: ruled out ≤15 kPa with PLT ≥150K, ruled in ≥25 kPa, the gray zone between; the EGD skipped at <20 kPa with PLT ≥150K.
  assert.deepEqual(z.zones.filter((a) => a.name).map((a) => [a.name, a.x, a.y]), [['No CSPH', [5, 15], [150, 250]], ['Gray', [15, 25], [50, 250]], ['CSPH', [25, 35], [50, 250]]]);
  assert.deepEqual([z.hatch.x, z.hatch.y], [[5, 20], [150, 250]], 'the EGD area: <20 kPa with PLT ≥150K');
  assert.deepEqual(z.xTicks, [15, 20, 25]);
  const keys = s.tool.key.map(keyLine);
  assert.equal(keys[0].swatch, 'hatch', 'the hatched area named first, with the same hatch');
  for (const k of keys) {
    assert.doesNotMatch(k.plain, /\bscope\b|more than|or more|at least/i, `"${k.plain}": EGD and symbols`);
  }
  assert.ok(keys.some((k) => /ANTICIPATE ≥75% or SSM >55 kPa = CSPH/.test(k.plain)), 'what the gray zone tests mean: CSPH');
  assert.ok(keys.some((k) => /BMI ≥30/.test(k.plain)), 'the BMI exception to the 25 kPa rule');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const blk = css.slice(css.indexOf('/* A zones card'), css.indexOf('.pzz-swl'));
  assert.doesNotMatch(blk, /border-(left|right)|box-shadow|ellipsis/, 'no stripe, glow or ellipsis');
  assert.match(blk, /\.pzc-key \{[^}]*align-items: center;[^}]*text-align: center;[^}]*font: 500 max\(12px,/, 'the key centred, 12 px or more');
});
