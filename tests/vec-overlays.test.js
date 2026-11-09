// The vector renderer's scene overlays (workstream G, docs/recommendations/vector-renderer-plan.md 9.G), checked on what the two modules
// export and on a stand-in WebGL that records its calls: every shader lints and every uniform it declares is one the JavaScript sets; the map,
// the ascites and the plate's grey-down are COMP_FS's own maths; the layers are drawn in COMP_FS's order; the strokes, the catheter and the cavity
// are kept on the GPU across a pinch (a camera move uploads nothing); the warm glow takes the strongest of the strips that meet.
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

const G = await import('../src/ui/vec-overlays-glsl.js');
const { createOverlays, OVERLAY_SOURCES, setPlate } = await import('../src/ui/vec-overlays.js');
const { COMP_FS } = await import('../src/ui/veins-gl.js');

// ── Stand-in WebGL: records calls; programs are named by the sources they were built from ──
function standIn() {
  const enums = new Map(), srcOf = new Map(), progSh = new Map(), log = [];
  let nextObj = 1, prog = null;
  const E = (k) => { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); };
  const nameOf = (p) => {
    const sh = progSh.get(p) || [], fs = srcOf.get(sh[1]);
    return Object.keys(OVERLAY_SOURCES).find((k) => OVERLAY_SOURCES[k][1] === fs) ?? '?';
  };
  const names = (p) => {
    const sh = progSh.get(p) || [];
    return [...new Set([...uniformsOf(srcOf.get(sh[0]) || ''), ...uniformsOf(srcOf.get(sh[1]) || '')])];
  };
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return E(k);
      return (...a) => {
        switch (k) {
          case 'createShader': return { obj: nextObj++, type: a[0] };
          case 'createProgram': case 'createTexture': case 'createBuffer': case 'createVertexArray': return { obj: nextObj++ };
          case 'shaderSource': srcOf.set(a[0], a[1]); return undefined;
          case 'attachShader': progSh.set(a[0], [...(progSh.get(a[0]) || []), a[1]]); return undefined;
          case 'getExtension': return null;
          case 'getProgramParameter': return a[1] === E('ACTIVE_UNIFORMS') ? names(a[0]).length : true;
          case 'getActiveUniform': { const n = names(a[0])[a[1]]; return { name: n === 'mapZone' ? 'mapZone[0]' : n }; }
          case 'getUniformLocation': return { prog: nameOf(a[0]), name: a[1] };
          case 'useProgram': prog = a[0]; log.push(['use', a[0] ? nameOf(a[0]) : null]); return undefined;
          case 'getContextAttributes': return { stencil: true };
          default: break;
        }
        if (/^uniform/.test(k)) { log.push(['uniform', a[0]?.prog, a[0]?.name, k, a.slice(1)]); return undefined; }
        log.push([k, ...a]);
        return undefined;
      };
    },
  });
  return { gl, log, E, prog: () => (prog ? nameOf(prog) : null) };
}
const calls = (log, k) => log.filter((c) => c[0] === k);
const setNames = (log, prog) => new Set(log.filter((c) => c[0] === 'uniform' && c[1] === prog).map((c) => c[2]));

const VIEW = [1.5, 0, 0, 1.5, 20, 30];
const LOOK_MAP = { a: 0.8, dot: [0.5, 0.5, 0.6, 1], zone: new Float32Array(12), fx: [1, 0.8, 0.2, 0.3], alt: [200, 400, 700, 1100], fxX: [300, 500], rot: [1, 0, 700, 380] };
const LOOK_FLUID = { s: [500, 120, 2, 0.5], ink: [0.9, 0.8, 0.5, 0.6], lv: [1, 0] };
const LOOK = { plate: { alpha: 1, sat: 0.4 }, map: LOOK_MAP, fluid: LOOK_FLUID };
const spec = () => ({
  verts: new Float32Array(6 * 24), rev: 0,
  draws: [
    { first: 0, count: 6, col: [0.2, 0.6, 1], alpha: 1 },                       // an outline
    { first: 6, count: 6, col: [1, 0.8, 0.2], alpha: 0.5, soft: true },         // a glow behind the organs
    { first: 12, count: 6, col: [1, 0.6, 0.1], alpha: 0.6, soft: true, warm: true },   // a warm glow on them
    { first: 18, count: 6, col: [0.2, 0.2, 0.2], alpha: 1, tri: true },         // a fill
  ],
});
const cathSpec = () => ({
  base: new Float32Array(6 * 4), verts: new Float32Array(6 * 6), light: [-0.4, -0.9],
  draws: [{ mode: 2, first: 0, count: 4, col: [0.7, 0.8, 0.9], alpha: 1, fade: [0.1, 0.1], len: 100 }, { mode: 4, first: 4, count: 6, col: [0.7, 0.8, 0.9], alpha: 1, tri: true }],
});
const rig = () => { const s = standIn(), ov = createOverlays(s.gl); return { ...s, ov }; };

