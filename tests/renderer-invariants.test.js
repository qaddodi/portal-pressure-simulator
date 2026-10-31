import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The runtime invariants of the unified-renderer plan (section 21) that the code can prove without a screen: a camera-only pan
// sends no vessel data, a catheter update sends the shaft once, zoom alone never resizes the drawing buffer, a surface draws
// once per frame, and a label's picture is sent only when its look changes.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

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
async function renderer() {
  const mod = await import('../src/ui/veins-gl.js');
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, canvas, look };
}
const UPLOADS = new Set(['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D']);
// (Data sent: an allocation with null pixels is a render target made, not vessel data.)
const uploads = (f, from) => f.calls.slice(from).filter((c) => UPLOADS.has(c[0]) && !(c[0] === 'texImage2D' && c.at(-1) === null));

test('a camera-only pan or zoom uploads no vessel data and leaves the drawing buffer alone', async () => {
  const { g, f, canvas, look } = await renderer();
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  for (const m of [[1, 0, 0, 1, 12, 5], [1, 0, 0, 1, -30, 9], [1.5, 0, 0, 1.5, -30, 9], [4, 0, 0, 4, 100, -80]]) {
    const n = f.calls.length;
    g.draw(m, look, { on: false });
    assert.deepEqual(uploads(f, n).map((c) => c[0]), [], `no upload at ${m}`);
    assert.equal(canvas.width, 800); assert.equal(canvas.height, 600);
  }
  // Once the layers exist, a pan allocates nothing more.
  g.draw([1, 0, 0, 1, 20, 0], look, { on: false });
  const n = f.calls.length;
  g.draw([1, 0, 0, 1, 25, 3], look, { on: false });
  assert.deepEqual(f.calls.slice(n).filter((c) => c[0] === 'texImage2D' || c[0] === 'bufferData'), []);
});

test('a catheter update sends the shaft once and only the moving vertices after', async () => {
  const { g, f } = await renderer();
  if (!g.canCath) return;   // (this stand-in context may not compile the catheter program)
  const base = new Float32Array(60);
  const spec = (v) => ({ base, verts: new Float32Array(v), draws: [{ mode: 4, first: 0, count: 3, col: [1, 1, 1], alpha: 1, fade: [0, 0], len: 1 }], light: [0, 0] });
  g.setCath(spec(12));
  const n = f.calls.length;
  g.setCath(spec(12)); g.setCath(spec(12));
  const subs = f.calls.slice(n).filter((c) => c[0] === 'bufferSubData');
  assert.equal(subs.length, 2, 'one vertex upload per update, none for the shaft');
  assert.ok(subs.every((c) => c[3].byteLength === 48));
});

