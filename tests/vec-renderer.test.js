import { bootAnatomy } from './vec-anatomy.js';   // (first: its module hook must be in place before the stage is)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGL } from '../scripts/warm/gl-stub.mjs';
import { createVecRenderer, declaredUniforms, VEC_OWN_UNIFORMS, PHASE, KINDS } from '../src/ui/vec-renderer.js';
import { createVecTargets } from '../src/ui/vec-targets.js';
import { GRID_W, REGION_TEXELS, CELL_SIMPLE, CELL_REGION, K_JOIN, V_FULL, V_BASE, V_BLOOD } from '../src/ui/vec-contract.js';
import { gpuProbe } from '../src/ui/gpu-probe.js';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { createVecCompiler } from '../src/ui/vec-compile.js';

// vec-renderer.js (workstream E) on the warm harness's do-nothing WebGL: what it draws in a frame, by call. The shader workstreams' real
// programs are not here yet; stand-ins declare the uniforms the renderer sets, which is all these tests need of them.

const N = 12, W = 640, H = 480;
const UNIFORMS = 'uniform float padU, selPad; uniform mat3 world, inv; uniform vec2 size, gridO, gridN; uniform float px, H; uniform int variant; uniform usampler2D cellTex; uniform sampler2D regionTex, vecBase, tube; uniform vec4 casing; uniform float tierAlpha[3];';
const stretchVS = `#version 300 es\nlayout(location=0) in vec4 aV; layout(location=1) in float aRow;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const regionVS = `#version 300 es\nlayout(location=0) in vec2 aC; layout(location=1) in vec2 aCell;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const fsOf = (tag) => (v) => `#version 300 es\nprecision highp float;\n${UNIFORMS}\nout vec4 o; // ${tag} variant ${v}\nvoid main(){ o = vec4(float(variant)); }`;

// A compiled grid with a 4 × 3 cells box: ordinary cells of row 2, one region cell listing rows 2 and 5.
function fakeGrid() {
  const cells = new Uint16Array(GRID_W * 3 * 4), regions = new Float32Array(REGION_TEXELS * 4 * 1);
  const put = (cx, cy, kind, g) => { const o = (cy * GRID_W + cx) * 4; cells[o] = kind; cells[o + 1] = g; cells[o + 2] = 0; cells[o + 3] = 7; };
  for (let cx = 0; cx < 4; cx++) put(cx, 0, CELL_SIMPLE, 2);
  put(1, 1, CELL_REGION, 0); put(2, 2, CELL_SIMPLE, 7);
  regions[0] = K_JOIN; regions[1] = 2;
  regions[4] = 2; regions[8] = 5;
  return { cells, regions, nRegions: 1, gridO: [0, 0], gridN: [4, 3], rowsH: 3 };
}

function harness(opts = {}) {
  const calls = [];
  const gl = makeGL({ width: W, height: H });
  const NAMES = ['stencilFunc', 'stencilOp', 'bindFramebuffer', 'useProgram', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'invalidateFramebuffer', 'scissor', 'framebufferTexture2D', 'beginQuery', 'endQuery'];
  if (!opts.plain) for (const k of NAMES) { const f = gl[k]; gl[k] = function (...a) { calls.push([k, ...a]); return f.apply(this, a); }; }
  if (opts.timer) {
    const ext = { TIME_ELAPSED_EXT: 0x88BF, GPU_DISJOINT_EXT: 0x8FBB };
    gl.getExtension = (n) => (n === 'EXT_disjoint_timer_query_webgl2' ? ext : null);
    gl.getQueryParameter = (q, what) => (what === gl.QUERY_RESULT_AVAILABLE ? true : 2500000);
    gl.getParameter = (p) => (p === ext.GPU_DISJOINT_EXT ? !!opts.disjoint : 0);
  }
  const pictureTex = {};
  const compileCalls = [];
  const organs = { draws: 0, draw() { this.draws++; } };
  const overlays = { phases: [], keep: !opts.plain, draw(p, m, ph) { if (this.keep) this.phases.push(ph); } };
  const shared = {
    nTubes: N, who: 'stage',
    picture: () => ({ tex: pictureTex, w: W, h: H }),
    tex: { tube: {}, rad: {}, ent: {} },
    uniforms: {},
    parts: {
      stretch: { vs: stretchVS, fs: fsOf('stretch') }, region: { vs: regionVS, fs: fsOf('region') },
      compile: { build: (bins) => { compileCalls.push(bins); return fakeGrid(); }, exceeds: () => false },
      organs, overlays,
    },
  };
  const r = createVecRenderer(gl, shared);
  r.start();
  r.prepare();
  const look = { reach: 4, shOff: [1, 1], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0.2], sheen: [1, 1, 1, 0.1], shade: [0, 0, 0, 0.1], ring: [1, 1, 1, 1], light: [0, -1], netAlpha: 1, fx: true, tierAlpha: [1, 1, 1], tierGroup: [0, 1, 2], organs: 0 };
  const blood = { on: true, bt: 1, clock: 1, streakA: 1, chevA: 1, originA: 1, alpha: 1 };
  const m = (x = 0) => [1, 0, 0, 1, x, 0];
  const take = () => calls.splice(0, calls.length);
  return { gl, r, calls, take, look, blood, m, organs, overlays, shared, compileCalls };
}
const variantOfProgram = (r, p) => { for (const k of [0, 1]) for (const v of [0, 1, 2]) if (r.programOf(k, v) === p) return v; return -1; };

