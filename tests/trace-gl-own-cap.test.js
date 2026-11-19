// GPU-3 (19 Nov 2026 review): where the shared chart pool cannot be made (Safari 16.4 to 16.7 has OffscreenCanvas without WebGL on it), each chart took a WebGL context of its own with no
// limit; a slide of readouts and charts made a dozen and WebKit, which keeps about 16, dropped the oldest, the figure's. At most six are live; a chart past that is the 2D canvas's.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
let made = 0;
const gl = () => new Proxy({}, { get(_, k) { if (typeof k !== 'string') return undefined; if (/^[A-Z0-9_]+$/.test(k)) return k; if (k === 'isContextLost') return () => false; if (k === 'getExtension') return () => ({ loseContext() {}, restoreContext() {} }); if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true; if (k === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE'; return (...a) => (k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined); } });
globalThis.OffscreenCanvas = class { constructor() { } getContext() { return null; } };   // (OffscreenCanvas without WebGL: the pool is dead)
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, setAttribute() {}, remove() {}, addEventListener() {}, getContext: (k) => { if (k === 'webgl2') { made++; return gl(); } return null; } }) };
Object.assign(globalThis, { MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 2, innerWidth: 800, innerHeight: 600, addEventListener: () => {}, removeEventListener: () => {}, window: globalThis, requestAnimationFrame: () => 0, Element: class {}, HTMLElement: class {}, HTMLCanvasElement: class {}, location: { search: '' } });
globalThis.performance = { now: () => 0 };
const { createTraceGL, ownContexts } = await import('../src/ui/trace-gl.js');

test('with no shared pool, at most six charts hold a WebGL context of their own; the rest are the 2D canvas\'s', () => {
  const host = () => ({ style: {}, after() {} });
  const all = Array.from({ length: 20 }, () => createTraceGL(host()));
  const live = all.filter(Boolean);
  assert.equal(live.length, 6, 'six drawers');
  assert.equal(made, 6, 'six contexts made');
  assert.equal(ownContexts(), 6);
  live[0].dispose();
  assert.equal(ownContexts(), 5, 'a disposed chart gives its place back');
  assert.ok(createTraceGL(host()), 'and the next chart takes it');
  assert.equal(ownContexts(), 6);
});