test('the label atlas sends a picture only when its look key changed, and the key holds no position', () => {
  const src = read('../src/ui/label-gl.js');
  const ref = src.slice(src.indexOf('function refresh('), src.indexOf('function repack('));
  assert.match(ref, /if \(st\.key !== key\) \{/);
  assert.equal(ref.match(/texSubImage2D/g).length, 1);
  assert.match(src, /export const lookKey = \(d, rot, dpr\) => JSON\.stringify\(\[d\.filter, d\.parts, rot, dpr\]\);/);   // (look, rotation and ratio; no place)
});

test('the stage resizes its drawing buffer from the wrap size and ratio, never from the zoom', () => {
  const src = read('../src/ui/stage.js');
  const fn = src.slice(src.indexOf('function resizeCanvas()'), src.indexOf('new ResizeObserver(resizeCanvas)'));
  assert.doesNotMatch(fn, /CTM\.sc|\bvt\b|zoom/);
  assert.match(fn, /vCanvas\.width = /);
  assert.equal((src.match(/vCanvas\.width = /g) || []).length, 1);
});

test('a resize notice that leaves the backing size and ratio as they were neither clears the canvas nor draws in the same task', () => {
  const src = read('../src/ui/stage.js');
  const fn = src.slice(src.indexOf('function resizeCanvas()'), src.indexOf('new ResizeObserver(resizeCanvas)'));
  const guard = fn.indexOf('bw === vcw() && bh === vch() && vdpr === was');
  assert.ok(guard > 0, 'the unchanged size is checked');
  assert.ok(guard < fn.indexOf('vCanvas.width = bw'), 'before the width is assigned');
  assert.ok(fn.indexOf('return;', guard) < fn.indexOf("drawVeins(false, 'resize')"), 'and returns before the same-task draw');
});

test('the shared clock runs each surface once per frame and the late ones last, from one browser frame', async () => {
  const frames = [];
  globalThis.requestAnimationFrame = (cb) => frames.push(cb);
  globalThis.localStorage ??= { removeItem() {} };
  const { frame, lateFrame } = await import('../src/ui/frame.js');
  const order = [];
  lateFrame(() => order.push('late'), 'figure');
  frame(() => { order.push('a'); frame(() => order.push('a-next'), 'a'); }, 'a');
  frame(() => order.push('b'), 'b');
  assert.equal(frames.length, 1, 'one browser frame asked for');
  frames.shift()(16);
  assert.deepEqual(order, ['a', 'b', 'late']);
  assert.equal(frames.length, 1, 'the callback asked for during the frame waits for the next one');
  frames.shift()(32);
  assert.deepEqual(order, ['a', 'b', 'late', 'a-next']);
  assert.equal(frames.length, 0, 'nothing asked, no frame requested');
});

test('capture() hands exports the canvas with the whole current picture; the glass asks for it before each copy', async () => {
  const { g, f, canvas, look } = await renderer();
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  const n = f.calls.length;
  assert.equal(g.capture(), canvas);
  assert.equal(f.calls.slice(n).filter((c) => c[0] === 'blitFramebuffer').length, 1, 'the canvas keeps no picture of its own: the kept one is copied onto it');
  const glass = read('../src/ui/glass-gl.js');
  assert.ok(glass.indexOf('capture?.()') > 0 && glass.indexOf('capture?.()') < glass.indexOf('p = createImageBitmap('));
  const stage = read('../src/ui/stage.js');
  assert.equal((stage.match(/capture: \(\) => veins\?\.capture\(\)/g) || []).length, 3, 'the callouts\' glass, the liver pane and the Present cards (A2)');
});

test('the vessel layer\'s second-lumen target is bounded: given back to a texel while the picture is not shown, and a pan makes no copy of it', async () => {
  const { g, f, look } = await renderer();
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  // (At the layer's size: the canvas's, or less on an axis where the figure takes less, 31 Oct.)
  const [LW, LH] = g.layerLayout.size;
  assert.ok(LW <= 800 && LH <= 600);
  const big = (fmt) => f.calls.filter((c) => c[0] === 'texImage2D' && c[2] === 0 && c[3] === fmt && c[4] === LW && c[5] === LH);
  assert.ok(big(f.gl.RGBA16UI).length >= 1, 'the first lumen\'s layer allocated at the layer\'s size');
  // (The second lumen packed in two channels: ROW2_BITS.)
  assert.ok(big(f.gl.RG16UI).length >= 1, 'the second lumen\'s layer allocated at the layer\'s size, in two channels');
  const n = f.calls.length;
  g.trim();
  const small = (fmt) => f.calls.slice(n).filter((c) => c[0] === 'texImage2D' && c[3] === fmt && c[4] === 1 && c[5] === 1);
  assert.equal(small(f.gl.RGBA16UI).length, 1, 'the first lumen\'s layer back to a texel');
  assert.equal(small(f.gl.RG16UI).length, 1, 'the second lumen\'s layer back to a texel');
  // A pan sizes no second set of targets (the layer wraps instead: wrapPieces).
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  const n2 = f.calls.length;
  g.draw([1, 0, 0, 1, 9, 4], look, { on: false });
  assert.equal(f.calls.slice(n2).filter((c) => c[0] === 'texImage2D' && c[4] > 1 && c[5] > 1).length, 0, 'nothing allocated for a pan');
  assert.doesNotMatch(read('../src/ui/veins-gl.js'), /\bspare\b/);
});
