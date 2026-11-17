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

const { createIrTips, stentIds, stentLine, STENT_RANGE, peakBand, NO_STENT_WHY } = await import('../src/ui/ir-tips.js');
const { store } = await import('../src/ui/store.js');
const { curveToolOf, sweepMatters, SWEEPS, createIrCurves } = await import('../src/ui/ir-curves.js');
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
  assert.equal(words[0], 'Below 12 mmHg');
  assert.equal(tiles[0].dataset.sev, 'none', 'a reference line, not a verdict');
  ir.update(frameOf({ ppg: 14.2 }));
  await wait(60);
  assert.equal(tiles[0].querySelector('.status').textContent, 'Above 12 mmHg');
  assert.equal(tiles[0].dataset.sev, 'none');
  assert.ok(ir.el.querySelector('.ir-chip'), 'one chip names the stent');
  assert.ok(ir.el.querySelectorAll('.ir-figs .gl .gl-stage').length >= 2, 'the stent cards: the side view and the pressure bar, made once the view opens');
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
  assert.match(plate, /\.ir-figs \.sc \{ display: flex; flex-direction: column;/);
  assert.match(cards, /\.dock-body\.pair \.pressure-switch:not\(\.ir-switch\):not\(\.ir-sub\):not\(\.ir-sweep\):not\(\.ir-color\) \{ display: none; \}/);
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
  assert.equal(c.el.querySelectorAll('tbody tr').length, 8, 'eight readings, always laid out');
  assert.equal(c.el.querySelector('.ir-note').textContent, NOTHING_PINNED);
  assert.deepEqual([...c.el.querySelectorAll('td.a')].map((x) => x.textContent), ['—', '—', '—', '—', '—', '—', '—', '—']);
  assert.equal(c.el.querySelector('td.b').textContent, '9.2');
  const names = [...c.el.querySelectorAll('tbody tr')].map((r) => r.querySelector('.cmp-n').textContent);
  assert.deepEqual(names, ['PPG', 'Stent flow', 'Across stent', 'Open diameter', 'Narrowest lumen', 'Waist length', 'Taper, each end', 'Stent peak velocity']);
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
  assert.equal(ir.el.querySelectorAll('.ir-compare tbody tr').length, 8);
  ir.el.querySelector('[data-sub="inside"]').click();
  assert.equal(ir.el.dataset.sub, 'inside');
  assert.equal(host.dataset.view, 'tips');
  assert.doesNotMatch(read('src/ui/ir-compare.js').replace(/\/\/.*$/gm, ''), /HVPG/i);
});

