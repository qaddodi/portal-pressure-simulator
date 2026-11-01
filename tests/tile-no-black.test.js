import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldFS } from '../src/ui/field-gl.js';
import { tissueFS } from '../src/ui/tissue-gl.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Mohammad, 1 Nov (iPhone): zooming out of the lobule to the anatomy, the neighbouring lobules flashed black. A tile canvas the browser
// could not give memory to is transparent, and the shaders read only its rgb (0): solid black. Now each tile is laid over the page's
// colour by its own alpha (an opaque tile: the same picture), and a blank tile is drawn again instead of being kept.
test('the shaders lay the neighbour tiles over the page, so a blank tile is never black', () => {
  for (const [name, fs] of [['field', fieldFS(true)], ['tissue', tissueFS(false, true)], ['tissue live', tissueFS(true, true)]]) {
    assert.match(fs, /vec3 over\(vec4 t\) \{ return t\.rgb \* t\.a \+ uBg \* \(1\.0 - t\.a\); \}/, name);
    assert.doesNotMatch(fs, /texture\(uQ?[AB], uv(, bias)?\)\.rgb/, `${name}: no tile read by its rgb alone`);
  }
  // (?tileover=0: the shaders as they were.)
  assert.doesNotMatch(fieldFS(false), /over\(/);
  assert.match(fieldFS(false), /vec3 c = mix\(texture\(uA, uv, bias\)\.rgb, texture\(uB, uv, bias\)\.rgb, uMix\);/);
  assert.match(tissueFS(false, false), /vec3 c = mix\(texture\(uQA, uv\)\.rgb, texture\(uQB, uv\)\.rgb, uMix\);/);
});

test('a blank tile is not kept: it is drawn again, at most every TILE_RETRY ms', () => {
  const lz = src('src/ui/lobule-zoom.js');
  assert.match(lz, /function tileBlank\(cv, c\) \{\n\s+if \(!TILE_OVER\) return false;/);
  assert.match(lz, /const blank = tileBlank\(cv, c\);\n\s+Object\.assign\(t, \{ tw, th, TW, TH, cv, pats: new WeakMap\(\), blank,/);
  assert.match(lz, /if \(t\.cv && tileDue\(t\)\) \{ free\(t\.cv\); t\.cv = null;/);
  assert.match(lz, /if \(t\.quiet\?\.k === k && !tileDue\(t\.quiet\)\) return t\.quiet;/);
  assert.match(lz, /\|\| tileDue\(t\.liverQ\)\) \{/);
});
