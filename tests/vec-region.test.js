import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { vecRegionVS, vecRegionFS, REGION_UNIFORMS, REGION_ATTRIBS, compositeGroups, pixelOwner, pixelStreams, over } = await import('../src/ui/vec-region-glsl.js');
const K = await import('../src/ui/vec-contract.js');
const { shadeGLSL } = await import('../src/ui/veins-mesh-glsl.js');
const GL = await import('../src/ui/veins-gl.js');
const { EDGE_GLSL } = await import('../src/ui/edge.js');
void EDGE_GLSL;

// Until workstreams B, D and G land, stand-ins with the signatures agreed between the threads (see the header of vec-region-glsl.js): the
// host declarations of B's text, shadeGLSL as the renderer builds it, B's vecNear and vecShadeOne, D's vecBlood and vecBloodMix, G's vecAboveAt.
const SHADE = shadeGLSL({
  F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE,
  LIFT_EASE_MAX: 60, LIFT_EASE_SHARE: 0.35, LUMEN2: GL.LUMEN2, ROW2_BITS: GL.ROW2_BITS, VEIL_K: GL.VEIL_K,
});
const HOST = `
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D organ;
uniform vec4 organRect;
uniform int useOrgan;
uniform float organK;
uniform float px;
uniform float reachU;
uniform vec2 shOff;
uniform vec4 casing;
uniform vec4 shadow;
uniform vec4 sheenInk;
uniform vec4 shadeInk;
uniform vec4 rimInk;
uniform vec4 paperInk;
uniform vec4 ring;
uniform vec2 light;
uniform float netAlpha;
uniform int fx;
uniform float tierAlpha[${GL.MAX_TIERS}];
uniform int tierGroup[${GL.MAX_TIERS}];
uniform highp usampler2D cells;
uniform mat3 inv;
uniform vec2 gridO;
uniform ivec2 gridN;
const float CELL = 16.0;
const float LAST = ${GL.N_SAMPLES - 1}.0;
const float S_OFF = 96.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
float alongAt(int id, float u) { return u; }
vec2 vecWorld() { return (inv * vec3(gl_FragCoord.xy, 1.0)).xy; }
uvec4 vecCellAt(vec2 p) {
  ivec2 cl = ivec2(floor((p - gridO) / CELL));
  if (cl.x < 0 || cl.y < 0 || cl.x >= gridN.x || cl.y >= gridN.y) return uvec4(0u);
  return texelFetch(cells, cl, 0);
}
float vecOccl(vec2 p) { return useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${GL.VEIL_K} * organK : 0.0; }
${SHADE}
struct VecNear { float d, h, r, u, x, v; vec2 g; float aM, aW, aU; };
VecNear vecNearNone() {
  VecNear n;
  n.d = 1e9; n.h = 1e9; n.r = 0.0; n.u = 0.0; n.x = 0.0; n.v = 0.0; n.g = vec2(0.0); n.aM = 1e9; n.aW = 0.0; n.aU = 0.0;
  return n;
}
VecNear vecNearMore(VecNear n, int row, int i0, int i1, vec2 p, vec2 ps) {
  for (int i = i0; i <= i1; i++) segNear(row, float(i), vec4(0.0), p, ps, T(row, 5), false, n.d, n.h, n.r, n.u, n.x, n.g, n.aM, n.aW, n.aU);
  n.v = n.aW > 0.0 ? n.aU / n.aW : n.u;
  return n;
}
VecNear vecNear(int row, int i0, int i1, vec2 p, vec2 ps) { return vecNearMore(vecNearNone(), row, i0, i1, p, ps); }
vec3 vecStreamAt(int row, VecNear nr) { return vec3(nr.u * T(row, 5).z, clamp(nr.x / max(nr.r, 1e-3), -1.0, 1.0), nr.r); }
vec4 vecShadeOne(int row, VecNear nr, vec2 p, float occl, out float lum, out vec3 lumCol) {
  lum = 0.0; lumCol = T(row, 0).rgb;
  return vec4(0.0);
}`;
const BLOOD = `
vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px) { return vec4(0.0); }
vec4 vecBloodMix(int n, int rows[2], float s[2], float y[2], float R[2], float w[2], vec3 lumenCol, float px) { return vec4(0.0); }`;
const ABOVE = `
uniform float fluidLv;
vec4 vecAboveAt(vec2 w) { return vec4(0.0); }`;
const DEPS = { shade: HOST, blood: BLOOD, above: ABOVE, k: { F_SEL: GL.F_SEL, F_NOCASE: GL.F_NOCASE, F_DOTTED: GL.F_DOTTED, F_VEIL: GL.F_VEIL } };

test('the region vertex shader lints and reads only its own uniforms', () => {
  assert.deepEqual(lintGLSL(vecRegionVS), []);
  assert.deepEqual([...uniformsOf(vecRegionVS)].sort(), [...REGION_UNIFORMS.vertex].sort());
  assert.ok(vecRegionVS.includes('vCell') && vecRegionVS.includes('aCell'), 'the quad carries its cell');
  assert.deepEqual(REGION_ATTRIBS, { aC: 0, aCell: 1 });
});

