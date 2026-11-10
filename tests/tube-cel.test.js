import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';
import { shadeGLSL } from '../src/ui/veins-mesh-glsl.js';
import { CEL, celGLSL, celShadeJS } from '../src/ui/tube-cel-glsl.js';

// The Tube renderer's cel shading (thread B, docs/recommendations/tube-renderer-plan.md): judged from what the module exports.

const F = { F_DIFFUSE: 1, F_EDGE: 2, F_VEIL: 4 };
const CEL_TEXT = celGLSL(F);
const SHADE_TEXT = shadeGLSL({ F_DIFFUSE: 1, F_EDGE: 2, F_SHADOW: 8, F_SPEC: 16, F_VEIL: 4, F_WHOLE: 32, LIFT_EASE_MAX: 60, LIFT_EASE_SHARE: 0.35, LUMEN2: 32768, ROW2_BITS: 9, VEIL_K: 0.5 });

// A small host with what celShade needs: the tube texture and T(), over(), and the uniforms the shading reads.
const HOST = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D tube;
uniform float px;
uniform int fx;
uniform vec4 casing;
uniform vec4 ring;
uniform vec4 rimInk;
uniform vec4 paperInk;
uniform vec2 light;
out vec4 outColor;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
${CEL_TEXT}
void main() {
  vec4 c = celShade(-3.0, 0.0, 6.0, 1.0, vec3(0.8, 0.2, 0.2), vec2(1.0, 0.0), 1, false, 1.0, 1, 0, 0.5, 0.0, vec3(0.0), 0.0, 0.0, 1.0, 1.0);
  outColor = c;
}`;

const sig = (text, name) => {
  const m = new RegExp(`vec4 ${name}\\(([^)]*)\\)`).exec(text);
  assert.ok(m, `${name}( is defined`);
  return m[1].replace(/\s+/g, ' ').trim();
};

test('the host shader with celShade has no lint problems', () => {
  assert.deepEqual(lintGLSL(HOST), []);
});

test('celShade has the parameters of tubeShade, and none of the 3D shading', () => {
  assert.equal(sig(CEL_TEXT, 'celShade'), sig(SHADE_TEXT, 'tubeShade'));
  for (const word of ['shadowOf(', 'sheenInk', 'shadeInk']) assert.ok(!CEL_TEXT.includes(word), `no ${word}`);
  assert.equal((CEL_TEXT.match(/uniform float celK;/g) || []).length, 1, 'celK is declared once');
  assert.ok(!/#version|void main/.test(CEL_TEXT), 'no #version and no main');
});

// One pixel: the lit side faces the light; a lumen of radius R 10 units, the casing 1 unit, a device pixel 0.5 unit, aa 0.5.
const light = [1, 0];
const FILL = [0.8, 0.3, 0.3];
const base = { ...F, R: 10, wall: 1, col: FILL, g: [1, 0], flags: F.F_DIFFUSE, sel: false, cA: 1, aa: 0.5, aL: 1, px: 0.5, light, fx: 1 };
const near = (got, want, msg) => { assert.equal(got.length, want.length, msg); got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${msg}: ${got} vs ${want}`)); };
const INK = CEL.INK;

test('deep inside a lumen on the lit side, the result is the fill colour exactly', () => {
  near(celShadeJS({ ...base, D: -9 }), [...FILL, 1], 'lit side');
});

test('on the far side past BAND, the fill is darkened by TONE; before BAND it is not', () => {
  const far = { ...base, g: [-1, 0] };
  // rho = (R + D) / R: 0.8 at D = -2, past BAND (0.62); 0.3 at D = -7, before it.
  near(celShadeJS({ ...far, D: -2 }), [...FILL.map((v) => v * CEL.TONE), 1], 'past the band');
  near(celShadeJS({ ...far, D: -7 }), [...FILL, 1], 'before the band');
  near(celShadeJS({ ...far, D: -2, flags: 0 }), [...FILL, 1], 'no diffuse flag: flat');
});

test('between the lumen edge and wall * K it is the ink at alpha 1; a pixel (aa) past that it is empty', () => {
  const wl = base.wall * CEL.K;
  const out = { ...base, aL: 0 };
  near(celShadeJS({ ...out, D: wl / 2 }), [...INK, 1], 'inside the outline');
  near(celShadeJS({ ...out, D: wl + base.aa }), [0, 0, 0, 0], 'past the outline');
  // A thin casing never goes under 1.25 device pixels.
  near(celShadeJS({ ...out, wall: 0.1, D: 0.3 }), [...INK, 1], 'the floor: 1.25 px = 0.625');
  near(celShadeJS({ ...out, wall: 0.1, D: 0.625 + base.aa }), [0, 0, 0, 0], 'and no wider');
});

test('a veiled vessel keeps half its outline; an F_EDGE vessel keeps its own colour', () => {
  const out = { ...base, aL: 0, D: 0.5 };
  near(celShadeJS({ ...out, flags: F.F_VEIL }), [...INK.map((v) => v * 0.5), 0.5], 'veiled: half');
  const edge = [0.1, 0.5, 0.9];
  near(celShadeJS({ ...out, flags: F.F_EDGE, edge }), [...edge.map((v) => v * 0.92), 0.92], 'its own edge colour');
});

test('the outline follows the look: a dark casing gives the near-black ink, a light casing its own colour, always opaque', () => {
  const out = { ...base, aL: 0, D: 0.5 };
  near(celShadeJS({ ...out, casing: [0.1, 0.1, 0.12, 0.6] }), [...INK, 1], 'dark casing');
  const pale = [0.85, 0.8, 0.9];
  near(celShadeJS({ ...out, casing: [...pale, 0.3] }), [...pale, 1], 'light casing, its alpha not used');
  assert.match(CEL_TEXT, /vec3 ink = mix\(CEL_INK, casing\.rgb, smoothstep\(0\.25, 0\.45, cY\)\);/);
});

test('a hairline has no band', () => {
  // R / aa = 1.2 < 1.5: far side, deep in the lumen's band, still the plain fill.
  const hair = { ...base, R: 0.6, g: [-1, 0], D: -0.1 };
  near(celShadeJS(hair), [...FILL, 1], 'hairline');
});

test('a selected vessel has the ring outside the outline', () => {
  const ring = [0.2, 0.6, 1, 0.8];
  const wl = base.wall * CEL.K;
  const sel = { ...base, aL: 0, sel: true, ring };
  near(celShadeJS({ ...sel, D: wl + 2 }), [ring[0] * 0.8, ring[1] * 0.8, ring[2] * 0.8, 0.8], 'ring beyond the outline');
  near(celShadeJS({ ...sel, D: wl / 2 }), [...INK, 1], 'the outline over the ring');
  near(celShadeJS({ ...sel, D: wl + 4 + 2 * base.aa }), [0, 0, 0, 0], 'nothing past the ring');
});

test('the constants in the GLSL text are the ones in CEL', () => {
  const ink = /const vec3 CEL_INK = vec3\(([^)]*)\);/.exec(CEL_TEXT);
  assert.ok(ink, 'CEL_INK');
  assert.deepEqual(ink[1].split(',').map(Number), CEL.INK);
  assert.equal(Number(/const float CEL_BAND = ([\d.]+);/.exec(CEL_TEXT)[1]), CEL.BAND);
  assert.equal(Number(/const float CEL_TONE = ([\d.]+);/.exec(CEL_TEXT)[1]), CEL.TONE);
  assert.deepEqual(CEL, { K: 1.6, INK: [0.07, 0.06, 0.06], BAND: 0.62, TONE: 0.8 });
});
