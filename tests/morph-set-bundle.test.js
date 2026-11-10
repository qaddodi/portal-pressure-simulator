// A morph set's geometry data is made when the set is (makeMorphSet, a free moment), not in the change's frames (brief "Anatomy to Circuit switch", 10 Nov 2026): the joins' patch
// texture is made for a set only where a renderer draws patches (Mesh; the Tube not joining with webs), and the Tube's stage 2 record only for the Tube. Run against the module
// with a stand-in GL that records the texture uploads.
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
  const uploads = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        if (k === 'texImage2D' && typeof a[3] === 'number') uploads.push({ w: a[3], h: a[4] });
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, uploads };
}
const frame = await import('../src/ui/frame.js');
const mod = await import('../src/ui/veins-gl.js');
const { binSwept } = await import('../src/ui/veins-sweep.js');

const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
function lobule() {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 2, force: true, who: 'lobule' });
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  return { g, f };
}
const swept = () => binSwept([{ id: 0, reach: 30, path: [line(100)] }, { id: 1, reach: 30, path: [line(300)] }], [{ path: [[[200, 100]]], reach: 20, k: 0.3, fillet: 1, members: [0, 1], trunk: 0 }], { rows: 2, samples: mod.N_SAMPLES });
const patchTexUploads = (f) => f.uploads.filter((u) => u.w === 2).length;

test('Mesh chosen: a morph set\'s patch texture is made with the set, and using the set makes none', () => {
  frame.setVesselRenderer('mesh');
  const { g, f } = lobule();
  const before = patchTexUploads(f);
  const S = g.makeMorphSet(swept());
  assert.ok(S);
  assert.equal(patchTexUploads(f), before + 1, 'made with the set');
  g.useMorphSet(S); g.useMorphSet(null); g.useMorphSet(S); g.useMorphSet(null);
  assert.equal(patchTexUploads(f), before + 1, 'a set change builds and uploads nothing');
  frame.setVesselRenderer('mesh');
});

test('Tube chosen with webs for joins: no patch texture is made for a morph set', () => {
  frame.setVesselRenderer('tube');
  const { g, f } = lobule();
  const before = patchTexUploads(f);
  const S = g.makeMorphSet(swept());
  assert.ok(S);
  assert.equal(patchTexUploads(f), before, 'no patch built or uploaded where the joins are webs');
  frame.setVesselRenderer('mesh');
});

test('tubeStage() is a number the Tube\'s stage fills in: 0 before the vessel layer is drawn and while the classic or Mesh pass draws it', () => {
  frame.setVesselRenderer('mesh');
  const { g } = lobule();
  assert.equal(g.tubeStage(), 0);
  g.draw([1, 0, 0, 1, 0, 0], { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierGroup: new Array(24).fill(0), tierAlpha: new Array(24).fill(1) }, { on: false });
  assert.equal(g.tubeStage(), 0);
});
