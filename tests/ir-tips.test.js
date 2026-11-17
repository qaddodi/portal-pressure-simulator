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
  MOUNTED.push(ir);
  return { host, ir };
};
const MOUNTED = [];
/** Every view the tests above mounted, out of sight: their editors lead no vessel card's (each test of the hub starts from none shown). */
const quiet = () => { for (const ir of MOUNTED) ir.setActive(false); };

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

test('the TIPS view fills its one line of numbers from the stent (no tiles); a stent taken away sends the view back to Measure', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 }, stentGeom: { TIPS: { red: 0.4 } } }));
  ir.update(frameOf());
  await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  assert.equal(ir.view(), 'tips');
  assert.equal(host.dataset.view, 'tips');
  ir.update(frameOf());
  await wait(60);
  const kv = [...ir.el.querySelectorAll('.ir-keys > .ir-kv')];
  assert.deepEqual(kv.map((t) => t.dataset.k), ['ppg', 'dp', 'flow']);
  assert.deepEqual(kv.map((t) => t.querySelector('em').textContent), ['PPG', 'Across stent', 'Flow'], 'the PPG and the stent\'s own drop, apart');
  assert.deepEqual(kv.map((t) => t.querySelector('b').textContent), ['9.2', '7.1', '1.6']);
  assert.deepEqual(kv.map((t) => t.querySelector('u').textContent), ['mmHg', 'mmHg', 'L/min']);
  assert.equal(ir.el.querySelectorAll('.metric, .rp-tiles, .rb').length, 0, 'no tiles, no bars');
  ir.update(frameOf({ ppg: 14.2 }));
  await wait(60);
  assert.equal(kv[0].querySelector('b').textContent, '14.2');
  assert.equal(ir.el.querySelector('.ir-status').textContent, 'Patent');
  assert.equal(ir.el.querySelectorAll('.ir-chip').length, 1, 'one chip names the stent');
  assert.equal(ir.el.querySelector('.ir-chips').dataset.n, '1', 'one stent: its name reads as the title');
  assert.ok(ir.figure(), 'the figure is made once the view opens');
  assert.equal(ir.el.querySelectorAll('.tf').length, 1, 'one stent drawing (never two)');
  assert.equal(ir.el.querySelector('.ir-zone').firstElementChild, ir.figure().el, 'the stent, then the rows, in one room');
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
  assert.match(plate, /\.tf-stage \{ width: 100%;/, 'the figure is as wide as the card; its height follows from its width');
  assert.match(cards, /\.dock-body\.pair \.pressure-switch:not\(\.ir-switch\):not\(\.ir-lens\):not\(\.ir-sweep\) \{ display: none; \}/);
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
  assert.equal(c.el.querySelectorAll('tbody tr').length, 10, 'ten readings, always laid out');
  assert.equal(c.el.querySelector('.ir-note').textContent, NOTHING_PINNED);
  assert.deepEqual([...c.el.querySelectorAll('td.a')].map((x) => x.textContent), ['—', '—', '—', '—', '—', '—', '—', '—', '—', '—']);
  assert.equal(c.el.querySelector('td.b').textContent, '9.2');
  const names = [...c.el.querySelectorAll('tbody tr')].map((r) => r.querySelector('.cmp-n').textContent);
  assert.deepEqual(names, ['PPG', 'Stent flow', 'Across stent', 'Open diameter', 'End narrowing', 'Waist narrowing', 'Narrowest lumen', 'Waist length', 'Taper, each end', 'Stent peak velocity']);
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
  assert.equal(ir.el.querySelectorAll('.ir-compare tbody tr').length, 10);
  ir.el.querySelector('[data-sub="inside"]').click();
  assert.equal(ir.el.dataset.sub, 'inside');
  assert.equal(host.dataset.view, 'tips');
  assert.doesNotMatch(read('src/ui/ir-compare.js').replace(/\/\/.*$/gm, ''), /HVPG/i);
});

test('the stent peak range for the stent\'s own diameter: 8 to 10 mm as before, scaled for another; the chart\'s usual band is the Doppler\'s own', async () => {
  assert.equal(peakBand({ d: 8 }), STENT_RANGE); assert.equal(peakBand({ d: 10 }), STENT_RANGE); assert.equal(peakBand(null), STENT_RANGE);
  assert.deepEqual([...peakBand({ d: 6 })], [90, 338]); assert.deepEqual([...peakBand({ d: 12 })], [63, 132]);
  const fig = read('src/ui/tips-figure.js');
  assert.match(fig, /norm = stentNormal\(id, T\.d\)/, 'the chart\'s band scales with the lumen, from the Doppler card\'s one rule (velNormal.js)');
  assert.match(fig, /usual \$\{Math\.round\(lo\)\}–\$\{Math\.round\(hi\)\}/, 'and names itself: the usual range, not a verdict');
});