test('it is ready only when its parts are there, and says what it waits for', () => {
  const gl = makeGL({ width: 8, height: 8 });
  const r = createVecRenderer(gl, { nTubes: 3, parts: {} });
  assert.equal(r.ready, false);
  assert.match(r.status(), /waiting for stretch, region, compile/);
  const h = harness();
  assert.equal(h.r.ready, true);
  assert.equal(h.r.status(), 'ready');
});

test('nothing is drawn until the geometry is compiled', () => {
  const h = harness();
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.take().filter((c) => c[0].startsWith('draw')).length, 0);
  assert.equal(h.r.stats.skipped > 0, true);
});

test('a whole frame is ONE render pass: one framebuffer bind, no bind inside it, only the FULL programs', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(0), h.look, h.blood);   // (the first frame makes the targets: their own binds are setup, not a pass)
  h.take();
  h.r.draw(h.m(5), h.look, h.blood);
  const c = h.take();
  const binds = c.filter((x) => x[0] === 'bindFramebuffer');
  assert.equal(binds.length, 1, 'one bind');
  const firstDraw = c.findIndex((x) => x[0].startsWith('draw')), bindAt = c.indexOf(binds[0]);
  assert.ok(bindAt < firstDraw, 'the bind comes before the first draw');
  const used = c.filter((x) => x[0] === 'useProgram').map((x) => variantOfProgram(h.r, x[1]));
  assert.deepEqual([...new Set(used)], [V_FULL]);
  assert.equal(used.length, 2, 'strips then regions');
  assert.equal(c.filter((x) => x[0] === 'drawElementsInstanced').length, 1);
  assert.equal(c.filter((x) => x[0] === 'drawArraysInstanced').length, 1);
  assert.equal(h.r.stats.lastKinds, 'F');
  assert.equal(c.filter((x) => x[0] === 'stencilFunc').length, 0, 'no lumen stencil in a FULL pass');
  assert.equal(h.organs.draws, 2, 'organs drawn in the same pass (the warm-up frame, this one)');
  assert.deepEqual(h.overlays.phases.slice(-4), [PHASE.BEHIND, PHASE.UNDER, PHASE.HEADS, PHASE.OVER]);
  // a pass that writes every pixel does not load its colour, and does not store its depth
  assert.ok(c.some((x) => x[0] === 'invalidateFramebuffer'));
  assert.equal(c.filter((x) => x[0] === 'invalidateFramebuffer').length, 2, 'colour before, depth and stencil after');
});

test('nothing changed: nothing drawn, no call to the GPU at all but the gauge', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(), h.look, h.blood);
  h.take();
  h.r.composite(h.look, h.blood, false);
  h.r.draw(h.m(), h.look, h.blood);
  assert.deepEqual(h.take().filter((c) => c[0] !== 'getExtension'), []);
});

test('a pan draws FULL every frame and writes no base', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(0), h.look, h.blood);
  for (let i = 1; i <= 5; i++) {
    h.take();
    h.r.draw(h.m(i * 7), h.look, h.blood);
    const c = h.take();
    assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 1);
    assert.equal(h.r.stats.lastKinds, 'F');
    assert.deepEqual([...new Set(c.filter((x) => x[0] === 'useProgram').map((x) => variantOfProgram(h.r, x[1])))], [V_FULL]);
  }
  assert.equal(h.r.stats.byKind[V_BASE], 0, 'the base was never written');
});

