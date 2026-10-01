import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { displaySpeed, lanes, occupancy, advanceStream, originFractions, ORIGIN_N, createBolus, KAPPA, PERIOD, DYE_BINS, DYE_SECONDS, DYE_MAX_HOLD } from '../src/ui/blood.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

test('display speed keeps direction and ranking, compressed on a square-root scale', () => {
  assert.equal(displaySpeed(0), 0);
  assert.ok(displaySpeed(-16) < 0);
  const v = [1, 3, 5, 15, 40, 150].map(displaySpeed);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1]);
  assert.ok(Math.abs(displaySpeed(64) / displaySpeed(16) - 2) < 1e-9, '4× velocity reads as 2× speed');
});

test('laminar lanes: the centre runs at twice the mean, the outer lanes slower', () => {
  assert.deepEqual(lanes(1), [{ y: 0, k: 8 }]);
  const l3 = lanes(3);
  assert.equal(l3[1].k, 16);
  assert.ok(l3[0].k < 16 && l3[0].k === l3[2].k && l3[0].k >= 2);
});

test('parcels crossing a section per second are proportional to flow (continuity)', () => {
  const flux = (q, vd, n) => occupancy(q, vd, n) * lanes(n).reduce((a, l) => a + l.k / 8, 0) * Math.abs(vd) / 7;
  // A trunk splitting into two branches of different speed and caliber: parcels in = parcels out.
  const trunk = flux(10, 40, 4), a = flux(6, 50, 3), b = flux(4, 25, 2);
  assert.ok(Math.abs(trunk - KAPPA * 10) < 1e-9);
  assert.ok(Math.abs(trunk - (a + b)) < 1e-9);
});

test('a stream reverses smoothly, keeps a bounded phase, and holds still when paused', () => {
  const st = { seed: 3 };
  advanceStream(st, 20, 20, 0);
  const d0 = st.D;
  advanceStream(st, 20, 20, 0.1);
  assert.ok(st.D > d0);
  let reversed = false;
  for (let i = 0; i < 600; i++) { const before = st.D; advanceStream(st, -20, -20, 1 / 60); const step = ((st.D - before + PERIOD * 1.5) % PERIOD) - PERIOD / 2; assert.ok(Math.abs(step) < 2); if (step < 0) reversed = true; }
  assert.ok(reversed && st.vd < 0);
  const d1 = st.D;
  advanceStream(st, -20, -20, 0);
  assert.equal(st.D, d1);
});

test('slow flow in a large vein is stasis; in a small vein it is not', () => {
  const big = advanceStream({}, 1, 1, 10, { large: true }), small = advanceStream({}, 1, 1, 10, { large: false });
  assert.ok(big.stasis > 0.9);
  assert.equal(small.stasis, 0);
  assert.equal(advanceStream({}, 20, 20, 10).stasis, 0);
});

test('phasic display follows the instantaneous flow, amplified around the mean', () => {
  const smooth = { seed: 1 }, phasic = { seed: 1 };
  let span = [Infinity, -Infinity], spanS = [Infinity, -Infinity];
  for (let i = 0; i < 1200; i++) {
    const vNow = 15 + 3 * Math.sin(i / 60 * Math.PI * 2 / 4);
    advanceStream(smooth, 15, vNow, 1 / 60); advanceStream(phasic, 15, vNow, 1 / 60, { phasic: true });
    if (i > 600) { spanS = [Math.min(spanS[0], smooth.v), Math.max(spanS[1], smooth.v)]; span = [Math.min(span[0], phasic.v), Math.max(span[1], phasic.v)]; }
  }
  assert.ok(spanS[1] - spanS[0] < 0.01);
  assert.ok(span[1] - span[0] > 8, `phasic swing ${span[1] - span[0]}`);
});