test('Curves: the tool a stent and a setting give is the deck\'s own curve, two lines, the bench dashed, in the flow\'s colour', () => {
  const t = curveToolOf('TIPS', 'waist');
  assert.equal(t.kind, 'curve'); assert.equal(t.param, 'stentGeom.TIPS.waist');
  assert.deepEqual(t.lines, ['tipsFlow', 'tipsBench']);
  assert.equal(curveToolOf('DIPS', 'diameter').param, 'dips.d');
  assert.equal(curveToolOf('TIPS', 'length').param, 'stentGeom.TIPS.len');
  assert.deepEqual(SWEEPS, ['diameter', 'end', 'waist', 'length']);
  assert.equal(curveToolOf('TIPS', 'end').param, 'stenosis.TIPS'); assert.equal(curveToolOf('DIPS', 'end').param, 'stenosis.DIPS');
  const ls = drawnLines(t);
  assert.equal(ls.length, 2);
  assert.ok(!ls[0].dash && ls[1].dash === true, 'the bench is the dashed one');
  assert.equal(ls[0].c, ls[1].c, 'one reading, one colour: the dashes say which state');
  assert.equal(ls[0].name, 'In the patient'); assert.match(ls[1].name, new RegExp(`Tube alone, ${BENCH_DP} mmHg`));
  for (const s of SWEEPS) { const xs = curveXs(curveToolOf('TIPS', s)); assert.ok(xs.length >= 5 && xs.length <= 41, `${s}: ${xs.length} points`); assert.equal(curveSteps(curveToolOf('TIPS', s)).length, xs.length); }
});

