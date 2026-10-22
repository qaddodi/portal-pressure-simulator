import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Doppler monitor on a phone (three device pixels per point) dipped the frame rate hard (Mohammad, 22 Oct, 1:03 AM ET): its
// new spectral lines were written straight into the ring canvas (putImageData on a canvas the browser keeps on the GPU, a wait
// and a copy of the whole ring every frame), and the whole canvas was cleared every frame although the trace's rectangle is
// drawn whole and opaque. The same pixels.
test('the Doppler monitor writes new lines through a small canvas and clears only round the trace', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /const put = \(sx, w\) => \{ cctx\.putImageData\(img, -sx, 0, sx, 0, w, RH\); octx\.drawImage\(colCv, 0, 0, w, RH, sx, 0, w, RH\); \};/);
  assert.match(src, /if \(x0 \+ n <= RW\) put\(x0, n\);\n\s+else \{ put\(x0, RW - x0\); put\(0, x0 \+ n - RW\); \}/);
  assert.doesNotMatch(src, /octx\.putImageData\(img, 0, 0, x0, 0, n, RH\)/);
  assert.match(src, /if \(full\) octx\.putImageData\(img, 0, 0\);/, 'a whole redraw still writes the ring whole');
  assert.match(src, /ctx\.fillRect\(0, 0, cv\.width, by\); ctx\.fillRect\(0, by \+ bh, cv\.width, cv\.height - by - bh\);/);
  assert.match(src, /traceBox = \[dx, dy, RW, RH\];/);
  assert.match(src, /\} else ctx\.fillRect\(0, 0, cv\.width, cv\.height\);\n\s+traceBox = null;/, 'without a trace drawn last frame the whole canvas is cleared');
});
