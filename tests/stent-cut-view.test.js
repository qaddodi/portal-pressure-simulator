// The stent's side view is a cut view (17 Nov 2026, Mohammad, from the mock stent-tiles-three-ways.html): only the stent's wall is drawn, one band and one
// ring wire along each side, so nothing lies over the lumen and a narrowed end shows; the veins at its ends are named (RPV, RHV; the DIPS's far end the IVC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.innerWidth ??= 1024; globalThis.innerHeight ??= 768;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }

const { stentCutD, stentLookD } = await import('../src/ui/stent-mesh.js');
const { store } = await import('../src/ui/store.js');
const { STENT_SITES } = await import('../src/engine/topology.js');

const nums = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const ys = (d) => nums(d).filter((_, i) => i % 2 === 1);

test('stentCutD: nothing is drawn across the lumen, the cover is a band outside each wall, the rings run along the walls', () => {
  const R = 12, f = (a, v) => [a, R * v], A = 300, t = 1.6;
  const m = stentCutD(f, A, 80, { t, step: 8, ampB: 3, ampC: 2 });
  assert.ok(m.wall.length > 0 && m.frontBare.length > 0 && m.frontCov.length > 0 && m.band.length > 0);
  // the cover's bands: every point on or outside the lumen's edge (|y| >= R), none inside it
  for (const y of ys(m.wall)) assert.ok(Math.abs(y) >= R - 1e-6 && Math.abs(y) <= R + t + 1e-6, `cover band at ${y}`);
  // the rings stay within their wall (the bare cells reach at most ampB in, the covered rings ampC in), so the middle of the lumen is clear
  for (const y of ys(m.frontBare)) assert.ok(Math.abs(y) >= R - 3 - 1e-6, `bare ring at ${y}`);
  for (const y of ys(m.frontCov)) assert.ok(Math.abs(y) >= R - 2 - 1e-6 && Math.abs(y) <= R + t + 1e-6, `covered ring at ${y}`);
  // the full-tube look (stentLookD) is what it replaces: it draws rings across the lumen
  const full = stentLookD(f, A, 80, 1);
  assert.ok(ys(full.frontCov).some((y) => Math.abs(y) < R - 4), 'the full tube has rings across the lumen');
  assert.ok(!ys(m.frontCov + m.frontBare + m.wall + m.band).some((y) => Math.abs(y) < R - 3.01), 'the cut view has none');
  // an all-bare stent: open cells, no cover, no band
  const bare = stentCutD(f, A, A);
  assert.equal(bare.wall, ''); assert.equal(bare.band, ''); assert.ok(bare.frontBare.length > 0);
});

test('stentCutD: the wall follows a narrowed lumen (an end stenosis pinches the stent with it)', () => {
  const half = (a) => (a > 270 ? 4 : 12), f = (a, v) => [a, 200 + v * half(a)];
  const m = stentCutD(f, 300, 80, { t: 1.6, step: 8 });
  const pts = nums(m.wall), near = [], mid = [];
  for (let i = 0; i + 1 < pts.length; i += 2) (pts[i] > 275 ? near : pts[i] < 260 ? mid : []).push(Math.abs(pts[i + 1] - 200));
  assert.ok(Math.max(...near) <= 4 + 1.6 + 1e-6, 'the wall hugs the pinch');
  assert.ok(Math.min(...mid) >= 12 - 1e-6, 'and the open stent');
});

const mountFigure = async (id, labels, params) => {
  const { createTipsFigure } = await import('../src/ui/tips-figure.js');
  store.set({ params });
  const RO = globalThis.ResizeObserver, seen = [];
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { seen.push([el, this.cb]); } disconnect() {} };
  const OW = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 340; } });
  const fig = createTipsFigure({ id, labels, chart: false });
  document.body.append(fig.el);
  for (const [e, cb] of seen) if (e.classList?.contains('tf-stage')) cb([]);
  const st = { kind: 'tips', d: 10, s: 0, flow: 1.5, dp: 6, peaks: [60, 120, 70], parts: { tract: 2, wall: 1, entry: 1, jet: 1, inlet: 0.5 } };
  fig.update({ metrics: { ppg: 9, tips: st, dips: { ...st, kind: 'dips' } } });
  globalThis.ResizeObserver = RO;
  if (OW) Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', OW); else delete window.HTMLElement.prototype.offsetWidth;
  return fig;
};
const P = (o = {}) => ({ tips: { on: true, d: 10 }, dips: { on: true, d: 10 }, stenosis: {}, thrombus: {}, stenosisSite: {}, stentGeom: {}, ...o });

