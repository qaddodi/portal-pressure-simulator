// A view that is replaced in a card fades out where it stood (leave-fade.js; 17 Nov 2026, Mohammad's play-test of Tests › IR: the old view was hidden at once
// by display and the new one rose from nothing, so the card was blank for a beat). The parts are lifted, as they are, into a ghost that takes no room and
// fades, and go back to their places when it has; the stylesheet's hide rule for the IR view's host leaves the ghost alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'CustomEvent']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.innerWidth ??= 1024; globalThis.innerHeight ??= 768;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }
const { leaveFade } = await import('../src/ui/leave-fade.js');

const setup = () => {
  const made = [], proto = window.Element.prototype, oldA = proto.animate, oldR = proto.getBoundingClientRect;
  proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, finished: new Promise((r) => { res = r; }), cancel() { a.cancelled = true; res(); }, finish() { res(); } }; made.push(a); return a; };
  proto.getBoundingClientRect = function () { const t = Number(this.dataset?.top || 0), h = Number(this.dataset?.h || 0); return { left: 0, top: t, right: 300, bottom: t + h, width: h ? 300 : 0, height: h, x: 0, y: t }; };
  const host = document.createElement('div'); document.body.append(host);
  const mk = (cls, top, h) => { const e = document.createElement('div'); e.className = cls; e.dataset.top = top; e.dataset.h = h; return e; };
  return { made, host, mk, undo: () => { proto.animate = oldA; proto.getBoundingClientRect = oldR; } };
};

test('the parts go into a ghost that takes no room, fade by opacity, and come back to their own places', async () => {
  const t = setup();
  try {
    const a = t.mk('a', 0, 40), b = t.mk('b', 48, 200), gone = t.mk('hidden', 0, 0), incoming = t.mk('in', 0, 300);
    t.host.append(a, gone, b, incoming);
    const out = leaveFade([a, gone, b], incoming);
    const ghost = t.host.querySelector('.lf-ghost');
    assert.ok(ghost && ghost.inert && ghost.getAttribute('aria-hidden') === 'true');
    assert.deepEqual([...ghost.children], [a, b], 'the visible parts, the very elements (a part that shows nothing stays out)');
    assert.equal(ghost.nextElementSibling, incoming, 'laid in the incoming view\'s place in the column');
    assert.match(ghost.style.cssText, /height: 248(\.0)?px/, 'as tall as the parts were, from the first top to the last foot');
    assert.match(ghost.style.cssText, /margin-bottom: -248(\.0)?px/, 'and cancelled, so the incoming view stays where it was (no gap in a jsdom column)');
    out.start();
    const fade = t.made.find((x) => x.el === ghost);
    assert.deepEqual(fade.kf, [{ opacity: 1 }, { opacity: 0 }], 'opacity alone');
    fade.finish(); await new Promise((r) => setTimeout(r, 0));
    assert.ok(!ghost.isConnected);
    assert.deepEqual([...t.host.children].filter((c) => !(c instanceof window.Comment)), [a, gone, b, incoming], 'back in their order');
    assert.ok(![...t.host.childNodes].some((n) => n.nodeType === 8), 'the places kept for them are gone');
  } finally { t.undo(); }
});

test('a new change ends a fade under way at once, the parts back where they were', () => {
  const t = setup();
  try {
    const a = t.mk('a', 0, 40), incoming = t.mk('in', 0, 300);
    t.host.append(a, incoming);
    const first = leaveFade([a], incoming); first.start();
    assert.ok(t.host.querySelector('.lf-ghost'));
    const again = leaveFade([incoming], null);
    assert.equal(t.host.querySelector('.lf-ghost')?.contains(a) ?? false, false, 'the first ghost is over: a is home');
    assert.equal(a.parentElement, t.host);
    again.end();
  } finally { t.undo(); }
});
