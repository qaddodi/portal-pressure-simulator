// The change from healthy (tool-shift.js, Mohammad's pick 16 Nov 2026): one chart that holds across the Circulation in cirrhosis talk, each state
// against the healthy patient. These are its pure parts: the talk's states and their names, the curve that never passes a state's own value,
// the axis that always holds 100%, the right column that never overlaps, the card kept from slide to slide, and the model's readings it plots
// moving the way each slide says.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { shiftStages, stageVals, rowVals, movedFrom, topScale, monotone, thin, spread, SHIFT_KEYS, SHIFT_TOP, SHIFT_LOW, shiftTrail } = await import('../src/ui/tool-shift.js');
const { HYPERDYNAMIC } = await import('../src/ui/decks/hyperdynamic.js');
const { keepData, dataPlan, carries, eases } = await import('../src/ui/card-keep.js');
const { Engine } = await import('../src/engine/portal/engine.js');
const { computeMetrics } = await import('../src/engine/portal/metrics.js');
const { fingerprintOf } = await import('../src/engine/portal/fingerprint.js');
const { trailOf } = await import('../src/ui/slide-ext.js');

const slides = HYPERDYNAMIC.slides;
// (the deck's state of each slide: a slide that changes the model has its own, the rest keep the one before)
const changes = (s) => !!(s.preset || s.params || s.action || s.days || s.ramp);
const stateOf = []; slides.forEach((s, j) => stateOf.push(j === 0 || changes(s) ? j : stateOf[j - 1]));

test('the talk\'s states, in order: healthy, the year\'s first and last day, the new patient, the bleed and the units', () => {
  const st = shiftStages(slides, stateOf);
  assert.deepEqual(st.map((s) => s.name), ['Healthy', 'Compensated', 'Large varices', 'Decompensated', '1 L loss', 'Eight units']);
  assert.deepEqual(st.map((s) => slides[s.j].id), ['rest', 'dilate', 'dilate', 'full', 'loss', 'over']);
  assert.equal(st[1].start, true, 'the time-lapse\'s first day is a state of its own');
  // (the slides that teach on the same state add none: resist, volume and forward)
  assert.ok(['resist', 'volume', 'forward'].every((id) => !st.some((s) => slides[s.j].id === id)));
});

test('the chart is the data card of slides 1 to 8 and holds across them: one tool, the heart rate and blood pressure tiles', () => {
  const on = slides.filter((s) => s.tool?.kind === 'shift');
  assert.deepEqual(on.map((s) => s.id), ['rest', 'dilate', 'resist', 'volume', 'forward', 'full', 'loss', 'over']);
  for (const s of on) { assert.deepEqual(s.tiles.slice(0, 2), ['hr', 'map'], `${s.id}: its tiles`); assert.ok(!s.tool.lines, 'no options of its own'); }
  for (const s of on) for (const k of [].concat(s.key || [])) assert.ok(SHIFT_KEYS.includes(k) || s.tiles.includes(k), `${s.id}: key ${k} is a line or a tile`);
  // (the same plan, so the presenter keeps the card; a change of patient and the time-lapse keep it too)
  const plan = (s) => dataPlan(s, { keys: s.tiles, ref: !!s.delta });
  const [rest, dilate, resist, volume, forward] = on;
  assert.ok(carries(rest.tool) && eases(rest.tool));
  assert.equal(keepData({ from: plan(rest), to: plan(dilate), prev: rest, next: dilate, swap: true }), true, 'into the year');
  assert.equal(keepData({ from: plan(dilate), to: plan(resist), prev: dilate, next: resist }), true, 'out of the year');
  assert.equal(keepData({ from: plan(resist), to: plan(volume), prev: resist, next: volume }), true);
  assert.equal(keepData({ from: plan(volume), to: plan(forward), prev: volume, next: forward }), true);
});

test('the time-lapse slide keeps every reading the chart draws, day by day; no other slide asks for a trail', () => {
  const dilate = slides.find((s) => s.id === 'dilate');
  assert.deepEqual(shiftTrail(dilate), SHIFT_KEYS);
  assert.deepEqual(trailOf(dilate), SHIFT_KEYS, 'through the package registry, as the presenter asks');
  assert.equal(trailOf(slides.find((s) => s.id === 'resist')), false);
});

