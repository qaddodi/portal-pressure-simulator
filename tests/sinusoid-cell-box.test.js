import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellBoxes } from '../src/ui/sinusoid-cell-box.js';

// OG-2: the cells' pass is scissored to the boxes the shader can colour. Every pixel the shader's own conditions let the cells colour
// must lie inside the scissor, for any camera (rotation, zoom, offset), pinch and collagen.
const UM = { endo: 0.8, disse: 3.4 };
function rig(k, angle, cx, cy, dpr) {
  const ca = Math.cos(angle), sa = Math.sin(angle), K = k * dpr;
  return { ca, sa, K, uF0: [K * ca, -K * sa, dpr * cx], uF1: [K * sa, K * ca, dpr * cy] };
}
function inBoxes(out, n, px, py, H) {
  const gy = H - py;   // GL window y (up), of the pixel's lower edge .. centre
  for (let i = 0; i < n; i++) {
    const [x, y, w, h] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    if (px >= x && px <= x + w && gy >= y && gy <= y + h) return true;
  }
  return false;
}
test('the cells pass scissor holds every pixel the shader can colour, for any camera', () => {
  const W = 640, H = 420, out = new Int32Array(8);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let sawBoth = 0, sawOne = 0, area = 0, cases = 0;
  for (let t = 0; t < 120; t++) {
    const k = 2 + rnd() * 14, ang = (rnd() - 0.5) * 2 * Math.PI, dpr = 1 + Math.round(rnd() * 2);
    const r = rig(k, ang, rnd() * 400 - 100, rnd() * 300 - 50, dpr);
    const uLum = 5 * (0.4 + rnd() * 1.4), uCol = rnd(), uPinch = rnd();
    const uXs = rnd() * 200 - 100, uXk = uXs + (rnd() - 0.5) * 120;
    const halfW = (x) => uLum * (1 - uPinch * Math.exp(-(((x - uXs) / 11) ** 2))) + 0.15 * Math.sin(x * 0.11 + 1.3);
    const uKy = halfW(uXk);
    const u = { uF0: r.uF0, uF1: r.uF1, uXs, uXk, uKy, uLum, uCol };
    const Wd = W * dpr, Hd = H * dpr;
    const n = cellBoxes(u, Wd, Hd, out);
    cases++;
    if (n === 2) sawBoth++; else if (n === 1) sawOne++;
    for (let i = 0; i < n; i++) area += (out[i * 4 + 2] * out[i * 4 + 3]) / (Wd * Hd);
    // Device px to local um, by the view's own inverse.
    const ca = r.ca, sa = r.sa, K = r.K, cxd = r.uF0[2], cyd = r.uF1[2];
    for (let s = 0; s < 4000; s++) {
      const px = rnd() * Wd, py = rnd() * Hd;
      const dx = px - cxd, dy = py - cyd;
      const x = (ca * dx + sa * dy) / K, y = (-sa * dx + ca * dy) / K, a = Math.abs(y);
      const hw = halfW(x), wi = hw + UM.endo, hi = wi + UM.disse * (1 + 0.25 * uCol) + 0.2 * Math.sin(x * 0.07);
      const hsc = y < 0 && Math.abs(x - uXs) < 42 && a > hw && a < hi + 4;
      const kup = Math.abs(x - uXk) < 9 && y > uKy - 7 && y < uKy + 1;
      if (hsc || kup) assert.ok(inBoxes(out, n, px, py, Hd), `case ${t}: pixel (${px | 0}, ${py | 0}) is coloured by the shader but outside the scissor`);
    }
  }
  assert.ok(sawOne + sawBoth > 20, 'most cameras have a cell on screen');
  assert.ok(area / cases < 0.5, 'and the boxes are a fraction of the screen on average (' + (area / cases).toFixed(3) + ')');
});
test('a camera with both cells off screen gets no scissor box, and overlapping boxes are one', () => {
  const out = new Int32Array(8);
  const r = rig(8, 0, 0, 0, 1);
  const base = { uF0: r.uF0, uF1: r.uF1, uLum: 5, uCol: 0, uKy: 5 };
  assert.equal(cellBoxes({ ...base, uXs: 5000, uXk: 5000 }, 400, 300, out), 0);
  assert.equal(cellBoxes({ ...base, uXs: 20, uXk: 24 }, 400, 300, out), 1, 'overlapping: one box');
  assert.equal(cellBoxes({ ...base, uXs: 5, uXk: 80 }, 1200, 300, out), 2, 'apart: two');
  assert.equal(cellBoxes({ ...base, uXs: NaN, uXk: NaN }, 400, 300, out), 0, 'a NaN camera draws nothing rather than throwing');
});