// ── Shaders ──
test('every overlay shader lints, and the chunks lint inside a host program as the region and stretch shaders include them', () => {
  for (const [k, [vs, fs]] of Object.entries(OVERLAY_SOURCES)) {
    assert.deepEqual(lintGLSL(vs), [], `${k} vertex`);
    assert.deepEqual(lintGLSL(fs), [], `${k} fragment`);
  }
  assert.deepEqual(lintGLSL(G.CATH_FS), []);
  assert.deepEqual(lintGLSL(G.lineFS(true)), []);
  const host = (body, call) => `#version 300 es\nprecision highp float;\nuniform float pxW;\n${body}\nout vec4 o;\nvoid main() { o = ${call}; }`;
  assert.deepEqual(lintGLSL(host(G.FLUID_GLSL, 'vecAboveAt(vec2(1.0, 2.0))')), [], 'FLUID_GLSL: vecAboveAt(vec2) -> vec4');
  assert.deepEqual(lintGLSL(host(G.OVER_GLSL + G.MAP_GLSL, 'vecMapAt(vec2(1.0, 2.0))')), []);
  assert.deepEqual(lintGLSL(host(G.PLATE_GLSL, 'vecPlate(vec4(0.5))')), []);
  assert.deepEqual(uniformsOf(G.FLUID_GLSL).sort(), [...G.FLUID_UNIFORMS].sort());
  assert.deepEqual(uniformsOf(G.MAP_GLSL).sort(), [...G.MAP_UNIFORMS].sort());
  assert.deepEqual(uniformsOf(G.PLATE_GLSL).sort(), [...G.PLATE_UNIFORMS].sort());
});

test('every uniform a program declares is one the draws set, and every one set is declared', () => {
  const { ov, log } = rig();
  assert.ok(ov.ok && ov.canLines && ov.canCath);
  ov.setLines(spec()); ov.setCath(cathSpec());
  ov.setFluidSpans(new Float32Array([100, 120, 140, 120]), [100, 200, 800, 300]);
  ov.setFluidLiver(new Float32Array([10, 20, 30, 40]));
  const base = { obj: 'kept base' };
  ov.drawBehind(VIEW, LOOK, 1000, 700); ov.drawWarm(VIEW, 1000, 700); ov.drawOver(VIEW, LOOK, 1000, 700); ov.drawFluid(VIEW, LOOK, 1000, 700, base);
  for (const [k, [vs, fs]] of Object.entries(OVERLAY_SOURCES)) {
    const declared = new Set([...uniformsOf(vs), ...uniformsOf(fs)]), set = setNames(log, k);
    assert.ok(set.size > 0, `${k} was drawn`);
    for (const u of declared) assert.ok(set.has(u), `${k}: ${u} is declared but never set`);
    for (const u of set) assert.ok(declared.has(u), `${k}: ${u} is set but not declared`);
  }
});

// ── COMP_FS's own maths ──
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const fnOf = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); const j = src.indexOf('\n}', i); return strip(src.slice(i, j + 2)); };
const declsOf = (src) => {
  const out = new Map();
  for (const m of strip(src).matchAll(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+);/g)) for (const n of m[2].split(',')) { const t = n.trim(); out.set(t.replace(/\[.*$/, ''), `${m[1]}${/\[.*\]/.test(t) ? t.replace(/^[^[]*/, '') : ''}`); }
  return out;
};

test('the map and the ascites are COMP_FS\'s mapAt and fluidAt, word for word', () => {
  const comp = COMP_FS(false);
  const mine = (t) => t.replaceAll('vecMapAt', 'mapAt').replaceAll('vecFluidAt', 'fluidAt').replaceAll('vecOver', 'over');
  assert.equal(mine(fnOf(G.MAP_GLSL, 'vec4 vecMapAt(vec2 w) {')), fnOf(comp, 'vec4 mapAt(vec2 w) {'));
  assert.equal(mine(fnOf(G.FLUID_GLSL, 'vec4 vecFluidAt(vec2 w) {')), fnOf(comp, 'vec4 fluidAt(vec2 w) {'));
  assert.equal(strip(G.OVER_GLSL).replace('vecOver', 'over'), strip('vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }'));
  const theirs = declsOf(comp);
  for (const g of [G.MAP_GLSL, G.FLUID_GLSL, G.PLATE_GLSL]) for (const [n, t] of declsOf(g)) assert.equal(t, theirs.get(n), `uniform ${n} has COMP_FS's type`);
  // the plate's grey-down: the statement COMP_FS runs on the plate it has read
  const stmt = 'if (pl.a > 0.0) { float l = dot(pl.rgb / pl.a, vec3(0.299, 0.587, 0.114)); pl = vec4(mix(vec3(l) * pl.a, pl.rgb, plateSat), pl.a) * plateAlpha; }';
  assert.ok(strip(comp).includes(stmt), 'COMP_FS has the statement');
  assert.ok(strip(G.PLATE_GLSL).includes(stmt), 'vecPlate runs it');
});

