// A card already coming in, asked to come in again, carries on from where it is (no blink back to nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const mk = () => { const s = new Map(); return { style: { setProperty: (k, v) => s.set(k, v), removeProperty: (k) => s.delete(k), get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } }, classList: { contains: () => false }, isConnected: true, hidden: false }; };
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };

test('throwIn mid-entrance does not restart the card from opacity 0', () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  for (let i = 0; i < 3; i++) tick(16);
  const o = parseFloat(el.style.opacity);
  assert.ok(o > 0.3);
  ct.throwIn(el, 'next', 0);
  assert.ok(parseFloat(el.style.opacity) >= o - 1e-9, 'opacity never drops on a repeated call');
  tick(16);
  assert.ok(parseFloat(el.style.opacity) >= o - 1e-9);
});
