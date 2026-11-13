import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('./dom-shim.js');   // (the chart draws on the GPU, svg-gl.js, which loads only with a page)
const { flowTimeSeries, flowGeo, startPlan, xAt, LINE } = await import('../src/ui/flow-time.js');
const { cw, dense } = await import('../src/ui/flow-time-labels.js');

// The small time graph on a time-lapse slide's teaching card (11 Nov 2026, iPad upright, Tipping point 3, "A second liver injury raises the
// HVPG and brings on ascites"): the blue "0.0 L" was cut off by the box's foot, the axis numbers "10" and "0" stood on the start rings, the
// clock's "+5" and "+10" on the lines, the right numbers on the end dots and "DAYS" on the "0". This pins the layout the chart is drawn from
// (flowGeo, startPlan): at the card's widths, every first value is wholly inside the box and clear of every ring, line, number and the other value;
// no axis number touches a ring or a head dot; the clock's numbers stand under every line.
const hit = (a, b, m = 0) => a[0] < b[1] + m && b[0] < a[1] + m && a[2] < b[3] + m && b[2] < a[3] + m;
const ringBox = ([cx, cy, r]) => [cx - r, cx + r, cy - r, cy + r];
const linesOf = (keys) => keys.map((key, j) => { const [name, unit, d, c] = LINE[key]; return j ? ['flow', 'fScale', null, c, name, unit, d] : ['pv', 'pScale', null, c, name, unit, d]; });
// A trail of [day, ...the lines' model values] one a day: from a to b over `days` (ascites in mL: the model's own unit, LINE's scale turns it to L).
const trailOf = (keys, from, to, days = 14) => Array.from({ length: days + 1 }, (_, d) => [d, ...keys.map((k, j) => (from[j] + (to[j] - from[j]) * d / days) * (LINE[k][4] === 0.001 ? 1000 : 1))]);

const CASES = [
  { name: 'tipping 3 (HVPG, ascites)', keys: ['hvpg', 'asc'], clock: 'days', trail: trailOf(['hvpg', 'asc'], [11.6, 0], [17.4, 2.6]) },
  { name: 'varices (HVPG, varix)', keys: ['hvpg', 'varix'], clock: 'days', trail: trailOf(['hvpg', 'varix'], [11.6, 3.8], [14.5, 4.6]) },
  { name: 'a falling pair', keys: ['ppg', 'asc'], clock: 'days', trail: trailOf(['ppg', 'asc'], [16, 2.6], [9, 0.2]) },
  { name: 'the meal (pressure, flow)', keys: ['pv', 'pvFlow'], clock: 'meal', trail: trailOf(['pv', 'pvFlow'], [9, 1.1], [10.4, 1.6], 8) },
  { name: 'a flat pair', keys: ['map', 'co'], clock: 'days', trail: trailOf(['map', 'co'], [80, 5], [80, 5]) },
];
// The card's widths (a phone's 330 and 390, a laptop's 780) at the type the card sets (12.6 px on the iPad) and the card's heights (142 px stacked,
// 116 px the least a wide card gives it, 104 px a phone on its side).
const SIZES = [330, 390, 780].flatMap((w) => [[12.6, 142], [12, 116], [12, 104]].map(([f, h]) => ({ w, f, h })));

function layout(c, { w, f, h }) {
  const ser = flowTimeSeries(c.trail, c.clock, c.keys), G = flowGeo(ser, c.clock, c.keys, 0, w, h, f), plan = startPlan(G, ser, linesOf(c.keys), 0);
  return { ser, G, plan };
}

