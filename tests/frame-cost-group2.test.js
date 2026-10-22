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
  assert.match(pt, /const hand = !gliding && handOn\(\), held = gliding \|\| hand;/);
  assert.match(pt, /if \(held && worldSc && worldCv\.width && worldGeo === G\) \{ if \(hand && sc !== worldSc\) holdSoon\(\); sc = worldSc; \}/);
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
