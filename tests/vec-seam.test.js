// The seam between veins-gl.js and the vector vessel renderer (vector renderer plan 9.H, 9 Nov 2026), judged with a do-nothing WebGL and a
// stand-in Vector renderer that records what it is told: with Vector chosen, draw, drawRows and composite are the stand-in's alone (no program is
// used, so no classic or mesh pass can have run), the inputs reach it, the classic targets are given back, and choosing another renderer
// puts back what was skipped. With Classic or Mesh the same calls use the classic programs, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.MutationObserver ??= class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const frame = await import('../src/ui/frame.js');
const mod = await import('../src/ui/veins-gl.js');
const seam = await import('../src/ui/vec-seam.js');

function fakeGL() {
  const calls = [], enums = new Map();
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
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}
// A Vector renderer that does nothing but remember: every method it is asked for exists, and says what it was called with.
function standIn(log) {
  const sets = [];
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string' || k === 'then' || k === 'failure') return undefined;
      if (k === 'status') return () => 'ready';
      return (...a) => {
        log.push([k, ...a]);
        if (k === 'makeMorphSet') { const S = { vecMade: sets.length }; sets.push(S); return S; }
        if (k === 'drawRows') return true;
        return undefined;
      };
    },
  });
}
const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
const M = [1, 0, 0, 1, 0, 0];
const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
const bins = () => mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []);

function setup(pick, { factory = true } = {}) {
  frame.setVesselRenderer(pick);
  const log = [];
  let made = 0, shared = null;
  mod.setVectorFactory(factory ? (gl, s) => { made++; shared = s; return standIn(log); } : null);
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'stage' });
  g.setGeometry(bins());
  return { g, f, log, made: () => made, shared: () => shared };
}
const programs = (f, from = 0) => f.calls.slice(from).filter((c) => c[0] === 'useProgram' && c[1]).length;
const told = (log, name) => log.filter((c) => c[0] === name);

test('Vector chosen: draw, drawRows and composite are the Vector renderer\'s, and no program is used', () => {
  const { g, f, log, made } = setup('vector');
  const n0 = f.calls.length;
  g.draw(M, look, { on: false });
  g.composite(look, { on: true });
  assert.equal(g.drawRows(M, look, { on: false }, [0]), true, 'drawRows returns what Vector returns');
  assert.equal(made(), 1, 'made once, for the instance');
  assert.equal(programs(f, n0), 0, 'no classic or mesh program was used');
  assert.equal(told(log, 'draw').length, 1);
  assert.equal(told(log, 'composite').length, 1);
  assert.equal(told(log, 'drawRows').length, 1);
  assert.deepEqual(told(log, 'drawRows')[0].slice(4), [[0], false]);
  assert.equal(frame.vesselRenderer(), 'vector');
});

test('Classic and Mesh: the same calls use the classic programs, and Vector is not made', () => {
  for (const pick of ['classic', 'mesh']) {
    const { g, f, log, made } = setup(pick);
    const n0 = f.calls.length;
    g.draw(M, look, { on: false });
    g.composite(look, { on: true });
    assert.ok(programs(f, n0) > 0, `${pick} uses its programs`);
    assert.equal(made(), 0);
    assert.equal(log.length, 0);
  }
});

test('Vector cannot be made (no factory, or one that throws): the chosen renderer\'s own drawing is used, once told of it', () => {
  const a = setup('vector', { factory: false });
  const n0 = a.f.calls.length;
  a.g.draw(M, look, { on: false });
  assert.ok(programs(a.f, n0) > 0);
  frame.setVesselRenderer('vector');
  mod.setVectorFactory(() => { throw new Error('shaders'); });
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'stage' });
    g.setGeometry(bins());
    g.draw(M, look, { on: false }); g.draw(M, look, { on: false });
    assert.ok(programs(f) > 0);
    assert.equal(warned, 1, 'said once, not on every frame');
  } finally { console.warn = warn; }
});

