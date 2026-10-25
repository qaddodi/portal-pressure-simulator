// Round 2 review follow-ups: the streaks' density reads between whole lane counts (BM9), and a narrowing's clamp and
// "60 %" fade in and out instead of popping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const { LANE_K, laneSum } = await import('../src/ui/veins-gl.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// The divisor as it was, from the whole lane count.
const stepped = (R, pxW) => {
  const n = Math.min(Math.max(Math.floor((1.7 * R) / Math.max(2.6, 5 * pxW)), 1), 7);
  let k = 0;
  for (let i = 0; i < n; i++) { const yl = n === 1 ? 0 : (((i + 0.5) / n) * 2 - 1) * 0.8; k += n === 1 ? 1 : Math.max(2, Math.floor(16 * (1 - yl * yl) + 0.5)) / 8; }
  return k;
};

test('BM9: the lane weights are the old sums, and the divisor meets them at every whole lane count', () => {
  assert.deepEqual(LANE_K, [1, 3.25, 4.75, 6.25, 7.75, 9.5, 11]);
  for (const pxW of [0.2, 0.5, 1]) {
    const Lg = Math.max(2.6, 5 * pxW);
    for (let n = 1; n <= 7; n++) { const R = (n * Lg + 1e-9) / 1.7; assert.ok(Math.abs(laneSum(R, pxW) - stepped(R, pxW)) < 1e-6, `${n} lanes`); }
    assert.equal(laneSum(0.1, pxW), 1);
    assert.equal(laneSum(100, pxW), 11);
  }
});

test('BM9: the divisor has no step as a vessel narrows or the zoom changes', () => {
  let prev = laneSum(0.5, 0.5), worst = 0;
  for (let R = 0.5; R <= 20; R += 0.001) { const k = laneSum(R, 0.5); worst = Math.max(worst, Math.abs(k - prev)); assert.ok(k >= prev - 1e-12); prev = k; }
  assert.ok(worst < 0.01, `largest change between neighbouring widths ${worst}`);
  prev = laneSum(6, 0.52); worst = 0;
  for (let pxW = 0.52; pxW <= 2; pxW += 0.0005) { const k = laneSum(6, pxW); worst = Math.max(worst, Math.abs(k - prev)); prev = k; }
  assert.ok(worst < 0.01, `largest change between neighbouring zooms ${worst}`);
});

test('BM9: the shader and the lobule read the same table, with no lane loop left', () => {
  const gl = read('src/ui/veins-gl.js'), lob = read('src/ui/lobule-zoom.js');
  assert.match(gl, /const float LANE_K\[7\] = float\[7\]\(\$\{LANE_K/);
  assert.match(gl, /float sumK = mix\(LANE_K\[lk\], LANE_K\[lk \+ 1\], lc - float\(lk\)\);/);
  assert.doesNotMatch(gl, /sumK \+=/);
  assert.match(lob, /const sumK = \(R\) => laneSum\(R, pxW\);/);
  assert.doesNotMatch(lob, /sk \+= n === 1/);
});

test("a narrowing's clamp and label fade out from their own group, which the label layout never reads", () => {
  const stage = read('src/ui/stage.js'), css = read('styles/app.css');
  assert.match(stage, /clamps: s\('g'\), clampsOut: s\('g'\)/);
  assert.match(stage, /el\.classList\.replace\('clamp', 'clamp-out'\); el\.classList\.replace\('clamp-label', 'clamp-label-out'\);/);
  assert.doesNotMatch(stage, /ov\.clampsOut\.querySelectorAll\('\.clamp/);
  // (The GPU draws the arrows: their fade rides on the draw's alpha, never on a baked SVG opacity.)
  assert.match(stage, /d\.fade \? \{ \.\.\.d, alpha: d\.alpha \* clampEase\(d\.fade\) \}/);
  assert.match(stage, /if \(el\.tagName === 'text' \|\| !glLines\) el\.style\.opacity = op;/);
  assert.match(stage, /!clampFading\(\) && !widthEasing/);
  assert.match(css, /\.clamp, \.clamp-out \{/);
  assert.match(css, /\.clamp-label, \.clamp-label-out \{ font-size/);
});
