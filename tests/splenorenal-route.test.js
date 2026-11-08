import { stageSource } from './stage-src.js';
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
  assert.ok(Math.abs(W('S_DSR') - W('V_SPL') - W('V_STO_SG')) < 0.05, 'the splenic blood and the stomach\'s short gastric veins take the Warren shunt');
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
  const stage = stageSource();
  const engine = fs.readFileSync(new URL('../src/engine/engine.js', import.meta.url), 'utf8');
  assert.match(stage, /\['S_DSR', 'SV_MID'\]/);
  assert.match(stage, /\['S_PC', 'PV_TRUNK'\]/);
  // The divided vein is drawn apart: its stretch at the shunt is cut away on the GPU, and the ties sit on the stump past the gap.
  assert.match(stage, /const ligatedAt = \(id\) => \{ for \(let q = 0; q < LIGATED\.length; q\+\+\) if \(LIGATED\[q\]\[1\] === id\) return true; return false; \};/);
  assert.match(stage, /ligatedAt\(id\)\) lo = Math\.max\(lo, divideLen\(id\)/);
  assert.match(stage, /function ligature\(id, shunt, at\) \{\s*const x = E\[id\], c = at != null \? geo\[id\]\.len \* at : Math\.min\(divideLen\(id\) \+ 5/);
  assert.match(engine, /p\.dsrs && e\.id === 'SV_MID'/);
  assert.match(engine, /p\.portocaval && e\.id === 'PV_TRUNK'/);
});

