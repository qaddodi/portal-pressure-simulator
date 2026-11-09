import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { CELL } from '../src/ui/veins-bin.js';
import { STRIP_VS_GLSL } from '../src/ui/veins-mesh.js';
import { shadeGLSL } from '../src/ui/veins-mesh-glsl.js';
import { V_FULL, V_BASE, V_BLOOD, WIN_MAX, CELL_SIMPLE } from '../src/ui/vec-contract.js';
import { VEC_PRECISION, VEC_SHADE_GLSL, VEC_SHADE_UNIFORMS } from '../src/ui/vec-shade-glsl.js';
import { vecStretchVS, vecStretchFS, vecStretchUniformNames, VEC_ABOVE_GLSL, STRETCH_WIN } from '../src/ui/vec-stretch-glsl.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const GL = await import('../src/ui/veins-gl.js');

// The ordinary-stretch shader (docs/recommendations/vector-renderer-plan.md section 5.1), checked without a GPU: the lint on all three variants
// and the vertex shaders, the uniforms each declares against the list the renderer core sets, and, on the exported shader strings (never the
// file's text), that the cell test is the one formula and that the stretch and the region shaders both call the one vecShadeOne.
// K: the flags and VEIL_K as the instance has them.
const K = {
  F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE,
  F_SEL: GL.F_SEL, F_DOTTED: GL.F_DOTTED, F_NOCASE: GL.F_NOCASE, VEIL_K: GL.VEIL_K,
};
const VARIANTS = [['V_FULL', V_FULL], ['V_BASE', V_BASE], ['V_BLOOD', V_BLOOD]];
const count = (s, sub) => s.split(sub).length - 1;

test('all three fragment variants and their vertex shaders pass the GLSL lint', () => {
  for (const [name, v] of VARIANTS) {
    assert.deepEqual(lintGLSL(vecStretchFS(v, K)), [], `fragment ${name}`);
    assert.deepEqual(lintGLSL(vecStretchVS(v, K)), [], `vertex ${name}`);
  }
  // The shared text alone, behind a main, as workstream C's region shader takes it.
  assert.deepEqual(lintGLSL(`${VEC_PRECISION}${VEC_SHADE_GLSL(K)}layout(location=0) out vec4 o;\nvoid main() { o = vec4(0.0); }`), [], 'VEC_SHADE_GLSL on its own');
});

test('the lint catches a broken stretch shader (the test is not vacuous)', () => {
  const src = vecStretchFS(V_FULL, K);
  assert.ok(lintGLSL(src.replace('vecShadeOne(vRow', 'vecShadeOn(vRow')).some((m) => /vecShadeOn/.test(m)));
  assert.ok(lintGLSL(src.replace('VecNear nr =', 'VecNear nq =')).some((m) => /"nr" is not declared/.test(m)));
});

test('the uniforms each program declares are exactly the ones the renderer core sets', () => {
  for (const [name, v] of VARIANTS) {
    const want = vecStretchUniformNames(v);
    assert.deepEqual([...new Set(uniformsOf(vecStretchFS(v, K)))].sort(), [...want.fs].sort(), `fragment ${name}`);
    assert.deepEqual([...new Set(uniformsOf(vecStretchVS(v, K)))].sort(), [...want.vs].sort(), `vertex ${name}`);
  }
  assert.deepEqual([...new Set(uniformsOf(VEC_SHADE_GLSL(K)))].sort(), [...VEC_SHADE_UNIFORMS].sort(), 'the shared text declares VEC_SHADE_UNIFORMS');
  assert.equal(new Set(VEC_SHADE_UNIFORMS).size, VEC_SHADE_UNIFORMS.length, 'no name twice');
});