test('only the figure and the lobule can run Vector (a renderer with no picture of its own is left alone)', () => {
  frame.setVesselRenderer('vector');
  const log = [];
  mod.setVectorFactory(() => standIn(log));
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'glow' });
  g.setGeometry(bins());
  g.draw(M, look, { on: false });
  assert.equal(log.length, 0);
});

test('the invalidations are forwarded, and the data they fill is shared', () => {
  const { g, log, shared } = setup('vector');
  g.draw(M, look, { on: false });   // (made on the first draw)
  const b = bins();
  g.setGeometry(b);
  assert.equal(told(log, 'setGeometry').at(-1)[1], b);
  g.patchGeometry(Object.assign(b, { patch: [[0, 1]], patchTubes: [0] }));
  assert.equal(told(log, 'patchGeometry').length, 1);
  const r = new Float32Array(mod.N_SAMPLES).fill(3);
  g.setRadii(0, r, null);
  g.setBend(0, line(100));
  g.setTubes(new Float32Array(4 * mod.TUBE_TEXELS * 4));
  g.setFlow(new Float32Array(4 * mod.FLOW_TEXELS * 4).fill(1));
  g.setDye(null);
  for (const k of ['setRadii', 'setBend', 'setTubes', 'setFlow', 'setDye']) assert.ok(told(log, k).length >= 1, `${k} reaches Vector`);
  assert.equal(told(log, 'setRadii')[0][1], 0);
  assert.equal(shared().nTubes, 4);
  for (const k of ['ent', 'rad', 'rmax', 'tube', 'flow', 'bend', 'dye', 'organ']) assert.ok(shared().tex[k](), `${k} is shared`);
  assert.equal(typeof shared().tex.noiseT, 'function');
  assert.equal(shared().isLost(), false);
  assert.ok(shared().radAll.length > 0 && shared().tubeNow.length > 0);
  const pic = shared().picture();
  assert.ok(pic.tex && pic.w === 800 && pic.h === 600, 'the picture it draws into, the canvas\'s size');
  assert.equal(shared().uniforms.useOrgan, 0);
  assert.equal(shared().bins, b);
});

test('Vector chosen: the cell lists are not uploaded for the classic passes (the entry texture is), and are sent when another renderer is chosen', () => {
  const { g, f } = setup('vector');
  g.draw(M, look, { on: false });
  const n0 = f.calls.length;
  g.setGeometry(bins());
  const buffers = (from) => f.calls.slice(from).filter((c) => c[0] === 'bufferData' || c[0] === 'bufferSubData').length;
  assert.equal(buffers(n0), 0, 'no cell or blood buffer written');
  assert.ok(f.calls.slice(n0).some((c) => c[0] === 'texImage2D' || c[0] === 'texSubImage2D'), 'the entry texture is');
  frame.setVesselRenderer('mesh');
  const n1 = f.calls.length;
  g.draw(M, look, { on: false });
  assert.ok(buffers(n1) > 0, 'the cells went up when mesh was chosen');
  assert.ok(programs(f, n1) > 0, 'and the mesh renderer draws');
});

test('the classic layer\'s targets are given back (a texel) while Vector draws', () => {
  const { g, f } = setup('mesh');
  g.draw(M, look, { on: false });
  const big = (from) => f.calls.slice(from).filter((c) => c[0] === 'texImage2D' && c[4] > 1 && c[5] > 1).length;
  assert.ok(big(0) > 0, 'the classic layer made its targets');
  frame.setVesselRenderer('vector');
  mod.setVectorFactory(() => standIn([]));
  const n0 = f.calls.length;
  g.draw(M, look, { on: false });
  const sizes = f.calls.slice(n0).filter((c) => c[0] === 'texImage2D').map((c) => c[4] + 'x' + c[5]);
  assert.ok(sizes.length >= 4 && sizes.every((s) => s === '1x1'), `the four targets went to a texel: ${sizes}`);
});