test('the stent peak tile reads the range for the stent\'s own diameter: 8 to 10 mm as before, scaled and marked provisional for another', async () => {
  assert.equal(peakBand({ d: 8 }), STENT_RANGE); assert.equal(peakBand({ d: 10 }), STENT_RANGE); assert.equal(peakBand(null), STENT_RANGE);
  assert.deepEqual([...peakBand({ d: 6 })], [90, 338]); assert.deepEqual([...peakBand({ d: 12 })], [63, 132]);
  const { ir } = mount(paramsOf({ tips: { on: true, d: 6 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  const peak = () => [...ir.el.querySelectorAll('.metric')].find((t) => t.dataset.id === 'ir-peak');
  const at = (d, vPeak) => ir.update(frameOf({ tips: { ...frameOf().metrics.tips, d, s: 0, dWaist: d, vPeak, peaks: [vPeak, vPeak, vPeak] } }));
  // a 6 mm stent whose gates read about 216 cm/s: high against 90 to 190, in range against its own 90 to 338
  at(6, 216); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Within model band');
  assert.equal(peak().dataset.sev, 'none');
  assert.match(peak().title, /model band for a 6 mm stent is 90 to 338 cm\/s\. Provisional[^]*not a surveillance threshold/);
  const lefts = [...peak().querySelectorAll('.rb-tick')].map((t) => parseFloat(t.style.left));
  assert.ok(Math.abs(lefts[0] - 90 / 4) < 0.01 && Math.abs(lefts[1] - 338 / 4) < 0.01, `the ticks sit at 90 and 338 of 400: ${lefts}`);
  // a faster 6 mm reading is above its model band, still in the neutral tone: no alarm for a number the app scaled itself
  at(6, 400); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Above model band');
  assert.equal(peak().dataset.sev, 'none');
  // the same reading in a 10 mm stent is out of range, as reported, and the ticks go back to 90 and 190
  at(10, 216); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Out of range');
  assert.equal(peak().dataset.sev, 'caution');
  assert.doesNotMatch(peak().title, /model band for a/);
  const back = [...peak().querySelectorAll('.rb-tick')].map((t) => parseFloat(t.style.left));
  assert.ok(Math.abs(back[1] - 190 / 4) < 0.01, `${back}`);
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
  assert.match(read('src/engine/engine.js'), /o\.bench = benchFlow\(kind, d, this\.viscosity\(\), s, g, BENCH_DP, su\) \* 0\.06;/);
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

test('Stasis: a stent that has almost stopped reads 0 cm/s everywhere, from one rule (flow-cuts.js stentStill): tile, gates, Compare and the card\'s own word', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const { deepMerge, sanitizeParams } = await import('../src/engine/scenario.js');
  const { fingerprintOf } = await import('../src/engine/fingerprint.js');
  const { stentStill, FLOW_CUTS } = await import('../src/engine/flow-cuts.js');
  const at = (s) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d: 8 }, stenosis: { TIPS: s } }))); e.settle(3); return { e, m: computeMetrics(e) }; };
  assert.equal(stentStill(FLOW_CUTS.stillQ * 0.99), true); assert.equal(stentStill(-FLOW_CUTS.stillQ * 0.5), true); assert.equal(stentStill(FLOW_CUTS.stillQ * 1.01), false);
  const dead = at(0.99), live = at(0.5);
  const t = dead.m.tips, f = fingerprintOf(dead.m);
  assert.equal(t.still, true);
  assert.deepEqual([...t.peaks], [0, 0, 0], 'every gate reads 0, not a jet from a flow of nothing');
  assert.equal(t.vPeak, 0); assert.equal(f.tipsVel, 0); assert.equal(f.tipsG0 + f.tipsG1 + f.tipsG2, 0);
  assert.equal(live.m.tips.still, false); assert.ok(live.m.tips.vPeak > 90, 'a stent with flow reads its jet');
  // The Compare row and the tile read the same number
  store.set({ params: paramsOf({ tips: { on: true, d: 8 } }), compareSnap: { metrics: live.m, when: '10:30', names: null } });
  const c = createIrCompare(); c.update({ metrics: dead.m }, 'TIPS');
  const peakRow = [...c.el.querySelectorAll('tbody tr')].at(-1);
  assert.equal(peakRow.children[2].textContent, '0'); assert.notEqual(peakRow.children[1].textContent, '0');
  store.set({ compareSnap: null });
  // the card's status word and the doppler read the same rule, not their own
  assert.match(read('src/ui/actions.js'), /if \(st \? st\.still : stentStill\(q\)\) return ST_STASIS;/);   // (a TIPS or DIPS: the engine's state)
  assert.match(read('src/ui/doppler.js'), /if \(!unit && stentStopped\(\)\)/); assert.match(read('src/ui/doppler.js'), /const none = ms !== undefined \? stentStopped\(\) : jsS\.none;/);
  assert.match(read('src/engine/engine.js'), /o\.still = stentStillHeld\(q, o\.still === true\);/);
});

test('The TIPS view fits the card without scrolling: it fills the pane, the tiles are one row from 400 px, the figures take the height left and are never wider than it allows', async () => {
  const plate = read('styles/app-06-plate.css'), src = read('src/ui/ir-tips.js');
  assert.match(plate, /\[data-pane="hvpg"\]\[data-view="tips"\] \{ flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;/);
  assert.match(plate, /\[data-pane="hvpg"\]\[data-view="tips"\] > \.ir-tips \{ flex: 1 1 0; min-height: 0; \}/);
  assert.match(plate, /@container \(min-width: 400px\) \{ \.ir-tips \.ir-tiles\.rp-tiles \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \} \}/);
  assert.match(plate, /\.ir-figs \{ flex: 1 1 0; min-height: 96px; container-type: size; overflow: clip; \}/);
  assert.match(plate, /\.ir-figs \.sc > \.sc-stage \{ flex: none; width: min\(100cqw, 520px, calc\(\(100cqh - 6px\) \* var\(--fig-r, 1\.35\)\)\); \}/);
  assert.match(plate, /\.ir-figs \{ flex: 1 1 0; min-height: 96px; container-type: size; overflow: clip; \}/, 'nothing the figures draw reaches the switch above them');
  // The deck's own rule for the same stage (app-11-deck-visuals.css) has two classes' weight; the Tests card's must outweigh it, or the stages take the card's width again
  const spec = (sel) => [...sel.matchAll(/\.[\w-]+|\[[^\]]+\]/g)].length;
  assert.ok(spec('.ir-figs .sc > .sc-stage') > spec('.sc > .sc-stage'));
  assert.doesNotMatch(read('src/ui/ir-tips.js').replace(/\/\/.*$/gm, ''), /ir-note/, 'no explanatory sentence in the figures\' band: the tiles\' titles say it');
  assert.match(src, /figs\.style\.setProperty\('--fig-r', \(VW \/ \(SIDE\.h \+ \(along \? traceH\(3\) : BAR\.h\)\)\)\.toFixed\(4\)\)/, 'the ratio comes from the pictures\' own sizes, never a copy');
  const { VW, SIDE, BAR } = await import('../src/ui/tool-stent.js');
  assert.ok(Math.abs(VW / (SIDE.h + BAR.h) - 1.35) < 0.25, 'the fallback ratio is near the real one');
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  assert.ok(ir.el.querySelector(':scope > .ir-editor'), 'a slot for the stent editor sits above the sub-switch');
  assert.ok(ir.el.querySelector('.ir-editor').nextElementSibling.classList.contains('ir-sub'));
  assert.match(plate, /\.ir-sub \{ align-self: flex-start; position: relative; z-index: 1;/);
});

