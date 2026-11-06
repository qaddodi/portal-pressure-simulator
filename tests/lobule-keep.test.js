import { test } from 'node:test';
import assert from 'node:assert/strict';

// The lobule's kept picture (lobule lag rec 1, 6 Nov 2026; src/ui/lobule-keep.js, veins-gl.js keepNote/keepBlood): a frame where only the
// blood moved repaints the blood's squares in the lobule's texture instead of laying the whole picture again. It is used only while
// everything that texture is made of is the one the last whole present laid.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { keepFS, KEEP_VS, DUCT_GLSL } = await import('../src/ui/lobule-keep.js');
const { fxShaders, MAX_DUCTS } = await import('../src/ui/fx-gl.js');

function fakeGL() {
  const calls = [], enums = new Map(), src = new Map(), attached = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'shaderSource') src.set(a[0], a[1]);
        if (k === 'attachShader') { const l = attached.get(a[0]) || []; l.push(a[1]); attached.set(a[0], l); }
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getUniformLocation') return { name: a[1] };
        if (k === 'isContextLost') return false;
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  // (The program made from the kept picture's shaders, if any.)
  const keepProgram = () => [...attached].find(([, shs]) => shs.some((s) => /uOwn/.test(src.get(s) || '')))?.[0] || null;
  return { gl, calls, keepProgram };
}

async function lobule() {
  const mod = await import('../src/ui/veins-gl.js');
  const f = fakeGL();
  const host = { width: 800, height: 600, addEventListener() {}, removeEventListener() {} };
  const canvas = { width: 800, height: 600, addEventListener() {}, removeEventListener() {} };
  let hostPresents = 0;
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule', share: { gl: f.gl, canvas: host, present: () => { hostPresents++; } } });
  assert.ok(g?.top, 'a hosted lobule renderer');
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30, core: 6 }, { id: 1, pts: line(300), reach: 30, core: 6 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  const TEX = { obj: 'tissue', kind: 'createTexture' };
  const src = { v1: 1, v2: 1, v3: 1, dyn: false, ducts: null, reads: 0, read(ks) { this.reads++; ks.tex = TEX; ks.w = canvas.width; ks.h = canvas.height; ks.v1 = this.v1; ks.v2 = this.v2; ks.v3 = this.v3; ks.dyn = this.dyn; ks.ducts = this.ducts; return true; } };
  let underDrawn = 0;
  g.top.under({ on: () => true, draw: () => { underDrawn++; } });
  g.top.keep(src);
  const topOff = g.top.add({ order: 1, still: true, draw() {} });
  // (The blood's own frame: a row's flow moved, nothing else.)
  const stride = mod.FLOW_TEXELS * 4, flow = new Float32Array(4 * stride);
  for (let r = 0; r < 4; r++) flow[r * stride + 6] = 1;
  let phase = 0;
  const beat = () => { phase++; for (let r = 0; r < 4; r++) flow[r * stride] = phase; g.setFlow(flow); g.composite(look, { on: true }); };
  return { g, f, canvas, look, src, host, hosts: () => hostPresents, underDrawn: () => underDrawn, topOff, mod, beat };
}

const M = [1, 0, 0, 1, 0, 0];
// A whole picture, then the blood's frames (the first draws with different uniforms, the second is the blood's own).
function settle(t) {
  t.g.draw(M, t.look, { on: false });
  t.beat();
  t.beat();
}
const keepDraws = (t, from) => {
  const prog = t.f.keepProgram();
  const out = [];
  let using = null;
  for (const c of t.f.calls.slice(from)) {
    if (c[0] === 'useProgram') using = c[1];
    if (c[0] === 'drawArraysInstanced' && prog && using === prog) out.push(c);
  }
  return out;
};

test('the ductules are shaded in the kept picture\'s pass by the same lines as fx-gl.js shades them', () => {
  const norm = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  // (fx-gl.js shades each ductule as a quad of its own (ductFS) where the kept picture's pass loops over them; the lines that differ are the loop's.)
  const fx = new Set(norm(fxShaders.ductFS));
  const loop = new Set(['for (int j = 0; j < 8; j++) {', 'if (j >= uND) break;', 'vec4 A = uD0[j], B = uD1[j];', 'if ((d - A.w - hl) * s > 2.0) continue;', '}']);
  const shared = norm(DUCT_GLSL).filter((l) => !loop.has(l));
  assert.ok(shared.length >= 14, 'the ductule\'s shading lines');
  for (const line of shared) assert.ok(fx.has(line), `fx-gl.js shades without: ${line}`);
  assert.ok(fx.has('if ((d - A.w - hl) * s > 2.0) discard;') && norm(DUCT_GLSL).includes('if ((d - A.w - hl) * s > 2.0) continue;'), 'the same reach test');
  const fs = keepFS();
  assert.match(fs, /uniform vec4 uD0\[8\], uD1\[8\]/);
  assert.equal(MAX_DUCTS, 8);
  assert.match(KEEP_VS, /world \* vec3\(org \+ corner \* cell, 1\.0\)/, 'the composite\'s cell corners');
  // The vessel layer over the tissue, then the ductules over that, premultiplied, as the present lays them.
  assert.match(fs, /v \+ texelFetch\(uTis, ip, 0\) \* \(1\.0 - v\.a\)/);
  assert.match(fs, /r = c \+ r \* \(1\.0 - c\.a\)/);
});