// Mohammad, 19 Oct: the spontaneous shunt ran alongside the descending colon, touching it, so the colon read as a huge
// outline round it, and it met the renal vein at a right angle. Both splenorenal shunts now keep clear of the colon along
// their course and ease into the renal vein heading toward the cava; the spontaneous one is never wider than the splenic vein.
test('splenorenal shunts keep clear of the descending colon and ease into the renal vein', async () => {
  const { ORGANS } = await import('../src/ui/anatomy.js');
  // (The colon's d is its three limbs, cecum to splenic flexure to rectum, as separate subpaths: the descending colon is the last.)
  const colon = sample(ORGANS.find((o) => o.id === 'colon').d.split(/(?=M)/).at(-1)).filter((p) => p[0] > 975 && p[1] > 500 && p[1] < 640);
  assert.ok(colon.length > 20, 'the descending colon runs down the left flank past the shunts');
  const kid = sample(EDGE_PATH.V_KID_L);
  for (const id of ['C6', 'S_DSR']) {
    const P = sample(EDGE_PATH[id]);
    // Centre to centre: the colon's half width (36, the folded colon of 20 Oct) and the shunt's (about 6) and a clear gap.
    for (const q of P.filter((q) => q[1] > 520)) assert.ok(dist(colon, q) > 50, `${id} at ${q.map(Math.round)} keeps clear of the colon`);
    // The last stretch heads down and toward the cava (left), as the renal vein flows, not straight down onto it.
    const [a, b] = [P[P.length - 6], P[P.length - 1]];
    assert.ok(b[0] < a[0] - 2 && b[1] > a[1], `${id} turns toward the cava as it joins`);
    const k = kid.reduce((m, p) => (Math.hypot(p[0] - b[0], p[1] - b[1]) < Math.hypot(m[0] - b[0], m[1] - b[1]) ? p : m));
    assert.ok(Math.hypot(k[0] - b[0], k[1] - b[1]) < 3, `${id} ends on the renal vein's centre line`);
  }
  const fs = await import('node:fs');
  const stage = stageSource();
  assert.match(stage, /if \(e\.id === 'C6' && mode !== 'flow' && EI\.V_SPL != null\) w = Math\.min\(w, /);
});

// Mohammad, 7 Nov: in a Warren shunt the coronary vein is tied off; it carries no flow, and the figure marks the tie.
test('Warren shunt ties off the coronary vein: no flow in it, sutures, a cross and a grey wash on it, the varices decompressed', async () => {
  const fs = await import('node:fs');
  const run = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return (id) => e.Q[e.ei[id]]; };
  const base = run({}), W = run({ dsrs: true });
  assert.ok(Math.abs(base('LGV_CONF')) > 0.5, 'the coronary vein carries blood without the shunt');
  assert.ok(Math.abs(W('LGV_CONF')) < 1e-6, 'no flow beyond the tie');
  assert.ok(Math.abs(W('C1a')) < Math.abs(base('C1a')), 'the portal pressure feeds the esophageal varices less');
  // The stomach has no way out through the tied vein, so it drains through the short gastric veins into the splenic vein (not a dead end at 30 mmHg and more).
  assert.ok(W('V_STO_SG') > 0.3, 'the stomach drains through the short gastric veins');
  assert.equal(base('V_STO_SG'), 0, 'shut without the Warren shunt');
  const pr = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return e.P[e.ni.LGV]; };
  assert.ok(pr({ dsrs: true }) < pr({}) - 5, 'the coronary vein is decompressed, not dammed up behind the tie');
  const engine = fs.readFileSync(new URL('../src/engine/engine.js', import.meta.url), 'utf8');
  assert.match(engine, /p\.dsrs && e\.id === 'LGV_CONF'/);
  // Cut off from the portal vein, the esophageal varices follow their own vein's pressure and collapse (Mohammad, 7 Nov: "do the varices go away?!").
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const vm = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return computeMetrics(e).varix; };
  assert.ok(vm({}).present && vm({}).d >= 5, 'large varices before');
  // (Real life, 8 Nov: the pressure in them falls at once, the veins shrink over months, most are small or gone by a year: the "Warren shunt varices" test below.)
  assert.ok(vm({ dsrs: true }).present, 'the varices are still there the day the coronary vein is tied');
  assert.match(engine, /this\.routeExcess\(\[p\.dsrs \? 'LGV' : 'CONF', 'RA'\], P\)/);
  const stage = stageSource();
  assert.match(stage, /ligature\('LGV_CONF', 'S_DSR', CORONARY_TIE\)/);
  assert.match(stage, /putMark\(ov\.plugs, `tieX:\$\{id\}`/, 'the plug cross is half way along the tied vein');
  assert.match(stage, /class: 'tied-off'/, 'the tied vein is greyed out');
  const { tiedOff } = await import('../src/engine/topology.js');
  assert.ok(tiedOff({ dsrs: true }, 'LGV_CONF') && tiedOff({ dsrs: true }, 'LGV') && !tiedOff({}, 'LGV_CONF') && !tiedOff({ dsrs: true }, 'SV_CONF'), 'only the tied coronary vein and its station read "—"');
  assert.match(stage, /tiedOff\(f\.viewParams \|\| st\.params, id\)/, 'the station label reads —');
  assert.match(fs.readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), /tiedOff\(store\.get\(\)\.params, info\.id\)\) \{ vals\[0\] = '—'/, 'the tooltip reads —');
  const { SHUNTS } = await import('../src/ui/decks/shunts.js');
  assert.match(SHUNTS.slides.find((x) => x.id === 'dsrs').line, /coronary vein is tied off/);
});

