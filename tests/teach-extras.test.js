// Deck visuals package D (review/deck-visuals-recs.md V22, V23, V24, V15): live numbers in equations, a source line, the
// ladder's earlier state and the summary tables' opt-in cells. All opt-in: no built-in deck sets any of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { deckStates } from './deck-states.js';
import { fillEq, eqFilled, eqValue, eqText, eqRate, eqAddsUp, citeOk, citeText, cellsMode, barsOn, barShares, focusOf, ladderFromOf } from '../src/ui/teach-extras.js';
import { handoutHTML } from '../src/ui/handout.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = async () => {
  const out = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (d) out.push(d);
  }
  return out;
};
const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, mt = (x) => `<mtext>${x}</mtext>`;
// The three identities a deck can fill, in the two-row form the guide shows (letters over the case's numbers).
const two = (a, b) => `<mtable><mtr><mtd>${a}</mtd></mtr><mtr><mtd>${b}</mtd></mtr></mtable>`;
const HVPG = two(mi('HVPG') + mo('=') + mi('WHVP') + mo('−') + mi('FHVP'), '{whvp}' + mo('−') + '{fhvp}' + mo('=') + '{hvpg}' + mt(' mmHg'));
const PPG = two(mi('PPG') + mo('=') + mi('P') + mo('−') + mi('P'), '<mn>{pv}</mn>' + mo('−') + '<mn>{ivc}</mn>' + mo('=') + '<mn>{ppg}</mn>');
const SAAG = two(mi('SAAG') + mo('=') + mi('Alb') + mo('−') + mi('Alb'), '{salb}' + mo('−') + '{aalb}' + mo('=') + '{saag}' + mt(' g/dL'));

test('no built-in deck uses package D fields yet, and none of their equations carries a token', async () => {
  for (const d of await decks()) for (const s of d.slides) {
    for (const k of ['cite', 'ladderFrom', 'cells', 'bars', 'focusRow']) assert.equal(s[k], undefined, `${d.id}/${s.id} sets ${k}`);
    if (s.eq) assert.equal(eqFilled(s.eq[0]), false, `${d.id}/${s.id}`);
  }
});

