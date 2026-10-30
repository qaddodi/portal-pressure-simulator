import { test } from 'node:test';
import assert from 'node:assert/strict';

// Settings › Figure performance › Vessels lower while pinching (30 Oct, off by default): a zoom frame under a hand draws the vessel
// layer at 0.71 of its width and height into targets of its own and stretches it into the layer; the composite is as after any
// whole draw. Off, or with no hand on the figure, every frame is as before, and the view a pinch stops at is drawn whole.

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
const mod = await import('../src/ui/veins-gl.js');
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
const pinch = (from, step, n) => Array.from({ length: n }, (_, i) => zoomAt(from * step ** (i + 1)));
const K = 0.71, LW = Math.round(800 * K), LH = Math.round(600 * K);

// A frame's kind from its calls: drawn lower (the small viewport), shaded by the one-pass builds (they mark the stencil), or whole.
function frames(g, f, look, ms) {
  const out = [];
  for (const m of ms) {
    const n0 = f.calls.length;
    g.draw(m, look, { on: false });
    const c = f.calls.slice(n0);
    const low = c.some((x) => x[0] === 'viewport' && x[3] === LW && x[4] === LH);
    assert.equal(low, g.soft, 'soft exactly when drawn lower');
    out.push(low ? 'lower' : c.some((x) => x[0] === 'stencilFunc') ? 'shaded' : 'whole');
  }
  return out;
}
const blitsIn = (f, n0) => f.calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer');

test('off: every zoom frame is shaded as before, with the layer\'s own size, and nothing is made', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  const n0 = f.calls.length;
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 4)), Array(4).fill('shaded'));
  g.setLow(0, true);   // (off with a hand on the figure: the same)
  assert.deepEqual(frames(g, f, look, pinch(1.1, 1.02, 3)), Array(3).fill('shaded'));
  assert.equal(blitsIn(f, n0).length, 0);
  for (const c of f.calls) if (c[0] === 'uniform2f' && c[2] !== 0 && c[3] !== 0 && (c[2] === LW || c[3] === LH)) assert.fail('a uniform at the small size while off');
});

test('on, a hand zooming: each zoom frame drawn lower and stretched; the stop drawn whole at Full', () => {
  const { g, f, look } = renderer();
  const { gl } = f;
  g.draw(zoomAt(1), look, { on: false });
  g.setLow(K, true);
  const n0 = f.calls.length;
  const ms = pinch(1, 1.02, 3);
  assert.deepEqual(frames(g, f, look, ms), ['lower', 'lower', 'lower']);
  const c = f.calls.slice(n0);
  // The four targets stretched back, each alone: the colour filtered, the flow targets and the lumen mask as they are.
  const b = blitsIn(f, n0);
  assert.equal(b.length, 12);
  for (const x of b) assert.deepEqual(x.slice(1, 9), [0, 0, LW, LH, 0, 0, 800, 600]);
  assert.deepEqual(b.slice(0, 4).map((x) => x[10]), [gl.LINEAR, gl.NEAREST, gl.NEAREST, gl.NEAREST]);
  const reads = c.filter((x) => x[0] === 'readBuffer').map((x) => x[1]);
  assert.deepEqual(reads.slice(0, 5), [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3, gl.COLOR_ATTACHMENT0]);
  // The vessel pass in the small target: its size, and the view's transform scaled to it, each axis by its own share.
  const sizes = c.filter((x) => x[0] === 'uniform2f').map((x) => x.slice(2)).filter(([a, bb]) => a === LW && bb === LH);
  assert.ok(sizes.length >= 2, 'size and sizeF at the small target');
  const mats = c.filter((x) => x[0] === 'uniformMatrix3fv').map((x) => [...x[3]]);
  const m = ms[0], kx = LW / 800, ky = LH / 600;
  const want = [m[0] * kx, m[1] * ky, 0, m[2] * kx, m[3] * ky, 0, m[4] * kx, m[5] * ky, 1].map((v) => Math.fround(v));
  assert.ok(mats.some((x) => x.every((v, i) => v === want[i])), 'the transform to the small target');
  // The same view again (the pinch stopped): the vessel pass whole, at Full, nothing stretched.
  const n1 = f.calls.length;
  assert.deepEqual(frames(g, f, look, [ms[2]]), ['whole']);
  assert.equal(blitsIn(f, n1).length, 0);
  assert.ok(f.calls.slice(n1).some((x) => x[0] === 'uniform2f' && x[2] === 800 && x[3] === 600));
});

test('on, with no hand on the figure (a slide\'s camera), or with Pinch frame reuse on: frames as before', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setLow(K, false);
  const n0 = f.calls.length;
  assert.deepEqual(frames(g, f, look, pinch(1, 1.02, 3)), Array(3).fill('shaded'));
  assert.equal(blitsIn(f, n0).length, 0);
  g.setLow(K, true); g.setReuse(2, true);
  assert.deepEqual(frames(g, f, look, pinch(1.1, 1.02, 2)).map((x) => x !== 'lower'), [true, true]);
});

test('on, a pan at the same zoom moves the layer as before; a blood frame after a lower one lays it as drawn', () => {
  const { g, f, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setLow(K, true);
  assert.deepEqual(frames(g, f, look, [zoomAt(1.1)]), ['lower']);
  const n0 = f.calls.length;
  g.composite(look, { on: true });
  assert.ok(!f.calls.slice(n0).some((c) => c[0] === 'clearBufferuiv' || c[0] === 'blitFramebuffer'), 'the layer laid as it is until the next draw (no vessel pass)');
  // A pan after a lower frame: no kept layer to move, so drawn whole (at Full).
  const p = zoomAt(1.1); p[4] += 5;
  assert.deepEqual(frames(g, f, look, [p]), ['whole']);
  // A pan after a whole draw moves the layer (a strip drawn), never lower.
  const q = [...p]; q[4] += 5;
  assert.deepEqual(frames(g, f, look, [q]), ['whole']);
  assert.ok(!g.soft);
});

test('a resize while on: the small targets follow; switched off, they are given back', () => {
  const { g, f, canvas, look } = renderer();
  g.draw(zoomAt(1), look, { on: false });
  g.setLow(K, true);
  frames(g, f, look, [zoomAt(1.05)]);
  canvas.width = 700;
  g.draw(zoomAt(1.06), look, { on: false });
  g.draw(zoomAt(1.07), look, { on: false });
  assert.ok(g.soft);
  assert.ok(f.calls.some((c) => c[0] === 'viewport' && c[3] === Math.round(700 * K) && c[4] === LH));
  const n0 = f.calls.length;
  g.setLow(0, false);
  const del = f.calls.slice(n0);
  assert.equal(del.filter((c) => c[0] === 'deleteTexture').length, 4);
  assert.equal(del.filter((c) => c[0] === 'deleteFramebuffer').length, 1);
  g.setLow(0, false);
  assert.equal(f.calls.length, n0 + 5, 'nothing more to give back');
});
