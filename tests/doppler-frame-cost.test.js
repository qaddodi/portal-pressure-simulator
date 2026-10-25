import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Doppler monitor on a phone (three device pixels per point) dipped the frame rate hard (Mohammad, 22 Oct, 1:03 AM ET): its
// new spectral lines were written straight into the ring canvas (putImageData on a canvas the browser keeps on the GPU, a wait
// and a copy of the whole ring every frame), and the whole canvas was cleared every frame although the trace's rectangle is
// drawn whole and opaque. The same pixels.
test('the Doppler monitor writes new lines through a small canvas and clears only round the trace', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /const put = \(sx, w\) => \{ cctx\.putImageData\(img, -sx, 0, sx, 0, w, RH\); octx\.drawImage\(colCv, 0, 0, w, RH, sx, 0, w, RH\); if \(gpu && !glFrom\) gpu\.ringCols\(img, sx, w\); \};/);
  assert.match(src, /if \(x0 \+ n <= RW\) put\(x0, n\);\n\s+else \{ put\(x0, RW - x0\); put\(0, x0 \+ n - RW\); \}/);
  assert.doesNotMatch(src, /octx\.putImageData\(img, 0, 0, x0, 0, n, RH\)/);
  assert.match(src, /if \(full\) \{ octx\.putImageData\(img, 0, 0\); glFrom = 'img'; \}/, 'a whole redraw still writes the ring whole');
  assert.match(src, /ctx\.fillRect\(0, 0, cv\.width, by\); ctx\.fillRect\(0, by \+ bh, cv\.width, cv\.height - by - bh\);/);
  assert.match(src, /traceBox = \[dx, dy, RW, RH\];/);
  assert.match(src, /\} else ctx\.fillRect\(0, 0, cv\.width, cv\.height\);\n\s+traceBox = null;/, 'without a trace drawn last frame the whole canvas is cleared');
});

// "Move to GPU. Seems worth it" (Mohammad, 22 Oct, 1:18 AM ET): the trace (the ring, the noise floor added over it, the wall filter's
// band) is drawn by one fragment shader into a canvas under the monitor's 2D canvas, which clears the trace's rectangle and keeps
// the margins and words. The 2D path stays as the fallback (no WebGL2, a software renderer, a lost context), with the same pixels.
test('the Doppler trace is drawn on the GPU under the 2D canvas, the 2D path kept as the fallback', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/doppler-gl.js', import.meta.url), 'utf8');
  assert.match(src, /const gpu = createDopplerGL\(\);\n\s+if \(gpu\) \{ gpu\.canvas\.setAttribute\('aria-hidden', 'true'\); cv\.before\(gpu\.canvas\); \}/);
  assert.match(src, /const onGpu = !!gpu && !gpu\.lost;/);
  assert.match(src, /if \(glFrom === 'img'\) gpu\.ringAll\(img, RW, RH\); else if \(glFrom === 'off'\) gpu\.ringAll\(off, RW, RH\);/, 'a whole redraw or a stretch sends the ring whole');
  assert.match(src, /drawn = gpu\.render\(\{ W: cv\.width, H: cv\.height, dx, dy, RW, RH, p, nx, ny, noiseA: mode === 'spectrum' \? 1 : 0\.3, base: g\.rBase, wf: wfPx \}\);\n\s+if \(drawn\) ctx\.clearRect\(dx, dy, RW, RH\);/);
  assert.match(src, /if \(!drawn\) \{\n\s+if \(gpu\) glFrom = 'off';[^\n]*\n\s+ring\(ctx, off, dx, dy\);/, 'the 2D path draws when the GPU does not');
  assert.match(src, /gpu\?\.noise\(fi\);/);
  assert.match(gl, /SwiftShader\|llvmpipe\|softpipe\|Software\|Basic Render/, 'a software renderer keeps the 2D path');
  assert.match(gl, /webglcontextlost/);
  assert.match(gl, /vec3 col = min\(vec3\(1\.0\), r \+ n \* noiseA\);/, "the noise is added and clamped as 'lighter' adds it");
  assert.match(gl, /0\.9 \* max\(0\.0, 1\.0 - abs\(float\(ly\) \+ 0\.5 - wall\.x\) \/ wall\.y\)/, 'the band darkens as the gradient did');
  assert.match(gl, /gl\.NEAREST/, 'texels read one to one');
  assert.match(gl, /UNPACK_ROW_LENGTH/, 'new columns go up alone');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.instrument-workspace \.dop-box > canvas:first-child \{ background: var\(--scope-bg\); \}/, 'the background sits on the lowest canvas, never over the GPU one');
});
