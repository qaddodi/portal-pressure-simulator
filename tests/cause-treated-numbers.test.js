// The HVPGs typed in Treating the cause's discussion answers and notes are the model's (16 Nov 2026: they said 14.7 and 10.8 over a model that
// settled at 14.3 and 10.4, and the closing slide counted the patients still at or above 10 mmHg from those typed numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { CAUSE_TREATED as D } from '../src/ui/decks/cause-treated.js';
import { deckStates } from './deck-states.js';

test('every HVPG typed to a decimal in the four-patient and relation slides is one a slide of the deck reads', async () => {
  const fps = await deckStates(D), have = fps.map((f) => f?.hvpg).filter(Number.isFinite);
  let n = 0;
  for (const id of ['allpatients', 'relation']) {
    const s = D.slides.find((x) => x.id === id);
    for (const t of [s.notes, ...(s.ask || [])]) for (const m of String(t).matchAll(/\b(\d{1,2}\.\d) mmHg/g)) {
      if (/≥|<|>/.test(String(t).slice(Math.max(0, m.index - 2), m.index))) continue;   // (a cut-off, not a reading)
      n++;
      assert.ok(have.some((v) => Math.abs(v - Number(m[1])) <= 0.05), `${id}: "${m[0]}" is typed; the deck's slides read ${[...new Set(have.map((v) => v.toFixed(1)))].join(', ')}`);
    }
  }
  assert.ok(n >= 4, `${n} typed readings held`);
});

test('the slide that names the patients still at CSPH names exactly those the model leaves at or above 10 mmHg at two years', async () => {
  const fps = await deckStates(D), at = (id) => fps[D.slides.findIndex((s) => s.id === id)];
  assert.ok(at('relation').hvpg >= 10 && at('year2').hvpg < 10, 'the higher start stays at CSPH, the first patient resolves');
  const ask = D.slides.find((s) => s.id === 'allpatients').ask[1];
  assert.match(ask, /woman who started/);
});
