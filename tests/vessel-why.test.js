// "Why this value?" explains the thing it is asked on, and the healthy patient at rest holds still and equals its reference (16 Nov 2026, play-test).
//   1. Every vessel's Why explains that vessel's own flow and pressure (the hepatic artery's once explained the portal pressure: the panel sent every
//      vessel that was not a portal trunk or a collateral to 'pv').
//   2. The panel and the card take the id from the one place, explain-ids.js.
//   3. The Healthy reference is the model's own rest at the bedside, and the live model starts there: no climb over its first minute, and the
//      resistance in the Why line is the reference's.
//   4. The hepatic artery keeps its width on the dark looks: they give it a wall of its own, where the outline ink vanishes on the ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { explain } from '../src/engine/explain.js';
import { edgeWhy, nodeWhy, whyTarget } from '../src/engine/explain-ids.js';
import { healthyAtBedside, restingEngine } from '../src/engine/bedside-rest.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { ARTERY_WALL, readArteryWall, writeArteryWall } from '../src/ui/artery-wall.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the ids name a vessel or a compartment, and nothing else', () => {
  assert.deepEqual(whyTarget(edgeWhy('A_HEP')), { kind: 'edge', id: 'A_HEP' });
  assert.deepEqual(whyTarget(nodeWhy('HA')), { kind: 'node', id: 'HA' });
  assert.equal(whyTarget('pv'), null);
  assert.equal(explain(new Engine(), 'edge:NO_SUCH_VESSEL'), null);
  assert.equal(explain(new Engine(), 'node:NO_SUCH_NODE'), null);
});