test('Curves: a waist length changes nothing for a stent with no narrowing, and the view says so; the other two settings always matter', () => {
  assert.equal(sweepMatters('waist', { s: 0, red: 0 }), false);
  assert.equal(sweepMatters('waist', { s: 0.4, end: 0.4, red: 0 }), false, 'an end narrowing has no waist length');
  assert.equal(sweepMatters('waist', { s: 0.4, red: 0.4 }), true);
  assert.equal(sweepMatters('end', { s: 0, red: 0 }), true);
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
  assert.equal(ir.el.querySelectorAll('.ir-sweep .ps-btn').length, 4);
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

test('The TIPS view fits the card without scrolling: the numbers are one line, the stent and its chart one picture of a fixed height per width, the rows under it', async () => {
  const plate = read('styles/app-06-plate.css'), src = read('src/ui/ir-tips.js'), fig = read('src/ui/tips-figure.js');
  assert.match(plate, /\[data-pane="hvpg"\]\[data-view="tips"\] \{ flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;/);
  assert.match(plate, /\[data-pane="hvpg"\]\[data-view="tips"\] > \.ir-tips \{ flex: 1 1 0; min-height: 0; \}/);
  assert.match(plate, /\.ir-keys \{ display: flex; flex-wrap: wrap; align-items: baseline;/, 'the numbers are one line of text, wrapping between readings (Mohammad, 17 Nov: no big tiles)');
  assert.match(plate, /\.ir-inside \{ flex: none;/, 'the picture is never squeezed: its height is its own');
  assert.match(plate, /\.ir-tips \{[^}]*overflow: hidden auto;[^}]*touch-action: pan-y;/, 'the last resort is a scroll down, never sideways (overflow-y alone makes x scroll too: F-sideways, 17 Nov)');
  assert.match(plate, /\.ir-zone > \.se-panel \{ top: var\(--se-top, 0px\); min-height: calc\(100% - var\(--se-top, 0px\)\); \}/, 'the editor\'s panel grows over the chart and the rows, never over the stent');
  assert.match(src, /zone\.style\.setProperty\('--se-top', t\)/);
  // The x scale is fixed per width (8 cm of stent fill the same span whatever its length), so the picture's height never changes in a frame.
  assert.match(fig, /function fit\(\) \{\n\s*const w = Math\.round\(readMetric\(stage, 'offsetWidth'\) \|\| 0\);\n\s*if \(!\(w > 0\) \|\| w === W\) return;/);
  assert.match(fig, /stage\.style\.height = `\$\{L\.h\.toFixed\(1\)\}px`;/);
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  assert.deepEqual([...ir.el.children].map((c) => c.className.split(' ')[0]), ['ir-top', 'ir-inside', 'ir-curves', 'ir-compare']);
  assert.deepEqual([...ir.el.querySelector('.ir-inside').children].map((c) => c.classList[0]), ['ir-keys', 'se-zone']);
  assert.equal(ir.el.querySelector('.ir-zone > .se-panel') !== null, true, 'the panel is the room\'s, so it may cover the chart');
});

test('The menu holds the three views: Inside the stent, Tube vs patient and Compare; a pick changes the view, ticks it and closes the menu', async () => {
  const { host, ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  const more = ir.el.querySelector('.ir-top > .ir-more'), menu = ir.el.querySelector('.ir-menu');
  assert.deepEqual([...menu.querySelectorAll('.ir-mi')].map((b) => b.dataset.sub), ['inside', 'curves', 'compare']);
  assert.equal(menu.dataset.open, 'false'); assert.equal(menu.inert, true); assert.equal(more.getAttribute('aria-haspopup'), 'menu');
  more.click();
  assert.equal(menu.dataset.open, 'true'); assert.equal(more.getAttribute('aria-expanded'), 'true'); assert.equal(menu.inert, false);
  menu.querySelector('[data-sub="compare"]').click();
  assert.equal(ir.sub(), 'compare'); assert.equal(ir.el.dataset.sub, 'compare');
  assert.equal(menu.dataset.open, 'false', 'a pick closes the menu');
  assert.deepEqual([...menu.querySelectorAll('.ir-mi')].map((b) => b.getAttribute('aria-checked')), ['false', 'false', 'true']);
  ir.update(frameOf()); await wait(60);
  assert.equal(host.dataset.view, 'tips');
  more.click();
  menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.dataset.open, 'false', 'Escape closes it');
  const plate = read('styles/app-06-plate.css');
  assert.match(plate, /\.ir-menu \{[^}]*opacity: 0; transform: translateY\(-4px\) scale\(\.98\);[^}]*transition: opacity var\(--d-small\) var\(--ease\), transform var\(--d-small\) var\(--ease\);/, 'the menu fades and rises, by opacity and transform alone');
  ir.setSub('inside');
});

test('The stent is edited in the TIPS view itself: three rows, a tap grows the row into its controls over the card\'s room, the lumens in mm, and a change reaches the params', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  const zone = ir.el.querySelector('.ir-zone'), ed = zone.querySelector(':scope > .stent-editor'), panel = zone.querySelector(':scope > .se-panel');
  assert.ok(ed && panel, 'the editor and its panel are in the view\'s one room');
  assert.equal(ir.el.querySelector('.ir-edit'), null, 'no Edit stent button: nothing opens the vessel card');
  const row = (id) => ed.querySelector(`.se-row[data-row="${id}"]`);
  assert.deepEqual([...ed.querySelectorAll('.se-row')].map((c) => c.dataset.row), ['dia', 'end', 'waist'], 'three rows: the stent, its end stenosis and its waist');
  assert.equal(row('dia').querySelector('.se-row-n').textContent, 'Diameter');
  assert.equal(row('dia').querySelector('.se-row-v').textContent, '10.0 mm');
  assert.equal(row('end').querySelector('.se-row-v').textContent, 'None');
  assert.ok(row('end').querySelector('.se-row-v').classList.contains('se-none'));
  assert.equal(panel.dataset.open, '', 'closed: the panel takes nothing');
  // A tap opens the waist's controls: its lumen in mm, its length, its ends; the rows go inert, the panel takes the hand.
  row('waist').click();
  await wait(20);
  assert.equal(panel.dataset.open, 'waist'); assert.equal(ed.dataset.open, 'waist');
  assert.equal(panel.inert, false); assert.equal(ed.querySelector('.se-rows').inert, true);
  assert.equal(row('waist').getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...panel.querySelectorAll('.se-pb [data-ctl]')].map((c) => c.dataset.ctl), ['waistD', 'waist', 'ends']);
  assert.equal(panel.querySelector('.se-ph-n').textContent, 'Waist');
  const lum = panel.querySelector('[data-ctl="waistD"] input');
  assert.equal(lum.max, '10', 'the lumen slider runs to the open stent, in mm');
  const slide = (cid, v) => { const i = panel.querySelector(`[data-ctl="${cid}"] input`); i.value = String(v); i.dispatchEvent(new window.Event('input')); i.dispatchEvent(new window.Event('change')); };
  slide('waistD', 6);
  await wait(40);
  let p = store.get().params;
  assert.ok(Math.abs(p.stentGeom.TIPS.red - 0.4) < 1e-9, `a 6 mm waist in a 10 mm stent: 40% narrowed (${p.stentGeom.TIPS.red})`);
  assert.ok(!(p.stenosis?.TIPS > 0), 'no stenosis made');
  assert.equal(row('waist').querySelector('.se-row-v').textContent, '6.0 mm × 1.0 cm');
  assert.equal(panel.querySelector('.se-ph-v').textContent, '6.0 mm × 1.0 cm', 'the panel\'s top line says it too');
  assert.equal(panel.querySelector('[data-ctl="waistD"] .se-cv').textContent, '6.0 mm');
  panel.querySelector('.se-done').click();
  await wait(20);
  assert.equal(panel.dataset.open, '', 'Done gives the rows back');
  assert.equal(ed.querySelector('.se-rows').inert, false);
  // The stenosis and its end: the waist stays.
  row('end').click();
  assert.deepEqual([...panel.querySelectorAll('.se-pb [data-ctl]')].map((c) => c.dataset.ctl), ['site', 'narrow']);
  slide('narrow', 5);
  await wait(30);
  panel.querySelector('[data-ctl="site"] button').click();
  await wait(30);
  p = store.get().params;
  assert.equal(p.stenosis.TIPS, 0.5);
  assert.equal(p.stenosisSite.TIPS, 'proximal');
  assert.ok(Math.abs(p.stentGeom.TIPS.red - 0.4) < 1e-9, 'the waist stays mid stent');
  assert.equal(row('end').querySelector('.se-row-v').textContent, 'Proximal 5.0 mm');
  panel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert.equal(panel.dataset.open, '', 'Escape gives the rows back');
  // Opening another row from a row: one panel, one row at a time.
  ir.editor.open('dia'); ir.editor.open('waist');
  assert.equal(panel.dataset.open, 'waist'); assert.equal(ed.querySelectorAll('.se-row[aria-expanded="true"]').length, 1);
  ir.editor.close();
  // The rules: 44 px or more to tap, the app's label sizes, nothing cut short, nothing wider than the card (F33, F38).
  const plate = read('styles/app-06-plate.css');
  const rules = plate.split('\n').filter((l) => /\.stent-editor|\.se-panel|\.se-zone/.test(l)).join('\n');
  assert.match(rules, /\.stent-editor \.se-row \{[^}]*min-height: 48px;/);
  for (const sel of ['.se-done', '.se-ph-n', '.se-seg button']) assert.match(rules, new RegExp(`\\.se-panel ${sel.replace('.', '\\.')} \\{[^}]*min-height: (4[4-9]|5\\d)px`), `${sel}: 44 px or more`);
  assert.doesNotMatch(rules, /text-overflow: ellipsis/, 'no value is cut short');
  for (const m of rules.matchAll(/font(?:-size)?: (?:\d+ )?(\d+(?:\.\d+)?)px/g)) assert.fail(`a fixed small size in the editor: ${m[0]}`);
  assert.match(rules, /\.stent-editor \{[^}]*min-width: 0; max-width: 100%;/);
  assert.match(rules, /\.stent-editor \{[^}]*animation: crossfade/, 'it fades in, never pops');
  assert.match(plate, /\.ac-panel \{[^}]*max-width: 100%; overflow-x: clip;/);
  const lay = read('styles/app-03-layouts.css');
  for (const k of ['.action-card:not(.docked) > .ac-body {', '.action-card.docked > .ac-body {']) {
    const rules2 = lay.split('\n').filter((l) => l.startsWith(k)).join('\n');
    assert.match(rules2, /min-width: 0; overflow-x: hidden;/, `${k} never scrolls sideways`);
  }
  assert.match(read('src/ui/stent-editor.js'), /const sc = el\.closest\('\.ac-body'\);\n\s*if \(sc\) sc\.scrollLeft = 0;/);
  assert.match(rules, /@container \(min-width: 460px\) \{ \.se-panel \.se-pb \{ grid-template-columns: repeat\(auto-fit, minmax\(170px, 1fr\)\); \} \}/, 'a wide card lays the controls side by side');
});

test('The one lens switch (Velocity | Pressure) is in the title row; it colours the stent and changes the chart, and fades out where no stent is drawn', async () => {
  const { ir } = mount(paramsOf({ tips: { on: true, d: 10 } }));
  ir.update(frameOf()); await wait(60);
  ir.head.querySelector('[data-view="tips"]').click();
  ir.update(frameOf()); await wait(60);
  const sw = ir.el.querySelector('.ir-top > .ir-lens');
  assert.ok(sw && sw.classList.contains('pressure-switch'), 'in the switches\' look');
  assert.deepEqual([...sw.querySelectorAll('.ps-btn')].map((b) => b.dataset.lens), ['velocity', 'pressure']);
  assert.equal(ir.lens(), 'velocity'); assert.equal(ir.figure().lens(), 'velocity');
  sw.querySelector('[data-lens="pressure"]').click();
  await wait(30);
  assert.equal(ir.lens(), 'pressure'); assert.equal(ir.figure().lens(), 'pressure', 'the stent and its chart follow');
  assert.equal(sw.querySelector('[data-lens="pressure"]').getAttribute('aria-pressed'), 'true');
  ir.setLens('velocity');
  assert.match(read('styles/app-06-plate.css'), /\.ir-tips:not\(\[data-sub="inside"\]\) \.ir-lens \{ opacity: 0; pointer-events: none; \}/);
  const fig = read('src/ui/tips-figure.js');
  assert.match(fig, /'Peak velocity, cm\/s'/); assert.match(fig, /'Pressure, mmHg · dashed: total energy'/);
});

// ---- The curves' life (external review, 17 Nov 2026): idle, waiting, loading, drawn; leaving cancels and forgets; the ring follows the live stent ----
const lifeKit = (over = {}) => {
  const log = { requests: 0, configured: [], pins: [], pending: [] };
  const request = (type) => { log.requests++; return new Promise((res) => { const go = () => res(type === 'snapshot' ? { snap: { s: 1 } } : { result: { tipsFlow: 1, tipsBench: 2 } }); if (over.hold) log.pending.push(go); else go(); }); };
  const chart = () => ({ el: document.createElement('div'), configure: (t, ctx) => log.configured.push({ t, ctx }), pin: (fp) => log.pins.push({ ...fp }) });
  const calc = () => ({ sequence: async () => ({}) });
  return { log, c: createIrCurves({ request, calc, chart, delay: 5, ...over.opts }) };
};
const until = async (ok, ms = 2000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await wait(10); };   // (waits for a state, not a time: the quiet period runs on the rest-pass scheduler, slower on a busy machine)
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
  c.update(frameWith(1.5)); await until(() => c.phase() === 'loading');
  assert.equal(c.phase(), 'loading'); c.stop(); assert.equal(c.phase(), 'idle');
  for (const go of log.pending.splice(0)) go();
  await wait(20);
  assert.equal(log.configured.length, 0, 'the late answer is dropped');
  c.update(frameWith(1.5)); await until(() => log.pending.length > 0); for (const go of log.pending.splice(0)) go(); await until(() => log.configured.length === 1);
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
  c.update(frameWith(1.5)); await until(() => c.phase() === 'loading'); assert.equal(c.phase(), 'loading');
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

test('a deliberate reduction\'s jet is told from an end stenosis\' jet (reductionJetIn)', async () => {
  const { reductionJetIn } = await import('../src/ui/ir-tips.js');
  const st = (over) => ({ ...frameOf().metrics.tips, d: 10, ...over });
  assert.equal(reductionJetIn(st({ vPeak: 400, peaks: [100, 400, 100], red: 0.4, end: 0, site: 'distal' }), 190), true);
  assert.equal(reductionJetIn(st({ vPeak: 400, peaks: [100, 150, 400], red: 0.4, end: 0.5, site: 'distal' }), 190), false);
  assert.equal(reductionJetIn(st({ vPeak: 400, peaks: [100, 400, 100], red: 0, end: 0, site: 'distal' }), 190), false, 'a fast stent with no reduction is as before');
});

test('The readings never break inside a word, and are one line of small text, not tiles (F37, and Mohammad 17 Nov)', async () => {
  const plate = read('styles/app-06-plate.css'), tests = read('styles/app-09-tests.css');
  assert.match(plate, /\.ir-kv \{ white-space: nowrap;/, 'a reading\'s name, number and unit stay together');
  assert.doesNotMatch(plate, /\.ir-tiles/, 'no tiles left in the view');
  assert.match(tests, /\.rp-tiles \.metric \.k \{[^}]*overflow-wrap: normal; word-break: normal; hyphens: none;/);
  for (const [name, css] of [['app-01', read('styles/app-01-chrome.css')], ['app-06', plate], ['app-08', read('styles/app-08-cards.css')], ['app-09', tests]]) {
    const bad = [...css.matchAll(/\.metric[^{}]*\.k[^{}]*\{[^}]*(overflow-wrap: (?:break-word|anywhere)|word-break: (?:break-all|break-word))[^}]*\}/g)].map((m) => m[0].slice(0, 80));
    assert.deepEqual(bad, [], `${name}: a reading's name must not break inside a word`);
  }
});

test('One stent editor on screen at a time (play-test F39): while the TIPS view\'s editor is shown, a vessel card\'s for the same stent folds to one line; and the panel grows by transforms alone', async () => {
  const { createStentEditor } = await import('../src/ui/stent-editor.js');
  quiet();
    store.set({ params: paramsOf({ dips: { on: true, d: 10 }, stenosis: { DIPS: 0.5 }, stenosisSite: { DIPS: 'distal' }, stentGeom: { DIPS: { red: 0.4, waist: 2, trans: 0 } } }) });
  const card = createStentEditor({ id: 'DIPS' }), lead = createStentEditor({ id: 'DIPS', lead: true });
  await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'false', 'the lead not on screen: the card keeps its rows');
  lead.setShown(true); await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'true', 'the lead on screen: the card folds');
  assert.equal(card.el.querySelector('.se-rows').inert, true);
  assert.equal(card.el.querySelector('.se-summary .se-sum-t').textContent, 'Stenosis Distal 5.0 mm · Waist 6.0 mm × 2.0 cm');
  assert.equal(card.el.querySelector('.se-summary').tagName, 'BUTTON');
  assert.equal(card.el.querySelector('.se-summary').inert, false, 'folded: the line is the live control');
  assert.equal(lead.el.getAttribute('data-fold'), 'false', 'the lead never folds');
  lead.setStent('TIPS'); await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'false', 'the lead on another stent: the card keeps its rows');
  lead.setStent('DIPS'); await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'true');
  card.open('waist');
  assert.equal(card.opened(), '', 'a folded card opens nothing');
  lead.setShown(false); await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'false', 'the lead off screen: the rows come back');
  lead.setShown(true); lead.destroy(); await wait(20);
  assert.equal(card.el.getAttribute('data-fold'), 'false', 'a lead taken down never leaves a card folded');
  card.destroy();
  assert.equal(card.panel.isConnected, false, 'its panel goes with it');
  const src = read('src/ui/ir-tips.js');
  assert.match(src, /createStentEditor\(\{ id: which, lead: true, zone \}\)/);
  assert.match(src, /editor\.setShown\(active && v === 'tips'\);/); assert.match(src, /editor\.setShown\(on && view === 'tips' && sub === 'inside'\);/);
  const plate = read('styles/app-06-plate.css');
  assert.match(plate, /\.stent-editor\[data-fold="true"\] \.se-rows \{ display: none; \}/);
  assert.match(plate, /\.stent-editor\[data-fold="true"\] \.se-summary \{ display: flex; animation: crossfade var\(--d-small\) var\(--ease\); \}/, 'the line fades in');
  // The panel grows from the tapped row (17 Nov, Mohammad: "seamless"): nine pieces that keep their corners, moved by transforms only, its controls fading in after.
  const ed2 = read('src/ui/stent-editor.js'), g = ed2.slice(ed2.indexOf('function grow'), ed2.indexOf('function show'));
  assert.match(g, /const pb = readBox\(panel\), rb = readBox\(row\);/);
  assert.match(g, /translate\(\$\{x\.toFixed\(1\)\}px, \$\{y\.toFixed\(1\)\}px\) scale\(/);
  assert.doesNotMatch(g, /width:|left:|height:|clip-path|clipPath/, 'transforms and opacity only, no layout or clip animated');
  assert.match(ed2, /const PIECES = \['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'\];/);
  assert.match(plate, /\.se-panel \.se-s \{ position: absolute; transform-origin: 0 0;/);
  // A sideways drag on the editor or a slider is the control's, never the dock's swipe to the next pane (17 Nov, iPhone: "scrolling sideways opens the next card").
  assert.match(read('src/ui/swipe.js'), /const OWN_DRAG = '[^']*\.range-wrap, \.stent-editor'/);
  // F46: a docked stent card whose editor is folded is as tall as what it holds.
  assert.match(read('styles/app-03-layouts.css'), /\.action-card\.docked:has\(\.stent-editor\[data-fold="true"\]\) \{ min-height: 0; \}/);
  assert.match(plate, /\.se-zone \{ position: relative; min-width: 0;/, 'the room the panel fills is its offset parent');
  // Closing the dock tells every pane it is out of sight (dock.js close).
  assert.match(read('src/ui/dock.js'), /onClose\(\);\n(?:\s*\/\/.*\n)*\s*for \(const p of panes\) p\.shown\?\.\(false\);/);
});

test('The vessel card\'s mode is decided before its first paint (no flash of the rows), and its folded line and IR action open Tests › IR › TIPS', async () => {
  const { createStentEditor } = await import('../src/ui/stent-editor.js');
  quiet();
  store.set({ params: paramsOf({ dips: { on: true, d: 10 } }) });
  const lead = createStentEditor({ id: 'DIPS', lead: true });
  const a = createStentEditor({ id: 'DIPS' });
  assert.equal(a.el.getAttribute('data-fold'), 'false'); assert.equal(a.el.querySelector('.se-rows').inert, false); assert.equal(a.el.querySelector('.se-summary').inert, true);
  lead.setShown(true);
  const b = createStentEditor({ id: 'DIPS' });
  assert.equal(b.el.getAttribute('data-fold'), 'true', 'born folded: data-fold is set at creation, not a frame later');
  assert.equal(b.el.querySelector('.se-rows').inert, true); assert.equal(b.el.querySelector('.se-summary').inert, false);
  const c = createStentEditor({ id: 'TIPS' });
  await wait(20);
  assert.equal(b.el.getAttribute('data-fold'), 'true', 'and it stays so once the frame has run');
  lead.setShown(false); await wait(20);
  assert.equal(b.el.getAttribute('data-fold'), 'false');
  const seen = [];
  const d = createStentEditor({ id: 'DIPS', onOpen: (id) => seen.push(id) });
  d.el.querySelector('.se-summary').click();
  assert.deepEqual(seen, ['DIPS']);
  for (const e of [a, b, c, d, lead]) e.destroy();
  const act = read('src/ui/actions.js');
  assert.match(act, /id === 'TIPS' \|\| id === 'DIPS'\) verbs\.splice\(verbs\.indexOf\(dye\) \+ 1, 0, \{ type: 'button', id: 'ir'.*quiet: true, run: \(\) => CTX\.openIr\(id\)/);
  assert.match(act, /const TIPS_PANEL = \(id\) => \(\{ type: 'panel', id: 'stent', label: 'Edit stent', make: \(\) => createTipsVessel\(\{ id, onOpen: \(\) => CTX\.openIr\(id\) \}\) \}\);/);
  assert.match(read('src/ui/main.js'), /openIr: \(id\) => \{ dock\.pane\('hvpg'\)\?\.openStent\?\.\(id\); dock\.show\('hvpg', \{ reveal: true \}\); \}/);
  assert.match(read('src/ui/hvpg-proc.js'), /openStent: \(id\) => tips\.openStent\(id\)/);
  const ir = createIrTips({ host: document.createElement('div') });
  assert.equal(typeof ir.openStent, 'function');
  assert.equal(ir.openStent('TIPS'), false, 'no TIPS in this patient: nothing opens');
  assert.equal(ir.view(), 'measure');
});

test('The TIPS and DIPS vessel card (the approved mock): the stent to scale, one line of numbers and the three rows; no PV to IVC bar and no tiles', async () => {
  const { createTipsVessel, VESSEL_KEYS } = await import('../src/ui/tips-vessel.js');
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }), frame: frameOf() });
  const v = createTipsVessel({ id: 'TIPS' });
  assert.deepEqual([...v.el.children].map((c) => c.classList[0]), ['tf', 'ir-keys', 'se-zone'], 'the stent, the numbers, the rows');
  assert.equal(v.el.querySelectorAll('.tf').length, 1);
  assert.deepEqual(VESSEL_KEYS.map((k) => k.u), ['mmHg', 'L/min', 'cm/s'], 'mmHg and cm/s apart: the PPG, the flow, the fastest gate');
  v.update(frameOf());
  assert.deepEqual([...v.el.querySelectorAll('.ir-kv b')].map((b) => b.textContent), ['9.2', '1.6', '129']);
  assert.equal(v.el.querySelector('.ir-kv[data-k="peak"]').getAttribute('aria-label'), 'Peak velocity: 129 cm/s');
  assert.deepEqual([...v.el.querySelectorAll('.se-row')].map((r) => r.dataset.row), ['dia', 'end', 'waist']);
  assert.ok(v.el.querySelector('.tv-zone > .se-panel'), 'the rows\' panel grows in the card\'s own room');
  v.destroy();
  assert.equal(v.el.querySelector('.se-panel'), null, 'taken down with its card');
  const act = read('src/ui/actions.js'), card = read('src/ui/card.js');
  assert.match(act, /if \(!SIN_EDGES\.has\(id\) && id !== 'TIPS' && id !== 'DIPS'\) verbs\.push\(\.\.\.vesselReads\(k\)\);/, 'no flow, velocity and diameter tiles above the stent');
  assert.match(act, /span = null; {3}\/\/ \(no PV to IVC bar/);
  assert.match(act, /noValue: id === 'TIPS' \|\| id === 'DIPS',/);
  assert.match(card, /else if \(!m\.noValue\) \{ numEl = h\('span', P_NUM\);/, 'and no reading row');
  assert.match(read('styles/app-06-plate.css'), /\.ac-panel:has\(> \.tv\) \{ position: relative; z-index: 4; \}/, 'the panel covers the actions under the rows');
});

