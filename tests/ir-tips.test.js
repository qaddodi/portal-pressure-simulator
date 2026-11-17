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

const { createIrTips, stentIds, stentLine, STENT_RANGE, NO_STENT_WHY } = await import('../src/ui/ir-tips.js');
const { store } = await import('../src/ui/store.js');
const { curveToolOf, sweepMatters, SWEEPS } = await import('../src/ui/ir-curves.js');
const { curveSteps, curveSeries, drawnLines, curveXs } = await import('../src/ui/tool-curve.js');
const { BENCH_DP } = await import('../src/engine/stent-geom.js');
const { createIrCompare, changeOf, NOTHING_PINNED } = await import('../src/ui/ir-compare.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const frameOf = (over = {}) => ({ metrics: { ppg: 9.2, tips: { kind: 'tips', d: 10, s: 0.4, dWaist: 6, flow: 1.58, dp: 7.1, vOpen: 38, vWaist: 105, vPeak: 129, peaks: [60, 129, 70], parts: { tract: 2, wall: 1, entry: 1.5, jet: 2, inlet: 0.6 } }, dips: null, ...over } });
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

test('the peak velocity range is the Doppler card\'s own: one copy, 90 to 190 cm/s', () => {
  assert.deepEqual([...STENT_RANGE], [90, 190]);
  assert.doesNotMatch(read('src/ui/ir-tips.js'), /stentReadsOf|STENT_DOPPLER_K/, 'the velocity is the engine\'s vPeak, never worked out a second time here');
});

test('the line under the chip names the width and the narrowing', () => {
  assert.equal(stentLine(null), 'No stent');
  assert.equal(stentLine({ d: 10, s: 0, dWaist: 10 }), '10 mm, open');
  assert.equal(stentLine({ d: 10, s: 0.4, dWaist: 6 }), '10 mm, narrowed to 6 mm');
  // The two narrowings named apart (17 Nov 2026): the waist mid stent, the stenosis at its end.
  assert.equal(stentLine({ d: 10, s: 0.4, dWaist: 6, red: 0.4, end: 0, site: 'distal', geom: { waist: 4 } }), '10 mm, waist 6 mm over 4 cm');
  assert.equal(stentLine({ d: 10, s: 0.5, dWaist: 5, red: 0, end: 0.5, site: 'proximal', geom: { waist: 1 } }), '10 mm, proximal stenosis to 5 mm');
  assert.equal(stentLine({ d: 10, s: 0.5, dWaist: 5, red: 0.3, end: 0.5, site: 'distal', geom: { waist: 2 } }), '10 mm, waist 7 mm over 2 cm, distal stenosis to 5 mm');
  assert.equal(stentLine({ d: 8, s: 0, dWaist: 8, red: 0, end: 0, site: 'distal', geom: { waist: 1 } }), '8 mm, open');
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
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 }, stentGeom: { TIPS: { red: 0.4 } } }));
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
  assert.equal(ir.el.querySelectorAll('.ir-figs .gl .gl-stage').length, 2, 'the stent cards: the side view and the pressure bar, made once the view opens');
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
  assert.match(plate, /\.ir-figs \.gl \{ display: flex; flex-direction: column;/);
  assert.match(cards, /\.dock-body\.pair \.pressure-switch:not\(\.ir-switch\):not\(\.ir-sub\):not\(\.ir-sweep\) \{ display: none; \}/);
});

test('Compare: the change reads as the compare table\'s own does; a stent that was not there then shows dashes', () => {
  assert.deepEqual(changeOf(9.2, 14.2, 1), { cls: 'd up', tri: '▲', txt: '+5.0' });
  assert.deepEqual(changeOf(14.2, 9.2, 1), { cls: 'd down', tri: '▼', txt: '−5.0' });
  assert.deepEqual(changeOf(9.2, 9.21, 1), { cls: 'd same', tri: '', txt: '—' });
  assert.deepEqual(changeOf(null, 9.2, 1), { cls: 'd same', tri: '', txt: '—' });
});

test('Compare: nothing pinned says how, with the table already laid out in dashes; a pin fills it in', () => {
  const c = createIrCompare();
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }), compareSnap: null });
  const f = frameOf({ ppg: 9.2 });
  c.update(f, 'TIPS');
  assert.equal(c.el.querySelectorAll('tbody tr').length, 5, 'five readings, always laid out');
  assert.equal(c.el.querySelector('.ir-note').textContent, NOTHING_PINNED);
  assert.deepEqual([...c.el.querySelectorAll('td.a')].map((x) => x.textContent), ['—', '—', '—', '—', '—']);
  assert.equal(c.el.querySelector('td.b').textContent, '9.2');
  const then = { ppg: 14.2, tips: { ...f.metrics.tips, flow: 1.2, dp: 5.1, dWaist: 8, vPeak: 150 }, dips: null };
  store.set({ compareSnap: { metrics: then, when: '10:30', names: null } });
  c.update(f, 'TIPS');
  const rows = [...c.el.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(rows[0][1], '14.2'); assert.match(rows[0][3], /−5\.0/); assert.equal(c.el.querySelector('td.d').className, 'd down');
  assert.match(c.el.querySelector('.ir-note').textContent, /Compared with 10:30/);
  store.set({ compareSnap: { metrics: { ppg: 14.2, tips: null, dips: null }, when: '10:30', names: null } });
  c.update(f, 'TIPS');
  assert.equal([...c.el.querySelectorAll('tbody tr')][1].children[1].textContent, '—', 'no stent then: a dash, never a zero');
  store.set({ compareSnap: null });
});

