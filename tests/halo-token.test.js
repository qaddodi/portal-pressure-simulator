// The GPU's caption halo comes from the theme's token (--label-halo), not from the browser's computed stroke colour (label-captions.js haloOf).
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
const { haloOf, lookOf } = await import('../src/ui/label-captions.js');

const style = (token, stroke) => ({ getPropertyValue: (n) => (n === '--label-halo' ? token : ''), webkitTextStrokeColor: stroke });

test('the token wins over a stroke colour the browser reports differently', () => {
  assert.equal(haloOf(style('rgba(26, 25, 23, .9)', 'rgb(255, 255, 255)')), 'rgba(26, 25, 23, 0.9)');
  assert.equal(haloOf(style(' rgba(251, 250, 247, .92) ', 'rgba(26, 25, 23, 0.9)')), 'rgba(251, 250, 247, 0.92)', 'each theme its own token');
});

test('with no token (or one that is empty) the computed stroke colour is used', () => {
  assert.equal(haloOf(style('', 'rgba(26, 25, 23, 0.9)')), 'rgba(26, 25, 23, 0.9)');
  assert.equal(haloOf({ webkitTextStrokeColor: 'rgba(1, 2, 3, 0.5)' }), 'rgba(1, 2, 3, 0.5)');
});

test('lookOf takes its halo from the token too', () => {
  const cs = { ...style('rgba(18, 17, 16, .92)', 'rgb(255, 255, 255)'), fontSize: '12px', fontWeight: '400', letterSpacing: '0px', color: 'rgb(255,255,255)', opacity: '1', textTransform: 'none', marginRight: '0px', lineHeight: '1.2', rowGap: '0px', webkitTextStrokeWidth: '4px' };
  assert.equal(lookOf(cs, { name: cs }).haloC, 'rgba(18, 17, 16, 0.92)');
});
