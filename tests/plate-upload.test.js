import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateStrips, premultiply, PLATE_STRIP } from '../src/ui/plate-upload.js';
import { readFileSync } from 'node:fs';

// The plate rasters reach the GPU as pixel strips (plate-upload.js): every row exactly once, each strip about 2 MB.
test('the strips cover every row once, in order, each within the strip size', () => {
  for (const [W, H] of [[1224, 1584], [2048, 2050], [1, 1], [5000, 3], [PLATE_STRIP + 7, 4]]) {
    const s = plateStrips(W, H);
    let y = 0;
    for (const [y0, rows] of s) { assert.equal(y0, y); assert.ok(rows >= 1); assert.ok(rows === 1 || W * rows <= PLATE_STRIP); y += rows; }
    assert.equal(y, H, `${W}x${H}`);
  }
  assert.equal(plateStrips(1224, 1584).length, 4, 'the whole plate in four frames');
});

test('premultiplying matches the canvas copy: opaque pixels untouched, colour scaled by alpha, clear pixels zero', () => {
  const d = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 128, 255, 255, 255, 0, 10, 20, 30, 1]);
  premultiply(d);
  assert.deepEqual([...d], [200, 100, 50, 255, 100, 50, 25, 128, 0, 0, 0, 0, 0, 0, 0, 1]);
  // Within half a step of the exact product everywhere.
  const all = new Uint8ClampedArray(256 * 256 * 4);
  for (let a = 0; a < 256; a++) for (let c = 0; c < 256; c++) all.set([c, c, c, a], (a * 256 + c) * 4);
  premultiply(all);
  for (let a = 0; a < 256; a++) for (let c = 0; c < 256; c++) assert.ok(Math.abs(all[(a * 256 + c) * 4] - (c * a) / 255) <= 0.5);
});

test('the gut picture steps: at or above the view, under √2 times it, the same step for every zoom between two steps', async () => {
  const { gutStep } = await import('../src/ui/plate-upload.js');
  const cap = 2.8;
  for (let need = 0.2; need <= cap; need += 0.013) {
    const k = gutStep(need, cap);
    assert.ok(k >= need - 1e-9, `never stretched at ${need}`);
    assert.ok(k < need * Math.SQRT2 + 1e-9, `never over √2 times the view at ${need}`);
    assert.ok(k * 1.15 >= need && k <= need * 2, 'always one gutPicOk accepts');
  }
  assert.equal(gutStep(3.1, cap), cap, 'past the cap, the cap');
  assert.equal(gutStep(1.5, cap), gutStep(1.9, cap), 'a pinch between two steps keeps the picture');
});

test('a view after a pan: the pixels it takes over and the rects it draws cover each strip exactly once', async () => {
  const { viewReuse, plateStrips } = await import('../src/ui/plate-upload.js');
  let seed = 3;
  const rnd = (n) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
  for (let n = 0; n < 300; n++) {
    const W = 20 + rnd(60), H = 20 + rnd(60), pw = 20 + rnd(60), ph = 20 + rnd(60), ox = rnd(120) - 60, oy = rnd(120) - 60;
    const seen = new Uint8Array(W * H);
    for (const [y, rows] of plateStrips(W, H, 200)) {
      const { copy, draw } = viewReuse(W, H, pw, ph, ox, oy, y, rows);
      const mark = ([x0, y0, w, h], from) => {
        assert.ok(w > 0 && h > 0 && x0 >= 0 && x0 + w <= W && y0 >= y && y0 + h <= y + rows, 'inside the strip');
        for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) {
          seen[yy * W + xx]++;
          if (from) assert.ok(xx + ox >= 0 && xx + ox < pw && yy + oy >= 0 && yy + oy < ph, 'taken only from inside the last picture');
        }
      };
      if (copy) mark(copy, true);
      for (const r of draw) mark(r, false);
    }
    assert.ok(seen.every((v) => v === 1), 'every pixel exactly once');
  }
});

test('a block of pixels is copied row by row to its place, and nothing else is touched', async () => {
  const { copyPixels } = await import('../src/ui/plate-upload.js');
  const sW = 5, sH = 4, src = new Uint8ClampedArray(sW * sH * 4).map((_, i) => i % 251);
  const dW = 6, dH = 5, dst = new Uint8ClampedArray(dW * dH * 4).fill(7);
  copyPixels(dst, dW, 2, 1, src, sW, 1, 2, 3, 2);
  for (let y = 0; y < dH; y++) for (let x = 0; x < dW; x++) for (let c = 0; c < 4; c++) {
    const inside = x >= 2 && x < 5 && y >= 1 && y < 3;
    const want = inside ? src[((y - 1 + 2) * sW + (x - 2 + 1)) * 4 + c] : 7;
    assert.equal(dst[(y * dW + x) * 4 + c], want, `${x},${y}`);
  }
});

// Safari paints an organ strip only when it is read back: a whole strip's read took 20 to 36 ms on his Mac (30 Oct). The strips
// are halved, down to a quarter, while a read of one would take over READ_MS, from the reads seen so far.
test('organ strips shrink while their reads are slow, never below a quarter, and grow back when they are fast', async () => {
  const { noteStripRead, stripPx, resetStripReads, READ_MS, STRIP_MIN } = await import('../src/ui/plate-upload.js');
  resetStripReads();
  assert.equal(stripPx(), PLATE_STRIP, 'no read seen: the whole strip');
  noteStripRead(4, PLATE_STRIP);
  assert.equal(stripPx(), PLATE_STRIP, 'a fast read keeps it');
  resetStripReads();
  noteStripRead(12, PLATE_STRIP);
  assert.equal(stripPx(), PLATE_STRIP / 2, '12 ms for a whole strip: half, about 6 ms a read');
  assert.ok(stripPx() * 12 / PLATE_STRIP <= READ_MS);
  resetStripReads();
  noteStripRead(17, PLATE_STRIP / 2);
  assert.equal(stripPx(), STRIP_MIN, '17 ms for a half strip (his Mac, ee881888): a quarter, about 8.5 ms a read');
  noteStripRead(200, PLATE_STRIP / 2);
  assert.equal(stripPx(), STRIP_MIN, 'never below a quarter');
  for (let i = 0; i < 30; i++) noteStripRead(1, PLATE_STRIP / 2);
  assert.equal(stripPx(), PLATE_STRIP, 'fast again: back to whole strips');
  noteStripRead(500, 100);
  assert.equal(stripPx(), PLATE_STRIP, 'a sliver\'s read is not counted');
  resetStripReads();
  // The strips still cover every row once, whatever their size.
  for (const px of [STRIP_MIN, PLATE_STRIP / 2]) {
    const s = plateStrips(2212, 2306, px);
    let y = 0;
    for (const [y0, rows] of s) { assert.equal(y0, y); assert.ok(2212 * rows <= px); y += rows; }
    assert.equal(y, 2306);
  }
});

test('the organ pictures are read in strips sized by stripPx, each read timed for it', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /for \(const \[y, rows\] of plateStrips\(W, H, stripPx\(\)\)\) \{\s*if \(await refineTurn\(gone\) === null\) return false;\s*if \(banded\) \{/);
  assert.match(stage, /finally \{ noteStripRead\(performance\.now\(\) - t0, p\.w \* p\.h\); p\.pc\.width = p\.pc\.height = 0;/);
});
