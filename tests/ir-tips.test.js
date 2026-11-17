// Tests › IR › TIPS (16 Nov 2026, plan /mnt/project-files/tips-geometry/tips-test-card-plan.md, push A): the HVPG tab is renamed IR, its
// Measure | TIPS switch is always there (dimmed with no stent, never hidden), the TIPS view reads the stent's own numbers, and after a TIPS
// nothing in it says HVPG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.innerWidth ??= 1024; globalThis.innerHeight ??= 768;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
document.body.innerHTML = '<div id="toastsFoot"></div>';
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }

const { createIrTips, stentIds, stentPeak, stentLine, STENT_RANGE, NO_STENT_WHY } = await import('../src/ui/ir-tips.js');
const { store } = await import('../src/ui/store.js');
const { STENT_DOPPLER_K } = await import('../src/engine/topology.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const frameOf = (over = {}) => ({ metrics: { ppg: 9.2, tips: { kind: 'tips', d: 10, s: 0.4, dWaist: 6, flow: 1.58, dp: 7.1, vOpen: 38, vWaist: 105, parts: {} }, dips: null, ...over } });
const paramsOf = (o = {}) => ({ tips: { on: false, d: 10 }, dips: { on: false, d: 10 }, stenosis: {}, thrombus: {}, stenosisSite: {}, stentGeom: {}, ...o });
const mount = (params = paramsOf()) => {
  store.set({ params, mode: 'explore', presenting: false });
  const host = document.createElement('div');
  host.className = 'dock-pane';
  document.body.append(host);
  const ir = createIrTips({ host });
  document.body.append(ir.head);
  return { host, ir };
};

test('the tab is called IR; its id, and so every route to it, is still hvpg', () => {
  const dock = read('src/ui/dock.js'), proc = read('src/ui/hvpg-proc.js');
  assert.match(dock, /SHORT = \{[^}]*hvpg: 'IR'/);
  assert.match(dock, /const ORDER = \['profile', 'scope', 'hvpg',/);
  assert.match(proc, /return \{ id: 'hvpg', label: 'Interventional radiology', el, head: tips\.head,/);
  assert.doesNotMatch(dock, /hvpg: 'HVPG'/, 'the tab no longer carries the HVPG name');
});

test('both tester guides name the tab IR, not HVPG, in the Tests sentence', () => {
  for (const f of ['guides/beta-start-guide.pdf', 'guides/beta-start-guide-iphone.pdf']) {
    const raw = readFileSync(new URL(`../${f}`, import.meta.url)).toString('latin1');
    let b = raw;   // the page text lives in deflated content streams: read them all
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index + m[0].length, end = raw.indexOf('endstream', start);
      try { b += inflateSync(Buffer.from(raw.slice(start, end), 'latin1'), { finishFlush: 2 }).toString('latin1'); } catch { /* not a deflated stream */ }
    }
    assert.match(b, /tabs for Pressure, IR,/, f);
    assert.doesNotMatch(b, /tabs for Pressure, HVPG/, f);
  }
});

test('the stents the view reads: the TIPS, then the DIPS, from the params', () => {
  assert.deepEqual(stentIds(paramsOf()), []);
  assert.deepEqual(stentIds(paramsOf({ tips: { on: true, d: 8 } })), ['TIPS']);
  assert.deepEqual(stentIds(paramsOf({ dips: { on: true, d: 8 } })), ['DIPS']);
  assert.deepEqual(stentIds(paramsOf({ tips: { on: true }, dips: { on: true } })), ['TIPS', 'DIPS']);
});

test('the peak velocity is the Doppler card\'s own: K times the fastest gate; a narrowing\'s jet shows at its gate', () => {
  const open = stentPeak(paramsOf({ tips: { on: true, d: 10 } }), 'TIPS', { vOpen: 38 });
  assert.ok(open > 38 * STENT_DOPPLER_K * 0.9 && open <= 38 * STENT_DOPPLER_K + 1e-9, `${open}`);
  const p = paramsOf({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stenosisSite: { TIPS: 'mid' } });
  const jet = stentPeak(p, 'TIPS', { vOpen: 38 });
  assert.ok(jet > open * 2, `a 40 % narrowing at mid stent reads a jet: ${jet} against ${open}`);
  assert.equal(stentPeak(p, 'TIPS', null), null);
  assert.deepEqual([...STENT_RANGE], [90, 190]);
});

test('the line under the chip names the width and the narrowing', () => {
  assert.equal(stentLine(null), 'No stent');
  assert.equal(stentLine({ d: 10, s: 0, dWaist: 10 }), '10 mm, open');
  assert.equal(stentLine({ d: 10, s: 0.4, dWaist: 6 }), '10 mm, narrowed to 6 mm');
});

test('no stent: the TIPS segment is in the switch, dimmed and disabled, never hidden; a stent lights it without moving anything', () => {
  const { host, ir } = mount();
  ir.update(frameOf());
  const seg = () => ir.head.querySelector('[data-view="tips"]');
  assert.ok(seg(), 'the segment exists with no stent');
  assert.equal(ir.head.children.length, 2);
  return wait(60).then(() => {
    assert.equal(seg().getAttribute('aria-disabled'), 'true');
    assert.ok(seg().classList.contains('off'));
    assert.equal(seg().hidden, false);
    seg().click();
    assert.equal(ir.view(), 'measure', 'a tap on the dimmed segment does not switch');
    store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
    ir.update(frameOf());
    return wait(60).then(() => {
      assert.equal(ir.head.children.length, 2, 'the switch has the same two buttons');
      assert.equal(seg().getAttribute('aria-disabled'), 'false');
      assert.ok(!seg().classList.contains('off'));
      assert.equal(ir.view(), 'measure', 'a stent placed never switches the view for the person');
      assert.equal(host.dataset.view, 'measure');
    });
  });
});

test('the TIPS view fills its four readings from the stent; a stent taken away sends the view back to Measure', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stenosisSite: { TIPS: 'mid' } }));
  ir.update(frameOf());
  await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  assert.equal(ir.view(), 'tips');
  assert.equal(host.dataset.view, 'tips');
  ir.update(frameOf());
  await wait(60);
  const tiles = [...ir.el.querySelectorAll('.metric')];
  assert.deepEqual(tiles.map((t) => t.querySelector('.k').textContent), ['PPG', 'TIPS flow', 'Across stent', 'Stent peak velocity']);
  const words = tiles.map((t) => t.querySelector('.status').textContent);
  assert.equal(words[0], 'Target met');
  assert.equal(tiles[0].dataset.sev, 'ok');
  ir.update(frameOf({ ppg: 14.2 }));
  await wait(60);
  assert.equal(tiles[0].querySelector('.status').textContent, 'Above target');
  assert.equal(tiles[0].dataset.sev, 'danger');
  assert.ok(ir.el.querySelector('.ir-chip'), 'one chip names the stent');
  store.set({ params: paramsOf() });
  ir.update(frameOf({ tips: null }));
  assert.equal(ir.view(), 'measure', 'the stent is gone: back to Measure');
  assert.equal(host.dataset.view, 'measure');
});

test('after a TIPS nothing in the view says HVPG: not its words, not its labels, not its text', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  ir.update(frameOf()); await wait(60);
  const all = ir.el.outerHTML + ir.head.outerHTML;
  assert.doesNotMatch(all, /HVPG/i, 'the DOM');
  assert.doesNotMatch(NO_STENT_WHY, /HVPG/i);
  const src = read('src/ui/ir-tips.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /HVPG/i, 'the module\'s code and strings (comments aside)');
});

test('the stylesheet shows one view at a time, keeps the switch in pair mode, and dims the segment by opacity alone', () => {
  const plate = read('styles/app-06-plate.css'), cards = read('styles/app-08-cards.css');
  assert.match(plate, /\[data-pane="hvpg"\]\[data-view="tips"\] > :not\(\.ir-tips\) \{ display: none; \}/);
  assert.match(plate, /\[data-pane="hvpg"\]:not\(\[data-view="tips"\]\) > \.ir-tips \{ display: none; \}/);
  assert.match(plate, /\.ir-switch \.ps-btn\.off \{ opacity: \.42; \}/);
  assert.match(cards, /\.dock-body\.pair \.pressure-switch:not\(\.ir-switch\) \{ display: none; \}/);
});
