import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { flowTimeSeries, MINUTES, LINE, headLeft } from '../src/ui/flow-time.js';
import { CIRCULATION } from '../src/ui/decks/circulation.js';

// The Circulation deck's meal slide, run off screen as the presenter does: its trail is the model's pressure and flow each day.
async function mealTrail() {
  const meal = CIRCULATION.slides.find((s) => s.id === 'flow');
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
  assert.ok(charted.length >= 3);
  for (const { d, s } of charted) {
    assert.equal(s.tool.kind, 'flowtime', `${d} ${s.id}: a time-lapse chart`);
    for (const k of s.tool.lines || []) assert.ok(LINE[k], `${d} ${s.id}: ${k} has a line`);
    if (s.tool.clock === 'days') assert.ok(s.tool.lines.every((k) => (s.tiles || []).includes(k)), `${d} ${s.id}: plots its card's tiles`);
  }
  // Each charted lapse run as the presenter runs its deck: the trail holds one point a day, fasting or day 0 included.
  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  for (const deck of new Set(charted.map(({ d }) => d))) {
    const dk = decks.flatMap((m) => Object.values(m)).find((x) => x?.slides && x.id === deck);
    const steps = dk.slides.map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' && (s.tool.lines || true) } : {}));
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
  const { ASCITES } = await import('../src/ui/decks/ascites.js');
  const s = ASCITES.slides.find((x) => x.id === 'fill'), msgs = [], core = createCore((m) => msgs.push(m));
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
