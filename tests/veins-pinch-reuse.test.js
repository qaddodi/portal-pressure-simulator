import { test } from 'node:test';
import assert from 'node:assert/strict';

// Settings › Figure performance › Pinch frame reuse (30 Oct, off by default): while a hand zooms in, some one-pass frames lay the
// last shaded picture again, moved and scaled, instead of shading the figure. Off, or with no hand on it, every frame is as before.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
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
        calls.push([k, ...a]);
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
  return { gl, calls };
}
// (Written for the canvas that keeps its own picture: pinned to ?vesselbuf=keep. The kept-picture default is covered by veins-own-buffer.test.js.)
globalThis.location = { search: '?vesselbuf=keep' };
const mod = await import('../src/ui/veins-gl.js');
delete globalThis.location;
function renderer() {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, canvas, look };
}
const zoomAt = (k) => [k, 0, 0, k, 400 - 400 * k, 300 - 300 * k];   // (k× about the canvas centre)

// A frame's kind from its calls: shaded by the one-pass builds (they mark the stencil), the kept picture laid again, or neither.
function frames(g, f, look, ms) {
  const out = [];
  for (const m of ms) {
    const n0 = f.calls.length;
    g.draw(m, look, { on: false });
    const c = f.calls.slice(n0);
    out.push(g.reused ? 'reused' : c.some((x) => x[0] === 'stencilFunc') ? 'shaded' : 'whole');
    if (g.reused) assert.ok(!c.some((x) => x[0] === 'stencilFunc' || x[0] === 'drawArraysInstanced'), 'nothing shaded on a reused frame');
  }
  return out;
}
const blitsIn = (f, n0) => f.calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer').length;
const pinch = (from, step, n) => Array.from({ length: n }, (_, i) => zoomAt(from * step ** (i + 1)));

test('off: every zoom frame is shaded, and nothing is kept', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  const n0 = f.calls.length;
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 6)), Array(6).fill('shaded'));
  assert.equal(blitsIn(f, n0), 0);
  g.setReuse(0, true);   // (the switch off with a hand on the figure: the same)
  assert.deepEqual(frames(g, f, look, pinch(1.2, 1.02, 4)), Array(4).fill('shaded'));
  assert.equal(blitsIn(f, n0), 0);
});

test('on, a hand zooming in: every other frame laid again, then two of three', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setReuse(2, true);
  const n0 = f.calls.length;
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 6)), ['shaded', 'reused', 'shaded', 'reused', 'shaded', 'reused']);
  assert.equal(blitsIn(f, n0), 3, 'the picture kept once per shaded frame');
  g.setReuse(3, true);
  assert.deepEqual(frames(g, f, look, pinch(1.3, 1.02, 6)), ['shaded', 'reused', 'reused', 'shaded', 'reused', 'reused']);
});

test('on, with no hand on the figure (a slide\'s camera): every frame shaded, nothing kept', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setReuse(2, false);
  const n0 = f.calls.length;
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 4)), Array(4).fill('shaded'));
  assert.equal(blitsIn(f, n0), 0);
});

test('on, zooming out: the edges would be uncovered, so every frame is shaded', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(2), look, { on: false });
  g.setReuse(2, true);
  assert.deepEqual(frames(g, f, look, pinch(2, 0.98, 4)), Array(4).fill('shaded'));
});

test('the view a pinch stops at is drawn whole after a reused frame; a hand let go drops the kept picture', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setReuse(2, true);
  const ms = pinch(1, 1.02, 2);
  assert.deepEqual(frames(g, f, look, ms), ['shaded', 'reused']);
  assert.deepEqual(frames(g, f, look, [ms[1]]), ['whole'], 'the same view again: the vessel pass, whole');
  // (A blood frame after a reused one, with no draw asked for, draws the view whole too: the layer was left stale.)
  assert.deepEqual(frames(g, f, look, pinch(1.1, 1.02, 2)), ['shaded', 'reused']);
  const n0 = f.calls.length;
  g.composite(look, { on: true });
  assert.ok(f.calls.slice(n0).some((c) => c[0] === 'drawArraysInstanced'), 'the composite draws the vessels whole first');
  // A hand let go, then a camera glide, then a new pinch: the old picture is never laid.
  g.setReuse(2, true);
  assert.deepEqual(frames(g, f, look, pinch(1.3, 1.02, 1)), ['shaded']);
  g.setReuse(2, false);
  assert.deepEqual(frames(g, f, look, pinch(1.4, 1.02, 2)), ['shaded', 'shaded']);
  g.setReuse(2, true);
  assert.deepEqual(frames(g, f, look, pinch(1.5, 1.02, 2)), ['shaded', 'reused'], 'the first frame of the new pinch is shaded');
});

test('a resize, or a pan in between, means a fresh shade; switched off, the kept picture\'s memory goes', () => {
  const { g, f, canvas, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setReuse(2, true);
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 1)), ['shaded']);
  canvas.width = 700;
  assert.deepEqual(frames(g, f, look, pinch(1.02, 1.02, 1)).length, 1);
  assert.ok(!g.reused, 'not laid at a new size');
  const n0 = f.calls.length;
  g.setReuse(0, false);
  assert.ok(f.calls.slice(n0).some((c) => c[0] === 'texImage2D' && c[4] === 1 && c[5] === 1), 'given back');
});

test('Pinch frame reuse: the map from the view now to the kept picture, and when it covers the canvas', async () => {
  const { reuseMap, reuseCovers } = mod;
  assert.deepEqual(reuseMap([2, 0, 0, 2, 10, 20], [2, 0, 0, 2, 10, 20]), [1, 0, 0, 1, 0, 0], 'the same view: the picture as it is');
  // (Zoomed in 1.25× about the canvas centre (500, 400): a pixel now is at centre + (p − centre) / 1.25 in the kept picture.)
  const then = [1, 0, 0, 1, 0, 0], now = [1.25, 0, 0, 1.25, -125, -100], k = reuseMap(then, now);
  const at = (x, y) => [k[0] * x + k[2] * y + k[4], k[1] * x + k[3] * y + k[5]];
  assert.deepEqual(at(500, 400).map((v) => +v.toFixed(9)), [500, 400]);
  assert.deepEqual(at(0, 0).map((v) => +v.toFixed(9)), [100, 80]);
  assert.ok(reuseCovers(k, 1000, 800), 'a zoom in: covered');
  assert.ok(!reuseCovers(reuseMap(now, then), 1000, 800), 'a zoom out uncovers the edges: shaded afresh');
  assert.ok(!reuseCovers(reuseMap(then, [1, 0, 0, 1, 3, 0]), 1000, 800), 'a pan uncovers a strip');
  assert.equal(reuseMap(then, [0, 0, 0, 0, 0, 0]), null);
  assert.ok(!reuseCovers(null, 10, 10));
});
