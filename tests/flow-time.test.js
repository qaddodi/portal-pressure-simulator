import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { flowTimeSeries, MINUTES, LINE, headLeft, modelLines, trailKeys, withUnit } from '../src/ui/flow-time.js';

// The meal time-lapse the Circulation deck's meal slide used to carry (the deck rebuild moved the meal to Circuit, which has no chart), run off
// screen as the presenter does: its trail is the model's pressure and flow each day. The chart's own settings stay tested here.
async function mealTrail() {
  const meal = { id: 'flow', days: 8, ramp: { meal: [0, 1] }, tool: { kind: 'flowtime' } };
  const msgs = [], core = createCore((m) => msgs.push(m));
  core.handle({ type: 'init' });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'healthy' }, { days: meal.days, ramp: meal.ramp, fine: true, trail: true }] });   // (settles once the sequence has run)
  assert.ok(msgs.some((m) => m.type === 'sequence'), 'the sequence finished');
  core.dispose();
  const steps = msgs.filter((m) => m.type === 'seqStep');
  return { meal, before: steps[0], after: steps[1] };
}

test('the meal slide charts portal pressure and flow over its time-lapse', async () => {
  const { meal, before, after } = await mealTrail();
  assert.equal(meal.tool?.kind, 'flowtime');
  assert.equal(before.trail, null, 'only a flow-time slide keeps a trail');
  const tr = after.trail;
  assert.equal(tr.length, meal.days + 1, 'one point a day, fasting included');
  assert.deepEqual(tr.map((r) => r[0]), Array.from({ length: meal.days + 1 }, (_, d) => d));
  // Starts at the fasting state, ends at the slide's own numbers.
  assert.ok(Math.abs(tr[0][1] - before.fp.pv) < 0.05 && Math.abs(tr[0][2] - before.fp.pvFlow) < 0.01);
  assert.ok(Math.abs(tr.at(-1)[1] - after.fp.pv) < 1e-9 && Math.abs(tr.at(-1)[2] - after.fp.pvFlow) < 1e-9);
  // Flow rises a lot, pressure a little, both steadily.
  for (let d = 1; d < tr.length; d++) assert.ok(tr[d][1] >= tr[d - 1][1] && tr[d][2] >= tr[d - 1][2], `day ${d} rises`);
  const dp = tr.at(-1)[1] / tr[0][1] - 1, dq = tr.at(-1)[2] / tr[0][2] - 1;
  assert.ok(dq > 0.15 && dp > 0 && dp < 1.5 / tr[0][1] && dq > 2 * dp, `flow +${(dq * 100).toFixed(0)}%, pressure +${(dp * 100).toFixed(0)}%`);

  // On the teaching clock: flat while fasting, the model's days spread over the rise, the end held; one point a minute.
  const s = flowTimeSeries(tr);
  assert.equal(s.min[0], MINUTES.from); assert.equal(s.min.at(-1), MINUTES.end); assert.equal(s.min.length, MINUTES.end - MINUTES.from + 1);
  const ix = (m) => s.min.indexOf(m);
  for (let m = MINUTES.from; m <= 0; m++) assert.equal(s.pv[ix(m)], tr[0][1]), assert.equal(s.flow[ix(m)], tr[0][2]);
  for (let m = MINUTES.rise; m <= MINUTES.end; m++) assert.equal(s.pv[ix(m)], tr.at(-1)[1]), assert.equal(s.flow[ix(m)], tr.at(-1)[2]);
  // Each model day lands on its own minute, exactly.
  tr.forEach((r, d) => { const m = MINUTES.rise * d / meal.days; if (Number.isInteger(m)) assert.ok(Math.abs(s.flow[ix(m)] - r[2]) < 1e-9); });
  // Scales: pressure from zero (its rise stays small), flow tight (its rise fills most of its band), all values inside.
  assert.equal(s.pScale.min, 0);
  assert.ok(Math.max(...s.pv) <= s.pScale.max && (tr.at(-1)[1] - tr[0][1]) / s.pScale.max < 0.15);
  assert.ok(s.fScale.min <= Math.min(...s.flow) && Math.max(...s.flow) <= s.fScale.max);
  assert.ok((tr.at(-1)[2] - tr[0][2]) / (s.fScale.max - s.fScale.min) > 0.5, 'the flow rise fills most of its band');
});

test('a flow-time series needs two finite points', () => {
  assert.equal(flowTimeSeries(null), null);
  assert.equal(flowTimeSeries([[0, 8, 1.1]]), null);
  assert.equal(flowTimeSeries([[0, 8, 1.1], [1, NaN, 1.2]]), null);
});

