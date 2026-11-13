// Every portosystemic shunt the model draws keeps a clear course in both views (11 Nov 2026).
// Anatomy: a natural, curved course that does not run on top of or alongside other vessels (crossing them where it has to).
// Circuit: horizontal, vertical or 45° pieces only, never on top of or along another line (crossing is fine).
// The numbers are the lengths (world units) of the course on top of / alongside others, see scripts/shunt-route-lib.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { NODE_POS, VB_ANAT, VB_CIRC, HIDDEN_NODES, CIRCUIT_TREES, route as metroRoute } from '../src/ui/anatomy.js';
import { CUSTOM_SHUNT_PATH } from '../src/ui/custom-shunt-paths.js';
import { createRouter } from '../src/ui/circuit-router.js';
import { EDGE, anatomyLines, circuitLines, judge, offAngles, sampleD } from '../scripts/shunt-route-lib.mjs';

const customs = EDGES.filter((e) => e.shunt === 'custom');
// Every other portosystemic vessel the figure draws: the collaterals and the stents and surgical shunts (the arterioportal shunts are short links
// between an artery and the portal branch beside it, by design).
const named = EDGES.filter((e) => (e.kind === 'collateral' || (e.kind === 'shunt' && e.shunt !== 'custom' && e.shunt !== 'ap'))).map((e) => e.id);
// What a drawn course may still do, with the reason: the periportal collateral is a plexus braided round the portal trunk and its artery
// (anatomy.js STRANDS); the ascending lumbar collateral is a ghost behind the liver, passing the TIPS at 25+ units.
// The two splenorenal shunts (both can be open) share their stations and fan out in the corridor between the inferior mesenteric vein and the colon.
// The TIPS now runs between the middles of the right portal and right hepatic veins (11 Nov 2026, Mohammad), through the one corridor the plate leaves there, between the ascending lumbar ghost
// (C9, x 527-532, behind the liver) and the DIPS: it passes the ghost at 15-28 units for about 115 (and the ghost the stent), and the DIPS at 5 for a few units where both leave the portal vein.
// (C8 hugs the portal vein and its artery on purpose: a cavernous transformation is a braid round the occluded trunk, 13 Nov 2026, Mohammad: "they should grow all around it".)
const ALLOW_ANAT = { C8: { on: 250, par: 90 }, C6: { on: 100, par: 100 }, S_DSR: { on: 100, par: 100 }, C9: { par: 130 }, TIPS: { par: 130 } };

test('anatomy: the named shunts and collaterals do not run on top of other vessels, and keep clear beside them', () => {
  const L = anatomyLines();
  for (const id of named) {
    const j = judge(id, L[id], L, 'anat'), a = ALLOW_ANAT[id] || {};
    assert.ok(j.on <= (a.on ?? 15), `${id} runs on top of ${JSON.stringify(j.onBy)} for ${j.on.toFixed(0)} units`);
    assert.ok(j.par <= (a.par ?? 25), `${id} runs alongside ${JSON.stringify(j.parBy)} for ${j.par.toFixed(0)} units`);
  }
});

test('anatomy: the paraumbilical vein crosses the cava low and at a clear angle, not along it', () => {
  const L = anatomyLines(), C3 = L.C3, cava = L.IVC_IS;
  let crossAt = null;
  for (let i = 1; i < C3.length; i++) if ((C3[i - 1][0] - 620) * (C3[i][0] - 620) < 0) crossAt = [C3[i], C3[i - 1]];
  assert.ok(crossAt && crossAt[0][1] > 690, 'it crosses the cava below the renal and mesocaval levels');
  const dx = crossAt[0][0] - crossAt[1][0], dy = crossAt[0][1] - crossAt[1][1];
  assert.ok(Math.abs(Math.atan2(dx, dy)) > (35 * Math.PI) / 180, 'at over 35 degrees to the cava');
  assert.ok(cava.length > 10);
});

test('anatomy: the spontaneous and the Warren splenorenal shunts, both open, are two courses that fan out from the same stations', () => {
  const L = anatomyLines(), a = L.C6, b = L.S_DSR;
  assert.deepEqual(a[0], b[0]);
  const mid = (P) => P[Math.floor(P.length / 2)];
  assert.ok(Math.hypot(mid(a)[0] - mid(b)[0], mid(a)[1] - mid(b)[1]) > 15, 'apart half way, not one on the other');
});

test('circuit: every named shunt and collateral runs horizontally, vertically or at 45° and is never on top of or along another line', () => {
  const L = circuitLines();
  for (const id of named) {
    assert.deepEqual(offAngles(L[id]), [], `${id} has a piece at another angle`);
    const j = judge(id, L[id], L, 'circ');
    assert.ok(j.on <= 15, `${id} runs on top of ${JSON.stringify(j.onBy)} for ${j.on.toFixed(0)} units`);
    assert.ok(j.par <= 15, `${id} runs along ${JSON.stringify(j.parBy)} for ${j.par.toFixed(0)} units`);
  }
});