test('the cell test is the one formula: the pixel centre through inv, floor, gridO, CELL, in one function every program calls', () => {
  const shared = VEC_SHADE_GLSL(K);
  assert.equal(count(shared, 'floor((p - gridO) / CELL)'), 1, 'one floor over (world − gridO) / CELL');
  assert.equal(count(shared, '(inv * vec3(gl_FragCoord.xy, 1.0)).xy'), 1, 'one world-from-pixel, through inv');
  assert.ok(shared.includes(`const float CELL = ${CELL}.0;`), 'CELL is veins-bin\'s');
  for (const [name, v] of VARIANTS) {
    const fs = vecStretchFS(v, K);
    assert.equal(count(fs, 'floor((p - gridO) / CELL)'), 1, `${name}: the formula appears once, in vecCellAt`);
    assert.equal(count(fs, 'inv *'), 1, `${name}: inv is used once`);
    assert.equal(count(fs, 'vecCellAt(p)'), 1, `${name}: main asks for its cell once`);
    assert.equal(count(fs, 'vecWorld()'), 2, `${name}: vecWorld defined once, called once`);
    // The cell it draws in: an ordinary cell of its own row, else the fragment is discarded before any shading.
    assert.ok(fs.indexOf('discard') < fs.indexOf('vecNear(vRow'), `${name}: the cell test comes first`);
    assert.ok(fs.includes('cell.x != CELL_SIMPLE || int(cell.y) != vRow'), `${name}: draws only in an ordinary cell of its own row`);
  }
  assert.ok(shared.includes(`const uint CELL_SIMPLE = ${CELL_SIMPLE}u;`), 'the contract\'s kind');
  // The cell texel is read by cells and gridN only: out of the grid is empty.
  assert.ok(shared.includes('c.x >= gridN.x || c.y >= gridN.y) return uvec4(0u)'));
});

