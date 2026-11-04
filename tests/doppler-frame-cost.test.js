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
  assert.match(src, /TB\[0\] = dx; TB\[1\] = dy; TB\[2\] = RW; TB\[3\] = RH; traceBox = TB;/);
  assert.doesNotMatch(src, /getContext\('2d'\)|putImageData|drawImage|OffscreenCanvas/, 'no canvas 2D: the trace is the GPU\'s alone');
});
