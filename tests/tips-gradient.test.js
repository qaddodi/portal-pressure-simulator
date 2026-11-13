// The gradient across the new stent (proc-anim.js MEASURES.tipsgrad, TIPS step 5): a reading, not a treatment; the TIPS catheter goes through the
// stent into the portal vein, reads, is drawn back to the IVC and reads again; the gradient is the PPG the tiles show (9.2 mmHg through an 8 mm
// stent in cirr-decomp, 7.9 through 10 mm, the recs' figures) and under AASLD 2024's 12 mmHg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { MEASURES, PROCS, PROC_KINDS, READS, playProcedure, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';

const G = MEASURES.tipsgrad, T = G.T;
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);
const STOPS = { SVC_RA: [-0.5, -0.1], IVCS_RA: [-0.1, 0.1], IVC_IS: [0.1, 0.45], hv: [0.45, 0.6], tract: [0.6, 0.85], rpv: [0.85, 0.93], trunk: [0.93, 1] };
const withTips = (d) => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  e.setParams(deepMerge(e.params, { tips: { on: true, d } })); e.settle();
  return { metrics: computeMetrics(e) };
};

test('a reading, not a treatment: offered always, blocked without a TIPS, the model left as it was', () => {
  assert.ok(!PROC_KINDS.includes('tipsgrad') && !PROCS.tipsgrad, 'not among the HVPG card’s treatment buttons');
  assert.equal(specOf('tipsgrad'), G);
  assert.equal(G.measure, true);
  assert.equal(procOffered('tipsgrad', {}), true);
  assert.match(procBlocked('tipsgrad', { tips: { on: false } }), /no TIPS/);
  assert.equal(procBlocked('tipsgrad', { tips: { on: true } }), '');
  const p = { tips: { on: true } };
  assert.equal(G.apply(p), p); assert.equal(G.had(p), false);
  assert.equal(G.route, 'tips', 'the catheter travels the TIPS route');
});

