// The TIPS deck cites Baveno VIII and no other guideline (Mohammad's rule, relayed 17 Nov 2026), and gives no post-TIPS gradient target: Baveno VIII sets none
// (its Table 3 only says the immediate post-TIPS PPG may not represent the long-term one). Studies (a Doppler series) are not guidelines and may be named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPS_COMPLETE as D } from '../src/ui/decks/tips-complete.js';

const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const OTHER = /\b(AASLD|EASL|APASL|ESGE|ACG|BSG|SIR|CIRSE|Baveno\s+(?:V|VI|VII|IV|III)\b)/;

test('no slide, check, objective or note cites a guideline other than Baveno VIII', () => {
  for (const t of strings(D)) assert.ok(!OTHER.test(t), `"${t.match(OTHER)?.[0]}" in "${t.slice(0, 140)}"`);
});

test('the deck does cite Baveno VIII (so the scan above holds something)', () => {
  assert.ok(strings(D).filter((t) => /Baveno VIII/.test(t)).length >= 15);
});

test('no typed post-TIPS gradient target: 12 mmHg is neither a target nor a reference on any slide', () => {
  for (const t of strings(D)) assert.ok(!/(<|≥|>=|under|below|above)\s?12\s?mmHg|12 mmHg\s+(target|reference)/i.test(t), `"${t.slice(0, 140)}"`);
});