// Every time-lapse slide whose card carries a chart plots the lapse day by day (flow-time.js), never the talk trace's
// one point a slide, and the disease lapses plot two of the card's own tiles.
test('time-lapse charts plot every day of the lapse', async () => {
  const { readdirSync } = await import('node:fs');
  const decks = await Promise.all(readdirSync(new URL('../src/ui/decks/', import.meta.url)).map((f) => import(`../src/ui/decks/${f}`)));
  const slides = decks.flatMap((m) => Object.values(m)).filter((d) => d?.slides).flatMap((d) => d.slides.map((s) => ({ d: d.id, s })));
  const charted = slides.filter(({ s }) => s.lapse && s.tool && (s.tool.kind === 'flowtime' || (s.tool.kind === 'trace' && s.tool.range !== 'beats')));
  assert.ok(charted.length >= 2);   // (3 before the deck rebuild: the Circulation meal slide and the old Ascites time-lapse were cut, the plan's phases F1 and F5)
  for (const { d, s } of charted) {
    assert.equal(s.tool.kind, 'flowtime', `${d} ${s.id}: a time-lapse chart`);
    for (const k of s.tool.lines || []) assert.ok(LINE[k], `${d} ${s.id}: ${k} has a line`);
    // (A line the slide gives, weight lost, has no tile: the model has no number for it.)
    if (s.tool.clock === 'days') assert.ok(modelLines(s.tool.lines).every((k) => (s.tiles || []).includes(k)), `${d} ${s.id}: plots its card's tiles`);
  }
  // Each charted lapse run as the presenter runs its deck: the trail holds one point a day, fasting or day 0 included.
  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  for (const deck of new Set(charted.map(({ d }) => d))) {
    const dk = decks.flatMap((m) => Object.values(m)).find((x) => x?.slides && x.id === deck);
    const steps = dk.slides.map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' && trailKeys(s.tool) } : {}));
    const trails = [], core = createCore((m) => { if (m.type === 'seqStep') trails[m.i] = m.trail; });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', reqId: 1, steps });
    core.dispose();
    for (const { d, s } of charted.filter((c) => c.d === deck)) {
      const tr = trails[dk.slides.indexOf(s)];
      assert.ok(Array.isArray(tr), `${d} ${s.id}: the lapse kept a trail`);
      assert.equal(tr.length, s.days + 1, `${d} ${s.id}: one point a day`);
    }
  }
});

test('the ascites time-lapse charts sinusoids and ascites, one point a day', async () => {
  // (The Ascites deck's time-lapse as it was before it took up the fluid card, 20 Oct: the chart's own settings.)
  const s = { days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, tool: { lines: ['sin', 'asc'] } }, msgs = [], core = createCore((m) => msgs.push(m));
  core.handle({ type: 'init' });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'csph' }, { days: s.days, ramp: s.ramp, fine: true, trail: s.tool.lines }] });   // (settles once the sequence has run)
  assert.ok(msgs.some((m) => m.type === 'sequence'), 'the sequence finished');
  core.dispose();
  const after = msgs.filter((m) => m.type === 'seqStep')[1], tr = after.trail;
  assert.equal(tr.length, s.days + 1);
  assert.ok(Math.abs(tr.at(-1)[1] - after.fp.sin) < 1e-9 && Math.abs(tr.at(-1)[2] - after.fp.asc) < 1e-9);
  const ser = flowTimeSeries(tr, 'days', s.tool.lines);
  assert.equal(ser.min.length, s.days + 1); assert.equal(ser.pScale.min, 0);
  assert.ok(Math.abs(ser.flow.at(-1) - after.fp.asc / 1000) < 1e-9, 'ascites in litres');
  assert.ok(ser.flow.at(-1) > ser.flow[0] && ser.pv.at(-1) > ser.pv[0], 'both rise');
});

test('the chart prints portal flow as the figure does, to one decimal (review #55: Circulation 10 read 1.4 beside 1.41)', () => {
  // (The figure's flow callouts use util.js fmtFlow: one decimal.)
  assert.equal(LINE.pvFlow[2], 1);
});

test("a line's value at its head keeps clear of the right margin's numbers", () => {
  // (Encephalopathy slide 6 on an iPhone: the ascites ended at 1.2 L just under its scale's top number, and the value, drawn
  // right of its head, ran onto that number.) f = 12 px type, a 300 px chart, the plot's right edge at 250.
  const f = 12, w = 300, R = 250, tick = (y) => [R + 6, R + 6 + 3 * 0.56 * f, y - 0.45 * f, y + 0.55 * f];
  assert.equal(headLeft(R, 40, 30, f, w, [tick(30)]), true, 'over the top number: the value goes left of its head');
  assert.equal(headLeft(R, 40, 30, f, w, [tick(80)]), false, 'clear of every number: it stays right');
  assert.equal(headLeft(R, 40, 30, f, w, []), false);
  assert.equal(headLeft(w - 10, 40, 30, f, w, []), true, 'off the chart: left, as before');
  assert.equal(headLeft(100, 40, 30, f, w, [tick(30)]), false, 'mid-chart, far from the margin');
});

