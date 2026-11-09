import { bootAnatomy } from './vec-anatomy.js';   // (first: its module hook must be in place before the stage is)
import { test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { makeGL } from '../scripts/warm/gl-stub.mjs';
import { createVecRenderer, declaredUniforms, VEC_OWN_UNIFORMS, PHASE } from '../src/ui/vec-renderer.js';
import { createVecTargets } from '../src/ui/vec-targets.js';
import { V_FULL, V_BASE, V_BLOOD, L_SINGLE, L_LAYERED, L_MORPH } from '../src/ui/vec-contract.js';
import { LEAF_CLASSES } from '../src/ui/vec-region-glsl.js';
import { gpuProbe } from '../src/ui/gpu-probe.js';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { binVeins } from '../src/ui/veins-bin.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { TUBE_FLOATS, A_CASING, A_GLOW, A_ALPHA } from '../src/ui/vec-graph.js';

// vec-renderer.js (workstream E) on the warm harness's do-nothing WebGL: what it draws in a frame, by call, over the real graph, runs and leaves (plan r1).
// The shader workstreams' real programs are judged in their own tests; stand-ins declare the uniforms the renderer sets, which is all these tests need of them.

const NS = N_SAMPLES, W = 640, H = 480;
const HIER = 'uniform highp usampler2D uVecCells, uVecNodes, uVecLeaves, uVecRunRefs, uVecJoinRefs; uniform highp sampler2D uVecRuns, uVecJoins; uniform vec2 uVecGridO, uVecShOff; uniform ivec2 uVecGridN;';
const UNIFORMS = `uniform float padU, selPad; uniform mat3 world, inv; uniform vec2 size; uniform float px, H; uniform int variant, morphOn; uniform sampler2D vecBase, tube; uniform vec4 casing; uniform float tierAlpha[3]; ${HIER}`;
const stretchVS = `#version 300 es\nlayout(location=0) in vec4 aV; layout(location=1) in float aRow;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const regionVS = `#version 300 es\nlayout(location=0) in vec2 aC; layout(location=1) in vec4 aBox;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const fsOf = (tag) => (v) => `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp usampler2D;\n${UNIFORMS}\nout vec4 o; // ${tag} variant ${v}\nvoid main(){ o = vec4(float(variant)); }`;

// Three vessels and a join: 0 and 1 cross at the join (250, 100), 2 runs alone far below.
const line = (x, y, dx, dy) => Array.from({ length: NS }, (_, i) => [x + i * dx, y + i * dy]);
const scene = () => ({
  tubes: [
    { id: 0, pts: line(10, 10, 4, 1.5), reach: 14 },
    { id: 1, pts: line(400, 20, -3.75, 2), reach: 11 },
    { id: 2, pts: line(40, 300, 3.5, 0.5), reach: 12 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 0.5, members: [0, 1] }],
});
const N = 3;
const radArr = (v) => { const a = new Float32Array(N * NS * 4); for (let r = 0; r < N; r++) for (let i = 0; i < NS; i++) a[(r * NS + i) * 4] = v; return a; };
const geometry = () => { const s = scene(); return binVeins(s.tubes, s.joins, new Map()); };

function harness(opts = {}) {
  const calls = [];
  const gl = makeGL({ width: W, height: H });
  const NAMES = ['stencilFunc', 'stencilOp', 'bindFramebuffer', 'useProgram', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'invalidateFramebuffer', 'scissor',
    'framebufferTexture2D', 'beginQuery', 'endQuery', 'texSubImage2D', 'texStorage2D', 'bufferData'];
  if (!opts.plain) for (const k of NAMES) { const f = gl[k]; gl[k] = function (...a) { calls.push([k, ...a]); return f.apply(this, a); }; }
  if (opts.timer) {
    const ext = { TIME_ELAPSED_EXT: 0x88BF, GPU_DISJOINT_EXT: 0x8FBB };
    gl.getExtension = (n) => (n === 'EXT_disjoint_timer_query_webgl2' ? ext : null);
    gl.getQueryParameter = (q, what) => (what === gl.QUERY_RESULT_AVAILABLE ? true : 2500000);
    gl.getParameter = (p) => (p === ext.GPU_DISJOINT_EXT ? !!opts.disjoint : 0);
  }
  const pictureTex = {};
  const organs = { draws: 0, draw() { this.draws++; } };
  const overlays = { phases: [], keep: !opts.plain, draw(p, m, ph) { if (this.keep) this.phases.push(ph); } };
  const tube = new Float32Array(N * TUBE_FLOATS), rad = radArr(4);
  const shared = {
    nTubes: N, who: 'stage',
    picture: () => ({ tex: pictureTex, w: W, h: H }),
    tex: { tube: {}, rad: {}, ent: {} },
    uniforms: {},
    tubeNow: tube, radAll: rad,
    parts: { stretch: { vs: stretchVS, fs: fsOf('stretch') }, region: { vs: regionVS, fs: fsOf('region') }, organs, overlays },
  };
  const r = createVecRenderer(gl, shared);
  r.start();
  r.prepare();
  const look = { reach: 4, shOff: [1, 1], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0.2], sheen: [1, 1, 1, 0.1], shade: [0, 0, 0, 0.1], ring: [1, 1, 1, 1], light: [0, -1], netAlpha: 1, fx: true, tierAlpha: [1, 1, 1], tierGroup: [0, 1, 2], organs: 0 };
  const blood = { on: true, bt: 1, clock: 1, streakA: 1, chevA: 1, originA: 1, alpha: 1 };
  const m = (x = 0) => [1, 0, 0, 1, x, 0];
  const take = () => calls.splice(0, calls.length);
  return { gl, r, calls, take, look, blood, m, organs, overlays, shared, tube, rad };
}
/** Which program a useProgram call named: [kind (0 strip, 1 region), variant, leaf class]. */
const whichProgram = (r, p) => {
  for (let v = 0; v < 3; v++) {
    if (r.programOf(0, v) === p) return [0, v, L_SINGLE];
    for (let c = L_LAYERED; c <= L_MORPH; c++) if (r.programOf(1, v, c) === p) return [1, v, c];
  }
  return [-1, -1, -1];
};
const variantsUsed = (r, c) => [...new Set(c.filter((x) => x[0] === 'useProgram').map((x) => whichProgram(r, x[1])[1]))];
const GPU_WRITES = ['texSubImage2D', 'texStorage2D'];

