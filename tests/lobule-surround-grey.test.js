import { stageSource } from './stage-src.js';
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
const stage = stageSource();
const lz = read('../src/ui/lobule-zoom.js');
const fgl = read('../src/ui/field-gl.js');
const tgl = read('../src/ui/tissue-gl.js');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('the surround takes the two numbers the organs are greyed with, in the same lenses', () => {
  // stage.js holds the numbers as literals (it is edited by many hands): this keeps the two places equal.
  assert.match(stage, new RegExp(`dataLayer \\? ${LENS_GREY.dim} : 1\\); plateTgt\\[1\\] = dataLayer \\? ${LENS_GREY.sat} : 1;`), 'plateTargets: [dim, sat, …]');
  assert.match(stage, new RegExp(`flag\\.dataLayer \\? ${LENS_GREY.dim} : 1`), 'the fluid\'s share of the dim');
  assert.match(stage, /flag\.dataLayer = mode !== 'pressure' && mode !== 'neutral';/, 'the lenses that grey the organs');
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
  for (const [src, looked] of [[fgl, /'uGrey'\]\.map/], [tgl, /const COMMON_U = \[[^\]]*'uGrey', 'uRim'\];/]]) {
    assert.match(src, looked, 'the uniform is looked up');
    assert.match(src, /UC\.f2\(U\.uGrey, grey \? grey\[0\] : 1, grey \? grey\[1\] : 1\);/, 'and set each frame (1, 1 when nothing greys)');
    assert.match(src, /grey = null(, rim = null)?(, hold = false)? \}\) \{/);
  }
});

test('every place the surround is drawn takes the grade: the field and the tissue, both on the GPU', () => {
  assert.match(fn('function paintFieldGL('), /gk = greyNow\(\);[\s\S]*grey: gk > 0 \? surroundGrade\(gk\) : null,/);
  // (No 2D field since 1 Nov: paintField hands every frame to the GPU.)
  assert.match(fn('function paintField(d) {'), /const drew = g \? paintFieldGL\(g, d, W, H, dpr, cs, dark, bg\) : false;/);
  assert.doesNotMatch(lz, /function fieldGrey\(|fieldGrey\(c,/);
  assert.match(fn('function tissueOnGPU('), /A\.bg = tone; A\.grey = grey\.k > 0 \? surroundGrade\(grey\.k\) : null;/);
  const pt = fn('function paintTissue(W, H, dpr, dark, cs, flatVessels, tg = null) {');
  assert.match(pt, /gk = greyNow\(now\)/);
  assert.match(pt, /K\[ki\+\+\] = Math\.round\(gk \* 1000\);[\s\S]*?if \(same\) return gpu && keyGPU;/, 'a changing grey redraws the picture, and nothing else');
  // (The tissue has no 2D drawing since 1 Nov: the dive's and the rise's pictures are the shader's, so they carry the grey.)
  assert.doesNotMatch(pt, /fieldGrey\(|drawImage/);
  assert.doesNotMatch(lz, /function paint2D\(|diveCopy\(/);
});

test('the grey is the shaders\' alone: toward the luma, then toward the page (the 2D passes are gone, 1 Nov)', () => {
  const fgl = read('../src/ui/field-gl.js');
  assert.match(fgl, /c = mix\(uBg, mix\(vec3\(dot\(c, vec3\(0\.299, 0\.587, 0\.114\)\)\), c, uGrey\.x\), uGrey\.y\);/);
  assert.doesNotMatch(lz, /globalCompositeOperation = 'saturation'/);
});

test('it eases over the lens crossfade, there at once where nothing of the surround is seen, and keeps the loop going while it moves', () => {
  assert.match(lz, /const greyNow = \(now = performance\.now\(\)\) => greyStep\(grey, isGreyLens\(lensModeOf\(store\.get\(\)\)\) \? 1 : 0, PACED \? easeNow\(\) : now, LENS_FADE, !surroundSeen\(\) \|\| reduce\.matches\);/);
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