test('the layers are drawn in COMP_FS\'s order (read from its main: what lies over what)', () => {
  const main = strip(COMP_FS(false).slice(COMP_FS(false).indexOf('void main() {')));
  // The plate, then each statement that lays a layer: over(pl, X) puts X under what pl holds, over(X, pl) puts it over.
  const stack = ['plate'];
  const kind = (x) => (/mapAt/.test(x) ? 'map' : /glowL/.test(x) ? 'glow' : /warmL/.test(x) ? 'warm' : /lineL/.test(x) ? 'lines' : null);
  for (const m of main.matchAll(/pl = over\(\s*(pl|texelFetch\((\w+)[^)]*\)|mapAt\(w\)),\s*(pl|texelFetch\((\w+)[^)]*\)|mapAt\(w\))\s*\);/g)) {
    if (m[1] === 'pl') stack.unshift(kind(m[3])); else stack.push(kind(m[1]));
  }
  assert.deepEqual(stack, ['glow', 'map', 'plate', 'warm'], 'under the vessels: glow, map, plate, warm');
  const fin = main.match(/vec4 o = over\(fluidC, over\(v, over\(inner, pl\)\)\);\s*if \(lineOn == 1\) o = over\(texelFetch\(lineL, ip, 0\), o\);/);
  assert.ok(fin, 'over the plate: the pool, the vessels, the fluid, then the outlines');
  const order = [...stack, 'vessels', 'fluid', 'lines'];
  assert.deepEqual(G.OVERLAY_ORDER.filter((x) => x !== 'cath'), order);
  assert.equal(G.OVERLAY_ORDER.indexOf('cath'), G.OVERLAY_ORDER.indexOf('fluid') + 1, 'the catheter is laid over the fluid and under the outlines');
  assert.deepEqual([...G.UNDER_VESSELS, 'vessels', ...G.OVER_VESSELS], [...G.OVERLAY_ORDER]);
});

test('the draws go out in that order', () => {
  const { ov, log } = rig();
  ov.setLines(spec()); ov.setCath(cathSpec()); ov.setFluidSpans(new Float32Array([100, 120, 140, 120]), [100, 200, 800, 300]);
  log.length = 0;
  ov.drawBehind(VIEW, LOOK, 1000, 700);
  ov.drawWarm(VIEW, 1000, 700);
  ov.drawOver(VIEW, LOOK, 1000, 700);
  const used = [];
  let soft = null;
  for (const c of log) {
    if (c[0] === 'use') used.push(c[1]);
    if (c[0] === 'uniform' && c[2] === 'soft') soft = c[4][0];
  }
  assert.deepEqual(used, ['line', 'map', 'warm', 'warm', 'fluid', 'cath', 'line'], 'glow (the strokes), map, warm glow (two passes), ascites, catheter, outlines');
  assert.equal(soft, 0, 'the outlines come last, hard');
  // …and nothing is drawn for a layer that is not there
  const none = rig();
  none.ov.drawBehind(VIEW, {}, 1000, 700); none.ov.drawWarm(VIEW, 1000, 700); none.ov.drawOver(VIEW, {}, 1000, 700);
  assert.equal(calls(none.log, 'drawArrays').length, 0);
});

