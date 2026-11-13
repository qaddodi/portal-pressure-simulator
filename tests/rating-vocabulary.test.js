// One vocabulary for a gradient's band (unification audit, findings 3 and 16, 13 Nov 2026). The HVPG's and PPG's bands have one set of
// words, a short and a long form ([short, long]); "Not measurable" is the one wording for a reading that cannot be taken; a number not known
// prints as one glyph, the em dash, and a value still to come in running text as the ellipsis; and the three rating vocabularies (status:
// ok, caution, danger; table rating: ok, mid, hi; colour token: --ok, --caution, --danger) map onto each other through the tables of
// src/engine/pressure-cuts.js. Each card and tile is asked what it prints, so a second wording or a second map that drifts fails here;
// scripts/source-shapes/vocab.mjs keeps a second copy of the words or the maps from being written at all.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HVPG_CUTS, PPG_CUTS, hvpgSev, ppgSev, RATE_OF_SEV, SEV_OF_RATE, TOKEN_OF_SEV, TOKEN_OF_RATE, HVPG_WORDS, PPG_WORDS, BLEED_WORD,
  hvpgWord, ppgWord, NOT_MEASURABLE, NOT_SHOWN, VALUE_PENDING,
} from '../src/engine/pressure-cuts.js';
import { RATE } from '../src/ui/table-marks.js';
import { valueText, valueTone, widest } from '../src/ui/callout-math.js';
import { scanReadingText } from '../src/ui/scan-ease.js';
import { xCutName } from '../src/ui/tool-curve.js';
import { PLANES } from '../src/ui/visual-plane.js';
import { fmt, fmtFlow } from '../src/ui/util.js';

const SEVS = ['ok', 'caution', 'danger'];
// Every tenth from below zero to well past the bleed line, and each cut-off exactly.
const VALUES = [...Array.from({ length: 421 }, (_, i) => (i - 20) / 10), HVPG_CUTS.amber, HVPG_CUTS.red, HVPG_CUTS.bleed, PPG_CUTS.amber, PPG_CUTS.red];

test('the band words are the standard, short and long, and frozen', () => {
  assert.deepEqual(HVPG_WORDS, { ok: ['Normal', 'Normal'], caution: ['Mild', 'Mild portal hypertension'], danger: ['CSPH', 'Clinically significant portal hypertension (CSPH)'] });
  assert.deepEqual(PPG_WORDS, { ok: ['Normal', 'Normal'], caution: ['High', 'Portal hypertension'], danger: [BLEED_WORD, 'Portal hypertension with a risk of variceal bleeding'] });   // (the long forms: the PPG by IR's result line, ir-ppg.js)
  assert.equal(BLEED_WORD, 'Bleed risk');
  for (const W of [HVPG_WORDS, PPG_WORDS]) {
    assert.ok(Object.isFrozen(W));
    assert.deepEqual(Object.keys(W), SEVS);
    for (const s of SEVS) assert.ok(Object.isFrozen(W[s]) && W[s].length === 2, s);
  }
  for (const v of VALUES) {
    assert.equal(hvpgWord(v), HVPG_WORDS[hvpgSev(v)][0], `hvpg ${v}`);
    assert.equal(hvpgWord(v, true), HVPG_WORDS[hvpgSev(v)][1], `hvpg ${v} long`);
    assert.equal(ppgWord(v), PPG_WORDS[ppgSev(v)][0], `ppg ${v}`);
  }
});

test('the three rating vocabularies map onto each other, both ways', () => {
  assert.deepEqual({ ...SEV_OF_RATE }, { ok: 'ok', mid: 'caution', hi: 'danger' });
  assert.deepEqual({ ...TOKEN_OF_SEV }, { ok: '--ok', caution: '--caution', danger: '--danger' });
  assert.deepEqual({ ...TOKEN_OF_RATE }, { ok: '--ok', mid: '--caution', hi: '--danger' });
  for (const s of SEVS) {
    assert.equal(SEV_OF_RATE[RATE_OF_SEV[s]], s);
    assert.equal(TOKEN_OF_RATE[RATE_OF_SEV[s]], TOKEN_OF_SEV[s]);
  }
  for (const m of [SEV_OF_RATE, TOKEN_OF_SEV, TOKEN_OF_RATE]) assert.ok(Object.isFrozen(m));
});

test('the readout tiles name the band with the short word, and say "Not measurable" for a blocked vein', async () => {
  const { TILES } = await import('../src/ui/dock.js');
  const hv = TILES.find((t) => t.id === 'hvpg'), pp = TILES.find((t) => t.id === 'ppg');
  for (const v of VALUES) {
    assert.equal(hv.s(v), hvpgWord(v), `hvpg tile ${v}`);
    assert.equal(pp.s(v), ppgWord(v), `ppg tile ${v}`);
  }
  assert.equal(NOT_MEASURABLE, 'Not measurable');
});

test('the summary tables rate and name the bands as the tiles do', () => {
  for (const v of VALUES) {
    assert.deepEqual([...RATE.hvpg(v)], [RATE_OF_SEV[hvpgSev(v)], hvpgWord(v)], `hvpg ${v}`);
    assert.deepEqual([...RATE.ppg(v)], [RATE_OF_SEV[ppgSev(v)], ppgWord(v)], `ppg ${v}`);
    assert.deepEqual([...RATE.eus(v)], [RATE_OF_SEV[hvpgSev(v)], hvpgWord(v)], `eus ${v}`);
  }
});

test('the treatment menu\'s dots and the figure\'s callouts take the rating\'s colour from the one map', async () => {
  const M = await import('../src/ui/tool-menu.js');
  for (const v of VALUES) {
    assert.equal(M.ratingTok(v), SEV_OF_RATE[RATE.ppg(v, {})[0]], `menu dot ${v}`);
    const tone = valueTone('ppg', { ppg: v });
    assert.ok(tone === null || Object.values(TOKEN_OF_SEV).includes(tone), `callout ${v}: ${tone}`);
  }
  assert.equal(valueTone('ppg', { ppg: PPG_CUTS.red + 1 }), TOKEN_OF_SEV.danger);
  assert.equal(valueTone('ppg', { ppg: PPG_CUTS.amber - 1 }), TOKEN_OF_SEV.ok);
});

test('the cut-off lines are named with the band words', () => {
  assert.equal(xCutName('hvpg', HVPG_CUTS.red), HVPG_WORDS.danger[0]);
  const p = PLANES['hvpg-ppg'];
  assert.equal(p.lineNames.x[HVPG_CUTS.red], `${HVPG_WORDS.danger[0]} ≥${HVPG_CUTS.red}`);
  assert.equal(p.lineNames.y[PPG_CUTS.red], `${BLEED_WORD} ≥${PPG_CUTS.red}`);
});

test('a number not known prints as the one em dash; in running text a value to come is the ellipsis', () => {
  assert.equal(NOT_SHOWN, '—');
  assert.equal(VALUE_PENDING, '…');
  for (const x of [null, undefined, NaN, Infinity]) {
    assert.equal(fmt(x, 1), NOT_SHOWN);
    assert.equal(fmtFlow(x), NOT_SHOWN);
  }
  assert.equal(scanReadingText(null, null, null), NOT_SHOWN, 'the FibroScan probe\'s screen');
  assert.equal(valueText('ppg', {}), VALUE_PENDING, 'a callout\'s live value');
  assert.equal(widest(VALUE_PENDING), '88.8', 'a callout keeps room for the number to come');
});