test('it is ready only when its parts are there, and says what it waits for', () => {
  const gl = makeGL({ width: 8, height: 8 });
  const r = createVecRenderer(gl, { nTubes: 3, parts: {} });
  assert.equal(r.ready, false);
  assert.match(r.status(), /waiting for stretch, region/);
  const h = harness();
  assert.equal(h.r.ready, true);
  assert.equal(h.r.status(), 'ready');
});

test('nothing is drawn until the geometry is set', () => {
  const h = harness();
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.take().filter((c) => c[0].startsWith('draw')).length, 0);
  assert.equal(h.r.stats.skipped > 0, true);
});

test('a whole frame is ONE render pass: one framebuffer bind, only the FULL programs, one draw for the strips and one a leaf class', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(0), h.look, h.blood);   // (the first frame builds the hierarchy and makes the targets: their own binds are setup, not a pass)
  h.take();
  h.r.draw(h.m(5), h.look, h.blood);
  const c = h.take();
  const binds = c.filter((x) => x[0] === 'bindFramebuffer');
  assert.equal(binds.length, 1, 'one bind');
  const firstDraw = c.findIndex((x) => x[0].startsWith('draw')), bindAt = c.indexOf(binds[0]);
  assert.ok(bindAt < firstDraw, 'the bind comes before the first draw');
  assert.deepEqual(variantsUsed(h.r, c), [V_FULL]);
  assert.equal(c.filter((x) => x[0] === 'drawElementsInstanced').length, 1, 'one strip call');
  const rep = h.r.hier.set.report;
  const classDraws = c.filter((x) => x[0] === 'drawArraysInstanced');
  const classes = Object.keys(rep.byClass).map(Number).filter((k) => k !== L_SINGLE && rep.byClass[k] > 0);
  assert.ok(classes.length > 0, 'the scene has leaf quads (the join and the crossing)');
  assert.equal(classDraws.length, classes.length, 'one call a leaf class that has leaves');
  assert.deepEqual(classDraws.map((x) => x[4]).sort((a, b) => a - b), classes.map((k) => rep.byClass[k]).sort((a, b) => a - b), 'instance counts equal the leaf counts of the classes');
  const stripCall = c.find((x) => x[0] === 'drawElementsInstanced');
  assert.ok(stripCall[5] >= 1 && stripCall[5] <= N, 'strip instances are the vessel rows that own a single-vessel leaf');
  assert.equal(h.r.stats.lastKinds, 'F');
  assert.equal(c.filter((x) => x[0] === 'stencilFunc').length, 0, 'no lumen stencil in a FULL pass');
  assert.equal(h.organs.draws, 2, 'organs drawn in the same pass (the warm-up frame, this one)');
  assert.deepEqual(h.overlays.phases.slice(-4), [PHASE.BEHIND, PHASE.UNDER, PHASE.HEADS, PHASE.OVER]);
  assert.ok(c.some((x) => x[0] === 'invalidateFramebuffer'));
  assert.equal(c.filter((x) => x[0] === 'invalidateFramebuffer').length, 2, 'colour before, depth and stencil after');
});

