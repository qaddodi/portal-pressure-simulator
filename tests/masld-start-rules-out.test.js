// The MASLD deck's first patient has the state its slide teaches: an LSM ≤15 kPa with platelets ≥150 ×10⁹/L rules CSPH out (Baveno VIII 1.15), and he is settled
// there (his slow organs have caught up), so the weight-loss time-lapse that follows starts from a steady patient and the platelets only rise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MASLD } from '../src/ui/decks/masld.js';
import { deckStates } from './deck-states.js';

test('the MASLD start slide is a patient the rule rules out, and the year of weight loss ends with a fall of 30% or more in the LSM', async () => {
  const st = await deckStates(MASLD), at = (id) => st[MASLD.slides.findIndex((s) => s.id === id)];
  const a = at('start'), b = at('regress');
  assert.ok(a.lsm <= 15 && a.plt >= 150, `LSM ${a.lsm}, platelets ${a.plt}`);
  assert.ok(b.lsm <= a.lsm * 0.7 + 0.05, `LSM ${a.lsm} → ${b.lsm}`);
  assert.ok(b.plt > a.plt, 'the platelets rise');
});