test('the single-vessel shading is built from shadeGLSL, with no flow-target packing, and is the one function the stretch calls', () => {
  const shared = VEC_SHADE_GLSL(K);
  const classicShade = shadeGLSL({
    F_DIFFUSE: K.F_DIFFUSE, F_EDGE: K.F_EDGE, F_SHADOW: K.F_SHADOW, F_SPEC: K.F_SPEC, F_VEIL: K.F_VEIL, F_WHOLE: K.F_WHOLE,
    LIFT_EASE_MAX: 80, LIFT_EASE_SHARE: 0.45, LUMEN2: 0, ROW2_BITS: 0, VEIL_K: K.VEIL_K,
  });
  for (const fn of ['void segNear(', 'void vesAttrs(', 'float glowAmt(', 'vec4 shadowOf(', 'vec4 tubeShade(', 'vec4 ditherOut(']) {
    assert.ok(shared.includes(fn) && classicShade.includes(fn), `${fn} is shadeGLSL's`);
  }
  assert.ok(!shared.includes('packFlow') && !shared.includes('uvec4 packFlow'), 'the lumen target packing is cut');
  assert.ok(!/outFlow|outDep|gbuf/.test(shared), 'no flow or lumen-mask targets');
  for (const [name, v] of VARIANTS) {
    const fs = vecStretchFS(v, K);
    assert.equal(count(fs, 'vec4 vecShadeOne('), 1, `${name}: defined once`);
    assert.equal(count(fs, 'vecShadeOne(vRow'), 1, `${name}: called once`);
    assert.ok(fs.includes('ditherOut(o, gl_FragCoord.xy)') === (v !== V_BLOOD), `${name}: dithered once, except where the base already carries it`);
  }
  assert.ok(shared.includes(`for (int k = 0; k < WIN_MAX; k++)`) && shared.includes(`const int WIN_MAX = ${WIN_MAX};`), 'the segment loop is bounded by the contract\'s WIN_MAX');
  // Everything the vector pass must not do: the classic passes' flow writes and slot loops.
  assert.ok(!/MAXS|MAXJ|corner\(|smin\(/.test(shared), 'no slots, joins or fillets: that is the region shader\'s');
});

test('the variants differ where the plan says: BASE has no blood, BLOOD reads the kept base and lays the overlays', () => {
  const full = vecStretchFS(V_FULL, K), base = vecStretchFS(V_BASE, K), blood = vecStretchFS(V_BLOOD, K);
  assert.ok(full.includes('vecBlood(vRow') && blood.includes('vecBlood(vRow'));
  assert.ok(!base.includes('vecBlood'), 'BASE: no blood');
  assert.ok(blood.includes('texelFetch(vecBase, ivec2(gl_FragCoord.xy), 0)') && blood.includes('vecAboveAt(p)'));
  assert.ok(!full.includes('vecBase') && !full.includes('vecAboveAt') && !base.includes('vecBase'));
  // BLOOD adds the change the blood makes to the base; it never recomputes the picture.
  assert.ok(blood.includes('b.rgb + o.a * (lit - lumCol)'));
  // The blood is laid as D's signature has it: a premultiplied layer, weighted by the lumen's visibility.
  assert.ok(full.includes('bl.rgb * vis + lumCol * (1.0 - bl.a * vis)'));
  // The injected texts take the stubs' places.
  const custom = vecStretchFS(V_BLOOD, K, { blood: '\nvoid vecBloodAt(vec2 w) { }\nvec4 vecBlood(int row, float s, float y, float R, vec3 c, float px) { return vec4(1.0); }\n', above: '\nvec4 vecAboveAt(vec2 p) { return vec4(0.5); }\n' });
  assert.ok(custom.includes('return vec4(1.0)') && custom.includes('return vec4(0.5)') && !custom.includes(VEC_ABOVE_GLSL.trim()) && !custom.includes('vbOn'));
  assert.deepEqual(lintGLSL(custom), []);
});

test('the vertex shader is the mesh\'s strip placement, padded by the reach (the lumen only for BLOOD), with one depth a row', () => {
  const strip = STRIP_VS_GLSL.replace(/#define ENT_W (\d+)/, 'const int ENT_W = $1;');
  for (const [name, v] of VARIANTS) {
    const vs = vecStretchVS(v, K);
    assert.ok(vs.includes(strip), `${name}: meshWorld is imported, not copied`);
    assert.ok(!/^\s*#(?!version)/m.test(vs), `${name}: no preprocessor directive`);
    assert.ok(vs.includes('meshWorld(id, aV, pad)'));
    assert.ok(vs.includes('flat out int vRow;'));
    assert.ok(/gl_Position = vec4\([^;]*\(float\(id\) \+ 0\.5\) \/ \d+\.0 \* 2\.0 - 1\.0, 1\.0\);/.test(vs), `${name}: z is the row's alone`);
  }
  for (const [name, v] of VARIANTS) assert.ok(vecStretchVS(v, K).includes('texelFetch(tube, ivec2(1, id), 0).w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }'), `${name}: a row with no alpha is folded away`);
  assert.ok(vecStretchVS(V_FULL, K).includes('texelFetch(tube, ivec2(0, id), 0).w + padU + (sel ? selPad : 0.0)'));
  assert.ok(vecStretchVS(V_BASE, K).includes('texelFetch(tube, ivec2(0, id), 0).w + padU'));
  assert.ok(vecStretchVS(V_BLOOD, K).includes('float pad = padU;') && !vecStretchVS(V_BLOOD, K).includes('selPad)'));
});

test('the region shader (workstream C) calls the same vecShadeOne and takes its cell from the same function', async (t) => {
  let region;
  try { region = await import('../src/ui/vec-region-glsl.js'); } catch { region = null; }
  if (!region || !region.vecRegionFS) { t.skip('vec-region-glsl.js has not landed yet'); return; }
  const rs = region.vecRegionFS(V_FULL, K);
  const stretch = vecStretchFS(V_FULL, K);
  const def = (s) => s.slice(s.indexOf('vec4 vecShadeOne('), s.indexOf('\n}\n', s.indexOf('vec4 vecShadeOne(')));
  assert.equal(def(rs), def(stretch), 'the very same vecShadeOne text');
  assert.ok(rs.includes('vecShadeOne('));
  assert.equal(count(rs, 'floor((p - gridO) / CELL)'), 1, 'the one cell formula');
});

test('the fragment reads only the segments about its strip\'s sample, inside the cell\'s run, and never more than WIN_MAX', () => {
  assert.ok(2 * STRETCH_WIN + 1 <= WIN_MAX, 'the window fits the loop');
  for (const [name, v] of VARIANTS) {
    const fs = vecStretchFS(v, K), vs = vecStretchVS(v, K);
    assert.ok(fs.includes(`const int STRETCH_WIN = ${STRETCH_WIN};`), `${name}: the window is the module's`);
    assert.ok(fs.includes('vecNear(vRow, max(int(cell.z), ic - STRETCH_WIN), min(int(cell.w), ic + STRETCH_WIN), p, p - shOff)'), `${name}: the run is cut to the window`);
    assert.ok(fs.includes('int ic = clamp(int(vI), 0, N_SAMPLES - 2);') && fs.includes('in float vI;'), `${name}: from the interpolated sample index`);
    assert.ok(vs.includes('out float vI;') && vs.includes('vI = aV.y + (int(aV.x + 0.5) == K_TRAP ? aV.w : 0.0);'), `${name}: the vertex shader writes it as the mesh does`);
  }
});
