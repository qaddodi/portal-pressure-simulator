// Opening Treat raised "ResizeObserver loop completed with undelivered notifications" every time on a wide screen (play-test T02, 16 Nov 2026).
// The Treat body's observer (chart.js spare) wrote the pane's height as its own first report, which resized the card, which the card's other
// observers had already been told about at a shallower depth. openTreat now writes the height once the card is in the page (the third thing
// treatBody hands back), so the observer's first report finds the height already as it should be and writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'SVGElement', 'localStorage']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
const observers = [];
globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);

const { createChart } = await import('../src/ui/chart.js');
const { store, replaceParams } = await import('../src/ui/store.js');
const { defaultParams } = await import('../src/engine/portal/scenario.js');

test('treatBody hands back a fit that puts the pane height on, and the observer then writes the same', () => {
  replaceParams(defaultParams());
  const chart = createChart({ onWhy() {}, flash() {}, onScenarios() {}, action() {}, startShunt() {}, select() {}, timeline: { recordAction() {} }, pinned: () => null });
  const [, body, fit] = chart.treatBody([], () => {});
  assert.equal(typeof fit, 'function', 'the card can fit the pane once it is in the page');
  assert.equal(body.style.height, '', 'not in the page yet: nothing written');
  document.body.append(body);
  // (jsdom does no layout: every offsetHeight is 0, which is a fixed height to compare.)
  fit();
  const first = body.style.height;
  assert.match(first, /px$/, 'the height is on after fit');
  const before = body.getAttribute('style');
  for (const o of observers) o.fn([]);   // (the observer's first report)
  assert.equal(body.getAttribute('style'), before, 'the first report finds the height already on and changes nothing');
});