// The Treating the cause deck's MASLD slide charts weight lost (left, %) against the stiffness (right, kPa) over its year. The
// stiffness is the model's; the weight is the slide's own 12%, which the model has no body for. Baveno VIII 2.13 links a weight
// loss of 10% or more with a fall in stiffness of 30% or more in MASLD-related cACLD, so the model's fall has to be that big.
test('the MASLD slide charts the weight lost and the model\'s stiffness over the year (Baveno VIII 2.13)', async () => {
  const { CAUSE_TREATED } = await import('../src/ui/decks/cause-treated.js');
  const slide = CAUSE_TREATED.slides.find((x) => x.id === 'masld'), t = slide.tool;
  assert.equal(t.kind, 'flowtime'); assert.equal(t.clock, 'days'); assert.deepEqual(t.lines, ['wt', 'lsm']);
  assert.deepEqual(modelLines(t.lines), ['lsm'], 'only the stiffness is the model\'s');
  assert.deepEqual(trailKeys(t), ['lsm'], 'the worker keeps the stiffness alone');
  assert.deepEqual(trailKeys({ kind: 'flowtime' }), true, 'a chart with no lines keeps the meal\'s');
  // Every number agrees: the chart's weight is the one in the slide's title, and is the 10% Baveno VIII names or more.
  assert.equal(t.given.wt, +slide.title.match(/(\d+)%/)[1]);
  assert.ok(t.given.wt >= 10);
  assert.ok(slide.tiles.includes('lsm'), 'the stiffness tile still stands on a phone');

  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  const steps = CAUSE_TREATED.slides.map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' && trailKeys(s.tool) } : {}));
  const seq = [], core = createCore((m) => { if (m.type === 'seqStep') seq[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', reqId: 1, steps });
  core.dispose();
  const step = seq[CAUSE_TREATED.slides.indexOf(slide)], tr = step.trail;
  assert.equal(tr.length, slide.days + 1);
  assert.ok(tr.every((r) => r.length === 2 && Number.isFinite(r[1])), 'a day and the stiffness');
  assert.ok(Math.abs(tr.at(-1)[1] - step.fp.lsm) < 1e-9, 'it ends on the slide\'s own stiffness');

  const ser = flowTimeSeries(tr, 'days', t.lines, t.given);
  assert.equal(ser.min.length, slide.days + 1);
  assert.equal(ser.pv[0], 0); assert.equal(ser.pv.at(-1), t.given.wt);
  for (let d = 1; d < ser.pv.length; d++) assert.ok(ser.pv[d] > ser.pv[d - 1], `day ${d}: the weight lost only grows`);
  assert.ok(Math.abs(ser.pv[73] - t.given.wt / 5) < 1e-9, 'steadily: a fifth of the weight a fifth of the way through the year');
  assert.deepEqual(ser.flow, tr.map((r) => r[1]), 'the stiffness is the model\'s, one value a day');
  const fall = 1 - ser.flow.at(-1) / ser.flow[0];
  assert.ok(fall >= 0.3, `the stiffness falls ${(fall * 100).toFixed(0)}%, the 30% Baveno VIII 2.13 links with a 10% weight loss`);
  // Scales: the weight from zero in fives, the stiffness tight with room above and below its line.
  assert.deepEqual(ser.pScale.ticks, [0, 5, 10, 15]);
  assert.ok(ser.fScale.min < Math.min(...ser.flow) && Math.max(...ser.flow) < ser.fScale.max);
  const room = (Math.min(...ser.flow) - ser.fScale.min) / (ser.fScale.max - ser.fScale.min);
  assert.ok(room > 0.1, `the end of the line keeps ${(room * 100).toFixed(0)}% of its band clear of the axis`);
});

test('a given line needs its number, and the other charts keep their scales', () => {
  const tr = [[0, 15], [1, 14], [2, 12]];
  assert.equal(flowTimeSeries(tr, 'days', ['wt', 'lsm']), null, 'no end value given: no chart');
  assert.ok(flowTimeSeries(tr, 'days', ['wt', 'lsm'], { wt: 12 }));
  // (Pad and parts are options of the two new lines only: the ascites chart's scales are as they were.)
  const asc = flowTimeSeries([[0, 8, 200], [60, 12, 1200]], 'days', ['sin', 'asc']);   // (the ascites in mL, drawn in litres)
  assert.deepEqual(asc.pScale.ticks, [0, 10, 20]);
  assert.equal(asc.fScale.min, 0); assert.ok(asc.fScale.max >= 1.2);
  assert.equal(withUnit(12, 0, '%'), '12%'); assert.equal(withUnit(10.23, 1, 'kPa'), '10.2 kPa'); assert.equal(withUnit(5.4, 1, 'mmHg'), '5.4 mmHg');
});