test('The figure\'s geometry: 8 cm of stent fill the same span at every length, the veins squeezed either side; rows by width; round axis tops', async () => {
  const { figLayout, xOf, sampleAt, vTop, pTop, VEIN_CM, REF_CM } = await import('../src/ui/tips-figure.js');
  const L = figLayout(400, { labels: true, chart: true });
  assert.ok(Math.abs(L.pxCm - 400 / (REF_CM + 2 * VEIN_CM)) < 1e-9);
  assert.ok(Math.abs(L.x0 - VEIN_CM * L.pxCm) < 1e-9 && Math.abs(L.x1 - (400 - VEIN_CM * L.pxCm)) < 1e-9);
  for (const len of [6, 8, 10]) { assert.ok(Math.abs(xOf(0, len, L) - L.x0) < 1e-9); assert.ok(Math.abs(xOf(len, len, L) - L.x1) < 1e-9); }
  assert.ok(Math.abs(xOf(4, 8, L) - (L.x0 + L.x1) / 2) < 1e-9);
  assert.ok(xOf(-5, 8, L) >= 0 && xOf(20, 8, L) <= 400, 'the veins never pass the picture');
  assert.equal(sampleAt(L.x0, 8, L) < sampleAt(L.x1, 8, L), true);
  const Lw = figLayout(600, { labels: true, chart: true }), Ls = figLayout(400, { labels: false, chart: false });
  assert.ok(Lw.chH > L.chH, 'a wide card\'s chart is a little taller');
  assert.equal(Ls.chH, 0); assert.ok(Ls.h < L.heroH, 'the vessel card\'s stent alone is shorter than the test card\'s labelled stent');
  assert.equal(vTop(100), 150); assert.equal(vTop(271), 300); assert.equal(vTop(10000), 4500);
  assert.equal(pTop(15.6), 18); assert.equal(pTop(3), 12);
});