test('a pan or a pinch uploads nothing: no texture is written, made or filled, and no buffer', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(0), h.look, h.blood);
  assert.ok(h.r.hier.gpu.stats.uploads > 0, 'the first frame sent the tables');
  const before = { ...h.r.hier.gpu.stats };
  h.take();
  for (let i = 1; i <= 6; i++) h.r.draw([1 + i * 0.05, 0, 0, 1 + i * 0.05, i * 7, i * 3], h.look, h.blood);   // a pinch with a drift
  const c = h.take();
  assert.deepEqual(c.filter((x) => GPU_WRITES.includes(x[0]) || x[0] === 'bufferData'), [], 'no upload on a camera change');
  assert.deepEqual({ ...h.r.hier.gpu.stats }, before);
  assert.equal(h.r.stats.byKind[V_BASE], 0, 'the base was never written');
});

test('nothing changed: nothing drawn, no call to the GPU at all but the gauge', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(), h.look, h.blood);
  h.take();
  h.r.composite(h.look, h.blood, false);
  h.r.draw(h.m(), h.look, h.blood);
  assert.deepEqual(h.take().filter((c) => c[0] !== 'getExtension'), []);
});

test('the frame where motion ends writes the base once; then a blood frame draws only lumen programs, one pass', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(0), h.look, h.blood);
  h.r.draw(h.m(9), h.look, h.blood);       // the last pan frame
  h.take();
  h.blood.bt = 2;
  h.r.composite(h.look, h.blood, false);   // motion has ended: the blood moves at the same view
  let c = h.take();
  assert.equal(h.r.stats.lastKinds, 'BL', 'base then blood');
  assert.equal(h.r.stats.byKind[V_BASE], 1);
  assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 2, 'the base\'s framebuffer, then the picture\'s');
  const seq = c.filter((x) => x[0] === 'bindFramebuffer' || x[0] === 'useProgram');
  assert.equal(seq[0][0], 'bindFramebuffer');
  const split = seq.findIndex((x, i) => i > 0 && x[0] === 'bindFramebuffer');
  assert.deepEqual([...new Set(seq.slice(1, split).map((x) => whichProgram(h.r, x[1])[1]))], [V_BASE]);
  assert.deepEqual([...new Set(seq.slice(split + 1).map((x) => whichProgram(h.r, x[1])[1]))], [V_BLOOD]);
  assert.equal(h.organs.draws, 3, 'organs: two pan frames, the base pass; not the blood pass');
  for (let i = 0; i < 4; i++) {
    h.blood.bt = 3 + i; h.take();
    h.r.composite(h.look, h.blood, false);
    c = h.take();
    assert.equal(h.r.stats.lastKinds, 'L');
    assert.equal(c.filter((x) => x[0] === 'bindFramebuffer').length, 1);
    assert.deepEqual(variantsUsed(h.r, c), [V_BLOOD], 'a blood-only frame draws only lumen programs');
    assert.equal(c.filter((x) => x[0] === 'clear').length, 1);
    assert.equal(c.filter((x) => x[0] === 'stencilFunc').length, 1, 'strips and regions write stencil 1 (one setting for both draws)');
    assert.deepEqual(c.find((x) => x[0] === 'stencilFunc').slice(2), [1, 0xff]);
    assert.deepEqual(c.filter((x) => GPU_WRITES.includes(x[0])), [], 'a blood frame uploads no table');
  }
  assert.equal(h.r.stats.byKind[V_BASE], 1, 'the base was written once');
  assert.equal(h.organs.draws, 3, 'organs untouched by blood frames');
});

