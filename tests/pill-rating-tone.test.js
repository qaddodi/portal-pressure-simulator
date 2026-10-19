// A filled pill (the patient's live value) is coloured as its tile rates it: green, amber or red, like the tile's bar
// (Mohammad, 19 Oct). After TIPS the PPG pill reads against its target, as its tile does. Outlined pills (rules) stay plain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateShown, tileShown, tipsGoal, RATE } from '../src/ui/table-marks.js';

const SRC = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const line = (re) => SRC.match(re)[0];
const code = [line(/const VAL_TONE = .*/), line(/const BY_RATE = .*/), line(/const PILL_TONE = .*/), line(/const pillRate = .*/), line(/const valTone = .*/)].join('\n');
const { valTone, pillRate } = new Function('rateShown', 'tileShown', 'tipsGoal', `${code}\nreturn { valTone, pillRate };`)(rateShown, tileShown, tipsGoal);

test('a rated pill takes its rating colour, in every band', () => {
  assert.equal(valTone('ppg', { ppg: 4 }), '--ok');
  assert.equal(valTone('ppg', { ppg: 8.5 }), '--caution');
  assert.equal(valTone('ppg', { ppg: 14 }), '--danger');
  assert.equal(valTone('hvpg', { hvpg: 6.4 }), '--caution');
  assert.equal(valTone('pv', { pv: 12 }), '--caution');
  assert.equal(valTone('spleen', { spleen: 11 }), '--ok');
});

test('it judges the number it prints, as the tile does', () => {
  assert.equal(pillRate('ppg', { ppg: 11.96 }), rateShown('ppg', { ppg: 11.96 })[0]);
  assert.equal(pillRate('ppg', { ppg: 11.96 }), 'hi');   // (prints 12.0)
});

test('after TIPS the PPG pill reads against its target, as its tile', () => {
  assert.equal(valTone('ppg', { ppg: 8.5 }, true), '--ok');
  assert.equal(valTone('ppg', { ppg: 13 }, true), '--danger');
  assert.equal(pillRate('ppg', { ppg: 11.96 }, true), 'hi');
});

test('an unrated value keeps its station colour; no reading, no rating colour', () => {
  assert.ok(!RATE.whvp);
  assert.equal(valTone('whvp', { whvp: 18 }), 'wedge');
  assert.equal(valTone('fhvp', { fhvp: 8 }), 'hv');
  assert.equal(valTone('pv', null), 'pv');
  assert.equal(valTone('spleen', null), null);
  assert.equal(valTone('hr', { hr: 55 }), undefined);   // (a slow rate is information, not a warning: plain)
});

test('the pill carries its rating, and its colour eases', () => {
  assert.match(SRC, /'data-rate': PILL_TONE\[rate\] \? rate : null/);
  assert.match(SRC, /valTone\(mk, fp, tips\), pillRate\(mk, fp, tips\)/);
  assert.match(SRC, /rich\(s\.line, s, st\?\.fp, !!st\?\.params\?\.tips\?\.on\)/);
  assert.match(CSS, /\.pz-val\.tone \{ transition: background-color \.4s var\(--ease\), box-shadow \.4s var\(--ease\), color \.4s var\(--ease\); \}/);
  // (Rules stay outlined and plain.)
  assert.match(CSS, /\.pz-val\.cut \{ background: transparent;/);
});