// Mohammad, 8 Nov: "should some varices stay after a Warren shunt? tie off the coronary vein and follow physiology, whatever happens in real life".
// Real life: the pressure in the varices falls at once (selective decompression through the short gastric veins and the spleen), the veins themselves
// shrink over weeks to months and are small or gone in most patients (83% disappeared or decreased, up to 10 years; Henderson 2006: variceal rebleeding
// 5.5% with a Warren shunt); a failed (thrombosed) shunt gives the pressure back and the varices stay or recur.
test('Warren shunt varices: slack at once, shrinking over months, back when the shunt fails', async () => {
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const fs = await import('node:fs');
  const at = (p, days) => {
    const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle();
    if (days) { e.advanceDays(days, { silent: true, noRupture: true }); e.settle(); }
    return computeMetrics(e).varix;
  };
  const base = at({}), w0 = at({ dsrs: true }), w30 = at({ dsrs: true }, 30), w90 = at({ dsrs: true }, 90), w1y = at({ dsrs: true }, 365);
  assert.ok(base.grade.label === 'Large' && base.ratio > 1, 'large varices on the verge of tearing before');
  // The day of the operation: the pressure is gone, the veins are not.
  assert.ok(w0.present && w0.d > 5.5 && w0.d < base.d, 'still large, slack under the low pressure');
  assert.ok(w0.ratio < 0.8 * base.ratio && w0.ratio < 1, 'the wall tension falls below the tear point at once');
  // Then they shrink on the disease clock: Large, then Small, then none (or nearly) within a year.
  assert.ok(w30.d < w0.d && w90.d < w30.d && w1y.d < w90.d, 'they shrink month by month');
  assert.equal(w90.grade.label, 'Small', 'small at three months');
  assert.ok(w90.present && w90.d > 2.5, 'still visible at three months');
  assert.ok(w1y.d < 2.5 && !w1y.present, 'gone, or too small to grade, at a year');
  // A shunt that has closed gives the pressure back: the varices stay large and at the tear point.
  const f90 = at({ dsrs: true, thrombus: { S_DSR: 1 } }, 90);
  assert.ok(f90.present && f90.d > 5 && f90.ratio > 1, 'a thrombosed Warren shunt leaves large varices at risk of rebleeding');
  // Taking the shunt away puts the feeder back: the pressure sizes them again at once.
  const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, { dsrs: true })); e.settle();
  e.advanceDays(30, { silent: true, noRupture: true }); e.settle();
  assert.ok(e.slow.vCut != null, 'the varices keep their size while they shrink');
  e.setParams(deepMerge(e.params, { dsrs: false })); e.settle();
  assert.equal(e.slow.vCut, null, 'no kept size once the shunt is gone');
  const engine = fs.readFileSync(new URL('../src/engine/engine.js', import.meta.url), 'utf8');
  assert.match(engine, /if \(!prev\.dsrs && p\.dsrs\) this\.slow\.vCut = this\.varixTarget\('VAR'/);
});

test('the Warren slide plays the months after the operation', async () => {
  const { SHUNTS } = await import('../src/ui/decks/shunts.js');
  const sl = SHUNTS.slides.find((x) => x.id === 'dsrs');
  assert.ok(sl.days >= 90 && sl.lapse && sl.lapse.seconds <= sl.days, 'a time-lapse of months, from the operation');
});

// Mohammad, 8 Nov: "do they usually cut the pancreatic veins in the operation?" Yes: the Warren operation includes the splenopancreatic disconnection (the
// splenic vein is freed from the pancreas and the veins between them are tied), with the coronary and gastroepiploic veins, which is what keeps the shunt selective;
// without it the pancreatic veins grow across the division and the shunt behaves like a total one within months (a 1981 angiographic series). He decided the model's
// Warren shunt always includes it. A few patients still lose selectivity late through gastric collaterals (hyperammonemia 9% at 5 years in one series): not modelled.
test('Warren shunt includes the splenopancreatic disconnection: no pancreatic collaterals, the liver keeps its portal flow for years', async () => {
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const { EDGES } = await import('../src/engine/topology.js');
  assert.ok(!EDGES.some((e) => e.from === 'SV' && e.to === 'SVD'), 'no vessel bridges the division of the splenic vein');
  const at = (days) => {
    const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, { dsrs: true })); e.settle();
    if (days) { e.advanceDays(days, { silent: true, noRupture: true }); e.settle(); }
    return { pv: e.Q[e.ei.PV_TRUNK], mid: e.Q[e.ei.SV_MID], liver: computeMetrics(e).liverPerfPct };
  };
  const w0 = at(0), w2 = at(730);
  assert.ok(Math.abs(w0.mid) < 1e-6 && Math.abs(w2.mid) < 1e-6, 'the divided splenic vein stays divided');
  assert.ok(w2.pv > 0.9 * w0.pv, 'the portal vein keeps its flow after two years');
  assert.ok(w2.liver > w0.liver - 1, 'and the liver its perfusion');
});
