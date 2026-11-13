// Systolic and diastolic pressure from the beat (docs/recommendations/systolic-diastolic-pressure.md, built 11 Nov 2026; Mohammad: "Sys/Dia (MAP)
// is usually how clinically we write it, so like 120/80 (93)"). The heart ejects the stroke volume it filled over the last beat in systole,
// through the lungs' store; the arteries are a Windkessel with a root impedance (physiology.js ARTERY). The MAP stays the true mean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { pulseOf } from '../src/engine/physiology.js';
import { bpText } from '../src/ui/vital-read.js';

const H = 0.004;
const quiet = (id, p) => { const e = new Engine(); e.loadPreset(id); if (p) e.setParams(deepMerge(e.params, p)); e.settle(); return e; };
const beat = (id, p, secs = 20) => { const e = quiet(id, p); e.beat = true; while (e.t < secs) e.step(H); return e; };
const bp = (e) => computeMetrics(e).vitals;
const say = (v) => `${v.sbp.toFixed(0)}/${v.dbp.toFixed(0)} (${v.map.toFixed(0)})`;

test('the core patients read as the bedside does, and each stage keeps the MAP it had', () => {
  const want = { healthy: [[112, 128], [72, 84], [90, 95]], 'cirr-decomp': [[105, 122], [62, 74], [79, 85]] };
  for (const [id, [s, d, m]] of Object.entries(want)) {
    const v = bp(beat(id));
    assert.ok(v.sbp >= s[0] && v.sbp <= s[1] && v.dbp >= d[0] && v.dbp <= d[1] && v.map >= m[0] && v.map <= m[1], `${id}: ${say(v)}`);
    assert.ok(Math.abs((v.sbp + 2 * v.dbp) / 3 - v.map) < 4, `${id}: the bedside formula lands near the true mean (${say(v)})`);
  }
});

test('the hyperdynamic circulation lowers the diastolic most: each stage of cirrhosis below the last', () => {
  const [h, c, s, d] = ['healthy', 'cirr-comp', 'csph', 'cirr-decomp'].map((id) => bp(beat(id)));
  assert.ok(h.dbp > c.dbp && c.dbp > s.dbp && s.dbp > d.dbp, `${say(h)}, ${say(c)}, ${say(s)}, ${say(d)}`);
});

test('quiet states read the periodic Windkessel, close to the beat they would run', () => {
  for (const id of ['healthy', 'csph', 'cirr-decomp']) {
    const q = bp(quiet(id)), b = bp(beat(id));
    assert.ok(Math.abs(q.sbp - b.sbp) < 7 && Math.abs(q.dbp - b.dbp) < 4, `${id}: quiet ${say(q)} against beat ${say(b)}`);
  }
  const o = pulseOf(93, 83, 60, 1.8, 0.9, 0.05);
  assert.ok(o.sbp > 93 && o.dbp < 93, 'a stroke lifts the systolic above the mean and the diastolic falls below it');
  assert.deepEqual(pulseOf(80, 0, 60, 1.8, 0.9), { sbp: 80, dbp: 80 }, 'no stroke, no pulse');
});

test('a breath swings the systolic by less than 10 mmHg in a healthy patient (the lungs damp it)', () => {
  const e = beat('healthy');
  let lo = Infinity, hi = -Infinity, last = e.phase();
  const t0 = e.t;
  while (e.t < t0 + 10) { e.step(H); const ph = e.phase(); if (ph < last && Number.isFinite(e.lv.sbp)) { lo = Math.min(lo, e.lv.sbp); hi = Math.max(hi, e.lv.sbp); } last = ph; }
  assert.ok(hi - lo < 10, `beat to beat ${lo.toFixed(0)} to ${hi.toFixed(0)} mmHg`);
});

test('drugs move the pressure through what they do to the arteries and the heart', () => {
  const none = bp(beat('cirr-decomp')), carv = bp(beat('cirr-decomp', { drugs: { carvedilol: true } })), terli = bp(beat('cirr-decomp', { drugs: { terlipressin: true } }));
  assert.ok(none.dbp - carv.dbp > none.sbp - carv.sbp - 0.5 && carv.dbp < none.dbp, `carvedilol drops the diastolic most: ${say(none)} to ${say(carv)}`);
  assert.ok(terli.dbp > none.dbp + 3 && terli.map > none.map, `terlipressin raises it: ${say(terli)}`);
});

test('a bleed narrows the pulse pressure, and the systolic falls under 90 by the time the mean nears 65', () => {
  const e = beat('cirr-decomp');
  const v0 = bp(e), pp0 = v0.sbp - v0.dbp;
  e.hemorrhage(1500);
  const t0 = e.t;
  while (e.t < t0 + 60) e.step(H);
  const v = bp(e);
  assert.ok(v.sbp - v.dbp < pp0 - 5, `pulse pressure ${pp0.toFixed(0)} to ${(v.sbp - v.dbp).toFixed(0)} mmHg (${say(v0)} to ${say(v)})`);
  if (v.map < 68) assert.ok(v.sbp < 90, `mean ${v.map.toFixed(0)} with a systolic of ${v.sbp.toFixed(0)}`);
});

test('the hepatic artery keeps a resistive index in the usual band once the aorta ejects in systole', () => {
  for (const id of ['healthy', 'cirr-decomp']) {
    const e = beat(id);
    let hi = -Infinity, lo = Infinity;
    const t0 = e.t;
    while (e.t < t0 + 4) { e.step(H); const v = e.dopplerVelocity('A_HEP'); hi = Math.max(hi, v); lo = Math.min(lo, v); }
    const ri = (hi - lo) / hi;
    assert.ok(ri > 0.5 && ri < 0.8, `${id}: RI ${ri.toFixed(2)}`);
  }
});

test('the blood the lungs and the ventricle hold is counted, and comes back in a snapshot', () => {
  const e = beat('healthy', null, 6);
  const v = e.bloodVolume(), s = e.snapshot(), r = new Engine();
  r.restore(s);
  assert.ok(Math.abs(r.bloodVolume() - v) < 1e-6, 'the same volume after a restore');
  assert.ok(Math.abs(e.lv.vp + e.lv.vv) < 150, `the store is a few beats' worth (${(e.lv.vp + e.lv.vv).toFixed(0)} mL)`);
});

test('the blood pressure is written systolic/diastolic (mean)', () => {
  assert.equal(bpText(119.6, 78.2, 92.4), '120/78 (92)');
  assert.equal(bpText(NaN, NaN, 92.4), '92');
  assert.equal(bpText(1, 1, NaN), '—');
});
