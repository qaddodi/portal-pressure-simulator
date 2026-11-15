import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsnap } from './unsnap.js';
import { SCALE, bandsOf } from '../src/ui/table-marks.js';
import { appCss, presenterSource } from './split-src.js';

// Titles, labels and data cards from the design critique Mohammad answered on 17 Oct.
const css = appCss();
const js = unsnap(presenterSource());

test('slide titles: weight 540, no rule under them, the rule\'s room kept as space (T5, T6)', () => {
  assert.ok(!/\.pz-h::after/.test(css), 'no rule under a title');
});

test('one capital-letter style: 600 weight, .06em spacing, for tile names, the header, the tab, table heads, kickers and figure labels (T4)', () => {
  for (const sel of ['.pzt-k {', '.pz-dh {', '.pz-tabname {', '.pz-table thead th {', '.pz-kick {']) {
    const at = css.indexOf('\n' + sel), rule = css.slice(at, css.indexOf('}', at));
    assert.ok(at >= 0, sel);
    assert.match(rule, /var\(--caps-w\)/, `${sel} weight`); assert.match(rule, /letter-spacing: var\(--caps-ls\)/, `${sel} spacing`);
  }
  const wi = css.slice(css.indexOf('\n.pzi-k {'), css.indexOf('}', css.indexOf('\n.pzi-k {')));
  assert.ok(!/uppercase/.test(wi), '"What if" in sentence case');
});


test('Volume and Output carry their normal bands now (D4 gave them a plain bar on 17 Oct; Mohammad, 22 Oct: any tile should have its normal)', () => {
  for (const k of ['bv', 'co']) { assert.ok(SCALE[k], k); assert.deepEqual(SCALE[k][2].length, 2, `${k}: low, normal and high`); assert.equal(bandsOf(k).length, 3); }
});

test('no tile is marked: no accent line, ring, full-ink name or greyed neighbours (D5, 17 Oct)', () => {
  assert.ok(!/\.pz-tile\.key/.test(css), 'no key tile styling');
  assert.ok(!/\.pz-tiles:has\(\.pz-tile\.key\)/.test(css), 'no greyed neighbours');
});


// (A6 and A7 were the old ladder's: its PPG label's stretch and a lone folded ladder's Show in the teaching card's foot. Both went
// with the ladder on 21 Oct, one chart everywhere; the Gut to heart chart labels its brackets inside them (tests/deck-charts.test.js)
// and folds only as an instrument does.)


test('the level tab and the deck tab share the glass\'s top edge; the deck\'s gives way where they would meet (P1)', () => {
  assert.match(js, /const tight = !!\(stab && tabEl && stab\.getBoundingClientRect\(\)\.right \+ 8 \* k > tabEl\.getBoundingClientRect\(\)\.left\);/);
  assert.match(js, /const tabH = Math\.max\(tabEl && !tight \? tabEl\.offsetHeight : 0, stab\??\.offsetHeight \|\| 0\);/);
});
