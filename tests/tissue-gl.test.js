// The open lobule's tissue on the GPU (tissue-gl.js): a pan or a pinch of the lobule repainted two or three full-screen 2D passes
// every frame (Mohammad, 25 Oct: "zooming in and panning around in ... lobule view is very laggy"). Its bitmap stays sharp through a
// zoom: never shown softer than the zoom wants, and never sharpened in a step once a gesture ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fadeAt, FADE_MID } from '../src/ui/lobule-look.js';

const gl = readFileSync(new URL('../src/ui/tissue-gl.js', import.meta.url), 'utf8');
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('the shader lays the same picture as the 2D passes: surround, the bitmap over it premultiplied, then the fade into the page', () => {
  assert.match(gl, /vec2 uv = \(p - uO\) \/ \(uRd \* vec2\(6\.0, 3\.4641016151377544\)\);/, 'one repeat per 6 rd by 2√3 rd, as fieldFill');
  assert.match(gl, /vec3 c = mix\(texture\(uQA, uv\)\.rgb, texture\(uQB, uv\)\.rgb, uMix\);/);
  assert.match(gl, /if \(uQOld > 0\.0\) c = mix\(c, texture\(uQO, uv\)\.rgb, uQOld\);/, 'the last state\'s tile over it as it fades out');
  assert.match(gl, /vec4 l = textureGrad\(uW, w, gx, gy\) \* uWMix\.x;\n\s+if \(uWMix\.y > 0\.0\) l \+= textureGrad\(uWO, w, gx, gy\) \* uWMix\.y;\n\s+l \*= e;\n\s+c = l\.rgb \+ c \* \(1\.0 - l\.a\);/, '(1 − u)·old + u·new, laid over');
  assert.match(gl, /gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !tile\);/);
  assert.match(gl, /gl\.TEXTURE_MIN_FILTER, gl\.LINEAR_MIPMAP_LINEAR\);\n\s+gl\.generateMipmap\(gl\.TEXTURE_2D\);/, 'mipmapped: a closer bitmap shown smaller stays sharp');
  assert.match(gl, /failIfMajorPerformanceCaveat: true/, 'never in software: the 2D canvas then');
});

test("the shader's fade is fieldFade's gradient (fadeAt)", () => {
  // float a = s < 0.5 ? uMid * s * 2.0 : uMid + (1.0 - uMid) * (s - 0.5) * 2.0;
  assert.match(gl, /float a = s < 0\.5 \? uMid \* s \* 2\.0 : uMid \+ \(1\.0 - uMid\) \* \(s - 0\.5\) \* 2\.0;/);
  const shader = (d, r0, r1) => { const s = Math.min(1, Math.max(0, (d - r0) / Math.max(r1 - r0, 1e-6))); return s < 0.5 ? FADE_MID * s * 2 : FADE_MID + (1 - FADE_MID) * (s - 0.5) * 2; };
  for (const d of [0, 50, 110, 150, 200, 260, 320, 400, 900]) assert.ok(Math.abs(shader(d, 110, 320) - fadeAt(d, 110, 320)) < 1e-12, `d ${d}`);
});

test('the screen draws on the GPU; the dive, the rise and their copies keep the 2D canvas', () => {
  assert.match(fn('function draw(dt) {'), /showTissueGL\(paintTissue\(W, H, dpr, dark, cs, !g, !keep2D && !scaled && g \? tissueGLOn\(\) : null\)\);/);
  assert.match(lz, /if \(gpu && tissueOnGPU\(tg, tw, th, dpr, dark, cs, bg, now\)\) \{ if \(!held\) spareSoon\(\); return true; \}/);
  assert.match(lz, /tissue\.style\.visibility = tissueG\.style\.visibility = show === tissue \? '' : 'hidden';/);
  assert.match(lz, /for \(const e of \[tissue, tissueG, diveCv, glCv, fx, leaders, labels\]\) \{/, 'zoomed with the others through the dive');
  assert.match(lz, /const WIDE_HIDE = \[tissue, tissueG, diveCv, glCv, fx\];/);
  assert.match(fn('function showTissueGL(on) {'), /tissue\.style\.opacity = on \? '0' : ''; tissueG\.style\.opacity = on \? '' : '0';/);
  assert.match(lz, /pointerEvents: 'none'/, 'the 2D canvas under it still takes the pointer');
});

test('never softer than the zoom wants: the bitmap is held only while at least as sharp, the sharper one is painted ahead', () => {
  const pt = fn('function paintTissue(W, H, dpr, dark, cs, flatVessels, tg = null) {');
  assert.match(pt, /if \(gpu && kept && sc > worldSc && spare && spare\.G === G && spare\.ws === ws && ws === worldState && spare\.sc >= sc && spareCv\.width\) \{/);
  assert.match(pt, /if \(held && kept && \(!gpu \|\| sc <= worldSc \|\| bitmapUnseen\(\)\)\) \{/, 'or while the shader has the whole picture and nothing of the bitmap is seen');
  assert.match(pt, /if \(!held && gpu && kept && ws === worldState && sc <= worldSc && worldSc <= sc \* 2\.01\) sc = worldSc;/, 'no repaint once a gesture ends');
  const sm = fn('function spareMake() {');
  assert.match(sm, /if \(handOn\(\) \|\| gliding\) \{ spareSoon\(\); return; \}/, 'painted between gestures, never in one');
  assert.match(sm, /\* 2, cap\);/);
  assert.match(sm, /g\.upload\(spareCv, spareCv\.ver\);/);
  assert.match(sm, /g\.upload\(quietTile\(t, tone\)\.cv, 0, true\);/, 'and the surround\'s tiles for that zoom');
});

test('nothing is ever sampled as black: the empty texture is complete, uploads use a spare unit, a tile given back skips the GPU frame', () => {
  const fgl = readFileSync(new URL('../src/ui/field-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /gl\.TEXTURE_MIN_FILTER, gl\.NEAREST\);/, 'the 1 px stand-in has no mip levels, so it must not use a mipmap filter');
  assert.match(gl, /gl\.activeTexture\(gl\.TEXTURE0 \+ SCRATCH\);/, 'sending a canvas must not replace a texture bound on a draw unit');
  assert.match(gl, /if \(!qa\?\.width \|\| \(qb && !qb\.width\)\) return false;/);
  assert.match(fgl, /if \(!a\?\.width \|\| \(b && !b\.width\) \|\| \(quiet > 0 && \(!qa\?\.width \|\| \(qb && !qb\.width\)\)\)\) return false;/);
});
