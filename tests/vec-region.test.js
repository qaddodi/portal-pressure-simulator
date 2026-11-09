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

const { vecRegionVS, vecRegionFS, vecRegionParts, REGION_UNIFORMS, REGION_ATTRIBS, compositeGroups, pixelOwner, pixelStreams, over } = await import('../src/ui/vec-region-glsl.js');
const K = await import('../src/ui/vec-contract.js');
const GL = await import('../src/ui/veins-gl.js');
const { VEC_SHADE_UNIFORMS } = await import('../src/ui/vec-shade-glsl.js');

// The flags the renderer passes (veins-gl.js owns them), and stand-ins for D's blood library and G's overlays with their agreed signatures.
const K_FLAGS = {
  F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE,
  F_SEL: GL.F_SEL, F_DOTTED: GL.F_DOTTED, F_NOCASE: GL.F_NOCASE, VEIL_K: GL.VEIL_K,
};
const FS = (variant) => vecRegionFS(variant, K_FLAGS);

test('the region vertex shader lints and reads only its own uniforms', () => {
  assert.deepEqual(lintGLSL(vecRegionVS), []);
  assert.deepEqual([...uniformsOf(vecRegionVS)].sort(), [...REGION_UNIFORMS.vertex].sort());
  assert.ok(vecRegionVS.includes('vCell') && vecRegionVS.includes('aCell'), 'the quad carries its cell');
  assert.deepEqual(REGION_ATTRIBS, { aC: 0, aCell: 1 });
});

for (const [name, variant] of [['FULL', K.V_FULL], ['BASE', K.V_BASE], ['BLOOD', K.V_BLOOD]]) {
  test(`the region fragment shader (${name}) lints and declares the uniforms E sets`, () => {
    const src = FS(variant);
    assert.deepEqual(lintGLSL(src), []);
    const u = uniformsOf(src);
    for (const n of [...REGION_UNIFORMS.fragment, ...VEC_SHADE_UNIFORMS]) assert.ok(u.includes(n), `${name}: ${n}`);
    assert.equal(u.includes('vecBase'), variant === K.V_BLOOD, `${name}: the kept base only under the blood variant`);
    assert.equal(u.filter((n) => n === 'reachU').length, 1);
    assert.equal(u.filter((n) => n === 'regionTex').length, 1);
  });
}

test('the partition: the cell test is B\'s one formula, and the draw is limited to the quad\'s own region', () => {
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const src = FS(variant);
    assert.ok(/vec2 p = vecWorld\(\);/.test(src) && /uvec4 ct = vecCellAt\(p\);/.test(src), 'the region shader asks the shared cell test, it has no formula of its own');
    assert.ok(!/gl_FragCoord/.test(src.split('void main()')[1].split('vecShadeOne')[0]), 'and reads no pixel position before it');
    assert.ok(new RegExp(`int\\(ct\\.r\\) != ${K.CELL_REGION} \\|\\| int\\(own\\.r\\) != ${K.CELL_REGION} \\|\\| ct\\.g != own\\.g`).test(src), 'drawn only where the cell is this quad\'s own region');
  }
  // the vertex shader draws the cell's exact square
  assert.ok(/gridO \+ \(aCell \+ aC\) \* 16\.0/.test(vecRegionVS));
});

test('a pixel one member reaches calls the stretch shader\'s functions and the blood library\'s, unchanged', () => {
  const full = FS(K.V_FULL);
  assert.ok(/vecShadeOne\(sid\[0\], sn\[0\], p, occl, lum, lumCol\)/.test(full));
  assert.ok(/vecBlood\(sid\[0\], st\.x, st\.y, st\.z, lumCol, px\)/.test(full) && /vecStreamAt\(sid\[0\], sn\[0\]\)/.test(full));
  const base = FS(K.V_BASE);
  assert.ok(/vecShadeOne\(/.test(base) && !/vecBlood/.test(base), 'BASE lays no blood');
  const bl = FS(K.V_BLOOD);
  assert.ok(/vecAboveAt\(p\)/.test(bl) && /vecBase/.test(bl), 'BLOOD reads the kept base and lays what lies over the blood');
});

test('the region shader ports the classic join code: fillet, trunk and fork, run-on, cross-tier copy, crossing ring, groups', () => {
  const src = FS(K.V_FULL);
  for (const piece of ['smin(sd[a], sd[b], kk)', 'corner(p, sg[ta]', 'tn[s]', 'js[j] < 0.98', 'keep[s]', 'tin[s]', 'paperInk.a', 'kcas', 'accN * netAlpha', 'accT = over(c * wsel, accT)',
    'vecBloodMix(2, rws, ss, yy, rr, ww, lumCol, px)']) assert.ok(src.includes(piece), piece);
  // joins are read from the region record by the contract's layout
  assert.ok(src.includes(`RG(rg, JOIN0 + 2 * k)`) && src.includes(`const int JOIN0 = ${K.JOIN0};`) && src.includes(`const int MAXM = ${K.MAX_MEMBERS};`));
  assert.ok(src.includes(`const int MAXS = ${K.SLOTS};`) && src.includes(`const int MAXJ = ${K.MAX_JOINS};`));
});

test('the renderer core\'s parts.region: the vertex shader, and the fragment shader of any variant', () => {
  assert.throws(() => vecRegionFS(99, K_FLAGS), RangeError);
  const parts = vecRegionParts(K_FLAGS);
  assert.equal(parts.vs, vecRegionVS);
  assert.equal(parts.fs(K.V_BASE), FS(K.V_BASE));
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
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) assert.ok(FS(variant).includes('sn[at] = vecNearMore(sn[at], row,'));
});