// ── Kept on the GPU ──
test('outlines, glows, the catheter and the cavity are kept across a pinch: a camera move changes the matrix and nothing is uploaded', () => {
  const { ov, log } = rig();
  const sp = spec();
  ov.setLines(sp); ov.setCath(cathSpec()); ov.setFluidSpans(new Float32Array([100, 120, 140, 120]), [100, 200, 800, 300]);
  const up = () => calls(log, 'bufferData').length + calls(log, 'bufferSubData').length + calls(log, 'texImage2D').length + calls(log, 'texSubImage2D').length;
  const after = up(), vers = { ...ov.ver };
  const worlds = [];
  for (let s = 1; s <= 8; s *= 1.5) {   // a pinch from 1× to ~5×, then a pan
    const m = [s, 0, 0, s, 400 - 200 * s, 300 - 150 * s];
    ov.setLines(sp);   // (stage.js hands the same spec each frame)
    ov.drawBehind(m, LOOK, 1000, 700); ov.drawWarm(m, 1000, 700); ov.drawOver(m, LOOK, 1000, 700);
    worlds.push(log.filter((c) => c[0] === 'uniform' && c[1] === 'line' && c[2] === 'world').pop()[4][1][0]);
  }
  assert.equal(up(), after, 'no vertex, texture or buffer write in a pinch');
  assert.deepEqual(ov.ver, vers, 'and no layer calls itself changed');
  assert.ok(new Set(worlds).size > 3, 'while the matrix the vertex shader reads did change');
  assert.equal(ov.stats.lineUploads, 1);
});

test('a new array of vertices is uploaded once; an alpha or a colour changing marks its layer changed and uploads nothing', () => {
  const { ov } = rig();
  const sp = spec();
  ov.setLines(sp);
  assert.equal(ov.stats.lineUploads, 1, 'the first set uploads once');
  const n0 = ov.stats.lineUploads, v0 = { ...ov.ver };
  sp.draws[1].alpha = 0.2;   // the glow fades
  ov.setLines(sp);
  assert.equal(ov.stats.lineUploads, n0, 'no upload');
  assert.equal(ov.ver.glow, v0.glow + 1); assert.equal(ov.ver.lines, v0.lines); assert.equal(ov.ver.warm, v0.warm);
  sp.draws[0].col = [1, 0, 0];   // the outline changes colour
  ov.setLines(sp);
  assert.equal(ov.ver.lines, v0.lines + 1); assert.equal(ov.ver.glow, v0.glow + 1);
  const sp2 = { ...spec(), verts: new Float32Array(6 * 24) };
  ov.setLines(sp2);
  assert.equal(ov.stats.lineUploads, n0 + 1, 'new vertices: one upload');
  ov.setLines(null);
  assert.equal(ov.hasLines() || ov.hasGlow() || ov.hasWarm(), false);
});

test('the catheter: its base is sent once, its vertices each frame, and its box follows the camera', () => {
  const { ov, log } = rig();
  const cs = cathSpec();
  ov.setCath(cs);
  const first = calls(log, 'bufferSubData').length;
  ov.setCath(cs);
  assert.equal(calls(log, 'bufferSubData').length, first + 1, 'only the moving vertices again');
  for (let i = 0; i < 6; i++) cs.verts[i * 6] = 10 * i;
  const b = ov.cathBox(VIEW, 1000, 700, [0, 0, 0, 0]);
  assert.ok(b && b[2] > b[0] && b[3] > b[1]);
  ov.setCath(null);
  assert.equal(ov.hasCath(), false);
  assert.equal(ov.drawCath(VIEW, 1000, 700), false);
});

// ── The ascites ──
test('the ascites: one quad over the cavity; its box is the rectangle through the camera; nothing is drawn without ink; rebase reads the kept base', () => {
  const { ov, log } = rig();
  ov.setFluidSpans(new Float32Array([100, 120, 140, 120]), [100, 200, 800, 300]);
  const box = ov.fluidBox(VIEW, 1000, 700, [0, 0, 0, 0]);
  assert.deepEqual(box, [Math.floor(1.5 * 100 + 20) - 1, Math.floor(1.5 * 200 + 30) - 1, Math.min(1000, Math.ceil(1.5 * 900 + 20) + 1), Math.min(700, Math.ceil(1.5 * 500 + 30) + 1)]);
  assert.equal(ov.drawFluid(VIEW, { fluid: { ...LOOK_FLUID, ink: [1, 1, 1, 0] } }, 1000, 700), false, 'no ink: no draw');
  assert.equal(ov.drawFluid(VIEW, {}, 1000, 700), false);
  log.length = 0;
  assert.equal(ov.drawFluid(VIEW, LOOK, 1000, 700), true);
  assert.equal(calls(log, 'drawArrays').length, 1);
  const base = { obj: 'base' };
  log.length = 0;
  ov.drawFluid(VIEW, LOOK, 1000, 700, base);
  assert.ok(log.some((c) => c[0] === 'use' && c[1] === 'rebase'));
  assert.ok(calls(log, 'bindTexture').some((c) => c[2] === base), 'the kept base is bound');
  assert.ok(!log.some((c) => c[0] === 'blendFunc'), 'written, not blended');
  assert.equal(ov.hasFluid(LOOK), true);
});

