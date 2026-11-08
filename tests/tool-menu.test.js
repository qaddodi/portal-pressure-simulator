// The treatment menu (new-features recs C2, Mohammad 8 Nov 2026): every treatment the patient on screen could get, run on that patient, drawn as a dot
// at the PPG it reaches against the sinusoidal flow it costs. What is checked: which treatments are offered to which patient, that the numbers are the
// model's (the recs' table for the decompensated patient, and the chronic clot where the Meso-Rex breaks the line), and the picture's own pieces at card
// widths from a small phone to a big Mac, on a small stand-in for the browser's DOM. Nothing is run in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Txt = (text) => ({ text, children: [], attributes: [], getAttribute: () => null });
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.dataset = {}; this.style = {}; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? Txt(c) : c); }
  hasAttribute(k) { return k in this.attrs; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get localName() { return this.tag; }
  get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); }
}
globalThis.document = { createElementNS: (ns, tag) => new El(tag), createElement: (tag) => new El(tag), documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {} };
globalThis.window = globalThis;
globalThis.Element = class {};
globalThis.ResizeObserver = class { observe() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};

const { Engine } = await import('../src/engine/engine.js');
const { computeMetrics } = await import('../src/engine/metrics.js');
const { fingerprintOf } = await import('../src/engine/fingerprint.js');
const { deepMerge } = await import('../src/engine/scenario.js');
const M = await import('../src/ui/tool-menu.js');

const fpOf = (e) => fingerprintOf(computeMetrics(e), { P: e.P, Q: e.Q, D: e.D, params: e.params });
const patient = (preset) => { const e = new Engine(); e.loadPreset(preset); e.settle(); return e; };
// (The worker's step, as worker-core.js 'sequence' does it with restart: the slide's own state, the change merged in, settled.)
function run(preset, rows = null) {
  const base = patient(preset), opts = M.menuOptions(base.params, rows);
  const outs = M.menuSteps(opts).map((st) => { const e = patient(preset); e.setParams(deepMerge(e.params, st.params)); e.settle(); return { fp: fpOf(e) }; });
  return { base, opts, pts: M.menuPoints(opts, outs), fp0: fpOf(base) };
}
const ids = (o) => o.map((m) => m.id);

test('the decompensated patient is offered the drugs, the embolization, both stents and the three shunts; not the Rex or a recanalization', () => {
  const { opts } = run('cirr-decomp');
  assert.deepEqual(ids(opts), ['propranolol', 'carvedilol', 'pse', 'tips8', 'tips10', 'warren', 'mesocaval', 'portocaval']);
  assert.equal(M.baseName(patient('cirr-decomp').params), 'No treatment');
});

test('a treatment already in place is the ring, not a dot; a stent is not offered through a clotted trunk', () => {
  const e = patient('cirr-decomp');
  e.setParams(deepMerge(e.params, { drugs: { carvedilol: true }, tips: { on: true, d: 8 } }));
  const o = ids(M.menuOptions(e.params));
  assert.ok(!o.includes('carvedilol') && !o.includes('tips8') && !o.includes('tips10'), o.join());
  assert.ok(o.includes('propranolol'), 'the other drug stays: it swaps for carvedilol');
  assert.equal(M.baseName(e.params), 'As now');
  const chronic = ids(M.menuOptions(patient('pvt-chronic').params));
  assert.ok(chronic.includes('rex') && chronic.includes('recanalization'), chronic.join());
  assert.ok(!chronic.includes('tips8') && !chronic.includes('tips10'), 'no stent from a clotted trunk');
  assert.deepEqual(ids(M.menuOptions(patient('cirr-decomp').params, ['tips8', 'rex', 'nothing'])), ['tips8'], 'rows offers only some, and only what suits the patient');
});

test('the numbers are the model’s: the recs’ table for the decompensated patient', () => {
  const { pts, fp0 } = run('cirr-decomp');
  assert.equal(pts.length, 8);
  const at = (id) => pts.find((q) => q.id === id);
  const want = { propranolol: [15.1, 52], carvedilol: [14.1, 58], pse: [16.3, 56], warren: [16.1, 55], tips8: [9.2, 29], tips10: [7.9, 24], mesocaval: [6.6, 23], portocaval: [3.0, 36] };
  for (const [id, [ppg, liver]] of Object.entries(want)) {
    assert.ok(Math.abs(at(id).ppg - ppg) < 0.06, `${id} PPG ${at(id).ppg}`);
    assert.ok(Math.abs(at(id).liver - liver) < 0.6, `${id} liver ${at(id).liver}`);
  }
  assert.ok(Math.abs(fp0.ppg - 17.4) < 0.06 && Math.abs(fp0.liver - 59) < 0.6);
  // (Every shunt trades a lower gradient for less sinusoidal flow: no treatment here lowers the PPG and raises the liver's flow.)
  for (const q of pts) assert.ok(q.ppg < fp0.ppg && q.liver <= fp0.liver + 1e-6, `${q.id} trades`);
  assert.ok(at('portocaval').shunt > 0.99 && at('mesocaval').shunt > 0.99, 'the surgical shunts take it all');
});

