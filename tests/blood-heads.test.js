// The flow arrowheads as instanced quads (blood-heads.js, 5 Nov 2026): the instance list's sizes, and the two shader texts as the GPU
// sees them (no GL in node): one main each, the composite's own main left out of the heads' build, the per-pixel heads switched off in
// the composite while the quads draw them, and the quads placing each head as chevOne does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { createHeadList, headVS, P_MIN } = await import('../src/ui/blood-heads.js');
const { COMP_FS, FLOW_TEXELS, TUBE_TEXELS } = await import('../src/ui/veins-gl.js');

const ROW_W = TUBE_TEXELS * 4, STRIDE = FLOW_TEXELS * 4;
function rows(n, lens, chain = {}) {
  const tube = new Float32Array(n * ROW_W), flow = new Float32Array(n * STRIDE);
  lens.forEach((L, r) => { tube[r * ROW_W + 22] = L; });
  for (const [r, [B, w]] of Object.entries(chain)) { flow[r * STRIDE + 18] = B; flow[r * STRIDE + 19] = w; }
  return { tube, flow };
}

test('each vessel with an axis and blood gets enough heads for its length; a chained one its root run too', () => {
  const n = 4, L = createHeadList(n);
  const { tube, flow } = rows(n, [100, 560, 300, 50], { 2: [2, 1] });
  const has = Uint8Array.from([1, 1, 1, 0]), blood = Uint8Array.from([1, 1, 1, 1]);
  assert.equal(L.update(has, blood, tube, ROW_W, flow, STRIDE), true);
  const own = (len) => Math.ceil(len / P_MIN) + 3;
  // (row 3 has no axis: none; row 2 is chained with B = 2: its root's heads stand P / 2 apart along it)
  assert.equal(L.count(), own(100) + own(560) + own(300) + (Math.ceil(300 * 2 / P_MIN) + 3));
  const d = L.data();
  for (let i = 0; i < L.count(); i++) {
    assert.ok(d[i * 3] >= 0 && d[i * 3] < 3, 'a row with an axis');
    assert.ok(d[i * 3 + 2] === 0 || d[i * 3 + 2] === 1, 'its run');
  }
  // Nothing changed: no new list.
  assert.equal(L.update(has, blood, tube, ROW_W, flow, STRIDE), false);
  // A row that stops carrying blood leaves the list.
  blood[1] = 0;
  assert.equal(L.update(has, blood, tube, ROW_W, flow, STRIDE), true);
  assert.equal(L.count(), own(100) + own(300) + (Math.ceil(300 * 2 / P_MIN) + 3));
});

test('a run of k = 0 … ceil(len / P) + 2 from one spacing before the start covers the vessel and the heads just past it', () => {
  // The vertex shader's placement, here in JS: heads at se = Dm + j P, j from ceil((min(A, A + B len) − P − Dm) / P).
  for (const [len, P, Dm, A, B] of [[300, 56, 17, 0, 1], [300, 112, 5000, 0, 1], [130, 56, 33.3, 40, 2], [210, 56, 9, 400, -1.5]]) {
    const k = Math.ceil(len * Math.abs(B) / P_MIN) + 3;
    const j0 = Math.ceil((Math.min(A, A + B * len) - P - Dm) / P);
    const sc = Array.from({ length: k }, (_, i) => (Dm + (j0 + i) * P - A) / B).sort((a, b) => a - b);
    assert.ok(sc[0] <= 0, `${len}/${P}: a head at or before the start`);
    assert.ok(sc[sc.length - 1] >= len, `${len}/${P}: a head at or past the end`);
    for (let i = 1; i < sc.length; i++) assert.ok(Math.abs(sc[i] - sc[i - 1] - P / Math.abs(B)) < 1e-6, 'evenly spaced');
  }
});

const heads = COMP_FS(false, false, true), full = COMP_FS(), plain = COMP_FS(true);
const vs = headVS({ zoom: 'uniform float pxW; void zoomOut() {}', along: '', rows: '', orange: '', nSamples: 64 });

