import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { flowTimeSeries } from '../src/ui/flow-time.js';
import { CIRCULATION } from '../src/ui/decks/circulation.js';

// The Circulation deck's meal slide, run off screen as the presenter does: its trail is the model's pressure and flow each day.
async function mealTrail() {
  const meal = CIRCULATION.slides.find((s) => s.id === 'flow');
  const msgs = [], core = createCore((m) => msgs.push(m));
  core.handle({ type: 'init' });
  core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'healthy' }, { days: meal.days, ramp: meal.ramp, fine: true, trail: true }] });
  for (let t = 0; !msgs.some((m) => m.type === 'sequence') && t < 1500; t++) await new Promise((r) => setTimeout(r, 20));
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

  const s = flowTimeSeries(tr);
  assert.equal(s.t[0], 0); assert.equal(s.t.at(-1), 1);
  assert.deepEqual(s.pv, tr.map((r) => r[1])); assert.deepEqual(s.flow, tr.map((r) => r[2]));
  for (const [v, sc] of [[s.pv, s.pScale], [s.flow, s.fScale]]) {
    assert.equal(sc.ticks.length, 5); assert.equal(sc.ticks[0], 0); assert.equal(sc.ticks[4], sc.max);
    assert.ok(Math.max(...v) < sc.max && v[0] / sc.max > 0.3 && v[0] / sc.max <= 0.5, 'starts near halfway, peaks under the top');
  }
});

test('a flow-time series needs two finite points', () => {
  assert.equal(flowTimeSeries(null), null);
  assert.equal(flowTimeSeries([[0, 8, 1.1]]), null);
  assert.equal(flowTimeSeries([[0, 8, 1.1], [1, NaN, 1.2]]), null);
});
