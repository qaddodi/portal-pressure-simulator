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

const { vecRegionVS, vecRegionFS, vecRegionParts, REGION_UNIFORMS, REGION_ATTRIBS, compositeGroups, pixelOwner, pixelStreams, over,
  vecLeafRegionVS, vecLeafRegionParts, LEAF_REGION_ATTRIBS, LEAF_CLASSES, leafRegionUniforms, HIER_UNIFORMS, leafCandidates, boundHit, overflowsClass, contributionsOf } = await import('../src/ui/vec-region-glsl.js');
const K = await import('../src/ui/vec-contract.js');
const { HIER_GLSL } = await import('../src/ui/vec-hier-glsl.js');
const GL = await import('../src/ui/veins-gl.js');
const { VEC_SHADE_UNIFORMS, VEC_SHADE_UNIFORMS_LEAF } = await import('../src/ui/vec-shade-glsl.js');

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


// ══ Revision 1: one program per leaf class (vector-renderer-plan-r1.md sections 2.3 and 2.4) ═══════════════════════════════════════════

const CLASSES = [K.L_LAYERED, K.L_CROSS, K.L_JOIN, K.L_WIDE, K.L_MORPH];
const LFS = (variant, cls) => vecRegionFS(variant, cls, K_FLAGS);
const cut = (src, a, b) => src.slice(src.indexOf(a), b ? src.indexOf(b) : undefined);

test('the leaf vertex shader: the leaf\'s square from LEAF_BOX\'s row, padded by the contract\'s pixels, the leaf index flat to the fragment', () => {
  assert.deepEqual(lintGLSL(vecLeafRegionVS), []);
  assert.deepEqual([...uniformsOf(vecLeafRegionVS)].sort(), ['size', 'world']);
  assert.deepEqual(LEAF_REGION_ATTRIBS, { aC: 0, aBox: 1 });
  assert.ok(vecLeafRegionVS.includes('layout(location=1) in vec4 aBox;') && vecLeafRegionVS.includes('flat out int vLeaf;'));
  assert.ok(vecLeafRegionVS.includes(`${K.REGION_QUAD_PAD_PX.toFixed(1)} / max(length(world[0].xy)`), 'the pad is the contract\'s REGION_QUAD_PAD_PX device pixels');
  assert.ok(vecLeafRegionVS.includes('aBox.xy + (aC * 2.0 - 1.0) * pad + aC * aBox.z'));
});

for (const cls of CLASSES) {
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const name = `${LEAF_CLASSES[cls].name} variant ${variant}`;
    test(`${name}: lints, declares the hierarchy's tables and the shared host uniforms, and only those`, () => {
      const src = LFS(variant, cls);
      assert.deepEqual(lintGLSL(src), []);
      const u = uniformsOf(src);
      const want = [...leafRegionUniforms(cls).fragment, ...VEC_SHADE_UNIFORMS_LEAF];
      for (const n of ['cellTex', 'gridO', 'gridN', 'shOff']) assert.ok(!u.includes(n), `${n}: the hierarchy's own lookup and shadow offset stand in`);
      for (const n of want) assert.ok(u.includes(n), `${name}: ${n}`);
      assert.equal(u.includes('vecBase'), variant === K.V_BLOOD, 'the kept base only under the blood variant');
      assert.equal(u.includes('morphOn'), LEAF_CLASSES[cls].morph, 'the frame\'s join rows only in the morph class');
      assert.equal(u.includes('regionTex') || u.includes('reachU'), false, 'no region record, no slot admission: the leaf lists decide');
      for (const n of HIER_UNIFORMS) assert.equal(u.filter((x) => x === n).length, 1, `${n} once`);
    });
  }
}

