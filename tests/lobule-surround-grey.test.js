// In a lens other than Pressure the anatomy's organs are grey (stage.js plateTargets). The lobules round the one in focus, in the dive's
// field and in the open lobule view, must be the same grey as the liver they are zoomed into or out of; the lobule in focus keeps
// the lens's colours (Mohammad, 26 Oct: "the surrounding lobules should also be gray as the color of the liver").
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surroundGrade, gradeSurround, greyStep } from '../src/ui/lobule-look.js';
import { LENS_GREY, isGreyLens, LUMA } from '../src/ui/organ-dim.js';
import { greyOf } from '../src/ui/organ-grey.js';
import { lensModeOf } from '../src/ui/lobule-model.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');
const fgl = read('../src/ui/field-gl.js');
const tgl = read('../src/ui/tissue-gl.js');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('the surround takes the two numbers the organs are greyed with, in the same lenses', () => {
  // stage.js holds the numbers as literals (it is edited by many hands): this keeps the two places equal.
  assert.match(stage, new RegExp(`dataLayer \\? ${LENS_GREY.dim} : 1\\), dataLayer \\? ${LENS_GREY.sat} : 1,`), 'plateTargets: [dim, sat, …]');
  assert.match(stage, new RegExp(`wrap\\.classList\\.contains\\('data-layer'\\) \\? ${LENS_GREY.dim} : 1`), 'the fluid\'s share of the dim');
  assert.match(stage, /wrap\.classList\.toggle\('data-layer', !\['pressure', 'neutral'\]\.includes\(mode\)\);/, 'the lenses that grey the organs');
  for (const m of ['pressure', 'neutral']) assert.equal(isGreyLens(m), false, m);
  for (const m of ['origin', 'oxygen', 'delta', 'since', 'flow', 'velocity', 'drop']) assert.equal(isGreyLens(m), true, m);
  assert.deepEqual(surroundGrade(0), [1, 1], 'the pressure lens: the tiles as drawn');
  assert.deepEqual(surroundGrade(1), [LENS_GREY.sat, LENS_GREY.dim]);
  assert.deepEqual(surroundGrade(-3), [1, 1]);
  assert.deepEqual(surroundGrade(7), [LENS_GREY.sat, LENS_GREY.dim]);
});

test('a surround colour ends up the colour the anatomy gives the same paint: toward its luma, then toward the page', () => {
  const bg = [0.97, 0.96, 0.94];
  for (const c of [[0.91, 0.76, 0.71], [0.79, 0.56, 0.49], [0.3, 0.45, 0.8], [0.2, 0.2, 0.2], [1, 1, 1]]) {
    // The organ: its paint made grey (organ-grey.js greyOf, a `color(srgb …)`), then its group's opacity over the page.
    const g = greyOf([...c, 1], LENS_GREY.sat).match(/srgb ([\d.-]+) ([\d.-]+) ([\d.-]+)/).slice(1).map(Number);
    const organ = g.map((x, i) => bg[i] + (x - bg[i]) * LENS_GREY.dim);
    const got = gradeSurround(c, bg, surroundGrade(1));
    got.forEach((v, i) => assert.ok(Math.abs(v - organ[i]) < 1e-5, `${c}: ${got} vs ${organ}`));
    gradeSurround(c, bg, surroundGrade(0)).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 1e-12, 'untouched at 0'));
  }
  // A colour is drained, never brightened past the page's: grey stays between its luma and the page.
  const out = gradeSurround([0.5, 0.2, 0.2], bg, surroundGrade(1)), l = LUMA[0] * 0.5 + LUMA[1] * 0.2 + LUMA[2] * 0.2;
  assert.ok(Math.max(...out) - Math.min(...out) < 0.5 * (0.5 - 0.2), 'much of the colour is gone');
  assert.ok(out.every((v) => v > l && v < bg[0] + 1e-9));
});

