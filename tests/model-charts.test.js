// Deck visuals package C (review/deck-visuals-recs.md §9): the parameter curve (V4) and the cause bars (V5). The curve's
// point at the slide's own setting is the slide's state; the waterfall's steps and "Causes together" add up from the
// healthy reading to the tile's; every cause the Why? panel can name falls in a mechanism; and the charts' layout keeps to the card.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { explain } from '../src/engine/explain.js';
import { DRUGS } from '../src/engine/scenario.js';
import { EXT, PACKAGES, stepExtra } from '../src/ui/slide-ext.js';
import { curveSteps, curveSeries, curveXs, patchOf, getAt, leftScale, rightScale, cutsOf, xTicks, ringAt, placeWord, segHits, onCurve, curveAt, againstOf, mergeOf, curveLines, drawnLines } from '../src/ui/tool-curve.js';
import { causeBars, groupOf, GROUPS, wrapLabel, MOST, OTHER, steps, domainOf, layout, fitBars, shownText, GAP } from '../src/ui/tool-causes.js';
import { tileShown, RATE } from '../src/ui/table-marks.js';

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

test('a curve against a drug: the second sweep carries the drug, one reading drawn twice', () => {
  const t = { kind: 'curve', param: 'cirrhosis', from: 0, to: 0.4, step: 0.2, lines: ['ppg', 'liver'], also: { drugs: { propranolol: false } },
    against: { label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' } };
  assert.deepEqual(againstOf(t), { label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' });
  assert.equal(againstOf({ against: { label: '', params: {} } }), null);
  assert.equal(againstOf({ against: { label: 'X', params: [1] } }), null);
  assert.equal(againstOf({ against: { label: 'X', params: {} } }).own, 'This case');
  assert.deepEqual(mergeOf({ drugs: { propranolol: false }, cirrhosis: 0.5 }, { drugs: { carvedilol: true } }), { drugs: { propranolol: false, carvedilol: true }, cirrhosis: 0.5 });
  assert.deepEqual(curveLines(t), ['ppg'], 'one reading with against');
  const dl = drawnLines(t);
  assert.deepEqual(dl.map((l) => l.name), ['No drug', 'Carvedilol']);
  assert.notEqual(dl[0].c, dl[1].c);
  const st = curveSteps(t);
  assert.equal(st.length, 6);
  assert.deepEqual(st[1].params, { drugs: { propranolol: false }, cirrhosis: 0.2 });
  assert.deepEqual(st[4].params, { drugs: { propranolol: false, carvedilol: true }, cirrhosis: 0.2 });
  const fp = (v) => ({ fp: { ppg: v } });
  const ser = curveSeries(t, [fp(5), fp(9), fp(13), fp(4), fp(7), fp(11)]);
  assert.deepEqual(ser, { xs: [0, 20, 40], ys: [[5, 9, 13], [4, 7, 11]] });
  assert.equal(curveSeries(t, [fp(5), fp(9), fp(13)]), null, 'both sweeps or nothing');
  assert.deepEqual(ringAt(t, { cirrhosis: 0.3 }, { ppg: 11 }), { x: 30, ys: [11, null] });
});

test('carvedilol lowers the whole PPG curve of decompensated cirrhosis and moves its crossing of 12 to more scarring', async () => {
  const t = { kind: 'curve', param: 'cirrhosis', from: 0.3, to: 0.95, step: 0.05, lines: ['ppg'],
    against: { label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' } };
  const [slide] = await seq([{ preset: 'cirr-decomp' }]);
  const ser = curveSeries(t, await seq(curveSteps(t), slide.snap));
  const j = ser.xs.findIndex((x) => Math.abs(x - 85) < 1e-6);
  assert.ok(Math.abs(ser.ys[0][j] - slide.fp.ppg) < 0.05, `the own line at 85 % is the slide: ${ser.ys[0][j]} vs ${slide.fp.ppg}`);
  for (let i = 0; i < ser.xs.length; i++) assert.ok(ser.ys[1][i] < ser.ys[0][i], `carvedilol lower at ${ser.xs[i]} %`);
  // (Where each line first reaches 12, read between its points.)
  const [a, b] = ser.ys.map((ys) => { const i = ys.findIndex((y) => y >= 12); return i > 0 ? ser.xs[i - 1] + (ser.xs[i] - ser.xs[i - 1]) * ((12 - ys[i - 1]) / (ys[i] - ys[i - 1])) : null; });
  assert.ok(a > 40 && b > a, `crosses 12 at ${a} % without the drug and ${b} % with it`);
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
  const l3 = leftScale('hvpg', [2.4, 22.2]);
  assert.ok(l3.max < 30 && l3.max >= 22.2, `an HVPG of 22 reaches ${l3.max}, not 30`);
  for (const most of [3, 4, 5]) assert.ok(leftScale('hvpg', [2.4, 22.2], most).ticks.length <= most, `a short chart: at most ${most} numbers`);
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

test('the bars and "Causes together" sum to the rise from healthy, at most five bars, in mechanism order', async () => {
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
  // (The printed numbers add up exactly from the printed healthy reading to the tile's: the other step takes the rounding.)
  for (const st of r) for (const res of Object.values(st.extra.explain)) {
    const b = causeBars(res), u = 10 ** b.digits;
    const printed = b.bars.reduce((s, x) => s + Math.round(x.shown * u), 0) + Math.round(b.otherShown * u);
    assert.equal(Math.round(b.baseShown * u) + printed, Math.round(b.currentShown * u), `${res.metricId}: printed numbers add up`);
    assert.equal(b.currentShown, tileShown(res.metricId, res.current), `${res.metricId}: "Now" prints the tile's number`);
  }
  const rounding = causeBars({ total: 0.3, digits: 1, contributions: [{ label: 'Cirrhosis 60 %', delta: 0.14 }, { label: 'Collaterals', delta: 0.14 }] });
  assert.deepEqual([...rounding.bars.map((x) => x.shown), rounding.otherShown], [0.1, 0.1, 0.1]);
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

test('the waterfall walks from healthy to now: each step starts where the last one ended, and its printed numbers add up', async () => {
  const r = await seq([{ preset: 'csph', explain: ['ppg', 'hvpg', 'pv'] }, { preset: 'cirr-decomp', params: { drugs: { carvedilol: true } }, explain: 'ppg' }]);
  for (const st of r) for (const [k, res] of Object.entries(st.extra.explain)) {
    const rows = steps(causeBars(res), k), u = 10 ** res.digits;
    assert.equal(rows[0].label, 'Healthy'); assert.equal(rows.at(-1).label, 'Now'); assert.equal(rows.at(-2).label, OTHER);
    assert.ok(Math.abs(rows[0].b - res.base) < 1e-9 && Math.abs(rows.at(-1).b - res.current) < 1e-9);
    const st2 = rows.filter((x) => x.kind === 'step');
    assert.ok(Math.abs(st2[0].a - res.base) < 1e-9, 'the first step starts at the healthy reading');
    for (let i = 1; i < st2.length; i++) assert.ok(Math.abs(st2[i].a - st2[i - 1].b) < 1e-9, 'each step starts where the last ended');
    assert.ok(Math.abs(st2.at(-1).b - res.current) < 1e-9, 'the last step ends at the reading now');
    const sum = Math.round(rows[0].shown * u) + st2.reduce((s, x) => s + Math.round(x.shown * u), 0);
    assert.equal(sum, Math.round(rows.at(-1).shown * u), `${k}: ${rows.map((x) => shownText(x, res.digits)).join(' ')}`);
    assert.equal(rows.at(-1).rate, RATE[k](tileShown(k, res.current))[0], 'the "Now" bar takes its tile\'s rating');
    // (The scale shows every bar, from zero, and reaches the cut-off the case crosses.)
    const dm = domainOf(rows, k);
    assert.ok(dm.lo <= 0 && rows.every((x) => x.a >= dm.lo && x.b <= dm.hi));
    if (k === 'ppg' && res.current > 12) assert.ok(dm.hi > 12);
  }
  // (A worked case: 4.0 healthy, +9.0, +1.0, −1.5 and the rest make the tile's 13.6.)
  const rows = steps(causeBars({ total: 9.6, base: 4, current: 13.6, digits: 1, contributions: [{ label: 'Cirrhosis 60 %', delta: 9.04 }, { label: 'Collaterals', delta: -1.52 }, { label: 'Splanchnic vasodilation', delta: 0.96 }] }), 'ppg');
  assert.deepEqual(rows.map((x) => shownText(x, 1)), ['4.0', '+9.0', '+1.0', '−1.5', '+1.1', '13.6']);
  assert.deepEqual(rows.map((x) => x.label), ['Healthy', 'Cirrhosis 60 %', 'Splanchnic vasodilation', 'Collaterals', OTHER, 'Now']);
  assert.equal(rows.at(-1).rate, 'hi');
});

test('the waterfall\'s words: within their column, rows clear of each other on every card, fewer causes when a card is short', async () => {
  for (const w of [160, 200]) for (const l of ['Clot in Superior mesenteric vein 50 %', OTHER, 'Cirrhosis 60 %']) assert.ok(wrapLabel(l, w, 12).length <= 2);
  assert.deepEqual(wrapLabel('Cirrhosis 60 %', 300, 12), ['Cirrhosis 60 %']);
  // (Only a label too long for two lines of its column takes a third; every line fits.)
  assert.ok(wrapLabel('Clot in Superior mesenteric vein 50 %', 100, 12).every((l) => l.length * 12 * 0.56 <= 100));
  const [st] = await seq([{ preset: 'cirr-decomp', params: { drugs: { carvedilol: true } }, explain: ['ppg', 'hvpg', 'pv'] }]);
  const long = { total: 9, base: 4, current: 13, digits: 1, contributions: ['Clot in Superior mesenteric vein 50 %', 'Splanchnic vasodilation', 'Extra blood volume +600 mL', 'Tricuspid regurgitation', 'Collaterals'].map((label, i) => ({ label, delta: 3 - i })) };
  // (The sizes styles/app.css gives the chart: a narrow Mac or iPad card beside its tile, a phone held sideways (short) or
  // upright (stacked), an iPad held upright, a wide Mac card.)
  for (const [w, h] of [[200, 264], [240, 264], [300, 160], [340, 160], [300, 212], [330, 214], [360, 214], [420, 290], [300, 330], [480, 330]]) for (const f of (w < 300 ? [12, 13] : [12, 13, 15])) {
    for (const [k, res] of [...Object.entries(st.extra.explain), ['ppg', long]]) {
      const data = fitBars(res, w, h, f, k), rows = steps(data, k), L = layout(w, h, f, rows);
      assert.ok(L.fits, `${w}×${h} at ${f} px fits ${rows.length} rows`);
      if (res !== long) assert.ok(data.bars.length >= Math.min(2, res.contributions.length), `${w}×${h}: keeps the largest causes`);
      assert.ok(data.bars.length >= 1, `${w}×${h}: keeps the largest cause`);
      assert.ok(L.Lw + 0.5 * f < L.bx0 && L.bx1 - L.bx0 >= 0.22 * w, `${w}×${h}: the steps keep room`);
      assert.ok(L.bh >= 4 && L.bh <= 0.95 * f + 1e-9);
      for (let i = 0; i < L.rows.length; i++) {
        const p = L.rows[i], hgt = (x) => f + (x.lines.length - 1) * 1.15 * f;
        assert.ok(p.lines.length <= (w < 240 ? 4 : 3));   // (a vessel's clot on the narrowest card: four short lines)
        for (const l of p.lines) assert.ok(l.length * f * 0.56 <= L.Lw + 0.5, `"${l}" within its column`);
        if (i) {
          const q = L.rows[i - 1];
          assert.ok(p.y - hgt(p) / 2 - (q.y + hgt(q) / 2) >= GAP - 1e-6, `${w}×${h}: rows ${i - 1} and ${i} keep their gap`);
          // (A step's number, 0.42 em either side of its row's middle, keeps clear of the bar above and below it.)
          assert.ok(p.y - q.y - 0.42 * f - L.bh / 2 >= GAP - 1e-6, `${w}×${h}: a number keeps off the next bar`);
        }
      }
      assert.ok(L.axY <= h + 1e-6 && L.rows.at(-1).y + L.bh / 2 < L.B, `${w}×${h}: the axis numbers stay in the card`);
      // (Whatever folds into "Causes together", the steps still add up.)
      const u = 10 ** data.digits;
      assert.equal(Math.round(rows[0].shown * u) + rows.filter((x) => x.kind === 'step').reduce((s, x) => s + Math.round(x.shown * u), 0), Math.round(rows.at(-1).shown * u));
    }
  }
});
test('a word beside a ring takes the first place clear of the lines, the cut-offs and the other words', () => {
  assert.ok(segHits([0, 0, 10, 10], [4, 4, 6, 6]));
  assert.ok(!segHits([0, 0, 10, 0], [4, 4, 6, 6]));
  const cut = { y: 50, x0: 0, x1: 200 };
  // (The first spot sits on the cut-off at y 50, so the word goes to the next one.)
  const p = placeWord([{ x: 100, y: 55, anchor: 'start' }, { x: 100, y: 75, anchor: 'start' }], 40, 12, { lines: [cut], bounds: [0, 0, 200, 100] });
  assert.equal(p.y, 75); assert.equal(p.n, 0);
  const q = placeWord([{ x: 100, y: 75, anchor: 'start' }, { x: 100, y: 30, anchor: 'start' }], 40, 12, { boxes: [p.box], lines: [cut], bounds: [0, 0, 200, 100] });
  assert.equal(q.y, 30, 'clear of the first word');
  const r = placeWord([{ x: 190, y: 30, anchor: 'start' }, { x: 190, y: 30, anchor: 'end' }], 40, 12, { bounds: [0, 0, 200, 100] });
  assert.equal(r.anchor, 'end', 'inside the plot');
  // (With no clear spot, a weighted cut-off loses to crossing a data line: a value never reads as the cut-off's name.)
  const seg = [0, 80, 200, 80];
  const s = placeWord([{ x: 100, y: 55, anchor: 'start' }, { x: 100, y: 84, anchor: 'start' }], 40, 12, { lines: [{ ...cut, w: 5 }], segs: [seg], bounds: [0, 0, 200, 100] });
  assert.equal(s.y, 84);
  // (A value stays on its ring's side of a cut-off: its ring at y 70 is under the line at 50.)
  const u = placeWord([{ x: 100, y: 35, anchor: 'start' }, { x: 100, y: 99, anchor: 'start' }], 40, 12, { lines: [{ ...cut, w: 5, side: 70 }], bounds: [0, 0, 200, 100] });
  assert.equal(u.y, 99);
});

test('with only the curve\'s setting moved, the case sits on the curve, read between its points', () => {
  const t = { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg'] };
  const base = { cirrhosis: 0.8, tips: { on: true, d: 8 } };
  assert.ok(onCurve(t, { cirrhosis: 0.8, tips: { on: true, d: 11 } }, base));
  assert.ok(!onCurve(t, { cirrhosis: 0.8, tips: { on: true, d: 11 }, drugs: { carvedilol: true } }, base), 'a compare button moves it off');
  assert.ok(onCurve({ ...t, param: 'cirrhosis' }, { cirrhosis: 0.5, tips: { on: true, d: 8 } }, base));
  assert.deepEqual(curveAt({ xs: [6, 7, 8], ys: [[12, 10, 9]] }, 7.5), [9.5]);
  assert.equal(curveAt({ xs: [6, 7, 8], ys: [[12, 10, 9]] }, 9), null);
});
