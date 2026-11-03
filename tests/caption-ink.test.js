// Words over a halo are solid black over a light halo and solid white over a dark one (caption-gl.js inkOver).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { inkOver } = await import('../src/ui/caption-gl.js');

test('black over the light themes\' halo, white over the dark ones\'', () => {
  assert.equal(inkOver('rgba(251, 250, 247, 0.92)'), 'rgb(0, 0, 0)');
  assert.equal(inkOver('rgba(18, 17, 16, 0.92)'), 'rgb(255, 255, 255)');
  assert.equal(inkOver('rgba(26, 25, 23, 0.9)'), 'rgb(255, 255, 255)');
});
test('no halo, no override', () => { assert.equal(inkOver(''), ''); assert.equal(inkOver(undefined), ''); });
