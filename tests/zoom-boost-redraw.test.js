import { test } from 'node:test';
import { CanvasObserver } from './canvas-observer.js';
import assert from 'node:assert/strict';

// A zoomed card's pictures (a kept readout in its header, the guideline path card) were drawn once at the card's resting density and only
// stretched by the zoom: soft, jagged words (Mohammad, 7 Nov 2026). A new canvas boost now draws again each picture whose last frame was at
// another density, at the zoom times the screen's density (up to 4x).
globalThis.ResizeObserver = CanvasObserver;   // (canvases report their box as a browser's observer does: tests/canvas-observer.js)
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const { canvasSize, noteDrawer, setCanvasBoost, redrawBoosted } = await import('../src/ui/util.js');
const canvas = (w, h) => ({ width: 0, height: 0, isConnected: true, getBoundingClientRect: () => ({ width: w, height: h }), getContext: () => ({ setTransform() {} }) });
// (a chart's drawer as trace-gl.js keeps it: it notes the width in device px of the frame it drew)
const chart = (cv) => {
  const api = { drawnW: 0, drawnH: 0, drawnWd: 0 }, st = { n: 0 };
  const redraw = () => { const z = canvasSize(cv); api.drawnW = z.w; api.drawnH = z.h; api.drawnWd = z.W; st.n++; };
  noteDrawer(cv, api, redraw); redraw(); st.n = 0;
  return { api, st };
};

test('a zoom draws the readouts again at zoom times the screen density, and back at rest', () => {
  window.devicePixelRatio = 2;
  const cv = canvas(120, 30), { api, st } = chart(cv);
  assert.equal(api.drawnWd, 240);
  setCanvasBoost(1.7);
  assert.equal(redrawBoosted(), 1);
  assert.equal(st.n, 1);
  assert.equal(api.drawnWd, Math.round(120 * 3.4), 'zoom 1.7 x 2x screen');
  assert.equal(redrawBoosted(), 0, 'drawn at that density already: left alone');
  setCanvasBoost(3);
  redrawBoosted();
  assert.equal(api.drawnWd, 120 * 4, 'never above 4x');
  setCanvasBoost(1);
  assert.equal(redrawBoosted(), 1);
  assert.equal(api.drawnWd, 240, 'back at the screen density at rest');
});

test('a picture off the page, or already at the density, is not drawn again; a big card keeps to its pixel budget', () => {
  window.devicePixelRatio = 3;
  const gone = canvas(100, 20), g = chart(gone); gone.isConnected = false;
  const capped = canvas(100, 20), c = chart(capped);
  assert.equal(c.api.drawnWd, 300);
  setCanvasBoost(1.7);
  redrawBoosted();
  assert.equal(g.st.n, 0, 'off the page');
  assert.equal(c.st.n, 1);
  assert.equal(c.api.drawnWd, 400, '3x screen x 1.7 is held to 4x');
  const card = canvas(780, 600), k = chart(card);
  setCanvasBoost(1);
  redrawBoosted();
  setCanvasBoost(1.7);
  redrawBoosted();
  const z = canvasSize(card);
  assert.ok(z.W * z.H <= 4.6e6 && z.dpr > 2.5, `a whole card is drawn denser than at rest, inside the budget (${z.dpr.toFixed(2)}x)`);
  assert.equal(k.api.drawnWd, z.W);
  setCanvasBoost(1);
});
