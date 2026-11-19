import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { calmed, calmTrail, calmRadius, CALM_MIN } from '../src/engine/portal/trail-calm.js';

// Mohammad, 16 Nov 2026 (the Carvedilol slide, "HVPG and LSM over two years"): "I don't like that they sometimes zigzag or step ladder ... fix at the
// root". The model's day-by-day readings are taken in quiet steps, whatever the beat's and the breath's phase is at that moment, so each carries a
// ripple that no trend has. The worker calms every time-lapse trail where it makes it, so every chart that draws one (the slides' time-lapse
// graphs, the all-patients chart) gets a smooth line, and no slide has to ask for it.
const ripple = (n, f, seed = 7) => { let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 2; return Array.from({ length: n }, (_, d) => f(d / (n - 1)) + 0.3 * rnd()); };
// The zigzag, as the eye reads it: how often the line turns around, and the biggest bend between three days.
export const turns = (a) => a.slice(2).filter((v, i) => Math.sign(v - a[i + 1]) !== Math.sign(a[i + 1] - a[i])).length;
export const bend = (a) => Math.max(...a.slice(2).map((v, i) => Math.abs(v - 2 * a[i + 1] + a[i])));

test('a calmed trail has no zigzag, keeps its first and last readings and stays on the trend, for every length of time-lapse', () => {
  for (const days of [90, 180, 365, 730]) {
    const hv = ripple(days + 1, (u) => 6.4 + 7 * u), ls = ripple(days + 1, (u) => 12.4 + 16 * u * u, 11);
    hv[0] = 6.4; hv[days] = 13.4; ls[0] = 12.4; ls[days] = 28.6;   // (the first and last readings are settled states, with no ripple)
    const rows = hv.map((v, d) => [d, v, ls[d]]), out = calmTrail(rows, 2);
    for (let c = 1; c <= 2; c++) {
      const raw = rows.map((r) => r[c]), a = out.map((r) => r[c]);
      assert.ok(turns(raw) > days / 4, 'the raw days do zigzag (the fixture)');
      assert.ok(turns(a) <= days / 20, `${days} days: ${turns(a)} turns in a calmed line, ${turns(raw)} in the raw one`);
      assert.ok(bend(a) < 0.25 * bend(raw), `${days} days: the biggest bend ${bend(a).toFixed(2)} against ${bend(raw).toFixed(2)}`);
      assert.equal(a[0], raw[0]); assert.equal(a.at(-1), raw.at(-1));
    }
    out.forEach((r, i) => assert.equal(r[0], i, 'the day is kept'));
    out.forEach((r, i) => assert.ok(Math.abs(r[1] - (6.4 + 7 * i / days)) < 0.7, `day ${i}: ${r[1]}`));
  }
});

test('calming keeps a slope straight and a corner a corner, and leaves a short trail or an explicit 0 alone', () => {
  const line = Array.from({ length: 200 }, (_, i) => 3 + 0.05 * i);
  calmed(line, 10).forEach((v, i) => assert.ok(Math.abs(v - line[i]) < 1e-6, `a straight line stays straight at ${i}`));
  const kink = Array.from({ length: 200 }, (_, i) => (i < 100 ? 0 : (i - 100) * 0.1));
  const ck = calmed(kink, 6);
  assert.ok(Math.abs(ck[150] - kink[150]) < 1e-6 && ck.every((v) => v >= -1e-6), 'no overshoot below the corner');
  const few = Array.from({ length: CALM_MIN - 1 }, (_, i) => [i, i % 2 ? 10 : 9]);
  assert.equal(calmTrail(few, 1), few, 'a meal\'s few days are as the model made them');
  const days = Array.from({ length: 61 }, (_, i) => [i, i % 2 ? 10 : 9]);
  assert.equal(calmTrail(days, 1, 0), days, 'a radius of 0 keeps the raw days');
  assert.equal(calmRadius(61), 5); assert.equal(calmRadius(731), 30);
});

// The model itself, end to end: the Carvedilol slide's own time-lapse (a cirrhosis ramp, one reading a day), through the worker.
test('the worker posts a calm trail for a fine time-lapse: the model\'s own HVPG does not zigzag, and ends on the slide\'s reading', async () => {
  const msgs = [], core = createCore((m) => msgs.push(m));
  core.handle({ type: 'init' });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'cirr-comp' }, { days: 90, ramp: { cirrhosis: [0.4, 0.68] }, fine: true, trail: ['hvpg', 'lsm'] }] });
  core.dispose();
  const step = msgs.filter((m) => m.type === 'seqStep')[1], tr = step.trail;
  assert.equal(tr.length, 91);
  const hv = tr.map((r) => r[1]), ls = tr.map((r) => r[2]);
  assert.ok(Math.abs(hv.at(-1) - step.fp.hvpg) < 1e-9 && Math.abs(ls.at(-1) - step.fp.lsm) < 1e-9, 'ends on the slide\'s own readings');
  for (const [name, a] of [['hvpg', hv], ['lsm', ls]]) assert.ok(turns(a) <= 90 / 15, `${name}: ${turns(a)} turns in 90 days`);
});
