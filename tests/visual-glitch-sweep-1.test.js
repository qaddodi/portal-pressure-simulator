// Visual glitch sweep 1 (31 Oct): the change halos and the shunt's target name keep their size on screen at any zoom and fade in;
// a catheter leaving for a new patient no longer dims the whole figure first; the lobule's zone bands stay on through its way out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), stage = read('../src/ui/stage.js'), pres = read('../src/ui/presenter.js');

test('the change halos are sized on screen, fade in, and show one decimal', () => {
  assert.match(css, /\.halo-in \{ transform: scale\(var\(--halo-k, 1\)\); \}/);
  assert.match(css, /@keyframes haloText \{ 0% \{ opacity: 0; \} 12%, 70% \{ opacity: 1; \} 100% \{ opacity: 0; \} \}/);
  assert.match(stage, /s\('g', \{ class: 'halo-in' \}/);
  assert.match(stage, /Math\.abs\(d\)\.toFixed\(1\)/);
  assert.match(stage, /for \(const g of haloEls\) g\.style\.setProperty\('--halo-k', hk\)/);
});

test('the shunt target name is 12 px on screen at any zoom', () => {
  assert.match(css, /\.guide-label \{ font-size: calc\(var\(--fs-12\) \* var\(--halo-k, 1\)\);/);
  assert.match(stage, /x: wx \+ 14 \* k, y: wy - 10 \* k, class: 'guide-label'/);
});

test('the hover tip unit is not under 12 px', () => {
  assert.match(css, /\.hover-tip \.r \.u \{ margin-left: 3px; font-size: var\(--fs-12\);/);
});

test('a catheter leaving for a new patient fades on its own unless the figure itself fades', () => {
  assert.match(pres, /await cathOut\(si !== shownState && shownState >= 0 && \(booting \|\| reduce\.matches\)\)/);
});

test('leaving the lobule here, its layers change only once it is left', () => {
  assert.match(pres, /if \(!outNow\) slideLayers\(s\);/);
  assert.match(pres, /if \(outNow\) \{ await toAnatomy\(inAnatomy \? riseFor\(cam, fv\) : null\); slideLayers\(s\);/);
});
