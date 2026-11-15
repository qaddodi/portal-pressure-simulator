import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binVeins, simpleCells, splitCells } from '../src/ui/veins-bin.js';

// The one-vessel vessel program (veins-gl.js vesselFS(true), addendum §4 Pilot A): cells whose list holds one vessel and no
// join are drawn by a build of the vessel shader with one slot and no join code; every other cell by the general build.
// The picture is the same because, in such a cell, the general build fills one slot, finds no join, and every loop over the
// other slots or over joins does nothing. These checks hold the classification to the cell's own list, and the renderer
// to drawing every cell exactly once, by the program its class names.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const N = 64;
const line = (x0, y0, x1, y1) => Array.from({ length: N }, (_, i) => { const t = i / (N - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; });
// A loop that crosses itself (one vessel, two stretches of it in the same cells).
const loop = () => Array.from({ length: N }, (_, i) => { const t = (i / (N - 1)) * 2 * Math.PI; return [700 + 120 * Math.sin(2 * t), 500 + 90 * Math.sin(t)]; });
const scene = () => ({
  tubes: [
    { id: 0, pts: line(40, 60, 600, 60), reach: 30 },         // alone
    { id: 1, pts: line(100, 300, 500, 300), reach: 30 },      // crossed by 2
    { id: 2, pts: line(300, 150, 300, 450), reach: 30 },
    { id: 3, pts: loop(), reach: 26 },                        // crosses itself
    { id: 4, pts: line(80, 700, 400, 700), reach: 24 },       // joined to 5
    { id: 5, pts: line(400, 700, 560, 820), reach: 24 },
  ],
  // The join of 4 and 5, and one whose members lie elsewhere but whose reach covers vessel 0's cells.
  joins: [{ x: 400, y: 700, reach: 40, k: 12, fillet: 1, members: [4, 5] }, { x: 200, y: 60, reach: 30, k: 8, fillet: 1, members: [1, 2] }],
});
// From the cell's list itself: the vessel ids its entries name, and its join count.
function truth(b) {
  return Array.from({ length: b.nCells }, (_, c) => {
    const s0 = b.cells[c * 6 + 2], n = b.cells[c * 6 + 3], ids = new Set();
    for (let e = s0; e < s0 + n; e++) ids.add(b.ent[e * 8 + 4]);
    return { ids, joins: b.cells[c * 6 + 5], x: b.cells[c * 6], y: b.cells[c * 6 + 1] };
  });
}

test('a cell is simple exactly when its list names one vessel and no join', () => {
  const { tubes, joins } = scene();
  const b = binVeins(tubes, joins), flags = simpleCells(b.cells, b.nCells, b.ent), t = truth(b);
  assert.equal(flags.length, b.nCells);
  let simple = 0;
  for (let c = 0; c < b.nCells; c++) {
    assert.equal(flags[c], t[c].ids.size === 1 && t[c].joins === 0 ? 1 : 0, `cell ${t[c].x},${t[c].y}`);
    simple += flags[c];
  }
  assert.ok(simple > 0 && simple < b.nCells, `${simple} of ${b.nCells} simple`);
  // Where 1 and 2 cross, never simple; at the join of 4 and 5, never; under the far join's reach, never (even over vessel 0 alone).
  const at = (x, y) => t.findIndex((q) => x >= q.x && x < q.x + 16 && y >= q.y && y < q.y + 16);
  assert.equal(flags[at(300, 300)], 0);
  assert.equal(flags[at(400, 700)], 0);
  assert.equal(flags[at(200, 60)], 0);
  assert.equal(flags[at(560, 60)], 1, 'vessel 0 alone, far from both joins');
  // The loop's crossing: two stretches of one vessel, still one vessel in one slot.
  assert.equal(flags[at(700, 500)], 1);
  assert.ok(t[at(700, 500)].ids.size === 1);
});

test('the classification holds after a patched binning (points moved, same cells)', () => {
  const memo = new Map(), { tubes, joins } = scene();
  const b0 = binVeins(tubes, joins, memo);
  const f0 = simpleCells(b0.cells, b0.nCells, b0.ent);
  // A tiny wobble of the lone vessel keeps every cell's list: patched in place, the same flags.
  const moved = tubes.map((t) => (t.id === 0 ? { ...t, pts: t.pts.map(([x, y], i) => [x, y + (i % 2 ? 0.01 : 0)]) } : t));
  const b1 = binVeins(moved, joins, memo);
  assert.deepEqual(Array.from(simpleCells(b1.cells, b1.nCells, b1.ent)), Array.from(f0));
});

test('splitCells puts every cell in exactly one list, in order, and only the marked ones', () => {
  const { tubes, joins } = scene();
  const b = binVeins(tubes, joins), flags = simpleCells(b.cells, b.nCells, b.ent);
  const key = (a, i) => `${a[i * 6]},${a[i * 6 + 1]}`;
  const all = splitCells(b.cells, b.nCells, flags);
  assert.equal(all.nGen + all.nOne, b.nCells);
  assert.equal(all.gen.length, all.nGen * 6);
  assert.equal(all.one.length, all.nOne * 6);
  const gen = [], one = [];
  for (let c = 0; c < b.nCells; c++) (flags[c] ? one : gen).push(Array.from(b.cells.subarray(c * 6, c * 6 + 6)));
  assert.deepEqual(Array.from(all.gen), gen.flat());
  assert.deepEqual(Array.from(all.one), one.flat());
  // Marked cells only.
  const mark = new Uint8Array(b.nCells).map((_, c) => (c % 3 === 0 ? 1 : 0));
  const part = splitCells(b.cells, b.nCells, flags, mark);
  const want = new Set(); for (let c = 0; c < b.nCells; c++) if (mark[c]) want.add(key(b.cells, c));
  const got = new Set(); for (let i = 0; i < part.nGen; i++) got.add(key(part.gen, i)); for (let i = 0; i < part.nOne; i++) got.add(key(part.one, i));
  assert.equal(part.nGen + part.nOne, want.size);
  assert.deepEqual(got, want);
  // No flags (the one-vessel build off): everything to the general program.
  const off = splitCells(b.cells, b.nCells, null);
  assert.equal(off.nOne, 0);
  assert.deepEqual(Array.from(off.gen), Array.from(b.cells));
});

// ── The renderer on a recording stand-in for WebGL2 ──
function fakeGL({ failSimple = false, pcx = null, stencil = false } = {}) {
  const calls = [], enums = new Map(), src = new Map(), att = new Map();
  let nextObj = 1;
  const UNIFORMS = ['tint', 'redraw', 'depL', 'world'];
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, k.startsWith('COLOR_ATTACHMENT') ? 0x8ce0 + +k.slice(16) : 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'shaderSource') src.set(a[0], a[1]);
        if (k === 'attachShader') { if (!att.has(a[0])) att.set(a[0], []); att.get(a[0]).push(a[1]); }
        if (k === 'getShaderParameter') return !(failSimple && /#define SIMPLE 1/.test(src.get(a[0]) || ''));
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? UNIFORMS.length : a[1] === 0x91b1 ? pcx.done : !(failSimple && (att.get(a[0]) || []).some((sh) => /#define SIMPLE 1/.test(src.get(sh) || '')));   // (a shader that failed fails its link, as in a browser)
        if (k === 'getActiveUniform') return { name: UNIFORMS[a[1]] };
        if (k === 'getUniformLocation') return { uniform: a[1] };
        if (k === 'getExtension') return pcx && a[0] === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 0x91b1 } : null;
        if (k === 'checkFramebufferStatus') return gl.FRAMEBUFFER_COMPLETE;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getContextAttributes') return { stencil };
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  // (The one-pass builds hold both shaders' text: neither a vessel pass nor a composite build here, but isFused.)
  const isFused = (p) => (att.get(p) || []).some((sh) => /void compMain\(\)/.test(src.get(sh) || ''));
  const isSimple = (p) => !isFused(p) && (att.get(p) || []).some((sh) => /#define SIMPLE 1/.test(src.get(sh) || ''));
  const isVessel = (p) => !isFused(p) && (att.get(p) || []).some((sh) => /#define SIMPLE [01]/.test(src.get(sh) || ''));
  const compBuild = (p) => { if (isFused(p)) return null; const sh = (att.get(p) || []).map((x) => src.get(x) || '').find((t) => /#define PLAIN [01]/.test(t)); return sh ? (/#define PLAIN 1/.test(sh) ? 'plain' : 'full') : null; };
  const isPlain = (p) => compBuild(p) === 'plain';
  const fusedSimple = (p) => isFused(p) && (att.get(p) || []).some((sh) => /#define SIMPLE 1/.test(src.get(sh) || ''));
  return { gl, calls, isSimple, isVessel, isFused, fusedSimple, compBuild, isPlain, src, att };
}
async function renderer(f, url = '../src/ui/veins-gl.js', who = 'stage') {
  const { createVeinsGL, MAX_TIERS, TUBE_TEXELS } = await import(url);
  const canvas = { width: 1200, height: 900, getContext: () => f.gl, addEventListener() {}, removeEventListener() {} };
  const g = createVeinsGL(canvas, { tubes: 6, force: true, who });
  const { tubes, joins } = scene();
  const bins = binVeins(tubes, joins);
  g.setGeometry(bins);
  tubes.forEach((t) => g.setRadii(t.id, Array(N).fill(8)));
  const data = new Float32Array(6 * TUBE_TEXELS * 4);
  for (let i = 0; i < 6; i++) { data.set([0.3, 0.4, 0.8, 3, 0.3, 0.4, 0.8, 1, 1, 0.1 * i, 6, 0], i * TUBE_TEXELS * 4); data.set([0, 1, 500, 0], i * TUBE_TEXELS * 4 + 20); }
  g.setTubes(data);
  const look = {
    shOff: [1.4, 2.8], light: [-0.6, -0.8], reach: 11, organs: 0, casing: [0.1, 0.1, 0.15, 0.56], shadow: [0, 0, 0, 0.15],
    sheen: [1, 1, 1, 0.42], shade: [0.1, 0.1, 0.2, 0.2], ring: [0.2, 0.5, 1, 0.34], netAlpha: 1, fx: true,
    tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),
  };
  return { g, bins, look, data, TUBE_TEXELS };
}

// ── The composite's two builds (addendum §9): full, and plain for frames with no dye, no origin colours and no bleed ──
test('the plain composite is the same text with those three switches as constants 0', async () => {
  const { COMP_FS } = await import('../src/ui/veins-gl.js');
  const full = COMP_FS(), plain = COMP_FS(true);
  // Each build keeps one side of the PLAIN blocks; with those blocks and the define taken out, nothing else differs.
  const strip = (t) => t.replace(/^#define PLAIN [01]\n/m, '').replace(/#if PLAIN == 0\n[\s\S]*?#endif\n/g, '');
  assert.equal(strip(full), strip(plain));
  const blocks = [...full.matchAll(/#if PLAIN == 0\n([\s\S]*?)#else\n([\s\S]*?)#endif\n/g)].map((m) => [m[1], m[2]]);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0][0], /^uniform int origin;[^\n]*\nuniform int dyeOn;\n$/);
  assert.equal(blocks[0][1], 'const int origin = 0, dyeOn = 0;\n');
  assert.equal(blocks[1][0], 'uniform int bleedN;\n');
  assert.equal(blocks[1][1], 'const int bleedN = 0;\n');
  assert.match(full, /^#define PLAIN 0$/m);
  assert.match(plain, /^#define PLAIN 1$/m);
});

test('the composite takes the plain build only when its dye, origin and bleed uniforms would all be 0', async () => {
  const f = fakeGL();
  const { g, look } = await renderer(f);
  // Which composite fragment build the program in use was linked with, at each full-screen or cell draw of the composite.
  const builds = (from) => {
    let prog = null;
    const out = [];
    for (const c of f.calls.slice(from)) {
      if (c[0] === 'useProgram') prog = c[1];
      if ((c[0] === 'drawArrays' || c[0] === 'drawArraysInstanced') && !f.isVessel(prog)) {
        const b = f.compBuild(prog);
        if (b) out.push(b);
      }
    }
    return [...new Set(out)];
  };
  let n = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: true });
  assert.deepEqual(builds(n), ['plain']);
  n = f.calls.length;
  g.composite(look, { on: true, origin: true });
  assert.deepEqual(builds(n), ['full'], 'origin colours');
  n = f.calls.length;
  g.composite(look, { on: true, bleed: [[0, 0, 1, 1, 1, 1, 1, 1]] });
  assert.deepEqual(builds(n), ['full'], 'a bleed');
  g.setDye(new Float32Array(6 * 64));
  n = f.calls.length;
  g.composite(look, { on: true });
  assert.ok(builds(n).every((b) => b === 'full'), 'dye in the vessels');
  n = f.calls.length;
  g.composite(look, { on: true, dye: false }, true);
  assert.deepEqual(builds(n), ['plain'], 'dye switched off by the look');
});

// ── Prepared, then published (addendum §10.1) ──
test('with parallel compile the optional builds are never waited on, and are published, warmed, once the driver is done', async () => {
  const pcx = { done: false };
  const f = fakeGL({ pcx });
  const { g, look } = await renderer(f);
  // Nothing of the plain composite was read at construction: no compile or link status.
  const optional = (sh) => /#define PLAIN 1/.test(f.src.get(sh) || '');
  const optProg = (p) => (f.att.get(p) || []).some(optional);
  const statusReads = (from) => f.calls.slice(from).filter((c) => (c[0] === 'getShaderParameter' && optional(c[1])) || (c[0] === 'getProgramParameter' && optProg(c[1]) && c[2] === f.gl.LINK_STATUS));
  assert.equal(statusReads(0).length, 0);
  // While compiling: the full composite draws; only the completion flag is asked. The first draw finishes the Tube (nothing else draws the vessels).
  let n = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: true });
  assert.ok(f.calls.slice(n).some((c) => c[0] === 'getProgramParameter' && c[2] === 0x91b1));
  assert.equal(statusReads(n).length, 0);
  assert.ok(!f.calls.slice(n).some((c) => c[0] === 'useProgram' && f.isPlain(c[1])), 'the full composite draws');
  const held = new Set([...f.att].filter(([p]) => optProg(p)).flatMap(([, sh]) => sh));
  assert.ok(!f.calls.some((c) => c[0] === 'deleteShader' && held.has(c[1])), 'no shader of theirs freed while they are still to be finished');
  // Done: the next composite finishes it, warms it with a draw into a 1 × 1 target, and frees the shaders.
  pcx.done = true;
  n = f.calls.length;
  g.composite(look, { on: true });
  const c = f.calls.slice(n);
  assert.ok(statusReads(n).length > 0);
  assert.ok(c.some((x) => x[0] === 'viewport' && x[3] === 1 && x[4] === 1), 'warmed in a 1 × 1 target');
  assert.ok([...held].every((sh) => c.some((x) => x[0] === 'deleteShader' && x[1] === sh)), 'their shaders freed after');
  // Then: the plain composite draws.
  n = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: true });
  assert.ok(f.calls.slice(n).some((x) => x[0] === 'useProgram' && f.isPlain(x[1])), 'and the plain composite draws');
});

test('without parallel compile the optional builds are finished at construction, as before', async () => {
  const f = fakeGL();
  const { g, bins, look } = await renderer(f);
  const n = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: true });
  assert.ok(f.calls.slice(0, n).some((c) => c[0] === 'deleteShader'));
  assert.ok(!f.calls.slice(n).some((c) => c[0] === 'getProgramParameter' && c[2] === 0x91b1));
  assert.ok(bins.nCells > 0);
});
