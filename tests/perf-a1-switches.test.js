import { test } from 'node:test';
import assert from 'node:assert/strict';

// Performance recommendation A1: the four speed features the 4 Nov flicker chase switched off, turned back on one at a time
// (each its own commit, so any one can come back alone). The GL context is recorded, not run; a fake requestAnimationFrame
// drives the frame scheduler, so a present asked inside a frame is told from one asked outside it.

const rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a.map((x) => (Array.isArray(x) ? [...x] : ArrayBuffer.isView(x) ? x.slice() : x))]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getContextAttributes') return { stencil: true };
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls, enums };
}
const mod = await import('../src/ui/veins-gl.js');
const { frame } = await import('../src/ui/frame.js');
function renderer(who = 'stage') {
  const f = fakeGL();
  let attrs = null;
  const canvas = { width: 800, height: 600, getContext: (_, a) => { attrs = a; return f.gl; }, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, canvas, look, attrs: () => attrs };
}
const M1 = [1, 0, 0, 1, 0, 0];
// One browser frame of the scheduler: the callbacks asked for run, then the frame's end.
let tick = 0;
function runFrame(fn) {
  // (The scheduler hands a callback's throw to a timer: an assertion made inside the frame is kept here and thrown after it.)
  let err = null;
  frame(() => { try { fn(); } catch (e) { err = e; } }, 'a1-test');
  const cb = rafs.shift();
  assert.ok(cb, 'a frame was asked for');
  cb(16 * ++tick);
  if (err) throw err;
}
// (A pass drawn over the figure, as the labels' and the glasses' are: it counts its draws.)
function withTop(g) {
  const t = { draws: 0, order: 0, draw() { t.draws++; } };
  g.top.add(t);
  return t;
}

// ── A1.1: the narrow fold ──
test('A1.1: a host\'s ask outside a frame is laid at once', () => {
  const { g, look } = renderer();
  g.draw(M1, look, { on: false });
  const t = withTop(g), p0 = g.top.presents;
  g.top.ask();
  assert.equal(g.top.presents, p0 + 1);
  assert.equal(t.draws, 1);
});

test('A1.1: a host\'s ask inside a frame waits for the frame\'s end and is laid once for any number of asks', () => {
  const { g, look } = renderer();
  g.draw(M1, look, { on: false });
  const t = withTop(g), p0 = g.top.presents;
  runFrame(() => {
    g.top.ask(); g.top.ask(); g.top.ask();
    assert.equal(g.top.presents, p0, 'nothing laid yet');
  });
  assert.equal(g.top.presents, p0 + 1, 'one picture, at the frame\'s end');
  assert.equal(t.draws, 1, 'the passes over the figure drawn once');
  // (After the frame's end, a lone ask is laid at once again.)
  g.top.ask();
  assert.equal(g.top.presents, p0 + 2);
});

test('A1.1: the figure\'s own draw in the frame lays the picture, and the ask is dropped: one present, one draw of the passes over it', () => {
  const { g, look } = renderer();
  g.draw(M1, look, { on: false });
  const t = withTop(g), p0 = g.top.presents, d0 = t.draws;
  runFrame(() => {
    g.top.ask();
    g.draw([1, 0, 0, 1, 7, 0], look, { on: false });
    assert.equal(g.top.presents, p0 + 1, 'the draw\'s own present, laid at once');
  });
  assert.equal(g.top.presents, p0 + 1, 'no second present at the frame\'s end');
  assert.equal(t.draws - d0, 1);
});

test('A1.1: the figure\'s own present is never folded: it is laid at once, in a frame', () => {
  const { g, look } = renderer();
  g.draw(M1, look, { on: true });
  const p0 = g.top.presents;
  runFrame(() => {
    g.present();
    assert.equal(g.top.presents, p0 + 1);
    g.present(true, true);
    assert.equal(g.top.presents, p0 + 2, 'the public present stays immediate even with `again`');
  });
  assert.equal(g.top.presents, p0 + 2, 'and nothing is owed at the frame\'s end');
});

test('A1.1: a picture laid without the passes over the figure does not satisfy the ask', () => {
  const { g, look } = renderer();
  g.draw(M1, look, { on: true });
  g.composite(look, { on: true });   // (through the kept picture: a present of the figure alone copies it, with no recompose)
  const t = withTop(g), p0 = g.top.presents, d0 = t.draws;
  runFrame(() => {
    g.top.ask();
    g.present(false);   // (the figure alone: a snapshot's, the passes are not laid)
    assert.equal(g.top.presents, p0 + 1);
    assert.equal(t.draws, d0);
  });
  assert.equal(t.draws - d0, 1, 'the ask is laid at the frame\'s end');
  assert.equal(g.top.presents, p0 + 2);
});

