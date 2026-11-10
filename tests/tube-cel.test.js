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

// One pixel: the lit side faces the light (the top left, CEL.DIR); a lumen of radius R 10 units, a device pixel 0.5 unit (so R is 20 device px), aa 0.5.
const LIT_G = CEL.DIR, FAR_G = CEL.DIR.map((v) => -v), ALONG_G = [-CEL.DIR[1], CEL.DIR[0]];   // (across the vessel toward the light, away from it, and along the light's own cross: no lit side)
const FILL = [0.8, 0.3, 0.3];
const base = { ...F, R: 10, wall: 1, col: FILL, g: LIT_G, flags: F.F_DIFFUSE, sel: false, cA: 1, aa: 0.5, aL: 1, px: 0.5, fx: 1 };
const near = (got, want, msg) => { assert.equal(got.length, want.length, msg); got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${msg}: ${got} vs ${want}`)); };
// The outline's width in world units: 14 % of the radius, held between 1.5 and 3 device px.
const wlOf = (R, px) => Math.min(Math.max(CEL.LINE_R * R, CEL.LINE_MIN * px), CEL.LINE_MAX * px);
// The light looks' outline: a deep tone of the vessel's own colour, eased a quarter toward the near-black.
const deepOf = (col) => col.map((v, i) => v * 0.34 * 0.75 + CEL.INK[i] * 0.25);
const DEEP = deepOf(FILL);

test('deep inside a lumen on the lit side, the result is the fill colour exactly', () => {
  near(celShadeJS({ ...base, D: -9 }), [...FILL, 1], 'lit side');
});

// The tones: s = rho * dot(g, CEL.DIR); rho = (R + D) / R. LIT_G faces the light (s = rho), FAR_G is the far side (s = -rho).
const tone = (o) => celShadeJS({ ...base, ...o });
const darker = (m) => [...FILL.map((v) => v * m), 1];
const rhoD = (rho) => -base.R * (1 - rho);
test('three tones: lit lift, the plain fill, and two darker steps toward the far wall', () => {
  const far = { g: FAR_G };
  // S1 -0.12, S2 -0.36: rho 0.05 is the plain fill, 0.25 the first step, 0.6 both.
  near(tone({ ...far, D: rhoD(0.05) }), [...FILL, 1], 'far side, near the middle: the fill');
  near(tone({ ...far, D: rhoD(0.25) }), darker(1 - CEL.D1), 'far side, first step');
  near(tone({ ...far, D: rhoD(0.6) }), darker(1 - CEL.D1 - CEL.D2), 'far side, second step');
  // The lit side: the middle is the fill; the wall (rho 0.9) is lifted toward white (clear of the light line at 0.52).
  near(tone({ D: rhoD(0.1) }), [...FILL, 1], 'lit side, the middle');
  near(tone({ D: rhoD(0.9) }), [...FILL.map((v) => v * (1 - CEL.LIT) + CEL.LIT), 1], 'lit side near the wall: lifted');
  near(tone({ ...far, D: rhoD(0.6), flags: 0 }), [...FILL, 1], 'no diffuse flag: flat');
  near(tone({ ...far, D: rhoD(0.6), fx: 0 }), [...FILL, 1], 'no fx (the figure view): flat');
});

test('the tones are steps one pixel soft, and each follows the vessel\'s own colour', () => {
  const R = base.R, e = base.aa / R, far = { g: FAR_G };
  // Half way up a step (s = S1) the fill is half way between the two tones.
  const rho = -CEL.S1;
  near(tone({ ...far, D: rhoD(rho) }), darker(1 - CEL.D1 / 2), 'half way up the step');
  // A pixel and more past it either side it is whole.
  near(tone({ ...far, D: rhoD(rho - 2 * e) }), [...FILL, 1], 'a pixel clear above the step: the fill');
  near(tone({ ...far, D: rhoD(rho + 2 * e) }), darker(1 - CEL.D1), 'a pixel clear below: the first tone');
  const dark = [0.1, 0.1, 0.3];
  near(tone({ ...far, col: dark, D: rhoD(0.25) }), [...dark.map((v) => v * (1 - CEL.D1)), 1], 'a dark vessel: the same steps of its own colour');
  const pale = [0.9, 0.9, 0.95];
  near(tone({ ...far, col: pale, D: rhoD(0.6) }), [...pale.map((v) => v * (1 - CEL.D1 - CEL.D2)), 1], 'a pale vessel too');
  // The lit lift shows on a dark vessel too (it goes toward white, not by a share of the colour): at least 0.1 brighter on a fill of 0.1.
  assert.ok(tone({ col: dark, D: rhoD(0.9) })[0] - dark[0] > 0.1 * 0.9 * CEL.LIT / 0.16 * 0.9, 'visible on a dark fill');
});

test('the tones follow the light from the top left and nothing else: no lit side where the vessel runs along the light\'s cross', () => {
  near(tone({ g: ALONG_G, D: rhoD(0.6) }), [...FILL, 1], 'k 0: no tone');
  assert.ok(CEL.DIR[0] < 0 && CEL.DIR[1] < 0, 'toward the top left (x right, y down)');
  assert.ok(Math.abs(Math.hypot(...CEL.DIR) - 1) < 1e-3, 'a unit direction');
  // The same vessel turned a quarter: a horizontal one is lit from above, a vertical one from the left (k about 0.7 either way).
  const horiz = tone({ g: [0, -1], D: rhoD(0.95) }), vert = tone({ g: [-1, 0], D: rhoD(0.95) });
  assert.ok(horiz[0] > FILL[0] && vert[0] > FILL[0], 'its top and its left are lifted');
  assert.ok(tone({ g: [0, 1], D: rhoD(0.95) })[0] < FILL[0] && tone({ g: [1, 0], D: rhoD(0.95) })[0] < FILL[0], 'its bottom and its right are darker');
});

test('the outline is 1.5 device px on a hairline and 3 on a wide vessel, at any px', () => {
  for (const px of [0.25, 0.5, 2]) {
    const out = { ...base, aL: 0, px };
    // A hairline (R 0.2 px): 1.5 px. The ink fills up to there and is gone an aa beyond.
    const thin = { ...out, R: 0.2 * px };
    assert.equal(wlOf(thin.R, px), 1.5 * px);
    near(celShadeJS({ ...thin, D: 1.5 * px - 0.5 * base.aa - 1e-9 }).slice(3), [1], 'hairline: inside 1.5 px');
    near(celShadeJS({ ...thin, D: 1.5 * px + base.aa }), [0, 0, 0, 0], 'hairline: nothing past 1.5 px');
    // A wide vessel (R 100 px): 3 px, not 14 % of 100.
    const wide = { ...out, R: 100 * px };
    assert.equal(wlOf(wide.R, px), 3 * px);
    near(celShadeJS({ ...wide, D: 3 * px - 0.5 * base.aa - 1e-9 }).slice(3), [1], 'wide: inside 3 px');
    near(celShadeJS({ ...wide, D: 3 * px + base.aa }), [0, 0, 0, 0], 'wide: nothing past 3 px');
    // Between the two it follows the caliber: R 15 px is 2.1 px.
    assert.ok(Math.abs(wlOf(15 * px, px) - 2.1 * px) < 1e-12);
    near(celShadeJS({ ...out, R: 15 * px, D: 2.1 * px + base.aa }), [0, 0, 0, 0], 'caliber: nothing past 2.1 px');
  }
});

test('between the lumen edge and the outline it is the ink at alpha 1; an aa past that it is empty', () => {
  const wl = wlOf(base.R, base.px);
  const out = { ...base, aL: 0 };
  near(celShadeJS({ ...out, D: wl / 2 }), [...DEEP, 1], 'inside the outline');
  near(celShadeJS({ ...out, D: wl + base.aa }), [0, 0, 0, 0], 'past the outline');
});

test('a veiled vessel keeps half its outline; an F_EDGE vessel keeps its own colour', () => {
  const out = { ...base, aL: 0, D: 0.5 };
  near(celShadeJS({ ...out, flags: F.F_VEIL }), [...DEEP.map((v) => v * 0.5), 0.5], 'veiled: half');
  const edge = [0.1, 0.5, 0.9];
  near(celShadeJS({ ...out, flags: F.F_EDGE, edge }), [...edge.map((v) => v * 0.92), 0.92], 'its own edge colour');
});

test('the outline follows the look: a dark casing gives the deep tone of the vessel, a light casing its own colour, always opaque', () => {
  const out = { ...base, aL: 0, D: 0.5 };
  near(celShadeJS({ ...out, casing: [0.1, 0.1, 0.12, 0.6] }), [...DEEP, 1], 'dark casing: the deep tone of the fill');
  // The deep tone is of the vessel's own colour: another fill, another ink; and never lighter than the fill.
  const blue = [0.2, 0.4, 0.9];
  near(celShadeJS({ ...out, col: blue }), [...deepOf(blue), 1], 'a blue vessel, a deep blue line');
  assert.ok(DEEP.every((v, i) => v < FILL[i]), 'darker than the fill');
  const pale = [0.85, 0.8, 0.9];
  near(celShadeJS({ ...out, casing: [...pale, 0.3] }), [...pale, 1], 'light casing, its alpha not used');
  assert.match(CEL_TEXT, /vec3 deep = mix\(col \* 0\.34, CEL_INK, 0\.25\);/);
  assert.match(CEL_TEXT, /vec3 ink = mix\(deep, casing\.rgb, smoothstep\(0\.25, 0\.45, cY\)\);/);
});

test('one crisp light line on the lit side only, at about half way to the wall', () => {
  const R = base.R;
  const at = (rho, o = {}) => celShadeJS({ ...base, D: -R * (1 - rho), ...o });
  // The line sits inside the faint lift of the lit side (s above S3), so both are in the expected colour.
  const lifted = FILL.map((v) => v * (1 - CEL.LIT) + CEL.LIT);
  const white = lifted.map((v) => v * (1 - CEL.LIGHT) + CEL.LIGHT);
  near(at(0.52), [...white, 1], 'on the line');
  near(at(0.1), [...FILL, 1], 'inside it: the plain fill');
  near(at(0.52 + 0.045 + 2 * (base.aa / R)), [...lifted, 1], 'outside it: the lit side\'s fill');
  near(at(0.6, { g: FAR_G }), darker(1 - CEL.D1 - CEL.D2), 'not on the far side (its darker steps instead)');
  near(at(0.52, { g: ALONG_G }), [...FILL, 1], 'not where the light runs along the vessel');
  near(at(0.52, { flags: 0 }), [...FILL, 1], 'not without the diffuse flag');
});

test('a hairline has no tones and no light line', () => {
  // R / aa = 1.2 < 1.5: far side, deep in the tones' reach, still the plain fill; lit side at the line's place too.
  near(celShadeJS({ ...base, R: 0.6, g: FAR_G, D: -0.1 }), [...FILL, 1], 'hairline, far side');
  near(celShadeJS({ ...base, R: 0.6, D: -0.6 * 0.48 }), [...FILL, 1], 'hairline, lit side');
  // R / aa = 2: the tones are mostly out (they need 1.5 to 3.5 to come in), the light line needs 2.5 to 4.5.
  const narrow = celShadeJS({ ...base, R: 1, D: -0.48 });
  assert.ok(narrow[0] > FILL[0] && narrow[0] < FILL[0] + CEL.LIT * (1 - FILL[0]), 'a narrow vessel: the lift only partly in, and no line yet');
});

test('a selected vessel has the ring outside the outline', () => {
  const ring = [0.2, 0.6, 1, 0.8];
  const wl = wlOf(base.R, base.px);
  const sel = { ...base, aL: 0, sel: true, ring };
  near(celShadeJS({ ...sel, D: wl + 2 }), [ring[0] * 0.8, ring[1] * 0.8, ring[2] * 0.8, 0.8], 'ring beyond the outline');
  near(celShadeJS({ ...sel, D: wl / 2 }), [...DEEP, 1], 'the outline over the ring');
  near(celShadeJS({ ...sel, D: wl + 4 + 2 * base.aa }), [0, 0, 0, 0], 'nothing past the ring');
});

test('the constants in the GLSL text are the ones in CEL', () => {
  const ink = /const vec3 CEL_INK = vec3\(([^)]*)\);/.exec(CEL_TEXT);
  assert.ok(ink, 'CEL_INK');
  assert.deepEqual(ink[1].split(',').map(Number), CEL.INK);
  assert.deepEqual(/const vec2 CEL_DIR = vec2\(([^)]*)\);/.exec(CEL_TEXT)[1].split(',').map(Number), CEL.DIR);
  for (const n of ['S1', 'S2', 'S3', 'D1', 'D2', 'LIT']) assert.equal(Number(new RegExp(`const float CEL_${n} = (-?[\\d.]+);`).exec(CEL_TEXT)[1]), CEL[n], n);
  const wl = /float wl = clamp\(([\d.]+) \* R, ([\d.]+) \* px, ([\d.]+) \* px\);/.exec(CEL_TEXT);
  assert.ok(wl, 'the outline width line');
  assert.deepEqual(wl.slice(1).map(Number), [CEL.LINE_R, CEL.LINE_MIN, CEL.LINE_MAX]);
  assert.equal(Number(/return mix\(lum, vec3\(1\.0\), ([\d.]+) \* lineA\);/.exec(CEL_TEXT)[1]), CEL.LIGHT);
  assert.deepEqual(CEL, { K: 1.6, INK: [0.07, 0.06, 0.06], DIR: [-0.70710678, -0.70710678], S1: -0.12, S2: -0.36, S3: 0.2, D1: 0.1, D2: 0.1, LIT: 0.16, LINE_MIN: 1.5, LINE_MAX: 3, LINE_R: 0.14, LIGHT: 0.3 });
  assert.ok(/uniform float celK;/.test(CEL_TEXT), 'celK stays declared');
});