test('both shaders grade the surround before the lobule\'s bitmap and the fade into the page, with the same line', () => {
  const line = /if \(uGrey\.x < 1\.0 \|\| uGrey\.y < 1\.0\) c = mix\(uBg, mix\(vec3\(dot\(c, vec3\(0\.299, 0\.587, 0\.114\)\)\), c, uGrey\.x\), uGrey\.y\);/;
  assert.match(fgl, line);
  assert.match(tgl, line);
  assert.deepEqual(LUMA, [0.299, 0.587, 0.114]);
  // The field: after the quieted tile is laid over the liver-toned one, before the fade and the emerging mask.
  assert.ok(fgl.indexOf('if (uQuiet > 0.0) c = ') < fgl.search(line) && fgl.search(line) < fgl.indexOf('if (uFade.w > 0.0)') && fgl.indexOf('if (uFade.w > 0.0)') < fgl.indexOf('float m = 1.0;'));
  // The tissue: after the last state's tile, before the bitmap goes over: the lobule in focus keeps the lens's colours.
  assert.ok(tgl.indexOf('if (uQOld > 0.0) c = ') < tgl.search(line) && tgl.search(line) < tgl.indexOf('vec4 l = textureGrad(uW, w') && tgl.indexOf('vec4 l = textureGrad(uW, w') < tgl.indexOf('float s = clamp('));
  for (const src of [fgl, tgl]) {
    assert.match(src, /'uGrey'\]\.map/, 'the uniform is looked up');
    assert.match(src, /gl\.uniform2f\(U\.uGrey, grey \? grey\[0\] : 1, grey \? grey\[1\] : 1\);/, 'and set each frame (1, 1 when nothing greys)');
    assert.match(src, /grey = null \}\) \{/);
  }
});

test('every place the surround is drawn takes the grade: the field on the GPU and on the 2D canvas, the tissue on the GPU and on the 2D canvas', () => {
  assert.match(fn('function paintFieldGL('), /gk = greyNow\(\);[\s\S]*grey: gk > 0 \? surroundGrade\(gk\) : null,/);
  const pf = fn('function paintField(d) {');
  assert.match(pf, /const gk = greyNow\(\);\n\s+if \(gk > 0\) fieldGrey\(c, shadeOf\(bg, dark\), surroundGrade\(gk\), field\.width, field\.height\);\n\s+if \(fadeWhole\) c\.restore\(\);/, '2D field: inside its clip, before the fade');
  assert.ok(pf.indexOf('fieldGrey(') < pf.indexOf('fieldFade(c,'), 'the fade into the page comes after the grey, as in the shader');
  assert.match(fn('function tissueOnGPU('), /bg: tone, grey: grey\.k > 0 \? surroundGrade\(grey\.k\) : null,/);
  const pt = fn('function paintTissue(W, H, dpr, dark, cs, flatVessels, tg = null) {');
  assert.match(pt, /gk = greyNow\(now\)/);
  assert.match(pt, /V\.y\.toFixed\(1\), gk\.toFixed\(3\)\]\.join\('\|'\);\n\s+if \(key === tissueKey\) return gpu;/, 'a changing grey redraws the picture, and nothing else');
  assert.match(pt, /if \(gk > 0\) fieldGrey\(c, shadeOf\(rgb01\(bg\), dark\), surroundGrade\(gk\), tw, th\);\n\s+c\.restore\(\);/, '2D tissue: inside the surround\'s clip');
  assert.ok(pt.indexOf('fieldGrey(') < pt.indexOf('c.drawImage(worldCv'), 'the 2D bitmap is laid after it: the lobule in focus is not greyed');
  assert.ok(pt.indexOf('fieldGrey(') < pt.indexOf('fieldFade(c,'));
  // The dive's and the rise's copies are made from the 2D tissue, so they carry the grey.
  assert.match(lz, /if \(rim && !wide\) \{ paint2D\(\); diveCopy\(\); \}/, 'the copy is made from a fresh 2D drawing');
  assert.match(fn('function paint2D() {'), /tissueKey = ''; idleDrawn = '';[\s\S]*paintTissue\(W, H,/);
});

