// The motion state of a card's throw (R01): the presenter asks card-throw.js whether a card is still arriving, instead of the browser's
// animations (which a scheduler-driven throw never makes). Stepped on a fake clock and frame queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => (f?.name === 'guard' ? { unref() {}, ref() {} } : realTimeout(f, ms, ...a));
const ct = await import('../src/ui/card-throw.js');

const mk = (cls = []) => {
  const s = new Map(), pr = new Map(), c = new Set(cls);
  return { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('a card with no throw is not owned, is not busy, and has landed', async () => {
  const el = mk();
  assert.equal(ct.throwState(el), null);
  assert.equal(ct.throwBusy(el), false);
  assert.equal(await ct.throwLanded(el), true);
});

test('a card coming in reports its run, a shrinking time to go, and is readable only once whole', async () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  const a = ct.throwState(el);
  assert.equal(a.kind, 'in'); assert.equal(a.readable, false); assert.ok(a.left > 500); assert.ok(ct.throwBusy(el));
  let landed = null; ct.throwLanded(el).then((v) => { landed = v; });
  tick(200);
  const b = ct.throwState(el);
  assert.equal(b.run, a.run); assert.ok(b.left < a.left);
  await flush(); assert.equal(landed, null, 'not landed part way');
  for (let i = 0; i < 80; i++) tick(8);
  await flush();
  assert.equal(landed, true);
  assert.equal(ct.throwState(el), null);
  assert.equal(ct.throwBusy(el), false);
});

test('readable: whole before the move ends (the earlier milestone for overlays)', () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  let seen = false;
  for (let i = 0; i < 80 && !seen; i++) { tick(8); const s = ct.throwState(el); if (s && s.readable) { seen = true; assert.ok(s.left > 0, 'whole while still sliding'); } }
  assert.ok(seen);
  for (let i = 0; i < 80; i++) tick(8);
});

test('a card stopped (a finger takes it) tells its waiter false', async () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  let landed = null; ct.throwLanded(el).then((v) => { landed = v; });
  tick(100);
  ct.throwStop(el);
  await flush();
  assert.equal(landed, false);
  assert.equal(ct.throwState(el), null);
});

test('a card sent out while a waiter waits for it arriving: false; waiting on a card going out: false at once', async () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  let landed = null; ct.throwLanded(el).then((v) => { landed = v; });
  tick(100);
  ct.throwOut(el, 'next', 300);
  await flush();
  assert.equal(landed, false);
  assert.equal(await ct.throwLanded(el), false);
  for (let i = 0; i < 100; i++) tick(8);
});

test('a repeated throwIn mid-way is the same arrival: its waiter hears the landing, not a false', async () => {
  const el = mk();
  ct.throwIn(el, 'next', 0);
  let landed = null; ct.throwLanded(el).then((v) => { landed = v; });
  tick(100);
  ct.throwIn(el, 'next', 0);
  await flush(); assert.equal(landed, null);
  for (let i = 0; i < 100; i++) tick(8);
  await flush();
  assert.equal(landed, true);
});

test('a card let go short of a swipe: its return is waited for, and lands true', async () => {
  const el = mk();
  ct.throwBack(el, 80, 0.5);
  assert.equal(ct.throwState(el).kind, 'back');
  let landed = null; ct.throwLanded(el).then((v) => { landed = v; });
  for (let i = 0; i < 80; i++) tick(8);
  await flush();
  assert.equal(landed, true);
});

test('a card thrown out and held (or pinned) is out of sight, busy, and not readable, with no run of its own going', async () => {
  const el = mk();
  ct.throwOutNow(el, 'next', 300);   // (no leave class: pinned when it lands)
  const first = ct.throwState(el).run;
  for (let i = 0; i < 100; i++) tick(8);
  const s = ct.throwState(el);
  assert.equal(s.pinned, true); assert.equal(s.readable, false); assert.equal(s.run, first); assert.equal(s.o, 0);
  assert.ok(ct.throwBusy(el));
  assert.equal(await ct.throwLanded(el), true, 'no run: nothing to wait for');
  ct.throwRelease(el);
});
