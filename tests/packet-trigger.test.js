// The ways to open "What's wrong here?" (src/ui/packet/trigger.js). The long press on the PREVIEW pill did nothing on an iPhone: iOS sends a pointercancel
// when it starts a text selection or callout on a held pill (about 0.5 s in), and the first version stopped its timer on it. These tests drive the press with
// synthetic events, the way a phone sends them, and fail if a cancel, a touch-only press or a click after the hold goes wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longPress, isChord, HOLD_MS } from '../src/ui/packet/press.js';

function rig(opts) {
  const h = {}, timers = []; let id = 0;
  const badge = { addEventListener: (n, f) => { (h[n] ||= []).push(f); }, removeEventListener: (n, f) => { h[n] = (h[n] || []).filter((g) => g !== f); } };
  const clock = { set: (fn, ms) => { timers.push({ id: ++id, fn, ms }); return id; }, clear: (i) => { const k = timers.findIndex((t) => t.id === i); if (k >= 0) timers.splice(k, 1); } };
  const holds = [];
  const off = longPress(badge, () => holds.push(1), { timers: clock, ...opts });
  const fire = (n, e = {}) => { const ev = { clientX: 0, clientY: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...e }; for (const f of h[n] || []) f(ev); return ev; };
  const elapse = () => { const t = timers.shift(); t?.fn(); return t; };
  return { fire, elapse, timers, holds, off, h };
}

test('a held pill opens the sheet after the hold time', () => {
  const r = rig();
  r.fire('pointerdown', { clientX: 5, clientY: 5 });
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, HOLD_MS);
  r.elapse();
  assert.equal(r.holds.length, 1);
});

test('iOS pointercancel mid-hold does not end the hold (the iPhone bug)', () => {
  const r = rig();
  r.fire('pointerdown');
  r.fire('pointercancel');
  r.fire('pointerleave');
  assert.equal(r.timers.length, 1, 'the timer survives a cancel');
  r.elapse();
  assert.equal(r.holds.length, 1);
});

test('a touch-only press (no pointer events) also opens it, once', () => {
  const r = rig();
  r.fire('touchstart', { touches: [{ clientX: 3, clientY: 3 }] });
  r.fire('pointerdown', { clientX: 3, clientY: 3 });
  assert.equal(r.timers.length, 1, 'both events arm one timer');
  r.elapse();
  assert.equal(r.holds.length, 1);
});

test('lifting early or moving away cancels', () => {
  for (const [name, act] of [['pointerup', (r) => r.fire('pointerup')], ['touchend', (r) => r.fire('touchend')], ['move', (r) => r.fire('pointermove', { clientX: 40, clientY: 0 })], ['touchmove', (r) => r.fire('touchmove', { touches: [{ clientX: 0, clientY: 30 }] })]]) {
    const r = rig();
    r.fire('pointerdown', { clientX: 0, clientY: 0 });
    act(r);
    assert.equal(r.timers.length, 0, name);
  }
  const r = rig();
  r.fire('pointerdown');
  r.fire('pointermove', { clientX: 3, clientY: 3 });
  assert.equal(r.timers.length, 1, 'a small wobble is kept');
});

test('the click after a hold is swallowed (no reload); a plain tap is not', () => {
  const r = rig();
  r.fire('pointerdown'); r.elapse(); r.fire('pointerup');
  const c = r.fire('click');
  assert.ok(c.stopped && c.defaultPrevented);
  r.fire('pointerdown'); r.fire('pointerup');
  const tap = r.fire('click');
  assert.ok(!tap.stopped, 'the tap still reloads onto the newest build');
});

test('the callout, context menu and text selection are prevented; off() removes everything', () => {
  const r = rig();
  assert.ok(r.fire('contextmenu').defaultPrevented);
  assert.ok(r.fire('selectstart').defaultPrevented);
  r.fire('pointerdown');
  r.off();
  assert.equal(r.timers.length, 0);
  assert.ok(Object.values(r.h).every((l) => l.length === 0));
});

test('the chord is Alt+Shift+/ outside text fields only', () => {
  const k = (o) => ({ code: 'Slash', shiftKey: true, altKey: true, target: { tagName: 'DIV' }, ...o });
  assert.ok(isChord(k()));
  assert.ok(!isChord(k({ altKey: false })), 'Shift+? alone is the shortcuts help');
  assert.ok(!isChord(k({ target: { tagName: 'TEXTAREA' } })));
  assert.ok(!isChord(k({ metaKey: true })));
});
