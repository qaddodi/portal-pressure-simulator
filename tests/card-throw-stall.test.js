// A long frame holds a card's move where it stood (the tester, iPhone, 17 Nov 2026: opening a deck, the title card sat at 0 for 700 ms and then went to 1 in one step, the frames
// in that window 194 to 239 ms). The move's clock goes on by what the frame took but never by more than STALL_MAX, as the camera's glides do (glide-clock.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const { STALL_MAX } = await import('../src/ui/glide-clock.js');
const mk = () => {
  const s = new Map(), pr = new Map();
  return { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; }, get transition() { return s.get('transition') || ''; } }, classList: { contains: () => false, add() {}, remove() {} }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };

test('a frame of 300 ms carries a fading card on by no more than STALL_MAX of its move, not to whole in one step', () => {
  const el = mk();
  ct.throwFade(el, 0);
  tick(16);
  const a = parseFloat(el.style.opacity);
  tick(300);
  const b = parseFloat(el.style.opacity);
  assert.ok(b > a, 'it goes on');
  assert.ok(b < 0.8, `held back by the stall, not whole (${b}); unheld, 316 ms of a 420 ms fade is 0.99`);
  // (the same card, frames on time: the same distance in the same number of calls is more)
  for (let i = 0; i < 80 && ct.throwing(el); i++) tick(16);
  assert.ok(!ct.throwing(el), 'it lands');
  assert.equal(parseFloat(el.style.opacity) || 1, 1);
});

test('STALL_MAX is the one camera glides use (a stall holds every move the same way)', () => {
  assert.ok(STALL_MAX > 16 && STALL_MAX < 100);
});
