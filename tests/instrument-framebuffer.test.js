import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 120 fps addendum §7: the instrument canvases no longer ask the browser to keep their drawing buffer. Each draws a complete
// image every time it changes, and the only reads happen in the same task as the draw.
test('the Endoscopy, Doppler and FibroScan canvases do not preserve their drawing buffer', () => {
  for (const f of ['endo-gl', 'doppler-gl', 'fibroscan-gl']) {
    const s = src(`src/ui/${f}.js`);
    assert.match(s, /preserveDrawingBuffer: false/, f);
    assert.doesNotMatch(s, /preserveDrawingBuffer: true/, f);
  }
});

test('the one read of the Endoscopy canvas follows its draw in the same call', () => {
  const s = src('src/ui/instruments.js');
  assert.match(s, /gl\.render\(res, \{[^\n]*\}\);\n\s+if \(glOut\.width !== res\) glOut\.width = glOut\.height = res;\n\s+glOut\.getContext\('2d'\)\.drawImage\(gl\.canvas, 0, 0\);/);
});

test('the FibroScan map is copied out right after its draw, and the Doppler trace is cleared and drawn whole', () => {
  assert.match(src('src/ui/fibroscan.js'), /elastogramGL\(fields\(\), NB, WAVE_T0, N, c, t\)/);
  const d = src('src/ui/doppler-gl.js');
  assert.match(d, /gl\.clear\(gl\.COLOR_BUFFER_BIT\);/);
  assert.match(d, /gl\.drawArrays\(gl\.TRIANGLE_STRIP, 0, 4\);\n\s+gl\.bindVertexArray\(null\);\n\s+return true;/);
  assert.doesNotMatch(src('src/ui/doppler.js'), /gpu\.canvas\.(toDataURL|toBlob)|drawImage\(gpu\.canvas/);
});