for (const [name, variant] of [['FULL', K.V_FULL], ['BASE', K.V_BASE], ['BLOOD', K.V_BLOOD]]) {
  test(`the region fragment shader (${name}) lints and declares the uniforms E sets`, () => {
    const src = vecRegionFS(variant, DEPS);
    assert.deepEqual(lintGLSL(src), []);
    const u = uniformsOf(src);
    for (const n of [...REGION_UNIFORMS.fragment, 'cells', 'inv', 'gridO', 'gridN']) assert.ok(u.includes(n), `${name}: ${n}`);
    assert.equal(u.includes('uBase'), variant === K.V_BLOOD, `${name}: the kept base only under the blood variant`);
    assert.equal(u.filter((n) => n === 'regionTex').length, 1);
  });
}

test('the partition: the cell test is B\'s one formula, and the draw is limited to the quad\'s own region', () => {
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const src = vecRegionFS(variant, DEPS);
    assert.ok(/vec2 p = vecWorld\(\);/.test(src) && /uvec4 ct = vecCellAt\(p\);/.test(src), 'the region shader asks the shared cell test, it has no formula of its own');
    assert.ok(!/gl_FragCoord/.test(src.split('void main()')[1].split('vecShadeOne')[0]), 'and reads no pixel position before it');
    assert.ok(new RegExp(`int\\(ct\\.r\\) != ${K.CELL_REGION} \\|\\| int\\(own\\.r\\) != ${K.CELL_REGION} \\|\\| ct\\.g != own\\.g`).test(src), 'drawn only where the cell is this quad\'s own region');
  }
  // the vertex shader draws the cell's exact square
  assert.ok(/gridO \+ \(aCell \+ aC\) \* 16\.0/.test(vecRegionVS));
});

