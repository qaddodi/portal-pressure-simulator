// The flow arrowheads as instanced quads (blood-heads.js, 5 Nov 2026): the instance list's sizes, and the two shader texts as the GPU
// sees them (no GL in node): one main each, the composite's own main left out of the heads' build, the per-pixel heads switched off in
// the composite while the quads draw them, and the quads placing each head as chevOne does.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { createHeadList, headKeep, headLevel, headVS, P_MIN } = await import('../src/ui/blood-heads.js');
const { CHEV_PITCH } = await import('../src/ui/chevron-glsl.js');
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
  // (In fours, so a vessel whose length wavers by a little keeps its list.)
  const four = (k) => Math.ceil(k / 4) * 4, own = (len) => four(Math.ceil(len / P_MIN) + 3);
  // (row 3 has no axis: none; row 2 is chained with B = 2: its root's heads stand P / 2 apart along it)
  assert.equal(L.count(), own(100) + own(560) + own(300) + four(Math.ceil(300 * 2 / P_MIN) + 3));
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
  assert.equal(L.count(), own(100) + own(300) + four(Math.ceil(300 * 2 / P_MIN) + 3));
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
    assert.match(s, /if \(chev == 1 && chevQuad == 0 && f1\.z > 0\.0 && !isLy\) \{\n\s*vec2 c = chevAt\(/);
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

test('the quads keep the shape and fades chevOne has, and space the heads by the screen (chevLevel, chevKeep)', () => {
  const chevOne = full.slice(full.indexOf('vec2 chevOne('), full.indexOf('vec2 chevAt('));
  for (const e of ['float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;',
    'endF = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0)));', 'smoothstep(0.85 * hw, 1.15 * hw,']) {
    assert.ok(chevOne.includes(e), `chevOne: ${e}`);
    assert.ok(vs.includes(e), `quads: ${e}`);
  }
  const fadeRe = /float fade = smoothstep\(0\.5, 3\.0, abs\(vd\)\) \* f1\.z \* texelFetch\(flow, ivec2\(3, id\), 0\)\.x \* keep \* endF \* smoothstep\(1\.3 \* pxW, 2\.4 \* pxW, R\);/;
  assert.match(vs, fadeRe);
  assert.match(chevOne, fadeRe);
  // (The spacing: one CHEV_PITCH on screen, from the run's B, with no caliber in it; one run per vessel, handed over by headRuns.)
  for (const e of ['vec2 chevLevel(', 'float chevKeep(', `${CHEV_PITCH}.0 * cssPx * pxW`, 'chevLevel(pxW, cssPx, B, stillLv)', 'chevKeep(j, n0, lvAt)',
    'if (root != (cw > 0.0)) return;', 'texelFetch(axis, ivec2(N_LAST + 1, id), 0)']) assert.ok(vs.includes(e), `quads: ${e}`);
  assert.ok(!/3\.6 \* Rsp/.test(vs), 'no caliber in the quads\' spacing');
});

test('the heads stand one CHEV_PITCH apart on screen at every zoom, caliber and run scale, and a coarser level is a subset', () => {
  // (Summed strength per CSS px along a vessel, from the lattice and its keep, over a sweep of zooms and B: within a few per cent.)
  const perPx = (pxW, B) => {
    const { lv } = headLevel(pxW, 1, B), n0 = Math.floor(lv), P = 28 * 2 ** n0;
    let sum = 0; for (let j = 1; j <= 4096; j++) sum += headKeep(j, n0, lv);
    return sum / (4096 * P / Math.abs(B) / pxW);   // heads per CSS px along the vessel (stream P / |B| per head, pxW world per px)
  };
  const want = 1 / CHEV_PITCH;
  // (Down to the finest level, 14 world units: closer than that the heads keep that spacing, which needs a zoom past the app's 6x.)
  for (let pxW = 0.15; pxW < 6; pxW *= 1.13) for (const B of [1, -1, 1.7, 3.3, 0.4]) {
    if (CHEV_PITCH * pxW * Math.abs(B) < P_MIN) continue;
    const d = perPx(pxW, B);
    assert.ok(Math.abs(d / want - 1) < 0.03, `pxW ${pxW.toFixed(2)} B ${B}: ${(d * 1000).toFixed(2)} per 1000 px`);
  }
  // (A head of the coarser lattice is a head of the finer one; the keep is continuous as the level crosses a whole number.)
  for (const j of [2, 4, 6, 12, 40]) assert.ok(Math.abs(headKeep(j, 2, 2.999) - headKeep(j / 2, 3, 3.001)) < 0.01, `head ${j} carries on`);
  assert.ok(headKeep(3, 2, 2.9999) < 0.01, 'an odd head is gone by the next level');
  assert.equal(headKeep(3, 2, 2), 1);
});
