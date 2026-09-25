// Physiological acceptance tests (blueprint §12). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, VARIX } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { defaultParams, deepMerge } from '../src/engine/scenario.js';

const fresh = () => new Engine();
const preset = (id, opts) => { const e = new Engine(); e.loadPreset(id, opts); return e; };
const M = (e) => computeMetrics(e);
const Q = (e, id) => e.Q[e.ei[id]];
const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v.toFixed(2)} not in [${lo}, ${hi}]`);
const patch = (e, p) => { e.setParams(deepMerge(e.params, p)); e.settle(); };

test('T1 healthy targets', () => {
  const m = M(fresh());
  within(m.map, 88, 98, 'MAP');
  within(m.co, 4.7, 5.3, 'CO');
  within(m.ra, 1, 5, 'RA');
  within(m.ivc, 1.5, 5.5, 'IVC');
  within(m.fhvp, 2, 6, 'FHVP');
  within(m.whvp, 5, 9, 'WHVP');
  within(m.hvpg, 1, 5, 'HVPG');
  within(m.pv, 5, 10, 'PV');
  within(m.hepaticFlow, 1.3, 1.7, 'hepatic flow');
  within(m.pvFlow, 0.95, 1.25, 'PV flow');
  within(m.arterialIn, 0.3, 0.5, 'HA flow');
  within(m.pvVel, 12, 25, 'PV velocity');
  within(m.spleen.length, 10, 13, 'spleen');
  within(m.ascites.iap, 3, 7, 'IAP');
});

test('T2 healthy: negligible collateral flow, no reversed portal edges', () => {
  const e = fresh(); const m = M(e);
  const coll = ['C1b', 'C3', 'C4', 'C5', 'C6', 'C7'].reduce((s, id) => s + Math.abs(Q(e, id)), 0);
  assert.ok(coll < 0.02 * m.pvFlow / 0.06, `collateral flow ${coll}`);
  for (const id of ['SMV_CONF', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L']) assert.ok(Q(e, id) > 0, `${id} reversed`);
});

test('T3 cirrhosis sweep: HVPG monotonic; recruitment begins near HVPG 10', () => {
  let last = -Infinity, onset = null;
  for (const s of [0, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9]) {
    const e = fresh();
    patch(e, { cirrhosis: s });
    const acute = M(e).hvpg;
    assert.ok(acute >= last - 0.05, `HVPG not monotonic at s=${s}`);
    last = acute;
    e.advanceDays(180, { noRupture: true, silent: true });
    const m = M(e);
    const recruited = (m.collateralFlows.C1b + m.collateralFlows.C3) / (m.splanchnicIn / 0.06) > 0.03;
    if (recruited && onset === null) onset = acute;
  }
  assert.ok(onset !== null, 'collaterals never recruited');
  within(onset, 9, 11.5, 'HVPG at collateral onset');
});

test('T4 presinusoidal: high PV, normal HVPG, no ascites', () => {
  const m = M(preset('schisto'));
  assert.ok(m.pv >= 18, `PV ${m.pv}`);
  assert.ok(m.hvpg <= 5, `HVPG ${m.hvpg}`);
  assert.ok(m.ascites.volume < 100, `ascites ${m.ascites.volume}`);
});

test('T5 right heart failure: high RA, WHVP; normal HVPG; pulsatile PV; high-protein ascites', () => {
  const e = preset('rhf');
  const m = M(e);
  assert.ok(m.ra >= 12, `RA ${m.ra}`);
  assert.ok(m.whvp >= 15, `WHVP ${m.whvp}`);
  assert.ok(m.hvpg <= 5, `HVPG ${m.hvpg}`);
  assert.ok(m.ascites.highProtein, 'ascites should be protein-rich');
  e.setParams({ ...e.params, pulsatile: true, respiration: false });
  for (let i = 0; i < 2000; i++) e.step(0.004);
  const pi = M(e).pvPI;
  assert.ok(pi >= 0.5, `PV pulsatility ${pi}`);
  // …and a healthy liver damps it
  const h = fresh();
  h.setParams({ ...h.params, pulsatile: true, respiration: false });
  for (let i = 0; i < 2000; i++) h.step(0.004);
  assert.ok(M(h).pvPI < 0.3, `healthy PV PI ${M(h).pvPI}`);
});

test('T6 splenic vein thrombosis: normal PV, high splenic pressure, short-gastric flow', () => {
  const e = preset('svt'); const m = M(e);
  within(m.pv, 5, 10.5, 'PV');
  assert.ok(m.sv >= 15, `SV ${m.sv}`);
  const splenicOut = Q(e, 'V_SPL') + Q(e, 'V_IMV');
  assert.ok(Q(e, 'C2') > 0.2 * splenicOut, `C2 share ${Q(e, 'C2') / splenicOut}`);
});

test('T7 decompensated cirrhosis + splenorenal shunt: splenic vein reverses', () => {
  const e = preset('cirr-decomp');
  e.params.spontaneous.C6 = true;
  e.slow.d.C6 = 10;
  e.settle();
  assert.ok(Q(e, 'SV_CONF') < 0, `SV flow ${Q(e, 'SV_CONF')}`);
});

test('T8 end-stage cirrhosis with arterioportal shunting: hepatofugal portal vein', () => {
  const e = preset('cirr-hepatofugal');
  assert.ok(Q(e, 'PV_TRUNK') < 0, `PV flow ${Q(e, 'PV_TRUNK')}`);
});

test('T9 TIPS 10 mm in HVPG ≈ 20 cirrhosis', () => {
  const e = preset('cirr-decomp');
  patch(e, { cirrhosis: 0.95 });
  const before = M(e);
  assert.ok(before.hvpg >= 17, `pre-TIPS HVPG ${before.hvpg}`);
  const raBefore = before.ra, haBefore = before.arterialIn;
  patch(e, { tips: { on: true, d: 10 } });
  const m = M(e);
  assert.ok(m.ppg < 12, `PPG ${m.ppg}`);
  assert.ok(m.shuntFraction > 0.5, `shunt ${m.shuntFraction}`);
  assert.ok(Q(e, 'PVH_L') < 0 || Q(e, 'PRE_R') < 0 || Q(e, 'PRE_L') < 0, 'intrahepatic portal branch flow should reverse toward the TIPS');
  within(m.ra - raBefore, 0.5, 4, 'RA rise');
  assert.ok(m.arterialIn > haBefore, 'HABR should raise hepatic arterial flow');
});

test('T10 no variceal rupture below HVPG 12', () => {
  for (const s of [0.4, 0.5, 0.55, 0.6]) {
    const e = fresh();
    patch(e, { cirrhosis: s });
    e.advanceDays(365, { noRupture: true, silent: true });
    const m = M(e);
    if (m.hvpg < 12) assert.ok(m.varix.ratio < 1 && m.gastricVarix.ratio < 1, `s=${s} HVPG ${m.hvpg.toFixed(1)} T/Tcrit ${m.varix.ratio.toFixed(2)} / ${m.gastricVarix.ratio.toFixed(2)}`);
  }
});

test('T11 hemorrhage lowers portal pressure; over-transfusion raises it above pre-bleed', () => {
  const e = preset('csph');
  const pv0 = M(e).pv, map0 = M(e).map;
  e.hemorrhage(1500); e.settle();
  const m1 = M(e);
  assert.ok(m1.map < map0, 'MAP should fall');
  assert.ok(m1.pv < pv0, 'portal pressure should fall');
  e.addVolume(2200, 0.5); e.settle();
  assert.ok(M(e).pv > pv0, `over-transfused PV ${M(e).pv} vs ${pv0}`);
});

test('T12 BRTO of the gastrorenal shunt raises portal pressure ≥ 2 mmHg', () => {
  const e = preset('gastric-varix');
  const pv0 = M(e).pv;
  patch(e, { occluded: { C5: true } });
  assert.ok(M(e).pv - pv0 >= 2, `ΔPV ${M(e).pv - pv0}`);
});

test('T13 NSBBs lower HVPG; carvedilol more than propranolol', () => {
  const base = preset('csph');
  const h0 = M(base).hvpg;
  const snap = base.snapshot();
  patch(base, { drugs: { propranolol: true } });
  const hp = M(base).hvpg;
  base.restore(snap);
  patch(base, { drugs: { carvedilol: true } });
  const hc = M(base).hvpg;
  const dp = (h0 - hp) / h0, dc = (h0 - hc) / h0;
  within(dp, 0.1, 0.25, 'propranolol HVPG reduction');
  assert.ok(dc > dp, `carvedilol ${dc} vs propranolol ${dp}`);
});

test('T14 Budd–Chiari: caudate outflow ≥ 3× and ascites forms', () => {
  const e = preset('budd-chiari');
  assert.ok(Q(e, 'CAUD') >= 3 * e.refQ[e.ei.CAUD], 'caudate flow');
  assert.ok(M(e).ascites.volume > 500, 'ascites');
});

test('T15 large-volume paracentesis lowers IAP and variceal transmural pressure', () => {
  const e = preset('cirr-decomp');
  patch(e, { diuretics: false });
  e.advanceDays(400, { noRupture: true, silent: true });
  const m0 = M(e);
  assert.ok(m0.ascites.volume > 3500, `large ascites expected, got ${m0.ascites.volume}`);
  e.paracentesis(4000, true); e.settle();
  const m1 = M(e);
  assert.ok(m1.ascites.iap < m0.ascites.iap, 'IAP');
  assert.ok(m1.varix.ptm < m0.varix.ptm, 'variceal transmural pressure');
});

test('T16 blood volume is conserved without bleeding or infusion', () => {
  for (const pulsatile of [false, true]) {
    const e = preset('cirr-comp');
    e.setParams({ ...e.params, pulsatile });
    const v0 = e.bloodVolume();
    for (let i = 0; i < 6000; i++) e.step(0.01); // 60 s
    const drift = Math.abs(e.bloodVolume() - v0) / v0 * 100;
    assert.ok(drift < 0.01, `drift ${drift} %/min (pulsatile=${pulsatile})`);
  }
});

test('T17 determinism: same seed & actions → identical state', () => {
  const run = () => {
    const e = preset('cirr-decomp');
    e.setParams({ ...e.params, seed: 42 });
    e.rng = e.rng.constructor === Function ? e.rng : e.rng;
    for (let i = 0; i < 500; i++) e.step(0.02);
    e.advanceDays(30);
    return JSON.stringify(Array.from(e.P));
  };
  assert.equal(run(), run());
});

test('T18 stability at slider extremes', () => {
  const extremes = [
    { cirrhosis: 1 }, { splanchnicTone: 0.4 }, { splanchnicTone: 3 }, { systemicTone: 0.4 }, { systemicTone: 3 },
    { contractility: 0.2 }, { contractility: 2 }, { tr: 1 }, { pericardial: 1 }, { albumin: 1.5 },
    { apShunt: 1 }, { stenosis: { PV_TRUNK: 1 } }, { stenosis: { IVCS_RA: 0.95 } }, { tips: { on: true, d: 12 } },
    { balloonEso: true }, { respDepth: 3 },
  ];
  for (const x of extremes) {
    const e = fresh();
    e.setParams(deepMerge(defaultParams(), x));
    for (let i = 0; i < 3000; i++) e.step(0.02);
    for (const v of e.P) assert.ok(Number.isFinite(v), `NaN for ${JSON.stringify(x)}`);
    // mean mode, no respiration: late-time swing < 0.5 mmHg
    e.setParams({ ...e.params, respiration: false });
    for (let i = 0; i < 3000; i++) e.step(0.02);
    const a = Float64Array.from(e.P);
    for (let i = 0; i < 100; i++) e.step(0.02);
    const swing = Math.max(...Array.from(e.P, (v, i) => Math.abs(v - a[i])));
    assert.ok(swing < 0.5, `oscillation ${swing} for ${JSON.stringify(x)}`);
  }
});

test('Varix rupture opens a bleed that lowers MAP; balloon tamponade stops it', () => {
  const e = preset('cirr-decomp');
  e.rupture('VAR', 0.8);
  const map0 = M(e).map;
  for (let i = 0; i < 3000; i++) e.step(0.1);
  assert.ok(e.blood.lost > 100, `lost ${e.blood.lost}`);
  assert.ok(M(e).map < map0, 'MAP falls with bleeding');
  e.setParams({ ...e.params, balloonEso: true });
  for (let i = 0; i < 1500; i++) e.step(0.1);
  assert.ok(!e.bleed.active, 'balloon should stop the bleed');
});

test('Wedged catheter reads sinusoidal pressure', () => {
  const e = preset('csph');
  patch(e, { catheter: { vein: 'R', wedged: true } });
  const m = M(e);
  assert.ok(Math.abs(m.measured.whvp - m.whvp) < 0.6, `measured ${m.measured.whvp} vs estimate ${m.whvp}`);
  assert.ok(VARIX.Tcrit > 0);
});
