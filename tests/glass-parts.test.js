import { stageSource } from './stage-src.js';
// The glass's blur made only where a glass reads it (glass-gl.js blurBoxes, 1 Nov 2026): every texel a glass samples lies in a part,
// parts never leave the copy, overlapping parts are one, and parts that cover most of the copy give the whole copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blurBoxes, BLUR_KEEP } from '../src/ui/glass-gl.js';

const SRC = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
const STAGE = stageSource();

const inside = (parts, x, y) => parts.some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3]);

test('every texel within BLUR_KEEP - 1 of a glass is in a part', () => {
  const boxes = [{ x: 30, y: 400, w: 120, h: 60 }, { x: 900, y: 40, w: 200, h: 90 }];
  const t = 4, bw = 300, bh = 200, parts = blurBoxes(boxes, 0, 0, t, bw, bh);
  assert.ok(parts.length >= 1);
  for (const b of boxes) {
    const x0 = Math.floor(b.x / t), y0 = Math.floor(b.y / t), x1 = Math.ceil((b.x + b.w) / t), y1 = Math.ceil((b.y + b.h) / t);
    for (let y = Math.max(0, y0 - BLUR_KEEP + 1); y < Math.min(bh, y1 + BLUR_KEEP - 1); y++) {
      for (let x = Math.max(0, x0 - BLUR_KEEP + 1); x < Math.min(bw, x1 + BLUR_KEEP - 1); x++) assert.ok(inside(parts, x, y), `${x},${y}`);
    }
  }
  for (const r of parts) assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= bw && r[3] <= bh && r.every(Number.isInteger));
});

test('parts far apart stay apart and are much less than the copy', () => {
  const parts = blurBoxes([{ x: 0, y: 0, w: 40, h: 40 }, { x: 1100, y: 700, w: 40, h: 40 }], 0, 0, 4, 300, 200);
  assert.equal(parts.length, 2);
  const area = parts.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0);
  assert.ok(area < 0.1 * 300 * 200);
});

test('overlapping parts merge, and near-whole cover gives the whole copy', () => {
  assert.equal(blurBoxes([{ x: 100, y: 100, w: 40, h: 40 }, { x: 150, y: 110, w: 40, h: 40 }], 0, 0, 4, 300, 200).length, 1);
  assert.deepEqual(blurBoxes([{ x: 10, y: 10, w: 1150, h: 760 }], 0, 0, 4, 300, 200), [[0, 0, 300, 200]]);
});

test('an offset copy: parts are counted from its corner', () => {
  const [r] = blurBoxes([{ x: 200, y: 120, w: 8, h: 8 }], 160, 80, 4, 100, 100);
  assert.deepEqual(r, [0, 0, 12 + BLUR_KEEP, 12 + BLUR_KEEP]);
});
