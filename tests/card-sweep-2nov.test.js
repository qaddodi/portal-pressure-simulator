// Card motion sweep (2 Nov 2026, "No more glitches", code only): three ways a slide change's cards could glitch, each driven here.
// - a swipe let go while the slide's prepare wait runs (prepHold: busy still false) was taken for a swipe that changes nothing;
// - a talk's thrown cards (held or pinned out of sight at an inline 0) stayed in card-throw.js's sets after the talk;
// - the endoscopic tile ended on the picture a reading had left when it went one way and came back inside the 30 ms wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import './dom-shim.js';
import { swipeHeld } from '../src/ui/card-page.js';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const ct = await import('../src/ui/card-throw.js');
const { pictureQueue, scopeKey } = await import('../src/ui/scope-tile.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const mk = (...cls) => { const s = new Map(), c = new Set(cls); return { style: { setProperty: (k, v) => s.set(k, v), removeProperty: (k) => s.delete(k), get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } }, classList: { contains: (x) => c.has(x), add: (x) => c.add(x), remove: (x) => c.delete(x) }, isConnected: true, hidden: false }; };

const presenter = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));

test('swipe let go: held for the slide\'s leave while a change is on its way (running, or waiting in prepHold), eased back only when nothing changes', () => {
  assert.equal(swipeHeld({ gone: true, changing: true, out: false }), true, 'on its way: held');
  assert.equal(swipeHeld({ gone: true, changing: false, out: false }), false, 'nothing changes: eases back');
  assert.equal(swipeHeld({ gone: false, changing: true, out: false }), false, 'a swipe given up is never held');
  assert.equal(swipeHeld({ gone: true, changing: true, out: true }), false, 'already leaving: thrown on, not held');
  // The wait: go() returns without run() while the slide is not prepared, so busy is false and prepT is the change's only sign.
  assert.match(presenter, /const changing = \(\) => busy \|\| !!prepT;/);
  assert.match(presenter, /if \(swipeHeld\(\{ gone, changing: changing\(\), out \}\)\) \{/);
  assert.match(presenter, /if \(!changing\(\)\) pageForce = false;/, 'the force that makes the words leave survives the wait');
  assert.match(presenter, /!!ui && !changing\(\) && !caseCard && !zoomOn\(\)/, 'no finger follow starts on a card about to leave');
  const go = presenter.slice(presenter.indexOf('  function go(i) {'), presenter.indexOf('  function prepHold('));
  assert.match(go, /if \(!slidePrep\.ready\(want\)\) \{ outNow\(\); prepHold\(want, goOn\); \} else goOn\(\);/, 'prepHold is the wait the swipe lands in (the cards that show are thrown first: push B)');
  assert.match(go, /const goOn = \(\) => \{\n\s+clearTimeout\(prepT\); prepT = 0;/, 'a press answered now leaves no stale wait that reads as a change');
  const hold = presenter.slice(presenter.indexOf('  function prepHold('), presenter.indexOf('  const KEEP_NOW'));
  assert.match(hold, /prepT = setTimeout\(look, 16\);/, 'prepT is set for the whole wait');
});

test('card-throw: a talk ending lets go of a card sent out on the tap (pinned) and of one held out of sight, and frees a wait on a way out', async () => {
  // pinned: sent out on the tap with no leave class yet
  const a = mk();
  ct.throwOutNow(a, 'next', 300);
  for (let i = 0; i < 60 && !ct.throwPinned(a); i++) tick(16);
  assert.equal(ct.throwPinned(a), true, 'out of sight, waiting for the new slide\'s change');
  ct.throwStop(a);
  assert.equal(ct.throwPinned(a), false, 'let go with the talk');
  // held: thrown out with its leave class on
  const b = mk('pz-leave');
  ct.throwOut(b, 'next', 300);
  for (let i = 0; i < 60 && !ct.throwHeld(b); i++) tick(16);
  assert.equal(ct.throwHeld(b), true);
  ct.throwStop(b);
  assert.equal(ct.throwHeld(b), false);
  // a change waiting on a way out (throwsOut) is freed when the card that was going is let go
  const c = mk('pz-leave');
  ct.throwOut(c, 'back', 300);
  let freed = false;
  ct.throwsOut().then(() => { freed = true; });
  ct.throwStop(c);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(freed, true);
  assert.equal(ct.throwing(c), false);
  // presenter: stopNow lets go of the four cards before it drops the ui, and clears the swipe's hold
  const stop = presenter.slice(presenter.indexOf('  function stopNow('), presenter.indexOf('  // When the show ends, the app returns'));
  const at = stop.indexOf('for (const el of [ui.text, ui.shade, ui.data, ui.panel]) throwStop(el);');
  assert.ok(at > 0 && at < stop.indexOf('ui = null;'), 'throwStop of the four cards comes before the ui is dropped');
  assert.match(stop, /if \(pageHeld\) \{ clearTimeout\(pageHeld\.t\); pageHeld = null; \}\n\s+pull = null; pageForce = false; bare = false; throwDir = ''; throwD = 0;/);
});

test('scope tile: a reading that goes one way and comes back inside the wait ends on the picture it came back to', () => {
  let key = null; const shown = [], timers = new Map(); let id = 0;
  const q1 = pictureQueue((k) => { shown.push(k); key = k; }, () => key, { setT: (f) => { timers.set(++id, f); return id; }, clearT: (i) => timers.delete(i) });
  const run = () => { const fs = [...timers.values()]; timers.clear(); fs.forEach((f) => f()); };
  q1.ask(5); run();
  assert.deepEqual(shown, [5], 'the first picture, at once');
  q1.ask(6);   // the varix swells: picture 6 waits its 30 ms
  q1.ask(5);   // and shrinks back before it was drawn: the picture showing is the right one
  run();
  assert.deepEqual(shown, [5], 'picture 6 is not drawn after the reading is back at 5');
  q1.ask(6); q1.ask(7); run();
  assert.deepEqual(shown, [5, 7], 'the newest ask decides');
  q1.ask(8); q1.cancel(); run();
  assert.deepEqual(shown, [5, 7], 'a disposed tile draws nothing');
  assert.equal(scopeKey(2), -1);
  const src = readFileSync(new URL('../src/ui/scope-tile.js', import.meta.url), 'utf8');
  assert.match(src, /queue\.ask\(k\);/);
  assert.match(src, /queue\.cancel\(\);\n\s+cancelFrame\(asked\)/, 'dispose cancels the waiting picture');
});