test('a time-lapse\'s first day is its trail\'s first row; a state with a reading missing is not drawn', () => {
  const row = [0, ...SHIFT_KEYS.map((k, i) => i + 1)];
  assert.deepEqual(stageVals({ start: true }, { trail: [row], fp: {} }), rowVals(row));
  const fp = Object.fromEntries(SHIFT_KEYS.map((k) => [k, 2]));
  assert.deepEqual(stageVals({ start: false }, { fp }), fp);
  assert.equal(stageVals({ start: false }, { fp: { ...fp, spl: undefined } }), null);
  assert.equal(stageVals({ start: false }, null), null);
  assert.equal(movedFrom(fp, { ...fp }), false);
  assert.equal(movedFrom(fp, { ...fp, pv: 2.2 }), true);
});

test('the curve through the states is smooth and never passes a state\'s own value (no overshoot, no zigzag)', () => {
  const xs = [0, 10, 20, 30, 40, 50], ys = [100, 101, 132, 134, 85, 147];
  const segs = monotone(xs, ys, 12);
  assert.equal(segs.length, xs.length - 1);
  segs.forEach((pts, i) => {
    const lo = Math.min(ys[i], ys[i + 1]) - 1e-9, hi = Math.max(ys[i], ys[i + 1]) + 1e-9;
    for (const [, y] of pts) assert.ok(y >= lo && y <= hi, `stretch ${i}: ${y} inside ${lo}..${hi}`);
    // (each stretch runs one way only)
    const dir = Math.sign(ys[i + 1] - ys[i]);
    for (let q = 1; q < pts.length; q++) assert.ok(Math.sign(pts[q][1] - pts[q - 1][1]) * dir >= 0, `stretch ${i} turns back`);
    assert.deepEqual(pts[0], [xs[i], ys[i]]); assert.ok(Math.abs(pts.at(-1)[1] - ys[i + 1]) < 1e-9);
  });
});

test('the upper axis always holds 100% and every value; the right column\'s names never touch', () => {
  for (const vs of [[61, 147, 76, 132], [99, 101], [40, 300]]) {
    const sc = topScale(vs);
    assert.ok(sc.ticks.includes(100), `${vs}: 100 is a tick`);
    assert.ok(sc.min <= Math.min(...vs) && sc.max >= Math.max(...vs));
  }
  const at = spread([50, 51, 52, 120], 14, 10, 130);
  const ord = [...at].sort((a, b) => a - b);
  for (let i = 1; i < ord.length; i++) assert.ok(ord[i] - ord[i - 1] >= 14 - 1e-9);
  assert.ok(ord.at(-1) <= 130 && ord[0] >= 10);
  assert.equal(thin(Array.from({ length: 366 }, (_, d) => [d]), 60).length, 60);
});

test('the model moves each line the way its slide says (the chart plots the splanchnic inflow, not the portal vein flow, which falls)', () => {
  const read = (e) => fingerprintOf(computeMetrics(e));
  const load = (id) => { const e = new Engine(); const g = e.loadPresetSteps ? e.loadPresetSteps(id) : e.loadPreset(id); if (g?.next) for (let n = g.next(); !n.done; n = g.next()); e.settle(); return e; };
  const h = read(load('healthy')), e = load('cirr-decomp'), d = read(e);
  for (const k of SHIFT_KEYS) assert.ok(Number.isFinite(h[k]) && Number.isFinite(d[k]), `${k} is a reading`);
  assert.ok(d.co > h.co * 1.15, 'the cardiac output rises');
  assert.ok(d.map < h.map, 'the MAP falls');
  assert.ok(h.svr / d.svr > d.co / h.co, 'the SVR falls by more than the output rises');
  assert.ok(d.bv > h.bv, 'the blood volume rises');
  assert.ok(d.spl > h.spl * 1.15, 'the splanchnic inflow rises');
  assert.ok(d.pvFlow < h.pvFlow, '(and the portal vein flow falls: the reason the chart does not plot it)');
  assert.ok(d.pv > h.pv * 2, 'the portal pressure rises');
  e.hemorrhage(1000); e.settle(); const l = read(e);
  assert.ok(l.pv < d.pv && l.map < d.map && l.spl < d.spl && l.bv < d.bv, 'a 1 L loss lowers the portal and arterial pressures, the inflow and the volume');
  for (let i = 0; i < 8; i++) e.infuse('prbc');
  e.settle(); const o = read(e);
  assert.ok(o.pv > d.pv, 'eight units take the portal pressure above the prebleed value');
  assert.ok(o.bv > d.bv, 'and the volume above it');
  // (the lower panel's two lines and the upper panel's four are the chart's whole set)
  assert.deepEqual([...SHIFT_TOP, ...SHIFT_LOW], SHIFT_KEYS);
});