test('A1.1: a reader that takes the canvas in the frame (capture) lays the pending ask first, and the ask is not laid again', () => {
  const { g, look, f } = renderer();
  g.draw(M1, look, { on: true });
  const t = withTop(g), p0 = g.top.presents, d0 = t.draws;
  runFrame(() => {
    g.top.ask();
    const n = f.calls.length;
    assert.equal(g.capture().width, 800);
    assert.ok(f.calls.slice(n).some((c) => c[0] === 'blitFramebuffer'), 'the kept picture laid onto the canvas before the read');
    assert.equal(g.top.presents, p0 + 1);
    assert.equal(t.draws - d0, 1);
  });
  assert.equal(g.top.presents, p0 + 1, 'nothing more at the frame\'s end');
});

// ── A1.2: still lumens while blood flows ──
const STRIDE = mod.FLOW_TEXELS * 4;
// (A flow table of four rows: the first `n` carry blood, strength above 0 in flow texel 1, z.)
function flowRows(n) {
  const d = new Float32Array(4 * STRIDE);
  for (let r = 0; r < n; r++) d[r * STRIDE + 6] = 1;
  return d;
}
const movedCol = (f, from) => {
  const up = f.calls.slice(from).filter((c) => c[0] === 'texSubImage2D' && c[3] === mod.FLOW_TEXELS && c[5] === 1 && c[6] === 4).at(-1);
  return up ? [0, 1, 2, 3].map((r) => up[9][r * 4]) : null;
};
function flowing(rows) {
  const r = renderer();
  r.g.setFlow(flowRows(rows));
  r.g.draw(M1, r.look, { on: true, bt: 1 });
  r.g.composite(r.look, { on: true, bt: 1 });   // (the blood's own frame: the rows and uniforms are now the last picture's)
  return r;
}

test('A1.2: blood standing still: the blood\'s frame is not drawn at all', () => {
  const { g, look } = flowing(2);
  assert.equal(g.composite(look, { on: true, bt: 1 }), false);
});

test('A1.2: no row carries blood: a moving clock draws nothing, every lumen is left as drawn', () => {
  const { g, look } = flowing(0);
  assert.equal(g.composite(look, { on: true, bt: 2 }), false);
  assert.equal(g.composite(look, { on: true, bt: 3 }), false);
});

test('A1.2: blood flowing: the frame is drawn, and only the lumens of the rows that carry blood are marked to be drawn again', () => {
  const { g, f, look } = flowing(2);
  for (const bt of [2, 3, 4]) {
    assert.notEqual(g.composite(look, { on: true, bt }), false, `drawn at clock ${bt}`);
    // (What the lumen pass reads, flow texel 8 x: the last upload; it goes up only when it differs from the one before.)
    assert.deepEqual(movedCol(f, 0), [1, 1, 0, 0], `rows 0 and 1 carry blood; 2 and 3 are left alone (clock ${bt})`);
  }
  // (The clock still: the marks were taken as drawn, and the next frame has nothing to show.)
  assert.equal(g.composite(look, { on: true, bt: 4 }), false);
});

test('A1.2: a row that starts to carry blood while the clock runs is drawn again with its row, and one that stops carrying it too', () => {
  const { g, f, look } = flowing(1);
  let n = f.calls.length;
  g.composite(look, { on: true, bt: 2 });
  assert.deepEqual(movedCol(f, n), [1, 0, 0, 0]);
  g.setFlow(flowRows(2));
  n = f.calls.length;
  g.composite(look, { on: true, bt: 3 });
  assert.deepEqual(movedCol(f, n), [1, 1, 0, 0], 'row 1 changed in the table and now carries blood');
  g.setFlow(flowRows(1));
  n = f.calls.length;
  g.composite(look, { on: true, bt: 3 });
  assert.deepEqual(movedCol(f, n), [0, 1, 0, 0], 'row 1 changed in the table: drawn once more, without blood');
  assert.equal(g.composite(look, { on: true, bt: 3 }), false);
});

test('A1.2: blood off or a uniform changed: drawn as before (the signature still holds the rest)', () => {
  const { g, look } = flowing(2);
  assert.notEqual(g.composite(look, { on: false, bt: 1 }), false, 'blood switched off');
  assert.notEqual(g.composite(look, { on: true, bt: 1 }), false, 'and on');
  assert.notEqual(g.composite(look, { on: true, bt: 1, alpha: 0.5 }), false, 'faded');
});
