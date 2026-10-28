import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Codebase review 22 Oct, group 2: per-frame work in the lobule, the sinusoid, the data-card plane and the charts that
// gave the same pixels every time is done once and kept. Each test pins one item.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

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
  const lo = src.slice(src.indexOf('const lettersOf = '), src.indexOf('function leadTo('));
  assert.match(lo, /let q = pills\.get\(L\);\s*if \(!q\) \{/);
  assert.equal(lo.match(/getComputedStyle/g).length, 1);
  const lay = src.slice(src.indexOf('function layoutLabels()'), src.indexOf('function layoutLabels()') + 900);
  assert.match(lay, /if \(key === layoutKey\) return;\s*pills\.clear\(\);/);
});

test('item 33: the sinusoid view keeps its size, colours and dark-mode query instead of reading them every frame', () => {
  const src = read('../src/ui/sinusoid-view.js');
  const draw = src.slice(src.indexOf('function draw(dt, run = true'), src.indexOf('function describe()'));
  assert.doesNotMatch(draw, /getBoundingClientRect|getComputedStyle|matchMedia\(/);
  assert.match(draw, /const \[W, H\] = hostSize\(\);/);
  assert.match(src, /new ResizeObserver\(\(\) => \{ hostWH = null;/);
  // (The colours are read again when the theme or a setting's class changes, never from the presenter's inline room.)
  assert.match(src, /if \(cssVer !== lookVer\) \{ cssVer = lookVer; cssVals\.clear\(\); \}/);
  assert.match(src, /r\.attributeName !== 'style'/);
  assert.match(src, /if \(el\.style\.getPropertyValue\('--label-k'\) !== lk\)/);
});

test('item 34: sinusoid uniforms are sent only when they change, and the second tissue pass sends only its pass number', () => {
  const src = read('../src/ui/sinusoid-gl.js');
  assert.match(src, /if \(sent\.has\(l\) && same\(v, sent\.get\(l\)\)\) return;/);
  assert.match(src, /webglcontextrestored', \(\) => \{ sent\.clear\(\);/);
  const t = src.slice(src.indexOf('const tissue = '), src.indexOf('return {', src.indexOf('const tissue = ')));
  assert.match(t, /if \(pass === 0\) \{[\s\S]*for \(const k in u\)[\s\S]*\}\s*set\(T\.U, 'uPass', pass\);/);
});

test("item 32: the lobule's world bitmap and surround keep their scale under a hand too, drawn sharp once it lets go", () => {
  const src = read('../src/ui/lobule-zoom.js');
  const pt = src.slice(src.indexOf('function paintTissue('), src.indexOf('fieldFill(c, q,'));
  // (On the 2D canvas a hand is a finger, a flick or a trackpad scroll, as before; on the GPU any wheel too, and there the bitmap is
  // held only while it is at least as sharp as the zoom wants: tests/tissue-gl.test.js.)
  assert.match(pt, /const hand = !gliding && \(gpu \? handOn\(\) : touches\.size > 0 \|\| !!cancelFlick \|\| \(wheelKind === 'pad' && performance\.now\(\) - wheelAt < 250\)\), held = gliding \|\| hand;/);
  assert.match(pt, /const kept = worldSc && worldCv\.width && worldGeo === G;/);
  assert.match(pt, /if \(held && kept && \(!gpu \|\| sc <= worldSc\)\) \{ if \(hand && sc !== worldSc\) holdSoon\(\); sc = worldSc; \}/);
  assert.match(pt, /const want = held && surRd \? surRd : rd \* 0\.55;/);
  assert.match(src, /function holdEnd\(\) \{ holdT = 0; if \(handOn\(\)\) \{ holdSoon\(\); return; \} viewChanged\(\); \}/);
});

test("item 31: lobule pan and zoom frames reuse each tube's radii, compare inks as numbers and keep the look per style copy", () => {
  const src = read('../src/ui/lobule-zoom.js');
  const gl = src.slice(src.indexOf('function drawGL('), src.indexOf('const num = (cs, n, d)'));
  // (Radii worked out only when the calibers change; the zoom only re-checks them against what was sent.)
  assert.match(gl, /if \(rkC !== radCal\) \{ radCal = rkC; radNow = \[\]; \}/);
  assert.match(gl, /const r = radNow\[t\.id\] \|\| \(radNow\[t\.id\] = Array\.from/);
  assert.doesNotMatch(gl, /flat\(2\)\.map\(\(x\) => x\.toFixed\(3\)\)/);
  assert.match(gl, /if \(inkMoved \|\| ak !== attrKey\)/);
  assert.match(gl, /if \(cs !== lookCs\) \{ lookCs = cs; lookNow = lookOf\(cs\); lookSig = JSON\.stringify\(lookNow\); \}/);
  assert.doesNotMatch(gl, /const lsig = JSON\.stringify\(look\)/);
});

test('item 6: a short lobule glide carries the labels with their spots and lays them out once where it lands', () => {
  const src = read('../src/ui/lobule-zoom.js');
  const lay = src.slice(src.indexOf('function layoutLabels()'), src.indexOf('const baked = bakeFollow();'));
  // (Not a presenter's camera move, which hides the labels on the way, nor a hand's pan, which carries the whole layer.)
  assert.match(lay, /if \(follow && bKey === follow\.b && gliding && !camMove && !handOn\(\) && !labels\.style\.transform\) \{ ride\(\); return; \}/);
  assert.match(lay, /V\.k === follow\.k && handOn\(\) && !rides\)/);
  const rd = src.slice(src.indexOf('function ride()'), src.indexOf('function bakeFollow()'));
  // Each piece moves by its own spot's move at its own size (a translate), and is written into its place at landing.
  assert.match(rd, /e\.style\.translate = t;/);
  assert.match(rd, /e\.style\.translate = '';/);
  assert.match(rd, /labels\.classList\.remove\('lz-ease'\);/);
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
  assert.match(pz, /`Slide \$\{i \+ 1\} of \$\{n\}\$\{slides\[i\]\?\.title \? `: \$\{slides\[i\]\.title\}` : ''\}`/);
  assert.match(pz, /'data-empty': '', 'aria-hidden': 'true' \}\);/);
  assert.match(fk, /el\.dataset\.empty = ''; el\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(fk, /delete el\.dataset\.empty; el\.removeAttribute\('aria-hidden'\);/);
});

test('item 37: fitCards reads the tiles and scale-bar numbers in one layout, then writes, and probes --pz-sm once per look', () => {
  const pz = read('../src/ui/presenter.js');
  const fc = pz.slice(pz.indexOf('function fitCards(...els)'), pz.indexOf('fitHeads(el);', pz.indexOf('function fitCards(...els)')));
  // Short tile names: every class taken off, then every room read, then the short ones set.
  assert.match(fc, /for \(const k of names\) k\.classList\.remove\('short'\);\s+const shorts = names\.filter/);
  // Scale-bar numbers: classes off, every rect read, then .lo/.hi placed by half the number's width, not measured again.
  assert.match(fc, /for \(const b of bars\) \{ b\.B = b\.bar\.getBoundingClientRect\(\); b\.rs = b\.ls\.map\(\(l\) => l\.getBoundingClientRect\(\)\); \}/);
  assert.match(fc, /l\.classList\.add\('lo'\); left \+= r\.width \/ 2; right \+= r\.width \/ 2;/);
  assert.equal((fc.match(/getBoundingClientRect/g) || []).length, 2, 'no rect read after a class is written');
  assert.match(pz, /if \(sm\?\.k !== smKey\) \{ const pr = h\('span'/);
});
