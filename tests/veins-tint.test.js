import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitRows, TINT_FLOATS } from '../src/ui/veins-bin.js';

// Shape apart from colour in the vessel layer (veins-gl.js): a change of some vessels' lumen colours alone (the pulse,
// the lymph's tint) no longer draws their cells again whole. Beside each pixel's colour the vessel shader marks whether
// any lumen colour reaches it; a colour-only change draws again, with the same shader, only the pixels so marked in the
// cells that list those vessels (tintPass). Every other pixel's colour depends on no lumen colour, so the layer ends as a
// whole draw leaves it. (The pixel-for-pixel comparison against a whole draw runs on CI: tests/e2e/veins-rows.mjs.)

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const W = 52;   // floats per vessel row (TUBE_TEXELS × 4)

test('a row whose lumen colours alone changed is recoloured; any other change draws it again', () => {
  assert.deepEqual(TINT_FLOATS, [0, 1, 2, 4, 5, 6], 'texel 0 and 1, rgb: the colour at the start and at the end');
  const drawn = new Float32Array(6 * W).map((_, i) => (i % 7) / 10);
  const now = drawn.slice();
  now[1 * W + 0] += 0.1; now[1 * W + 6] += 0.1;   // row 1: both colours
  now[2 * W + 3] += 1;                             // row 2: casing width
  now[3 * W + 7] = 0.55;                           // row 3: alpha
  now[4 * W + 2] += 0.05; now[4 * W + 39] = 0.7;   // row 4: a colour and its hover
  now[5 * W + 5] += 0.2;                           // row 5: a colour, but its radii changed too
  const r = splitRows([0, 1, 2, 3, 4, 5], now, drawn, W, new Set([5]));
  assert.deepEqual(r.tint, [1]);
  assert.deepEqual(r.shape, [2, 3, 4, 5]);
  // Row 0 did not change: drawn neither way. Nothing known of the drawn layer: every row is drawn whole.
  assert.deepEqual(splitRows([0, 1], now, null, W), { shape: [0, 1], tint: [] });
});

test('the lymph tint and the pulse, as the lobule sends them, are colour-only changes', () => {
  // The lobule's row (lobule-zoom.js drawGL): c0, wall, c1, alpha | tier, z, flags, 0 | … | 0, 1, length, 0 (texel 5).
  const row = (c0, c1, alpha = 1) => { const a = new Float32Array(W); a.set([...c0, 1.2, ...c1, alpha, 1, 0.13, 6, 0]); a.set([0, 1, 180, 0], 20); return a; };
  const rows = 63, drawn = new Float32Array(rows * W), now = new Float32Array(rows * W);
  for (let i = 0; i < rows; i++) { drawn.set(row([0.85, 0.92, 0.8], [0.85, 0.92, 0.8]), i * W); now.set(row([0.8, 0.9, 0.74], [0.8, 0.9, 0.74]), i * W); }
  const all = Array.from({ length: rows }, (_, i) => i);
  assert.deepEqual(splitRows(all, now, drawn, W), { shape: [], tint: all });
  // A vessel faded by a selection elsewhere is not colour-only.
  now.set(row([0.8, 0.9, 0.74], [0.8, 0.9, 0.74], 0.55), 7 * W);
  assert.deepEqual(splitRows(all, now, drawn, W).shape, [7]);
});

