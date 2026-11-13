// EUS-guided coils and glue for a fundal varix (proc-anim.js ENDO.eusglue, eus-scope.js EUS_GLUE_ROUTE), played on the Gastric varices
// talk's own Coils and glue slide (his asks, 7 and 8 Nov 2026), before the Treat the spleen slide. On the figure's own outlines: the scope stays inside the
// esophagus and the stomach and never bends sharply; the needle runs square from it into the varix and keeps clear of the gastrorenal
// shunt and the arch where the two meet; the coils curl in the varix. In the model the varix alone closes: its feeder (C2) is occluded,
// the shunt stays open, the fundal varix is obliterated and no blood runs through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENDO, GLUE_ESO_U, PROCS, PROC_KINDS, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';
import { EUS_GLUE_ROUTE, EUS_GLUE_TARGET, EUS_GLUE_STATION, EUS_RHO, EUS_SCOPE_R, EUS_COIL_EDGE, coilReach, lumenPath, eusPose, eusDraw, newTip, pointOn } from '../src/ui/eus-scope.js';
import { EDGE_PATH, SEAM_D } from '../src/ui/anatomy.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
import { GASTRIC } from '../src/ui/decks/gastric-varices.js';

const G = ENDO.eusglue, T = G.T;
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('a treatment through the scope: off the HVPG card’s catheter buttons, played by its own slide, the spleen’s slide after it with the varix still glued', () => {
  assert.ok(!PROC_KINDS.includes('eusglue') && !PROCS.eusglue);
  assert.equal(specOf('eusglue'), G);
  // (His ask, 8 Nov 2026: "the EUS gastric variceal treatment slide should be its own slide, and the following slide will have to talk
  // about embolizing and treating the spleen".)
  const ids = GASTRIC.slides.map((x) => x.id), e = ids.indexOf('eusglue'), s = GASTRIC.slides[e], sp = GASTRIC.slides[e + 1];
  assert.equal(s.procedure, 'eusglue');
  assert.equal(ids[e - 1], 'svt', 'after the clotted splenic vein');
  assert.equal(s.params.occluded.C2, true, 'its state: the varix closed');
  assert.equal(s.compare, undefined, 'no spleen buttons on the glue’s slide');
  assert.equal(sp.id, 'splenectomy');
  assert.equal(sp.procedure, undefined, 'the spleen’s slide plays no glue');
  assert.equal(sp.preset, undefined, 'the spleen’s slide carries the glued varix on (no preset of its own)');
  assert.equal(sp.params.occluded, undefined);
  assert.deepEqual(sp.compare.map((o) => o.params.splenicRx), [0, 1, 2], 'the spleen’s buttons');
  assert.ok(sp.compare.every((o) => !o.preset && !o.params.occluded), 'each button keeps the varix glued');
  assert.deepEqual(G.steps.map((x) => x[0]), ['enter', 'needle', 'coils', 'glue', 'done']);
  assert.equal(G.steps.length, G.stops.length);
});

test('it closes the varix alone: the feeder occluded, the shunt left open; offered only with fundal varices', () => {
  const p = { occluded: {}, spontaneous: { C5: true } };
  assert.equal(procBlocked('eusglue', p, { gastricVarix: { d: 8 } }), '');
  assert.equal(procOffered('eusglue', p, { gastricVarix: { d: 8 } }), true);
  assert.equal(procOffered('eusglue', p, { gastricVarix: { d: 1.5 } }), false);
  assert.match(procBlocked('eusglue', { spontaneous: { C5: false } }), /no fundal varices/);
  const q = G.apply(structuredClone(p));
  assert.equal(q.occluded.C2, true); assert.ok(!q.occluded.C5, 'the gastrorenal shunt is not touched');
  assert.equal(G.had(q), true); assert.match(procBlocked('eusglue', q), /already closed/);
  assert.equal(G.undo(q).occluded.C2, false);
  assert.equal(procOffered('eusglue', { occluded: { C2: true } }, { gastricVarix: { d: 1.5 } }), true, 'watched again once done');
});