test('a blood-only frame repaints the blood\'s squares in the lobule\'s texture and lays nothing whole', async () => {
  const t = await lobule();
  settle(t);
  const n0 = t.f.calls.length, u0 = t.underDrawn(), p0 = t.g.top.presents, h0 = t.hosts();
  assert.equal(t.g.top.kept, true, 'the whole picture was kept');
  t.beat();
  const d = keepDraws(t, n0);
  assert.equal(d.length, 1, 'one pass over the squares');
  assert.ok(d[0][4] > 0, 'instanced over the blood\'s squares');
  assert.equal(t.underDrawn(), u0, 'the tissue was not blitted again');
  assert.equal(t.g.top.presents, p0 + 1);
  assert.equal(t.hosts(), h0 + 1, 'the stage was asked to lay it');
  // (Into the lobule\'s texture, not the canvas: the last framebuffer bound for it is the renderer\'s own.)
  const calls = t.f.calls.slice(n0), at = calls.findIndex((c) => c[0] === 'drawArraysInstanced' && c === d[0]);
  const fb = calls.slice(0, at).findLast((c) => c[0] === 'bindFramebuffer' && c[1] === t.f.gl.FRAMEBUFFER);
  assert.ok(fb[2] && fb[2].kind === 'createFramebuffer');
  // And again: still kept.
  const n1 = t.f.calls.length;
  t.beat();
  assert.equal(keepDraws(t, n1).length, 1);
  assert.equal(t.underDrawn(), u0);
});

test('a change in the tissue, the overlay or the ductules lays the frame whole, and the picture is kept again after', async () => {
  const t = await lobule();
  settle(t);
  for (const k of ['v1', 'v2', 'v3']) {
    t.src[k]++;
    const u0 = t.underDrawn(), n0 = t.f.calls.length;
    t.beat();
    assert.equal(keepDraws(t, n0).length, 0, `${k}: not repainted in part`);
    assert.equal(t.underDrawn(), u0 + 1, `${k}: the tissue laid again`);
    const n1 = t.f.calls.length;
    t.beat();
    assert.equal(keepDraws(t, n1).length, 1, `${k}: kept again by the whole present`);
  }
});

test('a new vessel picture, a moving pass, or an unknown pass over the figure lays the frame whole', async () => {
  const t = await lobule();
  settle(t);
  // A whole vessel picture: its present is whole, and keeps the new one.
  t.g.draw(M, t.look, { on: false });
  const u0 = t.underDrawn();
  t.beat();
  t.beat();
  assert.ok(t.underDrawn() > u0, 'laid whole after a new picture');
  let n = t.f.calls.length, u;
  t.beat();
  assert.equal(keepDraws(t, n).length, 1);
  // Something else moves in the picture (the wide copy fading in).
  t.src.dyn = true;
  n = t.f.calls.length; u = t.underDrawn();
  t.beat();
  assert.equal(keepDraws(t, n).length, 0);
  assert.equal(t.underDrawn(), u + 1);
  t.src.dyn = false;
  t.beat();
  // A pass the lobule does not know is `still` (a glass added to this canvas).
  const off = t.g.top.add({ order: 2, draw() {} });
  t.beat();
  n = t.f.calls.length; u = t.underDrawn();
  t.beat();
  assert.equal(keepDraws(t, n).length, 0, 'an unknown pass');
  assert.equal(t.underDrawn(), u + 1);
  assert.equal(t.g.top.kept, false);
  off();
  t.beat();
  n = t.f.calls.length;
  t.beat();
  assert.equal(keepDraws(t, n).length, 1, 'kept again once it is gone');
});

test('the lobule\'s texture made again (a resize) is not repainted in part: it holds nothing', async () => {
  const t = await lobule();
  settle(t);
  t.canvas.width = 640;
  t.g.draw(M, t.look, { on: false });
  const n = t.f.calls.length;
  t.beat();
  assert.equal(keepDraws(t, n).length, 0);
  const n1 = t.f.calls.length;
  t.beat();
  assert.equal(keepDraws(t, n1).length, 1, 'kept again by the next whole present');
});

test('without a keep source, or a program that is not ready, every frame is laid whole as before', async () => {
  const t = await lobule();
  const off = t.g.top.keep({ read: () => false });
  settle(t);
  assert.equal(t.g.top.kept, false);
  const n = t.f.calls.length, u = t.underDrawn();
  t.beat();
  assert.equal(keepDraws(t, n).length, 0);
  assert.equal(t.underDrawn(), u + 1);
  off();
});
