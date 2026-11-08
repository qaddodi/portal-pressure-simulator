import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageSource } from './stage-src.js';

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
        calls.push([k, ...a.map((x) => (Array.isArray(x) ? [...x] : x))]);
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
  g.draw(M1, look, { on: true });   // (through the kept picture: a present of the figure alone copies it, with no recompose)
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

test('A1.1: the stage\'s label and glass hosts ask through top.ask; the other hosts and the figure\'s own present stay immediate', () => {
  const stage = stageSource();
  assert.match(stage, /ask: \(\) => veins\?\.top\?\.ask\(\), now: \(\) => veins\?\.top\?\.ask\(\), active:/);
  const glass = readFileSync(new URL('../src/ui/stage-glass.js', import.meta.url), 'utf8');
  assert.match(glass, /now: \(\) => \{ if \(live\.veins && !live\.veins\.lost\) live\.veins\.top\.ask\(\); \}/);
  const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(veins, /const PRES_FOLD = true;/);
  assert.match(veins, /present: \(\) => present\(true, true\),/, 'top.present (the lobule\'s, the sinusoid\'s, the covers\') is laid at once');
  assert.match(veins, /setCameraRec[\s\S]{0,400}if \(!lost\) present\(true, true\);/, 'the camera\'s own present is the figure\'s');
});
