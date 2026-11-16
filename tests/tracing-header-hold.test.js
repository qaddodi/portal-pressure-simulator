// A tracing card holds back the readings it measures in its header (the HVPG, its fall, the PPG) until the measurement is done: no "HVPG FALL 16 %" over an empty
// tracing (Mohammad, 16 Nov 2026: "yes wait"). The card marks itself data-reading="pending" while a reading is being taken, and the header's measured items fade
// out under it (app-11-deck-visuals.css); this checks the card's own state for each way a tracing is shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'Event', 'SVGElement']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.innerHeight ??= 800; globalThis.innerWidth ??= 1200;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createHvpgCard } = await import('../src/ui/tool-hvpg.js');
const { MEASURED } = await import('../src/ui/presenter-cards.js');

const fp = { fhvp: 5, whvp: 16, hvpg: 11 };
const pending = (c) => c.el.dataset.reading === 'pending';

test('the measured readings are the HVPG, its fall and the PPG; the blood pressure is not held', () => {
  assert.deepEqual(MEASURED.slice().sort(), ['hvpg', 'hvpgFall', 'ppg']);
  assert.ok(!MEASURED.includes('map'));
});

test('stepped onto going forward, the header waits for the HVPG, the last of its three readings; jumped to, it shows at once', () => {
  const c = createHvpgCard();
  c.configure({}, { slide: {} }); c.arrive({ forward: true }); c.pin(fp);
  assert.equal(pending(c), true, 'the free pressure is up and nothing else is read');
  assert.equal(c.step(1), true); assert.equal(pending(c), true, 'the wedge is not the HVPG');
  assert.equal(c.step(1), true); assert.equal(pending(c), false, 'the HVPG is read');
  assert.equal(c.step(-1), true); assert.equal(pending(c), true, 'Back takes the HVPG back, and the header with it');
  const j = createHvpgCard();
  j.configure({}, { slide: {} }); j.arrive({ forward: false }); j.pin(fp);
  assert.equal(pending(j), false, 'a finished tracing');
});

test('on the figure\'s catheter the header waits for the balloon to be up in the vein on the result step; the earlier steps never show it', () => {
  const c = createHvpgCard();
  c.configure({ catheter: true }, { slide: { cath: 'result' } }); c.arrive({ forward: true }); c.pin(fp);
  assert.equal(pending(c), true, 'the catheter is not in the vein yet');
  c.reach(true); c.balloon(0.4);
  assert.equal(pending(c), true, 'the balloon is still filling');
  c.balloon(1);
  assert.equal(pending(c), false, 'wedged: the reading is whole');
  c.balloon(0.5); assert.equal(pending(c), true, 'the balloon down again takes it back');
  const w = createHvpgCard();
  w.configure({ catheter: true }, { slide: { cath: 'wedge' } }); w.arrive({ forward: true }); w.pin(fp); w.reach(true); w.balloon(1);
  assert.equal(pending(w), true, 'a wedge slide has no result yet');
});
