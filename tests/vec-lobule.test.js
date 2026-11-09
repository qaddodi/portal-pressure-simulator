import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';

// The lobule under the Vector vessel renderer (workstream I, docs/recommendations/vector-renderer-plan.md 9.I; src/ui/vec-lobule.js).
// Checks that need the other workstreams' code (the compiler, the blood material, the seam) are skipped with the name of what they wait for.

// (The page's DOM and a GL that does nothing, as the warm-frame harness has them: the modules below read them as they load.)
const page = (await import('../scripts/warm/dom.mjs')).installPage();
const R = '../src/ui/';
const { indexFlow, createStamp, createVecLobule, KEEP_BOX_VS, FLOW_TEXELS: FT, F1X, F1Z, FACTOR, LYMPH_MARK } = await import(`${R}vec-lobule.js`);
const { keepFS } = await import(`${R}lobule-keep.js`);
const { MAX_MEMBERS, MAX_JOINS } = await import(`${R}vec-contract.js`);
const { CELL } = await import(`${R}veins-bin.js`);
const waits = async (file) => { try { return await import(`${R}${file}`); } catch (e) { if (e?.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; } };

// ── The lobule's flow rows ──
test('the flow row layout is veins-gl\'s: the lymph mark, the strength and the flow factor sit where the lobule writes them', async () => {
  const { FLOW_TEXELS } = await import(`${R}veins-gl.js`);
  assert.equal(FT, FLOW_TEXELS);
  assert.equal(F1X, 1 * 4 + 0);   // texel 1.x
  assert.equal(F1Z, 1 * 4 + 2);   // texel 1.z
  assert.equal(FACTOR, 6 * 4 + 1);   // texel 6.y
  assert.equal(LYMPH_MARK, -1);
});

const rowOf = (flow, r, { lymph = false, strength = 1, factor = 0 } = {}) => { const o = r * FT * 4; flow[o + F1X] = lymph ? LYMPH_MARK : 1; flow[o + F1Z] = strength; flow[o + FACTOR] = factor; };

test('the flow index lists the rows that show blood or lymph, marks the lymph rows, and counts rows with a flow factor', () => {
  const n = 9, flow = new Float32Array(n * FT * 4);
  rowOf(flow, 1); rowOf(flow, 2, { lymph: true }); rowOf(flow, 4, { strength: 0.6 }); rowOf(flow, 6, { lymph: true }); rowOf(flow, 7, { strength: 0 });
  const out = {};
  indexFlow(flow, n, out);
  assert.deepEqual([...out.rows.subarray(0, out.n)], [1, 2, 4, 6]);
  assert.deepEqual([...out.lymph.subarray(0, out.nLymph)], [2, 6]);
  assert.equal(out.anchored, 0, 'the lobule\'s flow factor is 0 on every row: the stream\'s distance is the CPU\'s own');
  rowOf(flow, 4, { factor: 0.5 });
  assert.equal(indexFlow(flow, n, out).anchored, 1);
});

test('the flow index allocates nothing once its lists exist', () => {
  const n = 64, flow = new Float32Array(n * FT * 4), out = {};
  for (let r = 0; r < n; r += 3) rowOf(flow, r);
  indexFlow(flow, n, out);
  const rows = out.rows, lymph = out.lymph;
  indexFlow(flow, n, out);
  assert.equal(out.rows, rows); assert.equal(out.lymph, lymph);
});

// ── The kept picture's stamps ──
test('the kept picture holds only while the five numbers it was laid from stand', () => {
  const s = createStamp(), ks = { v1: 1, v2: 2, v3: 3 };
  assert.equal(s.same(5, 1, ks), false, 'nothing noted yet');
  s.note(false, 5, 1, ks);
  assert.equal(s.on, false, 'a present that did not go through the tissue keeps nothing');
  s.note(true, 5, 1, ks);
  assert.equal(s.same(5, 1, ks), true);
  assert.equal(s.same(6, 1, ks), false, 'the vessel layer drew another picture');
  assert.equal(s.same(5, 2, ks), false, 'the texture was made again');
  assert.equal(s.same(5, 1, { v1: 9, v2: 2, v3: 3 }), false, 'the tissue moved');
  assert.equal(s.same(5, 1, { v1: 1, v2: 9, v3: 3 }), false, 'the overlay moved');
  assert.equal(s.same(5, 1, { v1: 1, v2: 2, v3: 9 }), false, 'the ductules moved');
  assert.equal(s.same(5, 1, null), false, 'the picture cannot be kept now');
  s.drop();
  assert.equal(s.same(5, 1, ks), false);
});

// ── The kept picture's pass ──
test('the box pass is the kept picture\'s own shader on a full-target triangle, and lints', () => {
  assert.deepEqual(lintGLSL(KEEP_BOX_VS), []);
  assert.deepEqual(lintGLSL(keepFS()), []);
  const need = uniformsOf(keepFS());
  for (const u of need) assert.ok(['uOwn', 'uTis', 'uView', 'uSize', 'uND', 'uD0', 'uD1', 'uCLum', 'uCCell', 'uCEdge', 'uCNuc', 'uEdge', 'uAlpha'].includes(u), `${u} is set by the pass`);
});

function fakeGL() {
  const calls = [], enums = new Map(), progs = [];
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getUniformLocation') return { name: a[1] };
        if (k === 'isContextLost') return false;
        if (k.startsWith('create')) { const o = { obj: nextObj++, kind: k }; if (k === 'createProgram') progs.push(o); return o; }
        return undefined;
      };
    },
  });
  return { gl, calls, progs, name: (k) => calls.filter((c) => c[0] === k) };
}