test('a filled HVPG, PPG or SAAG equation adds up on every slide of every deck', async () => {
  const bad = [];
  for (const d of await decks()) {
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      const fp = fps[i];
      for (const [name, ml] of [['HVPG', HVPG], ['PPG', PPG], ['SAAG', SAAG]]) if (!eqAddsUp(ml, fp)) bad.push(`${d.id}/${s.id} ${name}: ${fillEq(ml, fp, () => null, true)}`);
      // (the HVPG and PPG the equation shows are the tiles' own: the fingerprint's tenth gap)
      if (Number.isFinite(fp.hvpg) && Number.isFinite(fp.whvp)) assert.equal(eqText('hvpg', fp), (Math.round(fp.hvpg * 10) / 10).toFixed(1).replace('-', '−'), `${d.id}/${s.id}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('tokens: the readings to their tile decimals, a result in its rating colour, unknown tokens left alone', () => {
  const fp = { whvp: 18.04, fhvp: 5.96, hvpg: 12.1, pv: 20.2, ivc: 4.1, ppg: 16.1, salb: 3.04, saag: 1.66, asc: 4000, plt: 88.4 };
  assert.equal(eqValue('hvpg', fp), 12);   // (18.0 − 6.0 as shown, not the model's 12.1)
  assert.equal(eqText('whvp', fp), '18.0');
  assert.equal(eqText('plt', fp), '88');
  assert.equal(eqText('aalb', fp), '1.3');   // (serum 3.0 less SAAG 1.7: what the two shown numbers leave)
  assert.equal(eqText('pv', {}), '—');
  assert.equal(eqRate('hvpg', fp), 'hi');
  assert.equal(eqRate('whvp', fp), null);
  assert.equal(eqRate('ppg', { pv: 16.2, ivc: 6.5 }), 'mid');
  assert.equal(eqRate('ppg', { pv: 16.2, ivc: 6.5 }, true), 'ok');   // (after TIPS the PPG is read against its target, as its pill)
  assert.equal(eqRate('hvpg', { whvp: 9, fhvp: 2, hvpg: 7 }), 'mid');
  const out = fillEq('{whvp}' + mo('−') + '<mn>{fhvp}</mn>' + mo('=') + '{hvpg} {nope}', fp);
  assert.match(out, /<mn class="eq-v" data-k="whvp">18\.0<\/mn>/);
  assert.match(out, /<mn class="eq-v" data-k="fhvp">6\.0<\/mn><mo>/);   // (an <mn> around a token is not doubled)
  assert.match(out, /data-k="hvpg" data-rate="hi">12\.0</);
  assert.match(out, /\{nope\}/);
  assert.match(fillEq('{hvpg@before}', null, (id) => (id === 'before' ? { whvp: 10, fhvp: 4 } : null)), /data-at="before" data-rate="mid">6\.0</);
  assert.equal(eqFilled(mi('HVPG') + mo('=') + mi('WHVP')), false);
  assert.equal(eqFilled('{nope}'), false);
  assert.ok(eqAddsUp(HVPG, fp));
  assert.equal(eqAddsUp('{whvp}' + mo('−') + '{fhvp}' + mo('=') + '{ppg}', fp), false);   // (a wrong identity is caught)
  assert.ok(eqAddsUp(mi('Q') + mo('×') + mi('R'), fp));   // (letters only: nothing to add up)
});

test('cite: Baveno VIII, EASL 2025 or AASLD 2024, never Baveno VII', () => {
  assert.ok(citeOk('Baveno VIII 1.15, 1.16'));
  assert.ok(citeOk('EASL 2025 · AASLD 2024'));
  assert.equal(citeOk('Baveno VII 1.1'), false);
  assert.equal(citeOk('baveno vii'), false);
  assert.equal(citeOk(''), false);
  assert.equal(citeText('  Baveno VIII 5.4 '), 'Baveno VIII 5.4');
});

test('table and ladder fields read only their own values', () => {
  assert.equal(cellsMode({ cells: 'values' }), 'values');
  assert.equal(cellsMode({ cells: 'change' }), 'change');
  assert.equal(cellsMode({ cells: 'arrows' }), null);
  assert.equal(cellsMode({}), null);
  assert.equal(barsOn({ bars: true }), false);   // (bars only behind numbers)
  assert.equal(barsOn({ bars: true, cells: 'values' }), true);
  assert.deepEqual(barShares([10, 20, NaN, -40, 0]), [0.25, 0.5, 0, 1, 0]);
  assert.deepEqual(barShares([0, 0]), [0, 0]);
  assert.equal(focusOf({ focusRow: 'tips' }), 'tips');
  assert.equal(focusOf({ focusRow: '' }), null);
  assert.deepEqual(ladderFromOf({ ladderFrom: true }), { prev: true });
  assert.deepEqual(ladderFromOf({ ladderFrom: 'base' }), { id: 'base' });
  assert.equal(ladderFromOf({}), null);
  assert.equal(ladderFromOf({ ladderFrom: false }), null);
});

test('the handout prints a filled equation and the source line', () => {
  const d = { id: 'x', title: 'X', mine: true, slides: [{ id: 'a', title: 'A', line: 'L', eq: [HVPG, 'legend'], cite: 'Baveno VIII 1.15' }] };
  const html = handoutHTML(d, '', [{ whvp: 18, fhvp: 6, hvpg: 12 }]);
  assert.match(html, /<mn>18\.0<\/mn><mo>−<\/mo><mn>6\.0<\/mn><mo>=<\/mo><mn>12\.0<\/mn>/);
  assert.match(html, /<p class="cite">Baveno VIII 1\.15<\/p>/);
  assert.doesNotMatch(html, /\{whvp\}/);
});

test('presenter wiring: the equation follows the model, the cite line and the ladder\'s earlier state are drawn', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /if \(eqFilled\(s\.eq\?\.\[0\]\)\) eqTo\(ui\.text, f, /, 'dataTo keeps the equation live');
  assert.equal((src.match(/citeEl\(s\)/g) || []).length, 2, 'the cite line on the words card and on a panel slide');
  assert.match(src, /if \(lad\) ladderFromTo\(s, i\);/);
});
