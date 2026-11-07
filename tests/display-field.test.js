// The big readouts' SDF field (text-gl.js DISPLAY, scripts/glyph-atlas.mjs --display): a number drawn large (FibroScan's kPa, a monitor's
// heart rate) reads its glyphs from a 96 px field laid under the main 32 px one in the same texture, so it is not the small field
// magnified seven times with stepped edges (Mohammad, 6 Nov 2026: "Fibroscan number rendered has jagged edges").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sdfAtlas, displayCovers, displayGlyph, DISPLAY_FROM } from '../src/ui/text-gl.js';

const { GLYPHS, BASE, RADIUS, CUTOFF, ATLAS_W, ATLAS_H, MAIN_H, DISPLAY } = sdfAtlas;

test('the display field sits under the main one in one texture, finer than it and as far reaching', () => {
  assert.equal(DISPLAY.Y0, MAIN_H);
  assert.equal(ATLAS_H, MAIN_H + DISPLAY.H);
  assert.ok(DISPLAY.BASE >= 3 * BASE, 'at least three times the main field\'s size');
  // (its reach outside a glyph, in em, covers the widest readout outline (0.08 em a side) with room to spare, as the main one's does)
  assert.ok(((1 - CUTOFF) * DISPLAY.RADIUS) / DISPLAY.BASE >= 0.12, 'reaches past a readout\'s outline');
  assert.ok(((1 - CUTOFF) * DISPLAY.RADIUS) / DISPLAY.BASE >= ((1 - CUTOFF) * RADIUS) / BASE * 0.8);
  assert.ok(DISPLAY_FROM / BASE <= 2, 'the main field is never magnified past twice before the display field takes over');
});

test('every display glyph lies inside its field and is a character the main atlas lays out at that weight', () => {
  for (const [w, set] of Object.entries(DISPLAY.GLYPHS)) {
    assert.ok(GLYPHS[w], `weight ${w} is a main atlas weight`);
    for (const [ch, [x, y, gw, gh]] of Object.entries(set)) {
      assert.ok(GLYPHS[w][ch], `${ch} at ${w} has the main atlas's advance`);
      assert.ok(x >= 0 && y >= 0 && x + gw <= ATLAS_W && y + gh <= DISPLAY.H, `${ch} at ${w} inside the display field`);
    }
  }
});

test('a readout\'s number is covered at every weight; words with letters stay on the main field', () => {
  for (const w of [400, 500, 600, 650, 700]) {
    for (const t of ['5.0', '88.8', '120/80', '−12', '25 %', '0']) assert.ok(displayCovers(w, t), `${t} at ${w}`);
    assert.ok(!displayCovers(w, 'kPa') && !displayCovers(w, '5 mm'), 'letters are not in the display field');
  }
  assert.ok(displayGlyph(600, '5') && !displayGlyph(600, 'k'));
  assert.equal(displayCovers(450, '5'), false, 'a weight the field was not cut at is not covered');
});
