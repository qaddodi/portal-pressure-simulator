// Where the pressure falls along a stenosed vessel (combined plan V1): pressure-along.js alongCurve, its upload with the radii and
// the colour mix in both shaders (veins-gl.js alongAt). No GL in node: the curve here, the shader as source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alongCurve, ALONG_K_MIN } from '../src/ui/pressure-along.js';

const N = 64;
const waist = (v, u0 = 0.5, sig = 0.06) => Array.from({ length: N }, (_, i) => 1 - v * Math.exp(-(((i / (N - 1) - u0) / sig) ** 2)));

test('a vessel with nothing narrowed has no curve: its colour mixes by arc, as before', () => {
  assert.equal(alongCurve(new Array(N).fill(1)), null);
  assert.equal(alongCurve(waist(0)), null);
});

test('a waist takes nearly all of the colour change, rising from 0 to 1 and never back', () => {
  const a = alongCurve(waist(0.6));
  assert.equal(a[0], 0); assert.equal(a[N - 1], 1);
  for (let i = 1; i < N; i++) assert.ok(a[i] >= a[i - 1]);
  // Across the waist (±2 sigma, a quarter of the course) most of the change, more the tighter it is: (1 / 0.4)⁴ ≈ 39 times the
  // weight at the middle of a 60 % narrowing, (1 / 0.2)⁴ = 625 at 80 %.
  const i0 = Math.round((0.5 - 0.12) * (N - 1)), i1 = Math.round((0.5 + 0.12) * (N - 1));
  assert.ok(a[i1] - a[i0] > 0.7, `${a[i1] - a[i0]}`);
  const t = alongCurve(waist(0.8));
  assert.ok(t[i1] - t[i0] > 0.95, `${t[i1] - t[i0]}`);
  // An off-centre stenosis falls where it is.
  const b = alongCurve(waist(0.6, 0.2));
  assert.ok(b[Math.round(0.3 * (N - 1))] > 0.7);
});

test('as a stenosis comes on the curve leaves the straight line smoothly: no jump in colour', () => {
  const a = alongCurve(waist(1e-4));
  for (let i = 0; i < N; i++) assert.ok(Math.abs(a[i] - i / (N - 1)) < 1e-3);
  // And the curve moves little for a small change of the narrowing.
  const p = alongCurve(waist(0.5)), q = alongCurve(waist(0.505));
  for (let i = 0; i < N; i++) assert.ok(Math.abs(p[i] - q[i]) < 0.02);
});

test('a near-closed vessel never puts the whole drop on one sample', () => {
  const k = new Array(N).fill(1); k[30] = 0;
  const a = alongCurve(k);
  assert.ok(a[30] - a[29] < 0.999 && a[31] - a[30] < 0.999);
  assert.equal(ALONG_K_MIN, 0.1);
});

   // (the per-vessel colour: veins-mesh-glsl.js vesAttrs)

