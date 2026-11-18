// A TIPS that coils the coronary vein (Baveno VIII 5.41, "TIPS ± variceal embolisation"): proc-anim.js PLUGS.tipscoil, asked for by a slide as
// procedure: { kind: 'tips', target: 'C1a' }. The catheter goes the TIPS's way (neck, hepatic vein, the needle across the tract, the balloon), then on over
// the wire along the portal trunk and up the coronary vein, pushes a coil out inside it, and comes back for the stent. In the model the stent and the
// closed coronary vein (occluded.C1a) land together. On the figure's own outlines (the stage lays the same route with its radii).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROCS, PROC_KINDS, PLUGS, specOf, procKindOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';
import { procSpecs, rawRoute, COIL_B } from '../src/ui/proc-routes.js';
import { ROUTE_LEN, legMs } from '../src/ui/hvpg-clock.js';
import { lumenPath, layCoil, coilReach } from '../src/ui/eus-scope.js';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { BLEED } from '../src/ui/decks/variceal-bleed.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
await import('./dom-shim.js');   // (the graph draws on the GPU, svg-gl.js, which loads only with a page)
const { eventLines, EVENT_WORD } = await import('../src/ui/event-graph.js');

const K = 'tipscoil', P = PLUGS[K], T = P.T;
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

function poly(d) {
  const toks = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g), pts = [];
  let i = 0, cur = [0, 0], cmd = 'M';
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[MLCZ]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') { cur = [num(), num()]; pts.push(cur); }
    else { const a = [num(), num()], b = [num(), num()], c = [num(), num()]; for (let k = 1; k <= 24; k++) { const t = k / 24, s = 1 - t; pts.push([s ** 3 * cur[0] + 3 * s * s * t * a[0] + 3 * s * t * t * b[0] + t ** 3 * c[0], s ** 3 * cur[1] + 3 * s * s * t * a[1] + 3 * s * t * t * b[1] + t ** 3 * c[1]]); } cur = c; }
  }
  return pts;
}
const geo = Object.fromEntries(Object.entries(EDGE_PATH).map(([k, d]) => [k, { cur: poly(d) }]));

test('it is asked for by target, stays off the Tests buttons, and the plain TIPS is unchanged', () => {
  assert.equal(procKindOf({ kind: 'tips', target: 'C1a' }), K);
  assert.equal(procKindOf('tips'), 'tips'); assert.equal(procKindOf({ kind: 'tips' }), 'tips');
  assert.equal(procKindOf({ kind: 'tips', target: 'C9' }), 'tips:C9', 'a target it does not take names no spec');
  assert.equal(specOf(K), P); assert.ok(!PROC_KINDS.includes(K) && !PROCS[K], 'the HVPG card’s treatment buttons are the three');
  assert.deepEqual(PROCS.tips.steps.map((x) => x[0]), ['enter', 'needle', 'dilate', 'done']);
  assert.deepEqual(P.steps.map((x) => x[0]), ['enter', 'needle', 'dilate', 'coil', 'done']);
  assert.equal(P.steps.length, P.stops.length);
  assert.equal(EVENT_WORD[K], 'Stent open');
});

test('the route runs the TIPS’s way, on along the trunk to where the coronary vein joins it, and up that vein as far as COIL_B', () => {
  const S = procSpecs(geo, () => 1), r = rawRoute(S[K], geo), t = rawRoute(S.tips, geo);
  for (const n of ['hv', 'tract', 'rpv']) assert.deepEqual(r.spans[n], t.spans[n], `${n}: the TIPS’s own`);
  assert.equal(r.start, t.start);
  assert.deepEqual(Object.keys(r.spans).slice(-2), ['trunk', 'coronary']);
  // The coronary leg starts on the trunk, where the coronary vein ends (anatomy.js LGV_CONF, 2d2a752), and goes up it by COIL_B of its length.
  const len = (P0) => P0.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - P0[i - 1][0], q[1] - P0[i - 1][1]) : 0), 0), L = len(geo.LGV_CONF.cur);
  const leg = r.spans.coronary[1] - r.spans.coronary[0];
  assert.ok(Math.abs(leg - L * COIL_B) < 8, `the coronary leg is ${leg.toFixed(1)}, ${COIL_B} of ${L.toFixed(0)}`);
  assert.equal(r.free, r.total, 'the tip stops at the coil site, the route’s end');
  // The leg from the right portal vein (CATH_RPV, 0.28 of it, as procFrame’s tip) to the coil site is what the timing table measures.
  const c = r.spans.rpv[0] + (r.spans.rpv[1] - r.spans.rpv[0]) * 0.28;
  assert.ok(Math.abs(r.free - c - ROUTE_LEN.tipsCoil) <= ROUTE_LEN.tipsCoil * 0.03, `ROUTE_LEN.tipsCoil ${ROUTE_LEN.tipsCoil} against ${(r.free - c).toFixed(1)}`);
  assert.equal(P.T.cv1 - P.T.cv0, legMs(ROUTE_LEN.tipsCoil)); assert.equal(P.T.cvOut1 - P.T.cvOut0, legMs(ROUTE_LEN.tipsCoil));
});

