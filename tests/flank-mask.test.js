import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flankPath } from '../src/ui/anatomy.js';

// The flank is kept hidden, beside the backdrop and out of the organs' copy (stage.js): in the backdrop, under the
// diaphragm's fade (diaMask), which is clear from y 420 down, it drew nothing, and it only stretched the mask's offscreen
// layers over the whole abdomen. Hiding it shows the same picture only while every point of it, control points included
// (a cubic stays inside their hull), lies past the fade with room for its stroke.
test('the flank lies wholly below the diaphragm fade, at every bulge', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const fade = src.match(/<linearGradient id="diaFadeG"[^>]*y2="(\d+)"/);
  assert.ok(fade, 'diaFadeG not found');
  const clearFrom = Number(fade[1]);
  for (let b = 0; b <= 34; b += 0.5) {
    const n = flankPath(b).match(/-?\d+(?:\.\d+)?/g).map(Number);
    const ys = n.filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...ys) - 1.4 / 2 > clearFrom, `bulge ${b}: top at ${Math.min(...ys)}`);
  }
});

test('the flank is hidden and outside the masked backdrop, and the fit still measures it', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /const flank = s\('path', \{ class: 'flank', d: '', visibility: 'hidden' \}\);/);
  assert.match(src, /gBackdrop\.after\(flank\);/);
  assert.ok(!/gBackdrop\.append\(flank\)/.test(src), 'the flank is back under the diaphragm mask');
  assert.match(src, /for \(const g of \[gBackdrop, flank, gOrgans, gAscites\]\)/, 'the fit measures the flank');
});
