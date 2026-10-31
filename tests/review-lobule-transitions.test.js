// Fable review (16 Oct), graphics G18, G20, G21 and G22: one clock for organ and vessel transitions, the organ selection in its
// own tone, hepatocyte cords that read as cords, and the quieter (softened) neighbouring lobules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIN_NARROW, cordTone, dullSinusoid, NEIGHBOUR_FLAT, neighbourBlur, blurWrapped } from '../src/ui/lobule-look.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');
const lp = read('../src/ui/lobule-paint.js');   // (the tissue's painting: lobule-paint.js paintLobule)
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
  for (const rule of ['#net { transition: opacity var(--view-fade) var(--ease-io); }', '#backEdges .vg { transition: filter var(--view-fade) var(--ease-io); }']) assert.ok(app.includes(rule), rule);
  // The live SVG organs take the plate's own eased values (stepPlateEase → syncPlateLook → syncOrganDim), so they share its clock.
  assert.match(stage, /function syncPlateLook\(\) \{\n {4}syncOrganDim\(\);/);
  assert.doesNotMatch(app, /#heatGlow[^}]*\.28s|#backEdges \.vg \{ transition: filter \.28s/, 'no lens or selection fade left on the old .28 s clock');
});

test('G20: a selected organ is outlined in its own deep tone with a soft glow; the others dim to .6', () => {
  assert.match(stage, /const OL_LOOK = \{ sel: \[2\.6, /, 'the selection line is 2.6 units');
  assert.match(stage, /getComputedStyle\(g\)\.getPropertyValue\('--o3'\)/, 'its colour is the organ\'s own --og-<tone>-3');
  assert.match(stage, /o\.kind === 'sel' \? \[\[true, SEL_GLOW\.reach, SEL_GLOW\.alpha\]\]/, 'a soft glow under the line');
  assert.match(stage, /const col = o\.col \|\| \(o\.kind === 'pin' \? olCol : orgTone\(o\.id\)\);/, 'slide pins keep their station colour');
  assert.match(stage, /const SEL_DIM = 0\.6;/);
  assert.match(stage, /\(sel \? SEL_DIM : 1\) \* \(dataLayer \? 0\.72 : 1\)/, 'the GPU plate dims to SEL_DIM');
  assert.match(stage, /const on = !plateOn\(\) && \(plateDim < 1 \|\| plateSat < 1\);/, 'the SVG organs dim with the same values (syncOrganDim)');
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
  assert.match(lp, /cordTone\(base\.map\(/);
  assert.match(lp, /if \(!dead\) c\.stroke\(\);/, 'a thin membrane between neighbouring cells');
  assert.match(lp, /c\.lineWidth = Math\.max\(0\.6, 0\.6 \/ \(c\.getTransform\(\)\.a \|\| 1\)\)/);
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
  assert.match(lz, /blurTile\(c, t\.cv, t\.tw, t\.th, neighbourBlur\(t\.R\)\);\n\s+fieldQuiet\(c, bg, 1, t\.tw, t\.th\);\n\s+c\.fillStyle = css\(bg, NEIGHBOUR_FLAT\);/);
  assert.match(lz, /img\.data\.set\(blurWrapped\(img\.data, w, h, r\)\);/, 'the same smooth blur on every browser');
  assert.doesNotMatch(lz, /c\.filter = `blur/, 'no canvas filter (some Safaris lack it)');
  assert.doesNotMatch(lz, /\.filter = `blur[^\n]*\n[^\n]*requestAnimationFrame/);
  // The quieting's saturation fill runs (it had slipped into a comment).
  assert.match(lz, /c\.globalCompositeOperation = 'saturation'; c\.fillStyle = `rgba\(128,128,128,\$\{\(0\.45 \* q\)\.toFixed\(3\)\}\)`; c\.fillRect\(0, 0, w, h\);/);
});

// A w × h RGBA tile from a function of (x, y) giving a grey level.
const tile = (w, h, f) => { const p = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, v = f(x, y); p[o] = p[o + 1] = p[o + 2] = v; p[o + 3] = 255; } return p; };
const grey = (p, w, x, y) => p[(y * w + x) * 4];

test('G22: the neighbours\' blur wraps round the tile, so the repeat has no seam', () => {
  for (const sigma of [2, 7.7]) {
    const w = 96, h = 54, p = blurWrapped(tile(w, h, (x) => (x < 4 ? 255 : 0)), w, h, sigma);
    // A bright band at the left edge spreads as much past the right edge (wrapped) as into the tile.
    for (const y of [0, 27, 53]) assert.ok(Math.abs(grey(p, w, w - 3, y) - grey(p, w, 6, y)) <= 3, `sigma ${sigma}: symmetric across the seam`);
    assert.ok(grey(p, w, w - 1, 0) > 40, `sigma ${sigma}: it reaches across the seam`);
    // Opaque stays opaque, and a flat tile stays flat.
    assert.ok(p.every((v, i) => i % 4 !== 3 || v === 255));
    assert.ok(blurWrapped(tile(w, h, () => 120), w, h, sigma).every((v, i) => i % 4 === 3 || Math.abs(v - 120) <= 1));
  }
});

test('G22: the blurred edge is smooth (no steps), even for a wide blur on a large tile', () => {
  const w = 600, h = 40, sigma = 7.7, p = blurWrapped(tile(w, h, (x) => (x >= 300 && x < 450 ? 255 : 0)), w, h, sigma);
  let maxStep = 0;
  for (let x = 250; x < 350; x++) {
    const d = grey(p, w, x + 1, 20) - grey(p, w, x, 20);
    assert.ok(d >= -1, 'rises monotonically into the band');
    maxStep = Math.max(maxStep, d);
  }
  // A Gaussian of 7.7 px rises at most 255 / (7.7 × √(2π)) ≈ 13 per pixel; a coarse scale up showed jumps of 30 or more.
  assert.ok(maxStep <= 16, `largest step ${maxStep}`);
  assert.ok(grey(p, w, 375, 20) > 245 && grey(p, w, 200, 20) < 5, 'and still a blur, not a smear');
});

test('a new patient eases into the lobule: the tissue crossfades instead of snapping', () => {
  // The tissue bitmap is redrawn in one step when its state changes; the picture it replaces is kept and faded out under it.
  assert.match(lz, /const XF_MS = 900;/);
  assert.match(lz, /if \(worldState && ws !== worldState && !unseen\(\) && worldGeo === G && worldCv\.width && !\(xfT0 && now - xfT0 < XF_MS\)\) \{ \[worldOld, worldCv\] = \[worldCv, worldOld\];/,
    'swapped, not copied, and a change mid-fade does not restart it');
  assert.match(lz, /const worldStateOf = \(m, G, dark, cs\) => \[G\.W, G\.H, dark,/);
  assert.match(lz, /const ws = worldStateOf\(m, G, dark, cs\);[\s\S]*?const wk = sc\.toFixed\(3\) \+ '\|' \+ ws;/, 'only a new state fades, never a new drawing scale');
  // (Mixed (1 − u)·old + u·new at the bitmap's own size, then placed: see tests/fibrous-band-ends.test.js for why not one over the other.)
  assert.match(lz, /const u = xfU\(xfT0, now\)[^\n]*\n[^\n]*\n[^\n]*x\.globalAlpha = 1 - u; x\.drawImage\(worldOld, 0, 0, n, xfCv\.height\);\n[^\n]*x\.globalAlpha = u; x\.drawImage\(worldCv, 0, 0\);[^\n]*\n\s+c\.drawImage\(xfCv, sx \* dpr, sy \* dpr, side, side\);/, 'the old picture under the new one, both sharp');
  assert.match(lz, /if \(xfT0\) \{ xfT0 = 0; free\(worldOld\); free\(xfCv\); tissueGL\?\.sweep\(\); \}/, 'the old picture is given back once faded, and any GPU copy of it');
  // The surround's tiles too, and the frame loop keeps drawing while either fades.
  assert.match(lz, /if \(surNow && t\.set !== surNow\.set && surNow\.q\.cv\?\.width && !unseen\(\)\) \{ surOld = surNow\.q; surT0 = now; \}/);
  assert.match(lz, /if \(rzMoving \|\| lensFrom \|\| tissueFading\(now\)\) drawVersion\+\+;/);
  assert.match(lz, /\[W, H, dpr, wk, gpu, fading \?/, 'each fading frame draws the tissue again');
  // The sinusoids' dulling follows the eased resistance, as their calibers do.
  assert.match(lz, /const sinFib = \(\) => clamp\(Math\.log\(rzOf\(\)\.sin\) \/ 3\.2, 0, 1\);/);
});

test('a patient changed while the lobule is closed dives into that patient\'s lobule: nothing eases from the last visit (Mohammad, 17 Oct)', () => {
  // Cirrhosis set in the anatomy, then a zoom in: the dive magnifies the lobule's first frame, so that frame must already be cirrhotic.
  const fn = lz.match(/function snapState\(\) \{\n([^}]*)\}/);
  assert.ok(fn, 'snapState exists');
  for (const part of ['easeP = createEaser();', 'rz = null;', 'xfT0 = 0;', 'surOld = null;', 'surT0 = 0;', 'snapNext = true;']) assert.ok(fn[1].includes(part), part);
  assert.match(lz, /const unseen = \(\) => fade <= 0 \|\| staging \|\| snapNext;/);
  assert.match(lz, /showTissueGL\(paintTissue\(W, H, dpr, dark, cs, !g, [^\n]*\)\);\n\s+snapNext = false;/, 'one frame only');
  // Every way the lobule is drawn out of sight starts from the patient's state: the dive's staging, the idle preparation, a reopen.
  assert.match(lz, /staging = true; snapState\(\);\n\s+try \{ update\(F\); \}/);
  assert.match(lz, /snapState\(\);\n\s+model = lobuleState\(\{ \.\.\.F, P: F\.Pf \|\| F\.P \}, st\);/);
  assert.match(lz, /diveDrawn = false; snapState\(\); if \(F\) update\(F\);/);
  // Out of sight, the surround's tiles are drawn for the new state at once, not left on the last state's.
  assert.match(lz, /const t = fieldTile\(cs, dark, want, !unseen\(\)\)/);
  // And the dive's field follows the latest frame, not the model left from the last visit.
  assert.match(lz, /const fieldState = \(\) => \{ const m = !unseen\(\) && model \? model : F \? closedModel\(\) : model;/);
  assert.match(lz, /fsM = lobuleState\(\{ \.\.\.F, P: F\.Pf \|\| F\.P \}, st\);/);
});

test('the lobule\'s tissue fills each pixel only with the passes that change it, so a slide\'s camera glide stays smooth (Mohammad, 17 Oct)', () => {
  const s = lz.indexOf('function paintTissue('), e = lz.indexOf('function diveCopy(');
  const pt = lz.slice(s, e);
  // No whole-screen fill of the page's colour: only past the focus fade's outer edge, where the fade would lay it at full strength anyway.
  assert.doesNotMatch(pt, /c\.fillStyle = bg; c\.fillRect\(0, 0, W, H\);/);
  assert.match(pt, /if \(reach > fOut \+ 1\) \{ c\.beginPath\(\); c\.rect\(0, 0, tw, th\); c\.moveTo\(ox \+ fOut \+ 1, oy\); c\.arc\(ox, oy, fOut \+ 1, 0, TAU\); c\.fill\('evenodd'\); \}/);
  // The surround: inside the fade's outer edge, and not under the lobule's opaque middle unless two pictures are crossfading.
  assert.match(pt, /c\.beginPath\(\); c\.arc\(ox, oy, fOut \+ 2, 0, TAU\);\n\s+if \(!crossfading\) \{/);
  assert.match(pt, /const mg = 2 \+ 3 \* Math\.max\(1, \(dpr \* V\.k\) \/ worldSc\);/);
  assert.match(pt, /c\.clip\('evenodd'\);/);
  assert.ok(pt.indexOf('if (wk !== worldKey) {') < pt.indexOf('const crossfading'), 'the bitmap (and any crossfade it starts) is settled before the surround leaves a hole for it');
  // The fade: the annulus from its inner edge to past the surround's clip, so the clip's soft edge is covered at full strength.
  assert.match(pt, /fieldFade\(c, shadeOf\(rgb01\(bg\), dark\), ox, oy, rdv, 1, W \* dpr, H \* dpr, fIn, fOut, \[fIn - 1, fOut \+ 4\]\)/);
  assert.match(lz, /const vg = c\.createRadialGradient\(x, y, r0, x, y, r1\);\n\s+vg\.addColorStop\(0, css\(bg, 0\)\);/, 'clear at the inner edge, the page colour at full strength past its outer edge');
  assert.match(pt, /fIn = rdv \* 1\.1;/); assert.match(pt, /const fOut = fadeOuter\(fIn, reach\);/);
  // The lobule's bitmap is opaque inside its own outline (filled first, at 1.015 of the hexagon, full strength).
  assert.match(lp, /const px = l\.x \+ \(x - l\.x\) \* 1\.015, py = l\.y \+ \(y - l\.y\) \* 1\.015;[^\n]*c\.fill\(\); \}/);
});

test('holding only the ductules, the lobule\'s effects layer clears only where they were, not the whole screen each camera frame', () => {
  assert.match(lz, /if \(fxBoxes\) \{ c\.setTransform\(1, 0, 0, 1, 0, 0\); for \(const \[x0, y0, x1, y1\] of fxBoxes\) c\.clearRect\(x0, y0, x1 - x0, y1 - y0\);[^\n]*\n\s+else c\.clearRect\(0, 0, W, H\);\n\s+fxBoxes = moving \? null : \[\];/);
  assert.match(lz, /fx\.width = fw; fx\.height = fh; fxDrawn = ''; fxBoxes = null;/, 'a resized layer starts from a full clear');
  // Each ductule's box: its outer ring plus the stroke, on screen, and 3 px more.
  assert.match(lz, /e = \(r \+ c\.lineWidth\) \* V\.k \* dpr \+ 3/);
  assert.match(lz, /return \{ lumen, cells, nuc, disc: \[x, y, rout\] \};/);
});

// (31 Oct, his iPhone readout on e52a280e: every frame of a pan in the lobule painted its tissue again, "state changed", 10.9 MB
// each. The state carried the portal venule's ink, which the tissue bitmap never draws: the vessels are the GPU's, or the flat
// strokes on the tissue canvas, keyed apart. A pressure gliding with the model moved it at each step.)
test("the lobule's tissue bitmap is keyed only on what it paints: no vessel ink", () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const ws = lz.match(/const worldStateOf = [^\n]+/)[0];
  assert.doesNotMatch(ws, /ink/i);
  const i = lp.indexOf('export function paintLobule('), body = lp.slice(i, lp.indexOf('\n}\n', i));
  assert.ok(i >= 0 && body.length > 1000, 'the painting itself');
  assert.doesNotMatch(lz.match(/function worldInput\([\s\S]*?\n {2}\}\n/)[0], /\binkOf\(|\bink\(|tubeInk\(|m\.mode/, 'nor does what it is given');
  assert.doesNotMatch(body, /\binkOf\(|\bink\(|tubeInk\(|m\.mode/, 'the bitmap draws no vessel ink and no lens');
  assert.doesNotMatch(lz, /const qi = /);
});
