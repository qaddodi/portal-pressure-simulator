// A card let go short of a swipe eases back on the card-throw clock (no CSS or script animation), so its glass and its words, both written
// in the frame, part for no frame (3 Nov 2026, cards trailing). Its own file: the finish tests drop the frame queue by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const mk = () => {
  const s = new Map(), pr = new Map(), c = new Set();
  return { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const later = async (done) => { for (let i = 0; i < 400 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); };
const atRest = (el) => el.style.transform === '' && el.style.opacity === '';

test('a card let go short of a swipe eases back from the finger on the throw clock: no animation, every frame written, at rest at the end', async () => {
  const el = mk();
  el.animate = () => { throw new Error('a card eased back by a CSS or script animation (the compositor) is a frame from where its glass is'); };
  ct.throwBack(el, -22, 0.6);
  assert.ok(ct.throwing(el));
  assert.equal(el.style.transform, 'translateX(-22.00px)', 'it starts where the finger left it, written at once');
  let lastX = -22, lastO = 0.6, frames = 0;
  while (ct.throwing(el) && frames < 100) {
    tick(8); frames++;
    const x = parseFloat(/-?[\d.]+/.exec(el.style.transform || 'translateX(0px)')[0]), o = parseFloat(el.style.opacity || '1');
    assert.ok(x >= lastX - 1e-6 && x <= 0.01, `x eases toward 0 (${lastX} -> ${x})`);
    assert.ok(o >= lastO - 1e-6 && o <= 1, `opacity rises with it (${lastO} -> ${o})`);
    lastX = x; lastO = o;
  }
  assert.ok(frames > 10 && frames < 60, `about D_SMALL (240 ms) of 8 ms frames, was ${frames}`);
  await later(() => atRest(el));
  assert.ok(atRest(el), `at rest: ${el.style.transform} ${el.style.opacity}`);
});