test('Along: the sub-switch has four views, and Along shows the side view with the traces in place of the loss bar', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  assert.deepEqual([...ir.el.querySelectorAll('.ir-sub .ps-btn')].map((b) => b.dataset.sub), ['inside', 'along', 'curves', 'compare']);
  ir.update(frameOf()); await wait(60);
  const rb = ir.el.querySelector('.ir-figs').style.getPropertyValue('--fig-r');
  ir.el.querySelector('[data-sub="along"]').click();
  assert.equal(ir.sub(), 'along'); assert.equal(ir.el.dataset.sub, 'along');
  assert.notEqual(ir.el.querySelector('.ir-figs').style.getPropertyValue('--fig-r'), rb, 'the figures\' height budget follows the pictures shown');
  ir.update(frameOf()); await wait(60);
  assert.equal(host.dataset.view, 'tips');
  assert.match(read('styles/app-06-plate.css'), /\[data-sub="along"\] > \.ir-inside > :is\(\.ir-tiles, \.ir-note\) \{ display: none; \}/);
});

test('The stent is edited in the TIPS view itself (17 Nov 2026, "no need to open the card"): one row of value chips, a chip opens its slider in the same row, and a change reaches the params', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  const ed = ir.el.querySelector(':scope > .ir-editor > .stent-editor');
  assert.ok(ed, 'the editor is mounted in the view, above the sub-switch');
  assert.equal(ir.el.querySelector('.ir-edit'), null, 'no Edit stent button: nothing opens the vessel card');
  const chip = (id) => ed.querySelector(`.se-chip[data-chip="${id}"]`);
  assert.deepEqual([...ed.querySelectorAll('.se-chip')].map((c) => c.dataset.chip), ['dia', 'end', 'waist', 'len'], 'four chips: the stent, its end stenosis, its waist and the waist\'s length');
  assert.equal(chip('dia').textContent, 'Diameter10.0 mm');
  assert.equal(chip('end').querySelector('.se-chip-v').textContent, 'None');
  const plate = read('styles/app-06-plate.css');
  assert.match(plate, /\.stent-editor \.se-layer \{ grid-area: 1 \/ 1;[^}]*height: 30px;/, 'the chips and each strip share one cell, one slim height: nothing below moves');
  assert.match(plate, /\.stent-editor \{[^}]*animation: crossfade/, 'it fades in, never pops');
  assert.ok(chip('len').classList.contains('se-dim'), 'no waist: its length dims');
  // A tap opens the waist's slider in the row; the chips go inert, the strip takes the hand.
  chip('waist').click();
  await wait(20);
  assert.equal(ed.getAttribute('data-open'), 'waist');
  const strip = (id) => ed.querySelector(`.se-strip[data-strip="${id}"]`);
  assert.equal(strip('waist').inert, false); assert.equal(ed.querySelector('.se-chips').inert, true); assert.equal(strip('end').inert, true);
  const slide = (id, v) => { const i = ed.querySelector(`[data-ctl="${id}"] input`); i.value = String(v); i.dispatchEvent(new window.Event('input')); i.dispatchEvent(new window.Event('change')); };
  slide('waistD', 0.4);
  await wait(30);
  let p = store.get().params;
  assert.equal(p.stentGeom.TIPS.red, 0.4, 'a waist, mid stent');
  assert.ok(!(p.stenosis?.TIPS > 0), 'no stenosis made');
  assert.equal(chip('waist').querySelector('.se-chip-v').textContent, '6.0 mm');
  assert.ok(!chip('len').classList.contains('se-dim'), 'the waist\'s length wakes');
  strip('waist').querySelector('.se-done').click();
  await wait(20);
  assert.equal(ed.getAttribute('data-open'), '', 'Done gives the chips back');
  // The stenosis and its end: the waist stays.
  chip('end').click();
  slide('narrow', 0.5);
  await wait(30);
  strip('end').querySelector('[data-ctl="site"] button').click();
  await wait(30);
  p = store.get().params;
  assert.equal(p.stenosis.TIPS, 0.5);
  assert.equal(p.stenosisSite.TIPS, 'proximal');
  assert.equal(p.stentGeom.TIPS.red, 0.4, 'the waist stays mid stent');
  assert.equal(chip('end').querySelector('.se-chip-v').textContent, '5.0 mm · Proximal');
  ed.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert.equal(ed.getAttribute('data-open'), '', 'Escape gives the chips back');
});

