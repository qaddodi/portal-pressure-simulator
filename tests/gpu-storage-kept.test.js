import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R05 (review pass 2): reusing a JS array is not enough: the GPU storage behind it must be kept too. The vessel layer's dynamic
// buffers (the fluid's ripple cells, the row redraw's cells) and its entries' texture keep their storage and rewrite their used part.
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const slice = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

function fakeGL() {
  const calls = { bufferData: 0, bufferSubData: 0, texImage2D: 0, texSubImage2D: 0, bytes: 0 };
  const gl = {
    ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, TEXTURE_2D: 3,
    bindBuffer() {}, bindTexture() {},
    bufferData(_, d) { calls.bufferData++; calls.bytes += typeof d === 'number' ? d : d.byteLength; },
    bufferSubData() { calls.bufferSubData++; },
    texImage2D() { calls.texImage2D++; }, texSubImage2D() { calls.texSubImage2D++; },
  };
  return { gl, calls };
}
function helpers(gl, prealloc = true) {
  const src = slice(veins, '  const keptStats = {', '  // The cells (world origins on the CELL grid)');
  return new Function('gl', 'PREALLOC', 'cellCap', `${src}\nreturn { keepBuf, keepRows, keptStats };`)(gl, prealloc, new Map());
}

test('a fluid ease of a hundred steps grows the buffer a few times and rewrites it the rest', () => {
  const { gl, calls } = fakeGL();
  const { keepBuf, keptStats } = helpers(gl);
  const buf = {};
  for (let i = 0; i < 100; i++) keepBuf(buf, new Float32Array(200 + ((i * 37) % 300)));   // (the ripple's cells come and go with the level)
  assert.ok(calls.bufferData <= 3, `storage made ${calls.bufferData} times`);
  assert.equal(calls.bufferSubData, 100);
  assert.equal(keptStats.sub + keptStats.grow, 100);
  assert.ok(keptStats.bytes <= Math.ceil(1.5 * 4 * 499 / 4) * 4, `bounded: the storage ends at most 1.5x the largest list (${keptStats.bytes} bytes)`);
});

test('?prealloc=0 keeps the old path: new storage every upload', () => {
  const { gl, calls } = fakeGL();
  const { keepBuf } = helpers(gl, false);
  for (let i = 0; i < 10; i++) keepBuf({}, new Float32Array(8));
  assert.equal(calls.bufferData, 10);
  assert.equal(calls.bufferSubData, 0);
});

test('a rebinning writes its rows into the entries\' kept texture, taller only when outgrown', () => {
  const { gl, calls } = fakeGL();
  const { keepRows } = helpers(gl);
  const tex = {};
  for (const rows of [100, 90, 110, 120, 80, 124]) keepRows(tex, 0, 0, 0, 16, rows, new Float32Array(16 * rows * 4));
  assert.equal(calls.texImage2D, 1, 'made once, a quarter taller than the first binning');
  assert.equal(calls.texSubImage2D, 6);
  keepRows(tex, 0, 0, 0, 16, 200, new Float32Array(16 * 200 * 4));
  assert.equal(calls.texImage2D, 2, 'outgrown: made taller');
});

test('the fluid, the row redraw and the rebinning use the kept storage', () => {
  assert.match(veins, /keepBuf\(fluidBuf, cells\);/);
  assert.match(veins, /keepBuf\(partBuf, gen\); keepBuf\(partSBuf, one\);/);
  assert.match(veins, /keepRows\(entTex, gl\.RGBA32F, gl\.RGBA, gl\.FLOAT, ENT_W, bins\.rows \|\| 1,/);
  // (the cavity's spans: rewritten in place while the texture's width, which the shader reads with textureSize, holds)
  assert.match(veins, /if \(PREALLOC && fluidN === n && fluidTexN === n\) \{ gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, n, 2,/);
});

test('the ascites surface\'s hidden SVG copy is not rewritten for the ripple\'s phase while the GPU draws it', () => {
  assert.match(stage, /const ASC_LAZY = !\/\[\?&\]asclazy=0\\b\/\.test\(location\.search\);/);
  assert.match(stage, /if \(!\(ASC_LAZY && wrap\.classList\.contains\('gl-on'\)\) \|\| Math\.abs\(fluidH - ascWroteH\) > 0\.25 \|\| fluidAmp !== ascWroteAmp \|\| performance\.now\(\) - ascWroteAt > 1000\) ascitesSvg\(\);/);
  // Every reader brings it up to date first: the selection's outline, the hover, the SVG shown again.
  assert.match(slice(stage, '  function syncSelFluid() {', '  function syncSelLine'), /ascitesSvg\(\);/);
  assert.match(stage, /ascitesSvg\(\);\n\s+const fd = ascitesPath\.getAttribute\('d'\);/);
  assert.match(stage, /if \(geoHeld\.size\) flushGeo\(\); ascitesSvg\(\); \}/);
});