test('A row\'s words (rowValue): the diameter, the stenosis\' end and lumen, the waist\'s lumen and length, or None', async () => {
  const { rowValue } = await import('../src/ui/stent-editor.js');
  const p = paramsOf({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { red: 0.37, waist: 3 } } });
  store.set({ params: p });
  assert.equal(rowValue('dia', 'TIPS', p), '10.0 mm');
  assert.equal(rowValue('end', 'TIPS', p), 'Distal 5.0 mm');
  assert.equal(rowValue('waist', 'TIPS', p), '6.3 mm × 3.0 cm');
  const q = paramsOf({ tips: { on: true, d: 8 } });
  store.set({ params: q });
  assert.equal(rowValue('end', 'TIPS', q), 'None'); assert.equal(rowValue('waist', 'TIPS', q), 'None');
});

test('No Tests pane scrolls sideways: the pane and the TIPS view clip x and take vertical pans only', async () => {
  const plate = read('styles/app-06-plate.css');
  assert.match(plate, /\.instrument-workspace \.dock-pane \{[^}]*overflow: hidden auto; touch-action: pan-y;/, 'every Tests pane');
  for (const rule of plate.match(/\.ir-[\w-]*[^{}]*\{[^}]*overflow-y: (?:auto|scroll)[^}]*\}/g) || []) assert.match(rule, /overflow: hidden (?:auto|scroll)/, `a vertical scroller that also clips x: ${rule.slice(0, 60)}`);
});