test('the catheter goes in through the stent to the portal trunk, is drawn back to the IVC, and goes out; nothing else is out', () => {
  let prev = null;
  for (const t of times) {
    const f = procFrame('tipsgrad', t, STOPS);
    for (const k of ['u', 'opacity']) assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${t}: ${f[k]}`);
    if (prev) assert.ok(Math.abs(f.u - prev.u) < 0.06, `u jumps at ${t} ms`);
    assert.equal(f.needle + f.wire + f.flash + f.balloon + f.column + f.fan, 0, `only the catheter at ${t}`);
    prev = f;
  }
  assert.equal(procFrame('tipsgrad', 0, STOPS).u, 0);
  assert.equal(procFrame('tipsgrad', T.pvRead0, STOPS).u, 1, 'all the way in, in the portal trunk, to read it');
  assert.equal(procFrame('tipsgrad', T.pvRead1, STOPS).u, 1);
  const iv = procFrame('tipsgrad', T.ivRead0, STOPS).u;
  assert.ok(iv > STOPS.IVC_IS[0] && iv < STOPS.IVC_IS[1], 'drawn back into the IVC stretch, short of the hepatic veins’ level');
  assert.equal(procFrame('tipsgrad', T.ivRead1, STOPS).u, iv, 'it waits there while it reads');
  assert.ok(iv < 1 - 0.3, 'and clear of the stent');
  assert.equal(procFrame('tipsgrad', T.ivRead0, null).u > 0, true, 'without the stage’s stops it still has a place');
  const end = procFrame('tipsgrad', T.end, STOPS);
  assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.step, -1);
});

test('one step with one shot; each reading is taken with the tip still; the result stands while the catheter waits and goes as it comes out', () => {
  assert.equal(G.steps.length, 1); assert.deepEqual(G.stops, [T.end]);
  assert.equal(stepAt('tipsgrad', 0), 0); assert.equal(stepAt('tipsgrad', T.end), 0);
  assert.ok(T.travel1 < T.pvRead0 && T.pvRead1 < T.pull0 && T.pull1 < T.ivRead0 && T.ivRead1 < T.res0 && T.res0 < T.back && T.back < T.end);
  for (const t of times) {
    const f = procFrame('tipsgrad', t, STOPS);
    if (f.read) assert.ok(f.u === 1 || f.u === procFrame('tipsgrad', T.ivRead0, STOPS).u, `still while it reads, ${t}`);
    assert.equal(f.read, t >= T.pvRead0 && t < T.pvRead1 ? 1 : t >= T.ivRead0 && t < T.ivRead1 ? 2 : 0);
  }
  assert.equal(markAt('tipsgrad', 0), T.res0);
  assert.equal(stepMarks('tipsgrad', 0).length, 0, 'its readings are the catheter’s pills, not marks on the vessels');
  assert.equal(procFrame('tipsgrad', T.back - 20, STOPS).shot, 'way'); assert.equal(procFrame('tipsgrad', T.back, STOPS).shot, '', 'the view stops following the tip as it comes out');
});

test('the gradient is the PPG the tiles show: 9.2 mmHg through an 8 mm stent and 7.9 through 10 mm in cirr-decomp, both under 12', () => {
  const rd = READS.tipsgrad;
  for (const [d, want] of [[8, 9.2], [10, 7.9]]) {
    const f = withTips(d);
    rd.pv = rd.iv = rd.ppg = NaN;
    G.capture(0, rd, f);
    assert.equal(rd.ppg, want, `${d} mm`);
    assert.equal(Math.round((rd.pv - rd.iv) * 10) / 10, want, `${d} mm: the two readings shown give it`);
    assert.ok(rd.ppg < 12);
    const L = [];
    G.labels(T.pvRead0 + 100, rd, f, L);
    assert.deepEqual(L.map((l) => [l.key, l.at, l.kicker]), [['w', 'tip', 'PORTAL VEIN']], 'the portal vein first');
    assert.equal(L[0].text, rd.pv.toFixed(1));
    G.labels(T.pull0 + 100, rd, f, L); assert.equal(L.length, 0, 'none while it is drawn back');
    G.labels(T.ivRead0 + 100, rd, f, L);
    assert.deepEqual(L.map((l) => [l.key, l.at, l.kicker]), [['f', 'tip', 'IVC']], 'then the IVC’s');
    assert.equal(L[0].text, rd.iv.toFixed(1));
    G.labels(T.res0 + 10, rd, f, L);
    assert.deepEqual(L.map((l) => [l.key, l.kicker, l.text, l.cls]), [['g', 'GRADIENT', want.toFixed(1), 'result ok']]);
    G.labels(T.back - 10, rd, f, L); assert.equal(L.length, 1, 'stands while the catheter waits');
    G.labels(T.back + 10, rd, f, L); assert.equal(L.length, 0, 'gone as it comes out');
    G.labels(T.pvRead0 - 10, rd, f, L); assert.equal(L.length, 0, 'none before the first reading');
  }
});

test('a gradient of 12 or more is not called ok', () => {
  const rd = READS.tipsgrad, L = [];
  rd.pv = 20; rd.iv = 5; rd.ppg = 15;
  G.labels(T.res0 + 10, rd, {}, L);
  assert.equal(L[0].cls, 'result caution'); assert.equal(L[0].text, '15.0');
});

// Played on a stand-in stage and a frame clock moved by hand: the run takes its readings from the model frame, shows the pills in order, and leaves the model alone.
test('played step by step it travels the TIPS route, reads in order, ends once, and applies nothing', () => {
  const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
  try {
    const q = []; let now = 0, gl = 0;
    globalThis.performance = { now: () => now };
    globalThis.requestAnimationFrame = (fn) => { q.push(fn); return q.length; };
    globalThis.cancelAnimationFrame = () => {};
    const moves = [], routes = [], seen = [], rings = new Set(), follows = [], ends = [], marks = [];
    const stage = {
      setCatheter: (st) => { if (st) { routes.push(st.route); if (st.ring) rings.add(st.ring); follows.push(st.follow); seen.push(st.labels.map((l) => `${l.kicker} ${l.text}`).join('|')); } },
      cathStops: () => STOPS, gliding: () => now < gl,
      cathFocus: (mode, ms) => { moves.push(mode); gl = now + ms; return true; },
      cathForget: () => {},
    };
    const frame = withTips(8);
    let applied = 0;
    playProcedure(stage, 'tipsgrad', { stepped: true, read: () => frame, apply: () => applied++, onMark: (m) => marks.push(m), onEnd: (e) => ends.push(e) });
    for (let t = 0; t < T.end + 8000; t += 16) { now += 16; for (const fn of q.splice(0)) fn(now); }
    assert.deepEqual(ends, [{ done: true, rewound: false }]);
    assert.equal(applied, 0, 'a reading: the model is not changed');
    assert.ok(routes.length > 100 && routes.every((r) => r === 'tips'), 'the TIPS route');
    assert.ok(moves[0] === 'way', 'framed from the way in');
    const order = [...new Set(seen.filter(Boolean).map((x) => x.split(' ')[0]))];
    assert.deepEqual(order, ['PORTAL', 'IVC', 'GRADIENT'], 'the portal vein, then the IVC, then the gradient');
    assert.ok(seen.includes('GRADIENT 9.2'), 'the gradient the tiles show');
    assert.deepEqual([...rings], ['var(--tr-pv)', 'var(--tr-ivc)'], 'a ripple at the tip while each is read');
    assert.ok(follows.includes('way') && follows.at(-1) === false, 'the view follows the tip, and stops as it comes out');
    assert.equal(READS.tipsgrad.ppg, 9.2);
  } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
});