test('The card\'s Velocity | Pressure switch sits in the view\'s header row, in the switches\' look, not between the pictures', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  ir.update(frameOf()); await wait(60);
  const sw = ir.el.querySelector('.ir-stents > .sc-color');
  assert.ok(sw, 'moved into the header row');
  assert.ok(sw.classList.contains('pressure-switch') && sw.classList.contains('ir-color'));
  assert.equal(ir.el.querySelector('.ir-figs .sc > .sc-color'), null, 'no loose row between the figures: the band\'s height is the pictures\' alone');
  assert.match(read('styles/app-06-plate.css'), /\.ir-tips:is\(\[data-sub="compare"\], \[data-sub="curves"\]\) \.ir-color \{ opacity: 0; pointer-events: none; \}/);
});

// ---- The curves' life (external review, 17 Nov 2026): idle, waiting, loading, drawn; leaving cancels and forgets; the ring follows the live stent ----
const lifeKit = (over = {}) => {
  const log = { requests: 0, configured: [], pins: [], pending: [] };
  const request = (type) => { log.requests++; return new Promise((res) => { const go = () => res(type === 'snapshot' ? { snap: { s: 1 } } : { result: { tipsFlow: 1, tipsBench: 2 } }); if (over.hold) log.pending.push(go); else go(); }); };
  const chart = () => ({ el: document.createElement('div'), configure: (t, ctx) => log.configured.push({ t, ctx }), pin: (fp) => log.pins.push({ ...fp }) });
  const calc = () => ({ sequence: async () => ({}) });
  return { log, c: createIrCurves({ request, calc, chart, delay: 5, ...over.opts }) };
};
const frameWith = (flow, day) => ({ clock: day == null ? undefined : 'disease', day, metrics: { ppg: 9, tips: { s: 0.4, flow, bench: 3 }, dips: null } });

test('Curves life: a change that settles asks once; further frames of the same stent ask nothing and only move the ring', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit();
  c.update(frameWith(1.5)); assert.equal(c.phase(), 'waiting'); c.update(frameWith(1.51)); assert.equal(log.requests, 0, 'nothing is asked inside the quiet time');
  await wait(60);
  assert.equal(c.phase(), 'drawn'); assert.equal(log.configured.length, 1); assert.equal(log.requests, 2);
  c.update(frameWith(1.2)); c.update(frameWith(1.2)); c.update(frameWith(0.9));
  assert.equal(log.configured.length, 1, 'the lines are not worked out again'); assert.equal(log.pins.length, 2, 'the ring moved with the stent, once per different reading');
  assert.equal(log.pins.at(-1).tipsFlow, 0.9);
});

test('Curves life: leaving before the quiet time ends cancels the sweep, and coming back asks again', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit();
  c.update(frameWith(1.5)); c.stop(); assert.equal(c.phase(), 'idle');
  await wait(40); assert.equal(log.requests, 0, 'cancelled before it started');
  c.update(frameWith(1.5)); await wait(40);
  assert.equal(c.phase(), 'drawn'); assert.equal(log.configured.length, 1, 're-entering with the same stent still recomputes: it was never drawn');
});

test('Curves life: leaving while the snapshot is being asked for draws nothing from the answer that comes late', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit({ hold: true });
  c.update(frameWith(1.5)); await wait(30);
  assert.equal(c.phase(), 'loading'); c.stop(); assert.equal(c.phase(), 'idle');
  for (const go of log.pending.splice(0)) go();
  await wait(20);
  assert.equal(log.configured.length, 0, 'the late answer is dropped');
  c.update(frameWith(1.5)); await wait(30); for (const go of log.pending.splice(0)) go(); await wait(20);
  assert.equal(log.configured.length, 1, 'and the next visit draws');
});

