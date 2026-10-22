// 22 Oct deck review, model fix 2: the SOS patient was two patients. The preset had post-sinusoidal fibrosis 20
// (HVPG 8.9) while Lobule 5 and Outflow 6 overrode it to 32 (HVPG 11.3); Sites 7 and Where 4 used the preset.
// Now the preset carries 32 and no slide overrides it, so every deck shows the same numbers for the same disease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/engine/scenario.js';
import { DECKS } from '../src/ui/decks.js';
import { runSteps } from './deck-states.js';

const sosSlides = () => {
  const out = [];
  for (const deck of DECKS) for (const s of deck.slides || []) if (s.preset === 'sos') out.push({ deck: deck.id, slide: s });
  return out;
};

test('the SOS preset carries the post-sinusoidal block itself', () => {
  const p = PRESETS.find((x) => x.id === 'sos').apply({});
  assert.equal(p.fibrosis.R.post, 32);
  assert.equal(p.fibrosis.L.post, 32);
});

test('no slide overrides the SOS preset, so Sites, Where, Lobule and Outflow show one patient', async () => {
  const slides = sosSlides();
  assert.ok(slides.length >= 4, `SOS slides found: ${slides.map((x) => x.deck).join(', ')}`);
  for (const { deck, slide } of slides) assert.equal(slide.params?.fibrosis, undefined, `${deck}/${slide.id} overrides the fibrosis of the preset`);
  const [m] = await runSteps([{ preset: 'sos' }]);
  assert.ok(m.hvpg > 10, `SOS HVPG ${m.hvpg.toFixed(1)} should sit above 10 (a clear postsinusoidal block)`);
});
