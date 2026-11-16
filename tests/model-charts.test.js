// Deck visuals package C (review/deck-visuals-recs.md §9): the parameter curve (V4). The curve's point at the slide's own
// setting is the slide's state, and the chart's layout keeps to the card. (The waterfall card of V5 is gone: 15 Nov 2026, Mohammad.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { EXT, PACKAGES, stepExtra } from '../src/ui/slide-ext.js';
import { curveSteps, curveSeries, curveXs, patchOf, getAt, leftScale, rightScale, cutsOf, xTicks, ringAt, placeWord, segHits, onCurve, curveAt, againstOf, mergeOf, curveLines, drawnLines } from '../src/ui/tool-curve.js';

async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}

test('package C registers the curve and no waterfall card, and asks for no Why? work on any slide', () => {
  assert.equal(EXT.owner.tools.curve, 'C');
  assert.equal(EXT.owner.tools.causes, undefined);
  const { tools } = PACKAGES.C;
  assert.equal(tools.curve.title({ param: 'tips.d', lines: ['ppg', 'liver'] }), 'PPG and liver flow vs healthy by TIPS diameter');
  assert.equal(tools.causes, undefined);
  assert.equal(stepExtra({ tool: { kind: 'causes', metric: 'hvpg' } }), null);
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
  const ser = curveSeries(t, await seq(curveSteps(t), slide.base));
  const j = ser.xs.indexOf(8), ring = ringAt(t, slide.params, slide.fp);
  assert.equal(ring.x, 8);
  assert.ok(Math.abs(ser.ys[0][j] - slide.fp.ppg) < 0.15,   // (a point settles from the slide's bedside state, which its own settle leaves a tenth off: worker-core.js atBedside)
     `PPG ${ser.ys[0][j]} at 8 mm, slide ${slide.fp.ppg}`);
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
  const ser = curveSeries(t, await seq(curveSteps(t), slide.base));
  const j = ser.xs.findIndex((x) => Math.abs(x - 85) < 1e-6);
  assert.ok(Math.abs(ser.ys[0][j] - slide.fp.ppg) < 0.15,   // (a point settles from the slide's bedside state, which its own settle leaves a tenth off: worker-core.js atBedside)
     `the own line at 85 % is the slide: ${ser.ys[0][j]} vs ${slide.fp.ppg}`);
  for (let i = 0; i < ser.xs.length; i++) assert.ok(ser.ys[1][i] < ser.ys[0][i], `carvedilol lower at ${ser.xs[i]} %`);
  // (Where each line first reaches 12, read between its points.)
  const [a, b] = ser.ys.map((ys) => { const i = ys.findIndex((y) => y >= 12); return i > 0 ? ser.xs[i - 1] + (ser.xs[i] - ser.xs[i - 1]) * ((12 - ys[i - 1]) / (ys[i] - ys[i - 1])) : null; });
  assert.ok(a > 40 && b > a, `crosses 12 at ${a} % without the drug and ${b} % with it`);
});

test('the cirrhosis curve bends upward: the same step adds more late than early', async () => {
  const t = { kind: 'curve', param: 'cirrhosis', from: 0, to: 0.9, step: 0.1, lines: ['hvpg'] };
  const [slide] = await seq([{ preset: 'healthy', params: { cirrhosis: 0.6 } }]);
  const ser = curveSeries(t, await seq(curveSteps(t), slide.base));
  assert.deepEqual(ser.xs, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 'shown in %');
  const y = ser.ys[0];
  assert.ok(Math.abs(y[6] - slide.fp.hvpg) < 0.15, `the point at 60 % is the slide: ${y[6]} vs ${slide.fp.hvpg}`);   // (a tenth: as above)
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
  assert.deepEqual(cutsOf('bv'), [{ v: 4.5, rate: 'hi' }], 'a low volume is the one cut-off; a high one is gray information');
  const xt = xTicks(6, 12, 7);
  assert.ok(xt[0] === 6 && xt.at(-1) === 12 && xt.length <= 7);
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
  // (With inside, no spot ever leaves the drawing, even when every spot in it costs more than leaving would.)
  const inside = [0, 0, 200, 100];
  for (const [x, anchor] of [[190, 'start'], [215, 'start'], [5, 'end'], [-20, 'middle']]) {
    const v = placeWord([{ x, y: 35, anchor }], 40, 12, { lines: [{ ...cut, w: 5, side: 70 }], bounds: [20, 0, 180, 100], inside });
    assert.ok(v.box[0] >= 0 && v.box[2] <= 200, `${x} ${anchor}: ${v.box[0]}–${v.box[2]} inside 0–200`);
  }
  const top = placeWord([{ x: 100, y: 2, anchor: 'start' }, { x: 100, y: 120, anchor: 'start' }], 40, 12, { inside });
  assert.ok(top.box[1] >= 0 && top.box[3] <= 100, 'inside from top to bottom too');
  const w = placeWord([{ x: 195, y: 35, anchor: 'start' }, { x: 150, y: 35, anchor: 'end' }], 40, 12, { boxes: [[160, 20, 200, 40]], inside });
  assert.equal(w.anchor, 'end', 'a spot slid back onto something loses to a clear one');
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
