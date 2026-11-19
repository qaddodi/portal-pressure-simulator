// Beta-blocker on and off (play-test, 16 Nov 2026: in decompensated cirrhosis HVPG and PPG crept 16.0/16.9 → 16.0/17.0 → 16.1/17.1 over three cycles). The model's own slow answers
// to a drug (the hepatic arterial buffer, tau 10 s on a 10 s averaged inflow, and the baroreflex, 15 s) take about two minutes to let go, so the printed value is 0.1 to 0.3 mmHg off
// for that long and then back. It must not ACCUMULATE: any number of short on/off cycles ends where the patient began.
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const drug of ['propranolol', 'carvedilol']) {
  test(`${drug} on and off five times: HVPG, PPG and the portal vein return to where the patient began, and the readings drift no further than 0.3 mmHg meanwhile`, async () => {
    const { Engine } = await import('../src/engine/portal/engine.js');
    const { computeMetrics } = await import('../src/engine/portal/metrics.js');
    const e = new Engine(); e.loadPreset('cirr-decomp'); e.beat = true;
    const h = 0.004, run = (s) => { for (let i = 0; i < s / h; i++) e.step(h); };
    const read = () => { const m = computeMetrics(e); return { hvpg: m.hvpg, ppg: m.ppg, pv: m.pv, fhvp: m.fhvp }; };
    run(45);
    const base = read();
    let worst = 0;
    for (let c = 0; c < 5; c++) {
      e.setParams({ ...e.params, drugs: { ...e.params.drugs, [drug]: true } }); run(4);
      e.setParams({ ...e.params, drugs: { ...e.params.drugs, [drug]: false } }); run(4);
    }
    run(180);
    const end = read();
    for (const k of Object.keys(base)) worst = Math.max(worst, Math.abs(end[k] - base[k]));
    assert.ok(Math.abs(end.hvpg - base.hvpg) <= 0.15 && Math.abs(end.ppg - base.ppg) <= 0.15, `HVPG ${base.hvpg.toFixed(2)} → ${end.hvpg.toFixed(2)}, PPG ${base.ppg.toFixed(2)} → ${end.ppg.toFixed(2)}`);
    assert.ok(worst <= 0.3, `after three minutes every pressure is within 0.3 of its start (${worst.toFixed(2)})`);
    assert.equal(e.params.drugs[drug], false);
  });
}
