// The Tube's short glow shader (src/ui/tube-glow-glsl.js, brief P6): judged from what the module exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const gl = await import('../src/ui/veins-gl.js');
const { EDGE_GLSL } = await import('../src/ui/edge.js');
const { ENT_W } = await import('../src/ui/veins-bin.js');
const { LIFT_EASE_SHARE, LIFT_EASE_MAX } = await import('../src/ui/highlight-math.js');
const { MP } = await import('../src/ui/veins-mesh-glsl.js');
const { tubeStripVS } = await import('../src/ui/tube-geo.js');
const { STRIP_VS_GLSL } = await import('../src/ui/veins-mesh.js');
const { tubeGlowFS, tubeGlowJS, glowAmtJS, GLOW_WIN } = await import('../src/ui/tube-glow-glsl.js');

const ALONG_GLSL = `
float alongAt(int id, float u) {
  float ui = u * ${gl.N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${gl.N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;
const K = {
  F_DIFFUSE: gl.F_DIFFUSE, F_EDGE: gl.F_EDGE, F_SHADOW: gl.F_SHADOW, F_SPEC: gl.F_SPEC, F_VEIL: gl.F_VEIL, F_WHOLE: gl.F_WHOLE, F_SEL: gl.F_SEL,
  F_DOTTED: gl.F_DOTTED, F_NOCASE: gl.F_NOCASE, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2: gl.LUMEN2, ROW2_BITS: gl.ROW2_BITS, VEIL_K: gl.VEIL_K,
  EDGE: EDGE_GLSL, ENT_W, N_SAMPLES: gl.N_SAMPLES, MAX_TIERS: gl.MAX_TIERS, S_OFF: 96, ALONG_GLSL,
};
const GLOW = tubeGlowFS(K);
const STRIP = gl.vesselFS(true, 1, 1);

test('the glow shader passes the lint, searches only its own vessel\'s segments about its sample, and reads no vD', () => {
  assert.deepEqual(lintGLSL(GLOW), []);
  // (The distance is the vessel's own, from segNear over the window about the fragment's sample, one call in a loop: a strip's vD is wrong across a turn,
  // where the domes, trap quads and overlapping rings of the glow's skirt drew boxes and wedges out of the halo.)
  assert.equal(GLOW.split('segNear(').length - 1, 2, 'its definition and the one call');
  assert.match(GLOW, /void segNear\(/);
  assert.match(GLOW, new RegExp(`for \\(int j = max\\(0, ic - ${GLOW_WIN}\\); j <= min\\(${gl.N_SAMPLES - 2}, ic \\+ ${GLOW_WIN}\\); j\\+\\+\\)`));
  assert.ok(GLOW_WIN >= 3, 'a window wider than the strip build\'s');
  assert.ok(!/\bvD\b|\bvRad\b/.test(GLOW), 'no varying distance is read');
  assert.ok(!/\bMAXS\b|\bMAXJ\b/.test(GLOW), 'no loop over vessels or joins');
  assert.ok(!GLOW.includes('gl_FragDepth'), 'no depth write');
  assert.ok(!/\bcelShade\(|\btubeShade\(/.test(GLOW.replace(/vec4 (celShade|tubeShade)\(/g, '')), 'no shape shading is called');
});

const uniforms = (src) => {
  const m = new Map();
  for (const x of src.matchAll(/^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*(\[[^\]]*\])?\s*;/gm)) m.set(x[2], x[1] + (x[3] ? '[]' : ''));
  return m;
};

test('every uniform it declares is in the Tube strip build with the same type, so the strip\'s draw feeds it unchanged', () => {
  const strip = uniforms(STRIP), glow = uniforms(GLOW);
  assert.ok(glow.size > 20, 'found the uniforms');
  for (const [name, type] of glow) assert.equal(strip.get(name), type, `${name}: ${type}`);
});

test('its varyings are the strip vertex shader\'s', () => {
  const vs = tubeStripVS(STRIP_VS_GLSL, gl.F_SEL, gl.ZOOM_VS);
  for (const x of GLOW.matchAll(/^(?:flat )?in (\w+) (\w+);/gm)) assert.match(vs, new RegExp(`out ${x[1]} ${x[2]};`), x[2]);
});

test('it keeps the glow\'s rules of the strip build and takes any other pass out', () => {
  assert.match(GLOW, new RegExp(`if \\(mPass != ${MP.GLOW} && mPass != ${MP.UP}\\) discard;`));
  assert.match(GLOW, /glowAmt\(id, D, aWall, us, aA, gc, ge\)/);
  assert.match(GLOW, /lgm\.a <= 0\.0 && tubeKey == 1 && inside/);
  assert.match(STRIP, /lgm\.a <= 0\.0 && tubeKey == 1 && sd\[0\] < swall\[0\]/);
});

// One lit vessel: gc its glow colour, ge [start fade, end fade, own colour (1) or gc (0), width (above 5 the up pass)].
const gc = [0.9, 0.6, 0.1, 1], ge = [0, 0, 0, 1];
const col = [0.2, 0.3, 0.8];
const base = { mPass: MP.GLOW, tubeKey: 0, tierNow: 1, D: 6, reach: 30, attrs: { tier: 1, wall: 2, col, alpha: 1 }, gc, ge, u: 0.5, Lh: 100, tierGroup: 0, netAlpha: 1 };
const near = (got, want, msg) => { assert.equal(got.length, want.length, msg); got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${msg}: ${got} vs ${want}`)); };

