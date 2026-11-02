// The congestion's shades keep the visibility lvFade gives them: the liver's frame no longer shows them again at no opacity, which
// flipped the SVG's visibility on every liver frame and read the liver for the GPU again each time (motion budget, 2 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a shade at no opacity stays hidden; imaging hides them all', () => {
  assert.match(st, /for \(const el of \[lv\.cong, lv\.isl, lv\.gloss\]\) \{ const v = imaging \|\| \(el !== lv\.gloss && !\(\+el\.style\.opacity > 0\)\) \? 'hidden' : ''; if \(el\.style\.visibility !== v\) el\.style\.visibility = v; \}/);
  assert.doesNotMatch(st, /if \(el\.style\.visibility !== \(imaging \? 'hidden' : ''\)\) el\.style\.visibility = imaging \? 'hidden' : '';/);
});