test('the sequence: the TIPS as it is, then the coil excursion; every value eases; the coil stays out; the tip ends all the way in and back', () => {
  const tr = { tract: [0.5, 0.8], rpv: [0.8, 0.9] };
  let prev = null;
  for (const t of times) {
    const f = procFrame(K, t, tr);
    for (const k of ['u', 'balloon', 'column', 'opacity', 'coil']) {
      assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${t}: ${f[k]}`);
      if (prev) assert.ok(Math.abs(f[k] - prev[k]) < 0.08, `${k} jumps at ${t} ms`);
    }
    prev = { ...f };
  }
  // Until the balloon is let down it is the TIPS (the same moves at the same times), the coil not out.
  const TT = PROCS.tips.T;
  for (const k of ['travel0', 'travel1', 'needle0', 'needle1', 'wire0', 'wire1', 'over0', 'over1', 'inflate0', 'inflate1', 'deflate0', 'deflate1']) assert.equal(T[k], TT[k], k);
  for (const t of [0, 2000, TT.needle1, TT.over1, TT.inflate1, TT.deflate1]) {
    const a = procFrame(K, t, tr), b = procFrame('tips', t, tr);
    for (const k of ['u', 'balloon', 'needle', 'wire', 'flash', 'opacity']) assert.equal(a[k], b[k], `${k} at ${t}`);
    assert.equal(a.coil, 0);
  }
  const rpv = 0.8 + 0.1 * 0.28;
  assert.ok(Math.abs(procFrame(K, T.cv0, tr).u - rpv) < 1e-9, 'the catheter waits in the right portal vein as the balloon comes down');
  assert.equal(procFrame(K, T.cv1, tr).u, 1, 'then on to the coil site');
  assert.equal(procFrame(K, T.coil0, tr).coil, 0); assert.equal(procFrame(K, T.coil1, tr).coil, 1);
  assert.equal(procFrame(K, T.coil1, tr).u, 1, 'the coil is pushed out with the tip at the site');
  assert.equal(procFrame(K, T.cvOut1, tr).u, rpv, 'and the catheter is back for the stent');
  assert.equal(procFrame(K, T.cvOut0, tr).coil, 1, 'the coil stays when the catheter is back');
  assert.equal(procFrame(K, T.apply, tr).coil, 1);
  const end = procFrame(K, T.end, tr);
  assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.balloon, 0); assert.equal(end.step, -1);
  // Steps in order, the vein coiled while the catheter is in it, the stent step last, and the model takes both changes as it starts.
  let last = 0;
  for (const t of times) { const s = procFrame(K, t, tr).step; if (s >= 0) { assert.ok(s >= last, `step back at ${t}`); last = s; } }
  assert.equal(last, 4);
  assert.equal(stepAt(K, T.coil0), 3); assert.equal(stepAt(K, T.cvOut1), 4, 'the stent is the step after the coils');
  assert.ok(T.apply > T.cvOut1 && T.apply < T.back);
  assert.equal(procFrame(K, T.apply, tr).step, 4);
  for (let i = 1; i < P.stops.length; i++) assert.ok(P.stops[i] > P.stops[i - 1], 'stops in order');
  assert.equal(P.stops.at(-1), T.end); assert.ok(P.stops[0] > T.travel1);
  assert.ok(P.stops[3] >= T.coil1 && P.stops[3] < T.cvOut0 + 1, 'the coil step holds with the coil out and the catheter still in the vein');
});

test('the shots, the callouts and the model: the coil step has its own shot and its callout on the coronary vein', () => {
  assert.deepEqual(P.steps.map((x) => x[4]), ['way', 'tip', 'tip', 'coil', 'tip']);
  const m = stepMarks(K, 3);
  assert.equal(m[0].label, '4 Vein coiled'); assert.deepEqual(m[0].edges, ['LGV_CONF']);
  assert.ok(Math.abs(m[0].f - (1 - COIL_B)) < 1e-9, 'on the coil site');
  assert.equal(markAt(K, 3), P.stops[3]); assert.equal(markAt(K, 4), T.back);
  // The model: both changes at once; undone, both give back.
  const p = { tips: { on: false }, occluded: {}, thrombus: {} };
  assert.equal(procBlocked(K, p), ''); assert.equal(procOffered(K, p), true);
  const q = P.apply(structuredClone(p));
  assert.equal(q.tips.on, true); assert.equal(q.occluded.C1a, true); assert.equal(P.had(q), true);
  assert.match(procBlocked(K, q), /already in place/);
  assert.match(procBlocked(K, { tips: { on: false }, occluded: { C1a: true } }), /coronary vein is already closed/);
  assert.match(procBlocked(K, { thrombus: { RHV_IVC: 1 } }), /thrombosed/);
  const u = P.undo(structuredClone(q));
  assert.equal(u.tips.on, false); assert.equal(u.occluded.C1a, false); assert.equal(P.had(u), false);
  assert.deepEqual(P.before, { tips: { on: false }, occluded: { C1a: false } }, 'the slide opens with no stent and the vein open');
});

test('the variceal bleed talk has no coil-embolization slide: the TIPS slide is followed by the second patient (13 Nov)', () => {
  const ids = BLEED.slides.map((x) => x.id), i = ids.indexOf('tips');
  assert.ok(i > 0);
  assert.ok(!ids.includes('tipscoil'), 'the coronary-vein coil slide was removed from this talk');
  assert.equal(ids[i + 1], 'controlled', 'the next slide starts from its own preset');
  assert.ok(!BLEED.slides.some((x) => /coil-embolized|coil embolization/i.test(`${x.title} ${x.line}`)), 'no slide text points at the removed slide');
});

test('the model: with the coronary vein coiled the esophageal varix shrinks even with no stent, and a TIPS alone shrinks it too', () => {
  // (The rec's two checks, 8 Nov 2026: with C1a occluded and no TIPS the varix used to stay at 7.3 mm because varixTarget read the gradient, not the feeder.)
  const run = (p) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(deepMerge(e.params, p)); e.settle(); return computeMetrics(e).varix.d; };
  const base = run({}), coiled = run({ occluded: { C1a: true } }), tips = run({ tips: { on: true, d: 10 } }), both = run(P.apply({ occluded: {} }));
  assert.ok(base > 5, `the varix before: ${base.toFixed(1)} mm`);
  assert.ok(coiled < 2.5, `coils alone shrink it to a resting vein: ${coiled.toFixed(1)} mm`);
  assert.ok(tips < base, `a TIPS shrinks it: ${tips.toFixed(1)} mm`);
  assert.ok(both <= tips + 1e-9, `the stent with the coils is no larger: ${both.toFixed(1)} mm`);
});

test('the coil is laid inside the coronary vein, running on up it, from the catheter’s tip, and stays when the catheter is back', () => {
  const r = procSpecs(geo, () => 1)[K], raw = rawRoute(r, geo), cor = raw.spans.coronary;
  // The coil’s vessel: the coronary vein at the coil site (its own course, drawn from the stomach to the portal trunk), the coil running up the vein: dir -1.
  const f = 1 - COIL_B, path = lumenPath(geo.LGV_CONF.cur, f, 16), glue = { id: 'LGV_CONF', f, rad: 2.2, path, dir: -1 };
  const reach = coilReach(glue, {});
  assert.equal(reach.dir, -1);
  assert.ok(reach.span > 3 && reach.rho > 0, 'it has room to curl');
  const V = [], draws = [], rgb = () => [0.5, 0.5, 0.5];
  assert.equal(layCoil({ coil: 0 }, glue, rgb, 0, 1, V, draws), -1, 'nothing before it is pushed out');
  const first = layCoil({ coil: 1 }, glue, rgb, 0, 1, V, draws, 1000);
  assert.equal(first, 1000, 'its vertices follow the caller’s base');
  assert.ok(draws.length >= 2 && draws.every((d) => d.first >= 1000), 'the draws count the base');
  // Every wire vertex lies inside the vein: within the lumen's radius of the course.
  const C = geo.LGV_CONF.cur, near = (x, y) => {   // (the distance to the vein's centreline, segment by segment)
    let best = Infinity;
    for (let i = 1; i < C.length; i++) {
      const [ax, ay] = C[i - 1], dx = C[i][0] - ax, dy = C[i][1] - ay, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + dx * u - x, ay + dy * u - y));
    }
    return best;
  };
  for (let i = 0; i < V.length; i += 12) assert.ok(near(V[i], V[i + 1]) <= glue.rad + 0.4, `vertex ${i / 12} is ${near(V[i], V[i + 1]).toFixed(2)} from the vein’s centre`);
  // It starts at the catheter’s tip: the coil site is the route’s end, and the first loop starts on the vein’s centre.
  assert.equal(cor[1], raw.total);
  assert.ok(near((V[0] + V[6]) / 2, (V[1] + V[7]) / 2) < 0.2, 'its first loop starts on the vein’s centre');
  const g2 = { ...glue, rad: 0.9 };
  assert.equal(layCoil({ coil: 1 }, g2, rgb, 0, 1, [], []), -1, 'a vein too narrow for the wire gets none');
});