test('the plot has inner padding: lines run inside its sides and above its foot, the numbers stand outside', () => {
  for (const c of CASES) for (const sz of SIZES) {
    const { ser, G, plan } = layout(c, sz), ax = ser.ax, { f } = sz;
    assert.ok(G.ix >= Math.max(4, f * 0.42) + 4, 'the lines start and end a head dot and a gap inside the sides');
    assert.ok(G.iy >= 0.5 * f, 'the lines stay a rim above the clock band');
    const x0 = xAt(G, ax, ax.from), x1 = xAt(G, ax, ax.end);
    assert.ok(x0 - G.L >= G.ix - 1e-9 && G.R - x1 >= G.ix - 1e-9, `${c.name} ${sz.w}: the first and last points are ix inside the plot`);
    for (const b of [...plan.left, ...plan.right]) for (const ring of plan.circles) assert.ok(!hit(b, ringBox(ring)), `${c.name} ${sz.w}: an axis number stands on a ring or head dot`);
    for (const b of plan.left) assert.ok(b[1] <= G.L - 6 + 1e-9 && b[0] >= 3, 'the left numbers stand in the margin, inside the box');
    for (const b of plan.right) assert.ok(b[0] >= G.R + 6 - 1e-9 && b[1] <= sz.w - 3, 'the right numbers stand in the margin, inside the box');
  }
});

test('every first value is wholly inside the box, clear of both rings, both lines, the axis numbers and the other value', () => {
  for (const c of CASES) for (const sz of SIZES) {
    const { G, plan } = layout(c, sz), pts = plan.pts.flatMap(dense), { f } = sz;
    plan.starts.forEach((s, i) => {
      const b = s.box, where = `${c.name} ${sz.w}x${sz.h} value ${i} "${s.txt}"`;
      assert.ok(Math.abs(b[1] - b[0] - cw(s.txt, f, 1)) < 1e-9, 'the box is the text\'s own width');
      assert.ok(b[0] >= 3 && b[1] <= sz.w - 3, `${where}: inside the box's sides`);
      assert.ok(b[2] >= G.keyH + 0.1 * f && b[3] <= G.B, `${where}: between the legend and the clock's band, never cut by the foot`);
      for (const ring of plan.circles) assert.ok(!hit(b, ringBox(ring)), `${where}: on a ring or head dot`);
      for (const r of plan.rects) assert.ok(!hit(b, r), `${where}: on an axis number, "Fasting" or "Meal"`);
      for (const [x, y] of pts) assert.ok(!(x > b[0] - 1.3 && x < b[1] + 1.3 && y > b[2] - 1.3 && y < b[3] + 1.3), `${where}: on a line`);
      plan.starts.slice(i + 1).forEach((o) => assert.ok(!hit(b, o.box, 2), `${where}: on the other first value`));
    });
  }
});

test('the clock\'s numbers and its unit stand in their own band under every line, off the numbers on the right', () => {
  for (const c of CASES) for (const sz of SIZES) {
    const { ser, G, plan } = layout(c, sz), { f } = sz, ax = ser.ax;
    const low = Math.max(...plan.pts.flat().map((p) => p[1]));
    const top = G.B + 1.25 * f - 0.75 * f;   // (the cap height of the numbers, drawn with their baseline 1.25 type sizes under the axis)
    assert.ok(top - low >= 0.5 * f, `${c.name} ${sz.w}x${sz.h}: the clock's numbers stand ${(top - low).toFixed(1)} px under the lowest line`);
    const unit = [xAt(G, ax, ax.end) + G.half, xAt(G, ax, ax.end) + G.half + cw(c.clock === 'meal' ? 'MIN' : 'DAYS', f, 1), G.B + 0.5 * f, G.B + 1.35 * f];
    assert.ok(unit[1] <= sz.w, `${c.name} ${sz.w}: the unit stays inside the box`);
    for (const b of plan.right) assert.ok(!hit(unit, b), `${c.name} ${sz.w}: the unit stands on a number`);
    // (the lowest gridline, and so the lowest value, is above the axis by the rim; the head and start dots clear it)
    assert.ok(G.B - G.FB[1] >= G.iy - 1e-9);
  }
});

test('the card keeps one size: the chart is laid out inside the box it is given, whatever the lines', () => {
  for (const c of CASES) for (const sz of SIZES) {
    const { G } = layout(c, sz);
    assert.equal(G.w, sz.w); assert.equal(G.h, sz.h);
    assert.ok(G.B <= sz.h - 1.7 * sz.f + 1e-9, 'the clock band keeps its 1.7 type sizes at the foot');
  }
});
