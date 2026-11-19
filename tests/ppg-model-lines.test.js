// §6.2 (external production review, 15 Nov 2026): the PPG's and EUS-PPG's colour lines are the model's reference lines, not guideline cut-offs, and the words that
// say so sit at the point of use: the PPG's long band words and the two caveat sentences here; the tile's description, the table headings and the EUS-PPG's tooltip
// and result line are source-shape rules (scripts/source-shapes/review-fixes.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPG_WORDS, PPG_LINE_NOTE, EUS_LINE_NOTE, PPG_CUTS, HVPG_CUTS } from '../src/engine/portal/pressure-cuts.js';

test('the PPG\'s long band words never read as a guideline category', () => {
  for (const sev of ['ok', 'caution', 'danger']) assert.match(PPG_WORDS[sev][1], /model/, sev);
  assert.ok(!/^Portal hypertension/.test(PPG_WORDS.caution[1]));
});

test('the one caveat sentence names the lines it is about and says they are not guideline cut-offs', () => {
  assert.ok(PPG_LINE_NOTE.includes(String(PPG_CUTS.amber)) && PPG_LINE_NOTE.includes(String(PPG_CUTS.red)));
  assert.match(PPG_LINE_NOTE, /not guideline cut-offs/);
  assert.ok(EUS_LINE_NOTE.includes(String(HVPG_CUTS.amber)) && EUS_LINE_NOTE.includes(String(HVPG_CUTS.red)));
  assert.match(EUS_LINE_NOTE, /not a validated cut-off/);
  assert.match(EUS_LINE_NOTE, /40689144/);
});
