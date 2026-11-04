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
  assert.match(STAGE, /const glassGL = veins \? createGlassGL\(wrap, vCanvas, \[cath\.labels, sites\.el\], \{ software: SOFTWARE, live: \(\) => wrap\.classList\.contains\('gl-on'\), version: \(\) => veins\.drawSeq, fresh: \(\) => veins\.bloodSeq, capture: \(\) => veins\?\.capture\(\), onFigure: \(f\) => veins\.onPicture\(f\), keep: \(\) => figLab\('glassCache'\), due: \(\) => watch\.due\(\), onHoles: frostHoles\('callouts'\) \}\) : null;/);
  // (Drawn in the figure's canvas, its turn between the cards' two.)
  assert.match(STAGE, /hostFrost\(glassGL, \{ order: 2, over: \(\) => frostOver\('callouts'\) \}\);/);
  // (1 Nov 2026: off unless ?glasshost=1 at 759be3e1, the iPhone's callouts and sheet cards flickering; on again by default the same day, its causes
  // fixed (a sheet's tint lost when marked, a mask bound where the figure's blur was, a swap at the screen's edge), and no switch back to the browser's blur.)
  assert.match(STAGE, /\n {2}function hostFrost\(g, o\) \{ if \(!g \|\| !veins\?\.top\) return;/);
  assert.doesNotMatch(STAGE, /FROST_HOST|glasshost=/);
  // A write to a callout asks for the glass's own frame (its final phase, before that frame shows), so it never trails the outline and is
  // drawn once in it; no draw of its own in a microtask (review H4b, 30 Oct).
  assert.match(SRC, /const mo = new MutationObserver\(\(recs\) => \{ if \(!recs\?\.length \|\| changed\(recs\)\) measureEarly\(\); quiet = 0; ask\(\); \}\);/);
  assert.doesNotMatch(SRC, /queueMicrotask/);
});

test('the liver label\'s frosted pane is drawn the same way, under the labels, with its own blur and tint', () => {
  assert.match(CSS, /\.lb-glass \{[^}]*background: var\(--frost\);/, 'the CSS pane');
  assert.equal(PANE.blur, 9);
  assert.equal(PANE.sat, 1.2);
  assert.match(STAGE, /labelSvg\.before\(glass\);\n.*\n\s+const paneGL = veins \? createGlassGL\(wrap, vCanvas, \[\], \{ software: SOFTWARE, live: \(\) => wrap\.classList\.contains\('gl-on'\), pane: glass, version: \(\) => veins\.drawSeq, fresh: \(\) => veins\.bloodSeq, capture: \(\) => veins\?\.capture\(\), onFigure: \(f\) => veins\.onPicture\(f\), keep: \(\) => figLab\('glassCache'\), due: \(\) => watch\.due\(\) \}\) : null;/);
  assert.match(STAGE, /hostFrost\(paneGL, \{ order: 0, over: \(\) => frostOver\('pane'\) \}\);/, 'in the figure\'s canvas: the first turn, under the labels');
  assert.match(CSS, /\.cl-glass\[data-gl\], \.lb-glass\[data-gl\] \{ background: none; \}/);
  assert.equal(roundPath(100, 40, 8), 'M8 0H92A8 8 0 0 1 100 8V32A8 8 0 0 1 92 40H8A8 8 0 0 1 0 32V8A8 8 0 0 1 8 0Z');
  assert.match(roundPath(10, 6, 20), /^M3 0H7A3 3/, 'the radius kept inside the box');
});

test('the glass is drawn on the shared final phase, once a frame, after the figure\'s own frame', () => {
  assert.match(SRC, /import \{ finalFrameFor, readFrameFor, framePhase, frameCount, cancelFrame, noteDraw \} from '\.\/frame\.js';/);
  assert.match(SRC, /const later = finalFrameFor\(cards \? 'glass-cards' : pane \? 'glass-pane' : 'glass'\);/);
  assert.match(SRC, /const loop = \(\) => \{ raf = 0; if \(changed\(mo\.takeRecords\(\)\)\) measureSoon\(\); settle\(draw\(\)\); \};/, 'the writes made before it in its frame are drawn by it (a glide or fade put back now; anything else read just after the frame), not again after');
  assert.match(SRC, /function ask\(\) \{ if \(!raf && !lost && !dead\) raf = later\(loop\); \}/);
  assert.doesNotMatch(SRC, /requestAnimationFrame/, 'no frame of its own');
});

// (Holding 120 Hz §2.9: the glass's runtime switches deleted, each to the way it ran with no switch in the address.)
test('glass-gl.js and blur-share.js keep only the default path of their deleted switches', () => {
  const SHARE = readFileSync(new URL('../src/ui/blur-share.js', import.meta.url), 'utf8');
  for (const s of ['cardfallback', 'cardfrost', 'glassclock', 'glassearly', 'glassend', 'glassfull', 'glasshold', 'glassmotion', 'glassobs', 'glasswarm', 'gpuedge', 'liveread', 'reblur=', 'glassshare']) {
    assert.doesNotMatch(SRC, new RegExp(`[?&]${s.replace('=', '')}\\b|/\\[\\?&\\]${s.replace('=', '')}`), `?${s} is gone from glass-gl.js`);
    assert.doesNotMatch(SHARE, new RegExp(`\\?${s.replace('=', '')}\\b`), `?${s} is gone from blur-share.js`);
  }
  assert.doesNotMatch(SRC + SHARE, /GLASS_SHARE|CARD_MARK|GPU_EDGE|GLASS_WARM|LIVE_READ|\bSOFT\b|\bCLOCK\b|readState|fillsOn/);
  assert.match(SRC, /export const CARD = \{ blur: 22, sat: 1\.15, scale: 8, margin: 66 \};/, 'the cards\' 22 px frost');
  assert.match(SRC, /function waitFor\(list\) \{\n\s+if \(!cards\) return;/, 'a card not yet drawn shows no solid card');
  assert.match(SRC, /if \(cards\) document\.documentElement\?\.setAttribute\?\.\('data-cardgl', ''\);/);
  assert.match(SRC, /const drops = dropsOf\(cs\.getPropertyValue\('--gl-drop'\)\), line = cs\.getPropertyValue\('--gl-line'\)\.trim\(\);/, 'the card\'s edge and shadows on the GPU');
  assert.match(SRC, /if \(p\.rad && !p\.d\) \{\n\s+const q = prev\.find/, 'its size eased on the GPU');
  assert.match(SRC, /const G = host\.gl, P = warmPrograms\(G, true\);/, 'the warmed programs, shared per context');
  assert.match(SRC, /warmPrograms\(h\.gl, false\); if \(SHADER_WARM\) h\.warmIn\?\.\(warmTask\(h\.gl\)\);/);
  assert.match(SRC, /const SHARED = !\(reblur > 0\);/, 'one blur per look per picture unless the hold is asked for');
  assert.match(SRC, /const stateOf = clockState;/, 'an animation\'s place from its clock');
  assert.match(SRC, /if \(flag\.live\) measureEarly\(\); else if \(flag\.bad \|\| flag\.ended\) measureSoon\(\);/);
  assert.match(SRC, /if \(r\.type !== 'attributes' \|\| r\.attributeName !== 'style'\) return true;/, 'a glide or fade is put back by the motion');
});
