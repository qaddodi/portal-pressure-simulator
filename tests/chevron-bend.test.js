import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// (veins-gl.js needs a DOM to load: the function is taken from its source.)
const SRC = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const N_SAMPLES = 64;
const bendCurvature = new Function('N_SAMPLES', `${SRC.match(/function bendCurvature[\s\S]*?\n}\n/)[0]}; return bendCurvature;`)(N_SAMPLES);

// A flow arrowhead on a bend keeps its shape: the shader rescales the arc length off the axis by (1 − κ y), with κ
// signed the same way as the across coordinate (cross(along, offset) > 0 is +y).
test('bendCurvature: a circle of radius 50 turning toward +cross reads +1/50', () => {
  const pts = Array.from({ length: N_SAMPLES }, (_, i) => { const a = (i / (N_SAMPLES - 1)) * Math.PI; return [50 * Math.cos(a), 50 * Math.sin(a)]; });
  const k = bendCurvature(pts);
  for (const i of [0, 10, 32, 63]) assert.ok(Math.abs(k[i] - 1 / 50) < 1e-3, `${i}: ${k[i]}`);
  // Along then offset to the centre: cross(along, centre − p) > 0 at the start, so the inside is +y.
  const [a, b] = pts, t = [b[0] - a[0], b[1] - a[1]], c = [-a[0], -a[1]];
  assert.ok(t[0] * c[1] - t[1] * c[0] > 0);
  const r = bendCurvature(pts.slice().reverse());
  assert.ok(Math.abs(r[32] + 1 / 50) < 1e-3);
});

test('bendCurvature: a straight line reads 0', () => {
  const k = bendCurvature(Array.from({ length: N_SAMPLES }, (_, i) => [i * 3, i * 2]));
  assert.ok(k.every((v) => Math.abs(v) < 1e-9));
});

test('the arrowhead uses the curvature and the stage uploads it with the geometry', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /u \*= clamp\(1\.0 - bendAt\(id, sc, len\) \* yd/);
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(st, /veins\.setBend\(it\.row, smooth\.get\(it\.row\) \|\| it\.pts\)/);
});
