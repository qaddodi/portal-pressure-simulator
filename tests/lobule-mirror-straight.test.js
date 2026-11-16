// The lobule's names are read into the GPU captions (mirrorOf) in the layer's own px, so only while the layer stands untransformed.
// Mohammad's Mac, 16 Nov 2026: Lobule → Sinusoid → Lobule left "Sinusoids", "Central vein" and the portal venule drawn 28 times too big and gone
// (the dive's scale 28 was in the boxes mirrorOf read while the Sinusoid view was open), until the next layout. The route here: a read asked for
// while the layer is scaled waits, and is made once the transform is off, in the layer's own px.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { pretendToBeVisual: true });
for (const k of ['window', 'document']) globalThis[k] = k === 'window' ? dom.window : dom.window.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'Range']) globalThis[k] ??= dom.window[k];
globalThis.getComputedStyle ??= dom.window.getComputedStyle.bind(dom.window);
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);

let scale = 1;   // (the layer's transform: a box is its own size times it, as getBoundingClientRect reports it)
const own = (e) => (e.dataset?.w ? [+e.dataset.w, +e.dataset.h] : [60, 20]);
dom.window.Element.prototype.getBoundingClientRect = function () { const [w, h] = own(this); return { left: 0, top: 0, width: w * scale, height: h * scale, right: w * scale, bottom: h * scale, x: 0, y: 0 }; };
dom.window.Range.prototype.getClientRects = function () { return [{ left: 0, top: 0, width: 40 * scale, height: 12 * scale, right: 40 * scale, bottom: 12 * scale }]; };
dom.window.Range.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 40 * scale, height: 12 * scale, right: 40 * scale, bottom: 12 * scale }; };

const { createLobuleLabels } = await import('../src/ui/lobule-zoom-labels.js');

const noop = () => {};
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function rig() {
  const labels = document.createElement('div'), el = document.createElement('div'), host = document.createElement('div');
  document.getElementById('app').append(host); host.append(el); el.append(labels);
  const mirrored = [];
  const cap = new Proxy({ on: true, mirror: (key, m) => mirrored.push({ key, w: m.w, h: m.h }), paint: noop, place: noop, lead: noop, arrow: noop }, { get: (t, k) => (k in t ? t[k] : noop) });
  const pick = (name) => document.createElement('div');
  const st = new Proxy({ V: { k: 1, x: 0, y: 0 }, labels, el, host, cap, reduce: { matches: false }, callEl: pick(), callLine: pick(), callRing: pick(), callParts: [], leaders: pick(), touches: new Set(), freeRect: () => ({ l: 0, t: 0, r: 800, b: 600 }), cssN: () => 0 }, { get: (t, k) => (k in t ? t[k] : noop) });
  const live = new Proxy({ layerScaled: false, fade: 1 }, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
  const L = createLobuleLabels(st, live);
  for (const e of labels.querySelectorAll('.lz-lab')) { e.hidden = false; e.textContent = 'Sinusoids 7.3'; }   // (as a layout shows them)
  return { L, live, labels, mirrored };
}

test('a name asked to be read while the lobule layer is scaled is read after, at its own size', async () => {
  const { L, live, mirrored } = rig();
  scale = 1; live.layerScaled = false;
  L.mirrorAll(); await wait();
  assert.ok(mirrored.length > 0, 'a name is read at rest');
  assert.ok(mirrored.every((m) => m.w <= 100 && m.h <= 100), 'read straight, a name has its own size');
  mirrored.length = 0;
  // The Sinusoid view is open: the layer is turned and scaled 28 times. An app-class change asks for every name to be read (mirrorAll).
  scale = 28; live.layerScaled = true;
  L.mirrorAll(); await wait();
  assert.deepEqual(mirrored, [], 'nothing is read through the dive\'s scale');
  // Back in the lobule: the transform is off and the view says so; the names are read again, at their own size.
  scale = 1; live.layerScaled = false;
  L.mirrorRelease(); await wait();
  assert.ok(mirrored.length > 0, 'the names held back are read once the layer is straight');
  assert.ok(mirrored.every((m) => m.w <= 100 && m.h <= 100), `no name read at the dive's scale: ${JSON.stringify(mirrored)}`);
});

test('a layer that was never scaled has nothing held', async () => {
  const { L, live, mirrored } = rig();
  live.layerScaled = false;
  L.mirrorAll(); await wait();
  const n = mirrored.length;
  L.mirrorRelease(); await wait();
  assert.equal(mirrored.length, n, 'release with nothing held reads nothing again');
});
