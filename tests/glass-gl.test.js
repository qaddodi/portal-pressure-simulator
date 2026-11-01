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
  // (Since 1 Nov 2026 the CSS declares no blur at all: the GPU's is the only one, the browser's look it was matched to kept here.)
  const m = /\.cl-glass \{[^}]*background: color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\);/.exec(CSS);
  assert.ok(m, 'the CSS glass');
  assert.equal(+m[1] / 100, GLASS.tint);
  assert.equal(GLASS.blur, 16);
  assert.equal(GLASS.sat, 1.15);
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
  assert.match(STAGE, /const glassGL = veins \? createGlassGL\(wrap, vCanvas, \[cath\.labels, sites\.el\], \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), live: \(\) => wrap\.classList\.contains\('gl-on'\), version: \(\) => veins\.drawSeq, fresh: \(\) => veins\.bloodSeq, capture: \(\) => veins\?\.capture\(\), onFigure: \(f\) => veins\.onPicture\(f\), keep: \(\) => figLab\('glassCache'\), due: \(\) => watch\.due\(\), copy: GLASS_COPY, onHoles: frostHoles\('callouts'\) \}\) : null;/);
  // (Its own canvas and copy only with ?glasscopy=1; by default drawn in the figure's canvas, its turn between the cards' two.)
  assert.match(STAGE, /const GLASS_COPY = typeof location !== 'undefined' && \/\[\?&\]glasscopy=1\\b\/\.test\(location\.search\);/);
  assert.match(STAGE, /hostFrost\(glassGL, \{ order: 2, over: \(\) => frostOver\('callouts'\) \}\);/);
  // (1 Nov 2026: off unless ?glasshost=1 at 759be3e1, the iPhone's callouts and sheet cards flickering; on again by default the same day, its causes
  // fixed (a sheet's tint lost when marked, a mask bound where the figure's blur was, a swap at the screen's edge), ?glasshost=0 the browser's blur.)
  assert.match(STAGE, /const FROST_HOST = !\/\[\?&\]glasshost=0\\b\/\.test\(location\.search\);\n {2}function hostFrost\(g, o\) \{ if \(!FROST_HOST \|\| !g/);
  assert.match(CSS, /#glassGl \{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; \}/);
  assert.match(SRC, /if \(canvas\) \(cards \? cards\.before : pane \|\| layers\[0\]\)\.before\(canvas\);/, 'under the callouts, which share its z-index and come after it');
  // A write to a callout asks for the glass's own frame (its final phase, before that frame shows), so it never trails the outline and is
  // drawn once in it; no draw of its own in a microtask (review H4b, 30 Oct).
  assert.match(SRC, /const mo = new MutationObserver\(\(recs\) => \{ if \(!recs\?\.length \|\| changed\(recs\)\) measureGeo\(\); quiet = 0; ask\(\); \}\);/);
  assert.doesNotMatch(SRC, /queueMicrotask/);
  // Until a copy of the figure is in, and after the browser refuses one, the browser's own glass stays.
  assert.match(SRC, /if \(!panes\.length\) \{ if \(cards\) unmark\(\); clear\(\); return false; \}\n\s+\/\/ \(Until the first copy is in, the browser's own glass stays\.\)\n\s+if \(!ready\) return true;/);
  assert.match(SRC, /if \(\+\+fails > 3\) \{ dead = true; unmark\(\); clear\(\); \}/);
});

test('the liver label\'s frosted pane is drawn the same way, under the labels, with its own blur and tint', () => {
  assert.match(CSS, /\.lb-glass \{[^}]*background: var\(--frost\);/, 'the CSS pane');
  assert.equal(PANE.blur, 9);
  assert.equal(PANE.sat, 1.2);
  assert.match(STAGE, /labelSvg\.before\(glass\);\n.*\n\s+const paneGL = veins \? createGlassGL\(wrap, vCanvas, \[\], \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), live: \(\) => wrap\.classList\.contains\('gl-on'\), pane: glass, version: \(\) => veins\.drawSeq, fresh: \(\) => veins\.bloodSeq, capture: \(\) => veins\?\.capture\(\), onFigure: \(f\) => veins\.onPicture\(f\), keep: \(\) => figLab\('glassCache'\), due: \(\) => watch\.due\(\), copy: GLASS_COPY \}\) : null;/);
  assert.match(SRC, /if \(canvas\) \(cards \? cards\.before : pane \|\| layers\[0\]\)\.before\(canvas\);/, 'its canvas just before the pane, so under the labels');
  assert.match(STAGE, /hostFrost\(paneGL, \{ order: 0, over: \(\) => frostOver\('pane'\) \}\);/, 'in the figure\'s canvas: the first turn, under the labels');
  assert.match(CSS, /\.cl-glass\[data-gl\], \.lb-glass\[data-gl\] \{ background: none; \}/);
  assert.equal(roundPath(100, 40, 8), 'M8 0H92A8 8 0 0 1 100 8V32A8 8 0 0 1 92 40H8A8 8 0 0 1 0 32V8A8 8 0 0 1 8 0Z');
  assert.match(roundPath(10, 6, 20), /^M3 0H7A3 3/, 'the radius kept inside the box');
});

test('the glass takes a new copy of the figure only when the figure, the region or the canvas\' place changed', () => {
  const VEINS = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // The key: the figure's draw count, the region behind the callouts, and where both canvases lie, and how big the source is.
  assert.match(SRC, /const key = version \? `\$\{version\(\)\}\|\$\{reg\.x\}\|\$\{reg\.y\}\|\$\{reg\.w\}\|\$\{reg\.h\}\|\$\{cr\.left\}\|\$\{cr\.top\}\|\$\{sr\.left\}\|\$\{sr\.top\}\|\$\{sr\.width\}\|\$\{sr\.height\}\|\$\{source\.width\}x\$\{source\.height\}` : '';/);
  // A copy still current is not asked for again; the key is read before the copy is asked for and kept only once it has arrived.
  assert.match(SRC, /if \(key && key === takenKey && ready\) \{ if \(gpuProbe\.on\) gpuProbe\.note\(cards \? COUNTED\.cardSkip : pane \? COUNTED\.paneSkip : COUNTED\.glassSkip\); return; \}/);
  assert.match(SRC, /ready = \{ \.\.\.got \};\n\s+takenKey = key;/);
  assert.ok(SRC.indexOf('const key = version') < SRC.indexOf('createImageBitmap(source'), 'the key is read before the snapshot');
  // Without a version the old rule stands: a copy whenever the last has arrived.
  assert.match(SRC, /version = null, capture = null, onFigure = null, keep = null, due = null, copy = true, reblur = REBLUR_URL \? REBLUR_MS : 0, fresh = null, full = FULL_URL, onHoles = null \} = \{\}\) \{/);
  // The figure counts every time its canvas is drawn on: a composite that drew something, and a clear; and the stage hands that on.
  // (But for a frame of the moving blood alone, whose streaks the glass's blur evens out: review H4, 30 Oct.)
  assert.match(VEINS, /pictured\(!full && !part && !dirt && !pool && !\(fl\?\.ripple && nFluid\) && !cath && bare && same && !figNew\);/);
  assert.match(VEINS, /clear\(\) \{ pictured\(\);/);
  assert.match(VEINS, /const pictured = \(blood = false\) => \{ if \(blood\) \{ bloodSeq\+\+; return; \} pictureSeq\+\+; for \(const f of onPicture\) f\(\); \};/, 'and each time, it tells the glass');
});

test('the glass is drawn on the shared final phase, once a frame, after the figure\'s own frame', () => {
  assert.match(SRC, /import \{ finalFrameFor, cancelFrame, noteDraw \} from '\.\/frame\.js\?v=[0-9a-f]+';/);
  assert.match(SRC, /const later = finalFrameFor\(cards \? 'glass-cards' : pane \? 'glass-pane' : 'glass'\);/);
  assert.match(SRC, /const loop = \(\) => \{ raf = 0; if \(changed\(mo\.takeRecords\(\)\)\) measureSoon\(\); settle\(draw\(\)\); \};/, 'the writes made before it in its frame are drawn by it (a glide or fade put back now; anything else read just after the frame), not again after');
  assert.match(SRC, /function ask\(\) \{ if \(!raf && !lost && !dead\) raf = later\(loop\); \}/);
  assert.doesNotMatch(SRC, /requestAnimationFrame/, 'no frame of its own');
});
