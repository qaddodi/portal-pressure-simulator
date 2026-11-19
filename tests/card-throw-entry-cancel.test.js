// CRD-4 (bible review, 19 Nov 2026): a card's entrance waits for its widgets (enterWhenReady, up to 450 ms). Any move the card is given in that
// wait (a Next that throws it out, a finger, a second way in) ends the wait: a stale hold used to fire later and slide the old card back in.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A card whose one widget is not drawn yet (.wgl whose host has no .wgl-on) until up.on is set.
const mk = () => {
  const s = new Map(), pr = new Map(), c = new Set();
  const host = { classList: { contains: () => up.on } }, w = { classList: { contains: (n) => n === 'wgl' }, parentElement: host };
  const up = { on: false };
  return { up, el: { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, querySelectorAll: () => [w], isConnected: true, hidden: false } };
};

test('a Next during the readiness hold throws the card out and the stale hold does not bring it back', async () => {
  const { el, up } = mk();
  ct.throwIn(el, 'next', 0);
  assert.equal(ct.throwEntering(el), true, 'the entrance is waiting for the widgets');
  assert.equal(ct.throwing(el), false, 'nothing moves yet');
  ct.throwOutNow(el, 'next', 300);
  assert.equal(ct.throwEntering(el), false, 'the out ended the wait');
  assert.equal(ct.throwState(el).kind, 'out');
  up.on = true;                       // the widgets come up now: the stale poll would fire here
  await wait(60);
  for (let i = 0; i < 80; i++) tick(8);
  assert.notEqual(ct.throwState(el)?.kind, 'in', 'no entrance was started over the out');
  assert.equal(parseFloat(el.style.opacity), 0, 'the card stays out of sight');
});

test('throwOut, throwStop, throwBack and throwRelease each end a pending entrance; a second way in replaces the wait', async () => {
  for (const end of [(e) => ct.throwOut(e, 'next', 300), (e) => ct.throwStop(e), (e) => ct.throwBack(e, 20, 0.5), (e) => ct.throwRelease(e)]) {
    const { el, up } = mk();
    ct.throwFade(el, 0, 100);
    assert.equal(ct.throwEntering(el), true);
    end(el);
    assert.equal(ct.throwEntering(el), false, end.toString());
    up.on = true; await wait(40);
    for (let i = 0; i < 80; i++) tick(8);
  }
  const { el, up } = mk();
  ct.throwIn(el, 'next', 0); ct.throwIn(el, 'next', 0);
  up.on = true; await wait(60);
  assert.equal(ct.throwState(el).kind, 'in', 'one entrance starts, once');
  for (let i = 0; i < 100; i++) tick(8);
  assert.equal(ct.throwEntering(el), false);
  assert.equal(ct.throwState(el), null, 'it landed');
});

test('a card with nothing pending comes in at once and holds nothing', () => {
  const { el, up } = mk(); up.on = true;
  ct.throwIn(el, 'next', 0);
  assert.equal(ct.throwEntering(el), false);
  assert.equal(ct.throwState(el).kind, 'in');
  for (let i = 0; i < 100; i++) tick(8);
});
