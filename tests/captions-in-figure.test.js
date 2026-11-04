// L1 (docs/gpu-two-contexts-plan.md): the lobule's and the sinusoid's captions are drawn in the figure's own context, as a pass of its present.
// Fake host GL and a fake label-gl: no canvas of the captions' own, no getContext, one pass at the order the owner gives, drawn in the host's present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { createLayerAlpha } = await import('../src/ui/layer-alpha.js');

const tick = () => new Promise((r) => setTimeout(r, 60));   // (the queued frame the attach asked for lands)
function rig() {
  const R = { passes: [], presents: 0, made: [], gcCalls: 0 };
  R.top = {
    gl: { isContextLost: () => false, getContext() { R.gcCalls++; } },
    canvas: { width: 2000, height: 1000, getContext() { R.gcCalls++; } },
    present() { R.presents++; for (const p of R.passes) p.prep?.(); for (const p of R.passes) p.draw(); },
    add(t) { R.passes.push(t); R.passes.sort((a, b) => a.order - b.order); return () => { const i = R.passes.indexOf(t); if (i >= 0) R.passes.splice(i, 1); }; },
  };
  const labelGL = (svg, blocks, opts) => {
    const L = { opts, syncs: [], drawn: 0, disposed: false, lost: false,
      sync(list) { L.syncs.push(list.length); opts.host?.ask(); }, setHoles() {}, drawInto() { L.drawn++; }, dispose() { L.disposed = true; L.lost = true; } };
    R.made.push(L);
    return L;
  };
  const box = document.createElement('div');
  document.body.append(box);
  box.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500 });
  R.cap = createCaptions(box, { labelGL, deferred: true });
  R.box = box;
  return R;
}

test('a deferred layer makes no drawer until it is attached', () => {
  const R = rig();
  assert.equal(R.made.length, 0);
  assert.equal(R.cap.on, false);
});

test('attached to the figure: the drawer is in host mode, one pass at the owner\'s order, no context of its own', () => {
  const R = rig();
  R.cap.attach({ top: R.top, order: -8, scale: () => 2 });
  assert.equal(R.made.length, 1);
  const h = R.made[0].opts.host;
  assert.equal(h.gl, R.top.gl);
  assert.equal(h.canvas, R.top.canvas);
  assert.equal(h.scale(), 2, 'the canvas\'s own pixels per CSS px, not the screen\'s');
  assert.equal(h.active(), true);
  assert.equal(R.passes.length, 1);
  assert.equal(R.passes[0].order, -8);
  assert.equal(R.passes[0].solo, true);
  assert.equal(R.passes[0].prep, undefined, 'a draw, not a prep: the lobule\'s and sinusoid\'s pictures are draws under it and every prep runs before them');
  assert.equal(R.gcCalls, 0, 'no getContext');
  assert.equal(R.box.querySelector('canvas'), null, 'no canvas of its own in the layer');
});

test('the pass draws the names in the host\'s present, only when there are some', async () => {
  const R = rig();
  R.cap.attach({ top: R.top, order: -8 });
  await tick();
  R.top.present();
  assert.equal(R.made[0].drawn, 0, 'nothing handed over: the pass is idle');
  R.cap.look('a', { halo: 0, haloC: '', size: 12, weight: 500, lh: 1.2, gap: 0, runs: {} });
  R.cap.mirror('a', { w: 10, h: 10, lines: [{ w: 10, base: 8, runs: [{ t: 'Zone', x: 0, r: { size: 10, weight: 500, fill: '#000', ls: 0 } }] }] });
  R.cap.put('a', { x: 50, y: 40, show: 1 });
  R.cap.drawNow();
  R.top.present();
  assert.ok(R.made[0].syncs.length >= 1, 'the frame handed its list over');
});

test('the names are laid after the lobule\'s own picture (a draw at a lower order), never under it', async () => {
  const R = rig();
  const seq = [];
  R.top.add({ order: -15, solo: true, draw: () => seq.push('lobule') });
  R.cap.attach({ top: R.top, order: -8 });
  R.made[0].drawInto = () => seq.push('names');
  R.top.add({ order: 2, prep: () => seq.push('glass prep'), draw: () => seq.push('glass') });
  await tick();
  R.cap.look('a', { halo: 0, haloC: '', size: 12, weight: 500, lh: 1.2, gap: 0, runs: {} });
  R.cap.mirror('a', { w: 10, h: 10, lines: [{ w: 10, base: 8, runs: [{ t: 'Zone', x: 0, r: { size: 10, weight: 500, fill: '#000', ls: 0 } }] }] });
  R.cap.put('a', { x: 50, y: 40, show: 1 });
  R.cap.lead('a', { x1: 0, y1: 0, x2: 10, y2: 10, show: 1, colour: 'rgba(0, 0, 0, 1)' });
  R.cap.drawNow();
  seq.length = 0;
  R.top.present();
  assert.deepEqual(seq, ['glass prep', 'lobule', 'names', 'glass']);
});

