// The esophageal varices drain into the azygos, never into another collateral. In Budd–Chiari the ascending lumbar
// collateral (C9) opens too; it joins the azygos trunk from the side well below the arch, so the only vein the varices'
// route (C1b) meets at the arch is the azygos itself (Mohammad, 30 Oct: "Esophageal varices connect to azygous").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, dMinOf } from '../src/engine/topology.js';
import { EDGE_PATH, NODE_POS, FEEDERS } from '../src/ui/anatomy.js';

const pts = (d) => (d.match(/-?[\d.]+/g) || []).map(Number).reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []);
// Points along a path of M / C segments.
function sample(d, n = 60) {
  const p = pts(d), out = [p[0]];
  for (let i = 1; i + 2 < p.length; i += 3) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * e[j])); }
  }
  return out;
}
const dist = (P, q) => Math.min(...P.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));
const last = (P) => P[P.length - 1];
const edge = (id) => EDGES.find((e) => e.id === id);

test('Budd–Chiari opens both the esophageal route and the ascending lumbar collateral (both are drawn)', () => {
  const e = new Engine(); e.loadPreset('budd-chiari');
  const frac = (id) => { const E = edge(id), d = e.slow.dEff?.[id] ?? e.slow.d[id]; return (d - dMinOf(E)) / (E.dMax - dMinOf(E)); };
  assert.ok(Math.abs(e.Q[e.ei.C1b]) > 0.3, 'the varices drain through C1b');
  assert.ok(frac('C9') > 0.12, 'C9 is drawn open (stage.js collOpen)');
});

test('the esophageal varices end on the azygos arch; the ascending lumbar collateral joins the trunk well below it', () => {
  assert.equal(edge('C1b').to, 'AZY');
  assert.equal(edge('C9').to, 'AZY');
  const node = NODE_POS.AZY[0], c1b = sample(EDGE_PATH.C1b), c9 = sample(EDGE_PATH.C9);
  const trunk = sample(FEEDERS.AZY_SVC.paths[0]), arch = sample(EDGE_PATH.AZY_SVC);
  assert.deepEqual(last(c1b), node, 'C1b ends at the arch node');
  assert.deepEqual(arch[0], node, 'the arch starts at that node');
  const end = last(c9);
  assert.ok(dist(trunk, end) < 0.5, `C9 ends on the azygos trunk (${end.map((v) => v.toFixed(1))})`);
  assert.ok(end[1] - node[1] > 60, 'C9 joins the trunk at least 60 units below the arch node');
  assert.ok(end[1] <= 110, 'C9 joins where the trunk is drawn solid (its fade starts at y 110)');
  assert.ok(dist(c9, node) > 60, 'no part of C9 comes near the node where the varices drain');
  assert.ok(Math.min(...c9.map((q) => dist(c1b, q))) > 60, 'C9 never touches the varices\' route');
  // C9 meets the trunk side-on over its last stretch only: it never runs in the trunk's lane.
  const L = c9.length;
  for (let i = 0; i < L - 12; i++) assert.ok(dist(trunk, c9[i]) > 4, `C9 sample ${i} runs on the trunk`);
  // and keeps clear of the epigastric vein that crosses the trunk above the join.
  assert.ok(Math.min(...c9.map((q) => dist(sample(EDGE_PATH.EPI_SVC), q))) > 15, 'C9 keeps clear of the epigastric vein');
});