test('PHASE has BEHIND = 3 for G, and a BASE pass draws BEHIND and UNDER only', () => {
  assert.deepEqual({ ...PHASE }, { UNDER: 0, HEADS: 1, OVER: 2, BEHIND: 3 });
  const h = harness();
  h.r.setGeometry(geometry());
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
  h.r.setGeometry(geometry());
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

test('rows that show blood limit the BLOOD pass to the boxes of their runs, and the boxes are handed out (y from the bottom)', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(0), h.look, h.blood);
  h.blood.bt = 2; h.r.composite(h.look, h.blood, false);   // base written, whole-lumen blood pass
  assert.deepEqual([h.r.lastBloodBoxes().n, Array.from(h.r.lastBloodBoxes().boxes.slice(0, 4))], [1, [0, 0, W, H]]);
  h.r.setBloodRows([2], 1);
  h.take();
  h.blood.bt = 3; h.r.composite(h.look, h.blood, false);
  const c = h.take(), lb = h.r.lastBloodBoxes();
  assert.ok(lb.n >= 1, 'a box for the row');
  const b = Array.from(lb.boxes.slice(0, 4));
  // row 2 runs from (40, 300) along (3.5, 0.5) for 64 points: it lies low in the picture, so its box (y from the bottom) is under y = H − 300 + reach
  assert.ok(b[0] >= 0 && b[2] <= W && b[1] >= 0 && b[3] <= H && b[2] > b[0] && b[3] > b[1], `a box inside the picture: ${b}`);
  assert.ok(b[2] - b[0] < W && b[3] - b[1] < H, 'smaller than the picture');
  assert.equal(c.filter((x) => x[0] === 'scissor').length, lb.n);
  h.r.setBloodRows([9], 1);   // a row no run has: nothing to draw
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

test('a colour change at rest redraws boxes and rebuilds nothing; a glow toggle rebuilds only the leaves its row reaches, and uploads in part', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.setTubes(h.tube);
  h.r.draw(h.m(), h.look, h.blood);
  h.blood.bt = 2; h.r.composite(h.look, h.blood, false);   // base written
  const hier = h.r.hier, total = hier.set.report.leaves, rebuilds0 = h.r.counts.rebuilds, whole = h.r.hier.gpu.stats.texels;
  assert.ok(total > 8, 'enough leaves to tell a part from the whole');
  h.take();
  // a colour (the alpha): the row is redrawn, no bound moves, nothing is rebuilt or sent
  const next = h.tube.slice(); next[TUBE_FLOATS * 2 + A_ALPHA] = 0.5;
  h.r.setTubes(next);
  h.r.draw(h.m(), h.look, h.blood, [2]);
  let c = h.take();
  assert.equal(h.r.stats.lastKinds, 'BF');
  assert.ok(c.filter((x) => x[0] === 'scissor').length >= 2, 'both passes scissored');
  assert.equal(h.r.counts.rebuilds, rebuilds0, 'a colour change rebuilds nothing');
  assert.deepEqual(c.filter((x) => GPU_WRITES.includes(x[0])), [], 'and sends nothing');
  // a glow on row 0: its bounds grow, so its leaves are written again; the others are not. (The tables' storage grows once, as the first glow needs more
  // references than the build made room for; a second toggle has room.)
  const glow = next.slice(); glow[A_GLOW] = 1;
  h.r.setTubes(glow); h.r.draw(h.m(), h.look, h.blood, [0]);
  h.r.setTubes(next); h.r.draw(h.m(), h.look, h.blood, [0]);
  h.take();
  const sent0 = h.r.hier.gpu.stats.texels;
  h.r.setTubes(glow);
  h.r.draw(h.m(), h.look, h.blood, [0]);
  c = h.take();
  assert.equal(h.r.counts.rebuilds, rebuilds0 + 3);
  assert.equal(hier.set.stats.full, false, 'not a full rebuild');
  assert.ok(hier.set.stats.leavesWritten > 0 && hier.set.stats.leavesWritten < total, `${hier.set.stats.leavesWritten} of ${total} leaves written`);
  assert.ok(c.filter((x) => x[0] === 'texSubImage2D').length > 0, 'the changed rows of the tables are sent');
  assert.ok(h.r.hier.gpu.stats.texels - sent0 < whole, `${h.r.hier.gpu.stats.texels - sent0} texels sent, the whole build was ${whole}`);
  assert.ok(c.filter((x) => x[0] === 'texStorage2D').length <= 2, 'a texture is made again only where K\'s storage had to grow');
  assert.equal(h.r.stats.lastKinds, 'BF');
});

test('a radius within the bound\'s headroom rebuilds nothing; one past it rebuilds that row only', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(), h.look, h.blood);
  const rebuilds0 = h.r.counts.rebuilds, rows0 = h.r.hier.stats.rowsRebuilt;
  const r = new Float32Array(NS).fill(4.1);   // 4 × BOUND_HEADROOM and more is the bound
  h.r.setRadii(1, r);
  h.r.draw(h.m(), h.look, h.blood, [1]);
  assert.equal(h.r.counts.rebuilds, rebuilds0, 'inside the headroom: the bounds stand');
  r.fill(9);
  h.take();
  h.r.setRadii(1, r);
  h.r.draw(h.m(), h.look, h.blood, [1]);
  assert.equal(h.r.counts.rebuilds, rebuilds0 + 1);
  assert.equal(h.r.hier.stats.rowsRebuilt - rows0, 1, 'one row rebuilt');
  assert.equal(h.r.stats.lastKinds, 'F');
});

