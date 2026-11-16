// One patient, one set of values (Mohammad's play-test, 16 Nov 2026: the 63-year-old woman had platelets of 90,000/µL on the spleen slide and
// 160,000/µL two slides later, where the AASLD and Baveno VIII charts depended on them). A slide that speaks of a person (her, his, she, he)
// and loads a different preset from the patient before it must introduce a patient of its own with a case card (vignette).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

const PERSON = /\b(her|his|she|he|him|hers)\b/i;

test('a slide about a person that loads another preset starts with its own case card', () => {
  const bad = [];
  for (const d of DECKS) {
    let patient = null;
    for (const s of d.slides) {
      if (s.vignette) { patient = s.preset ?? patient; continue; }
      if (!patient || !s.preset || s.preset === patient) continue;
      if (PERSON.test(`${s.title || ''} ${s.line || ''}`)) bad.push(`${d.id}/${s.id}: ${s.preset} after ${patient}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the Carvedilol deck is named for what it covers in the menu and on its title slide, and says nothing of a transplant list', async () => {
  const { TOPICS } = await import('../src/ui/decks.js');
  const deck = DECKS.find((d) => d.id === 'carvedilol');
  const menu = TOPICS.flatMap(([, , list]) => list).find(([id]) => id === 'carvedilol')[1];
  assert.match(menu, /stopping$/);
  assert.match(deck.title, /stopping$/);
  assert.ok(!/transplant/i.test(deck.title));
});

test('the Carvedilol stopping case is one man, not another', () => {
  const s = DECKS.find((d) => d.id === 'carvedilol').slides.find((x) => x.id === 'cure');
  assert.ok(!/another man/i.test(s.line));
});
