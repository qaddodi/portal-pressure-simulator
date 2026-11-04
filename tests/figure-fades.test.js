// The figure's labels, their leaders, the slides' readings (sites and resistors) and the lobule's pointer fade and glide on a slide's
// or a patient's change, never snap (17 Oct: "resistance and labels and callouts all snap instead of fade or transition").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), css = read('styles/app.css'), lz = read('src/ui/lobule-zoom.js');

test("the resistance zigzag's halo eases with its line, and it is dropped only once faded", () => {
  // (3 Nov 2026: a resistor is a kept record drawn by the overlay painter, over-records.js; its fade is the page's own surface step and
  // curve, run in script. Its width and tone are taken at once, as the CSS took them.)
  assert.match(stage, /const recs = recordLayer\(\{ ease: easeArrive, ms: D_SURFACE \}\);/);
  assert.match(stage, /recs\.drop\(RES_KEYS\[k\], now, reduceMotion\.matches\)/);
  assert.doesNotMatch(css, /\.res-one/, 'no resistor element is styled: none is made');
});

test("the lobule's pointer fades out before it moves to a new spot or takes new words", () => {
  assert.match(lz, /if \(c && !reduce\.matches && \(fading \|\| \(call && classHas\(callEl, 'on'\)\)\)\) \{ if \(call\) callSet\(null\); callSwap = setTimeout\(\(\) => \{ callSwap = 0; callSet\(callWant\); \}, 500\); return; \}/);
});