test('the vessel shader marks the pixels a lumen colour reaches, and a colour-only pass draws only those', () => {
  // (The vessel shader's text with the shading it shares with the mesh passes, veins-mesh-glsl.js, which it takes in whole.)
  const fs = vg.slice(vg.indexOf('export const vesselFS = (simple, mesh = 0, tube = 0) => `'), vg.indexOf('// ── Composite')) + readFileSync(new URL('../src/ui/veins-mesh-glsl.js', import.meta.url), 'utf8');
  // The pass returns before any vessel is looked up, for a pixel no lumen colour reaches.
  const skip = fs.indexOf('if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;');
  assert.ok(skip > 0 && skip < fs.indexOf('// ── Nearest point of each vessel in this cell ──'));
  // Every way a lumen colour (scol) reaches the picture marks the pixel: the lumen (aL > 0) and a glow in its own colour.
  const uses = fs.split('\n').filter((l) => /\bscol\[s\]/.test(l) && !/scol\[s\] = /.test(l) && !/^\s*\/\//.test(l));
  assert.equal(uses.length, 3, 'scol reaches the picture through the glow (twice) and the lumen colour only');
  // (lines that set lum from itself, the inks and the hover, aside: what leaves it)
  const lumUses = fs.split('\n').filter((l) => /\blum\b/.test(l) && !/^\s*\/\//.test(l) && !/\blum = /.test(l));
  assert.deepEqual(lumUses.map((l) => l.trim()), ['c = over(vec4(lum, 1.0) * aL, c);'], 'the lumen colour enters the picture through aL alone');
  // Every pixel written writes the mark.
  assert.equal((fs.match(/outFlow2 = uvec4\(0u\); outDep = vec4\(0\.0\); return;/g) || []).length, 3);
  assert.equal((fs.match(/outFlow2 = uvec4\(0u\); return;/g) || []).length, 0);
});

// ── The renderer driven on a recording stand-in for WebGL2: what it draws, and where ──
function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const UNIFORMS = ['tint', 'redraw', 'depL', 'world', 'lWrap'];
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, k.startsWith('COLOR_ATTACHMENT') ? 0x8ce0 + +k.slice(16) : 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter' || k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? UNIFORMS.length : true;
        if (k === 'getActiveUniform') return { name: UNIFORMS[a[1]] };
        if (k === 'getUniformLocation') return { uniform: a[1] };
        if (k === 'checkFramebufferStatus') return gl.FRAMEBUFFER_COMPLETE;   // (the Tube's targets are made: no other renderer to fall back on)
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}

async function scene(url = '../src/ui/veins-gl.js') {
  const { createVeinsGL, binVeins, N_SAMPLES, TUBE_TEXELS, MAX_TIERS } = await import(url);
  const { gl, calls } = fakeGL();
  const canvas = { width: 960, height: 640, getContext: () => gl, addEventListener() {}, removeEventListener() {} };
  const ROWS = 6;
  const g = createVeinsGL(canvas, { tubes: ROWS, force: true });
  const line = (x0, y0, x1, y1) => Array.from({ length: N_SAMPLES }, (_, i) => { const t = i / (N_SAMPLES - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; });
  const V = [line(40, 320, 600, 320), line(600, 320, 920, 120), line(600, 320, 920, 560), line(240, 40, 400, 600), line(80, 80, 880, 600), line(120, 580, 520, 60)];
  g.setGeometry(binVeins(V.map((pts, id) => ({ id, pts, reach: 30 })), [{ x: 600, y: 320, reach: 40, k: 12, fillet: 1, members: [0, 1, 2] }]));
  V.forEach((_, i) => g.setRadii(i, Array(N_SAMPLES).fill(8)));
  const data = new Float32Array(ROWS * TUBE_TEXELS * 4);
  const put = (i, c, alpha = 1) => { const o = i * TUBE_TEXELS * 4; data.set([...c, 3, ...c, alpha, 1, 0.1 * i, 6, 0], o); data.set([0, 1, 500, 0], o + 20); };
  V.forEach((_, i) => put(i, [0.2 + 0.1 * i, 0.4, 0.8]));
  g.setTubes(data);
  const look = {
    shOff: [1.4, 2.8], light: [-0.6, -0.8], reach: 11, heat: false, organs: 0, casing: [0.1, 0.1, 0.15, 0.56], shadow: [0, 0, 0, 0.15],
    sheen: [1, 1, 1, 0.42], shade: [0.1, 0.1, 0.2, 0.2], ring: [0.2, 0.5, 1, 0.34], netAlpha: 1, fx: true,
    tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),
  };
  const m = [1, 0, 0, 1, 0, 0];
  g.draw(m, look, { on: false });
  return { g, gl, calls, data, put, look, m };
}
// The vessel passes since `from`: { tint, count, fbo, prog } per instanced draw of a vessel program (the general one or the
// one-vessel build: each takes the `tint` uniform).
function passes(calls, gl, from) {
  const out = [], vessel = new Set();
  let tint = 0, fbo = null, prog = null;
  for (const c of calls.slice(from)) {
    if (c[0] === 'useProgram') prog = c[1];
    if (c[0] === 'uniform1i' && c[1]?.uniform === 'tint') { tint = c[2]; vessel.add(prog); }
    if (c[0] === 'bindFramebuffer' && c[1] === gl.FRAMEBUFFER) fbo = c[2];
    if (c[0] === 'drawArraysInstanced' && vessel.has(prog)) out.push({ tint, count: c[4], fbo, prog });
  }
  return out;
}

test('any other change, or new radii, still draws the cells again whole', async () => {
  const { g, gl, calls, data, put, look, m } = await scene();
  put(3, [0.5, 0.4, 0.8], 0.55);   // faded (a selection elsewhere)
  g.setTubes(data);
  let p0 = g.partCells, t0 = g.tintCells, n0 = calls.length;
  assert.equal(g.drawRows(m, look, { on: false }, [3]), true);
  assert.ok(g.partCells - p0 > 0);
  assert.equal(g.tintCells - t0, 0);
  assert.ok(passes(calls, gl, n0).every((p) => p.tint === 0));
  // New radii and a new colour for the same vessel: drawn whole.
  put(4, [0.1, 0.1, 0.1]);
  g.setTubes(data);
  g.setRadii(4, Array(64).fill(10));
  p0 = g.partCells; t0 = g.tintCells;
  assert.equal(g.drawRows(m, look, { on: false }, [4]), true);
  assert.ok(g.partCells - p0 > 0);
  assert.equal(g.tintCells - t0, 0);
});


// T05 (smoothness review, 26 Oct): a refused partial draw says why, and the rows it was given reach the whole draw after it.
test('a refused partial draw names its reason, and a drawn one says so', async () => {
  const { ROWS_REFUSED } = await import('../src/ui/gpu-probe.js');
  const { g, data, put, look, m } = await scene();
  put(0, [0.9, 0.9, 0.2]); g.setTubes(data);
  assert.equal(g.drawRows([1.5, 0, 0, 1.5, 0, 0], look, { on: false }, [0]), false);
  assert.equal(g.rowsStatus, 'moved');
  // New radii on a row the caller did not name: refused, never drawn without it.
  g.setRadii(4, Array(64).fill(9));
  assert.equal(g.drawRows(m, look, { on: false }, [0]), false);
  assert.equal(g.rowsStatus, 'radii not listed');
  assert.equal(g.drawRows(m, look, { on: false }, [0, 4]), true);
  assert.equal(g.rowsStatus, 'drawn');
  for (const why of ['moved', 'radii not listed']) assert.ok(ROWS_REFUSED.includes(why));
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  for (const why of ROWS_REFUSED) assert.ok(gl.includes(`refuse('${why}')`), `drawRows can refuse for "${why}"`);
});

