// The Trials tab's list keeps its nodes (trials card review TC-M1, M3, 15 Nov 2026): opening a trial, closing it, opening a fold or a chip never
// rebuilds the list, so the button tapped keeps focus and a row that stays is the same element (reconcile places it; the others glide).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'addEventListener', 'SVGElement']) globalThis[k] ??= dom.window[k]?.bind && k[0] === k[0].toLowerCase() ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.Element = dom.window.Element;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
try { Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true }); } catch { /* (already there) */ }

const { Engine } = await import('../src/engine/portal/engine.js');
const { computeMetrics } = await import('../src/engine/portal/metrics.js');
const { store } = await import('../src/ui/store.js');
const { createTrialsPane } = await import('../src/ui/trials-pane.js');

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

test('opening and closing a trial keeps every row node, and the tapped button', async () => {
  const e = new Engine();
  e.loadPreset('csph'); e.settle();
  const m = computeMetrics(e);
  store.set({ presetId: 'csph', params: e.params });
  const pane = createTrialsPane();
  document.body.append(pane.el);
  pane.update({ metrics: m });
  await wait();
  const rowsBefore = [...pane.el.querySelectorAll('.tr-row')];
  assert.ok(rowsBefore.length > 0, 'the list has rows');
  const btn = pane.el.querySelector('.tr-row.hero');
  assert.equal(btn?.dataset.id, 'predesci', 'CSPH, compensated by its case history: PREDESCI leads (TC-F3)');
  btn.click();
  await wait();
  assert.equal(btn.isConnected, true, 'the tapped row is still in the page (focus stays)');
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.ok(pane.el.querySelector('.tr-exp'), 'the trial opened');
  for (const r of rowsBefore) assert.equal(r.isConnected, true, `row ${r.dataset.row} kept`);
  btn.click();
  await wait(400);
  assert.equal(btn.isConnected, true);
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  const fold = pane.el.querySelector('.tr-fh[data-fold="no"]');
  fold.click();
  await wait();
  for (const r of rowsBefore) assert.equal(r.isConnected, true, `row ${r.dataset.row} kept after a fold opened`);
  assert.equal(fold.isConnected, true);
  pane.dispose();
});
