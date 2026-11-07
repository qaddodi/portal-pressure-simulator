// The Meso-Rex bypass (F7): a vein graft from the superior mesenteric vein to the left portal vein, past a clotted portal trunk.
// It is the one shunt that joins two portal vessels, so its blood counts as portal blood reaching the liver, never as shunted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { defaultParams, deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { EDGES, NODES, PORTOSYSTEMIC_EDGES } from '../src/engine/topology.js';
import { originFractions, ORIGIN_N } from '../src/ui/blood.js';
import { EDGE_PATH, CIRCUIT_PATH } from '../src/ui/anatomy.js';
import { GRAFTS, PROC_KINDS, specOf, procBlocked, procOffered, procFrame, stepAt, rexSuitable } from '../src/ui/proc-anim.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const M = (e) => computeMetrics(e);
const chronic = (params = {}) => { const e = new Engine(); e.loadPreset('pvt-chronic'); if (Object.keys(params).length) { e.setParams(deepMerge(e.params, params)); e.settle(); } return e; };

test('the graft is one edge from the superior mesenteric vein to the left portal vein, closed unless the parameter is on', () => {
  const e = EDGES.find((x) => x.id === 'REX');
  assert.ok(e && e.from === 'SMV' && e.to === 'LPV' && e.kind === 'shunt' && e.shunt === 'rex' && e.d === 8);
  assert.equal(defaultParams().rex, false);
  const off = chronic();
  assert.equal(off.Q[EI.REX], 0, 'no flow while it is closed');
  assert.equal(off.diameter('REX'), 0, 'not drawn while it is closed');
  assert.equal(sanitizeParams({ rex: 'yes' }).rex, true);
  assert.equal(sanitizeParams({ rex: 0 }).rex, false);
});

test('in chronic portal vein thrombosis the bypass lowers the PPG, raises the liver\'s portal inflow, keeps the HVPG normal and shunts nothing', () => {
  const before = M(chronic()), eng = chronic({ rex: true }), after = M(eng);
  assert.ok(before.ppg > 12, `PPG before ${before.ppg}`);
  assert.ok(after.ppg < before.ppg - 4, `PPG ${before.ppg} -> ${after.ppg}`);
  assert.ok(after.portalIn > before.portalIn * 1.2, `portal inflow ${before.portalIn} -> ${after.portalIn} L/min`);
  assert.ok(after.hepaticFlow > before.hepaticFlow, 'the sinusoids get more blood');
  assert.ok(before.hvpg < 5 && after.hvpg < 5, `HVPG stays normal: ${before.hvpg} -> ${after.hvpg}`);
  assert.ok(after.shuntFraction <= before.shuntFraction, `shunt fraction ${before.shuntFraction} -> ${after.shuntFraction}`);
  assert.ok(eng.Q[EI.REX] > 5, 'the graft carries the gut\'s blood');
  assert.equal(eng.diameter('REX'), 8);
  assert.ok(!PORTOSYSTEMIC_EDGES.includes('REX'), 'it is not a portosystemic route');
  assert.equal(after.collateralFlows.REX, undefined, 'and not counted among them');
});

test('over the following months the collaterals, the spleen and the platelets regress', () => {
  const e = chronic({ rex: true }), m0 = M(e);
  e.advanceDays(150);
  const m1 = M(e);
  assert.ok(m1.spleen.length < m0.spleen.length - 2, `spleen ${m0.spleen.length} -> ${m1.spleen.length} cm`);
  assert.ok(m1.spleen.platelets > m0.spleen.platelets * 1.5, `platelets ${m0.spleen.platelets} -> ${m1.spleen.platelets}`);
  assert.ok(m1.shuntFraction < M(chronic()).shuntFraction, 'the collaterals carry less');
  assert.ok(m1.ssm < M(chronic()).ssm, 'spleen stiffness falls');
  assert.ok(m1.ppg < 9, `PPG ${m1.ppg}`);
});

test('the origin lens sees the gut\'s blood re-enter the liver through the left portal vein', () => {
  const smv = (e) => originFractions(EDGES, NODES, e.Q, e.P)[EI.PRE_L * ORIGIN_N];
  const e0 = chronic(), e1 = chronic({ rex: true });
  assert.ok(smv(e1) > 0.5, `the left lobe's portal venules carry mostly mesenteric blood: ${smv(e1)}`);
  assert.ok(smv(e1) > smv(e0) + 0.1, `${smv(e0)} -> ${smv(e1)}`);
});

test('it is a play (procedure: rex): four steps, the model takes the change as the graft grows, and it is only for a clotted trunk with an open left portal vein', () => {
  const P = GRAFTS.rex;
  assert.equal(specOf('rex'), P);
  assert.ok(!PROC_KINDS.includes('rex'), 'a surgical graft is not one of the HVPG card\'s catheter buttons');
  assert.equal(P.steps.length, 4); assert.equal(P.stops.length, 4); assert.equal(P.stops.at(-1), P.T.end);
  for (let i = 1; i < P.stops.length; i++) assert.ok(P.stops[i] > P.stops[i - 1]);
  assert.ok(P.T.apply > P.stops[0] && P.T.apply < P.stops[1], 'the graft grows in step 2');
  for (let t = 0; t <= P.T.end; t += 100) { const f = procFrame('rex', t); assert.ok(f.opacity >= 0 && f.opacity <= 1); assert.equal(f.shot, ''); assert.equal(f.step, t >= P.T.end ? -1 : stepAt('rex', t)); }
  const p = chronic().params;
  assert.equal(rexSuitable(p), true); assert.equal(procOffered('rex', p), true); assert.equal(procBlocked('rex', p), '');
  const open = defaultParams();
  assert.equal(rexSuitable(open), false); assert.equal(procOffered('rex', open), false); assert.match(procBlocked('rex', open), /trunk is open/);
  const leftClot = deepMerge(p, { thrombus: { PVH_L: 1 } });
  assert.equal(rexSuitable(leftClot), false); assert.match(procBlocked('rex', leftClot), /left portal vein is clotted/);
  const done = P.apply(structuredClone(p));
  assert.ok(P.had(done) && !P.had(p) && procOffered('rex', done) && procBlocked('rex', done) !== '');
  assert.ok(!P.had(P.undo(structuredClone(done))));
  assert.ok(!P.had(deepMerge(p, P.before)), 'before is the state without the graft');
  for (const s of P.steps) assert.ok(EDGES.some((e) => e.id === s[5]), `${s[5]} is a vessel of the model`);
});

test('the figure draws it: an anatomic and a circuit course, and the graft\'s caption', () => {
  assert.match(EDGE_PATH.REX, /^M690 660 /); assert.match(EDGE_PATH.REX, /688 378$/);
  assert.ok(CIRCUIT_PATH.REX);
});
