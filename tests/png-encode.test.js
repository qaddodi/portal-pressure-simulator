// The gut's picture is encoded in a worker where the browser can (Safari's toBlob held a frame 91 ms on his Mac, 30 Oct), and on
// the page as before whenever the worker cannot: no OffscreenCanvas, a failed worker, an empty reply or none in time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = () => ({ toBlobs: 0, toBlob(cb) { this.toBlobs++; queueMicrotask(() => cb('page png')); } });
const saved = {};
function stub(reply) {
  for (const k of ['Worker', 'OffscreenCanvas', 'createImageBitmap']) saved[k] = globalThis[k];
  const sent = [];
  globalThis.OffscreenCanvas = class {};
  globalThis.createImageBitmap = async (cv) => ({ of: cv, width: 4, height: 3 });
  globalThis.Worker = class {
    postMessage(m, tr) { sent.push([m, tr]); if (reply === 'error') queueMicrotask(() => this.onerror?.()); else if (reply !== 'never') queueMicrotask(() => this.onmessage({ data: { id: m.id, blob: reply } })); }
    terminate() {}
  };
  return sent;
}
function unstub() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } }

test('a worker that encodes: its PNG, the bitmap transferred, the page\'s toBlob not used', async () => {
  const { encodePNG, resetEncoder } = await import('../src/ui/png-encode.js');
  resetEncoder();
  const sent = stub('worker png');
  try {
    const cv = canvas();
    assert.equal(await encodePNG(cv), 'worker png');
    assert.equal(cv.toBlobs, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0].bmp.of, cv, 'the canvas\'s own pixels');
    assert.deepEqual(sent[0][1], [sent[0][0].bmp], 'transferred, not copied');
  } finally { unstub(); resetEncoder(); }
});

test('an empty reply or a failed worker: encoded on the page, and a failed worker is not tried again', async () => {
  const { encodePNG, resetEncoder } = await import('../src/ui/png-encode.js');
  resetEncoder();
  stub(null);
  try { const cv = canvas(); assert.equal(await encodePNG(cv), 'page png'); assert.equal(cv.toBlobs, 1); } finally { unstub(); resetEncoder(); }
  const sent = stub('error');
  try {
    const cv = canvas();
    assert.equal(await encodePNG(cv), 'page png');
    assert.equal(await encodePNG(cv), 'page png');
    assert.equal(sent.length, 1, 'after the failure, straight to the page');
  } finally { unstub(); resetEncoder(); }
});

test('no OffscreenCanvas or no Worker: the page\'s toBlob, as before', async () => {
  const { encodePNG, resetEncoder } = await import('../src/ui/png-encode.js');
  resetEncoder();
  stub('worker png');
  delete globalThis.OffscreenCanvas;
  try { const cv = canvas(); assert.equal(await encodePNG(cv), 'page png'); assert.equal(cv.toBlobs, 1); } finally { unstub(); resetEncoder(); }
});

test('the worker lays the bitmap at its own size on a canvas of that size, and the gut picture uses the encoder', () => {
  const src = readFileSync(new URL('../src/ui/png-encode.js', import.meta.url), 'utf8');
  assert.match(src, /new OffscreenCanvas\(bmp\.width, bmp\.height\)/);
  assert.match(src, /g\.drawImage\(bmp, 0, 0\);/);
  assert.match(src, /convertToBlob\(\{ type: 'image\/png' \}\)/);
  assert.match(src, /setTimeout\(\(\) => \{ if \(waiting\.delete\(id\)\) res\(null\); \}, WAIT_MS\)/);
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /blob = await gpuProbe\.time\(null, 'gut picture: encode', \(\) => encodePNG\(cv\)\);\s*cv\.width = cv\.height = 0;/);
});