test('the grey is drawn as the 2D passes can: a saturation blend, then the page\'s colour over it', () => {
  const fg = fn('function fieldGrey(c, bg, [sat, dim], w, h) {');
  assert.match(fg, /c\.globalCompositeOperation = 'saturation'; c\.fillStyle = `rgba\(128,128,128,\$\{\(1 - sat\)\.toFixed\(3\)\}\)`; c\.fillRect\(0, 0, w, h\); \} {3}\/\/ colour-exempt/);
  assert.match(fg, /c\.globalCompositeOperation = 'source-over';\n\s+if \(dim < 1\) \{ c\.fillStyle = css\(bg, 1 - dim\); c\.fillRect\(0, 0, w, h\); \}/);
});

test('it eases over the lens crossfade, there at once where nothing of the surround is seen, and keeps the loop going while it moves', () => {
  assert.match(lz, /const greyNow = \(now = performance\.now\(\)\) => greyStep\(grey, isGreyLens\(lensModeOf\(store\.get\(\)\)\) \? 1 : 0, now, LENS_FADE, !surroundSeen\(\) \|\| reduce\.matches\);/);
  assert.match(lz, /const surroundSeen = \(\) => !unseen\(\) \|\| fieldOp > 0\.002;/);
  assert.match(lz, /if \(rzMoving \|\| lensFrom \|\| tissueFading\(now\)\) drawVersion\+\+;.*\n\s+if \(greyMoving\(\)\) drawVersion\+\+;/);
  assert.match(lz, /const greyMoving = \(\) => \{ greyNow\(\); return grey\.k !== grey\.to; \};/);
  const s = { k: 0, from: 0, to: 0, t0: 0 };
  // Seen: a smooth ease to 1 over 300 ms, never a step.
  let last = 0;
  assert.equal(greyStep(s, 1, 1000, 300), 0, 'starts where it was');
  for (let t = 1000; t <= 1300; t += 4) {
    const k = greyStep(s, 1, t, 300);
    assert.ok(k >= last - 1e-12 && k - last < 0.06, `step ${k - last} at ${t}`);
    last = k;
  }
  assert.equal(last, 1);
  assert.equal(greyStep(s, 1, 5000, 300), 1, 'and stays');
  // Turned round mid-way: it goes back from where it is, not from an end.
  greyStep(s, 0, 6000, 300);
  const mid = greyStep(s, 0, 6150, 300);
  assert.ok(mid > 0 && mid < 1);
  const back = greyStep(s, 1, 6160, 300);
  assert.ok(Math.abs(back - mid) < 0.1, 'no jump when the lens is switched back');
  // Unseen (a dive not begun, the lobule staged ahead): there at once.
  assert.equal(greyStep(s, 0, 7000, 300, true), 0);
  assert.equal(greyStep(s, 1, 7001, 300, true), 1);
  // Reduced motion: no ease (ms 0 snaps too).
  assert.equal(greyStep({ k: 0, from: 0, to: 0, t0: 0 }, 1, 0, 0), 1);
});

test('the lens is read the way the lobule\'s own model and the anatomy read it', () => {
  assert.equal(lensModeOf({ imaging: true, colorMode: 'oxygen' }), 'neutral');
  assert.equal(lensModeOf({ colorMode: 'oxygen' }), 'oxygen');
  assert.equal(lensModeOf({ colorMode: 'pressure', compareSnap: {}, compareView: 'D' }), 'delta');
  assert.equal(lensModeOf({ colorMode: 'pressure', compareSnap: {}, compareView: 'A' }), 'pressure');
  assert.match(read('../src/ui/lobule-model.js'), /m\.mode = lensModeOf\(st\);/);
  assert.match(stage, /return isImaging\(\) \? 'neutral' : st\.compareSnap && st\.compareView === 'D' \? 'delta' : st\.colorMode;/, 'the anatomy\'s own rule');
});