test('a morph set has its own hierarchy in box mode; using it draws from its tables, dropping it frees them', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  h.r.draw(h.m(), h.look, h.blood);
  const tubes = scene().tubes.map((t) => ({ id: t.id, path: [t.pts, t.pts.map(([x, y]) => [x + 30, y + 5])] }));
  const S = h.r.makeMorphSet({ posBase: 0, joinBase: 0, tight: false }, tubes);
  assert.ok(S && S.hier, 'a set with its hierarchy');
  h.r.useMorphSet(S);
  h.r.draw(h.m(1), h.look, h.blood);
  assert.equal(h.r.hier, S.hier);
  assert.equal(h.r.hier.set.policy.mode, 'box');
  assert.ok(h.r.hier.built && h.r.hier.set.report.leaves > 0);
  assert.ok(h.r.hier.set.report.byClass[L_MORPH] > 0, 'the crossing and the join are morph leaves');
  h.r.useMorphSet(null);
  assert.equal(h.r.hier, h.r.figureHier);
  h.r.dropMorphSet(S);
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
  const r = createVecRenderer(gl, { nTubes: N, picture: () => ({ tex: {}, w: W, h: H }), tex: { flow: {} }, tubeNow: new Float32Array(N * TUBE_FLOATS), radAll: radArr(4), parts: { stretch: { vs, fs }, region: { vs, fs } } });
  r.start(); r.prepare(); r.setGeometry(geometry());
  const blood = { on: true, chev: true, bt: 12.5, alpha: 0.5, vdpr: 2, origin: false, streakA: 0.3, chevA: 0.6, originA: 0.9, bleed: [[1, 2, 3, 4, 5, 6, 7, 8]] };
  r.draw([1, 0, 0, 1, 0, 0], { reach: 4, shOff: [1, 1] }, blood);
  assert.equal(set.vbOn, 1); assert.equal(set.vbChev, 1); assert.equal(set.vbChevQuad, 0, 'arrowheads in the lumen until the heads\' quads are wired');
  assert.equal(set.vbBT, 12.5); assert.equal(set.vbFlowA, 0.5); assert.equal(set.vbCssPx, 2); assert.equal(set.vbBleedN, 1);
  assert.deepEqual(set.vbBlendA.map((x) => +x.toFixed(2)), [0.3, 0.6, 0.9]);
  assert.deepEqual(set['vbBleedE[0]'].slice(0, 4), [1, 2, 3, 4]);
});

