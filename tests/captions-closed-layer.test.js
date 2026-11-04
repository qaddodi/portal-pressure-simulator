// A captions layer drawn in the figure's context (L1, docs/gpu-two-contexts-plan.md) is not inside the page layer it belongs to any more, so the
// page's fade of that layer cannot hide it: when the layer is closed (the sinusoid view in the lobule: .sv at opacity 0, visibility hidden), nothing
// of it may be handed to the GPU (Mohammad's iPhone, 4 Nov 2026: the sinusoid's SPACE OF DISSE, STELLATE CELL, KUPFFER CELL, HEPATOCYTE, Fenestrae
// and Protein legend standing over the lobule). The names at nothing are left out of the list, the leaders' marks are put at nothing, and the
// sinusoid view hides its captions outright as it closes, as the lobule does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'matchMedia', 'addEventListener']) globalThis[k] ??= dom.window[k]?.bind ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.Element = dom.window.Element;
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createCaptions } = await import('../src/ui/label-captions.js');
// (Inter's outlines, as label-gl.test.js loads them: a name is handed over only once its glyphs are here.)
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();

const tick = () => new Promise((r) => setTimeout(r, 60));
function rig() {
  const R = { passes: [], synced: [] };
  R.top = { gl: { isContextLost: () => false }, canvas: { width: 2000, height: 1000 }, present() { for (const p of R.passes) p.draw(); }, add(t) { R.passes.push(t); return () => {}; } };
  const labelGL = (svg, blocks, opts) => ({ lost: false, sync(list) { R.synced = list.map((e) => `${e.g.getAttribute('class')}@${e.g.style.opacity}`); opts.host?.ask(); }, setHoles() {}, drawInto() {}, dispose() {} });
  R.near = document.createElement('div'); R.near.className = 'sv';
  R.box = document.createElement('div'); R.box.className = 'lz-labels'; R.near.append(R.box); document.body.append(R.near);
  R.box.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500 });
  R.cap = createCaptions(R.box, { labelGL, deferred: true });
  R.cap.attach({ top: R.top, order: 2, near: R.near, active: () => true, scale: () => 2 });
  R.marks = () => [...R.box.querySelectorAll('.lb-leaders > *')].map((e) => `${e.getAttribute('class')}@${e.style.opacity}`);
  R.frame = async () => { await tick(); R.cap.drawNow(); R.top.present(); };
  return R;
}
async function openWithName(R) {
  await tick();
  R.cap.look('a', { halo: 0, haloC: '', size: 12, weight: 500, lh: 1.2, gap: 0, runs: {} });
  R.cap.mirror('a', { w: 10, h: 10, lines: [{ w: 10, base: 8, runs: [{ t: 'Zone', x: 0, r: { size: 10, weight: 500, fill: '#000', ls: 0 } }] }] });
  R.cap.put('a', { x: 50, y: 40, show: 1 });
  R.cap.lead('L', { x1: 10, y1: 10, x2: 60, y2: 60, show: 1, colour: 'rgba(1, 2, 3, 0.5)' });
  await R.frame(); await R.frame();
}

test('an open layer hands its name and leader to the GPU', async () => {
  const R = rig();
  await openWithName(R);
  assert.equal(R.synced.length, 1); assert.match(R.synced[0], /^lb@0\.\d+$|^lb@1$/, 'the name, fading in');
  assert.equal(R.marks().length, 3); for (const m of R.marks()) assert.doesNotMatch(m, /@0$/, m);
});

test('a layer the page closed (its view at opacity 0, hidden) hands nothing over: no name in the list, its leader marks at nothing', async () => {
  const R = rig();
  await openWithName(R);
  R.near.style.opacity = '0'; R.near.style.visibility = 'hidden';   // (sinusoid-view.js place({ opacity: 0 }))
  await R.frame(); await R.frame();
  assert.deepEqual(R.synced, [], 'a name at nothing is not in the list, whatever picture the drawer still holds for it');
  assert.deepEqual(R.marks(), ['leader@0', 'leader-dot-halo@0', 'leader-dot@0']);
  // Opened again: back in the list.
  R.near.style.opacity = '1'; R.near.style.visibility = '';
  await R.frame(); await R.frame(); await R.frame();
  assert.equal(R.synced.length, 1); assert.match(R.synced[0], /^lb@/);
});