function pass(over = {}) {
  const f = fakeGL();
  const ks = { tex: { t: 'tissue' }, w: 800, h: 600, v1: 1, v2: 1, v3: 1, ducts: null, view: [1, 0, 0, 1], lum: [0, 0, 0, 1], cell: [0, 0, 0, 1], edge: [0, 0, 0, 1], nuc: [0, 0, 0, 1], width: 1, alpha: 1 };
  const st = { read: () => ks, target: () => ({ fbo: { f: 'scr' }, gen: 1, w: 800, h: 600 }), seq: () => 7, laid: () => { st.asked++; }, asked: 0, ks };
  Object.assign(st, over);
  const lob = createVecLobule(f.gl, { read: () => st.read(), target: () => st.target(), seq: () => st.seq(), laid: () => st.laid() });   // (the host's account is read again each time, so a test moves it)
  return { f, st, lob };
}

test('a blood-only frame repaints the blood\'s boxes in the lobule\'s texture with one scissored triangle each, using only its own program', () => {
  const { f, st, lob } = pass();
  lob.start();
  assert.equal(lob.ready(), true);
  assert.equal(lob.keepBlood(new Float32Array([0, 0, 10, 10]), 1, { t: 'own' }), false, 'nothing kept before a whole present');
  lob.noteLaid(true);
  assert.equal(lob.stamp.on, true);
  const draws0 = f.name('drawArrays').length;
  const boxes = new Float32Array([10, 20, 110, 70, 300, 300, 900, 700, 50, 50, 50, 90]);   // the second runs past the target; the third is empty
  assert.equal(lob.keepBlood(boxes, 3, { t: 'own' }), true);
  const draws = f.name('drawArrays').slice(draws0), sc = f.name('scissor');
  assert.equal(draws.length, 2, 'the empty box draws nothing');
  assert.deepEqual(sc.map((c) => c.slice(1)), [[10, 20, 100, 50], [300, 300, 500, 300]], 'each box is cut to the target');
  assert.ok(draws.every((c) => c[2] === 0 && c[3] === 3), 'one triangle');
  assert.equal(f.progs.length, 1, 'the pass is the only program made');
  assert.equal(f.name('useProgram').length, 1);
  assert.equal(st.asked, 1, 'the host is asked to lay the picture');
  assert.ok(f.name('disable').some((c) => c[1] === f.gl.SCISSOR_TEST), 'the scissor is left off');
});