test('every vessel\'s Why explains that vessel: its own name, its own flow and its own two pressures', () => {
  const e = new Engine();
  for (const x of EDGES.filter((v) => v.kind !== 'wedge')) {   // (the catheter's wedge pieces are no vessel anyone selects)
    const r = explain(e, edgeWhy(x.id));
    assert.ok(r, `${x.id}: no explanation`);
    assert.equal(r.label, `${x.label} flow`, x.id);
    assert.match(r.sentence, new RegExp(`^${x.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} flow is `), `${x.id}: ${r.sentence}`);
    assert.match(r.sentence, /Pressure is [\d.]+ mmHg going in and [\d.]+ mmHg coming out\.$/, x.id);
    assert.match(r.formula, /^Q = ΔP \/ R = \(/, `${x.id}: ${r.formula}`);
    assert.doesNotMatch(r.sentence, /Portal pressure/, `${x.id} must not explain the portal vein: ${r.sentence}`);
  }
});

test('the hepatic artery\'s Why is the artery\'s: its flow falls as it is narrowed, and the card says so', () => {
  const e = new Engine();
  e.params.stenosis.A_HEP = 0.7;
  e.settle();
  const r = explain(e, edgeWhy('A_HEP'));
  assert.match(r.sentence, /^Common hepatic artery flow is /);
  assert.ok(r.total < -0.01, `narrowing the artery lowers its flow: ${r.total}`);
  assert.match(r.sentence, /narrowed common hepatic artery/, r.sentence);
});

test('every compartment\'s Why is its own pressure', () => {
  const e = new Engine();
  for (const n of NODES) {
    const r = explain(e, nodeWhy(n.id));
    assert.ok(r, n.id);
    assert.equal(r.label, `${n.label} pressure`, n.id);
    assert.equal(r.unit, 'mmHg');
  }
});

test('the vessel card and its details take their Why from explain-ids.js, with no other metric picked per kind of vessel', () => {
  const det = read('src/ui/card-details.js'), act = read('src/ui/actions.js');
  assert.match(det, /onWhy\(plan\.why, /, 'the details ask the card model\'s own Why');
  assert.doesNotMatch(det, /onWhy\('/, 'the details name no metric of their own');
  const from = act.indexOf('function buildEdgeCard'), card = act.slice(from, act.indexOf('\nfunction ', from + 10));
  assert.match(card, /why: edgeWhy\(id\)/, 'the vessel card asks the vessel');
  assert.doesNotMatch(card.slice(0, card.indexOf('why: edgeWhy(id)')), /\bwhy = '/, 'no vessel kind picks a metric of its own');
});

test('a healthy patient at rest holds still from the first frame and equals its reference', () => {
  const ref = healthyAtBedside().eng, refM = computeMetrics(ref);
  const e = restingEngine();
  assert.equal(e.t, 0);
  const first = computeMetrics(e), pv = [], map = [];   // (before the first step: the first frame is the rest too)
  assert.ok(Math.abs(first.pv - computeMetrics(ref).pv) < 0.05 && Math.abs(first.map - computeMetrics(ref).map) < 0.5, 'the first reading is the rest');
  for (let s = 0; s < 60; s++) { for (let i = 0; i < 250; i++) e.step(0.004); if (s === 4 || s === 29 || s === 59) { const q = computeMetrics(e); pv.push(q.pv); map.push(q.map); } }
  assert.ok(Math.abs(pv[2] - pv[0]) < 0.06, `the portal pressure holds still: ${pv.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(map[2] - map[0]) < 0.5 && Math.abs(map[0] - first.map) < 0.5, `and the mean arterial pressure: ${first.map.toFixed(1)}, ${map.map((v) => v.toFixed(1))}`);
  const m = computeMetrics(e);
  assert.ok(Math.abs(m.pv - refM.pv) < 0.1, `Healthy ${m.pv.toFixed(2)} equals its reference ${refM.pv.toFixed(2)}`);
  assert.ok(Math.abs(m.hvpg - refM.hvpg) < 0.15 && Math.abs(m.ppg - refM.ppg) < 0.15, 'HVPG and PPG too');
  const Rof = (en) => { const P = en.Pf, Q = en.Qf, q = Q[en.ei.SIN_RR] + Q[en.ei.SIN_LL]; return (P[en.ni.CONF] - P[en.ni.RHV]) / (q * 0.06); };
  assert.ok(Math.abs(Rof(e) - Rof(ref)) < 0.1, `its resistance ${Rof(e).toFixed(2)} WU is the reference's ${Rof(ref).toFixed(2)}`);
});

test('the page opens on, resets to and loads Healthy as the bedside\'s rest, and the reference is the same state', () => {
  const w = read('src/worker-core.js');
  assert.match(w, /let eng = restingEngine\(\)/, 'the page opens on the rest');
  assert.match(w, /reset\(\) \{[^}]*eng = restingEngine\(\)/, 'Reset goes back to it');
  assert.match(w, /id === 'healthy' && days == null\) \{ const seed = eng\.params\.seed; eng = restingEngine\(\)/, 'the Healthy patient is it');
  assert.match(w, /const h = healthyAtBedside\(\)\.eng;\s*\n\s*post\(\{ type: 'healthy'/, 'and the reference is it');
});

test('the Why of a healthy patient at the bedside says nothing is above healthy, with the resistance the reference has', () => {
  const e = restingEngine();
  for (let i = 0; i < 6000; i++) e.step(0.004);
  for (const id of ['pv', 'hvpg', 'ppg', 'pvFlow', 'portalIn', 'artIn', edgeWhy('A_HEP'), edgeWhy('PV_TRUNK'), nodeWhy('HA')]) {
    const r = explain(e, id);
    assert.doesNotMatch(r.sentence, /above healthy|below healthy/, `${id}: ${r.sentence}`);
    assert.ok(Math.abs(r.total) < 0.06 * Math.max(1, Math.abs(r.base)), `${id}: ${r.current} against ${r.base}`);
  }
  const f = explain(e, 'pv').formula, ref = healthyAtBedside().eng;
  const R = (en) => { const P = en.Pf, Q = en.Qf; return (P[en.ni.CONF] - P[en.ni.RHV]) / ((Q[en.ei.SIN_RR] + Q[en.ei.SIN_LL]) * 0.06); };
  assert.match(f, new RegExp(`× ${R(e).toFixed(1)} WU = .*\\(healthy R ≈ ${R(ref).toFixed(1)} WU\\)`), f);
});

test('the dark looks give the hepatic artery a wall of its own, the light ones keep the sepia outline', () => {
  const css = read('styles/tokens.css');
  const dark = [...css.matchAll(/--artery: #E4606C;\s*\n\s*(--artery-wall-k: [^;]+;)?/g)];
  assert.ok(dark.length >= 4, `the dark looks' artery tones: ${dark.length}`);
  for (const m of dark) assert.ok(m[1], 'every dark artery colour is followed by its --artery-wall-k');
  for (const m of css.matchAll(/--artery: (#C[0-9A-F]{5}|#c[0-9a-f]{5});\s*\n\s*(--artery-wall-k)?/g)) assert.ok(!m[2], 'a light look keeps the outline ink');
  const sv = read('src/ui/stage-vessels.js');
  assert.match(sv, /x\.isArt && x\.tube && ARTERY_WALL\.k > 0 \? F_EDGE : 0/, 'the wall is drawn as the casing\'s own colour');
  assert.match(sv, /writeArteryWall\(tubeData, o \+ 24\)/, 'in texel 6 of the vessel\'s row');
  assert.match(sv, /readArteryWall\(cssNum\(cs, '--artery-wall-k', 0\), cpArtery\)/);
  readArteryWall(0, [0.9, 0.4, 0.4]);
  assert.equal(ARTERY_WALL.k, 0, 'no share, no wall: the light looks keep the outline ink');
  readArteryWall(0.5, [0.9, 0.4, 0.4]);
  const row = new Float32Array(30); writeArteryWall(row, 24);
  assert.deepEqual([...row.slice(24, 27)].map((v) => +v.toFixed(2)), [0.45, 0.2, 0.2], 'the artery\'s own colour, half as deep');
});