test('Curves life: a sweep that is drawn is kept on leaving and returning unchanged; a changed patient, setting, stent or day draws a new one', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit();
  c.update(frameWith(1.5)); await wait(40); assert.equal(log.configured.length, 1);
  c.stop(); c.update(frameWith(1.5)); await wait(40); assert.equal(log.configured.length, 1, 'unchanged: kept');
  store.set({ params: paramsOf({ tips: { on: true, d: 8 } }) }); c.update(frameWith(1.5)); await wait(40); assert.equal(log.configured.length, 2, 'the patient changed');
  c.setSweep('length'); await wait(40); assert.equal(log.configured.length, 3, 'the setting changed');
  c.update(frameWith(1.5, 3)); await wait(40); assert.equal(log.configured.length, 4, 'the day changed');
  c.update(frameWith(1.5, 3.4)); await wait(40); assert.equal(log.configured.length, 4, 'the same day');
  c.update(frameWith(1.5, 3), 'DIPS'); c.update({ metrics: { ppg: 9, tips: null, dips: { s: 0.4, flow: 1, bench: 2 } } }, 'DIPS'); await wait(40);
  assert.equal(log.configured.length, 5, 'the other stent'); assert.equal(log.configured.at(-1).t.lines[0], 'dipsFlow');
});

test('Curves life: an edit while the answer is loading is the sweep that is drawn, not the one before it', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit({ hold: true });
  c.update(frameWith(1.5)); await wait(30); assert.equal(c.phase(), 'loading');
  store.set({ params: paramsOf({ tips: { on: true, d: 9 } }) }); c.update(frameWith(1.4)); assert.equal(c.phase(), 'waiting');
  for (const go of log.pending.splice(0)) go(); await wait(30); for (const go of log.pending.splice(0)) go(); await wait(20);
  assert.equal(log.configured.length, 1); assert.equal(log.configured[0].ctx.params.tips.d, 9);
});

test('Curves life: a hidden card cancels the work, is fed nothing, and picks up again when shown', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  const { log, c } = lifeKit();
  c.update(frameWith(1.5)); c.setActive(false); await wait(40);
  assert.equal(log.requests, 0); c.update(frameWith(1.4)); await wait(40); assert.equal(log.requests, 0, 'hidden: nothing is prepared');
  c.setActive(true); await wait(40); assert.equal(log.configured.length, 1, 'shown again with the last frame it was given');
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  assert.equal(typeof ir.setActive, 'function');
  assert.match(read('src/ui/hvpg-proc.js'), /shown: \(on\) => tips\.setActive\(on\)/);
});

test('After a TIPS the PPG is a reference line, never a target: no "Target met" anywhere, and tipsGoal says Below/Above 12 mmHg', async () => {
  const { tipsGoal } = await import('../src/ui/table-marks.js');
  assert.deepEqual(tipsGoal(9), ['ok', 'Below 12 mmHg reference']); assert.deepEqual(tipsGoal(14), ['hi', 'Above 12 mmHg reference']);
  assert.equal(tipsGoal(9, true)[1], 'Below 12 mmHg');
  const { execSync } = await import('node:child_process');
  const hits = execSync("grep -rIl \"Target met\" src styles scripts docs guides 2>/dev/null || true", { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }).trim();
  assert.equal(hits, '', `"Target met" still appears in: ${hits}`);
  assert.doesNotMatch(read('src/ui/table-marks.js').replace(/\/\/.*$/gm, ''), /PPG[^\n]*\btarget\b/i);
});

test('the stent peak tile reads a deliberate reduction\'s jet as intended, and an end stenosis\' jet as out of range', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  const peak = () => [...ir.el.querySelectorAll('.metric')].find((t) => t.dataset.id === 'ir-peak');
  const at = (over) => ir.update(frameOf({ tips: { ...frameOf().metrics.tips, d: 10, ...over } }));
  at({ vPeak: 400, peaks: [100, 400, 100], red: 0.4, end: 0, site: 'distal' }); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Reduction jet');
  assert.equal(peak().dataset.sev, 'none');
  at({ vPeak: 400, peaks: [100, 150, 400], red: 0.4, end: 0.5, site: 'distal' }); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Out of range');
  assert.equal(peak().dataset.sev, 'caution');
  at({ vPeak: 400, peaks: [100, 400, 100], red: 0, end: 0, site: 'distal' }); await wait(60);
  assert.equal(peak().querySelector('.status').textContent, 'Out of range', 'a fast stent with no reduction is as before');
});
