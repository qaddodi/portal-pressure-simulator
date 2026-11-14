// "Two lesions, one circulation" (14 Nov 2026): the deck's claims are the engine's numbers, so a change to the model that breaks one
// fails here with the reading, not as a wrong sentence on a slide. Also the `retain` action (salt and water kept or given up).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { runSteps, deckStates } from './deck-states.js';

const deck = DECKS.find((d) => d.id === 'two-lesions');
const at = async () => { const st = await deckStates(deck); return Object.fromEntries(deck.slides.map((s, i) => [s.id, st[i].metrics ?? st[i]])); };
const pick = (f) => f.metrics ?? f;

test('the deck is registered, with its menu entry', () => {
  assert.ok(deck, 'DECKS holds two-lesions');
  assert.equal(deck.topic, 'more');
  assert.ok(deck.short.length <= 32 && deck.head.length <= 20, 'menu names fit');
});

test('the clot raises the PPG and lowers the HVPG; congestion lowers both gradients (each against cirrhosis alone)', async () => {
  const s = await at();
  assert.ok(s.clot.ppg - s.base.ppg > 3, `clot: PPG rises (${s.base.ppg} to ${s.clot.ppg})`);
  assert.ok(s.base.hvpg - s.clot.hvpg > 1.5, `clot: HVPG falls (${s.base.hvpg} to ${s.clot.hvpg})`);
  assert.ok(s.clot.pvFlow < 0.05, 'the occluded trunk carries no flow');
  assert.ok(s.unclot.ra > 12 && s.unclot.fhvp > 12, `congestion: right atrium and FHVP high (${s.unclot.ra}, ${s.unclot.fhvp})`);
  assert.ok(s.base.hvpg - s.unclot.hvpg > 2.5, `congestion: HVPG falls (${s.base.hvpg} to ${s.unclot.hvpg})`);
  assert.ok(s.base.ppg - s.unclot.ppg > 3, `congestion: PPG falls (${s.base.ppg} to ${s.unclot.ppg})`);
  assert.ok(s.unclot.asc > 2000, 'congestion brings ascites');
});

test('together: the HVPG reads normal, the PPG is near where it began, the portal vein pressure is highest (the slide says all three)', async () => {
  const s = await at(), both = s.together;
  assert.ok(both.hvpg < 5, `HVPG normal (${both.hvpg})`);
  assert.ok(Math.abs(both.ppg - s.base.ppg) < 2, `PPG near its start (${s.base.ppg} to ${both.ppg})`);
  for (const k of ['clot', 'unclot', 'base']) assert.ok(both.pv > s[k].pv + 5, `portal vein pressure beyond ${k} (${both.pv} vs ${s[k].pv})`);
  assert.ok(both.asc > s.unclot.asc, 'the most ascites');
});

test('taking each lesion out in turn returns the first patient; the order of adding does not change the readings', async () => {
  const s = await at();
  assert.ok(Math.abs(s.unsqueeze.hvpg - s.base.hvpg) < 1 && Math.abs(s.unsqueeze.ppg - s.base.ppg) < 1, `back to the start (${s.base.hvpg}/${s.base.ppg} to ${s.unsqueeze.hvpg}/${s.unsqueeze.ppg})`);
  assert.ok(Math.abs(s.unsqueeze.ra - s.base.ra) < 1, 'right atrium back');
  const csph = { preset: 'csph' }, clot = { params: { thrombus: { PV_TRUNK: 1 } }, days: 90 }, heart = { params: { pericardial: 0.9 }, action: { kind: 'retain', mL: 1150 }, days: 60 };
  const [, , a] = (await runSteps([csph, clot, heart])).map(pick), [, , b] = (await runSteps([csph, heart, clot])).map(pick);
  for (const k of ['hvpg', 'ppg', 'pv', 'ra']) assert.ok(Math.abs(a[k] - b[k]) < 1.5, `${k}: ${a[k]} against ${b[k]}`);
});

test('the retain action keeps and gives up salt and water: the right atrium rises with it and falls when it is taken back', async () => {
  const [base, held, back] = (await runSteps([{ preset: 'healthy' }, { action: { kind: 'retain', mL: 1000 }, days: 30 }, { action: { kind: 'retain', mL: -1000 }, days: 30 }])).map(pick);
  assert.ok(held.ra > base.ra + 1, `the right atrium rises (${base.ra} to ${held.ra})`);
  assert.ok(Math.abs(back.ra - base.ra) < 0.8, `and returns (${back.ra})`);
});

test('every line of the talk stays short', () => {
  for (const s of deck.slides) {
    const n = (s.line || '').replace(/\{[^}]*\}/g, 'x').split(/\s+/).filter(Boolean).length;
    assert.ok(n <= 34, `${s.id}: ${n} words`);
  }
});
