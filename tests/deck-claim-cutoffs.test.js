// A slide that names a grade holds a state that reaches it (16 Nov 2026: the carvedilol slide said "large varices" over a 3 mm varix and
// "first ascites" over 300 mL), and the next-bleed slide that compares carvedilol with and without banding says why the numbers differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';
import { VARIX_LARGE_MM, ASCITES_CUTS } from '../src/engine/portal/metrics.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const TEXT = ['title', 'line', 'question', 'caseQ'];
const words = (s) => [...TEXT.map((k) => s[k]), ...(s.sides || []).map((x) => x.text)].filter((t) => typeof t === 'string').join(' ');
// "the patient has large varices" claims one; a recommendation, a threshold or a negation ("no large", "small or large", "from small to large") does not.
const CLAIM = /\b(?:with|has|have|had|shows?|showing|now has|are|is) (?:large|big) (?:esophageal )?varices\b/i;
const CLAIM_ASC = /\b(?:first|new|clinically evident|clinical|moderate) ascites\b/i;

test('a slide that says the patient has large varices holds a varix of at least the large cut-off', async () => {
  let n = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      if (!CLAIM.test(words(s)) || /\b(?:no|without|never|not)\b[^.]{0,20}large varices/i.test(words(s))) return;
      n++;
      assert.ok(fps[i].varix >= VARIX_LARGE_MM, `${f} "${s.id}": says large varices over a ${fps[i].varix.toFixed(1)} mm varix (large is ${VARIX_LARGE_MM} mm and over)`);
    });
  }
  assert.ok(n >= 0);
});

test('a slide that says the patient has clinically evident or first ascites holds the volume of grade 2', async () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      if (!/\b(?:develops?|developed|now has|has|with) (?:first|new|clinically evident|clinical|moderate) ascites\b/i.test(words(s))) return;
      assert.ok(fps[i].asc >= ASCITES_CUTS[1], `${f} "${s.id}": says ${words(s).match(CLAIM_ASC)[0]} over ${fps[i].asc.toFixed(0)} mL (grade 2 is ${ASCITES_CUTS[1]} mL)`);
    });
  }
});

test('Preventing the next bleed: carvedilol with banding sits between carvedilol with one band and banding alone, and the slide says why', async () => {
  const { NEXT_BLEED: D } = await import('../src/ui/decks/next-bleed.js');
  const fps = await deckStates(D), at = (id) => fps[D.slides.findIndex((s) => s.id === id)], slide = D.slides.find((s) => s.id === 'both');
  assert.ok(at('both').hvpg > at('nsbb').hvpg, `HVPG with three bands (${at('both').hvpg.toFixed(1)}) is above one band (${at('nsbb').hvpg.toFixed(1)}): banding closes a collateral`);
  assert.ok(at('both').hvpg < at('bands').hvpg, 'and below banding alone');
  assert.match(slide.line, /\{hvpg@nsbb\}/);
  assert.match(slide.line, /banding closes a collateral/);
});
