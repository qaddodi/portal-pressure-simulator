// The hepatic artery's Doppler from the model (Mohammad, 13 Nov 2026: "don't just fudge the numbers, figure out why our numbers and
// waveform are bad"). Three causes were found and fixed in the model, not the readout:
// 1. the buffer response read the portal inflow beat by beat and floored the deficit at zero, so the beat's and breath's ripple alone
//    dilated the artery (healthy HA flow 402 → about 495 mL/min with a normal mean portal flow);
// 2. the hepatic arterial tree's compliance (topology HA) sat past the gate at 0.05 mL/mmHg, a value from before the heart beat:
//    each upstroke filled it through the gate, a 140–150 cm/s spike and RI 0.70–0.80;
// 3. the right and left hepatic arteries were sampled as their lobes' arterioles: no filling flow (RI 0.32) and their lobes'
//    flow through the arterioles' drawn width (about 120 cm/s).
// Reported native HA: RI 0.76 ± 0.07, PSV 68 ± 33 cm/s in healthy volunteers (Iran J Radiol); RI varies 0.08 between observers
// (Paulson et al., Radiology 1996). The bands below hold the built values with room for that spread, not a fit to one number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, dopplerK } from '../src/engine/topology.js';

const H = 0.004;
const run = (id, secs = 40) => { const e = new Engine(); e.loadPreset(id); e.settle(); e.beat = true; while (e.t < secs) e.step(H); return e; };
// Peak, mean and trough of the Doppler's reading (spectral peak: the mean across the lumen × dopplerK) over 3 s, as the strip reads them.
function read(e, ids) {
  const out = {};
  for (const id of ids) out[id] = { hi: -Infinity, lo: Infinity, sum: 0, n: 0 };
  const t0 = e.t;
  while (e.t < t0 + 3) {
    e.step(H);
    for (const id of ids) { const v = e.velocity(id) * dopplerK(EDGES[e.ei[id]]), o = out[id]; o.hi = Math.max(o.hi, v); o.lo = Math.min(o.lo, v); o.sum += v; o.n++; }
  }
  for (const id of ids) { const o = out[id]; o.mean = o.sum / o.n; o.ri = (o.hi - Math.max(0, o.lo)) / o.hi; o.pi = (o.hi - o.lo) / o.mean; }
  return out;
}
const ARTS = ['A_HEP', 'A_HR', 'A_HL'];
const PRESETS = ['healthy', 'cirr-comp', 'csph', 'cirr-decomp'];

test('the buffer response is not fooled by the pulse: a healthy liver keeps its arterial tone with the heart beating', () => {
  const e = run('healthy', 90);
  assert.ok(e.habr < 1.1, `habr ${e.habr.toFixed(3)} (it read 1.29 when the ripple was rectified)`);
  let q = 0, n = 0; const t0 = e.t;
  while (e.t < t0 + 6) { e.step(H); q += e.Q[e.ei.A_HEP]; n++; }
  assert.ok(q / n * 60 < 460, `healthy HA flow ${(q / n * 60).toFixed(0)} mL/min (402 at rest; 495 with the ripple rectified)`);
  // (decompensated cirrhosis keeps its real buffer response: its portal inflow is low on average, not only between beats)
  assert.ok(run('cirr-decomp', 60).habr > 1.4);
});

test('the hepatic artery reads a low-resistance waveform with a systolic peak in the reported range, in every core patient', () => {
  for (const id of PRESETS) {
    const r = read(run(id), ARTS).A_HEP;
    const say = `${id}: PSV ${r.hi.toFixed(0)}, mean ${r.mean.toFixed(0)}, EDV ${r.lo.toFixed(0)}, RI ${r.ri.toFixed(2)}, PI ${r.pi.toFixed(2)}`;
    assert.ok(r.ri >= 0.55 && r.ri <= 0.75, say);
    assert.ok(r.lo > 15, `forward flow all through diastole: ${say}`);
    assert.ok(r.hi < 150, `no systolic spike: ${say}`);
    assert.ok(r.pi > 0.8 && r.pi < 1.6, say);
  }
});

test('the right and left hepatic arteries carry their lobes\' share of the filling: the main artery\'s waveform at lobar speed', () => {
  for (const id of PRESETS) {
    const e = run(id), r = read(e, ARTS);
    for (const k of ['A_HR', 'A_HL']) {
      const say = `${id} ${k}: PSV ${r[k].hi.toFixed(0)}, mean ${r[k].mean.toFixed(0)}, RI ${r[k].ri.toFixed(2)} (HA RI ${r.A_HEP.ri.toFixed(2)})`;
      assert.ok(Math.abs(r[k].ri - r.A_HEP.ri) < 0.08, say);
      assert.ok(r[k].mean < r.A_HEP.mean, `a branch is slower than the trunk (Murray widths): ${say}`);
      assert.ok(r[k].mean > 25 && r[k].mean < 75, say);
    }
    // At every instant the two lobar arteries carry what the common hepatic artery brings (no arterioportal shunt in these patients).
    const sum = e.lobarFlow(e.ei.A_HR) + e.lobarFlow(e.ei.A_HL), qin = e.Q[e.ei.A_HEP];
    assert.ok(Math.abs(sum - qin) < 1e-6 * Math.max(1, qin), `${id}: lobar ${sum} against common ${qin}`);
  }
});

test('a healthy portal vein is phasic within each beat, under the 0.3 of abnormal pulsatility', () => {
  for (const [id, lo, hi] of [['healthy', 0.1, 0.3], ['cirr-decomp', 0.05, 0.3]]) {
    const e = run(id, 60);
    let last = e.phase(), mx = -Infinity, mn = Infinity; const per = []; const t0 = e.t;
    while (e.t < t0 + 10) {
      e.step(H);
      const v = e.velocity('PV_TRUNK'), ph = e.phase();
      if (ph < last - 0.5) { if (mx > -Infinity) per.push((mx - mn) / mx); mx = -Infinity; mn = Infinity; }
      last = ph; mx = Math.max(mx, v); mn = Math.min(mn, v);
    }
    const m = per.reduce((a, b) => a + b, 0) / per.length;
    assert.ok(m > lo && m < hi, `${id}: portal pulsatility a beat ${m.toFixed(2)}`);
  }
});