test('the five steps run in the reviewer\'s order, and the leaf test comes first', () => {
  for (const cls of CLASSES) {
    const src = LFS(K.V_FULL, cls), main = src.slice(src.lastIndexOf('void main()'));
    const at = (t) => { const i = main.indexOf(t); assert.ok(i >= 0, `${LEAF_CLASSES[cls].name}: ${t}`); return i; };
    const order = ['vecLeafAt(p)', 'leaf != vLeaf', 'vecRunRef(L.runStart + i)', 'vecBoundHit', 'vecNearMore(sn[at]', 'vecOccl(p)', 'vecShadeBits(sid[0]', 'vesAttrs(', 'tubeShade(', 'vecBloodMix'].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${LEAF_CLASSES[cls].name}: ${order}`);
    assert.ok(!/gl_FragCoord/.test(main.slice(0, main.indexOf('vecShadeBits'))), 'the leaf test reads no pixel position of its own');
  }
  const callsMorph = (cls) => LFS(K.V_FULL, cls).slice(LFS(K.V_FULL, cls).lastIndexOf('void main()')).includes('vecBoundHitBox(R, bit, p)');
  assert.ok(callsMorph(K.L_MORPH) && !callsMorph(K.L_JOIN), 'the morph class tests the box over the stretch');
});

test('each class holds only the work it needs', () => {
  const t = (cls) => LFS(K.V_FULL, cls);
  const has = (cls, piece) => t(cls).includes(piece);
  for (const [piece, classes] of [
    ['smin(sd[a], sd[b], kk)', [K.L_JOIN, K.L_WIDE, K.L_MORPH]], ['corner(p, sg[ta]', [K.L_JOIN, K.L_WIDE, K.L_MORPH]], ['keep[s]', [K.L_JOIN, K.L_WIDE, K.L_MORPH]],
    ['tin[s]', [K.L_JOIN, K.L_WIDE, K.L_MORPH]], ['js[j] < 0.98', [K.L_JOIN, K.L_WIDE, K.L_MORPH]], ['tn[s]', [K.L_JOIN, K.L_WIDE, K.L_MORPH]],
    ['vecJoinRef(L.joinStart', [K.L_JOIN, K.L_WIDE, K.L_MORPH]],
    ['paperInk.a * clamp', [K.L_CROSS, K.L_JOIN, K.L_WIDE, K.L_MORPH]], ['sz[s] <= sz[ow]', [K.L_CROSS, K.L_JOIN, K.L_WIDE, K.L_MORPH]],
    ['JT(j)', [K.L_MORPH]],
  ]) for (const cls of CLASSES) assert.equal(has(cls, piece), classes.includes(cls), `${LEAF_CLASSES[cls].name}: ${piece}`);
  // L_LAYERED: no fillet, no ring, no crossing depth, no joins at all; the owner is the nearest; group compositing is still there
  const lay = t(K.L_LAYERED);
  for (const piece of ['accN * netAlpha', 'accT = over(c * wsel, accT)', 'vecBloodMix(2, rws, ss, yy, rr, ww, lumCol, px)']) assert.ok(lay.includes(piece), piece);
  assert.ok(!lay.includes('smin(') && !lay.includes('corner(') && !lay.includes('kcas = max'));
  // L_CROSS: the front lumen owns, the ring, and the front stream alone (the other lumen is never in the mix)
  const cross = t(K.L_CROSS);
  assert.ok(cross.includes('kcas = max(kcas') && cross.includes('int id = sid[ow];') && !cross.includes('w2 > 0.01 * w1'));
});

test('the candidate array is SLOTS in the standard programs and SLOTS_WIDE in the wide one, and the compositing\'s arrays follow it', () => {
  for (const cls of CLASSES) {
    const src = LFS(K.V_FULL, cls);
    assert.ok(src.includes(`const int MAXS = ${cls === K.L_WIDE ? K.SLOTS_WIDE : K.SLOTS};`), LEAF_CLASSES[cls].name);
    assert.ok(src.includes(`const int MAXJ = ${K.MAX_JOINS};`));
  }
  assert.equal(K.SLOTS_WIDE, 32);
  assert.ok(K.SLOTS_WIDE <= 32, 'masks are one int: a candidate\'s bit is 1 << slot');
  assert.ok(LFS(K.V_FULL, K.L_WIDE).includes('1 << s'));
});

test('a pixel that finds more survivors than its array holds is drawn magenta, never dropped (and left alone by the blood pass)', () => {
  for (const cls of CLASSES) {
    for (const variant of [K.V_FULL, K.V_BASE]) {
      const src = LFS(variant, cls);
      assert.ok(src.includes('if (n == MAXS) { overflow = true; continue; }'), 'full array: flagged, no eviction');
      assert.ok(src.includes('outColor = vec4(1.0, 0.0, 1.0, 1.0);'), `${LEAF_CLASSES[cls].name} variant ${variant}`);
      assert.ok(!/sk\[|evict|key >= /.test(src), 'no slot is ever given up to a nearer vessel');
    }
    const blood = LFS(K.V_BLOOD, cls);
    assert.ok(!blood.includes('vec4(1.0, 0.0, 1.0, 1.0)') && blood.includes('if (overflow) {'), 'the blood pass draws nothing for it');
  }
  for (const cls of [K.L_JOIN, K.L_WIDE]) assert.ok(LFS(K.V_FULL, cls).includes('if (jcov == MAXJ) { overflow = true; continue; }'), 'covering joins too');
  // the count the node replay takes (no GPU counter exists in WebGL2): more than the class\'s array
  assert.equal(overflowsClass(8, K.L_JOIN), false);
  assert.equal(overflowsClass(9, K.L_JOIN), true);
  assert.equal(overflowsClass(32, K.L_WIDE), false);
  assert.equal(overflowsClass(33, K.L_WIDE), true);
});

test('each candidate is shaded only for the contributions it survived', () => {
  for (const cls of CLASSES) {
    const src = LFS(K.V_FULL, cls);
    assert.ok(src.includes(`(sbits[s] & ${K.C_GLOW}) == 0) continue;`), 'a glow only for a candidate whose glow bound reaches the pixel');
    assert.ok(src.includes('(sbits[s] & SHAPE_BITS) != 0') && src.includes(`const int SHAPE_BITS = ${K.C_LUMEN | K.C_SHADOW | K.C_RING | K.C_JOIN};`), 'the tier\'s shape from lumen, shadow, ring and join survivors');
  }
  assert.ok(!FS(K.V_FULL).includes('sbits'), 'the current program is unchanged');
  assert.deepEqual(contributionsOf(K.C_GLOW), { shape: false, glow: true });
  assert.deepEqual(contributionsOf(K.C_GLOW | K.C_LUMEN), { shape: true, glow: true });
  assert.deepEqual(contributionsOf(K.C_SHADOW), { shape: true, glow: false });
  assert.deepEqual(contributionsOf(K.C_JOIN), { shape: true, glow: false });
});

test('a pixel one candidate reaches is B\'s and D\'s functions unchanged, as the strip draws it; groups composite whole in every class', () => {
  for (const cls of CLASSES) for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) {
    const src = LFS(variant, cls);
    assert.ok(/vecShadeBits\(sid\[0\], sn\[0\], p, occl, sbits\[0\], lum, lumCol\)/.test(src), 'B\'s shade for the contributions the lone candidate survived (all of them: vecShadeOne)');
    assert.equal(/vecStreamAt\(sid\[0\], sn\[0\]\)/.test(src), variant !== K.V_BASE, 'the stream is read where blood is laid');
    assert.ok(/vec4 o = over\(accT, over\(accN \* netAlpha, accB\)\);/.test(src), 'the network\'s alpha is applied once, to the whole group');
  }
  // the blood is laid the very same way in the leaf programs and the current program
  const blood = (src) => src.slice(src.indexOf('vec3 lumCol = o.a > 0.01'));
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) assert.equal(blood(LFS(variant, K.L_JOIN)).trim(), blood(FS(variant)).trim());
});

test('the leaf programs share the tier loop with the current program: the join classes are the same text as the current program\'s tiers', () => {
  const tiers = (src) => cut(src, '  // ── Tiers, back to front ──');
  assert.equal(tiers(LFS(K.V_FULL, K.L_JOIN)).replace(/\s+/g, ' ').replace(/ && \(sbits\[s\] & SHAPE_BITS\) != 0/, '').replace(/ \|\| \(sbits\[s\] & \d+\) == 0/, ''),
    tiers(FS(K.V_FULL)).replace(/\s+/g, ' '));
});

test('the programs of the classes are told apart for the renderer core: parts, uniforms, attributes', () => {
  const parts = vecLeafRegionParts(K_FLAGS);
  assert.equal(parts.vs, vecLeafRegionVS);
  assert.deepEqual(parts.classes.sort(), [...CLASSES].sort());
  assert.equal(parts.fs(K.V_FULL, K.L_JOIN), LFS(K.V_FULL, K.L_JOIN));
  assert.throws(() => vecRegionFS(K.V_FULL, 99, K_FLAGS), RangeError);
  assert.throws(() => vecRegionFS(K.V_FULL, K.L_SINGLE, K_FLAGS), RangeError, 'L_SINGLE is the strip\'s');
  assert.throws(() => vecRegionFS(99, K.L_JOIN, K_FLAGS), RangeError);
  assert.throws(() => leafRegionUniforms(K.L_SINGLE), RangeError);
  assert.deepEqual(leafRegionUniforms(K.L_MORPH).fragment.slice(-2), ['morphOn', 'joinBase']);
  assert.deepEqual(leafRegionUniforms(K.L_JOIN, ['kTex']).fragment, ['kTex']);
  assert.deepEqual(HIER_UNIFORMS.filter((n) => !uniformsOf(LFS(K.V_FULL, K.L_JOIN)).includes(n)), []);
});

test('the current program still builds beside the leaf programs (until the switch-over)', () => {
  for (const variant of [K.V_FULL, K.V_BASE, K.V_BLOOD]) { assert.deepEqual(lintGLSL(FS(variant)), []); assert.ok(FS(variant).includes('regionTex')); }
});

test('the leaf lookup is K\'s text, declared once, and this file\'s program redeclares none of it', () => {
  const src = LFS(K.V_FULL, K.L_JOIN);
  for (const f of ['int vecLeafAt(vec2 world)', 'VecLeaf vecLeafRead(int leaf)', 'uint vecRunRef(int i)', 'VecRun vecRunRead(int runId)', 'bool vecBoundHit(VecRun run', 'bool vecBoundHitBox(VecRun run', 'VecJoin vecJoinRead(int j)'])
    assert.equal(src.split(f).length - 1, 1, f);
  for (const n of HIER_UNIFORMS) assert.equal(uniformsOf(src).filter((x) => x === n).length, 1, n);
  assert.ok(src.includes(HIER_GLSL), 'K\'s whole text');
  const own = vecRegionFS(K.V_FULL, K.L_LAYERED, K_FLAGS, { hier: '' });
  assert.ok(!own.includes('vecLeafAt(vec2 world)'), 'parts.hier replaces it whole');
});

// ── JS mirror: the candidates of a leaf ──

test('leafCandidates: a run survives by the bound of each contribution its bits list, the shadow\'s at p − shOff; a join\'s required run survives where the join covers', () => {
  const run = (row, chord, radii, bits) => ({ row, chord, radii, bits });
  const leaf = {
    refs: [
      run(1, [0, 0, 4, 0], [2, 0, 0, 0], K.C_LUMEN),                       // lumen only
      run(2, [0, 10, 4, 10], [2, 5, 8, 0], K.C_LUMEN | K.C_SHADOW | K.C_GLOW),   // shadow and glow, bigger
      run(3, [20, 0, 24, 0], [1, 0, 0, 0], K.C_JOIN),                      // required for a join only
      run(1, [30, 0, 34, 0], [2, 0, 0, 0], K.C_LUMEN),                     // a second run of vessel 1
    ],
    joins: [{ c: [22, 0], reach: 5, rows: [3, 1] }],
  };
  assert.deepEqual(leafCandidates(leaf, [2, 1.5]).cands.map((c) => [c.row, c.bits]), [[1, K.C_LUMEN]]);
  assert.deepEqual(leafCandidates(leaf, [2, 6]).cands.map((c) => [c.row, c.bits]), [[2, K.C_SHADOW | K.C_GLOW]], 'the shadow and the glow reach, the lumen does not');
  assert.deepEqual(leafCandidates(leaf, [2, 3]).cands.map((c) => [c.row, c.bits]), [[2, K.C_GLOW]], 'only the glow reaches from there: it adds only its glow');
  assert.deepEqual(leafCandidates(leaf, [2, 8.5]).cands.map((c) => [c.row, c.bits]), [[2, K.C_LUMEN | K.C_SHADOW | K.C_GLOW]]);
  assert.deepEqual(leafCandidates(leaf, [2, -9]).cands, [], 'nothing reaches');
  const j = leafCandidates(leaf, [22, 0]);
  assert.deepEqual(j.joins, [0]);
  assert.deepEqual(j.cands.map((c) => [c.row, c.bits]), [[3, K.C_JOIN]], 'the required member is a candidate where the disc covers (vessel 1\'s runs are not near)');
  assert.deepEqual(leafCandidates(leaf, [40, 0]).cands, [], 'out of every disc: the join run does not survive');
  // two runs of one vessel are one candidate
  const two = leafCandidates(leaf, [17, 0], 8, [0, 0], (r, bit, p) => r.row === 1 || boundHit(r, bit, p));
  assert.equal(two.cands.filter((c) => c.row === 1).length, 1);
  assert.deepEqual(two.cands.find((c) => c.row === 1).runs, [0, 3]);
  // the shadow bound moves with the offset
  assert.equal(boundHit(run(9, [0, 0, 4, 0], [0, 2, 0, 0]), K.C_SHADOW, [2, 3.5], [0, 2]), true);
  assert.equal(boundHit(run(9, [0, 0, 4, 0], [0, 2, 0, 0]), K.C_SHADOW, [2, 3.5], [0, 0]), false);
});

test('leafCandidates flags an overflow and drops nothing', () => {
  const refs = Array.from({ length: 12 }, (_, i) => ({ row: i, chord: [0, 0, 1, 0], radii: [5, 0, 0, 0], bits: K.C_LUMEN }));
  const r8 = leafCandidates({ refs }, [0.5, 0], K.SLOTS);
  assert.equal(r8.cands.length, 12, 'every candidate kept');
  assert.equal(r8.overflow, true);
  assert.equal(leafCandidates({ refs }, [0.5, 0], K.SLOTS_WIDE).overflow, false);
  assert.equal(leafCandidates({ refs: refs.slice(0, 8) }, [0.5, 0], K.SLOTS).overflow, false);
  const joins = Array.from({ length: K.MAX_JOINS + 1 }, () => ({ c: [0, 0], reach: 3, rows: [0, 1] }));
  assert.equal(leafCandidates({ refs: [], joins }, [0, 0]).overflow, true, 'more covering joins than the array holds');
});
