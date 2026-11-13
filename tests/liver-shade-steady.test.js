import { stageSource } from './stage-src.js';
// The congestion's shades keep the visibility lvFade gives them: the liver's frame no longer shows them again at no opacity, which
// flipped the SVG's visibility on every liver frame and read the liver for the GPU again each time (motion budget, 2 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';

const st = stageSource();

test('a shade at no opacity stays hidden; imaging hides them all', () => {
  assert.match(st, /function lvShade\(el, gloss, imaging\) \{ const v = imaging \|\| \(el !== gloss && !\(\+el\.style\.opacity > 0\)\) \? 'hidden' : ''; if \(el\.style\.visibility !== v\) el\.style\.visibility = v; \}/);
  assert.doesNotMatch(st, /if \(el\.style\.visibility !== \(imaging \? 'hidden' : ''\)\) el\.style\.visibility = imaging \? 'hidden' : '';/);
});
