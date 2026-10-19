// Deck visuals package C (review/deck-visuals-recs.md §9): the parameter curve (V4) and the cause bars (V5). The curve's
// point at the slide's own setting is the slide's state; the bars and "Interaction and other" add up to the rise from
// healthy; every cause the Why? panel can name falls in a mechanism; and the charts' layout keeps to the card.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { explain } from '../src/engine/explain.js';
import { DRUGS } from '../src/engine/scenario.js';
import { EXT, PACKAGES, stepExtra } from '../src/ui/slide-ext.js';
import { curveSteps, curveSeries, curveXs, patchOf, getAt, leftScale, rightScale, cutsOf, xTicks, ringAt } from '../src/ui/tool-curve.js';
import { causeBars, groupOf, GROUPS, wrapLabel, keyLayout, MOST, OTHER } from '../src/ui/tool-causes.js';

async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}

test('package C registers the curve and the causes, and asks for the Why? work only on a causes slide', () => {
  assert.equal(EXT.owner.tools.curve, 'C');
  assert.equal(EXT.owner.tools.causes, 'C');
  const { tools } = PACKAGES.C;
  assert.equal(tools.curve.title({ param: 'tips.d', lines: ['ppg', 'liver'] }), 'PPG and liver flow by TIPS diameter');
  assert.equal(tools.causes.title({ metric: 'hvpg' }), 'What raises the HVPG');
  assert.ok(tools.causes.title({ metric: 'ppg' }).length <= 20 && tools.causes.short().length <= 20);
  assert.deepEqual(stepExtra({ tool: { kind: 'causes', metric: 'hvpg' } }), { explain: 'hvpg' });
  assert.deepEqual(stepExtra({ tool: { kind: 'causes', metric: 'nonsense' } }), { explain: 'ppg' });
  assert.equal(stepExtra({ tool: { kind: 'curve', param: 'tips.d' } }), null);
  assert.equal(stepExtra({ tool: { kind: 'flowtime' } }), null);
});

test('a curve\'s points: its range, each step\'s whole patch, and a TIPS diameter that switches the TIPS on', () => {
  assert.deepEqual(curveXs({ from: 6, to: 12, step: 1 }), [6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(curveXs({ from: 0, to: 0.9, step: 0.1 }), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  assert.equal(curveXs({ from: 0, to: 100, step: 0.01 }).length, 41, 'at most 41 points');
  assert.deepEqual(curveXs({ from: 3, to: 3 }), []);
  assert.deepEqual(patchOf('tips.d', 10), { tips: { d: 10, on: true } });
  assert.deepEqual(patchOf('thrombus.PV_TRUNK', 0.5, { cirrhosis: 0.6 }), { cirrhosis: 0.6, thrombus: { PV_TRUNK: 0.5 } });
  assert.equal(getAt({ tips: { d: 8 } }, 'tips.d'), 8);
  assert.equal(curveSteps({ param: 'cirrhosis', from: 0, to: 0.4, step: 0.2 }).length, 3);
});

test('the curve\'s point at the slide\'s own setting is the slide\'s state', async () => {
  const t = { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] };
  const [slide] = await seq([{ preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } } }]);
  const ser = curveSeries(t, await seq(curveSteps(t), slide.snap));
  const j = ser.xs.indexOf(8), ring = ringAt(t, slide.params, slide.fp);
  assert.equal(ring.x, 8);
  assert.ok(Math.abs(ser.ys[0][j] - slide.fp.ppg) < 0.05, `PPG ${ser.ys[0][j]} at 8 mm, slide ${slide.fp.ppg}`);
  assert.ok(Math.abs(ser.ys[1][j] - slide.fp.liver) < 0.5, `liver flow ${ser.ys[1][j]} at 8 mm, slide ${slide.fp.liver}`);
  // (A wider stent: the PPG falls and the liver's share of flow falls with it, all the way along.)
  for (let i = 1; i < ser.xs.length; i++) assert.ok(ser.ys[0][i] < ser.ys[0][i - 1] && ser.ys[1][i] < ser.ys[1][i - 1], `${ser.xs[i]} mm`);
});

test('the cirrhosis curve bends upward: the same step adds more late than early', async () => {
  const t = { kind: 'curve', param: 'cirrhosis', from: 0, to: 0.9, step: 0.1, lines: ['hvpg'] };
  const [slide] = await seq([{ preset: 'healthy', params: { cirrhosis: 0.6 } }]);
  const ser = curveSeries(t, await seq(curveSteps(t), slide.snap));
  assert.deepEqual(ser.xs, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 'shown in %');
  const y = ser.ys[0];
  assert.ok(Math.abs(y[6] - slide.fp.hvpg) < 0.05, 'the point at 60 % is the slide');
  assert.ok(y.at(-1) - y.at(-2) > y[1] - y[0], 'steeper late than early');
});

