// EUS-PPG played on the anatomy (proc-anim.js MEASURES.eus, eus-scope.js): every value eases, the steps run in order, the needle
// is out only with the scope turned and still, its readings are the model's own and their difference is PV − HV; and on the figure's
// own outlines the scope stays in the esophagus and the stomach while each needle runs through the stomach wall and the liver only,
// into the left portal vein near its end and the left hepatic vein near the IVC, clear of the portal trunk, the artery and the IVC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEASURES, READS, PROC_KINDS, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';
import { EUS_ROUTE, EUS_TARGETS, EUS_BEND, EUS_EXIT, EUS_SCOPE_R, eusTip, eusDraw, pointOn } from '../src/ui/eus-scope.js';
import { EDGE_PATH, ORGANS, SEAM_D } from '../src/ui/anatomy.js';
import { NODES } from '../src/engine/topology.js';

const E = MEASURES.eus, T = E.T;
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('a measurement, not a treatment: offered always, blocked never, the model left as it was', () => {
  assert.ok(!PROC_KINDS.includes('eus'), 'not among the HVPG card’s treatment buttons');
  assert.equal(specOf('eus'), E);
  assert.equal(procBlocked('eus', {}), '');
  assert.equal(procOffered('eus', {}), true);
  const p = { tips: { on: false } };
  assert.equal(E.apply(p), p); assert.equal(E.had(p), false);
});