test('a pixel one member reaches calls the stretch shader\'s functions and the blood library\'s, unchanged', () => {
  const full = vecRegionFS(K.V_FULL, DEPS);
  assert.ok(/vecShadeOne\(sid\[0\], nr, p, occl, lum1, lumCol1\)/.test(full));
  assert.ok(/vecBlood\(sid\[0\], st1\.x, st1\.y, st1\.z, lumCol1, px\)/.test(full) && /vecStreamAt\(sid\[0\], nr\)/.test(full));
  const base = vecRegionFS(K.V_BASE, DEPS);
  assert.ok(/vecShadeOne\(/.test(base) && !/vecBlood/.test(base), 'BASE lays no blood');
  const bl = vecRegionFS(K.V_BLOOD, DEPS);
  assert.ok(/vecAboveAt\(p\)/.test(bl) && /uBase/.test(bl), 'BLOOD reads the kept base and lays what lies over the blood');
});

test('the region shader ports the classic join code: fillet, trunk and fork, run-on, cross-tier copy, crossing ring, groups', () => {
  const src = vecRegionFS(K.V_FULL, DEPS);
  for (const piece of ['smin(sd[a], sd[b], kk)', 'corner(p, sg[ta]', 'tn[s]', 'js[j] < 0.98', 'keep[s]', 'tin[s]', 'paperInk.a', 'kcas', 'accN * netAlpha', 'accT = over(c * wsel, accT)',
    'vecBloodMix(2, rws, ss, yy, rr, ww, gCol, px)']) assert.ok(src.includes(piece), piece);
  // joins are read from the region record by the contract's layout
  assert.ok(src.includes(`RG(rg, JOIN0 + 2 * k)`) && src.includes(`const int JOIN0 = ${K.JOIN0};`) && src.includes(`const int MAXM = ${K.MAX_MEMBERS};`));
  assert.ok(src.includes(`const int MAXS = ${K.SLOTS};`) && src.includes(`const int MAXJ = ${K.MAX_JOINS};`));
});

test('without B\'s and D\'s pieces the shader is not built (no silent stand-ins)', () => {
  assert.throws(() => vecRegionFS(K.V_FULL), /not provided/);
  assert.throws(() => vecRegionFS(99, DEPS), RangeError);
});

// ── Tier and group compositing (accN, accT): a faded network gives the group's alpha once ──
const premul = (rgb, a) => [rgb[0] * a, rgb[1] * a, rgb[2] * a, a];
test('a faded network over two overlapping vessels gives the group\'s alpha once (no double-darkening)', () => {
  const red = { grp: 1, c: premul([1, 0, 0], 1) }, blue = { grp: 1, c: premul([0, 0, 1], 1) };
  const net = 0.5;
  const alone = compositeGroups([red], net), overlap = compositeGroups([red, blue], net);
  assert.ok(Math.abs(alone[3] - net) < 1e-12);
  assert.ok(Math.abs(overlap[3] - net) < 1e-12, `overlap alpha ${overlap[3]} must equal the network's ${net}`);
  assert.deepEqual(overlap.slice(0, 3), [0, 0, 0.5], 'the front vessel shows through the fade at the group\'s alpha');
  // what the old per-vessel fade did: 0.5 each, the overlap reads 0.75 (darker where they cross)
  const perVessel = over(premul([0, 0, 1], 0.5), premul([1, 0, 0], 0.5));
  assert.ok(Math.abs(perVessel[3] - 0.75) < 1e-12);
  assert.ok(overlap[3] < perVessel[3]);
  // translucent vessels: the group is composited whole, then faded
  const half = compositeGroups([{ grp: 1, c: premul([1, 0, 0], 0.5) }, { grp: 1, c: premul([0, 0, 1], 0.5) }], net);
  assert.ok(Math.abs(half[3] - net * 0.75) < 1e-12);
});

test('the selected vessel stands out of the faded network by its own share; other groups are not faded by the network', () => {
  const net = 0.25;
  const sel = { grp: 1, c: premul([0, 1, 0], 1), wsel: 1 };
  const out = compositeGroups([{ grp: 1, c: premul([1, 0, 0], 1) }, sel], net);
  assert.ok(Math.abs(out[3] - 1) < 1e-12, 'a fully selected vessel is laid at full strength over the dimmed network');
  assert.deepEqual(out.slice(0, 3), [0, 1, 0]);
  const behind = compositeGroups([{ grp: 0, c: premul([0, 0, 1], 1) }, { grp: 1, c: premul([1, 0, 0], 1) }], net);
  assert.ok(Math.abs(behind[3] - 1) < 1e-12, 'a vessel behind the organs is under the network, not faded by it');
  assert.ok(Math.abs(behind[2] - 0.75) < 1e-12);
});

// ── Crossings and confluences: the stream shown ──
test('an unconnected crossing shows the front lumen\'s stream only', () => {
  // two vessels cross: the upper (z 2) lies over the lower (z 1); the pixel is in both lumens
  const members = [
    { sd: -1, r: 4, u: 0.5, len: 40, z: 1, own: true, joined: new Set([0]) },
    { sd: -2, r: 4, u: 0.5, len: 40, z: 2, own: true, joined: new Set([1]) },
  ];
  const ow = pixelOwner(members);
  assert.equal(ow, 1, 'the upper vessel owns the pixel although the lower is nearer its centre line');
  const streams = pixelStreams(members, ow, members[ow].joined);
  assert.deepEqual(streams, [{ member: 1, weight: 1 }], 'never a mix');
  // swap the z: the other lumen is in front
  members[0].z = 3;
  const ow2 = pixelOwner(members);
  assert.equal(ow2, 0);
  assert.deepEqual(pixelStreams(members, ow2, members[ow2].joined), [{ member: 0, weight: 1 }]);
});

test('a connected pair is not a crossing: the nearer vessel keeps the pixel and both streams contribute with weights summing to one', () => {
  const j = new Set([0, 1]);
  const members = [
    { sd: -1, r: 4, u: 0.5, len: 40, z: 1, joined: j },
    { sd: -1.2, r: 4, u: 0.5, len: 40, z: 2, joined: j },
  ];
  assert.equal(pixelOwner(members), 1, 'joined: the higher z does not take the pixel, the nearest does');
  const s = pixelStreams(members, 1, j);
  assert.equal(s.length, 2);
  assert.ok(Math.abs(s[0].weight + s[1].weight - 1) < 1e-12);
  // equal distances: the weights are equal where two lumens meet
  members[0].sd = members[1].sd = -1;
  const e = pixelStreams(members, 1, j);
  assert.ok(Math.abs(e[0].weight - 0.5) < 1e-9 && Math.abs(e[1].weight - 0.5) < 1e-9);
  // far from the second lumen: its share fades out (here it is 30 units from the owner)
  members[0].sd = 30;
  const far = pixelStreams(members, 1, j);
  assert.equal(far.length, 1, 'a lumen far from the owner contributes nothing');
});

test('the trunk\'s stream owns the pixel inside a copied trunk (tin): the tributary\'s end does not show through', () => {
  const j = new Set([0, 1]);
  const members = [
    { sd: -3, r: 6, u: 0.5, len: 40, pres: 1, tin: 1, joined: j },   // the copied trunk
    { sd: -3, r: 3, u: 1.0, len: 40, pres: 1, tin: 0, joined: j },   // the vein ending in it
  ];
  const s = pixelStreams(members, 1, j);
  assert.equal(s[0].member, 0, 'the trunk leads');
  assert.ok(s.length === 1 || s[1].weight < 0.01);
});

test('a vessel\'s second run continues its first (hairpins), through B\'s vecNearMore', () => {
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) assert.ok(vecRegionFS(variant, DEPS).includes('sn[at] = vecNearMore(sn[at], row,'));
});