test('the frame where motion ends writes the base once; then a blood frame draws only lumen programs, one pass', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(0), h.look, h.blood);
  h.r.draw(h.m(9), h.look, h.blood);       // the last pan frame
  h.take();
  h.blood.bt = 2;
  h.r.composite(h.look, h.blood, false);   // motion has ended: the blood moves at the same view
  let c = h.take();
  assert.equal(h.r.stats.lastKinds, 'BL', 'base then blood');
  assert.equal(h.r.stats.byKind[V_BASE], 1);
  assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 2, 'the base\'s framebuffer, then the picture\'s');
  // each pass binds its target once and draws only its own variant's programs
  const seq = c.filter((x) => x[0] === 'bindFramebuffer' || x[0] === 'useProgram');
  assert.equal(seq[0][0], 'bindFramebuffer');
  const split = seq.findIndex((x, i) => i > 0 && x[0] === 'bindFramebuffer');
  assert.deepEqual([...new Set(seq.slice(1, split).map((x) => variantOfProgram(h.r, x[1])))], [V_BASE]);
  assert.deepEqual([...new Set(seq.slice(split + 1).map((x) => variantOfProgram(h.r, x[1])))], [V_BLOOD]);
  assert.equal(h.organs.draws, 3, 'organs: two pan frames, the base pass; not the blood pass');
  for (let i = 0; i < 4; i++) {
    h.blood.bt = 3 + i; h.take();
    h.r.composite(h.look, h.blood, false);
    c = h.take();
    assert.equal(h.r.stats.lastKinds, 'L');
    assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 1);
    assert.deepEqual([...new Set(c.filter((x) => x[0] === 'useProgram').map((x) => variantOfProgram(h.r, x[1])))], [V_BLOOD], 'a blood-only frame draws only lumen programs');
    assert.equal(c.filter((x) => x[0] === 'clear').length, 1);
    assert.equal(c.filter((x) => x[0] === 'stencilFunc').length, 1, 'strips and regions write stencil 1 (one setting for both draws)');
    assert.deepEqual(c.find((x) => x[0] === 'stencilFunc').slice(2), [1, 0xff]);
  }
  assert.equal(h.r.stats.byKind[V_BASE], 1, 'the base was written once');
  assert.equal(h.organs.draws, 3, 'organs untouched by blood frames');
});

test('PHASE has BEHIND = 3 for G, and a BASE pass draws BEHIND and UNDER only', () => {
  assert.deepEqual({ ...PHASE }, { UNDER: 0, HEADS: 1, OVER: 2, BEHIND: 3 });
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(0), h.look, h.blood); h.r.draw(h.m(4), h.look, h.blood);
  h.overlays.phases.length = 0;
  h.blood.bt = 9; h.r.composite(h.look, h.blood, false);   // BASE then BLOOD
  assert.deepEqual(h.overlays.phases, [PHASE.BEHIND, PHASE.UNDER, PHASE.HEADS]);
});

test("F's organs: update() before the passes (outside them), covers feed the veil, prepare and step on idle frames only", () => {
  const h = harness();
  const log = [], cover = {};
  const o = h.organs;
  o.update = () => log.push('update'); o.covers = () => ({ tex: cover, rect: [1, 2, 3, 4] });
  o.prepare = (z, sc) => log.push(`prepare ${z} ${sc}`); let steps = 0;
  o.step = () => { log.push('step'); return ++steps >= 2; };
  h.r.setGeometry({ ent: new Float32Array(4) });
  const gl = h.gl;
  const orig = gl.bindFramebuffer;
  gl.bindFramebuffer = function (...a) { log.push('bind'); return orig.apply(this, a); };
  h.r.draw(h.m(0), h.look, h.blood);   // (the first frame makes the targets, whose own binds are setup)
  log.length = 0;
  h.r.draw(h.m(5), h.look, h.blood);
  assert.deepEqual(log, ['update', 'bind'], 'the organs\' changes are written before the pass binds its target');
  log.length = 0;
  h.r.composite(h.look, h.blood, false);   // nothing changed: an idle frame
  assert.deepEqual(log, ['prepare undefined 1', 'step']);
  log.length = 0;
  h.r.composite(h.look, h.blood, false);
  assert.deepEqual(log, ['step'], 'prepared once for this scale, then stepped');
  assert.equal(h.r.idleWanted, false, 'step said all is ready');
  h.blood.bt = 76; h.r.composite(h.look, h.blood, false);   // (this one writes the base, so it draws organs)
  log.length = 0;
  h.blood.bt = 77; h.r.composite(h.look, h.blood, false);   // a blood frame: no organs work, no update
  assert.deepEqual(log.filter((x) => x !== 'bind'), [], 'a blood frame: no organs work');
});