test('Curves, working state (F42): while the points are worked out the chart rests faded with a line saying so and how far; when they are drawn it fades up', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }) });
  let release; const gate = new Promise((r) => { release = r; });
  const request = async (type) => (type === 'snapshot' ? { snap: { s: 1 } } : { result: {} });
  const calc = () => ({ sequence: async (steps, from, cb) => { cb({ i: 0, snap: {}, fp: {} }); await gate; steps.forEach((_s, i) => i && cb({ i, snap: {}, fp: {} })); return {}; } });
  const chart = () => ({ el: document.createElement('div'), configure: (_t, ctx) => { ctx.run([1, 2, 3, 4]); }, pin() {} });
  const c = createIrCurves({ request, calc, chart, delay: 5 });
  c.update(frameWith(1.5)); assert.equal(c.el.dataset.state, undefined, 'set between frames');
  await wait(60);
  assert.equal(c.phase(), 'drawn');
  assert.match(c.el.querySelector('.ir-work').textContent, /Working out the curves for this patient… 1 of 4/);
  await wait(30);
  assert.equal(c.el.dataset.state, 'working');
  release(); await wait(40);
  assert.equal(c.el.dataset.state, 'ready');
  const css = read('styles/app-06-plate.css');
  assert.match(css, /\.ir-curves\[data-state="working"\] \.ir-chart \{ opacity: \.25; \}/);
  assert.match(css, /\.ir-curves\[data-state="working"\] \.ir-work \{ opacity: 1; \}/);
});

