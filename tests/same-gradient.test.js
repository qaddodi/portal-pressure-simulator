// "Same gradient, different patient" (src/ui/decks/same-gradient.js): four patients tuned with the engine to the same HVPG, and what differs.
// The deck's whole point is the match and the contrasts, so a change to the engine, a preset or a patient's settings that breaks either
// fails here before the slides say something the figure no longer shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAME_GRADIENT } from '../src/ui/decks/same-gradient.js';
import { deckStates } from './deck-states.js';

const slide = (id) => SAME_GRADIENT.slides.findIndex((s) => s.id === id);
const states = await deckStates(SAME_GRADIENT);
const at = (id) => states[slide(id)];
const FOUR = ['ref', 'up', 'flow', 'shunt'];

test('the four patients read the same HVPG to within a tenth of a millimeter of mercury', () => {
  const h = FOUR.map((id) => at(id).hvpg);
  assert.ok(Math.max(...h) - Math.min(...h) <= 0.1, `HVPGs ${h.join(', ')}`);
  for (const v of h) assert.ok(Math.abs(v - 12) <= 0.2, `an HVPG of ${v} is not 12`);
});

test('presinusoidal resistance raises the PPG and the PPG minus the HVPG, with the HVPG held', () => {
  const ref = at('ref'), up = at('up');
  assert.ok(up.ppg - ref.ppg >= 1, `PPG ${ref.ppg} against ${up.ppg}`);
  assert.ok(up.ppg - up.hvpg >= 2.5 && ref.ppg - ref.hvpg <= 2.5, 'the gap between the gradients');
  assert.ok(up.shunt > ref.shunt && up.liver < ref.liver, 'more of the portal blood bypasses the liver');
});

test('the high-inflow patient carries at least a quarter more portal flow than the reference at the same HVPG', () => {
  assert.ok(at('flow').pvFlow >= at('ref').pvFlow * 1.25, `${at('flow').pvFlow} against ${at('ref').pvFlow}`);
  assert.ok(at('flow').liver > at('ref').liver, 'the liver receives more of its normal flow');
});

test('the shunt patient has a PPG level with the HVPG, a reversed portal flow and the highest encephalopathy risk, with smaller varices and higher platelets', () => {
  const sh = at('shunt'), ref = at('ref');
  assert.ok(Math.abs(sh.ppg - sh.hvpg) <= 0.5, `PPG ${sh.ppg} against HVPG ${sh.hvpg}`);
  assert.ok(sh.pvFlow < 0, 'the portal flow is hepatofugal');
  assert.ok(sh.shunt >= 0.9 && sh.liver <= 55, 'nearly all the portal blood bypasses the liver, which gets little');
  for (const id of ['ref', 'up', 'flow']) assert.ok(sh.he > at(id).he, `the encephalopathy index is not the highest against ${id}`);
  assert.ok(sh.he >= 0.45, 'the index reads High');
  assert.ok(sh.varix < ref.varix && sh.plt > ref.plt, 'the varices are smaller and the platelets higher than in the reference');
});

test('every line that reads another slide\'s value names a slide of the deck', () => {
  const ids = new Set(SAME_GRADIENT.slides.map((s) => s.id));
  for (const s of SAME_GRADIENT.slides) for (const [, id] of (s.line || '').matchAll(/\{\w+@(\w+)\}/g)) assert.ok(ids.has(id), `${s.id}: {…@${id}}`);
  for (const s of SAME_GRADIENT.slides) if (s.delta && s.delta !== true) assert.ok(ids.has(s.delta), `${s.id}: delta ${s.delta}`);
});

test('a case card (the vignette and its question) fits its 220 characters', () => {
  for (const s of SAME_GRADIENT.slides) if (s.vignette) assert.ok(s.vignette.length + (s.caseQ ? s.caseQ.length + 1 : 0) <= 220, `${s.id}: ${s.vignette.length + (s.caseQ?.length || 0)}`);
});