test('rows that show blood limit the BLOOD pass to their cells, and the boxes are handed out (y from the bottom)', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(0), h.look, h.blood);
  h.blood.bt = 2; h.r.composite(h.look, h.blood, false);   // base written, whole-lumen blood pass
  assert.deepEqual([h.r.lastBloodBoxes().n, Array.from(h.r.lastBloodBoxes().boxes.slice(0, 4))], [1, [0, 0, W, H]]);
  h.r.setBloodRows([5], 1);
  h.take();
  h.blood.bt = 3; h.r.composite(h.look, h.blood, false);
  const c = h.take(), lb = h.r.lastBloodBoxes();
  assert.equal(lb.n, 1);
  assert.deepEqual(Array.from(lb.boxes.slice(0, 4)), [15, H - 33, 33, H - 15], 'row 5 lists only in the region cell (1, 1): its box, y from the bottom');
  assert.equal(c.filter((x) => x[0] === 'scissor').length, 1);
  h.r.setBloodRows([9], 1);   // a row no cell lists: nothing to draw
  h.take();
  h.blood.bt = 4; h.r.composite(h.look, h.blood, false);
  assert.equal(h.take().filter((x) => x[0] === 'drawElementsInstanced').length, 0);
  assert.equal(h.r.lastBloodBoxes().n, 0);
  h.r.setBloodRows(null);
  h.blood.bt = 5; h.r.composite(h.look, h.blood, false);
  assert.equal(h.r.lastBloodBoxes().n, 1);
  h.r.draw(h.m(7), h.look, h.blood);
  assert.equal(h.r.lastBloodBoxes().n, 0, 'a FULL frame has no blood-box record');
});

test('a colour change at rest redraws boxes: FULL and BASE scissored to the row\'s cells', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  const tubes = new Float32Array(52 * N);
  h.r.setTubes(tubes);
  h.r.draw(h.m(), h.look, h.blood);
  h.blood.bt = 2; h.r.composite(h.look, h.blood, false);   // base written
  h.take();
  const next = tubes.slice(); next[52 * 5 + 3] = 0.5;      // row 5 lists in the region cell
  h.r.setTubes(next);
  h.r.draw(h.m(), h.look, h.blood, [5]);
  const c = h.take();
  assert.equal(h.r.stats.lastKinds, 'BF');
  assert.ok(c.filter((x) => x[0] === 'scissor').length >= 2, 'both passes scissored');
  assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 2);
});

test('drawRows refuses what it cannot stand in for, and says why', () => {
  const h = harness();
  h.r.setGeometry({ ent: new Float32Array(4) });
  assert.equal(h.r.drawRows(h.m(), h.look, h.blood, [1], false), false);
  assert.equal(h.r.rowsStatus, 'no kept layer');
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.r.drawRows(h.m(3), h.look, h.blood, [1], false), false);
  assert.equal(h.r.rowsStatus, 'moved');
  assert.equal(h.r.drawRows(h.m(), h.look, h.blood, [1], false), true);
  assert.equal(h.r.rowsStatus, 'drawn');
});

test('the frame\'s targets: one DEPTH24_STENCIL8 shared by the picture and the base; sized once', () => {
  const gl = makeGL({ width: 8, height: 8 });
  const t = createVecTargets(gl);
  const tex = {};
  assert.equal(t.ensure(100, 50, tex), true);
  assert.equal(t.ensure(100, 50, tex), false);
  assert.equal(t.sized, 1);
  assert.equal(t.ready, true);
  assert.equal(t.ensure(100, 60, tex), true);
  assert.equal(t.sized, 2);
  assert.equal(t.ensure(100, 60, {}), true, 'a different picture texture is attached again');
  assert.equal(t.sized, 2, 'without making the base and depth again');
});

