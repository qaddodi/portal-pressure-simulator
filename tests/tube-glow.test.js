// The Tube's glow (docs/recommendations/tube-renderer-plan.md): where lit vessels' glow skirts overlap, the nearest wall's wins (the skirt slopes up
// to the wall in depth), and a lit vessel's own wall keeps its depth in the glow's prepass so no other glow shows inside it (tubeKey).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';
import { preprocess } from './glsl-pp.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { vesselFS } = await import('../src/ui/veins-gl.js');
const { meshFS } = await import('../src/ui/veins-mesh-glsl.js');
const { TUBE_LEVEL, tubeStripVS, tubeVertex, TUBE_ACROSS, TUBE_RINGS, TUBE_CAP } = await import('../src/ui/tube-geo.js');
const { STRIP_VS_GLSL } = await import('../src/ui/veins-mesh.js');

const K = { EDGE: '1.0', F_DOTTED: 1, F_NOCASE: 2, F_SEL: 4, F_VEIL: 8, VEIL_K: 0.5 };

test('the Tube strip build declares tubeKey and keeps a lit vessel\'s own wall in the glow prepass; the Mesh builds do not have it', () => {
  const tube = meshFS({ ...K, tube: 1 }), mesh = meshFS(K);
  assert.match(tube.decl, /uniform int tubeKey;/);
  assert.match(tube.out, /lgm\.a <= 0\.0 && tubeKey == 1 && sd\[0\] < swall\[0\]/);
  assert.ok(!mesh.decl.includes('tubeKey') && !mesh.out.includes('tubeKey'), 'the Mesh text is untouched');
  assert.match(mesh.out, /^\s*if \(lgm\.a <= 0\.0\) discard;$/m, 'the Mesh keeps its one discard line');
  assert.match(tube.out, /if \(lgm\.a <= 0\.0\) discard;/, 'and the Tube keeps the discard for the colour pass');
  // (In the shader the pass really runs: the build puts the Tube's parts in, not the Mesh's.)
  const strip = vesselFS(true, 1, 1);
  assert.ok(strip.includes('uniform int tubeKey;') && strip.includes('tubeKey == 1 && sd[0] < swall[0]'), 'the Tube strip build has tubeKey');
  for (const src of [vesselFS(true, 1), vesselFS(false, 2)]) assert.ok(!src.includes('tubeKey'), 'the Mesh builds have none');
  for (const src of [strip, vesselFS(false, 2, 1)]) assert.deepEqual(lintGLSL(preprocess(src)), []);
});

test('a glow skirt slopes up to the wall, and the lumen is nearer than any skirt (JS twin and vertex shader)', () => {
  assert.ok(TUBE_LEVEL.GLOW0 < TUBE_LEVEL.GLOW_WALL && TUBE_LEVEL.GLOW_WALL < TUBE_LEVEL.GLOW1 && TUBE_LEVEL.GLOW1 < TUBE_LEVEL.CASE0);
  const P = new Float64Array([0, 0, 10, 0, 20, 0]), R = new Float64Array([2, 2, 2]);
  const at = (ac, glow) => tubeVertex(P, R, [0, TUBE_CAP + 1, ac, 0], { w: 16, hRef: 8, glow })[2];
  assert.equal(at(0, true), TUBE_LEVEL.GLOW0);
  assert.equal(at(1, true), TUBE_LEVEL.GLOW_WALL);
  assert.equal(at(TUBE_ACROSS - 2, true), TUBE_LEVEL.GLOW_WALL);
  assert.equal(at(TUBE_ACROSS - 1, true), TUBE_LEVEL.GLOW0);
  assert.equal(at(5, true), TUBE_LEVEL.GLOW1);
  assert.notEqual(at(1, false), TUBE_LEVEL.GLOW_WALL, 'a shape pass is not a glow');
  const vs = tubeStripVS(STRIP_VS_GLSL, 1);
  assert.match(vs, /const float L_GLOW_WALL = 0\.07;/);
  assert.match(vs, /if \(ac == 1\) return vec2\(-rc, glow \? L_GLOW_WALL : L_CASE1\);/);
  assert.match(vs, /if \(ac == T_ACROSS - 2\) return vec2\(rc, glow \? L_GLOW_WALL : L_CASE1\);/);
  assert.ok(TUBE_RINGS > 0);
});
