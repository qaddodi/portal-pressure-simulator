// Fable review (16 Oct), graphics G18, G20, G21 and G22: one clock for organ and vessel transitions, the organ selection in its
// own tone, hepatocyte cords that read as cords, and the quieter (softened) neighbouring lobules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIN_NARROW, cordTone, dullSinusoid, NEIGHBOUR_FLAT, neighbourBlur } from '../src/ui/lobule-look.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');
const app = read('../styles/app.css');
const tokens = read('../styles/tokens.css');

test('G18: organs and vessels ease on one clock and one curve', () => {
  const lens = Number(stage.match(/const LENS_FADE = (\d+);/)[1]);
  assert.match(stage, /const PLATE_FADE = LENS_FADE;/, 'the GPU plate eases over the vessels\' own lens crossfade');
  assert.match(stage, /plateT0 = lensFrom && now - lensT0 < 60 \? lensT0 : now;/, 'from the moment the lens switch started');
  assert.equal(Number(lz.match(/const LENS_FADE = (\d+),/)[1]), lens, 'the lobule\'s lens crossfade takes the same time');
  const fade = tokens.match(/--view-fade: \.(\d+)s;/);
  assert.ok(fade && Number('0.' + fade[1]) * 1000 === lens, 'the SVG organs\' CSS fade takes the same time');
  // easeInOut (quadratic) as a CSS curve.
  assert.match(tokens, /--ease-io: cubic-bezier\(\.455, \.03, \.515, \.955\);/);
  for (const rule of ['#net { transition: opacity var(--view-fade) var(--ease-io); }', '#organs > g, #backdrop, #organs, #backEdges .vg { transition: filter var(--view-fade) var(--ease-io); }']) assert.ok(app.includes(rule), rule);
  assert.doesNotMatch(app, /#heatGlow[^}]*\.28s|#backEdges \.vg \{ transition: filter \.28s/, 'no lens or selection fade left on the old .28 s clock');
});

test('G20: a selected organ is outlined in its own deep tone with a soft glow; the others dim to .6', () => {
  assert.match(stage, /const OL_LOOK = \{ sel: \[2\.6, /, 'the selection line is 2.6 units');
  assert.match(stage, /getComputedStyle\(g\)\.getPropertyValue\('--o3'\)/, 'its colour is the organ\'s own --og-<tone>-3');
  assert.match(stage, /o\.kind === 'sel' \? \[\[true, SEL_GLOW\.reach, SEL_GLOW\.alpha\]\]/, 'a soft glow under the line');
  assert.match(stage, /const col = o\.col \|\| \(o\.kind === 'pin' \? olCol : orgTone\(o\.id\)\);/, 'slide pins keep their station colour');
  assert.match(stage, /const SEL_DIM = 0\.6;/);
  assert.match(stage, /\(sel \? SEL_DIM : 1\) \* \(dataLayer \? 0\.72 : 1\)/, 'the GPU plate dims to SEL_DIM');
  assert.ok(app.includes('.stage-view.has-sel #organs > g, .stage-view.has-sel #backdrop { filter: opacity(.6); }'), 'as the SVG organs do');
  // Every selectable organ has a tone class that sets --o3.
  for (const t of ['liver', 'spleen', 'heart']) assert.match(app, new RegExp(`\\.tone-${t} \\{[^}]*--o3: var\\(--og-${t}-3\\)`));
});

test('G21: zone 3 cells are deeper and warmer; zone 1 keeps its tone', () => {
  const cell = [0.9, 0.8, 0.75];
  assert.deepEqual(cordTone(cell, 1), cell, 'zone 1 unchanged');
  const z3 = cordTone(cell, 0);
  assert.ok(z3.every((x, i) => x < cell[i]), 'darker');
  const drop = z3.map((x, i) => 1 - x / cell[i]);
  assert.ok(drop[2] > drop[1] && drop[1] > drop[0], 'warmer: blue drops most, red least');
  assert.ok(cordTone(cell, 0, true)[2] > z3[2], 'gentler in dark mode');
  assert.match(lz, /cordTone\(base\.map\(/);
  assert.match(lz, /if \(!dead\) c\.stroke\(\);/, 'a thin membrane between neighbouring cells');
  assert.match(lz, /c\.lineWidth = Math\.max\(0\.6, 0\.6 \/ \(c\.getTransform\(\)\.a \|\| 1\)\)/);
});

test('G21: the sinusoids are a quarter narrower and the cords fill the room', () => {
  assert.equal(SIN_NARROW, 0.75);
  assert.match(lz, /const rs = g\.rs0 \* SIN_NARROW \//, 'drawn narrower');
  assert.match(lz, /const sinP = \[\.\.\.L0, \.\.\.L1, \.\.\.L2\]\.map\(\(t\) => \(\{ rs: rsN \*/, 'the cells are laid out against the narrower lumen');
  assert.match(lz, /const lyOff = rsN \+ rs0 \* 1\.1;/, 'the space of Disse keeps its gap from the sinusoid wall');
});

test('G21: capillarized sinusoids look duller, never brighter, and healthy ones are unchanged', () => {
  const shade = [0.376, 0.227, 0.36], c = [0.95, 0.35, 0.25];
  assert.deepEqual(dullSinusoid(c, shade, 0), c);
  const sat = (x) => Math.max(...x) - Math.min(...x), lum = (x) => 0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2];
  let prev = c;
  for (const f of [0.25, 0.5, 1]) {
    const d = dullSinusoid(c, shade, f);
    assert.ok(sat(d) < sat(prev), `less saturated at fibSin ${f}`);
    assert.ok(lum(d) <= lum(c) + 1e-9, `never brighter at fibSin ${f}`);
    prev = d;
  }
  assert.match(lz, /return segOf\(t\) === 'sin' \? sinDull\(c\) : c;/, 'the GPU sinusoids');
});

test('G22: the neighbouring lobules are blurred once per tile, seamlessly, with 30 % less contrast', () => {
  assert.equal(NEIGHBOUR_FLAT, 0.3);
  assert.equal(neighbourBlur(12), 0);
  assert.ok(neighbourBlur(192) > 3 && neighbourBlur(192) < 5);
  // Built into the cached quiet tile (the lobule view's surround and the dive's quieting), never per frame.
  assert.match(lz, /blurWrapped\(c, t\.cv, t\.tw, t\.th, neighbourBlur\(t\.R\)\);\n\s+fieldQuiet\(c, bg, 1, t\.tw, t\.th\);\n\s+c\.fillStyle = css\(bg, NEIGHBOUR_FLAT\);/);
  assert.match(lz, /for \(const dx of \[-w, 0, w\]\) for \(const dy of \[-h, 0, h\]\) pc\.drawImage\(src, p \+ dx, p \+ dy\);/, 'wrapped before the blur: no seam');
  assert.doesNotMatch(lz, /\.filter = `blur[^\n]*\n[^\n]*requestAnimationFrame/);
  // The quieting's saturation fill runs (it had slipped into a comment).
  assert.match(lz, /c\.globalCompositeOperation = 'saturation'; c\.fillStyle = `rgba\(128,128,128,\$\{\(0\.45 \* q\)\.toFixed\(3\)\}\)`; c\.fillRect\(0, 0, w, h\);/);
});
