// Play-test 16 Nov 2026 (Tests > Ascites): the scale words stay inside the dial's drawing at every dial size. (The Doppler marker's spacing is a
// source shape: scripts/source-shapes/crop-family.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAL_VB, dialTickRadius } from '../src/ui/dial-geometry.js';

const C = 64, R = 56, MAX = 30;
const labelBox = (v, ft) => {
  const r = dialTickRadius(v, ft, MAX, C, R), t = Math.PI / 2 + (v / MAX) * Math.PI, x = C + r * Math.cos(t), y = C + r * Math.sin(t);
  return { left: x - 0.6 * ft, right: x + 0.6 * ft, top: y - 0.5 * ft, bottom: y + 0.5 * ft, r };
};

test('the 12 and the 20 lie wholly inside the drawing at every dial width, with room to spare', () => {
  for (let w = 57; w <= 200; w += 1) {   // (the smallest box the card makes is 96 * 76 / 128 = 57 px; the dial's box in CSS px; the type is 12.2 px on screen at least, so its size in the drawing is 12.2 * 76 / w)
    const ft = Math.max(8.5, 12.2 * 76 / w);
    for (const v of [12, 20]) {
      const b = labelBox(v, ft);
      assert.ok(b.left >= DIAL_VB[0] + (w >= 64 ? 1.5 : 0), `${v} at ${w}px: left ${b.left.toFixed(1)} past ${DIAL_VB[0]}`);   // (the 57 px floor has no room to spare, but nothing is cut)
      assert.ok(b.top >= 0 && b.bottom <= 128, `${v} at ${w}px: top/bottom`);
      assert.ok(b.r >= R + 5 + 0.5 * ft - 1e-9, `${v} at ${w}px stays off the ring`);
    }
  }
});

test('at the size the card gives it on a Mac the words stand where they always stood', () => {
  const ft = Math.max(8.5, 12.2 * 76 / 118);
  assert.equal(dialTickRadius(12, ft, MAX, C, R), R + 10 + 0.65 * ft);
});