test('every value eases, it starts and ends out of sight, and the steps run in order', () => {
  let prev = null, last = 0;
  for (const t of times) {
    const f = procFrame('eus', t);
    for (const k of ['u', 'aim', 'tgt', 'needle', 'fan', 'opacity']) {
      assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${t}: ${f[k]}`);
      if (prev) assert.ok(Math.abs(f[k] - prev[k]) < 0.08, `${k} jumps at ${t} ms`);
    }
    if (f.step >= 0) { assert.ok(f.step >= last, `step back at ${t}`); last = f.step; }
    prev = f;
  }
  assert.equal(last, E.steps.length - 1);
  assert.equal(procFrame('eus', 0).u, 0);
  const end = procFrame('eus', T.end);
  assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.needle, 0); assert.equal(end.step, -1);
  assert.deepEqual(E.steps.map((s) => s[0]), ['enter', 'pv', 'hv', 'done']);
  assert.deepEqual(E.steps.map((s) => s[5]), [null, 'PVH_L', 'LHV_IVC', 'PVH_L']);
});

test('the needle is out only with the scope in and turned, the scope moves only with the needle back, and each reading is taken with the needle in the vein', () => {
  for (const t of times) {
    const f = procFrame('eus', t);
    if (f.needle > 0) {
      assert.equal(f.u, 1, `scope all the way in at ${t}`);
      assert.equal(f.aim, 1, `scope turned at ${t}`);
      assert.ok(f.tgt === 0 || f.tgt === 1, `scope still at ${t}`);
    }
    if (f.tgt > 0 && f.tgt < 1) assert.equal(f.needle, 0, `needle back while the scope moves, ${t}`);
    if (f.read) { assert.equal(f.needle, 1, `needle in the vein while it reads, ${t}`); assert.equal(f.tgt, f.read - 1); }
  }
  // The portal vein first, then the hepatic vein; each reading's callout comes after its reading, inside its step.
  assert.ok(T.pvRead1 < T.move0 && T.move1 < T.hv0);
  assert.equal(stepAt('eus', T.pvRead0), 1); assert.equal(stepAt('eus', T.hvRead0), 2);
  assert.ok(markAt('eus', 1) >= T.pvRead1 && markAt('eus', 1) <= E.stops[1]);
  assert.ok(markAt('eus', 2) >= T.hvRead1 && markAt('eus', 2) <= E.stops[2]);
  assert.ok(markAt('eus', 3) >= T.hvOut1 && markAt('eus', 3) < T.back, 'the result stands while the scope comes out');
});

test('the readings are the model’s: the left portal vein’s and the left hepatic vein’s node pressures, and EUS-PPG = PV − HV at one decimal', () => {
  const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i])), P = new Array(NODES.length).fill(0);
  P[NI.LPV] = 15.27; P[NI.LHV] = 4.14;
  const rd = READS.eus;
  rd.pv = rd.hv = rd.ppg = NaN;
  E.capture(1, rd, { P }); E.capture(2, rd, { P });
  assert.equal(rd.pv, 15.3); assert.equal(rd.hv, 4.1); assert.equal(rd.ppg, 11.2);
  const m1 = stepMarks('eus', 1), m2 = stepMarks('eus', 2), m3 = stepMarks('eus', 3);
  assert.equal(stepMarks('eus', 0).length, 0, 'no callout while the scope goes in');
  assert.deepEqual(m1.map((m) => m.edges[0]), ['PVH_L']);
  assert.deepEqual(m2.map((m) => m.edges[0]), ['PVH_L', 'LHV_IVC']);
  assert.match(m1[0].label, /Left portal vein 15\.3 mmHg/);
  assert.match(m2[1].label, /Left hepatic vein 4\.1 mmHg/);
  assert.match(m3[0].label, /EUS-PPG 11\.2 = 15\.3 − 4\.1 mmHg/);
  for (const m of [...m1, ...m2, ...m3]) assert.ok(m.pin && m.kind === 'treat' && m.f > 0 && m.f < 1);
  assert.equal(m1[0].f, EUS_TARGETS.pv[1]); assert.equal(m2[1].f, EUS_TARGETS.hv[1]);
});

// ── The figure's own outlines ──
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
const inside = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const distTo = (P, p, closed = false) => { let m = Infinity; for (let i = 1; i < P.length + (closed ? 1 : 0); i++) m = Math.min(m, segD(p, P[i - 1], P[i % P.length])); return m; };
const liver = poly(ORGANS.find((o) => o.id === 'liver').d), stomach = poly(SEAM_D);
const geo = Object.fromEntries(Object.entries(EDGE_PATH).map(([k, d]) => [k, { cur: poly(d) }]));

// The route as the stage lays it (stage-cath.js procRoute, without its light smoothing): its points, lengths, parts and stations.
function route() {
  const pts = [], parts = [];
  EUS_ROUTE.build({ pts(list, id, f, name = 'lead') { parts.push({ name, i: pts.length }); pts.push(...list); } });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const spans = {};
  parts.forEach((q, k) => { if (q.name !== 'lead') spans[q.name] = [cum[q.i], k + 1 < parts.length ? cum[parts[k + 1].i] : cum.at(-1)]; });
  const r = { pts, cum, spans, total: cum.at(-1), free: cum.at(-1) };
  EUS_ROUTE.after(r, geo);
  return r;
}
const at = (r, d) => {
  d = Math.max(0, Math.min(r.total, d));
  let i = 1; while (i < r.cum.length - 1 && r.cum[i] < d) i++;
  const a = r.pts[i - 1], b = r.pts[i], l = r.cum[i] - r.cum[i - 1] || 1, u = (d - r.cum[i - 1]) / l;
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
};
const newTip = () => ({ c1: [0, 0], c2: [0, 0], a1: [0, 0], side: [0, 0], exit: [0, 0], nd: [0, 0], p2: [0, 0], end: [0, 0], len: 0 });

test('the scope goes down the middle of the esophagus and stays inside it and the stomach, its radius clear of their walls', () => {
  const r = route();
  for (let d = r.spans.eso[0] + 30; d <= r.total; d += 2) {
    const p = at(r, d).p;
    assert.ok(inside(stomach, p), `inside at ${p.map((v) => v.toFixed(0))}`);
    assert.ok(distTo(stomach, p, true) >= EUS_SCOPE_R, `clear of the wall at ${p.map((v) => v.toFixed(0))}: ${distTo(stomach, p, true).toFixed(1)}`);
  }
  assert.ok(r.hvD < r.free && r.free - r.hvD < 30, 'the hepatic vein’s station a little short of the portal vein’s');
});

test('each needle leaves the turned scope 40 degrees forward, crosses only the stomach and the liver, and keeps clear of the trunk, the artery and the IVC', () => {
  const r = route();
  const AVOID = ['PV_TRUNK', 'A_HEP', 'A_HL', 'A_HR', 'IVC_IS', 'IVCS_RA', 'MHV_IVC', 'RHV_IVC', 'PVH_R', 'SV_CONF', 'CAUD'];
  for (const [k, D] of [['pv', r.free], ['hv', r.hvD]]) {
    const q0 = at(r, D - EUS_BEND), T = r.tg[k], g = eusTip(q0.p, q0.t, T, 1, newTip());
    const cos = g.a1[0] * g.nd[0] + g.a1[1] * g.nd[1];
    assert.ok(Math.abs(Math.acos(cos) - EUS_EXIT) < 0.01, `${k}: the needle’s angle to the scope`);
    assert.ok(inside(stomach, g.end) || distTo(stomach, g.end, true) < 1.5, `${k}: the tip stays in the stomach, against its wall`);
    for (let i = 0; i <= 100; i++) {
      const p = [g.exit[0] + g.nd[0] * g.len * (i / 100), g.exit[1] + g.nd[1] * g.len * (i / 100)];
      assert.ok(inside(liver, p) || inside(stomach, p), `${k}: the needle at ${p.map((v) => v.toFixed(0))} is in the stomach or the liver`);
      if (i < 96) for (const id of AVOID) assert.ok(distTo(geo[id].cur, p) > 5, `${k}: the needle passes ${id} at ${p.map((v) => v.toFixed(0))}`);
    }
    // The target is the named vessel's own course.
    const [id, f] = EUS_TARGETS[k];
    assert.ok(distTo(geo[id].cur, T) < 0.5, `${k} on ${id}`);
    // (The left portal vein at its umbilical end; the hepatic vein one to two centimetres from the IVC, never the IVC itself.)
    if (k === 'pv') assert.ok(f >= 0.8, 'the umbilical end of the left portal vein');
    else { const d = Math.min(distTo(geo.IVC_IS.cur, T), distTo(geo.IVCS_RA.cur, T)); assert.ok(d > 15 && d < 45, `the hepatic vein near the IVC: ${d.toFixed(0)}`); }
  }
});

test('the scope, its sector and its needle are whole draws for the GPU catheter', () => {
  const r = route();
  const rgb = () => [0.5, 0.5, 0.5];
  for (const t of [3000, 6600, 8000, 10000, 13500, 15500, 18000, 22000]) {
    const f = procFrame('eus', t);
    const st = { ...f, ring: f.read ? 'var(--tr-pv)' : null, clock: t };
    const tipD = r.free * 0.25 + ((r.free + (r.hvD - r.free) * f.tgt) - r.free * 0.25) * f.u;
    const o = eusDraw(st, r, tipD, at, rgb), n = o.V.length / 6;
    assert.ok(o.V.length % 6 === 0 && o.V.every(Number.isFinite), `${t}: vertices`);
    assert.ok(o.draws.length >= 8, `${t}: the scope's parts`);
    for (const d of o.draws) {
      assert.ok(d.count > 0 && d.first >= 0 && d.first + d.count <= n, `${t}: mode ${d.mode} in the buffer`);
      assert.ok([0, 2, 3, 4, 6, 7, 8, 9].includes(d.mode));
      if (d.tri) assert.equal(d.count % 3, 0);
      assert.ok(d.alpha >= 0 && d.alpha <= 1);
    }
    assert.equal(o.draws.some((d) => d.mode === 9), f.fan > 0.01, `${t}: the sector with the scanning`);
    assert.equal(o.draws.some((d) => d.mode === 3), f.needle * 1 > 0.05, `${t}: the steel with the needle out`);
  }
});

test('the target and pointOn agree with the course’s length', () => {
  const P = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(pointOn(P, 0), [0, 0]); assert.deepEqual(pointOn(P, 0.5), [10, 0]); assert.deepEqual(pointOn(P, 1), [10, 10]);
});
