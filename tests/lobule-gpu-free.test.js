// The lobule's tissue gives its GPU copies back as soon as their canvases are given back (performance review B7, 31 Oct). A
// crossfade's old picture, a bitmap replaced by the sharper one painted ahead, and the field's older tiles were freed on the page at
// once, but their textures (up to 3600 px square, with mipmaps about 69 MB) stayed on the GPU until the next sweep, which a
// spare painted later, or the lobule's close, ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('a crossfade that ends gives back the old picture and its texture', () => {
  assert.match(fn('function tissueOnGPU('), /if \(!crossfading && xfT0\) \{ xfT0 = 0; free\(worldOld\); tg\.sweep\(\); \}/);
  assert.doesNotMatch(fn('function paintTissue('), /xfCv/, 'no 2D mix canvas'); 
});

test('the bitmap replaced by the sharper one painted ahead takes its texture with it', () => {
  assert.match(fn('function paintTissue('), /const swapped = worldCv; worldCv = spareCv; spareCv = swapped; free\(spareCv\); tg\.sweep\(\);/);
});

test('a snap to the patient and the trim before a wide dive give back the textures of what they free', () => {
  assert.match(fn('function snapState() {'), /free\(worldOld\);[^\n]*\n\s+tissueGL\?\.sweep\(\);/);
  assert.match(fn('function trimFieldStates() {'), /tileSets\.delete\(key\); \}\n\s+tissueGL\?\.sweep\(\); fieldGL\?\.sweep\(\);/);
});

test('a sweep only deletes the textures of canvases given back (width 0) or not wanted', () => {
  const gl = readFileSync(new URL('../src/ui/tissue-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /sweep\(keep = \(\) => true\) \{\n\s+for \(const \[cv, t\] of texs\) if \(!cv\.width \|\| !keep\(cv\)\) \{ if \(!lost\) gl\.deleteTexture\(t\.tex\); texs\.delete\(cv\); \}/);
  // (Every draw looks a texture up by a canvas with pixels, so one swept is never sampled: an empty canvas binds the 1 px clear one.)
  assert.match(gl, /tx\[3\] = w\?\.width \? texFor\(w, wVer, false\) : none;/);
  // (and a texture the GPU could not take (null) is never bound: the 2D canvas draws that frame)
  assert.match(gl, /if \(!tx\[0\] \|\| !tx\[1\] \|\| !tx\[2\] \|\| !tx\[3\] \|\| !tx\[4\]\) \{\n\s+if \(hold && pictured && tgt\.width === W && tgt\.height === H\) \{ hostDone\(\); return 'held'; \}/);
  assert.match(gl, /for \(let i = 0; i < tx\.length; i\+\+\) if \(!tx\[i\]\) tx\[i\] = none;/, 'never sampled without a texture: the clear one in its place');
  assert.match(gl, /for \(let unit = 0; unit < 5; unit\+\+\) \{ gl\.activeTexture\(gl\.TEXTURE0 \+ unit\); gl\.bindTexture\(gl\.TEXTURE_2D, tx\[unit\]\); \}/);
  assert.match(gl, /const old = wo\?\.width && wMix < 1;/);
});