test('the heads\' build is the composite\'s text with its own main, and the composite leaves the heads to the quads', () => {
  assert.equal((heads.match(/\bvoid main\(\)/g) || []).length, 2, 'the composite\'s main and the quads\' main');
  assert.match(heads, /#if 0[^\n]*\nvoid main\(\) \{\n#if STREAK/, 'the composite\'s own main left out');
  assert.match(heads, /#endif\n\nflat in vec4 hC;/);
  for (const s of [full, plain]) {
    assert.equal((s.match(/\bvoid main\(\)/g) || []).length, 1);
    assert.doesNotMatch(s, /flat in vec4 hC;/);
    assert.match(s, /uniform int chevQuad;/);
    assert.match(s, /if \(chev == 1 && chevQuad == 0 && f1\.z > 0\.0\) \{\n\s*vec2 c = chevAt\(/);
  }
});

test('the quads lay a head only where the composite drew the pixel again, on its own lumen, under the fluid and the outlines', () => {
  const m = heads.slice(heads.indexOf('flat in vec4 hC;'));
  assert.match(m, /if \(g\.x == 0u\) discard;/);
  assert.match(m, new RegExp(`if \\(stillOn == 1 && texelFetch\\(flow, ivec2\\(${FLOW_TEXELS}, id1\\), 0\\)\\.x == 0\\.0 && \\(!two \\|\\| texelFetch\\(flow, ivec2\\(${FLOW_TEXELS}, id2\\), 0\\)\\.x == 0\\.0\\)\\) discard;`));
  assert.match(m, /if \(hid != id1 && \(hid != id2 \|\| b <= 0\.004\)\) discard;/);
  assert.ok(m.indexOf('noChev[i]') > 0 && m.indexOf('chevHole[i]') > 0, 'the cut-outs');
  assert.ok(m.indexOf('fluidAt(w)') > m.indexOf('over(vec4(hInk * ac, ac), vec4(hRim * ar, ar))'), 'the head, then through the fluid');
  assert.match(m, /if \(lineOn == 1\) \{ vec4 Ln = texelFetch\(lineL, ip, 0\);/);
});

test('the quads place each head as chevOne does: the same spacing, fades and run through a chained end', () => {
  const chevOne = full.slice(full.indexOf('vec2 chevOne('), full.indexOf('vec2 chevAt('));
  for (const e of ['float lv = max(0.0, log2(max(3.6 * Rsp, 60.0 * pxW) / 28.0));', 'if (still == 1) lv = max(lv, texelFetch(flow, ivec2(3, id), 0).y);',
    'lv += 1.3219281;', 'float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;',
    'float lo = 0.6 * L, ramp = max(2.0 * L, 0.3 * Pc), endF;', 'endF = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0)));',
    'smoothstep(0.85 * hw, 1.15 * hw,']) {
    assert.ok(chevOne.includes(e), `chevOne: ${e}`);
    assert.ok(vs.includes(e), `quads: ${e}`);
  }
  assert.match(vs, /float fade = smoothstep\(0\.5, 3\.0, abs\(vd\)\) \* f1\.z \* texelFetch\(flow, ivec2\(3, id\), 0\)\.x \* keep \* endF \* smoothstep\(1\.3 \* pxW, 2\.4 \* pxW, R\);/);
  assert.match(chevOne, /float fade = smoothstep\(0\.5, 3\.0, abs\(vd\)\) \* f1\.z \* texelFetch\(flow, ivec2\(3, id\), 0\)\.x \* keep \* endF \* smoothstep\(1\.3 \* pxW, 2\.4 \* pxW, R\);/);
});

test('the renderer draws the heads after the picture, again in a catheter box, and keeps still lumens only when that is exact', () => {
  const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  const comp = src.slice(src.indexOf('    composite(look, blood = NOBLOOD, full = false, part = 0) {'));
  assert.match(comp, /if \(headP && blood\.chev && !bleeding && axisN > 0\) \{/);
  assert.match(comp, /const stillUse = still && !\(quads && \(part \|\| dirt \|\| pool \|\| \(fl\?\.ripple && nFluid\) \|\| cathRect\)\);/);
  assert.ok(comp.indexOf('if (quads) drawHeads(m, layer, glow, warm, useStack, stillUse);') > comp.indexOf('UC.i1(U.bloodOnly, 1);'));
  assert.ok(comp.indexOf('if (quads) drawHeads(m, false, glow, warm, useStack, false);') < comp.indexOf("gpuProbe.time(gl, 'catheter', cathT);"));
  // The lobule is given no axes: its renderer keeps the composite's heads.
  assert.match(src, /heads: who === 'stage' \?/);
});