test('the hierarchy uniforms are fed: the grid origin and size (ivec2), the look\'s shadow offset, one sampler a table', () => {
  const gl = makeGL({ width: W, height: H });
  const names = new Map(), set = {};
  const gul = gl.getUniformLocation;
  gl.getUniformLocation = function (p, n) { const l = gul.call(this, p, n); names.set(l, n); return l; };
  gl.uniform2iv = function (l, v) { set[names.get(l)] = { iv: Array.from(v) }; };
  gl.uniform2fv = function (l, v) { set[names.get(l)] = { fv: Array.from(v) }; };
  gl.uniform1i = function (l, v) { set[names.get(l)] = v; };
  const h = (() => {
    const shared = { nTubes: N, picture: () => ({ tex: {}, w: W, h: H }), tex: { tube: {}, rad: {}, ent: {} }, tubeNow: new Float32Array(N * TUBE_FLOATS), radAll: radArr(4), parts: { stretch: { vs: stretchVS, fs: fsOf('s') }, region: { vs: regionVS, fs: fsOf('r') } } };
    const r = createVecRenderer(gl, shared);
    r.start(); r.prepare(); r.setGeometry(geometry());
    return r;
  })();
  h.draw([1, 0, 0, 1, 0, 0], { reach: 4, shOff: [1.4, 2.8], casing: [0, 0, 0, 1], tierAlpha: [1, 1, 1], tierGroup: [0, 1, 2] }, { on: false });
  const g = h.hier.set.tables.grid;
  assert.deepEqual(set.uVecGridN, { iv: [g.nx, g.ny] });
  assert.deepEqual(set.uVecGridO.fv, [g.x0, g.y0]);
  assert.deepEqual(set.uVecShOff.fv.map((x) => +x.toFixed(2)), [1.4, 2.8]);
  const units = ['uVecCells', 'uVecNodes', 'uVecLeaves', 'uVecRunRefs', 'uVecJoinRefs', 'uVecRuns', 'uVecJoins'].map((n) => set[n]);
  assert.equal(new Set(units).size, units.length, 'each table its own unit');
  assert.equal(h.hier.runs.look.shOff[0], 1.4, 'and the bounds were made with that offset');
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

test('drawRows refuses what it cannot stand in for, and says why', () => {
  const h = harness();
  h.r.setGeometry(geometry());
  assert.equal(h.r.drawRows(h.m(), h.look, h.blood, [1], false), false);
  assert.equal(h.r.rowsStatus, 'no kept layer');
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.r.drawRows(h.m(3), h.look, h.blood, [1], false), false);
  assert.equal(h.r.rowsStatus, 'moved');
  assert.equal(h.r.drawRows(h.m(), h.look, h.blood, [1], false), true);
  assert.equal(h.r.rowsStatus, 'drawn');
});

test('the uniforms the shaders declare are found from their source, with array sizes', () => {
  const u = declaredUniforms('uniform highp sampler2D a, b; uniform vec4 c[12]; // uniform float skipped;', 'uniform float px; uniform float px2, z;');
  assert.deepEqual(u.map((x) => `${x.type} ${x.name}${x.size ? '[' + x.size + ']' : ''}`), ['sampler2D a', 'sampler2D b', 'vec4 c[12]', 'float px', 'float px2', 'float z']);
  for (const [name, type] of Object.entries(VEC_OWN_UNIFORMS)) assert.ok(/^(float|int|vec2|ivec2|mat3|usampler2D|sampler2D)$/.test(type), name);
});

test('the stand-in shaders lint, and their uniforms are ones the renderer sets', () => {
  const hier = new Set(['uVecCells', 'uVecNodes', 'uVecLeaves', 'uVecRunRefs', 'uVecJoinRefs', 'uVecRuns', 'uVecJoins']);
  for (const v of [0, 1, 2]) {
    const fs = fsOf('x')(v);
    assert.deepEqual(lintGLSL(fs), []);
    for (const name of uniformsOf(fs)) assert.ok(name in VEC_OWN_UNIFORMS || hier.has(name) || ['tube', 'casing', 'tierAlpha'].includes(name), name);
  }
  assert.deepEqual(Object.keys(LEAF_CLASSES).map(Number), [2, 3, 4, 5, 6], 'the classes the renderer builds a program for');
});

test('L\'s timers: a component each, read later, only while ?perf measures', () => {
  const h = harness({ timer: true });
  h.r.setGeometry(geometry());
  h.r.draw(h.m(), h.look, h.blood);
  assert.equal(h.take().filter((c) => c[0] === 'beginQuery').length, 0, 'off: no query');
  gpuProbe.on = true;
  try {
    h.r.draw(h.m(5), h.look, h.blood);
    const c = h.take();
    const began = c.filter((x) => x[0] === 'beginQuery').length;
    assert.ok(began >= 3, `strips, class draws, organs and overlays each begin a query (${began})`);
    assert.equal(c.filter((x) => x[0] === 'endQuery').length, began);
    h.r.draw(h.m(6), h.look, h.blood);   // the first queries are read now
    const g = gpuProbe.takeGauges();
    assert.match(g['vessel renderer'], /^vector: 3 rows, \d+ leaves \(\d+ single, \d+ layered, \d+ cross, \d+ join, \d+ wide, \d+ morph\), 1 passes$/);
    assert.ok(h.r.measure.meanMs(0) > 0, 'the strips have a time');
  } finally { gpuProbe.on = false; }
});

test('a frame keeps nothing: blood frames, pans and row redraws leave no heap behind', () => {
  v8.setFlagsFromString('--expose_gc');
  const gc = vm.runInNewContext('gc');
  const h = harness({ plain: true });   // (a plain context: the recorder itself makes an array a call)
  h.r.setGeometry(geometry());
  const tubes = h.tube;
  h.r.setTubes(tubes);
  const rows = [1], M = [h.m(0), h.m(3)];
  const step = (i) => {
    h.blood.bt = i;
    if (i % 50 === 0) h.r.draw(M[(i / 50) & 1], h.look, h.blood);
    else if (i % 7 === 0) { tubes[TUBE_FLOATS + A_ALPHA] = i & 1; h.r.setTubes(tubes); h.r.drawRows(M[(i / 50 | 0) & 1], h.look, h.blood, rows, false); }
    else h.r.composite(h.look, h.blood, false);
  };
  for (let i = 1; i < 6000; i++) step(i);   // warm
  gc();
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 6000; i < 26000; i++) step(i);
  gc();
  const kept = process.memoryUsage().heapUsed - h0;
  // (What a frame makes and drops is the do-nothing context's: it boxes each fractional number handed to its calls. What counts is that nothing is
  // kept: no table, list or record grows with the frames. The garbage each frame makes is judged by the warm-frame harness, npm run warm.)
  assert.ok(kept < 256 * 1024, `heap kept ${kept} B over 20000 frames`);
});

