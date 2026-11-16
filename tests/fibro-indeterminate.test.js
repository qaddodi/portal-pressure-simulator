// Tests > Fibro: a liver stiffness from 15 to 25 kPa is Baveno VIII's indeterminate zone whatever the platelet count (Fig. 1, 1.15 to 1.17),
// and the bar says what to do next instead of stopping at "not ruled in or out" (review of 16 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { stiffLayout, stiffWords, verdictOf, indeterminate, INDETERMINATE_NOTE, RULE_NOTE } from '../src/ui/stiff-bar.js';

const meas = (s, font) => s.length * 0.56 * parseFloat(/([\d.]+)px/.exec(font)[1]);

test('LSM 23.7 kPa with platelets 90 stays "not ruled in or out" (Baveno VIII has no platelet rule-in) and names the next step', () => {
  assert.deepEqual(verdictOf(23.7, 90), ['CSPH not ruled in or out', 'mid']);
  assert.equal(indeterminate(23.7), true);
  assert.match(stiffWords(23.7, 90), /CSPH not ruled in or out\. Next: an ANTICIPATE probability or a spleen stiffness, or re-evaluate in 12 months\./);
  const L = stiffLayout(320, 12, meas, { lsm: 23.7, plt: 90, note: true });
  assert.ok(L.texts.some((t) => t.look === 'stiff.note' && /ANTICIPATE/.test(t.t)));
});

test('only 15 to 25 kPa is the indeterminate zone; the other readings keep the rule-of-five note', () => {
  for (const v of [8, 12, 15, 25, 30, NaN, null]) assert.equal(indeterminate(v), false, String(v));
  for (const v of [15.1, 20, 24.9]) assert.equal(indeterminate(v), true, String(v));
  const L = stiffLayout(320, 12, meas, { lsm: 30, plt: 90, note: true });
  assert.ok(L.texts.some((t) => t.look === 'stiff.note' && /Rule of 5/.test(t.t)));
  assert.ok(!/Next:/.test(stiffWords(30, 90)));
  assert.ok(!/Next:/.test(stiffWords(12, 200)));
});

test('the note cites Baveno VIII only, and the spleen bar is unchanged', () => {
  assert.match(INDETERMINATE_NOTE, /Baveno VIII/);
  assert.ok(!/Baveno VII\b(?! ?I)/.test(INDETERMINATE_NOTE + RULE_NOTE));
  const S = stiffLayout(320, 12, meas, { lsm: 48, organ: 'spleen', note: true });
  assert.ok(!S.texts.some((t) => /ANTICIPATE/.test(t.t) && /From 15/.test(t.t)));
  assert.ok(!/Next:/.test(stiffWords(48, null, 'spleen')));
});
