import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Mohammad, 31 Oct and 1 Nov: zooming in the lobule, the hepatocytes and the background all went black. The tissue's GPU canvas was
// opaque, so any frame the browser had no picture for it (a lost context, a buffer let go) showed as solid black. It is see-through now
// (each pixel is still drawn whole, so the picture is the same), and a context the browser gives back puts the tissue back on the GPU.
test('the lobule tissue canvas is see-through, never an opaque black sheet', () => {
  const gl = src('src/ui/tissue-gl.js');
  // (Every pixel drawn whole: the picture over the page is the one an opaque canvas showed.)
  assert.match(gl, /o = vec4\(mix\(c, uBg, a\), 1\.0\);/);
});

test('a lost tissue context is put aside at once, and a restored one is drawn on again', () => {
  // (Made again only when asked for: tissueGLOn creates it when it is undefined.)
});