test('on the real anatomy: geometry built into leaves, drawn, a colour change redraws only its rows\' boxes, a casing change rebuilds only its row', async () => {
  const A = await bootAnatomy();
  await A.preset('cirr-decomp', 40);
  const f = A.figure();
  const gl = makeGL({ width: W, height: H });
  const calls = [];
  for (const k of ['scissor', 'bindFramebuffer', 'drawElementsInstanced', 'drawArraysInstanced', 'texStorage2D']) { const g0 = gl[k]; gl[k] = function (...a) { calls.push(k); return g0.apply(this, a); }; }
  const pic = { tex: {}, w: 1200, h: 800 };
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  const r = createVecRenderer(gl, { nTubes: f.nTubes, picture: () => pic, tex: {}, tubeNow: f.tube, radAll, parts: { stretch: { vs: stretchVS, fs: fsOf('s') }, region: { vs: regionVS, fs: fsOf('r') } } });
  r.start(); r.prepare();
  r.setGeometry(f.bins);
  const look = { reach: 4, shOff: [1.4, 2.8], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [0, 0, 0, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], light: [0, -1], netAlpha: 1, fx: 1, tierAlpha: [1], tierGroup: [1], organs: 0 };
  const blood = { on: true, bt: 1 };
  const m = [1.2, 0, 0, 1.2, 40, 30];
  r.setTubes(f.tube);
  r.draw(m, look, blood);
  assert.equal(r.stats.lastKinds, 'F');
  const rep = r.hier.set.report;
  assert.ok(rep.leaves > 0 && rep.byClass[L_SINGLE] > 0, 'the anatomy has single-vessel leaves');
  assert.ok(rep.leaves - rep.byClass[L_SINGLE] > 0, 'and quads');
  assert.ok(calls.includes('drawArraysInstanced'), 'leaf quads drawn');
  assert.equal(r.counts.leaves, rep.leaves);
  blood.bt = 2; r.composite(look, blood, false);   // the base is written
  calls.length = 0;
  let row = 0;
  while (row < f.nTubes && r.hier.runs.runsOf(row).length === 0) row++;   // (a vessel the preset shows)
  assert.ok(row < f.nTubes);
  const t2 = f.tube.slice();
  t2[TUBE_FLOATS * row + A_ALPHA] = 0.4;   // its colour
  r.setTubes(t2);
  r.draw(m, look, blood, [row]);
  assert.equal(r.stats.lastKinds, 'BF');
  assert.ok(calls.filter((c) => c === 'scissor').length >= 2, 'both passes limited to boxes');
  assert.equal(calls.filter((c) => c === 'bindFramebuffer').length, 2);
  assert.equal(calls.filter((c) => c === 'texStorage2D').length, 0, 'no texture made');
  const n0 = r.counts.rebuilds;
  const t3 = t2.slice(); t3[TUBE_FLOATS * row + A_CASING] += 1.5;   // its casing: its bounds move
  r.setTubes(t3);
  r.draw(m, look, blood, [row]);
  assert.equal(r.counts.rebuilds, n0 + 1);
  assert.equal(r.hier.set.stats.full, false);
  assert.ok(r.hier.set.stats.leavesWritten < rep.leaves / 4, `only the leaves the row reaches: ${r.hier.set.stats.leavesWritten} of ${rep.leaves}`);
});