test('the kept picture is not repainted once anything it was made of has moved', () => {
  for (const [what, change] of [['the tissue', (st) => { st.ks.v1++; }], ['the overlay', (st) => { st.ks.v2++; }], ['the ductules', (st) => { st.ks.v3++; }], ['the vessel layer', (st) => { st.seq = () => 8; }], ['the texture', (st) => { st.target = () => ({ fbo: {}, gen: 2, w: 800, h: 600 }); }], ['a pass that is not still', (st) => { st.read = () => null; }]]) {
    const { st, lob } = pass();
    lob.start(); lob.ready(); lob.noteLaid(true);
    change(st);
    assert.equal(lob.keepBlood(new Float32Array([0, 0, 10, 10]), 1, {}), false, `${what} moved: the frame is laid whole`);
  }
});

// ── The lobule's own geometry ──
// The real lobule layer, booted in node with a capturing bin hook (lobule-zoom.js binAway): the tubes and joins it hands the binning.
const binsKept = new Map();
async function lobuleBins(W, H, lymph) {
  const key = `${W}x${H}${lymph ? 'L' : ''}`;
  if (!binsKept.has(key)) binsKept.set(key, await bootBins(W, H, lymph));
  return binsKept.get(key);
}
async function bootBins(W, H, lymph) {
  const win = page.dom.window;
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' ? BOX : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  for (const [k, v] of [['clientWidth', W], ['clientHeight', H], ['offsetWidth', W], ['offsetHeight', H]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true, writable: true });
  const { createCore } = await import('../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 200 && !frames.length; i++) await new Promise((r) => setTimeout(r, 50));
  core.handle({ type: 'run', running: false });
  const { createVeinsGL, binVeins } = await import(`${R}veins-gl.js`);
  const { createLobuleZoom } = await import(`${R}lobule-zoom.js`);
  const { store } = await import(`${R}store.js`);
  store.set({ lobuleLayers: { ...store.get().lobuleLayers, lymph } });
  const wrap = page.document.getElementById('stageView');
  const cv = page.document.createElement('canvas'); cv.width = W; cv.height = H; wrap.append(cv);
  const veins = createVeinsGL(cv, { tubes: 220, force: true, who: 'stage' });
  let got = null;
  const lz = createLobuleZoom({ host: wrap, binAway: (tubes, joins) => { got = { tubes, joins }; return binVeins(tubes, joins); }, figure: () => veins.top });
  lz.update(frames.at(-1));
  const q = lz.preparePieces();
  for (let i = 0; i < 80 && !got; i++) { if (!lz.prepareRun(q)) break; await new Promise((r) => setImmediate(r)); }
  wrap.removeChild(cv);
  return got;
}

// For each 16-unit cell, the vessels whose reach (the bin reach the lobule gives the binning) touches it: the members a region there holds.
function membersPerCell({ tubes }) {
  const per = new Map();
  for (const t of tubes) {
    const seen = new Set();
    for (let i = 0; i < t.pts.length - 1; i++) {
      const [ax, ay] = t.pts[i], [bx, by] = t.pts[i + 1], r = t.reach, dx = bx - ax, dy = by - ay;
      const x0 = Math.floor((Math.min(ax, bx) - r) / CELL), x1 = Math.floor((Math.max(ax, bx) + r) / CELL), y0 = Math.floor((Math.min(ay, by) - r) / CELL), y1 = Math.floor((Math.max(ay, by) + r) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = `${cx},${cy}`;
        if (seen.has(k)) continue;
        const sx = cx * CELL, sy = cy * CELL;
        let best = Infinity;
        for (let u = 0; u <= 1.0001; u += 0.25) { const qx = ax + dx * u, qy = ay + dy * u; best = Math.min(best, Math.hypot(Math.max(sx - qx, 0, qx - (sx + CELL)), Math.max(sy - qy, 0, qy - (sy + CELL)))); }
        if (best <= r) { seen.add(k); let s = per.get(k); if (!s) per.set(k, s = new Set()); s.add(t.id); }
      }
    }
  }
  let max = 0, at = '', over = 0;
  for (const [k, s] of per) { if (s.size > max) { max = s.size; at = k; } if (s.size > MAX_MEMBERS) over++; }
  return { cells: per.size, max, at, over };
}

const SIZES = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[1440, 900], [1024, 768], [390, 800]];
for (const lymph of [false, true]) {
  test(`the lobule's ${lymph ? 'blood and lymph' : 'blood'} vessels: the most any cell's region would hold, at three sizes`, { timeout: 120000 }, async (t) => {
    const lines = [];
    let worst = 0;
    for (const [W, H] of SIZES) {
      const bins = await lobuleBins(W, H, lymph);
      assert.ok(bins && bins.tubes.length > 100, 'the lobule hands the binning its vessels');
      const c = membersPerCell(bins);
      lines.push(`${W}x${H}: ${bins.tubes.length} vessels, ${c.cells} cells reached, most members in one cell ${c.max} at cell ${c.at}, ${c.over} cells over ${MAX_MEMBERS}`);
      worst = Math.max(worst, c.max);
    }
    t.diagnostic(lines.join('\n'));
    assert.ok(worst <= MAX_MEMBERS, `no cell holds more than ${MAX_MEMBERS} members (most: ${worst})`);
  });
}

