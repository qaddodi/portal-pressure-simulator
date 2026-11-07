import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 120 fps addendum §7: the instrument canvases no longer ask the browser to keep their drawing buffer. Each draws a complete
// image every time it changes, and the only reads happen in the same task as the draw.
test('the Endoscopy, Doppler, FibroScan and vitals draw in the chart pool: no drawing buffer, no context of their own', () => {
  // (They have no context, so no drawing buffer, of their own: they draw in the chart drawer's, pure-GPU plan B1 and gpu-two-contexts-plan U1.)
  for (const f of ['endo-gl', 'doppler-gl', 'fibroscan-gl', 'vitals-gl']) assert.doesNotMatch(src(`src/ui/${f}.js`).replace(/\/\/.*$/gm, ''), /getContext\(|createElement\('canvas'\)|preserveDrawingBuffer/, f);
});

test('the one read of the Endoscopy canvas follows its draw in the same call', () => {
  const s = src('src/ui/instruments.js');
  // (taken up as the GPU drawer's texture in the same call as its draw, GPU to GPU: no 2D copy)
  assert.match(s, /glVer\+\+;\n\s+if \(pen\?\.ready\) \{ if \(swap\) \{ pen\.keepImage\('field', 'old'\); swap = false; \} if \(!gl\.shade\('field', glVer, res, rOpt\)\) glId = 0; \} else glId = 0;/);
  assert.doesNotMatch(s, /getContext\('2d'\)|drawImage\(/, 'no 2D canvas in the scope');
});

test('the FibroScan map is drawn in the chart drawer (never copied out), and the Doppler trace is cleared and drawn whole', () => {
  const f = src('src/ui/fibroscan.js');
  assert.match(f, /const drawn = ctx\.onGPU === true && !!mapU\?\.drew\(\);/);
  assert.doesNotMatch(f, /createElastogramGL|cv\.before\(|drawImage|getContext\('2d'|putImageData|getImageData/, 'no canvas of the map\'s own, nothing of the panel on a 2D canvas copy');
  const d = src('src/ui/doppler-gl.js');
  // (drawn into the chart drawer's frame, whole, over the black the monitor laid under it)
  assert.match(d, /gl\.viewport\(dx, oy, RW, RH\);/);
  assert.match(d, /gl\.drawArrays\(gl\.TRIANGLE_STRIP, 0, 4\);\n\s+gl\.bindVertexArray\(null\);\n\s+return true;/);
  assert.match(src('src/ui/doppler.js'), /\} else ctx\.fillRect\(0, 0, w, hh\);/);
  assert.doesNotMatch(src('src/ui/doppler.js'), /gpu\.canvas/);
});
