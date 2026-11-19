// Every procedure on Treat's Procedures tab is DONE by its own button (Mohammad, 16 Nov 2026, play-tests: "Band (EVL) in Treat does nothing until the varices
// card's own Band link is tapped", BRTO "only opens the Fundal varices card, and the real action is the switch inside the card"). The one path is
// chart.js treatBody's procedure buttons: a tap changes the model (a params change or a model action) and then shows the vessel or organ, so the card
// is where the result is read, never where the order is given. Paracentesis is the one that takes a choice (the volume) and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'SVGElement', 'localStorage']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);

const { createChart } = await import('../src/ui/chart.js');
const { store, replaceParams } = await import('../src/ui/store.js');
const { defaultParams } = await import('../src/engine/portal/scenario.js');
const { PROCEDURES } = await import('../src/ui/procedure-names.js');

function mount(patch) {
  const p = defaultParams(); if (patch) patch(p);
  replaceParams(p);
  const actions = [], selected = [];
  const chart = createChart({ onWhy() {}, flash() {}, onScenarios() {}, action: (a) => actions.push(a), startShunt() {}, select: (s) => selected.push(s), timeline: { recordAction() {} }, pinned: () => null });
  const [, pane] = chart.treatBody([], () => {});
  const procs = [...pane.querySelectorAll('.order-grid')].find((g) => g.querySelector('.ob-t') && /Band/.test(g.textContent));
  const btn = (label) => [...procs.querySelectorAll('button')].find((b) => b.querySelector('.ob-t')?.textContent === label);
  return { actions, selected, btn, procs };
}

test('Band (EVL) is given by the Treat button itself: one tap sends the band and shows the varices', () => {
  const { actions, selected, btn } = mount();
  btn('Band (EVL)').click();
  assert.deepEqual(actions.filter((a) => a.kind === 'band'), [{ kind: 'band' }], 'one band per tap');
  assert.deepEqual(selected.at(-1), { type: 'organ', id: 'varices' });
});

test('BRTO is given by the Treat button itself: one tap occludes the gastrorenal shunt and shows the fundal varices', () => {
  const { selected, btn } = mount((p) => { p.spontaneous.C5 = true; });
  assert.ok(!store.get().params.occluded.C5);
  btn(PROCEDURES.brto.label).click();
  assert.equal(store.get().params.occluded.C5, true, 'the shunt is occluded by the Treat tap, not by the switch in the card');
  assert.deepEqual(selected.at(-1), { type: 'organ', id: 'gastric' });
});

test('the balloon is given by the Treat button itself: the gastric balloon (the first step) goes up with one tap', () => {
  const { btn } = mount();
  assert.ok(!store.get().params.balloonGas);
  btn(PROCEDURES.balloon.label).click();
  assert.equal(store.get().params.balloonGas, true);
  assert.ok(!store.get().params.balloonEso, 'the esophageal balloon is the second step, in the card');
});

test('TIPS and DIPS were already done by their buttons: a tap places them', () => {
  const { btn } = mount();
  btn(PROCEDURES.tips.label).click(); assert.equal(store.get().params.tips.on, true);
  btn(PROCEDURES.dips.label).click(); assert.equal(store.get().params.dips.on, true);
});

test('BRTO on a patient with no gastrorenal shunt changes nothing and says why (it has nothing to occlude)', () => {
  const { selected, btn } = mount();
  btn(PROCEDURES.brto.label).click();
  assert.ok(!store.get().params.occluded.C5);
  assert.deepEqual(selected.at(-1), { type: 'organ', id: 'gastric' });
});