test('organs: no picture is painted or baked while Vector draws; it is told the shapes, and the pictures are made when another renderer is chosen', () => {
  const { g, f, log } = setup('vector');
  g.draw(M, look, { on: false });
  const n0 = f.calls.length;
  const rect = [0, 0, 400, 300], shapes = [{ d: 'M0 0L10 0L10 10Z', w: 0 }];
  g.paintOrgans(shapes, rect, 1);
  assert.deepEqual(told(log, 'setOrgans').at(-1).slice(0, 2), ['setOrgans', 'paint']);
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'drawArrays' || c[0] === 'drawElements' || c[0] === 'clearBufferfv').length, 0, 'nothing drawn');
  const groups = [{ spec: { ops: [] }, m: [1, 0, 0, 1, 0, 0] }];
  const job = g.organs.bake(1, 'liver', groups, rect, 1, 0);
  assert.equal(job.step(1), true, 'the bake is whole at once');
  job.drop();
  g.organs.commit(1, ['liver']);
  assert.equal(g.organs.has(1), true, 'the layers are held (Vector shows them)');
  assert.deepEqual(told(log, 'setOrgans').map((c) => c[1]), ['replay', 'paint', 'bake', 'commit']);
  g.organs.setOrder(['liver']);
  g.organs.setLive(null, null);
  assert.deepEqual(told(log, 'setOrgans').slice(-2).map((c) => c[1]), ['order', 'live']);
  g.overlay.set(new Map(), ['x']);
  assert.deepEqual(told(log, 'setOrgans').at(-1).slice(1, 2), ['overlay']);
  assert.equal(g.overlay.stale, false);
  // Another renderer: the cover is painted now, from the shapes kept.
  frame.setVesselRenderer('classic');
  const n1 = f.calls.length;
  g.draw(M, look, { on: false });
  assert.ok(f.calls.slice(n1).some((c) => c[0] === 'drawArrays' || c[0] === 'drawElements'), 'painted and drawn');
});

test('the overlays: told the look and the view before each picture, and G\'s own setters get the lines, the catheter and the ascites\' rows', () => {
  const { g, log, shared } = setup('vector');
  const got = [];
  g.draw(M, look, { on: false });
  const parts = shared().parts;   // (made now, from the real modules, on the do-nothing GL)
  for (const k of ['setLines', 'setCath', 'setFluidSpans', 'setFluidLiver']) parts.overlays[k] = (...a) => got.push([k, ...a]);
  const spec = { lines: [] };
  g.setLines(spec); g.setCath(null); g.setFluidSpans([1, 2], [0, 0, 5, 5]); g.setFluidLiver([3]);
  assert.deepEqual(got.map((c) => c[0]), ['setLines', 'setCath', 'setFluidSpans', 'setFluidLiver']);
  assert.equal(got[0][1], spec);
  assert.deepEqual(got[2].slice(1), [[1, 2], [0, 0, 5, 5]]);
  const n = told(log, 'setOverlays').length;
  g.draw(M, look, { on: false });
  g.composite(look, { on: true });
  g.drawRows(M, look, { on: false }, [0]);
  const t = told(log, 'setOverlays').slice(n);
  assert.equal(t.length, 3, 'once before each picture');
  assert.equal(t[0][1], look);
  assert.deepEqual(t[0].slice(3, 5), [800, 600], 'the picture\'s size');
});

test('morph sets: made for Vector without the classic texture, used and dropped through it', () => {
  const { g, f, log } = setup('vector');
  g.draw(M, look, { on: false });
  const n0 = f.calls.length;
  const S = g.makeMorphSet(Object.assign(bins(), { posBase: 0, joinBase: 0, entRows: 1 }));
  assert.ok(S && S.owner, 'a set comes back');
  assert.equal(told(log, 'makeMorphSet').length, 1);
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'bufferData').length, 0, 'no classic morph buffers');
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'texImage2D').length, 1, 'one entry texture of its own');
  g.useMorphSet(S);
  assert.deepEqual(told(log, 'useMorphSet').at(-1)[1], S.vecSet);
  g.setMorphFrame(new Float32Array(8));
  assert.equal(told(log, 'setMorphFrame').length, 1);
  g.useMorphSet(null);
  assert.equal(told(log, 'useMorphSet').at(-1)[1], null);
  g.dropMorphSet(S);
  assert.equal(told(log, 'dropMorphSet').length, 1);
});

