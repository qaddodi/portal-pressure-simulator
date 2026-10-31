// Where the pressure falls along a stenosed vessel (combined plan V1): pressure-along.js alongCurve, its upload with the radii and
// the colour mix in both shaders (veins-gl.js alongAt). No GL in node: the curve here, the shader as source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the curve rides with the radii (−1 for a vessel without one) and both shaders mix the colour by it', () => {
  assert.match(gl, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA32F, N_SAMPLES, nTubes, 0, gl\.RGBA, gl\.FLOAT, null\);/);
  assert.match(gl, /radRow\[i \* 4 \+ 2\] = A \? A\[i\] : -1; radRow\[i \* 4 \+ 3\] = A \? A\[j\] : -1;/);
  assert.match(gl, /return a\.x < 0\.0 \? u : mix\(a\.x, a\.y, ui - float\(i0\)\);/);
  assert.match(gl, /scol\[s\] = mix\(t0\.rgb, t1\.rgb, alongAt\(sid\[s\], clamp\(su\[s\], 0\.0, 1\.0\)\)\);/);
  assert.match(gl, /vc1 = mix\(texelFetch\(tube, ivec2\(0, id1\), 0\)\.rgb, texelFetch\(tube, ivec2\(1, id1\), 0\)\.rgb, alongAt\(id1, clamp\(s1 \/ len1, 0\.0, 1\.0\)\)\);/);
  // The largest radius is the radii's alone (the curve shares the texels).
  assert.match(gl, /if \(r\[i\] > mx\) mx = r\[i\];/);
  // Only a stenosed vessel's own course has one, from the stenosis's caliber factor.
  assert.match(stage, /x\.stenF = f;/);
  assert.match(stage, /if \(it\.kind !== 'v'\) return null;\n\s*const fa = it\.x\.stenF, fb = it\.ra\?\.stenF, f = it\.f;\n\s*if \(!fa && !fb\) return null;/);
});
