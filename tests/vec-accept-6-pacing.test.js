// Acceptance 6 (vector-renderer-plan.md section 11): sustained pacing after warm-up.
// Node judges (E's renderer on the warm harness's do-nothing WebGL, as scripts/stage-trace.mjs uses it): in a long seeded session of pans,
// blood ticks, colour changes and idle frames, every frame is one render pass for its kind (two for the frame where motion ends: the base,
// then the blood), no framebuffer bind falls inside a pass, a blood-only frame draws only the lumen programs, an idle frame calls the GPU
// not at all, the base is written exactly once for each end of motion, and a frame allocates nothing. vec-renderer.test.js holds the same
// claims for one frame of each kind; this holds them for every frame of a session. The shader workstreams' programs are stood in for by
// programs that declare the uniforms the renderer sets, as in that test (the renderer is judged here, not the shaders). On the devices: ten
// minutes on the Mac and the iPhone with ?perf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as C from '../src/ui/vec-contract.js';

// What each check waits for: a workstream's file that is not in the tree yet (or lacks the export named). While anything is missing the
// check is skipped, and the skip says what for, so a plain `npm test` shows what is left (plan 9.J, Phase 1).
const UI = new URL('../src/ui/', import.meta.url);
async function needs(list) {
  const lack = [], mods = {};
  for (const [who, file, names] of list) {
    if (!existsSync(new URL(file, UI))) { lack.push(`${who}: ${file}`); continue; }
    mods[file] = await import(new URL(file, UI).href);
    const no = names.filter((n) => !(n in mods[file]));
    if (no.length) lack.push(`${who}: ${file} to export ${no.join(', ')}`);
  }
  return { mods, skip: lack.length ? `waits for ${lack.join('; ')}` : false };
}

test('the contract names the three frame kinds this point counts passes for', () => {
  assert.deepEqual([C.V_FULL, C.V_BASE, C.V_BLOOD], [0, 1, 2]);
});

const e = await needs([['E', 'vec-renderer.js', ['createVecRenderer']], ['E', 'vec-frame.js', ['createVecFrame']], ['E', 'vec-targets.js', ['createVecTargets']]]);
const R = e.mods['vec-renderer.js'];
const { makeGL } = e.skip ? {} : await import('../scripts/warm/gl-stub.mjs');

const N = 12, W = 640, H = 480;
const UNIFORMS = 'uniform float padU, selPad; uniform mat3 world, inv; uniform vec2 size, gridO, gridN; uniform float px, H; uniform int variant; uniform usampler2D cellTex; uniform sampler2D regionTex, vecBase, tube; uniform vec4 casing; uniform float tierAlpha[3];';
const stretchVS = `#version 300 es\nlayout(location=0) in vec4 aV; layout(location=1) in float aRow;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const regionVS = `#version 300 es\nlayout(location=0) in vec2 aC; layout(location=1) in vec2 aCell;\n${UNIFORMS}\nvoid main(){ gl_Position = vec4(0.); }`;
const fsOf = (tag) => (v) => `#version 300 es\nprecision highp float;\n${UNIFORMS}\nout vec4 o; // ${tag} variant ${v}\nvoid main(){ o = vec4(float(variant)); }`;
function fakeGrid() {   // 4 × 3 cells: ordinary cells of row 2, one region cell listing rows 2 and 5
  const cells = new Uint16Array(C.GRID_W * 3 * 4), regions = new Float32Array(C.REGION_TEXELS * 4);
  const put = (cx, cy, kind, g) => { const o = (cy * C.GRID_W + cx) * 4; cells[o] = kind; cells[o + 1] = g; cells[o + 2] = 0; cells[o + 3] = 7; };
  for (let cx = 0; cx < 4; cx++) put(cx, 0, C.CELL_SIMPLE, 2);
  put(1, 1, C.CELL_REGION, 0); put(2, 2, C.CELL_SIMPLE, 7);
  regions[0] = C.K_JOIN; regions[1] = 2; regions[4] = 2; regions[8] = 5;
  return { cells, regions, nRegions: 1, gridO: [0, 0], gridN: [4, 3], rowsH: 3 };
}
function harness({ record }) {
  const calls = [], gl = makeGL({ width: W, height: H });
  if (record) for (const k of ['bindFramebuffer', 'useProgram', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'getExtension']) { const f = gl[k]; gl[k] = function (...a) { calls.push([k, ...a]); return f.apply(this, a); }; }
  const pic = { tex: {}, w: W, h: H };   // (one picture texture for the whole session: a new one each call would be a resize each frame)
  const shared = {
    nTubes: N, who: 'stage', picture: () => pic, tex: { tube: {}, rad: {}, ent: {} }, uniforms: {},
    parts: { stretch: { vs: stretchVS, fs: fsOf('stretch') }, region: { vs: regionVS, fs: fsOf('region') }, compile: { build: () => fakeGrid(), exceeds: () => false }, organs: { draw() {} }, overlays: { draw() {} } },
  };
  const r = R.createVecRenderer(gl, shared); r.start(); r.prepare(); r.setGeometry({ ent: new Float32Array(4) });
  const tubes = new Float32Array(52 * N); r.setTubes(tubes);
  const look = { reach: 4, shOff: [1, 1], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0.2], sheen: [1, 1, 1, 0.1], shade: [0, 0, 0, 0.1], ring: [1, 1, 1, 1], light: [0, -1], netAlpha: 1, fx: true, tierAlpha: [1, 1, 1], tierGroup: [0, 1, 2], organs: 0 };
  const blood = { on: true, bt: 1, clock: 1, streakA: 1, chevA: 1, originA: 1, alpha: 1 };
  return { gl, r, calls, tubes, look, blood, M: [[1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 11, 3]] };
}
const variantOf = (r, p) => { for (const k of [0, 1]) for (const v of [0, 1, 2]) if (r.programOf(k, v) === p) return v; return -1; };