test('a pixel one vessel reaches is laid exactly as the stretch shader lays it (the edge between a stretch and a region has no seam)', async () => {
  const { vecStretchFS } = await import('../src/ui/vec-stretch-glsl.js');
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const region = FS(variant), stretch = vecStretchFS(variant, K_FLAGS);
    const norm = (s) => s.replace(/\s+/g, ' ');
    // the lines both programs write after the vessel's own colour: the blood's visibility, its laying, the base, the over-blood overlays, the dither
    const lines = [
      'float vis = clamp(lum / max(o.a, 1e-3), 0.0, 1.0);',
      'vec3 lit = bl.rgb * vis + lumCol * (1.0 - bl.a * vis);',
      'vec4 b = texelFetch(vecBase, ivec2(gl_FragCoord.xy), 0);',
      'vec4 r = vec4(b.rgb + o.a * (lit - lumCol), b.a);',
      'r = vec4(min(max(r.rgb, vec3(0.0)), vec3(r.a)), r.a);',
      'outColor = over(vecAboveAt(p), r);',
      'o = vec4(lit * o.a, o.a);',
      'outColor = ditherOut(o, gl_FragCoord.xy);',
    ];
    for (const l of lines) assert.equal(norm(region).includes(l), norm(stretch).includes(l), `variant ${variant}: ${l}`);
    assert.ok(norm(region).includes('vecShadeOne(sid[0], sn[0], p, occl, lum, lumCol)') && norm(stretch).includes('vecShadeOne(vRow, nr, p, vecOccl(p), lum, lumCol)'));
  }
});

test('the join record is read as the contract lays it out (mask in two halves, trunk plus the fork bit, fillet), with the contract\'s constants', () => {
  const src = FS(K.V_FULL);
  assert.ok(src.includes('int mlo = int(B.x + 0.5), mhi = int(B.z + 0.5)') && src.includes('m < MASK_SPLIT ? (mlo & (1 << m)) : (mhi & (1 << (m - MASK_SPLIT)))') && src.includes(`const int MASK_SPLIT = ${K.MASK_SPLIT};`));
  assert.ok(src.includes('int tmi = int(B.y + 0.5) & (FORK_BIT - 1);') && src.includes(`const int FORK_BIT = ${K.FORK_BIT};`));
  assert.ok(src.includes('js[jn] = clamp(B.w, 0.0, 1.0);'));
  assert.ok(src.includes(`const int MAXM = ${K.MAX_MEMBERS};`) && K.MAX_MEMBERS <= 2 * K.MASK_SPLIT, 'a mask in two whole-number halves');
  assert.ok(K.JOIN0 + 2 * K.MAX_JOINS <= K.REGION_TEXELS, 'the joins fit the region row');
});

test('every uniform the region programs declare is one the renderer core sets', async () => {
  const R = await import('../src/ui/vec-renderer.js');
  const { VEC_BLOOD_UNIFORMS } = await import('../src/ui/vec-blood-glsl.js');
  const known = new Set([...Object.keys(R.VEC_OWN_UNIFORMS), ...Object.values(R.LOOK_UNIFORMS), ...Object.values(R.BLOOD_UNIFORMS), ...VEC_BLOOD_UNIFORMS.map((u) => u.name ?? u),
    ...VEC_SHADE_UNIFORMS, 'pxW', 'fluidMask', 'fluidRect', 'fluidS', 'fluidInk', 'fluidLv']);
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const unknown = uniformsOf(FS(variant)).filter((n) => !known.has(n));
    assert.deepEqual(unknown, [], `variant ${variant}: uniforms nothing sets`);
  }
  assert.deepEqual(uniformsOf(vecRegionVS).filter((n) => !(n in R.VEC_OWN_UNIFORMS)), []);
});

test('a morph region reads its joins from the frame\'s join rows, as classic does between the views', () => {
  const src = FS(K.V_FULL);
  assert.ok(src.includes('vec4 F = JT(int(A.x + 0.5)); A = vec4(F.xy, floor(F.w) * 0.01, F.z); B.w = fract(F.w) / 0.99;'));
  assert.ok(src.includes(`(int(r0.x + 0.5) & ${K.K_MORPH}) != 0`) && src.includes('morphOn >= 1'));
  // the packing of an entry's blend width and fillet (veins-bin.js writeJoin): round(k · 100) + 0.99 · fillet
  for (const [k, fil] of [[0, 1], [3.5, 0], [12.25, 0.5], [7, 0.99]]) {
    const w = Math.round(k * 100) + 0.99 * fil;
    assert.ok(Math.abs(Math.floor(w) * 0.01 - Math.round(k * 100) * 0.01) < 1e-9);
    assert.ok(Math.abs(w % 1 / 0.99 - fil) < 1e-9 || fil === 1);
  }
});