// The lobule's binning compiled by A (vec-compile.js): the vessels' radii from the bin reach the lobule gave them (reach = 1.6 × the widest
// radius + the wall + 10), every row on tier 1 as the lobule sends them.
function compileLobule(comp, { tubes, joins }) {
  const { binVeins } = binMod;
  const n = tubes.length, bins = binVeins(tubes, joins);
  const radAll = new Float32Array(n * 64 * 4), tubeNow = new Float32Array(n * 52);
  for (const t of tubes) {
    const wall = 1, r = Math.max(0.5, (t.reach - 10 - wall) / 1.6);
    for (let i = 0; i < 64; i++) radAll[(t.id * 64 + i) * 4] = r;
    tubeNow[t.id * 52 + 3] = wall; tubeNow[t.id * 52 + 7] = 1; tubeNow[t.id * 52 + 8] = 1;
  }
  return comp.createVecCompiler().build(bins, n, { tubeNow, radAll });
}
const binMod = await import(`${R}veins-gl.js`);
for (const lymph of [false, true]) {
  test(`the lobule's ${lymph ? 'blood and lymph' : 'blood'} binning compiled by A has no region over MAX_MEMBERS`, { timeout: 120000 }, async (t) => {
    const comp = await waits('vec-compile.js');
    if (!comp) return t.skip('waits for A: vec-compile.js');
    const lines = [];
    let joinsOver = 0;
    for (const [W, H] of SIZES) {
      const view = compileLobule(comp, await lobuleBins(W, H, lymph));
      const st = view.stats;
      lines.push(`${W}x${H}: ${st.simple} stretch cells, ${st.regions} regions (join ${st.join}, cross ${st.cross}, crosstier ${st.crosstier}, hairpin ${st.hairpin}, near ${st.near}, long ${st.long}), most members ${st.maxMembers}, most joins ${st.maxJoins}, regions over ${MAX_MEMBERS}: ${st.overMembers}`);
      assert.equal(view.tooWide, false, `${W}x${H}: the grid fits the cell texture`);
      assert.equal(st.overMembers, 0, `${W}x${H}: no region lists more than ${MAX_MEMBERS} members (most: ${st.maxMembers})`);
      if (st.overJoins > 0) joinsOver = Math.max(joinsOver, st.maxJoins);
      assert.ok(st.regions > 0 && st.simple > 0, 'the lobule has both ordinary stretches and regions');
    }
    t.diagnostic(lines.join('\n'));
    // Joins per region: the lobule's central vein takes 12 joins inside a few cells (stop point 7, waiting for Mohammad's answer on MAX_JOINS).
    if (joinsOver) t.todo(`regions list up to ${joinsOver} joins, the contract holds ${MAX_JOINS} (waiting for Mohammad's answer)`);
  });
}