test('Compare: the sub-switch changes the sub-view, and the DIPS names its own flow', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  assert.equal(ir.sub(), 'inside');
  ir.el.querySelector('[data-sub="compare"]').click();
  assert.equal(ir.sub(), 'compare');
  assert.equal(ir.el.dataset.sub, 'compare');
  ir.update(frameOf()); await wait(60);
  assert.equal(ir.el.querySelectorAll('.ir-compare tbody tr').length, 5);
  ir.el.querySelector('[data-sub="inside"]').click();
  assert.equal(ir.el.dataset.sub, 'inside');
  assert.equal(host.dataset.view, 'tips');
  assert.doesNotMatch(read('src/ui/ir-compare.js').replace(/\/\/.*$/gm, ''), /HVPG/i);
});

test('Curves: the tool a stent and a setting give is the deck\'s own curve, two lines, the bench dashed, in the flow\'s colour', () => {
  const t = curveToolOf('TIPS', 'waist');
  assert.equal(t.kind, 'curve'); assert.equal(t.param, 'stentGeom.TIPS.waist');
  assert.deepEqual(t.lines, ['tipsFlow', 'tipsBench']);
  assert.equal(curveToolOf('DIPS', 'diameter').param, 'dips.d');
  assert.equal(curveToolOf('TIPS', 'length').param, 'stentGeom.TIPS.len');
  assert.deepEqual(SWEEPS, ['diameter', 'waist', 'length']);
  const ls = drawnLines(t);
  assert.equal(ls.length, 2);
  assert.ok(!ls[0].dash && ls[1].dash === true, 'the bench is the dashed one');
  assert.equal(ls[0].c, ls[1].c, 'one reading, one colour: the dashes say which state');
  assert.equal(ls[0].name, 'In the patient'); assert.match(ls[1].name, new RegExp(`Tube alone, ${BENCH_DP} mmHg`));
  for (const s of SWEEPS) { const xs = curveXs(curveToolOf('TIPS', s)); assert.ok(xs.length >= 5 && xs.length <= 41, `${s}: ${xs.length} points`); assert.equal(curveSteps(curveToolOf('TIPS', s)).length, xs.length); }
});

test('Curves: a waist length changes nothing for a stent with no narrowing, and the view says so; the other two settings always matter', () => {
  assert.equal(sweepMatters('waist', { s: 0 }), false);
  assert.equal(sweepMatters('waist', { s: 0.4 }), true);
  assert.equal(sweepMatters('diameter', { s: 0 }), true);
  assert.equal(sweepMatters('length', null), true);
});

test('Curves: the series carries the patient\'s line and the tube\'s from the worker\'s fingerprints', () => {
  const t = curveToolOf('TIPS', 'diameter'), xs = curveXs(t);
  const states = xs.map((x) => ({ fp: { tipsFlow: 1 + 0.1 * x, tipsBench: 0.5 + 0.2 * x } }));
  const s = curveSeries(t, states);
  assert.equal(s.xs.length, xs.length); assert.equal(s.ys.length, 2);
  assert.ok(s.ys[1].at(-1) > s.ys[1][0], 'the bench line rises with the diameter');
});

test('Curves: no engine key the view needs is missing: the engine\'s stent state carries .bench and the fingerprint passes it on', () => {
  assert.match(read('src/engine/engine.js'), /o\.bench = benchFlow\(kind, d, this\.viscosity\(\), s, g, BENCH_DP\) \* 0\.06;/);
  assert.match(read('src/engine/fingerprint.js'), /\[`\$\{k\}Bench`\]: t \? t\.bench : null/);
  assert.doesNotMatch(read('src/ui/ir-curves.js').replace(/\/\/.*$/gm, ''), /HVPG/i);
});

test('Curves: the sub-switch opens the third view, and leaving the TIPS view stops the sweep timer', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  ir.el.querySelector('[data-sub="curves"]').click();
  assert.equal(ir.sub(), 'curves'); assert.equal(ir.el.dataset.sub, 'curves');
  ir.update(frameOf()); await wait(60);
  assert.ok(ir.el.querySelector('.ir-curves .pz-curve'), 'the chart is there');
  assert.equal(ir.el.querySelectorAll('.ir-sweep .ps-btn').length, 3);
  ir.head.querySelector('[data-view="measure"]').click();
  assert.equal(host.dataset.view, 'measure');
});

test('Curves, the engine\'s numbers: the tube alone is the same stent at a fixed 7 mmHg; narrowing it costs the tube more than it costs the patient', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const { deepMerge, sanitizeParams } = await import('../src/engine/scenario.js');
  const { fingerprintOf } = await import('../src/engine/fingerprint.js');
  const at = (patch) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(sanitizeParams(deepMerge(e.params, patch))); e.settle(3); return fingerprintOf(computeMetrics(e)); };
  const open = at({ tips: { on: true, d: 10 } }), narrow = at({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.5 }, stentGeom: { TIPS: { waist: 4 } } });
  assert.ok(open.tipsBench > 0 && Number.isFinite(open.tipsBench), `bench ${open.tipsBench}`);
  assert.equal(at({}).tipsBench, null, 'no stent, no bench line');
  assert.ok(narrow.tipsBench < open.tipsBench && narrow.tipsFlow < open.tipsFlow);
  const tubeLoss = 1 - narrow.tipsBench / open.tipsBench, patientLoss = 1 - narrow.tipsFlow / open.tipsFlow;
  assert.ok(tubeLoss > patientLoss, `the tube loses ${(100 * tubeLoss).toFixed(0)} % against the patient's ${(100 * patientLoss).toFixed(0)} %`);
  const wide = at({ tips: { on: true, d: 12 } });
  assert.ok(wide.tipsBench > open.tipsBench, 'a wider tube carries more');
});