test('Curves, the dashed line has somewhere to stand (F43): an unset waist or length is filled from the stent\'s own geometry', async () => {
  store.set({ params: paramsOf({ tips: { on: true, d: 8 } }) });
  const { log, c } = lifeKit();
  c.setSweep('waist');
  c.update({ metrics: { ppg: 9, tips: { s: 0.4, red: 0.4, flow: 0.2, bench: 1, geom: { len: 8, waist: 2.4, trans: 0 } }, dips: null } });
  await wait(60);
  const lp = log.configured.at(-1).ctx.liveParams();
  assert.equal(lp.stentGeom.TIPS.waist, 2.4);
  assert.equal(log.configured.at(-1).ctx.liveParams(), lp, 'the same object while nothing changes');
  assert.equal(log.configured.at(-1).t.param, 'stentGeom.TIPS.waist');
});

test('Compare says how to pin a moment before there is one, in one line (F44)', () => {
  const c = createIrCompare();
  store.set({ params: paramsOf({ tips: { on: true, d: 10 } }), compareSnap: null });
  c.update(frameOf());
  assert.match(c.el.querySelector('.ir-note').textContent, /Tap Compare from here on the timeline \(or press P\)/);
  assert.equal(c.el.firstElementChild.className, 'ctl-sub ir-note', 'the sentence comes first');
});
