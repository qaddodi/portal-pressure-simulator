import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Doppler monitor on a phone (three device pixels per point) dipped the frame rate hard (Mohammad, 22 Oct, 1:03 AM ET): its
// new spectral lines were written straight into the ring canvas (putImageData on a canvas the browser keeps on the GPU, a wait
// and a copy of the whole ring every frame), and the whole canvas was cleared every frame although the trace's rectangle is
// drawn whole and opaque. The same pixels.
test('the Doppler monitor sends only its new lines to the GPU and draws none of its trace on the CPU', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /if \(x0 \+ n <= RW\) gpu\.ringCols\(img, x0, n\);\n\s+else \{ gpu\.ringCols\(img, x0, RW - x0\); gpu\.ringCols\(img, 0, x0 \+ n - RW\); \}/);
  assert.match(src, /if \(full\) \{ glFrom = 'img'; imgWhole = true; \}/, 'a whole redraw sends the ring whole');
  assert.match(src, /traceBox = \[dx, dy, RW, RH\];/);
  assert.doesNotMatch(src, /getContext\('2d'\)|putImageData|drawImage|OffscreenCanvas/, 'no canvas 2D: the trace is the GPU\'s alone');
});

// "Move to GPU. Seems worth it" (Mohammad, 22 Oct, 1:18 AM ET), then "nothing off the GPU" (1 Nov): the trace (the ring, the noise floor
// added over it, the wall filter's band) is drawn by one fragment shader into a canvas under the monitor's canvas, and the margins, words,
// ticks and calipers by the GPU's chart drawer over it. A size change stretches the ring on the GPU.
test('the Doppler trace and its words are drawn on the GPU', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/doppler-gl.js', import.meta.url), 'utf8');
  assert.match(src, /const gpu = createDopplerGL\(\{ onReady: \(\) => redraw\(\) \}\);\n\s+if \(gpu\) \{ gpu\.canvas\.setAttribute\('aria-hidden', 'true'\); cv\.before\(gpu\.canvas\); \}/);
  assert.match(src, /const words = createTraceGL\(cv, \{ redraw: \(\) => redraw\(\) \}\);/);
  assert.match(src, /const pen = fitPen\(cv, words\);\n\s+try \{ drawWith\(pen, now\); \} finally \{ pen\.ctx\.end\?\.\(\); \}/);
  assert.match(src, /const onGpu = !!gpu && !gpu\.lost;/);
  assert.match(src, /if \(glFrom === 'img'\) gpu\.ringAll\(img, RW, RH\);/);
  assert.match(src, /drawn = gpu\.render\(\{ W: CW, H: CH, dx, dy, RW, RH, p, nx, ny, noiseA: mode === 'spectrum' \? 1 : 0\.3, base: g\.rBase, wf: wfPx \}\);/);
  assert.match(src, /gpu\.stretch\(RW, RH, /, 'a new size stretches the ring on the GPU');
  assert.match(src, /gpu\?\.noise\(fi\);/);
  assert.doesNotMatch(gl, /SwiftShader\|llvmpipe/, 'a software renderer draws it too: there is no 2D path to keep');
  assert.match(gl, /blitFramebuffer/);
  assert.match(gl, /webglcontextlost/);
  assert.match(gl, /vec3 col = min\(vec3\(1\.0\), r \+ n \* noiseA\);/, "the noise is added and clamped as 'lighter' adds it");
  assert.match(gl, /0\.9 \* max\(0\.0, 1\.0 - abs\(float\(ly\) \+ 0\.5 - wall\.x\) \/ wall\.y\)/, 'the band darkens as the gradient did');
  assert.match(gl, /gl\.NEAREST/, 'texels read one to one');
  assert.match(gl, /UNPACK_ROW_LENGTH/, 'new columns go up alone');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.instrument-workspace \.dop-box > canvas:first-child \{ background: var\(--scope-bg\); \}/, 'the background sits on the lowest canvas, never over the GPU one');
});