test('the chronic clot: the Meso-Rex and a recanalization are the dots that break the line, the liver over its normal', () => {
  const { pts, fp0 } = run('pvt-chronic');
  const rex = pts.find((q) => q.id === 'rex'), rec = pts.find((q) => q.id === 'recanalization');
  assert.ok(Math.abs(rex.ppg - 7.2) < 0.06 && Math.abs(rec.ppg - 4.6) < 0.06, `${rex.ppg} ${rec.ppg}`);
  assert.ok(rex.liver > 100 && rec.liver > 100 && rex.liver > fp0.liver && rec.liver > fp0.liver, `${rex.liver} ${rec.liver}`);
  const meso = pts.find((q) => q.id === 'mesocaval');
  assert.ok(meso.liver < fp0.liver, 'the ordinary shunt still costs the liver its flow');
});

test('a dot’s colour is the PPG’s own rating and its size the blood that bypasses the liver', () => {
  assert.equal(M.ratingTok(3), 'ok');
  assert.equal(M.ratingTok(9), 'caution');
  assert.equal(M.ratingTok(17), 'danger');
  assert.ok(M.dotRadius(0, 14) < M.dotRadius(0.5, 14) && M.dotRadius(0.5, 14) < M.dotRadius(1, 14));
  assert.equal(M.dotRadius(NaN, 14), M.dotRadius(0, 14));
});

const walk = (n, f, out = []) => { if (!n || typeof n !== 'object') return out; f(n) && out.push(n); for (const c of n.children || []) walk(c, f, out); return out; };
const words = (n) => n.textContent;
test('the picture: a dot for each treatment and the ring, the cut-offs named, every name placed or numbered, at phone to Mac widths', () => {
  const { pts, fp0 } = run('cirr-decomp');
  for (const [w, h] of [[300, 220], [340, 260], [420, 300], [560, 340]]) {
    const { svg, G } = M.build(w, h, 12, pts, fp0, 'No treatment');
    assert.equal(svg.dataset.points, String(pts.length));
    const dots = walk(svg, (n) => n.attrs?.class === 'pcv-dot'), rings = walk(svg, (n) => n.attrs?.class === 'pcv-ring');
    assert.equal(dots.length, pts.length, `${w}: a dot each`);
    assert.equal(rings.length, 1, `${w}: the ring`);
    const texts = walk(svg, (n) => n.tag === 'text').map(words);
    assert.ok(texts.some((t) => t === 'PPG 12'), `${w}: the PPG line is named`);
    assert.ok(texts.some((t) => t === 'Liver 55'), `${w}: the liver line is named`);
    assert.ok(texts.some((t) => /Dot size/.test(t)), `${w}: the size is explained`);
    // (Every dot sits inside the plot.)
    for (const d of dots) assert.ok(+d.attrs.cx >= G.L - 1 && +d.attrs.cx <= G.R + 1 && +d.attrs.cy >= G.T - 1 && +d.attrs.cy <= G.B + 1, `${w}: dot ${d.attrs.cx},${d.attrs.cy} in the plot`);
    // (A dot is named by its name or its number with a key under the chart; a name that fits no clear spot is the only thing left out.)
    const named = walk(svg, (n) => n.attrs?.class?.startsWith('pcv-dname')).length;
    assert.ok(named >= Math.ceil(pts.length * 0.6), `${w}: ${named} of ${pts.length + 1} names stand`);
    // (Both ends of the trade read: the dearest dot is left of the ring, the cheapest right of the dots.)
    assert.ok(Math.min(...dots.map((d) => +d.attrs.cx)) < +rings[0].attrs.cx, `${w}: the shunts lie left of the ring`);
  }
  // The frame alone, until the numbers are there.
  const { svg } = M.build(420, 300, 12, [], fp0, 'No treatment');
  assert.equal(svg.dataset.points, '0');
  assert.equal(walk(svg, (n) => n.attrs?.class === 'pcv-dot').length, 0);
});

test('the chronic clot’s dots run past 100%, and the axis reaches them', () => {
  const { pts, fp0 } = run('pvt-chronic');
  const { G, svg } = M.build(420, 300, 12, pts, fp0, 'No treatment');
  assert.ok(G.x1 >= Math.max(...pts.map((q) => q.liver)), `${G.x1}`);
  assert.equal(walk(svg, (n) => n.attrs?.class === 'pcv-dot').length, pts.length);
});
