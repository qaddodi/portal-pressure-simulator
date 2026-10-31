import { test } from 'node:test';
import assert from 'node:assert/strict';

// The figure's overlays on the GPU (31 Oct, recs A1; ?stageover=gpu): the canvas at the screen's density, the figure's picture at its
// own share upscaled onto it by a plain filtered copy (as the page's compositor upscales a smaller canvas), and the overlays' stack,
// painted at the canvas's size, laid over it at every present. Only with the renderer's kept picture (the default).

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
globalThis.location = { search: '?vesselbuf=keep' };
const keep = await import('../src/ui/veins-gl.js?keep');
delete globalThis.location;
function renderer(m = mod) {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = m.createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y) => Array.from({ length: m.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(m.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(m.MAX_TIERS).fill(1), tierGroup: Array(m.MAX_TIERS).fill(1) };
  return { g, f, canvas, look };
}
const blits = (f, n0) => f.calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer');

test('the overlays need the kept picture: none with ?vesselbuf=keep', () => {
  assert.ok(renderer().g.overlay, 'by default');
  assert.equal(renderer(keep).g.overlay, null);
});

test('the plain upscale: the picture copied onto the whole canvas, filtered; at the canvas\'s size, copied as it is', () => {
  const { g, f, look } = renderer();
  let n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  assert.deepEqual(blits(f, n0).at(-1).slice(1), [0, 0, 800, 600, 0, 0, 800, 600, f.gl.COLOR_BUFFER_BIT, f.gl.NEAREST]);
  g.setPicture([400, 300], true);
  n0 = f.calls.length;
  g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
  assert.deepEqual(blits(f, n0).at(-1).slice(1), [0, 0, 400, 300, 0, 0, 800, 600, f.gl.COLOR_BUFFER_BIT, f.gl.LINEAR]);
  // (Sharper upscaling keeps its own filter: a draw, no copy.)
  g.setPicture([400, 300], false);
  n0 = f.calls.length;
  g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
  assert.equal(blits(f, n0).length, 0);
});

test('nothing laid with no overlays; set with groups, their stack is drawn at the canvas\'s size and laid at each present', () => {
  const { g, f, look } = renderer();
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  g.overlay.set(new Map(), []);
  assert.equal(g.overlay.shown, false);
  assert.equal(g.overlay.stale, false);
  let n0 = f.calls.length;
  g.present();
  assert.ok(!f.calls.slice(n0).some((c) => c[0] === 'drawArrays'), 'only the copy');
  // A group with no ops: the stack is drawn (cleared) at the canvas's size and laid over the picture, premultiplied "over".
  g.overlay.set(new Map([['o0', [{ spec: { ops: [], opacity: 1, mask: null }, m: [1, 0, 0, 1, 0, 0] }]]]), ['o0']);
  assert.equal(g.overlay.shown, true);
  assert.equal(g.overlay.stale, true);
  n0 = f.calls.length;
  g.present();
  const c = f.calls.slice(n0), at = c.findIndex((x) => x[0] === 'blitFramebuffer');
  assert.ok(c.some((x) => x[0] === 'texImage2D' && x[4] === 800 && x[5] === 600), 'the stack at the canvas\'s size');
  const lay = c.findLastIndex((x) => x[0] === 'drawArrays');
  assert.ok(lay > at, 'laid after the copy');
  assert.ok(c.slice(at, lay).some((x) => x[0] === 'blendFunc' && x[1] === f.gl.ONE && x[2] === f.gl.ONE_MINUS_SRC_ALPHA));
  assert.equal(g.overlay.stale, false, 'drawn: not stale until something changes');
  n0 = f.calls.length;
  g.present();
  assert.ok(!f.calls.slice(n0).some((x) => x[0] === 'texImage2D'), 'laid again, not drawn again');
  assert.ok(f.calls.slice(n0).some((x) => x[0] === 'drawArrays'));
  // Under a smaller picture the overlays are still drawn at the canvas's size, under the view scaled to it.
  g.setPicture([400, 300], true);
  g.draw([0.5, 0, 0, 0.5, 3, 4], look, { on: false });
  assert.equal(g.overlay.stale, false, 'drawn with it');
});
