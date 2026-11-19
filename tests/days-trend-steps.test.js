// The Days trend never moves before the treatment that moves it (LOOK-2, 19 Nov 2026): the centred fit smeared a TIPS on day 180 into a fall that began on day 143
// and read 13.1 the day before the stent. A series is now cut at every change, each piece calmed alone, and the change day holds both readings, so the step is vertical.
// (#12: the post-change reading used to overwrite today's point, so even without the calm the line fell from the day before.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calmed, calmedDays, calmedPieces, recordDay } from '../src/engine/trail-calm.js';
import { treatmentKey } from '../src/engine/change-events.js';
import { defaultParams } from '../src/engine/scenario.js';

const noise = (d) => 0.25 * Math.sin(d * 2.3) + 0.15 * Math.sin(d * 0.9 + 1);   // (a quiet step's ripple, a few tenths)
/** The Days list as the chart makes it: a frame before the change and one with it on the change day, then the days after. */
function course({ n = 365, at = 180, pre = 18, post = 8, ripple = true, stepped = true } = {}) {
  const days = [];
  for (let d = 0; d < n; d++) {
    const r = ripple ? noise(d) : 0;
    if (d === at) recordDay(days, d, { hvpg: pre + r });   // (the day's reading before the treatment is given)
    recordDay(days, d, { hvpg: (d >= at ? post : pre) + r }, stepped && d === at);
  }
  return days;
}

test('a step at day 180 leaves every calmed value before it as it was read, and the change day holds both readings', () => {
  const days = course({ ripple: false }), s = calmedDays(days, 'hvpg');
  const k = s.x.findIndex((x, i) => x === 180 && i > 0 && s.x[i - 1] === 180);   // (the second point of the change day)
  assert.ok(k > 0, 'the change day has two points');
  assert.equal(s.mid[k - 1], 18, 'the last reading before the treatment');
  assert.equal(s.mid[k], 8, 'the first reading after it');
  for (let i = 0; i < k; i++) assert.ok(Math.abs(s.mid[i] - 18) < 0.05, `day ${s.x[i]} reads ${s.mid[i]}, 18 before the treatment`);
  for (let i = k; i < s.x.length; i++) assert.ok(Math.abs(s.mid[i] - 8) < 0.05, `day ${s.x[i]} reads ${s.mid[i]}, 8 after the treatment`);
});

test('with the ripple of a quiet step the pieces are still calmed, and nothing leaks across the step', () => {
  const days = course(), s = calmedDays(days, 'hvpg'), raw = days.map((d) => d.v.hvpg);
  const k = s.x.findIndex((x, i) => i > 0 && x === 180 && s.x[i - 1] === 180);
  const rough = (a, lo, hi) => { let t = 0; for (let i = lo + 1; i < hi; i++) t += Math.abs(a[i] - a[i - 1]); return t / (hi - lo - 1); };
  assert.ok(rough(s.mid, 0, k - 1) < rough(raw, 0, k - 1) / 3, 'calmer than the readings');
  for (let i = 0; i < k - 1; i++) assert.ok(Math.abs(s.mid[i] - 18) < 0.4, `day ${s.x[i]}: ${s.mid[i].toFixed(2)} before the stent`);   // (the old fit read 13.1 on day 179)
  assert.ok(Math.abs(s.mid[k - 1] - raw[k - 1]) < 1e-9 && Math.abs(s.mid[k] - raw[k]) < 1e-9, 'the two ends of the step are the readings');
  for (let i = k + 1; i < s.x.length; i++) assert.ok(Math.abs(s.mid[i] - 8) < 0.4, `day ${s.x[i]}: ${s.mid[i].toFixed(2)} after the stent`);
});

test('the old whole-series fit would have smeared it (the test sees the failure it guards)', () => {
  const days = course(), raw = days.map((d) => d.v.hvpg), smeared = calmed(raw, 30);
  assert.ok(smeared[raw.findIndex((_, i) => days[i].day === 179)] < 17, 'one fit over the whole series reads under 17 the day before the treatment');
});

test('without a change a series is calmed as before, in one piece', () => {
  const days = course({ stepped: false, pre: 12, post: 12 }), raw = days.map((d) => d.v.hvpg), s = calmedDays(days, 'hvpg');
  assert.equal(days.length, 365, 'no change: the second frame of a day overwrites the first');
  assert.deepEqual(s.mid, calmedPieces(raw, []));
  assert.deepEqual(calmedPieces(raw, []), calmed(raw, Math.max(3, Math.min(30, Math.round(raw.length / 12)))));
});

test("today's point goes on moving when nothing changed, and a change starts a point of its own on the same day", () => {
  const days = [];
  assert.equal(recordDay(days, 4, { hvpg: 10 }), true);
  assert.equal(recordDay(days, 4, { hvpg: 10.4 }), false, 'a reading on the same day only moves the point');
  assert.deepEqual(days.map((d) => d.v.hvpg), [10.4]);
  assert.equal(recordDay(days, 4, { hvpg: 7 }, true), true);
  assert.deepEqual(days.map((d) => [d.day, d.v.hvpg, !!d.start]), [[4, 10.4, false], [4, 7, true]], 'both readings of the change day, the second starting a piece');
  assert.equal(recordDay(days, 4, { hvpg: 6.8 }), false);
  assert.equal(days[1].v.hvpg, 6.8, 'the point after the change follows the model as it settles');
  assert.equal(recordDay(days, 2, { hvpg: 9 }), true);
  assert.equal(days.length, 1, 'the clock gone back starts the list over');
});

test('a change is a treatment or a procedure, not a ramp or a slider', () => {
  const p = defaultParams(), key = treatmentKey(p);
  const q = structuredClone(p); q.cirrhosis = 0.7; q.fibrosis.R.sin = 3; q.splanchnicTone = 0.8; q.albumin = 3;
  assert.equal(treatmentKey(q), key, 'cirrhosis, fibrosis, tone and albumin move continuously');
  for (const edit of [(x) => { x.drugs.carvedilol = true; }, (x) => { x.tips = { on: true, d: 8 }; }, (x) => { x.splenicRx = 2; }, (x) => { x.diuretics = true; }, (x) => { x.occluded = { C5: true }; }, (x) => { x.portocaval = true; }]) {
    const x = structuredClone(p); edit(x);
    assert.notEqual(treatmentKey(x), key);
  }
});