test('circuit: the shunt lines pass no station they do not serve', () => {
  for (const [id, P] of Object.entries(circuitLines())) {
    const e = EDGE[id];
    if (!named.includes(id)) continue;
    for (const n of Object.keys(NODE_POS)) {
      if (HIDDEN_NODES.has(n) || n === e.from || n === e.to) continue;
      const [x, y] = NODE_POS[n][1];
      let m = 1e9;
      for (const p of P) m = Math.min(m, Math.hypot(p[0] - x, p[1] - y));
      // (a line may end on a station its end vessel's own node, or run through a junction it is built on)
      assert.ok(m > 8 || P.length < 2 || ['HA', 'AO'].includes(n), `${id} runs through the station ${n}`);
    }
  }
});

test('anatomy: all 119 custom shunts (92 portal-to-systemic, 27 portal-to-portal) have a smooth curved course from their portal station to their systemic one, clear of other vessels', () => {
  assert.equal(customs.length, 119);
  const L = anatomyLines();
  for (const e of customs) {
    const d = CUSTOM_SHUNT_PATH[e.id];
    assert.ok(d, `${e.id} has a course`);
    const P = sampleD(d), a = NODE_POS[e.from][0], b = NODE_POS[e.to][0];
    assert.deepEqual(P[0], a, `${e.id} starts at ${e.from}`);
    assert.ok(Math.hypot(P.at(-1)[0] - b[0], P.at(-1)[1] - b[1]) < 0.2, `${e.id} ends at ${e.to}`);
    for (const [x, y] of P) assert.ok(x > VB_ANAT[0] && x < VB_ANAT[0] + VB_ANAT[2] && y > -2 && y < VB_ANAT[3] + 2, `${e.id} stays on the plate`);
    // smooth: no turn of more than 6 degrees between pieces of 3 units, except where two curves join (a corner would show there too)
    let worst = 0;
    for (let i = 2; i < P.length; i++) {
      const ax = P[i - 1][0] - P[i - 2][0], ay = P[i - 1][1] - P[i - 2][1], bx = P[i][0] - P[i - 1][0], by = P[i][1] - P[i - 1][1];
      if (Math.hypot(ax, ay) < 1 || Math.hypot(bx, by) < 1) continue;
      worst = Math.max(worst, Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / Math.min(1, Math.hypot(bx, by) / 3));
    }
    assert.ok(worst < (14 * Math.PI) / 180, `${e.id} has a bend of ${((worst * 180) / Math.PI).toFixed(0)} degrees`);
    const j = judge(e.id, P, L, 'anat');
    assert.ok(j.on <= 30 && j.on + j.par <= 150, `${e.id}: ${j.on.toFixed(0)} units on top of ${JSON.stringify(j.onBy)}, ${j.par.toFixed(0)} alongside ${JSON.stringify(j.parBy)}`);
    assert.ok(j.total < 3.2 * Math.hypot(a[0] - b[0], a[1] - b[1]) + 120, `${e.id} is not a long detour`);
  }
});

test('circuit: every custom shunt, routed alone, is horizontal, vertical or 45° only and clear of other lines', () => {
  const lines = Object.values(circuitLines()).concat(Object.values(CIRCUIT_TREES).flatMap((l) => l.map((b) => sampleD(b.d))));
  const stations = Object.keys(NODE_POS).filter((id) => !HIDDEN_NODES.has(id)).map((id) => NODE_POS[id][1]);
  const r = createRouter({ lines, stations, bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] });
  const circ = circuitLines();
  for (const e of customs) {
    const pts = r.route(NODE_POS[e.from][1], NODE_POS[e.to][1]);
    assert.ok(pts, `${e.id} has a route`);
    const P = sampleD(metroRoute(pts, 16));
    assert.deepEqual(offAngles(P), [], `${e.id} has a piece at another angle`);
    const j = judge(e.id, P, circ, 'circ');
    // (The right to left portal vein link is a straight 84-unit drop between the two branch stations, with the two fine arterioportal links standing 20 units off it for 24 each: nowhere
    // in the corridor is clear of them, and a detour round them would run on the hilum's own branches.)
    assert.ok(j.on <= 20 && j.par <= (e.id === 'X_RPV_LPV' ? 50 : 40), `${e.id}: ${j.on.toFixed(0)} on top of ${JSON.stringify(j.onBy)}, ${j.par.toFixed(0)} along ${JSON.stringify(j.parBy)}`);
  }
});

test('every custom shunt id has its course, and no course is left over', () => {
  assert.deepEqual(Object.keys(CUSTOM_SHUNT_PATH).sort(), customs.map((e) => e.id).sort());
  assert.ok(EDGE.TIPS && EDGE.DIPS);
});
