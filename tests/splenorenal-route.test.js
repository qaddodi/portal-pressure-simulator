// The splenorenal shunts (spontaneous and Warren) leave the splenic vein midway between the spleen and the IMV
// junction and join the left renal vein just below, never crossing the IMV; a Warren shunt divides the splenic
// vein between the shunt and the IMV, so the IMV still drains to the portal vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
import { EDGE_PATH, NODE_POS } from '../src/ui/anatomy.js';

const edge = (id) => EDGES.find((e) => e.id === id);
const pts = (d) => (d.match(/-?[\d.]+/g) || []).map(Number).reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []);
// Points along a path of M / C segments.
function sample(d, n = 40) {
  const p = pts(d), out = [p[0]];
  for (let i = 1; i + 2 < p.length; i += 3) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * e[j])); }
  }
  return out;
}
const dist = (P, q) => Math.min(...P.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));

test('splenorenal shunts leave the splenic vein midway and join the renal vein below, clear of the IMV', () => {
  const spl = sample(EDGE_PATH.V_SPL).concat(sample(EDGE_PATH.SV_MID)), kid = sample(EDGE_PATH.V_KID_L), imv = sample(EDGE_PATH.V_IMV);
  for (const id of ['C6', 'S_DSR']) {
    assert.equal(edge(id).from, 'SVD', `${id} leaves the mid splenic vein`);
    const P = sample(EDGE_PATH[id]), a = P[0], b = P[P.length - 1];
    assert.deepEqual(a, NODE_POS.SVD[0], `${id} starts at the mid splenic vein`);
    assert.ok(dist(spl, a) < 1 && dist(kid, b) < 8, `${id} starts on the splenic vein and ends on the renal vein`);
    assert.ok(Math.hypot(a[0] - NODE_POS.SV[0][0], a[1] - NODE_POS.SV[0][1]) > 60, `${id} starts well clear of the IMV junction`);
    assert.ok(Math.abs(b[0] - a[0]) < 10, `${id} joins the renal vein just below where it leaves`);
    assert.ok(Math.min(...P.map((q) => dist(imv, q))) > 25, `${id} never crosses the IMV`);
  }
  assert.equal(edge('V_SPL').to, 'SVD');
  assert.equal(edge('SV_MID').from, 'SVD');
  assert.equal(edge('SV_MID').to, 'SV');
  assert.equal(edge('V_IMV').to, 'SV');
});

test('splenorenal shunt flow: blood runs from the splenic vein into the renal vein; Warren keeps the IMV on the portal side', () => {
  const run = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return (id) => e.Q[e.ei[id]]; };
  const Q = run({ spontaneous: { C6: true } });
  assert.ok(Q('C6') > 0 && Q('V_KID_L') > 0 && Q('V_SPL') > 0, 'spleen → shunt → renal vein');
  const W = run({ dsrs: true });
  assert.ok(W('S_DSR') > 0, 'Warren shunt drains the spleen');
  assert.ok(Math.abs(W('SV_MID')) < 1e-6, 'splenic vein divided between the shunt and the IMV');
  assert.ok(Math.abs(W('S_DSR') - W('V_SPL')) < 0.05, 'only splenic blood takes the Warren shunt');
  assert.ok(Math.abs(W('V_IMV') - W('SV_CONF')) < 0.05, 'the IMV drains through the splenic vein to the portal vein');
});

test('Warren slide: the varices decompress while the PPG stays high and the liver keeps more portal flow than TIPS', async () => {
  const { SHUNTS } = await import('../src/ui/decks/shunts.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const sl = SHUNTS.slides.find((x) => x.id === 'dsrs');
  assert.ok(sl && sl.params.dsrs && sl.mark.edges.includes('S_DSR'), 'the shunts deck has a Warren slide');
  assert.ok(SHUNTS.slides.find((x) => x.id === 'summary').of.some((r) => r.id === 'dsrs'), 'the summary table lists it');
  const m = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return computeMetrics(e); };
  const base = m({}), w = m({ dsrs: true }), tips = m({ tips: { on: true, d: 8 } });
  assert.ok(w.varix.ratio < base.varix.ratio, 'varices decompress');
  assert.ok(w.ppg > 12 && w.ppg > tips.ppg, 'the PPG stays high');
  assert.ok(w.liverPerfPct > tips.liverPerfPct, 'more portal flow to the liver than TIPS');
});

test('the figure ties off the same vessels the engine closes for each surgical shunt', async () => {
  const fs = await import('node:fs');
  const stage = fs.readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const engine = fs.readFileSync(new URL('../src/engine/engine.js', import.meta.url), 'utf8');
  assert.match(stage, /\['S_DSR', 'SV_MID',/);
  assert.match(stage, /\['S_PC', 'PV_TRUNK',/);
  assert.match(engine, /p\.dsrs && e\.id === 'SV_MID'/);
  assert.match(engine, /p\.portocaval && e\.id === 'PV_TRUNK'/);
});