test("D's vb-prefixed blood uniforms are set from the composite names they stand for", () => {
  const gl = makeGL({ width: W, height: H });
  const names = new Map(), set = {};
  const gul = gl.getUniformLocation;
  gl.getUniformLocation = function (p, n) { const l = gul.call(this, p, n); names.set(l, n); return l; };
  for (const k of ['uniform1f', 'uniform1i', 'uniform3fv', 'uniform4fv']) gl[k] = function (l, v) { set[names.get(l)] = Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v) : v; };
  const decl = 'uniform int vbOn, vbChev, vbChevQuad, vbBleedN, vbOrigin; uniform float vbBT, vbFlowA, vbCssPx; uniform vec3 vbBlendA; uniform sampler2D vbFlow; uniform vec4 vbBleedE[24];';
  const fs = (v) => `#version 300 es\nprecision highp float;\n${decl}\nout vec4 o; // ${v}\nvoid main(){ o = vec4(1.); }`;
  const vs = `#version 300 es\nlayout(location=0) in vec4 aV; layout(location=1) in float aRow;\nlayout(location=0) in vec2 aC; void main(){ gl_Position = vec4(0.); }`;
  const r = createVecRenderer(gl, { nTubes: N, picture: () => ({ tex: {}, w: W, h: H }), tex: { flow: {} }, parts: { stretch: { vs, fs }, region: { vs, fs }, compile: { build: fakeGrid } } });
  r.start(); r.prepare(); r.setGeometry({});
  const blood = { on: true, chev: true, bt: 12.5, alpha: 0.5, vdpr: 2, origin: false, streakA: 0.3, chevA: 0.6, originA: 0.9, bleed: [[1, 2, 3, 4, 5, 6, 7, 8]] };
  r.draw([1, 0, 0, 1, 0, 0], { reach: 4, shOff: [1, 1] }, blood);
  assert.equal(set.vbOn, 1); assert.equal(set.vbChev, 1); assert.equal(set.vbChevQuad, 0, 'arrowheads in the lumen until the heads\' quads are wired');
  assert.equal(set.vbBT, 12.5); assert.equal(set.vbFlowA, 0.5); assert.equal(set.vbCssPx, 2); assert.equal(set.vbBleedN, 1);
  assert.deepEqual(set.vbBlendA.map((x) => +x.toFixed(2)), [0.3, 0.6, 0.9]);
  assert.deepEqual(set['vbBleedE[0]'].slice(0, 4), [1, 2, 3, 4]);
});

test('the uniforms the shaders declare are found from their source, with array sizes', () => {
  const u = declaredUniforms('uniform highp sampler2D a, b; uniform vec4 c[12]; // uniform float skipped;', 'uniform float px; uniform float px2, z;');
  assert.deepEqual(u.map((x) => `${x.type} ${x.name}${x.size ? '[' + x.size + ']' : ''}`), ['sampler2D a', 'sampler2D b', 'vec4 c[12]', 'float px', 'float px2', 'float z']);
  for (const [name, type] of Object.entries(VEC_OWN_UNIFORMS)) assert.ok(/^(float|int|vec2|mat3|usampler2D|sampler2D)$/.test(type), name);
});

test('the stand-in shaders lint, and their uniforms are ones the renderer sets', () => {
  for (const v of [0, 1, 2]) {
    const fs = fsOf('x')(v);
    assert.deepEqual(lintGLSL(fs), []);
    for (const name of uniformsOf(fs)) assert.ok(name in VEC_OWN_UNIFORMS || ['tube', 'casing', 'tierAlpha'].includes(name), name);
  }
});

test('GPU timers: per frame kind, read later, a disjoint result dropped, only while ?perf measures', () => {
  const h = harness({ timer: true });
  h.r.setGeometry({ ent: new Float32Array(4) });
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.take().filter((c) => c[0] === 'beginQuery').length, 0, 'off: no query');
  gpuProbe.on = true;
  try {
    h.r.draw(h.m(5), h.look, h.blood);
    const c = h.take();
    assert.equal(c.filter((x) => x[0] === 'beginQuery').length, 1);
    assert.equal(c.filter((x) => x[0] === 'endQuery').length, 1);
    h.r.draw(h.m(6), h.look, h.blood);   // the first query is read now
    const g = gpuProbe.takeGauges();
    assert.match(g['vessel renderer'], /^vector: 12 strips, 1 regions \(1 join, 0 cross, 0 hairpin, 0 near, 0 morph\), 1 passes$/);
    assert.equal(g[`vector GPU ms: ${KINDS[V_FULL]}`], 2.5);
  } finally { gpuProbe.on = false; }
  const d = harness({ timer: true, disjoint: true });
  d.r.setGeometry({ ent: new Float32Array(4) });
  gpuProbe.on = true;
  try {
    d.r.draw(d.m(), d.look, d.blood); d.r.draw(d.m(1), d.look, d.blood); d.r.draw(d.m(2), d.look, d.blood);
    const g = gpuProbe.takeGauges();
    assert.equal(g[`vector GPU ms: ${KINDS[V_FULL]}`], undefined, 'a disjoint result is not a time');
  } finally { gpuProbe.on = false; }
});

