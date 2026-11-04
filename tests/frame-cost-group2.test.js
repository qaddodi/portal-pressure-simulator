import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

// Codebase review 22 Oct, group 2: per-frame work in the lobule, the sinusoid, the data-card plane and the charts that
// gave the same pixels every time is done once and kept. Each test pins one item.

const read = (p) => unsnap(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('item 38: chart and Doppler strip labels are measured once per font and text, forgotten when the fonts arrive', () => {
  const charts = read('../src/ui/charts.js'), dop = read('../src/ui/doppler.js');
  assert.match(charts, /export const textW = \(ctx, t\) =>/);
  assert.match(charts, /'loadingdone', \(\) => widths\.clear\(\)/);
  // The ladder's tilt and strip searches and the monitor's top strip go through the cache.
  assert.doesNotMatch(charts.slice(charts.indexOf('function geometry'), charts.indexOf('function drawStrip') + 2000), /measureText\(/);
  const strip = dop.slice(dop.indexOf("const label = probe ? probeName"), dop.indexOf("if (waves && meta().kind === 'hepatic')"));
  assert.doesNotMatch(strip, /measureText\(/);
  assert.match(strip, /textW\(ctx, label\)/);
});

test('item 36: the data-card plane skips a redraw whose size, font, points, reading and last dot place are all unchanged', () => {
  const src = read('../src/ui/visual-plane.js');
  const draw = src.slice(src.indexOf('const draw = () => {'), src.indexOf('const kids = [];'));
  assert.match(draw, /if \(key === drawn\) return;/);
  // (The dot's previous place is in the key, so the words still settle once after the dot stops.)
  assert.match(draw, /\$\{sizeWas\}\|\$\{was \?/);
  assert.match(src, /set\(points, r = ring\) \{ pts = points \|\| \[\]; ptsVer\+\+;/);
});

test("item 39: a lit lobule label's pill is read once per layout, not on every frame of its leaders' glide", () => {
  const src = read('../src/ui/lobule-zoom.js');
  const lo = src.slice(src.indexOf('const lettersInto = '), src.indexOf('const dropCost = '));
  // (Since 1 Nov, evening: never read in a frame at all. The pill's insets are measured with the label's size, in a timer task of
  // their own (measureRun), and the leaders use them from there.)
  assert.match(lo, /q = L\.pillQ;/);
  assert.doesNotMatch(lo, /getComputedStyle/);
  const run = src.slice(src.indexOf('function measureRun()'), src.indexOf('const labWH = '));
  assert.match(run, /getComputedStyle\(L\.el, '::before'\)/);
  assert.match(run, /L\.pillQ = \[px\(p\.left\), px\(p\.top\), px\(p\.right\), px\(p\.bottom\), px\(p\.borderTopLeftRadius\)\];/);
});

test('item 33: the sinusoid view keeps its size, colours and dark-mode query instead of reading them every frame', () => {
  const src = read('../src/ui/sinusoid-view.js');
  const draw = src.slice(src.indexOf('function draw(dt, run = true'), src.indexOf('function describe()'));
  assert.doesNotMatch(draw, /getBoundingClientRect|getComputedStyle|matchMedia\(/);
  assert.match(draw, /const \[W, H\] = hostSize\(\);/);
  assert.match(src, /new ResizeObserver\(\(\) => \{ readHost\(\); readGap\(\);/, 'the stage read by its observer, not by a frame');
  // (The colours are read again when the theme or a setting's class changes, between frames (a rest pass), never from the presenter's inline room.)
  assert.match(src, /const lookChanged = \(\) => \{ cssStale = true; gapStale = true; askRest\(\); askLooks\(\); \};/);
  assert.match(src, /restAsk = 0;\n\s+if \(gapStale\) \{ gapStale = false; readGap\(\); \}/, 'the gap read in the rest pass, not in the observer (2 Nov 2026)');
  assert.match(src, /if \(cssStale \|\| cssMiss\) \{ readCss\(\); cssMiss = false; ch = true; sizedNew = true; \}/);
  assert.match(src, /r\.attributeName !== 'style'/);
  assert.match(src, /if \(el\.style\.getPropertyValue\('--label-k'\) !== lk\)/);
});

test("item 32: the lobule's world bitmap and surround keep their scale under a hand too, drawn sharp once it lets go", () => {
  const src = read('../src/ui/lobule-zoom.js');
  const pt = src.slice(src.indexOf('function paintTissue('), src.indexOf('\n  }\n', src.indexOf('function paintTissue(')));
  // (Without the GPU a hand is a finger, a flick or a trackpad scroll, as before; on the GPU any wheel too, and there the picture is
  // held only while it is at least as sharp as the zoom wants: tests/tissue-gl.test.js.)
  assert.match(pt, /const hand = !gliding && \(gpu \? handOn\(\) : touches\.size > 0 \|\| !!cancelFlick \|\| \(wheelKind === 'pad' && performance\.now\(\) - wheelAt < 250\)\), held = gliding \|\| hand;/);
  assert.match(pt, /const kept = worldSc && worldCv\.width && worldGeo === G;/);
  // (bitmapUnseen: where the shader has the whole picture on the GPU the bitmap is held at any gesture step, as nothing of it is seen.)
  assert.match(pt, /if \(held && kept && \(!gpu \|\| sc <= worldSc \|\| bitmapUnseen\(\)\)\) \{ if \(hand && sc !== worldSc\) holdSoon\(\); sc = worldSc; \}/);
  // (The surround is the GPU's own tiles, blended at every size (tissueOnGPU fieldBlend), so it has no scale to hold.)
  assert.match(src, /function holdEnd\(\) \{ holdT = 0; if \(handOn\(\)\) \{ holdSoon\(\); return; \} viewChanged\(\); \}/);
});

test("item 31: lobule pan and zoom frames reuse each tube's radii, compare inks as numbers and keep the look per style copy", () => {
  const src = read('../src/ui/lobule-zoom.js');
  const gl = src.slice(src.indexOf('function drawGL('), src.indexOf('const num = (cs, n, d)'));
  // (Radii worked out only when the calibers change; the zoom only re-checks them against what was sent.)
  // (Kept as numbers, per vessel, written in place: calibersChanged says when they are worked out again, radiiNow does it.)
  assert.match(gl, /const calCh = calibersChanged\(rzOf\(\), G\);/);
  assert.match(gl, /const r = radiiNow\(t\);/);
  assert.match(src, /if \(radNowAt\[t\.id\] !== radStamp\) \{ for \(let i = 0; i < N; i\+\+\) r\[i\] = radiusAt\(t, i\); radNowAt\[t\.id\] = radStamp; \}/);
  assert.doesNotMatch(gl, /flat\(2\)\.map\(\(x\) => x\.toFixed\(3\)\)/);
  assert.match(gl, /if \(inkMoved \|\| !akSame\)/);
  assert.match(gl, /if \(cs !== lookCs\) \{ lookCs = cs; lookNow = lookOf\(cs\); lookSig = JSON\.stringify\(lookNow\); \}/);
  assert.doesNotMatch(gl, /const lsig = JSON\.stringify\(look\)/);
});

test('item 6: a short lobule glide carries the labels with their spots and lays them out once where it lands', () => {
  const src = read('../src/ui/lobule-zoom.js');
  const lay = src.slice(src.indexOf('function layoutLabels()'), src.indexOf('if (bakeFollow())'));
  // (Not a presenter's camera move, which hides the labels on the way, nor a hand's pan, which carries the whole layer.)
  assert.match(lay, /if \(sameB && gliding && !camMove && !handOn\(\) && !panOn\) \{ ride\(\); return; \}/);
  assert.match(lay, /sameB && V\.k === follow\.k && handOn\(\) && !rides\)/);
  const rd = src.slice(src.indexOf('function ride()'), src.indexOf('function bakeFollow()'));
  // Each piece moves by its own spot's move at its own size (a translate), and is written into its place at landing.
  assert.match(rd, /if \(p\) tr\(e, p\[0\] \+ d0, p\[1\] \+ d1\);/);
  assert.doesNotMatch(rd, /style\.translate/, 'a ride writes no style: the GPU draws the leaders from their geometry, the names from their spots');
  // (Where the GPU draws the names, label-captions.js, tr hands each place to it in the frame and the page's clear model is placed between
  // frames, domFlush; there is no per-frame translate write when the names are not on the GPU either.)
  assert.doesNotMatch(src, /const tr = \(e, x, y\) => \{[^}]*e\.style\.translate/);
  assert.match(src, /function domFlush\(\) \{[\s\S]{0,200}if \(rides\) return;[\s\S]{0,200}e\.style\.translate = /);
  assert.match(src, /for \(const e of clrQ\) if \(e\.style\.translate\) e\.style\.translate = '';/);
  assert.match(rd, /classSoon\(labels, 'lz-ease', false\);/);
  assert.match(src, /function bakeFollow\(\) \{\s*if \(bakeRides\(\)\)/);
  // The lit terms are split once per change, not queried for every candidate spot.
  assert.match(src, /const named = \(k\) => litOf\(\)\.has\(/);
});

test('item 43 (lobule parts): the anatomy-to-sinusoid chain, the zoom-out hand-over and setLobe stay deleted', () => {
  const src = read('../src/ui/lobule-zoom.js'), rc = read('../src/ui/lobule-render-cache.js');
  for (const dead of ['sinChain', 'chainEase', 'chromeHold', 'sinClosedCb', 'onSinClosed', 'setSinChain', 'outHandler', 'onZoomOut', 'wheelOutOK', 'setLobe']) {
    assert.doesNotMatch(src, new RegExp(`\\b${dead}\\b`), dead);
  }
  assert.doesNotMatch(src, /the neighbours' triads, drawn flat/);
  assert.doesNotMatch(rc, /rimKeep|diveRimMix/);
});

test('item 18 (lobule side): the sinusoid zoom stops a flick or glide first; a held aim lets go; reduced motion builds no wide copy', () => {
  const src = read('../src/ui/lobule-zoom.js');
  const dive = src.slice(src.indexOf('function diveSinusoid(on)'), src.indexOf('function diveSinusoid(on)') + 2500);
  assert.match(dive, /if \(on && sinU === 0\) \{ stopInertia\(\); cancelFrame\(glide\); gliding = false; releaseCam\(\);/);
  assert.match(src, /store\.on\('presenting', \(\) => \{ if \(!store\.get\(\)\.presenting\) releaseCam\(\); \}\);/);
  assert.match(src, /box = reduce\.matches \? null : padBox\(W, H\), wd = box \? buildWide/);
  assert.match(src, /if \(wide \|\| fade <= 0\.98 \|\| !model \|\| reduce\.matches\) return;/);
});

test("item 18: +, − and Fit wait for the dive into the lobule to land", () => {
  const src = read('../src/ui/lobule-zoom.js');
  assert.match(src, /function fitView\(\) \{ if \(sinTo \|\| fade < 0\.98 \|\| diveScaled\) return;/);
  const zb = src.slice(src.indexOf('function zoomBy(factor)'), src.indexOf('function zoomBy(factor)') + 400);
  assert.match(zb, /if \(fade < 0\.98 \|\| diveScaled\) return;/);
});

test('item 51: the presenter announces "Slide N of M: title" once, its cards carry no live region, an empty key is hidden', () => {
  const pz = read('../src/ui/presenter.js'), fk = read('../src/ui/figure-key.js');
  assert.equal((pz.match(/'aria-live'/g) || []).length, 1, 'one live region');
  assert.match(pz, /const say = h\('p', \{ class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' \}\);/);
  assert.match(pz, /`Slide \$\{i \+ 1\} of \$\{slides\.length\}\$\{slides\[i\]\?\.title \? `: \$\{slides\[i\]\.title\}` : ''\}`/);   // (written by announce(), once the slide is on screen)
  assert.match(pz, /'data-empty': '', 'aria-hidden': 'true' \}\);/);
  assert.match(fk, /el\.dataset\.empty = ''; el\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(fk, /delete el\.dataset\.empty; el\.removeAttribute\('aria-hidden'\);/);
});

test('item 37: fitCards reads the tiles and scale-bar numbers in one layout, then writes, and probes --pz-sm once per look', () => {
  const pz = read('../src/ui/presenter.js');
  const fc = pz.slice(pz.indexOf('function fitCards(...els)'), pz.indexOf('fitHeads(el);', pz.indexOf('function fitCards(...els)')));
  // Short tile names: every class taken off, then every room read, then the short ones set.
  assert.match(fc, /for \(const k of names\) k\.classList\.remove\('short'\);\s+(?:\/\/ alloc-rare[^\n]*\s+)*const shorts = names\.filter/);
  // Scale-bar numbers: classes off, every rect read, then .lo/.hi placed by half the number's width, not measured again.
  assert.match(fc, /for \(const b of bars\) \{ b\.B = b\.bar\.getBoundingClientRect\(\); b\.rs = b\.ls\.map\(\(l\) => l\.getBoundingClientRect\(\)\); \}/);
  assert.match(fc, /l\.classList\.add\('lo'\); left \+= r\.width \/ 2; right \+= r\.width \/ 2;/);
  assert.equal((fc.match(/getBoundingClientRect/g) || []).length, 2, 'no rect read after a class is written');
  assert.match(pz, /const smProbe = h\('span'/);   // (built once with the presenter, never per look)
  assert.match(pz, /if \(sm\?\.k !== smKey\) \{ const pr = smProbe;/);
});
