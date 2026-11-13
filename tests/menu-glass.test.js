// Performance recs B3: the tooltip's glass is followed by its class and its transition events (as the why-pop is), so no present asks the
// page what runs on it: getAnimations flushes style. No browser: a fake page records what is read and what is listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';

let frames = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
const runFrames = () => { const q = frames; frames = []; for (const fn of q) fn(performance.now()); };

const listeners = {};
let observed = null;
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; } observe() { observed = this.cb; } disconnect() {} };
const el = (id) => {
  const cls = new Set();
  return { id, isConnected: true, reads: 0, classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } },
    getAnimations() { this.reads++; return []; }, matches: () => false };
};
const tip = el('tooltip');
globalThis.document.getElementById = (id) => (id === 'tooltip' ? tip : null);
globalThis.document.querySelectorAll = () => [];
globalThis.document.addEventListener = (ev, fn) => { listeners[ev] = fn; };
globalThis.document.body = {};

const { initMenuGlass, glassPlate } = await import('../src/ui/menu-glass.js');
let live = null, redraws = 0;
initMenuGlass({ add: (fn) => { live = fn; return { redraw: () => { redraws++; } }; } });
const menu = el('menu'); menu.getAnimations = () => [];
glassPlate(menu);
const listed = () => live().includes(tip);
const classOf = (on) => { tip.classList[on ? 'add' : 'remove']('show'); observed([{ target: tip }]); };

test('a tooltip at rest is not listed and its animations are never asked for, however many presents', () => {
  for (let i = 0; i < 50; i++) assert.equal(listed(), false);
  assert.equal(tip.reads, 0, 'no getAnimations read in a present');
});

test('a shown tooltip is listed; its exit keeps it listed until the transitions end', () => {
  classOf(true);
  assert.equal(listed(), true);
  classOf(false);
  assert.equal(listed(), true, 'the exit has not yet been announced: still listed');
  runFrames();
  listeners.transitionrun({ target: tip });
  listeners.transitionrun({ target: tip });
  runFrames(); runFrames(); runFrames();
  assert.equal(listed(), true, 'two transitions running');
  listeners.transitionend({ target: tip });
  assert.equal(listed(), true, 'one still running');
  listeners.transitionend({ target: tip });
  assert.equal(listed(), false, 'the exit is over');
  assert.equal(tip.reads, 0);
});

test('an exit with no transition (reduced motion) is listed for a few frames and then let go', () => {
  classOf(true);
  const before = redraws;
  classOf(false);
  assert.equal(listed(), true);
  runFrames(); runFrames(); runFrames(); runFrames();
  assert.equal(listed(), false);
  assert.ok(redraws > before, 'the glass is asked to be drawn again as it goes');
});

test('a missed transition end cannot keep a hidden tooltip listed', () => {
  classOf(true);
  listeners.transitionrun({ target: tip });
  classOf(false);
  runFrames(); runFrames(); runFrames(); runFrames();
  assert.equal(listed(), false, 'the count starts again as .show leaves');
});