// A session: seeded choices among a pan frame, a blood tick, a colour change of one row, and an idle frame. Returns what each frame was.
function session(h, frames, seed, onFrame) {
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let panX = 0, mode = 'pan', left = 3;
  for (let i = 0; i < frames; i++) {
    if (--left <= 0) { mode = ['pan', 'blood', 'colour', 'idle'][(rnd() * 4) | 0]; left = 1 + ((rnd() * 8) | 0); }
    if (mode === 'pan') { panX += 3; h.M[1][4] = panX; h.r.draw(h.M[1], h.look, h.blood); }
    else if (mode === 'blood') { h.blood.bt += 1 / 60; h.r.composite(h.look, h.blood, false); }
    else if (mode === 'colour') { h.tubes[52 * 5 + 3] = i & 1; h.r.setTubes(h.tubes); h.r.draw(h.M[1], h.look, h.blood, [5]); }
    else h.r.composite(h.look, h.blood, false);
    onFrame?.(mode, i);
  }
}

test('every frame of a long session is one pass per kind, binds nothing inside a pass, and a blood-only frame draws only lumen programs', { skip: e.skip }, () => {
  const h = harness({ record: true });
  session(h, 40, 1, null); h.calls.length = 0;   // (warm: the targets are made by the first frames, which is setup, not a pass)
  const seen = new Set();
  let passesSeen = h.r.stats.passes, idle = 0;
  session(h, 600, 2, () => {
    const c = h.calls.splice(0, h.calls.length).filter((x) => x[0] !== 'getExtension'), drew = h.r.stats.passes - passesSeen, kinds = h.r.stats.lastKinds;
    passesSeen = h.r.stats.passes;
    if (!drew) { idle++; assert.equal(c.length, 0, 'a frame that draws nothing calls the GPU not at all'); return; }
    seen.add(kinds);
    // split the calls into passes at each framebuffer bind: each pass binds once, first, and draws only its own variant's programs
    const passes = []; for (const x of c) { if (x[0] === 'bindFramebuffer') passes.push([]); else if (passes.length) passes[passes.length - 1].push(x); else assert.fail(`a ${x[0]} before any bind (${kinds})`); }
    const want = kinds === 'F' ? 1 : kinds === 'L' ? 1 : kinds === 'BL' || kinds === 'BF' ? 2 : kinds === 'B' ? 1 : -1;
    assert.ok(want > 0, `a frame kind the plan has (${kinds})`);
    assert.equal(passes.length, want, `${kinds}: ${want} pass(es), each with its one bind (the binds come first, none inside)`);
    const variants = passes.map((p) => [...new Set(p.filter((x) => x[0] === 'useProgram').map((x) => variantOf(h.r, x[1])))]);
    const order = { F: [C.V_FULL], L: [C.V_BLOOD], BL: [C.V_BASE, C.V_BLOOD], BF: [C.V_BASE, C.V_FULL], B: [C.V_BASE] }[kinds];
    assert.deepEqual(variants.map((v) => v.length === 1 ? v[0] : -1), order, `${kinds}: each pass draws only its own variant's programs`);
  });
  for (const k of ['F', 'L', 'BL']) assert.ok(seen.has(k), `the session had a ${k} frame`);
  assert.ok(idle > 20, `the session had idle frames (${idle})`);
});

test('the base is written exactly once for each end of motion, and never during a pan', { skip: e.skip }, () => {
  const h = harness({ record: false });
  h.r.draw(h.M[0], h.look, h.blood);
  for (let round = 1; round <= 5; round++) {
    for (let i = 1; i <= 4; i++) { h.M[1][4] = round * 100 + i * 3; h.r.draw(h.M[1], h.look, h.blood); }
    const before = h.r.stats.byKind[C.V_BASE];
    for (let i = 0; i < 6; i++) { h.blood.bt += 1 / 60; h.r.composite(h.look, h.blood, false); }
    assert.equal(h.r.stats.byKind[C.V_BASE] - before, 1, `round ${round}: motion ended, the base was written once`);
  }
  assert.equal(h.r.stats.byKind[C.V_BASE], 5, 'five motions, five bases, none during a pan');
});

test('a frame allocates nothing: a long session on a plain context holds the heap', { skip: e.skip }, () => {
  const h = harness({ record: false });
  session(h, 6000, 3, null);   // warm
  const h0 = process.memoryUsage().heapUsed;
  session(h, 12000, 4, null);
  const grown = process.memoryUsage().heapUsed - h0;
  // (The do-nothing context boxes each fractional number handed to its calls, a few dozen bytes a frame: that is the stub's. A closure, array
  // or object made a frame would be 200 B or more a frame, 2.4 MB over this run.)
  assert.ok(grown < 6 * 1024 * 1024, `heap grew ${grown} B over 12000 frames`);
});
