// The right atrium's slides light the whole heart with a soft glow (not an outline of the atrium alone), and where the
// GPU glow is not drawn the heart gets a flat tint instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';

const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the right atrium and the heart targets both light the heart, and no deck outlines the atrium alone', () => {
  assert.match(presenter, /ra: \{ node: 'RA', organ: 'heart', /);
  assert.match(presenter, /heart: \{ organ: 'heart', /);
  assert.doesNotMatch(JSON.stringify(DECKS), /heart-ra/);
  const lit = DECKS.flatMap((d) => d.slides).filter((s) => /right atrium/i.test(s.line || ''));
  assert.ok(lit.length >= 3, 'the right-heart slides name the right atrium');
});

const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('the old atrium id is folded into the heart, which is lit as one glow (not stacked rings)', () => {
  assert.match(stage, /PIN_ID = \(id\) => \(id === 'heart-ra' \? 'heart' : id\)/);
  assert.match(stage, /const HEART_GLOW = \{ reach: \d+, alpha: 0\.\d+ \};/);
  assert.match(stage, /glow: id === 'heart'/);
  assert.ok(+stage.match(/HEART_GLOW = \{ reach: \d+, alpha: ([\d.]+)/)[1] <= 0.4, 'the glow stays subtle at the edge');
  assert.doesNotMatch(stage, /HEART_GLOW = \[\[/, 'no stack of stroke layers (they showed as bands)');
});

test('the glow is shaded smoothly on the GPU and lies behind the organs, not over them', () => {
  const fs = veins.match(/const LINE_FS = `[\s\S]*?`;/)[0];
  assert.match(fs, /exp\(-4\.5 \* t \* t\)/, 'a Gaussian falloff');
  assert.match(fs, /gl_FragCoord/, 'dithered, so a long faint ramp does not step');
  // the composite lays the glow under the plate (the organs and the liver), before the vessels go over
  assert.match(veins, /if \(glowOn == 1\) pl = over\(pl, texelFetch\(glowL, ip, 0\)\);/);
  assert.match(veins, /vec4 o = over\(v, pl\);/);
});

test('the heart glow has no lite or flat fallback left', () => {
  assert.doesNotMatch(stage, /org-pin-flat|syncPinFlat/);
  assert.doesNotMatch(css, /org-pin-flat/);
});
