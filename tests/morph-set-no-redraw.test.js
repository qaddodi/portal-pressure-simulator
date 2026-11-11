// Making a view-switch piece (makeMorphSet) draws nothing and leaves the set in use as it was, so the next frame is not a whole redraw of the vessel layer (10 Nov 2026, his
// Mac: a 139 ms frame as the last piece was made); a real set change (useMorphSet) still is one. And a set is uploaded by makeMorphSet and prepared by prepareMorphSet, a
// slice of its own (morphSetReady once both are done); a switch that needs a set not yet prepared prepares it at once. Run against the module with a stand-in GL.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

function fakeGL() {
  const enums = new Map();
  let nextObj = 1;
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === enums.get('ACTIVE_UNIFORMS') ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'checkFramebufferStatus') return enums.get('FRAMEBUFFER_COMPLETE') ?? 0;
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
}
const mod = await import('../src/ui/veins-gl.js');
const { gpuProbe, COUNTED } = await import('../src/ui/gpu-probe.js');
const { binSwept } = await import('../src/ui/veins-sweep.js');
const { ENT_W } = await import('../src/ui/veins-bin.js');

const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
const swept = () => binSwept([{ id: 0, reach: 30, path: [line(100)] }, { id: 1, reach: 30, path: [line(300)] }], [{ path: [[[200, 100]]], reach: 20, k: 0.3, fillet: 1, members: [0, 1], trunk: 0 }], { rows: 2, samples: mod.N_SAMPLES });
const M = [1, 0, 0, 1, 0, 0];
const LOOK = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierGroup: new Array(24).fill(0), tierAlpha: new Array(24).fill(1) };
const BLOOD = { on: false };

function figure() {
  const canvas = { width: 800, height: 600, getContext: () => fakeGL(), addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 2, force: true, who: 'lobule' });
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  return g;
}
// What the next draw does: 'whole' (the vessel layer drawn again whole) or 'kept' (the kept layer reused, shifted or left as it was).
function drawKind(g, m = M) {
  gpuProbe.on = true; gpuProbe.takeNotes();
  g.draw(m, LOOK, BLOOD);
  const n = gpuProbe.takeNotes();
  gpuProbe.on = false;
  return (n[COUNTED.whole]?.[0] || 0) > 0 ? 'whole' : 'kept';
}
const settle = (g) => { for (let i = 0; i < 4; i++) drawKind(g); return drawKind(g); };

{
  test(`making a morph set leaves the next draw as it was (not a whole redraw); a real set change is one`, () => {
    const g = figure();
    assert.equal(settle(g), 'kept', 'at rest the kept layer is reused');
    const S = g.makeMorphSet(swept());
    assert.ok(S);
    assert.equal(drawKind(g), 'kept', 'making a set: no whole redraw');
    g.prepareMorphSet(S);
    assert.equal(drawKind(g), 'kept', 'preparing it: nothing changes either');
    g.useMorphSet(S);
    assert.equal(drawKind(g), 'whole', 'a real set change draws the layer again');
    // A set made while another is in use: the one in use stays as it was.
    settle(g);
    const T = g.makeMorphSet(swept());
    assert.equal(drawKind(g), 'kept', 'making a second set while one is in use');
    g.useMorphSet(null);
    assert.equal(drawKind(g), 'whole', 'and the change back is one');
    g.dropMorphSet(S); g.dropMorphSet(T);
  });
}

test('a set is ready once uploaded and prepared; a switch that needs an unprepared set prepares it at once', () => {
  const g = figure();
  const S = g.makeMorphSet(swept());
  assert.equal(g.morphSetReady(S), false, 'uploaded only');
  g.prepareMorphSet(S);
  assert.equal(g.morphSetReady(S), true, 'uploaded and prepared');
  const T = g.makeMorphSet(swept());
  assert.equal(g.morphSetReady(T), false);
  g.useMorphSet(T);
  assert.equal(g.morphSetReady(T), true, 'prepared at once by the switch');
  g.useMorphSet(null);
  assert.equal(g.morphSetReady(null), false);
  g.prepareMorphSet(S);   // (again: harmless)
  assert.equal(g.morphSetReady(S), true);
  g.dropMorphSet(S);
  assert.equal(g.morphSetReady(S), false, 'a dropped set is not ready');
});

// A frame of the switch that sends a set the very rows it was last sent leaves the kept layer as it is (11 Nov 2026, Mohammad's Mac, "FPS 5" switching Anatomy
// and Circuit: the second after a switch lands sent the same points every frame, each a whole redraw of every vessel, "no kept layer"); new rows are still one.
test('a morph frame with the same rows as the last one keeps the layer; changed rows draw it again', () => {
  const g = figure();
  const b = swept(), S = g.makeMorphSet(b);
  g.prepareMorphSet(S);
  g.useMorphSet(S);
  const frame = new Float32Array((b.rows - Math.floor(b.posBase / ENT_W)) * ENT_W * 4).fill(1);
  assert.ok(frame.length > 0);
  g.setMorphFrame(frame);
  assert.equal(drawKind(g), 'whole', 'the first frame of the set');
  assert.equal(settle(g), 'kept');
  g.setMorphFrame(frame);
  assert.equal(drawKind(g), 'kept', 'the same rows again: kept');
  frame[3] = 2;
  g.setMorphFrame(frame);
  assert.equal(drawKind(g), 'whole', 'a point moved: drawn again');
  g.setMorphFrame(frame.slice());
  assert.equal(drawKind(g), 'kept', 'the same values in another buffer: kept');
  // Back on the figure's own binning and onto the set again: the swap draws it again, whatever was sent before.
  g.useMorphSet(null); drawKind(g); g.useMorphSet(S);
  g.setMorphFrame(frame);
  assert.equal(drawKind(g), 'whole', 'a set change is still one');
  g.dropMorphSet(S);
});

// Under a view-switch piece the kept layer stands only as drawn: a frame that would shift it (a pan) draws it whole instead (11 Nov 2026, Mohammad's iPhone:
// shapes left at the wrong place while switching Anatomy and Circuit, once 17b5315 kept the layer between repeated frames). On the figure's own binning a pan
// still shifts the kept layer.
test('a pan under a morph set draws the layer whole; on the figure\'s own binning it shifts the kept one', () => {
  const g = figure();
  const P = [1, 0, 0, 1, 3, 0], Q = [1, 0, 0, 1, 6, 0];
  settle(g);
  assert.equal(drawKind(g, P), 'kept', 'own binning: a pan shifts the kept layer');
  drawKind(g, M); settle(g);
  const b = swept(), S = g.makeMorphSet(b);
  g.prepareMorphSet(S);
  g.useMorphSet(S);
  const frame = new Float32Array((b.rows - Math.floor(b.posBase / ENT_W)) * ENT_W * 4).fill(1);
  g.setMorphFrame(frame);
  assert.equal(settle(g), 'kept', 'a piece at rest: kept');
  assert.equal(drawKind(g, P), 'whole', 'a pan under the piece: whole');
  g.setMorphFrame(frame);
  assert.equal(drawKind(g, Q), 'whole', 'the same rows and a pan: whole');
  assert.equal(drawKind(g, Q), 'kept', 'then still: kept');
  g.dropMorphSet(S);
});