test('outside the wall the amount falls with the distance, as glowAmt says, in the glow colour', () => {
  const at = (D, o = {}) => tubeGlowJS({ ...base, D, ...o });
  const g1 = glowAmtJS({ d: 4, wall: 2, vAt: 0.5, Lh: 100, aIn: 1, gc, ge }), g2 = glowAmtJS({ d: 8, wall: 2, vAt: 0.5, Lh: 100, aIn: 1, gc, ge });
  assert.ok(g1 > g2 && g2 > 0, 'it falls');
  const a = at(4), b = at(8);
  assert.equal(a.kind, 'draw');
  near(a.colour, [gc[0] * g1, gc[1] * g1, gc[2] * g1, g1], 'near');
  near(b.colour, [gc[0] * g2, gc[1] * g2, gc[2] * g2, g2], 'far');
  assert.equal(at(2 + 12 * 1 + 0.1).kind, 'discard', 'no amount past the fall: nothing');
  // The vessel's own colour when the glow asks for it (ge.z above 0.5): and then the colour reaches the pixel (outDep).
  const own = at(4, { ge: [0, 0, 1, 1] });
  near(own.colour, [col[0] * g1, col[1] * g1, col[2] * g1, g1], 'own colour');
  assert.equal(own.dep, 1);
  assert.equal(a.dep, 0);
});

test('inside a lit vessel\'s own wall the prepass keeps the pixel with no colour, and the colour pass draws nothing', () => {
  const inside = { ...base, D: -3 };
  const pre = tubeGlowJS({ ...inside, tubeKey: 1 });
  assert.equal(pre.kind, 'depth');
  near(pre.colour, [0, 0, 0, 0], 'no colour');
  assert.equal(tubeGlowJS({ ...inside, tubeKey: 0 }).kind, 'discard');
  // (Just outside the wall both passes draw the glow.)
  assert.equal(tubeGlowJS({ ...base, D: 2.5, tubeKey: 1 }).kind, 'draw');
  assert.equal(tubeGlowJS({ ...base, D: 2.5, tubeKey: 0 }).kind, 'draw');
});

test('the up pass and the plain pass each discard the other\'s vessels, and no other pass draws', () => {
  const up = { ...base, ge: [0, 0, 0, 11] };   // (width above 5: the glow that lies on top)
  assert.equal(tubeGlowJS({ ...base, mPass: MP.GLOW }).kind, 'draw');
  assert.equal(tubeGlowJS({ ...base, mPass: MP.UP }).kind, 'discard');
  assert.equal(tubeGlowJS({ ...up, mPass: MP.UP }).kind, 'draw');
  assert.equal(tubeGlowJS({ ...up, mPass: MP.GLOW }).kind, 'discard');
  // The other's vessel inside the wall in the prepass is discarded too (it writes no depth either).
  assert.equal(tubeGlowJS({ ...base, mPass: MP.UP, D: -3, tubeKey: 1 }).kind, 'discard');
  for (const mPass of [MP.GLOW_K, MP.UP_K, MP.SHADOW_K, MP.SHADOW, MP.SHAPE_K, MP.SHAPE, MP.LIFT, MP.RING, MP.MARK]) assert.equal(tubeGlowJS({ ...base, mPass }).kind, 'discard', `pass ${mPass}`);
});

test('no glow colour, no amount, another tier, past the reach: nothing; the network\'s glow is laid for its fade; redraw writes empty', () => {
  assert.equal(tubeGlowJS({ ...base, gc: [0, 0, 0, 0] }).kind, 'discard', 'unlit');
  assert.equal(tubeGlowJS({ ...base, attrs: { ...base.attrs, alpha: 0 } }).kind, 'discard', 'alpha 0: no amount');
  assert.equal(tubeGlowJS({ ...base, tierNow: 2 }).kind, 'discard', 'another tier outside the wall');
  assert.equal(tubeGlowJS({ ...base, tierNow: 2, D: -3, tubeKey: 1 }).kind, 'depth', 'another tier inside the wall in the prepass: the strip build writes the depth');
  assert.equal(tubeGlowJS({ ...base, D: 31 }).kind, 'discard');
  assert.equal(tubeGlowJS({ ...base, D: 31, redraw: 1 }).kind, 'empty');
  const g = glowAmtJS({ d: 4, wall: 2, vAt: 0.5, Lh: 100, aIn: 1, gc, ge });
  const net = tubeGlowJS({ ...base, D: 4, tierGroup: 1, netAlpha: 0.5 });
  near(net.colour, [gc[0] * g * 2 * 1, gc[1] * g * 2, gc[2] * g * 2, g * 2].map((v) => v * Math.min(1, 1 / (2 * g))), 'divided by the network\'s fade, never above 1 in alpha');
});

test('glowAmtJS fades at a free end and over a stretch, as glowAmt does', () => {
  const at = (vAt, geN) => glowAmtJS({ d: 4, wall: 2, vAt, Lh: 100, aIn: 1, gc, ge: geN });
  const free = [30, 30, 0, 1];
  assert.equal(at(0, free), 0);
  assert.ok(at(0.15, free) > 0 && at(0.15, free) < at(0.5, free), 'eases in over the fade length');
  assert.equal(at(0.5, [0, 0, 0, 1]), at(0.5, free));
  assert.equal(at(0.5, [-1.25, -1.75, 0, 1]) > 0, true, 'a stretch from 25 % to 75 %');
  assert.equal(at(0.1, [-1.25, -1.75, 0, 1]), 0, 'outside the stretch');
});
