import { stageSource } from './stage-src.js';
// Visual glitch sweep 1 (31 Oct): the change halos and the shunt's target name keep their size on screen at any zoom and fade in;
// a catheter leaving for a new patient no longer dims the whole figure first; the lobule's zone bands stay on through its way out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), stage = stageSource(), pres = read('../src/ui/presenter.js');

test('the change halos are sized on screen, fade in, and show one decimal', () => {
  assert.match(css, /\.halo-in \{ transform: scale\(var\(--halo-k, 1\)\); \}/);
  assert.match(css, /@keyframes haloText \{ 0% \{ opacity: 0; \} 12%, 70% \{ opacity: 1; \} 100% \{ opacity: 0; \} \}/);
  assert.match(stage, /s\('g', \{ class: 'halo-in' \}/);
  assert.match(stage, /Math\.abs\(d\)\.toFixed\(1\)/);
  assert.match(stage, /for \(const g of haloEls\) g\.style\.setProperty\('--halo-k', hk\)/);
});

test('the shunt target name is 12 px on screen at any zoom', () => {
  assert.match(css, /\.guide-label \{ font-size: calc\(var\(--fs-12\) \* var\(--halo-k, 1\)\);/);
  assert.match(stage, /(?:live\.)?(?:live\.)?guideLab\.setAttribute\('x', wx \+ 14 \* k\); (?:live\.)?(?:live\.)?guideLab\.setAttribute\('y', wy - 10 \* k\)/);
});

test('the hover tip unit is not under 12 px', () => {
  assert.match(css, /\.hover-tip \.r \.u \{ margin-left: 3px; font-size: var\(--fs-12\);/);
});

test('a catheter leaving for a new patient fades on its own unless the figure itself fades', () => {
  assert.match(pres, /await cathOut\(si !== shownState && shownState >= 0 && \(booting \|\| reduce\.matches\), cut\)/);
});

test('leaving the lobule here, its layers change only once it is left', () => {
  assert.match(pres, /if \(!outNow\) slideLayers\(s\);/);
  assert.match(pres, /if \(outNow\) \{ await toAnatomy\(inAnatomy \? riseFor\(cam, fv\) : null, cut\); if \(cut\(\)\) return; slideLayers\(s\);/);
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

// Sweep 3: no ghost copies while the GPU draws the vessels. (The umbilicus stays where it was drawn, at (500, 800): Mohammad, 31 Oct.)

test('the ghost copies of the back veins are hidden while the GPU draws the vessels (they filled as dark wedges)', () => {
  assert.match(css, /\.stage-view\.gl-on #ghosts \{ visibility: hidden; \}/);
});

test('flow-time start values are placed as a pair so two lines starting close never overlap', () => {
  const src = readFileSync(new URL('../src/ui/flow-time.js', import.meta.url), 'utf8');
  assert.match(src, /const clear = \(a, b\) => Math\.abs\(a - b\) >= 1\.15 \* f/);
  assert.match(src, /y: ys\[pick\[i\]\]/);
});

test('the beat card on a phone keeps "17.1 WHVP" inside its edge, and its top number gives way to the unit over it', async () => {
  const { beatLayout } = await import('../src/ui/beat-card.js');
  const l = beatLayout(340, 300);
  assert.ok(340 - l.R >= 116, 'room for a value and WHVP at the line ends');
  const pt = readFileSync(new URL('../src/ui/pressure-time.js', import.meta.url), 'utf8');
  assert.match(pt, /const gate = top - 10 > \(lay\.ekg \? lay\.ekg\.bot : 0\);[\s\S]*?if \(gate && y < top \+ 9\) continue;/);
});

test('a line name with no clear place sits on lines before it sits on a word', () => {
  const src = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
  assert.match(src, /k = \(cr > 0 \? 1e6 \+ cr : 0\) \+ 1e4 \* place\.lineCost\(b\)/);
});

test('a stent\'s velocity callout hides when its stent is out of the frame', () => {
  const src = stageSource();
  assert.match(src, /if \(!within\(\{ x0: ax, y0: ay, x1: ax, y1: ay \}, view\)\) continue;\n {10}const it = velItem\(sid, f\);/);
});