test('origin: portal blood is SMV, IMV and splenic, the hepatic veins add hepatic arterial blood', () => {
  const e = new Engine(); e.settle();
  const f = originFractions(EDGES, NODES, e.Q, e.P);
  const at = (id) => Array.from(f.slice(EI[id] * ORIGIN_N, EI[id] * ORIGIN_N + ORIGIN_N));
  const pv = at('PV_TRUNK');
  assert.ok(Math.abs(pv[0] + pv[1] + pv[2] - 1) < 1e-4 && pv[0] > pv[1] && pv[0] > pv[2] && pv[3] === 0, `portal ${pv}`);
  assert.ok(at('SV_CONF')[2] > 0.6, 'splenic vein: splenic blood');
  assert.ok(at('V_IMV')[1] > 0.9, 'IMV: its own blood');
  const rhv = at('RHV_IVC');
  assert.ok(rhv[3] > 0.1 && rhv[0] > 0.3, `hepatic vein: portal plus hepatic arterial blood ${rhv}`);
  const ivc = at('IVCS_RA');
  assert.ok(ivc[0] + ivc[1] + ivc[2] + ivc[3] < 0.6, 'mostly systemic');
});

test('origin: with hepatofugal flow, gut blood reaches the systemic veins', () => {
  const e = new Engine(); e.loadPreset('cirr-hepatofugal');
  const f = originFractions(EDGES, NODES, e.Q, e.P);
  const azy = EI.AZY_SVC;
  assert.ok(f[azy * ORIGIN_N] + f[azy * ORIGIN_N + 1] + f[azy * ORIGIN_N + 2] > 0.05, 'portal blood in the azygos');
});

test('dye bolus: travels downstream, keeps concentration through a split, dilutes at a merge', () => {
  const e = new Engine(); e.settle();
  const net = { Q: e.Q, vd: EDGES.map(() => 40), len: EDGES.map(() => 40) };
  const b = createBolus(EDGES, NODES);
  b.inject(EI.SMV_CONF, 0);
  const field = new Float32Array(DYE_BINS);
  for (let i = 0; i < 60; i++) b.step(1 / 30, net);
  assert.ok(b.field(EI.SMV_CONF, net, field));
  assert.ok(!b.field(EI.SV_CONF, net, field), 'nothing flows upstream into the splenic vein');
  for (let i = 0; i < 15; i++) b.step(1 / 30, net);
  assert.ok(b.field(EI.PV_TRUNK, net, field), 'reached the portal vein');
  const peakPV = Math.max(...field);
  const smvShare = e.Q[EI.SMV_CONF] / (e.Q[EI.SMV_CONF] + e.Q[EI.SV_CONF] + e.Q[EI.LGV_CONF]);
  assert.ok(peakPV < 1 && peakPV > 0.5 * smvShare, `diluted at the confluence: ${peakPV}`);
  for (let i = 0; i < 45; i++) b.step(1 / 30, net);
  b.field(EI.PVH_R, net, field); const r = Math.max(...field);
  b.field(EI.PVH_L, net, field); const l = Math.max(...field);
  assert.ok(r > 0 && Math.abs(r - l) < 0.25 * r, 'same blood on both sides of the split');
  for (let i = 0; i < 2000; i++) b.step(1 / 10, net);
  assert.ok(!b.active, 'washes out');
});

test('dye injection: lasts DYE_SECONDS, a second press extends it, a hold goes on until released', () => {
  const e = new Engine(); e.settle();
  const net = { Q: e.Q, vd: EDGES.map(() => 40), len: EDGES.map(() => 40) };
  const b = createBolus(EDGES, NODES);
  b.inject(EI.SMV_CONF, 0);
  for (let i = 0; i < (DYE_SECONDS - 1) * 10; i++) b.step(1 / 10, net);
  assert.ok(b.injecting, 'still injecting before DYE_SECONDS');
  b.inject(EI.SMV_CONF, 0);
  for (let i = 0; i < 30; i++) b.step(1 / 10, net);
  assert.ok(b.injecting, 'a second press extends the injection');
  for (let i = 0; i < DYE_SECONDS * 10; i++) b.step(1 / 10, net);
  assert.ok(!b.injecting, 'and then it stops');
  b.inject(EI.SMV_CONF, 0, { hold: true });
  for (let i = 0; i < (DYE_SECONDS + 5) * 10; i++) b.step(1 / 10, net);
  assert.ok(b.injecting, 'held: goes on past DYE_SECONDS');
  b.release();
  b.step(1 / 10, net);
  assert.ok(!b.injecting, 'released after the minimum: stops');
  b.inject(EI.SMV_CONF, 0, { hold: true });
  for (let i = 0; i < (DYE_MAX_HOLD + 1) * 10; i++) b.step(1 / 10, net);
  assert.ok(!b.injecting, 'a hold never runs past DYE_MAX_HOLD');
});
