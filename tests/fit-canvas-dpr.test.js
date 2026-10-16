import { test } from 'node:test';
import assert from 'node:assert/strict';

// The instruments' canvases (Doppler, FibroScan, the HVPG tracing, scope, wall, charts) are drawn at the screen's own density up to
// 3x (#34: a 3x iPhone drew their words at 2x, slightly soft); Battery saver keeps them at 2x.
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const { fitCanvas } = await import('../src/ui/util.js');
// (the same module instance as util.js's own import, cache stamp and all)
const stamp = (await import('node:fs')).readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8').match(/'\.\/frame\.js(\?v=\w+)?'/)[1] || '';
const { setSaver } = await import(`../src/ui/frame.js${stamp}`);
const canvas = () => ({ width: 0, height: 0, getBoundingClientRect: () => ({ width: 200, height: 100 }), getContext: () => ({ setTransform() {} }) });

test('instrument canvases follow a 3x screen, and Battery saver holds them at 2x', () => {
  window.devicePixelRatio = 3;
  const a = canvas(); fitCanvas(a);
  assert.deepEqual([a.width, a.height], [600, 300]);
  setSaver(true);
  const b = canvas(); fitCanvas(b);
  assert.deepEqual([b.width, b.height], [400, 200]);
  setSaver(false);
  window.devicePixelRatio = 4;
  const c = canvas(); fitCanvas(c);
  assert.deepEqual([c.width, c.height], [600, 300], 'never above 3x');
});