test('every value eases, the steps run in order, and the needle is out only with the scope in; the varix closes as the last step starts', () => {
  let prev = null, last = 0;
  for (const t of times) {
    const f = procFrame('eusglue', t);
    for (const k of ['u', 'aim', 'needle', 'fan', 'coil', 'column', 'opacity']) {
      assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${t}: ${f[k]}`);
      if (prev) assert.ok(Math.abs(f[k] - prev[k]) < 0.08, `${k} jumps at ${t} ms`);
    }
    if (f.needle > 0) { assert.equal(f.u, 1, `scope all the way in at ${t}`); assert.equal(f.aim, 1, `elevator up at ${t}`); }
    if (f.coil > 0 && f.coil < 1) assert.equal(f.needle, 1, `the coil goes in through the needle, ${t}`);
    if (f.column > 0 && f.column < 1) assert.equal(f.needle, 1, `the glue goes in through the needle, ${t}`);
    if (f.step >= 0) { assert.ok(f.step >= last, `step back at ${t}`); last = f.step; }
    prev = f;
  }
  assert.equal(last, G.steps.length - 1);
  const end = procFrame('eusglue', T.end);
  assert.equal(end.opacity, 0); assert.equal(end.u, 1, 'parked over the varix to the end: no way out'); assert.equal(end.needle, 0); assert.equal(end.step, -1);
  assert.equal(stepAt('eusglue', T.coil0), 2); assert.equal(stepAt('eusglue', T.fill0), 3);
  assert.ok(T.apply > G.stops[3] && stepAt('eusglue', T.apply) === 4, 'the model closes the varix only once the glue step has played');
  // (Each step's number and word on the varix, the first step's too: 1 Varix found. Each points at its own thing, f along C2: the varix ahead of the
  // scope, the needle's point, the coil's far end, the middle of the cast, the X; tests below hold the numbers against the geometry.)
  assert.equal(stepMarks('eusglue', 0)[0].num, '1');
  assert.deepEqual(G.steps.map((s) => s[1]), ['Varix found', 'Needle in', 'Coils', 'Glue', 'No flow'], 'the steps name what is found or done');
  const fs = [0.7, EUS_GLUE_TARGET[1], null, EUS_GLUE_TARGET[1], EUS_GLUE_TARGET[1]];
  for (let i = 0; i < 5; i++) {
    const [m] = stepMarks('eusglue', i);
    assert.deepEqual(m.edges, [EUS_GLUE_TARGET[0]]); assert.equal(m.num, String(i + 1)); assert.equal(m.label, `${i + 1} ${G.steps[i][1]}`);
    if (fs[i] !== null) assert.equal(m.f, fs[i], `step ${i + 1} points at its own thing`); else assert.ok(m.f > EUS_GLUE_TARGET[1] + 0.02 && m.f < EUS_GLUE_TARGET[1] + 0.06, 'the coil’s far end, beyond the needle’s point');
    assert.ok(markAt('eusglue', i) > T.travel1);
    assert.match(m.label, /^[A-Za-z0-9 ]+$/, 'plain glyphs of the labels’ GPU cut');
  }
  assert.equal(markAt('eusglue', 4), T.apply, 'the last callout comes with the X, as the model closes the varix, not as the scope leaves');
  assert.ok(markAt('eusglue', 4) > G.stops[3] && markAt('eusglue', 4) < G.stops[4]);
  assert.deepEqual([0, 1, 2, 3].map((i) => markAt('eusglue', i)), G.stops.slice(0, 4));
});

// His ask, 10 Nov 2026 (recs/eus-glue-steps.md item 1): every step has one short line for the teaching card's list, about eight words.
test('each step has a short line of about eight words for the teaching card, the words and lines as drafted', () => {
  assert.deepEqual(G.steps.map((s) => s[8]), ['color Doppler shows flow in the varix', 'a 19-gauge needle enters the varix', 'coils scaffold the glue', 'cyanoacrylate obliterates the varix', 'Doppler confirms the varix is occluded']);
  for (const s of G.steps) assert.ok(s[8].split(' ').length <= 8 && s[2].length > s[8].length, `short: ${s[8]}`);
  // (The other procedures carry none, so their card keeps the inline row.)
  for (const k of ['tips', 'brto', 'bato']) assert.ok(PROCS[k].steps.every((s) => !s[8]), `${k}: no short lines`);
});

// His ask, 10 Nov 2026 (item 5): step 5 is the Doppler check; the scope stays parked, the fan stays on while the flow stops, and nothing travels back.
test('step 5: the X lands at apply, the needle comes out, the fan stays on while the flow stops and goes after, and the scope stays parked', () => {
  assert.ok(T.needleOut0 >= T.apply && T.needleOut1 <= T.fanOut0, 'the needle is out before the fan goes');
  assert.ok(T.fanOut0 - T.apply >= 2000, 'the fan stays on for the flow to slow and stop (at least 2 s after the model takes the change)');
  assert.ok(procFrame('eusglue', T.fanOut0 - 1).fan === 1 && procFrame('eusglue', T.fanOut1).fan === 0);
  assert.ok(G.stops[4] >= T.fanOut1 && G.stops[4] === T.back && T.end - T.back === 800);
  for (let t = T.apply; t <= T.end; t += 50) {
    const f = procFrame('eusglue', t);
    assert.equal(f.u, 1, `parked at ${t}`);
    if (t <= G.stops[4]) assert.equal(f.opacity, 1, `shown through its last step at ${t}`);
  }
  assert.equal(procFrame('eusglue', T.back).aim, 0, 'the elevator down with the fan');
});

// His ask, 10 Nov 2026 (item 6, option a): about 3.5 s down to the fundus, quick through the esophagus, slow for the turn.
test('the way in takes 3.5 s: fast through the esophagus, slowing for the turn into the fundus', () => {
  assert.equal(T.travel1 - T.travel0, 3500);
  const r = route(), start = r.spans.eso[0] * EUS_GLUE_ROUTE.start, uOf = (d) => (d - start) / (r.total - start);
  assert.ok(Math.abs(uOf(r.spans.cardia[0]) - GLUE_ESO_U) < 0.005, `the esophagus ends at u ${uOf(r.spans.cardia[0]).toFixed(4)}`);
  const u = (p) => procFrame('eusglue', T.travel0 + (T.travel1 - T.travel0) * p).u, len = r.total - start;
  const speed = (p) => ((u(p + 0.005) - u(p - 0.005)) / (0.01 * 3.5)) * len;   // figure units a second
  let peakEso = 0, peakTurn = 0;
  for (let p = 0.05; p < 0.95; p += 0.01) { if (u(p) < GLUE_ESO_U - 0.03) peakEso = Math.max(peakEso, speed(p)); else if (u(p) > GLUE_ESO_U + 0.02) peakTurn = Math.max(peakTurn, speed(p)); }
  assert.ok(peakEso > 200, `fast in the esophagus: ${peakEso.toFixed(0)} units a second`);
  assert.ok(peakTurn < 120 && peakTurn < peakEso / 2, `slow for the turn: ${peakTurn.toFixed(0)} units a second`);
  assert.ok(u(0.5) < u(0.6) && u(0.6) < u(0.9) && u(1) === 1, 'it only goes on');
});

// His ask, 10 Nov 2026 (item 7): the numbers GLUE_STEPS points its callouts at, held against the geometry.
test('the callouts’ points: the varix ahead of the scope’s tip, the coil’s far end', () => {
  const C = geo[EUS_GLUE_TARGET[0]].cur, ahead = G.steps[0][7];
  assert.ok(Math.abs(pointOn(C, ahead)[0] - EUS_GLUE_STATION.at[0]) < 3, 'step 1: the varix straight ahead of (under) the scope’s tip');
  assert.ok(pointOn(C, ahead)[1] > EUS_GLUE_STATION.at[1] + 20, 'and not on the needle’s point');
  const f = EUS_GLUE_TARGET[1];
  let L = 0; for (let i = 1; i < C.length; i++) L += Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]);
  for (const rad of [3, 4, 5, 6]) {   // (the lumens C2 has as drawn)
    const cr = coilReach({ path: lumenPath(C, f, 16), rad }), end = f + cr.dir * cr.span / L;
    assert.ok(Math.abs(end - G.steps[2][7]) < 0.008, `step 3: the coil’s far end at lumen ${rad}: ${end.toFixed(4)} against ${G.steps[2][7].toFixed(4)}`);
  }
});

// ── The figure's own outlines (as tests/eus-ppg.test.js reads them) ──
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
const stomach = poly(SEAM_D);
const geo = Object.fromEntries(Object.entries(EDGE_PATH).map(([k, d]) => [k, { cur: poly(d) }]));
function route() {
  const pts = [], parts = [];
  EUS_GLUE_ROUTE.build({ pts(list, id, f, name = 'lead') { parts.push({ name, i: pts.length }); pts.push(...list); } });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const spans = {};
  parts.forEach((q, k) => { if (q.name !== 'lead') spans[q.name] = [cum[q.i], k + 1 < parts.length ? cum[parts[k + 1].i] : cum.at(-1)]; });
  const r = { pts, cum, spans, total: cum.at(-1), free: cum.at(-1), start: spans.eso[0] * EUS_GLUE_ROUTE.start };
  EUS_GLUE_ROUTE.after(r, geo);
  r.glue.rad = 5;   // (the varix's lumen radius as drawn; the stage reads it live, stage-cath.js eusGL)
  return r;
}
const at = (r, d) => {
  d = Math.max(0, Math.min(r.total, d));
  let i = 1; while (i < r.cum.length - 1 && r.cum[i] < d) i++;
  const a = r.pts[i - 1], b = r.pts[i], l = r.cum[i] - r.cum[i - 1] || 1, u = (d - r.cum[i - 1]) / l;
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
};

test('the route runs down the esophagus and under the fundus, inside them with the scope’s whole width, to its station over the varix', () => {
  const r = route();
  for (let d = r.spans.eso[0] + 30; d <= r.total; d += 2) {
    const p = at(r, d).p;
    assert.ok(inside(stomach, p) && distTo(stomach, p, true) >= EUS_SCOPE_R, `clear of the wall at ${p.map((v) => v.toFixed(0))}: ${distTo(stomach, p, true).toFixed(1)}`);
    // (Never over the gastrorenal shunt or the varix's arch: the scope lies above them.)
    for (const id of ['C5', 'C2']) assert.ok(distTo(geo[id].cur, p) > EUS_SCOPE_R + 4, `the scope over ${id} at ${p.map((v) => v.toFixed(0))}`);
  }
  const end = r.pts.at(-1);
  assert.ok(Math.hypot(end[0] - EUS_GLUE_STATION.at[0], end[1] - EUS_GLUE_STATION.at[1]) < 0.5, 'the route ends at the station');
  assert.ok(distTo(geo[EUS_GLUE_TARGET[0]].cur, r.tg.pv) < 0.5, 'the target is on the varix');
});

// His ask: "make sure the EUS scope doesn't bend in very acute angles, the angle should aim into the varix".
test('every frame the scope stays inside the esophagus and the stomach and bends gently; the needle goes square from it into the varix', () => {
  const r = route(), top = at(r, r.spans.eso[0] + 30).p[1];
  let worst = Infinity, where = '', tight = Infinity, tightAt = '', coils = 0;
  for (const t of times) {
    const f = procFrame('eusglue', t);
    if (!(f.opacity > 0.01) || !(f.u > 0.01)) continue;
    const tipD = r.start + (r.free - r.start) * f.u;
    const o = eusDraw({ ...f, ring: null, clock: t }, r, tipD, at, () => [0.5, 0.5, 0.5]), L = o.line;
    for (let i = 0; i < L.n; i++) {
      const p = [L.x[i], L.y[i]];
      if (p[1] < top) continue;
      const d = inside(stomach, p) ? distTo(stomach, p, true) : -distTo(stomach, p, true);
      if (d < worst) { worst = d; where = `${t} ms at ${p.map((v) => v.toFixed(0))}`; }
      if (i > 1 && i < L.n - 1) {
        const ax = L.x[i] - L.x[i - 1], ay = L.y[i] - L.y[i - 1], bx = L.x[i + 1] - L.x[i], by = L.y[i + 1] - L.y[i];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la > 0.3 && lb > 0.3) { const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)), rad = ((la + lb) / 2) / Math.max(turn, 1e-9); if (rad < tight) { tight = rad; tightAt = `${t} ms at ${p.map((v) => v.toFixed(0))}`; } }
      }
    }
    if (f.needle >= 0.999) assert.ok(Math.hypot(o.needle[0] - r.tg.pv[0], o.needle[1] - r.tg.pv[1]) < 0.5, `the needle's point in the varix at ${t}`);
    if (f.coil > 0.01) { coils++; assert.ok(o.coil >= 0 && o.draws.some((d) => d.mode === 3 && d.first >= o.coil), `the coil drawn at ${t}`); }
  }
  assert.ok(coils > 0);
  assert.ok(worst >= EUS_SCOPE_R - 1, `the scope reaches the wall: ${worst.toFixed(1)} from it, ${where}`);
  assert.ok(tight >= EUS_RHO * 0.6, `the scope bends to a radius of ${tight.toFixed(1)}, ${tightAt}`);
  // At the station: straight (its bending section not turned), the needle square to it and down into the varix, clear of the shunt and of
  // the arch where the feeder meets it; the varix is entered across its course, not along it.
  const S = EUS_GLUE_STATION, g = eusPose(r, r.free, at, r.tg.pv, 1, S.exit, S.hand, newTip());
  assert.ok(Math.abs(g.phi) < 6 * Math.PI / 180, `the tip turned ${(g.phi * 180 / Math.PI).toFixed(1)}°`);
  assert.ok(Math.abs(Math.acos(g.a1[0] * g.nd[0] + g.a1[1] * g.nd[1]) - S.exit) < 0.01, 'the needle at the elevator’s angle');
  assert.ok(inside(stomach, g.exit) && g.len > 15 && g.len < 60, `the needle ${g.len.toFixed(0)} long, from inside the stomach`);
  for (let i = 0; i <= 100; i++) {
    const p = [g.exit[0] + g.nd[0] * g.len * (i / 100), g.exit[1] + g.nd[1] * g.len * (i / 100)];
    assert.ok(inside(stomach, p), `the needle at ${p.map((v) => v.toFixed(0))} over the stomach`);
    assert.ok(distTo(geo.C5.cur, p) > 12, `the needle clear of the gastrorenal shunt at ${p.map((v) => v.toFixed(0))}`);
    if (i < 85) assert.ok(distTo(geo.C2.cur, p) > 3, `the needle runs into the varix, not along it, at ${p.map((v) => v.toFixed(0))}`);
  }
  const T0 = pointOn(geo.C2.cur, EUS_GLUE_TARGET[1] - 0.02), T1 = pointOn(geo.C2.cur, EUS_GLUE_TARGET[1] + 0.02), tx = T1[0] - T0[0], ty = T1[1] - T0[1];
  const cross = Math.abs(tx * g.nd[1] - ty * g.nd[0]) / Math.hypot(tx, ty);
  assert.ok(cross > Math.sin(25 * Math.PI / 180), `the needle meets the varix at ${(Math.asin(Math.min(1, cross)) * 180 / Math.PI).toFixed(0)}°`);
  // The result's shot takes in the whole varix and the scope over it.
  for (const q of geo.C2.cur) assert.ok(q[0] >= r.result[0] && q[0] <= r.result[2] && q[1] >= r.result[1] && q[1] <= r.result[3]);
});

test('in the model the glue obliterates the fundal varix and stops its flow, with the shunt open; the spleen is still treated after it', () => {
  const run = (p) => { const e = new Engine(); e.loadPreset('svt'); e.setParams(deepMerge(e.params, p)); e.settle(); return { e, m: computeMetrics(e) }; };
  const a = run({}), b = run(G.apply({ occluded: {} })), c = run(G.apply({ occluded: {}, splenicRx: 2 }));
  assert.ok(a.m.gastricVarix.d > 6, `fundal varix before: ${a.m.gastricVarix.d.toFixed(1)} mm`);
  assert.ok(b.m.gastricVarix.d < 2.4, `obliterated after the glue: ${b.m.gastricVarix.d.toFixed(1)} mm`);
  const Q = (r) => Math.abs(r.e.Q[(r.e.edges || EDGES).findIndex((x) => x.id === 'C2')]);
  assert.ok(Q(a) > 1 && Q(b) < Q(a) * 0.05, `flow through the varix ${Q(a).toFixed(2)} → ${Q(b).toFixed(2)}`);
  assert.ok(!b.e.params.occluded.C5, 'the gastrorenal shunt stays open');
  assert.ok(c.m.spleen.platelets > b.m.spleen.platelets, 'the spleen’s treatment still raises the platelets after the glue');
});

// His ask, 7 Nov 2026: the coils "should deploy and be within the varix vessel walls not outside". Every vertex of the coil as drawn (both of
// its layers, the wire's dark edge included, so its outer edge and not only its middle) lies inside the varix's lumen: no further from the
// vessel's centreline than its radius, for a narrow, a middling and a wide varix, at every moment the coil is out. The drawing is in the
// figure's own units, so this holds at every zoom. A lumen too narrow for the wire gets no coil.
test('the coil deploys inside the varix’s walls, for any lumen, every frame it is out', () => {
  const r = route(), C = geo[EUS_GLUE_TARGET[0]].cur;
  for (const rad of [1.6, 2.5, 4, 6, 9]) {
    r.glue.rad = rad;
    let drawn = 0, worst = 0, reach = 0;
    for (const t of times) {
      const f = procFrame('eusglue', t);
      if (!(f.coil > 0.01) || !(f.opacity > 0.01)) continue;
      const o = eusDraw({ ...f, ring: null, clock: t }, r, r.start + (r.free - r.start) * f.u, at, () => [0.5, 0.5, 0.5]);
      assert.ok(o.coil >= 0, `the coil drawn at ${t}, lumen ${rad}`);
      const layers = o.draws.filter((d) => d.first >= o.coil && (d.mode === 3 || d.mode === 7));
      assert.equal(layers.length, 2, 'its steel on its dark edge');
      for (const d of layers) for (let i = d.first; i < d.first + d.count; i++) {
        const p = [o.V[i * 6], o.V[i * 6 + 1]], dd = distTo(C, p);
        worst = Math.max(worst, dd); reach = Math.max(reach, Math.hypot(p[0] - r.tg.pv[0], p[1] - r.tg.pv[1]));
      }
      drawn++;
    }
    assert.ok(drawn > 10, `lumen ${rad}: the coil is out`);
    assert.ok(worst <= rad, `lumen ${rad}: the coil reaches ${worst.toFixed(2)} from the centreline, past the wall`);
    assert.ok(reach < rad * 3.2 + 2, `lumen ${rad}: the coil stays round the needle's point (${reach.toFixed(1)})`);
  }
  r.glue.rad = EUS_COIL_EDGE * 0.9;
  const f = procFrame('eusglue', T.coil1);
  assert.equal(eusDraw({ ...f, ring: null, clock: T.coil1 }, r, r.free, at, () => [0.5, 0.5, 0.5]).coil, -1, 'no coil in a lumen narrower than its wire');
});

// His ask, 8 Nov 2026: "the coils should emerge from the needle". The coil starts at the needle's point (the needle in the varix while it is
// pushed out), grows from there as more is pushed (its reach from the point never shrinking, past a loop's turn), and the part already out keeps its
// place: the coil at a third pushed lies on the coil fully pushed.
test('the coil comes out of the needle\'s point and grows from it, the part already out staying put', () => {
  const r = route();
  r.glue.rad = 5;
  const pull = (k) => {
    const f = procFrame('eusglue', T.coil0 + (T.coil1 - T.coil0) * 0.5);
    const o = eusDraw({ ...f, coil: k, ring: null, clock: 0 }, r, r.free, at, () => [0.5, 0.5, 0.5]);
    const d = o.draws.find((x) => x.first >= o.coil && x.mode === 3), pts = [];
    for (let i = d.first; i < d.first + d.count; i += 2) pts.push([(o.V[i * 6] + o.V[i * 6 + 6]) / 2, (o.V[i * 6 + 1] + o.V[i * 6 + 7]) / 2]);
    return { pts, needle: o.needle && [...o.needle], f };
  };
  const full = pull(1);
  assert.equal(full.f.needle, 1, 'the needle in while the coil goes out');
  const T0 = r.tg.pv;
  assert.ok(Math.hypot(full.needle[0] - T0[0], full.needle[1] - T0[1]) < 0.5, 'the needle\'s point at the varix');
  let last = 0;
  for (const k of [0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1]) {
    const c = pull(k), p0 = c.pts[0], pe = c.pts.at(-1);
    assert.ok(Math.hypot(p0[0] - T0[0], p0[1] - T0[1]) < 0.3, `pushed ${k}: the coil starts at the needle's point`);
    const far = Math.max(...c.pts.map((p) => Math.hypot(p[0] - T0[0], p[1] - T0[1])));
    assert.ok(far >= last - 0.25, `pushed ${k}: the coil reaches no less far than before (${far.toFixed(2)} < ${last.toFixed(2)})`);
    last = far;
    if (k < 1) for (const p of c.pts) {
      let m = Infinity;
      for (let i = 1; i < full.pts.length; i++) m = Math.min(m, segD(p, full.pts[i - 1], full.pts[i]));
      assert.ok(m < 0.35, `pushed ${k}: the part out keeps its place (${m.toFixed(2)} off the coil at full)`);
    }
    if (k <= 0.05) assert.ok(Math.hypot(pe[0] - T0[0], pe[1] - T0[1]) < 5, `pushed ${k}: only the coil's first bit out`);
  }
  assert.ok(last > 10, `the coil laid along the varix (${last.toFixed(1)})`);
});