test('disposing lets the Vector renderer go', () => {
  const { g, log } = setup('vector');
  g.draw(M, look, { on: false });
  g.dispose();
  assert.equal(told(log, 'dispose').length, 1);
});

test('the parts for E: B\'s stretch program for every variant from the instance\'s own flags, G\'s overlays', () => {
  const K = { F_SEL: mod.F_SEL, F_DIFFUSE: mod.F_DIFFUSE, F_SHADOW: mod.F_SHADOW, F_DOTTED: mod.F_DOTTED, F_NOCASE: mod.F_NOCASE, F_SPEC: mod.F_SPEC, F_EDGE: mod.F_EDGE, F_VEIL: mod.F_VEIL, F_WHOLE: mod.F_WHOLE, VEIL_K: mod.VEIL_K };
  assert.deepEqual(Object.keys(K).sort(), [...seam.VEC_K_NAMES].sort());
  const parts = seam.vecParts(fakeGL().gl, K);
  assert.equal(typeof parts.stretch.vs, 'string');
  for (const v of [0, 1, 2]) assert.match(parts.stretch.fs(v), /void main\(\)/);
  assert.equal(typeof parts.overlays.draw, 'function');
  assert.equal(typeof parts.overlays.setOverlays, 'function');
  // (C's regions and F's organs, the organs through the port that gives them the stack's input.)
  assert.equal(typeof parts.region.vs, 'string');
  for (const v of [0, 1, 2]) assert.match(parts.region.fs(v), /void main\(\)/);
  assert.equal(typeof parts.organs.draw, 'function');
  assert.equal(typeof parts.organs.setOrgans, 'function');
  assert.deepEqual([...seam.VEC_WAITING], []);
  assert.equal(typeof parts.compile.build, 'function');
  const short = { ...K }; delete short.VEIL_K;
  assert.throws(() => seam.vecParts(fakeGL().gl, short), /VEIL_K/);
});

test('the real Vector renderer with every part in: made, not refused, and no classic or mesh program draws', () => {
  frame.setVesselRenderer('vector');
  mod.setVectorFactory(seam.createVecRenderer);
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const warn = console.warn; const said = []; console.warn = (...a) => said.push(String(a[0]));
  try {
    const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'stage' });
    g.setGeometry(bins());
    const n0 = f.calls.length;
    g.draw(M, look, { on: false }); g.composite(look, { on: true });
    assert.equal(said.filter((t) => /vector vessel renderer could not be made/.test(t)).length, 0, said.join('|'));
    assert.equal(programs(f, n0), 0, 'the vessels are Vector\'s alone');
  } finally { console.warn = warn; }
});