test('the figure draws the stent as a cut view: its cover is two bands outside the lumen, and a distal stenosis pinches both the lumen and the wall', async () => {
  const { geoOf } = await import('../src/ui/svg-gl.js');
  const fig = await mountFigure('TIPS', true, P({ stenosis: { TIPS: 0.6 }, stenosisSite: { TIPS: 'distal' } }));
  const L = fig.layout(), at = (look) => [...fig.el.querySelectorAll(`[data-look="${look}"]`)];
  assert.equal(at('stent.graft').length, 0, 'no full-width graft polygon over the lumen');
  const [wall] = at('tf.wall'), [lum] = at('stent.lumen');
  assert.ok(wall._polys.length === 2, 'a band over each wall');
  const lp = lum._pts, lb = lp.buf, halfAt = (x) => { let best = 1e9, h = 0; for (let i = 0; i < lp.n / 2; i++) { const dx = Math.abs(lb[2 * i] - x); if (dx < best) { best = dx; h = L.cy - lb[2 * i + 1]; } } return h; };
  let inside = 0, wallNear = 1e9, wallMid = 1e9;
  for (const { pts } of wall._polys) for (let i = 0; i + 1 < pts.length; i += 2) {
    const d = Math.abs(pts[i + 1] - L.cy), h = halfAt(pts[i]);
    if (d < h - 0.75) inside++;
    const u = (pts[i] - L.x0) / (L.x1 - L.x0);
    if (Math.abs(u - STENT_SITES.distal) < 0.02) wallNear = Math.min(wallNear, d); else if (u > 0.4 && u < 0.6) wallMid = Math.min(wallMid, d);
  }
  assert.equal(inside, 0, 'no point of the wall lies inside the lumen');
  assert.ok(wallNear < 0.55 * wallMid, `the wall pinches with the stenosis: ${wallNear.toFixed(1)} against ${wallMid.toFixed(1)} px`);
  assert.ok(+geoOf(wall, 'opacity') > 0.99);
  // the rings sit on the walls too: none across the middle of the lumen
  for (const w of at('stent.wire.frontCov').concat(at('stent.wire.frontBare'))) for (const { pts } of w._polys) for (let i = 1; i < pts.length; i += 2) assert.ok(Math.abs(pts[i] - L.cy) > 0.5 * halfAt(pts[i - 1]) - 1e-6 || halfAt(pts[i - 1]) < 8, 'a ring on a wall');
  fig.dispose(); fig.el.remove();
});

test('the veins at the stent\'s ends are named on every card\'s picture: RPV and RHV (the DIPS: PV and IVC), with and without the figure\'s other words', async () => {
  const { wordsOf, geoOf } = await import('../src/ui/svg-gl.js');
  for (const labels of [true, false]) {
    for (const [id, near, far] of [['TIPS', 'RPV', 'RHV'], ['DIPS', 'PV', 'IVC']]) {
      const fig = await mountFigure(id, labels, P());
      const L = fig.layout(); 
      const names = [...fig.el.querySelectorAll('[data-look="tf.vein.name"]')];
      assert.deepEqual(names.map(wordsOf).sort(), [near, far].sort(), `${id} labels=${labels}`);
      for (const n of names) {
        assert.ok(+geoOf(n, 'opacity') > 0.99, 'shown with the stent');
        assert.equal(+geoOf(n, 'y'), L.cy, 'in the vein, level with the stent\'s axis');
        const x = +geoOf(n, 'x'), a = geoOf(n, 'text-anchor');
        assert.ok(a === 'start' ? x < L.x0 : x > L.x1, 'on the vein\'s own stub, never over the stent');
      }
      fig.dispose(); fig.el.remove();
    }
  }
});