test('a frame allocates nothing (blood frames, pans, row redraws)', () => {
  const h = harness({ plain: true });   // (a plain context: the recorder itself makes an array a call)
  h.r.setGeometry({ ent: new Float32Array(4) });
  const tubes = new Float32Array(52 * N);
  h.r.setTubes(tubes);
  const rows = [5], M = [h.m(0), h.m(3)];
  const step = (i) => {
    h.blood.bt = i;
    if (i % 50 === 0) h.r.draw(M[(i / 50) & 1], h.look, h.blood);
    else if (i % 7 === 0) { tubes[52 * 5 + 3] = i & 1; h.r.setTubes(tubes); h.r.drawRows(M[(i / 50 | 0) & 1], h.look, h.blood, rows, false); }
    else h.r.composite(h.look, h.blood, false);
  };
  for (let i = 1; i < 6000; i++) step(i);   // warm
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 6000; i < 26000; i++) step(i);
  const grown = process.memoryUsage().heapUsed - h0;
  // (The do-nothing context boxes each fractional number handed to its calls, about 50 B on a whole frame: that is the stub's, not the renderer's.
  // The renderer's own code is closure-free: the planner is held to a much tighter bound in vec-frame.test.js. A closure or array made a frame is 200 B or more.)
  assert.ok(grown < 3 * 1024 * 1024, `heap grew ${grown} B over 20000 frames`);
});

test('on the real anatomy with the real compiler: geometry compiled, drawn, a colour change redraws only its rows\' boxes', async () => {
  const A = await bootAnatomy();
  await A.preset('cirr-decomp', 40);
  const f = A.figure();
  const gl = makeGL({ width: W, height: H });
  const calls = [];
  for (const k of ['scissor', 'bindFramebuffer', 'drawElementsInstanced', 'drawArraysInstanced']) { const g0 = gl[k]; gl[k] = function (...a) { calls.push(k); return g0.apply(this, a); }; }
  const comp = createVecCompiler(), pic = { tex: {}, w: 1200, h: 800 };
  const r = createVecRenderer(gl, { nTubes: f.nTubes, picture: () => pic, tex: {}, parts: { stretch: { vs: stretchVS, fs: fsOf('s') }, region: { vs: regionVS, fs: fsOf('r') }, compile: comp } });
  r.start(); r.prepare();
  r.setGeometry(f.bins);
  assert.ok(r.counts.regions > 0, 'the anatomy has interaction regions');
  assert.ok(r.counts.join > 0, 'and joins');
  const look = { reach: 4, shOff: [1, 1], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [0, 0, 0, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], light: [0, -1], netAlpha: 1, fx: 1, tierAlpha: [1], tierGroup: [1], organs: 0 };
  const blood = { on: true, bt: 1 };
  const m = [1.2, 0, 0, 1.2, 40, 30];
  r.setTubes(f.tube);
  r.draw(m, look, blood);
  assert.equal(r.stats.lastKinds, 'F');
  assert.ok(calls.includes('drawArraysInstanced'), 'region quads drawn');
  blood.bt = 2; r.composite(look, blood, false);   // the base is written
  calls.length = 0;
  const t2 = f.tube.slice();
  t2[52 * 3 + 5] = t2[52 * 3 + 5] + 0.25;   // row 3's attributes
  r.setTubes(t2);
  r.draw(m, look, blood, [3]);
  assert.equal(r.stats.lastKinds, 'BF');
  assert.ok(calls.filter((c) => c === 'scissor').length >= 2, 'both passes limited to boxes');
  assert.equal(calls.filter((c) => c === 'bindFramebuffer').length, 2);
});