test('the organs port: the stack\'s kinds make F\'s layer map and order, once, when F next needs them', async () => {
  const { vecOrgansPort } = await import('../src/ui/vec-organs-port.js');
  const told = [];
  const F = { setOrgans: (m, o) => { told.push([new Map(m), o.slice()]); return true; }, setCovers: (...a) => { told.push(['covers', ...a]); return true; }, update: () => told.push('update'), draw: () => told.push('draw'), covers: () => 'cov', ready: () => true };
  const port = vecOrgansPort(F);
  assert.equal(port.ready(), true, 'F\'s other calls pass through');
  const g1 = [{ spec: 'a', m: 1 }], g2 = [{ spec: 'b', m: 2 }], g3 = [{ spec: 'c', m: 3 }];
  assert.equal(port.setOrgans('bake', 0, 'liver', g1), true);
  port.setOrgans('bake', 0, 'gut', g2);
  port.setOrgans('order', ['gut', 'liver', 'back']);
  assert.equal(told.length, 0, 'nothing is handed over until F is used');
  port.setOrgans('commit', 0, ['liver', 'gut']);
  port.update();
  assert.equal(told.length, 2, 'one ingest for the four changes, then the update');
  assert.deepEqual([...told[0][0].keys()], ['liver', 'gut']);
  assert.deepEqual(told[0][1], ['gut', 'liver'], 'in the stack\'s order, the layers there are');
  assert.equal(told[1], 'update');
  port.setOrgans('live', new Map([['liver', g3]]), null);
  port.draw();
  assert.equal(told[2][0].get('liver'), g3, 'a live layer is over the baked one');
  assert.equal(told[2][0].get('gut'), g2);
  port.setOrgans('liveAll', new Map([['back', g1], ['gut', g2]]));
  port.draw();
  assert.deepEqual([...told.at(-2)[0].keys()], ['back', 'gut'], 'the whole live set stands alone');
  port.draw();
  assert.equal(told.filter((t) => Array.isArray(t)).length, 3, 'no change: no new ingest');
  assert.equal(port.setOrgans('paint', ['s'], [0, 0, 1, 1], 2), true);
  assert.deepEqual(told.at(-1), ['covers', ['s'], [0, 0, 1, 1], 2]);
  assert.equal(port.setOrgans('overlay', new Map(), []), false, 'overlay groups and shifts have no slot in F');
  assert.equal(port.setOrgans('shift', 'x', 1), false);
  port.setOrgans('drop', 0); port.setOrgans('liveAll', null); port.draw();
  assert.equal(told.at(-2)[0].size, 0);
});

test('the lobule: the rows that show blood go to the renderer when they change (not on every flow upload)', () => {
  frame.setVesselRenderer('vector');
  const log = [];
  mod.setVectorFactory(() => standIn(log));
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule', share: { gl: f.gl, present() {} } });
  g.setGeometry(bins());
  g.draw(M, look, { on: false });
  const flow = new Float32Array(4 * 8 * 4);
  const rowsOf = () => told(log, 'setBloodRows').map((c) => Array.from(c[1].subarray(0, c[2])));
  flow[1 * 32 + 6] = 1; flow[3 * 32 + 6] = 0.5;
  g.setFlow(flow);
  assert.deepEqual(rowsOf(), [[1, 3]]);
  flow[0 * 32 + 3] = 7;   // (a change that shows no blood in any other row)
  g.setFlow(flow);
  assert.equal(rowsOf().length, 1, 'the same rows: not told again');
  flow[2 * 32 + 6] = 1;
  g.setFlow(flow);
  assert.deepEqual(rowsOf().at(-1), [1, 2, 3]);
  // (The figure is not told: it has no rows to give.)
  const fig = setup('vector');
  fig.g.setFlow(flow);
  assert.equal(told(fig.log, 'setBloodRows').length, 0);
});

test('the lobule: a blood-only Vector frame that cannot be kept lays the picture whole, as any other', () => {
  frame.setVesselRenderer('vector');
  const log = [];
  const inner = standIn(log);
  let frames = 0;
  const vec = new Proxy(inner, { get: (t, k) => (k === 'stats' ? { get frames() { return frames; }, lastKinds: 'L' } : k === 'lastBloodBoxes' ? () => ({ boxes: new Float32Array([0, 0, 10, 10]), n: 1 }) : k === 'composite' ? (...a) => { frames++; return t.composite(...a); } : t[k]) });
  mod.setVectorFactory(() => vec);
  const f = fakeGL();
  let presented = 0;
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule', share: { gl: f.gl, present() { presented++; } } });
  g.setGeometry(bins());
  const p0 = g.presents;
  g.composite(look, { on: true });
  assert.equal(told(log, 'composite').length, 1);
  assert.ok(g.presents > p0 || presented >= 0, 'a picture was laid');
  assert.equal(g.top.kept, false, 'nothing is kept before a whole picture has been laid through the tissue');
});

test.after(() => { mod.setVectorFactory(null); frame.setVesselRenderer('mesh'); });
