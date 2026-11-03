// The card-throw motion state (R01): what each card is doing, and when a move lands, read from the same runs/held/pinned the frame steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const mk = (cls = []) => {
  const s = new Map(), c = new Set(cls);
  return { style: { setProperty: (k, v) => s.set(k, v), removeProperty: (k) => s.delete(k), get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const run = (until) => { for (let i = 0; i < 200 && !until(); i++) tick(8); };
const settled = (p) => { let v; p.then((x) => { v = x; }); return () => v; };
const flush = () => new Promise((r) => setTimeout(r, 0));

test('an unowned card has no state, is not busy, and its landing is true at once', async () => {
  const el = mk();
  assert.equal(ct.throwState(el), null);
  assert.equal(ct.throwBusy(el), false);
  assert.equal(await ct.throwLanded(el), true);
  assert.equal(ct.anyThrowBusy([el, null]), false);
});

test('state through in: kind, run id, remaining, readable only once whole', async () => {
  const el = mk();
  ct.throwIn(el, 'next');
  const s0 = ct.throwState(el);
  assert.equal(s0.kind, 'in'); assert.equal(s0.held, false); assert.equal(s0.pinned, false);
  assert.ok(s0.left > 500 && s0.left <= 560, `left ${s0.left}`);
  assert.equal(s0.readable, false);
  assert.ok(ct.throwBusy(el) && ct.anyThrowBusy([el]));
  tick(16);
  const s1 = ct.throwState(el);
  assert.equal(s1.run, s0.run);
  assert.ok(s1.left < s0.left && s1.o > 0 && s1.o < 1 && s1.x < 56);
  let sawUnreadable = false, ready = null;
  for (let i = 0; i < 100 && ct.throwing(el); i++) {
    const s = ct.throwState(el);
    if (s && !s.readable) sawUnreadable = true;
    if (s && s.readable && !ready) ready = s;
    tick(8);
  }
  assert.ok(sawUnreadable && ready, 'readable arrives mid-run, after it was not');
  assert.ok(ready.o >= 0.999 && ready.left > 0, 'readable (whole) before the run lands');
  assert.equal(ct.throwing(el), false);
  assert.equal(ct.throwState(el), null);
});

test('run ids rise with every start', () => {
  const el = mk(), b = mk();
  ct.throwIn(el, 'next'); const a = ct.throwState(el).run;
  ct.throwIn(b, 'next'); const c = ct.throwState(b).run;
  ct.throwBack(el, -10, 0.5); const d = ct.throwState(el).run;
  assert.ok(c > a && d > c, `${a} ${c} ${d}`);
  ct.throwStop(el); ct.throwStop(b);
});

test('state through out and back; out is never readable', async () => {
  const el = mk(['pz-leave']);
  ct.throwOut(el, 'next', 300);
  const s = ct.throwState(el);
  assert.equal(s.kind, 'out'); assert.equal(s.readable, false); assert.ok(s.left > 0);
  const id = s.run;
  run(() => !ct.throwing(el));
  const h = ct.throwState(el);
  assert.ok(h.held && !h.pinned && h.left === 0 && h.readable === false && h.run === id, JSON.stringify(h));
  assert.ok(ct.throwBusy(el) && ct.throwHeld(el));
  assert.equal(await ct.throwLanded(el), true, 'held has no run: true at once');
  ct.throwBack(el, -5, 0.4);
  assert.equal(ct.throwState(el).kind, 'back');
  assert.equal(ct.throwState(el).held, false);
  run(() => !ct.throwing(el));
  assert.equal(ct.throwState(el), null);
});

test('pinned reports pinned until released', () => {
  const el = mk();
  ct.throwOutNow(el, 'next', 300);
  run(() => !ct.throwing(el));
  const p = ct.throwState(el);
  assert.ok(p.pinned && !p.held && p.left === 0 && !p.readable && p.kind === 'out', JSON.stringify(p));
  assert.ok(ct.throwBusy(el));
  ct.throwRelease(el);   // (no leave class: let go)
  assert.equal(ct.throwBusy(el), false);
  assert.equal(ct.throwState(el), null);
});

test('throwLanded: true on a frame landing, nothing left behind', async () => {
  const el = mk();
  ct.throwIn(el, 'next');
  const v = settled(ct.throwLanded(el)), w = settled(ct.throwLanded(el));
  await flush(); assert.equal(v(), undefined, 'not before it lands');
  run(() => !ct.throwing(el));
  await flush();
  assert.equal(v(), true); assert.equal(w(), true);
  assert.equal(await ct.throwLanded(el), true);
});

test('throwLanded: true when the guard lands a run no frame finished', async () => {
  const el = mk();
  ct.throwBack(el, -10, 0.5);
  const v = settled(ct.throwLanded(el));
  T += 5000; q = [];   // (no frame ever comes)
  ct.throwGuard();
  await flush();
  assert.equal(v(), true);
  assert.equal(ct.throwing(el), false);
  tick(0);   // (the frame it had asked, now empty: the loop asks again for the next move)
});

test('throwLanded: false when stopped', async () => {
  const el = mk();
  ct.throwIn(el, 'next');
  const v = settled(ct.throwLanded(el));
  tick(50);
  ct.throwStop(el);
  await flush();
  assert.equal(v(), false);
  assert.equal(ct.throwBusy(el), false);
});

test('throwLanded: false when another move takes the card (out during in, back over in); the new run lands true', async () => {
  const el = mk(['pz-leave']);
  ct.throwIn(el, 'next');
  const v = settled(ct.throwLanded(el));
  tick(60);
  ct.throwOut(el, 'next', 300);
  await flush();
  assert.equal(v(), false);
  const nv = settled(ct.throwLanded(el));
  run(() => !ct.throwing(el));
  await flush();
  assert.equal(nv(), true);
  ct.throwBack(el, 0, 0.2);
  const b = settled(ct.throwLanded(el));
  ct.throwBack(el, -8, 0.3);
  await flush();
  assert.equal(b(), false);
  ct.throwStop(el);
});
