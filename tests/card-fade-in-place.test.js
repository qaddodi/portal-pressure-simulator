// A card that comes in with no throw (no Next or Back: a time-lapse's data card let in once its days end, a slide reached by a jump) fades in
// where it stands on card-throw.js's frame clock, as a thrown card does, never by its class's CSS fade. Mohammad, 10 Nov 2026: "the new card on
// new slide still sometimes FLICKERS". The CSS fade ran on the compositor through a long frame while the card's GPU glass, drawn by the page's
// own frames, waited: words over no frost, then the frost in one step. On the frame clock the card's opacity is written in the frame its glass
// reads it in, and a long frame holds both.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const mk = () => {
  const s = new Map(), pr = new Map();
  return { style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; }, get transition() { return s.get('transition') || ''; } }, classList: { contains: () => false, add() {}, remove() {} }, isConnected: true, hidden: false };
};
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };

test('a card faded in place starts at nothing in the task that asks, with its CSS transitions off, and never moves', () => {
  const el = mk();
  ct.throwFade(el);
  assert.equal(el.style.opacity, '0.000');
  assert.equal(el.style.getPropertyPriority('opacity'), 'important', 'over its leave class, as a throw writes it');
  assert.equal(el.style.transition, 'none');
  assert.ok(ct.throwing(el), 'it is a move the presenter waits for (cardMoving, cardsEntering)');
  let last = 0;
  for (let i = 0; i < 60 && ct.throwing(el); i++) {
    tick(16);
    const o = parseFloat(el.style.opacity);
    assert.ok(o >= last - 1e-9, 'its fade only rises');
    assert.match(el.style.transform, /^translateX\(0\.00px\)$/, 'no slide: it comes in where it stands');
    last = o;
  }
  assert.ok(!ct.throwing(el), 'it lands');
  assert.equal(last, 1);
});

test('it waits out its delay at nothing, then fades on the frame clock: a long frame holds it where it was', () => {
  const el = mk();
  ct.throwFade(el, ct.FADE_DELAY);
  tick(ct.FADE_DELAY - 20);
  assert.equal(parseFloat(el.style.opacity), 0, 'still waiting');
  tick(40);
  const a = parseFloat(el.style.opacity);
  assert.ok(a > 0 && a < 1);
  // (No frame for a while: nothing is written, so the card stays exactly where the last frame, and its glass, had it.)
  T += 200;
  assert.equal(parseFloat(el.style.opacity), a);
  tick(0);
  assert.ok(parseFloat(el.style.opacity) > a, 'the next frame carries on from the clock');
  for (let i = 0; i < 60 && ct.throwing(el); i++) tick(16);
});

test('a card caught on its way out fades back from where it is, never from nothing', () => {
  const el = mk();
  ct.throwOut(el, 'next', 300);
  tick(16); tick(16);
  const o = parseFloat(el.style.opacity);
  assert.ok(o > 0 && o < 1);
  ct.throwFade(el);
  assert.ok(Math.abs(parseFloat(el.style.opacity) - o) < 1e-9, 'no blink to nothing');
  tick(16);
  assert.ok(parseFloat(el.style.opacity) >= o - 1e-9);
  for (let i = 0; i < 80 && ct.throwing(el); i++) tick(16);
});
