// The lobule's renderer instance (who: 'lobule') makes the Tube programs only when Tube is the chosen vessel renderer (brief L-D, 10 Nov 2026): Mesh or
// Classic chosen leaves its lobule classic and compiles nothing of the Tube; choosing Tube makes them (the strip, the patch and the lay program), once.
// Run against the module with a stand-in GL that records each shader source it is given.
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
  const sources = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        if (k === 'shaderSource') sources.push(a[1]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, sources };
}
const frame = await import('../src/ui/frame.js');
const mod = await import('../src/ui/veins-gl.js');
const tubeSources = (src) => src.filter((s) => s.includes('celShade(') && s.includes('#define MESH '));

function lobule() {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule' });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierGroup: new Array(24).fill(0), tierAlpha: new Array(24).fill(1) };
  return { g, f, look };
}

test('the lobule makes no Tube program while Mesh or Classic is chosen, and makes them (strip and patch builds) when Tube is', () => {
  for (const choice of ['mesh', 'classic']) {
    frame.setVesselRenderer(choice);
    const { g, f, look } = lobule();
    g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
    assert.equal(tubeSources(f.sources).length, 0, `${choice}: no Tube shader text`);
    frame.setVesselRenderer('tube');
    g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
    const t = tubeSources(f.sources);
    assert.equal(t.length, 2, `${choice} then tube: the strip's and the patch's builds, once`);
    assert.ok(t.some((s) => s.includes('#define MESH 1')) && t.some((s) => s.includes('#define MESH 2')));
    g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
    assert.equal(tubeSources(f.sources).length, 2, 'not made again');
  }
  frame.setVesselRenderer('mesh');
});

test('Tube chosen before the lobule is made: its Tube programs are made with it', () => {
  frame.setVesselRenderer('tube');
  const { f } = lobule();
  assert.equal(tubeSources(f.sources).length, 2);
  frame.setVesselRenderer('mesh');
});
