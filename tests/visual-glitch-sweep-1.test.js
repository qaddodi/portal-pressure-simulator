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

// Sweep 2: anatomy.
import { EDGE_PATH } from '../src/ui/anatomy.js';
const end = (d) => d.trim().split(/[\s,]+/).slice(-2).map(Number);

test('the hepatic veins meet the cava at three heights, never two within 20 units (they were joined as one bar)', () => {
  const e = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'].map((id) => end(EDGE_PATH[id]));
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(Math.hypot(e[a][0] - e[b][0], e[a][1] - e[b][1]) >= 20, `${a}-${b}`);
});

test('the portocaval shunt meets the cava above the left renal vein', () => {
  const [, y] = end(EDGE_PATH.S_PC), [, yr] = end(EDGE_PATH.LRV_IVC);
  assert.ok(y < yr - 20);
});

test('the veins above the SVC take its 0.72 scale, so it never narrows going down', () => {
  assert.match(stage, /e\.id === 'SVC_RA' \|\| e\.id === 'V_UP' \? 0\.72 : 1/);
});

// Sweep 3: the umbilicus on the midline; no ghost copies while the GPU draws the vessels.
import { NODE_POS, SITES } from '../src/ui/anatomy.js';

test('the umbilicus, its node and the paraumbilical vein end on the midline (x 712)', () => {
  assert.deepEqual(SITES.umbilicus, [712, 840]);
  assert.deepEqual(NODE_POS.EPI[0], [712, 840]);
  assert.deepEqual(end(EDGE_PATH.C3), [712, 840]);
  for (const id of ['EPI_ILI', 'EPI_SVC']) assert.match(EDGE_PATH[id], /^M712 840 /);
});

test('the ghost copies of the back veins are hidden while the GPU draws the vessels (they filled as dark wedges)', () => {
  assert.match(css, /\.stage-view\.gl-on #ghosts \{ visibility: hidden; \}/);
});

test('flow-time start values are placed as a pair so two lines starting close never overlap', () => {
  const src = readFileSync(new URL('../src/ui/flow-time.js', import.meta.url), 'utf8');
  assert.match(src, /const clear = \(a, b\) => Math\.abs\(a - b\) >= 1\.15 \* f/);
  assert.match(src, /y: ys\[pick\[i\]\]/);
});