// The lobule's instance under the seam (veins-gl.js who 'lobule', workstream H), with a Vector renderer that only remembers what it is told.
const frame = await import(`${R}frame.js`);
const veinsMod = await import(`${R}veins-gl.js`);
function seamGL() {
  const calls = [], enums = new Map(), src = new Map(), attached = new Map(), progOf = new Map();
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
  const textOf = (p) => (attached.get(p) || []).map((x) => src.get(x) || '').join('\n');
  return { gl, calls, progOf, textOf };
}
const LOOK = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(veinsMod.MAX_TIERS).fill(1), tierGroup: Array(veinsMod.MAX_TIERS).fill(0) };
const IDENT = [1, 0, 0, 1, 0, 0];

test('the lobule\'s instance under Vector calls no classic or mesh vessel program, and tells Vector which rows show blood', () => {
  frame.setVesselRenderer('vector');
  const told = [];
  const standIn = new Proxy({}, { get: (_, k) => (typeof k !== 'string' || k === 'then' || k === 'failure' ? undefined : k === 'status' ? () => 'ready' : (...a) => { told.push([k, ...a]); return k === 'drawRows' ? true : undefined; }) });
  veinsMod.setVectorFactory(() => standIn);
  const f = seamGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  let presented = 0;
  const g = veinsMod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule', share: { gl: f.gl, canvas, present() { presented++; } } });
  assert.ok(g, 'the lobule\'s instance is made');
  const line = (y) => Array.from({ length: veinsMod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(veinsMod.binVeins([0, 1, 2, 3].map((id) => ({ id, pts: line(100 + id * 60), reach: 30 })), []));
  // (Row 0 a blood stream, row 1 a lymph row (texel 1.x = -1), row 2 a vessel seen end-on, row 3 blood with a flow factor of 0.)
  const flow = new Float32Array(4 * FT * 4);
  for (const r of [0, 1, 3]) flow[r * FT * 4 + F1Z] = 1;
  flow[1 * FT * 4 + F1X] = LYMPH_MARK;
  g.setFlow(flow);
  const n0 = f.calls.length;
  g.draw(IDENT, LOOK, { on: true }, null);
  g.composite(LOOK, { on: true });
  const used = f.calls.slice(n0).filter((c) => c[0] === 'useProgram' && c[1]);
  assert.equal(used.length, 0, 'no classic or mesh vessel program was used');
  const rows = told.filter((c) => c[0] === 'setBloodRows').at(-1);
  assert.ok(rows, 'Vector is told which rows can show blood');
  assert.deepEqual([...rows[1].subarray(0, rows[2])], [0, 1, 3], 'the end-on row is left out, the lymph row is in');
  assert.equal(g.top.kept, false, 'nothing is kept before a whole present laid the picture');
  const n = told.filter((c) => c[0] === 'setBloodRows').length;
  g.setFlow(flow);
  assert.equal(told.filter((c) => c[0] === 'setBloodRows').length, n, 'the same rows are not told again');
  void presented;
});

test('the lobule\'s lymph rows reach lymphAt in Vector\'s blood material', async (t) => {
  const blood = await waits('vec-blood-glsl.js');
  if (!blood) return t.skip('waits for D: vec-blood-glsl.js');
  // (D's port of lymphAt is vbLymph: a row whose flow texel 1.x is the lymph mark, with strength above 0, gets the dashes and the albumin core.)
  const glsl = blood.VEC_BLOOD_GLSL;
  assert.match(glsl, /void vbLymph\(/, 'the blood material has the lymph dashes');
  assert.match(glsl, /isLy\s*=\s*f1\.x\s*<\s*-0\.5/, 'a lymph row is the one whose flow texel 1.x is negative');
  assert.match(glsl, /isLy && f1\.z > 0\.0\)\s*\{[^}]*vbLymph\(/, 'a lymph row with strength is drawn by vbLymph');
});