// ── The warm glow ──
test('the warm glow lays the strongest of the strips that meet: depth = 1 - alpha with LESS, then EQUAL once through a stencil bit; both buffers cleared after', () => {
  const { ov, log, E } = rig();
  ov.setLines(spec());
  log.length = 0;
  assert.equal(ov.drawWarm(VIEW, 1000, 700), true);
  const seq = log.filter((c) => ['depthFunc', 'colorMask', 'depthMask', 'stencilFunc', 'stencilOp', 'stencilMask', 'clear', 'drawArrays', 'blendFunc'].includes(c[0])).map((c) => c[0] + (c[0] === 'depthFunc' ? (c[1] === E('LESS') ? ':LESS' : ':EQUAL') : ''));
  const i1 = seq.indexOf('drawArrays'), i2 = seq.lastIndexOf('drawArrays');
  assert.ok(i1 > 0 && i2 > i1);
  assert.equal(calls(log, 'drawArrays').length, 2, 'the same strip once a pass');
  assert.deepEqual(seq.slice(0, i1).filter((x) => x.startsWith('depthFunc')), ['depthFunc:LESS']);
  assert.deepEqual(seq.slice(i1 + 1, i2).filter((x) => x.startsWith('depthFunc')), ['depthFunc:EQUAL']);
  const cm = calls(log, 'colorMask');
  assert.deepEqual(cm[0].slice(1), [false, false, false, false], 'the first pass writes depth only');
  const f = calls(log, 'stencilFunc')[0];
  assert.deepEqual(f.slice(1), [E('EQUAL'), 0, G.STENCIL_BIT]);
  assert.equal(calls(log, 'clear').length, 2, 'cleared before and after');
  assert.equal(calls(log, 'clear')[1][1], E('DEPTH_BUFFER_BIT') | E('STENCIL_BUFFER_BIT'));
  const last = (k) => calls(log, k).pop();
  assert.deepEqual(last('disable').slice(1), [E('STENCIL_TEST')]);
  assert.deepEqual(last('stencilMask').slice(1), [0xff]);
  assert.deepEqual(last('depthMask').slice(1), [true]);
  // a picture with no depth and stencil: the strips lay over each other, in one pass
  log.length = 0;
  ov.drawWarm(VIEW, 1000, 700, false);
  assert.equal(calls(log, 'drawArrays').length, 1);
  assert.ok(!calls(log, 'clear').length);
  // the warm glow's fragment writes the depth, the plain one does not
  assert.match(G.lineFS(true), /gl_FragDepth = 1\.0 - a;/);
  assert.doesNotMatch(G.lineFS(false), /gl_FragDepth/);
});

test('plate: alpha and saturation from the look; a plate faded out whole is none', () => {
  const { gl, log } = standIn();
  const locs = { plateAlpha: { prog: 'f', name: 'plateAlpha' }, plateSat: { prog: 'f', name: 'plateSat' } };
  setPlate(gl, locs, { plate: { alpha: 0.7, sat: 0.3 } });
  assert.deepEqual(log.filter((c) => c[0] === 'uniform').map((c) => [c[2], c[4][0]]), [['plateAlpha', 0.7], ['plateSat', 0.3]]);
  log.length = 0;
  setPlate(gl, locs, { plate: { alpha: 0, sat: 0.3 } });
  assert.deepEqual(log.filter((c) => c[0] === 'uniform').map((c) => [c[2], c[4][0]]), [['plateAlpha', 0], ['plateSat', 1]], 'alpha 0 and sat 1, as COMP_FS reads no plate');
});

test('the state a draw leaves: blending, depth and stencil off, the scissor untouched', () => {
  const { ov, log, E } = rig();
  ov.setLines(spec()); ov.setCath(cathSpec()); ov.setFluidSpans(new Float32Array([1, 2]), [0, 0, 10, 10]);
  ov.drawBehind(VIEW, LOOK, 1000, 700); ov.drawWarm(VIEW, 1000, 700); ov.drawOver(VIEW, LOOK, 1000, 700); ov.drawLines(VIEW, 1000, 700, 1);
  assert.ok(!log.some((c) => (c[0] === 'enable' || c[0] === 'disable') && c[1] === E('SCISSOR_TEST')));
  assert.ok(!log.some((c) => c[0] === 'scissor'));
  const lastOf = (cap) => { const x = log.filter((c) => (c[0] === 'enable' || c[0] === 'disable') && c[1] === E(cap)).pop(); return x?.[0]; };
  for (const cap of ['BLEND', 'DEPTH_TEST', 'STENCIL_TEST']) assert.notEqual(lastOf(cap), 'enable', `${cap} left on`);
});
