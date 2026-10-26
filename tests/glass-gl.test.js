// The callouts' frosted glass drawn on the GPU (glass-gl.js, his "GPU glass" pick of 25 Oct): the same blur, saturation and tint
// as the CSS glass it stands in for, the browser's glass kept wherever this cannot run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLASS, PANE, roundPath, parseShadow, gaussTaps, glassWanted } from '../src/ui/glass-gl.js';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');

test('the GPU glass draws the CSS glass\'s own blur, saturation and tint', () => {
  const m = /\.cl-glass \{[^}]*background: color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\);[^}]*backdrop-filter: blur\((\d+)px\) saturate\(([\d.]+)\);/.exec(CSS);
  assert.ok(m, 'the CSS glass');
  assert.equal(+m[1] / 100, GLASS.tint);
  assert.equal(+m[2], GLASS.blur);
  assert.equal(+m[3], GLASS.sat);
});

test('its blur weights are a Gaussian summing to one', () => {
  const w = gaussTaps(4);
  assert.equal(w.length, 13);
  assert.ok(Math.abs(w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(w.every((v, i) => !i || v < w[i - 1]), 'falling off from the middle');
  assert.ok(w[12] < w[0] * 0.02, 'three sigmas wide');
});

test('a callout\'s shadow is read from its computed style', () => {
  assert.deepEqual(parseShadow('rgba(16, 20, 30, 0.22) 0px 8px 24px 0px'), { c: [16 / 255, 20 / 255, 30 / 255, 0.22], x: 0, y: 8, blur: 24, spread: 0 });
  assert.equal(parseShadow('none'), null);
  assert.equal(parseShadow('rgba(0, 0, 0, 0.2) 0px 0px 4px 0px inset'), null);
  assert.equal(parseShadow('rgb(0, 0, 0) 1px 2px').blur, 0);
});

test('the browser\'s glass stays with the blur effect off, reduced transparency, or no backdrop blur', () => {
  const doc = (noglass) => ({ documentElement: { hasAttribute: (k) => k === 'data-noglass' && noglass } });
  const win = (reduce, can = true) => ({ matchMedia: () => ({ matches: reduce }), CSS: { supports: () => can } });
  assert.equal(glassWanted(doc(false), win(false)), true);
  assert.equal(glassWanted(doc(true), win(false)), false);
  assert.equal(glassWanted(doc(false), win(true)), false);
  assert.equal(glassWanted(doc(false), win(false, false)), false);
});

test('the stage lays the GPU glass under both callout layers, off with the other GPU layers and on a software renderer', () => {
  assert.match(STAGE, /const glassGL = veins \? createGlassGL\(wrap, vCanvas, \[cath\.labels, sites\.el\], \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), live: \(\) => wrap\.classList\.contains\('gl-on'\) \}\) : null;/);
  assert.match(CSS, /#glassGl \{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; \}/);
  assert.match(SRC, /\(pane \|\| layers\[0\]\)\.before\(canvas\);/, 'under the callouts, which share its z-index and come after it');
  // A write to a callout redraws its glass in the same frame (a microtask after the write), so it never trails the outline.
  assert.match(SRC, /queueMicrotask\(\(\) => \{ batched = false; if \(draw\(\)\) ask\(\); \}\);/);
  // Until a copy of the figure is in, and after the browser refuses one, the browser's own glass stays.
  assert.match(SRC, /if \(!ready\) return panes\.length > 0;/);
  assert.match(SRC, /if \(\+\+fails > 3\) \{ dead = true; unmark\(\); clear\(\); \}/);
});

test('the liver label\'s frosted pane is drawn the same way, under the labels, with its own blur and tint', () => {
  const m = /\.lb-glass \{[^}]*background: var\(--frost\);[^}]*backdrop-filter: blur\((\d+)px\) saturate\(([\d.]+)\);/.exec(CSS);
  assert.ok(m, 'the CSS pane');
  assert.equal(+m[1], PANE.blur);
  assert.equal(+m[2], PANE.sat);
  assert.match(STAGE, /labelSvg\.before\(glass\);\n.*\n\s+const paneGL = veins \? createGlassGL\(wrap, vCanvas, \[\], \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), live: \(\) => wrap\.classList\.contains\('gl-on'\), pane: glass \}\) : null;/);
  assert.match(SRC, /\(pane \|\| layers\[0\]\)\.before\(canvas\);/, 'its canvas just before the pane, so under the labels');
  assert.match(CSS, /\.cl-glass\[data-gl\], \.lb-glass\[data-gl\] \{ background: none; -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  assert.equal(roundPath(100, 40, 8), 'M8 0H92A8 8 0 0 1 100 8V32A8 8 0 0 1 92 40H8A8 8 0 0 1 0 32V8A8 8 0 0 1 8 0Z');
  assert.match(roundPath(10, 6, 20), /^M3 0H7A3 3/, 'the radius kept inside the box');
});
