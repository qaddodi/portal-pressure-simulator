import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintGLSL } from './glsl-lint.js';
import { shadeGLSL, F_RING } from '../src/ui/veins-mesh-glsl.js';
import { celGLSL, celShadeJS, celRingJS } from '../src/ui/tube-cel-glsl.js';

// Vessels cut across in the lobule (picture-blood-fills-look.md item 9): the portal venule, central vein, arteriole and bile ductule are discs; they keep the
// flat lumen and the wall ring, and gain the long vessels' pale band just inside the wall (F_RING), all round, in Classic, Mesh and Tube alike.

const FLAGS = { F_DIFFUSE: 2, F_EDGE: 64, F_VEIL: 128, F_SHADOW: 4, F_SPEC: 32, F_WHOLE: 256, LIFT_EASE_MAX: 60, LIFT_EASE_SHARE: 0.35, LUMEN2: 32768, ROW2_BITS: 11, VEIL_K: 0.6 };
const near = (a, b, m) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${m}: ${a} vs ${b}`));

test('F_RING is its own bit, clear of the other vessel flags', () => {
  assert.equal(F_RING, 512);
  for (const [k, v] of Object.entries(FLAGS)) if (k.startsWith('F_')) assert.equal(v & F_RING, 0, k);
  assert.equal(F_RING & 0xff, 0, 'above the bits the shaders test with narrow masks');
});

test('the lobule sets F_RING on the four end-on kinds, and only on them', () => {
  const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(src, /const endOn = t\.kind === 'cv' \|\| t\.kind === 'pv' \|\| t\.kind === 'ha' \|\| t\.kind === 'bd';/);
  assert.match(src, /\(endOn \? F_RING : 0\)/);
  assert.match(src, /import \{ F_RING \} from '\.\/veins-mesh-glsl\.js';/);
});

test('tubeShade (Classic and Mesh) has the ring block, and the cel shade (Tube) calls celRing', () => {
  const shade = shadeGLSL(FLAGS), cel = celGLSL(FLAGS);
  assert.ok(shade.includes(`(flags & ${F_RING}) != 0 && aL > 0.0`), 'tubeShade');
  assert.ok(cel.includes(`(flags & ${F_RING}) != 0 && aL > 0.0) lum = celRing(lum, D, R, aa);`), 'celShade');
  assert.ok(/vec3 celRing\(vec3 lum, float D, float R, float aa\)/.test(cel), 'celRing is defined with the tones');
  assert.deepEqual(lintGLSL(`#version 300 es\nprecision highp float;\n${cel.replace(/vec4 celShade[\s\S]*$/, '')}\nout vec4 o; void main(){ o = vec4(celRing(vec3(0.5), -1.0, 10.0, 1.0), 1.0); }`), []);
});

test('the Tube lumen layer applies celRing last, over the blood', () => {
  const src = readFileSync(new URL('../src/ui/tube-lumen-glsl.js', import.meta.url), 'utf8');
  assert.ok(src.indexOf('col = celRing(') > src.indexOf('col = celTones('), 'after the tones');
  assert.ok(src.indexOf('col = celRing(') < src.indexOf('outColor = ditherOut('), 'before the output');
});

// One pixel (Tube): a disc of radius 20 device px (px 0.5 unit), aa 0.5.
const base = { F_DIFFUSE: 2, F_EDGE: 64, F_VEIL: 128, R: 10, col: [0.3, 0.45, 0.75], g: [1, 0], sel: false, cA: 1, aa: 0.5, aL: 1, px: 0.5, fx: 1 };
test('Tube: a ring flag lifts a pale band just inside the wall and leaves the middle plain; no flag, no band', () => {
  const rim = celShadeJS({ ...base, flags: F_RING, D: -0.4 }), mid = celShadeJS({ ...base, flags: F_RING, D: -8 }), none = celShadeJS({ ...base, flags: 0, D: -0.4 });
  near(mid, [...base.col, 1], 'the middle');
  near(none, [...base.col, 1], 'no flag');
  assert.ok(rim[0] > base.col[0] && rim[1] > base.col[1] && rim[2] > base.col[2], 'paler at the wall');
  near(celShadeJS({ ...base, flags: F_RING, fx: 0, D: -0.4 }), [...base.col, 1], 'no fx');
});

test('Tube: the band is all round (no lit side), 1.2 to 2.4 device px wide, and left out on hairlines', () => {
  for (const g of [[1, 0], [0, 1], [-0.7071, -0.7071], [0.7071, 0.7071]]) near(celShadeJS({ ...base, g, flags: F_RING, D: -0.4 }), celShadeJS({ ...base, g: [1, 0], flags: F_RING, D: -0.4 }), 'same at every angle');
  const R = 100, aa = 0.5, w = Math.min(Math.max(0.1 * R, 1.2 * aa), 2.4 * aa);   // (the width, in the shader's own unit: 0.1 R held between 1.2 and 2.4 aa)
  near(celRingJS(base.col, -w - aa - 1e-6, R, aa), base.col, 'clear of the band');
  assert.ok(celRingJS(base.col, -w * 0.5, R, aa)[0] > base.col[0], 'inside the band');
  near(celRingJS(base.col, -0.3, 0.5, 0.5), base.col, 'a hairline (R / aa < 1.5): none');
});

test('Tube: the band is weaker on a pale fill, and its strength is the long vessels\' (0.144 of the way to white)', () => {
  const dark = celRingJS([0.2, 0.2, 0.2], -0.2, 20, 0.5), pale = celRingJS([0.95, 0.95, 0.95], -0.2, 20, 0.5);
  assert.ok(dark[0] - 0.2 > pale[0] - 0.95 && pale[0] > 0.95, 'lifted, and by less on the pale fill (in absolute terms, the room left to white too)');
  near(celRingJS([0.2, 0.2, 0.2], -0.2, 20, 0.5), [0.2 + 0.8 * 0.144, 0.2 + 0.8 * 0.144, 0.2 + 0.8 * 0.144], 'a mid-dark fill at full band');
});