test('scales: a pressure from zero up to a close cut-off, the second line on the first\'s gridlines, the x ends kept', () => {
  const l = leftScale('ppg', [7.6, 12.5]);
  assert.equal(l.min, 0); assert.ok(l.max >= 12.5);
  const l2 = leftScale('hvpg', [2.4, 8.7]);
  assert.ok(l2.max >= 10, 'the red cut-off at 10 shows above 8.7');
  const r = rightScale([22.7, 40.9], l.ticks.length);
  assert.equal(r.ticks.length, l.ticks.length); assert.ok(r.min <= 22.7 && r.max >= 40.9);
  assert.deepEqual(cutsOf('ppg'), [{ v: 6, rate: 'mid' }, { v: 12, rate: 'hi' }]);
  assert.deepEqual(cutsOf('liver'), [{ v: 55, rate: 'hi' }, { v: 75, rate: 'mid' }]);
  assert.deepEqual(cutsOf('bv'), []);
  const xt = xTicks(6, 12, 7);
  assert.ok(xt[0] === 6 && xt.at(-1) === 12 && xt.length <= 7);
});

test('the bars and "Interaction and other" sum to the rise from healthy, at most five bars, in mechanism order', async () => {
  const r = await seq([{ preset: 'csph', explain: ['ppg', 'hvpg', 'pv'] }, { preset: 'cirr-decomp', params: { drugs: { carvedilol: true } }, explain: 'ppg' }]);
  for (const st of r) for (const res of Object.values(st.extra.explain)) {
    const b = causeBars(res);
    assert.ok(b.bars.length <= MOST);
    const sum = b.bars.reduce((s, x) => s + x.delta, 0) + b.other;
    assert.ok(Math.abs(sum - res.total) < 1e-9, `${res.metricId}: ${sum} vs ${res.total}`);
    for (const x of b.bars) assert.ok(x.group, `${x.key} has a mechanism`);
    const order = b.bars.map((x) => GROUPS.findIndex(([k]) => k === x.group));
    assert.deepEqual(order, [...order].sort((a, c) => a - c), 'drawn by mechanism');
  }
  const carv = causeBars(r[1].extra.explain.ppg);
  assert.ok(carv.bars.some((x) => x.group === 'drugs' && x.key === 'Carvedilol' && x.delta < 0), 'carvedilol takes pressure off');
  assert.ok(causeBars({ total: 3, contributions: [] }).other === 3, 'with no causes, all of it is other');
});

test('every cause the Why? panel can name falls in a mechanism', () => {
  const e = new Engine();
  const p = e.params;
  Object.assign(p, { cirrhosis: 0.6, splenicRx: 1, splanchnicTone: 0.8, systemicTone: 0.9, contractility: 0.6, tr: 0.4, pericardial: 0.3, gestation: 20, apShunt: 0.5,
    portocaval: true, dsrs: true, mesocaval: true, balloonEso: true, albumin: 2.8 });
  p.fibrosis.R.pre = 3; p.fibrosis.L.sin = 2; p.fibrosis.R.post = 2;
  p.stenosis = { IVCS_RA: 0.4 }; p.thrombus = { SV_CONF: 0.5 }; p.occluded = { C3: true };
  p.tips = { on: true, d: 8 }; p.dips = { on: true, d: 8 };
  for (const k of Object.keys(DRUGS)) p.drugs[k] = true;
  e.slow.splTone = 0.8; e.slow.ascites = 2000;
  e.addVolume(900, 0.42, true);
  e.settle();
  const named = explain(e, 'ppg').contributions.map((c) => c.label);
  assert.ok(named.length >= 25, `${named.length} causes named`);
  for (const l of named) assert.ok(groupOf(l), `"${l}" falls in a mechanism`);
  // (And every label written plainly in explain.js, including the hemoglobin's and a bleed's.)
  const src = readFileSync(new URL('../src/engine/explain.js', import.meta.url), 'utf8');
  const plain = [...src.matchAll(/add\('([^']+)'/g), ...src.matchAll(/\['([A-Z][a-z][^']+)', '[a-z]/g), ...src.matchAll(/\? '([A-Z][^']+)' :/g)].map((m) => m[1]);
  for (const l of [...plain, 'Blood loss 400 mL', 'Extra blood volume +600 mL', 'Splenectomy', 'Partial splenic embolization', 'Splanchnic vasodilation, set', 'Splanchnic vasoconstriction, set']) assert.ok(groupOf(l), `"${l}" falls in a mechanism`);
  assert.equal(groupOf('Something new'), null);
});

test('the bars\' words: two lines at most, and the key\'s rows within the card', () => {
  for (const w of [130, 160, 200]) for (const l of ['Clot in Superior mesenteric vein 50 %', OTHER, 'Cirrhosis 60 %']) assert.ok(wrapLabel(l, w, 12).length <= 2);
  assert.deepEqual(wrapLabel('Cirrhosis 60 %', 300, 12), ['Cirrhosis 60 %']);
  for (const w of [300, 340, 480]) {
    const k = keyLayout(w, 12);
    assert.ok(k.rows <= 3, `${w} px: ${k.rows} rows`);
    for (const it of k.items) assert.ok(it.x + 1.3 * 12 + it.name.length * 12 * 0.56 <= w + 1, `${it.name} fits ${w} px`);
  }
});