test('a layer at no size hands over an empty list: nothing stays drawn in the host\'s canvas', async () => {
  const R = rig();
  R.cap.attach({ top: R.top, order: -8 });
  await tick();
  R.box.getBoundingClientRect = () => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 });
  R.cap.drawNow();
  assert.deepEqual(R.made[0].syncs.slice(-1), [0]);
});

test('detach takes the pass out and lets the drawer go; attach(null) is the layer\'s own canvas as before', () => {
  const R = rig();
  R.cap.attach({ top: R.top, order: -8 });
  R.cap.detach();
  assert.equal(R.passes.length, 0);
  assert.equal(R.made[0].disposed, true);
  R.cap.attach(null);
  assert.equal(R.made.length, 2);
  assert.equal(R.made[1].opts.host, undefined);
  R.cap.attach({ top: R.top, order: -8 });
  assert.equal(R.made[1].disposed, true, 'the own-canvas drawer went when the figure came');
  assert.equal(R.passes.length, 1);
});

test('a lost host context shows as the drawer\'s: not active', () => {
  const R = rig();
  R.cap.attach({ top: R.top, order: -8 });
  R.top.gl.isContextLost = () => true;
  assert.equal(R.made[0].opts.host.active(), false);
});

test('the owners attach the captions to the figure, below the glass, and detach them with it', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const sv = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');
  assert.match(lz, /createCaptions\(labels, \{ deferred: true \}\)/);
  assert.match(lz, /cap\.attach\(\{ top: fig, order: LZ_UNDER_GLASS \+ 2,/);
  assert.match(lz, /cap\.detach\(\);/);
  assert.match(sv, /createCaptions\(labels, \{ deferred: true \}\)/);
  assert.match(sv, /cap\.attach\(\{ top: ft,/);
});

// ── layer-alpha.js ──
const fakeEl = (parent = null, o = {}) => { const e = document.createElement('div'); (parent || document.body).append(e); e._o = o; e.getAnimations = () => e._o.anims || []; return e; };
const gcsOf = (e) => { const o = e._o || {}; return { opacity: String(o.opacity ?? 1), visibility: o.visibility || 'visible', display: o.display || 'block' }; };

test('layer alpha: the product of the chain\'s opacities, read when something changed', () => {
  const root = fakeEl(null, { opacity: 0.5 }), mid = fakeEl(root, { opacity: 1 }), leaf = fakeEl(mid, { opacity: 0.5 });
  const la = createLayerAlpha(leaf, { gcs: gcsOf });
  assert.equal(la.now(), 0.25);
  leaf._o.opacity = 1;
  assert.equal(la.now(), 0.25, 'no change was announced: nothing is read');
});

test('layer alpha: hidden is nothing', () => {
  const leaf = fakeEl(null, { visibility: 'hidden' });
  assert.equal(createLayerAlpha(leaf, { gcs: gcsOf }).now(), 0);
});

test('layer alpha: a running opacity transition is followed from its timing, and ends at the page\'s own value', () => {
  const t0 = performance.now();
  const anim = {
    transitionProperty: 'opacity', playState: 'running', playbackRate: 1, currentTime: 0,
    effect: { target: null, getTiming: () => ({ duration: 200, delay: 0, easing: 'linear', fill: 'backwards', iterations: 1, direction: 'normal', iterationStart: 0 }), getKeyframes: () => [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '1' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '0' }], composite: 'replace' },
  };
  const leaf = fakeEl(null, { opacity: 1, anims: [anim] });
  anim.effect.target = leaf;
  const la = createLayerAlpha(leaf, { gcs: gcsOf });
  const a0 = la.now();
  assert.ok(a0 > 0.9 && a0 <= 1, `starts at the from value (${a0})`);
  assert.equal(la.moving, true);
  assert.ok(performance.now() - t0 < 150, 'the test ran inside the transition');
  // the page has finished it: the animation is gone, the page's opacity is the end value
  leaf._o.anims = []; leaf._o.opacity = 0;
  // (the track's end passes: the owner is told by the transition's end event; here the timing alone ends it)
  const end = performance.now() + 250;
  while (performance.now() < end) { /* wait out the 200 ms */ }
  assert.equal(la.now(), 0);
  assert.equal(la.moving, false);
});
