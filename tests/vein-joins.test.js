// The joins pass (vein-joins.js) is the code it replaced, made without garbage: the same joins, in the same order, the same pairs that
// run on and the same smoothed points, on random figures, with its stores written again from one figure to the next. The reference
// below is the pass as it was in stage.js (veinJoins, smoothRunOn) and fork-joins.js (forkJoins, nodeJoins), unchanged but for the
// globals it read being arguments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { veinJoins, smoothRunOn, newJoinStore, joinKeyOf, nearCourse, runOnMiss, RUN_ON_MISS, STRAND_SNAP } from '../src/ui/vein-joins.js';
import { forkJoins, nodeJoins } from '../src/ui/fork-joins.js';

const N = 64;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ── The reference: the code before the rewrite ─────────────────────────────────────────────────────────────────────────
const refMembers = (n) => { const m = []; for (let i = 0; i < n; i++) m.push(i); return m; };
function refForkJoins(dirs) {
  const n = dirs.length;
  if (n > 4) {
    const groups = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) groups.push({ members: [a, b], fillet: 1 });
    return { groups, runOn: null };
  }
  let found = false, bestA = 0, bestB = 0, bestFil = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const u = dirs[a], v = dirs[b];
    if (!u || !v) continue;
    const fil = Math.min(1, Math.max(0, (u[0] * v[0] + u[1] * v[1] + 0.9) / 0.5));
    if (fil < (n === 2 ? 1 : 0.5) && (!found || fil < bestFil)) { found = true; bestA = a; bestB = b; bestFil = fil; }
  }
  if (!found) return { groups: [{ members: refMembers(n), fillet: 1 }], runOn: null };
  if (n === 2) return { groups: [{ members: refMembers(n), fillet: bestFil }], runOn: [bestA, bestB] };
  const ga = [bestA], gb = [bestB];
  for (let i = 0; i < n; i++) if (i !== bestA && i !== bestB) { ga.push(i); gb.push(i); }
  return { groups: [{ members: [bestA, bestB], fillet: 0 }, { members: ga, fillet: 1, trunk: bestA }, { members: gb, fillet: 1, trunk: bestB }], runOn: [bestA, bestB] };
}

const LEAD = [], STRANDS = [], LEAD_DIRS = [];
function refNodeJoins(ends) {
  LEAD.length = 0; STRANDS.length = 0;
  for (let i = 0; i < ends.length; i++) (ends[i].strand ? STRANDS : LEAD).push(i);
  const lead = LEAD, strands = STRANDS;
  if (!strands.length || lead.length < 2) {
    LEAD_DIRS.length = 0;
    for (let i = 0; i < ends.length; i++) LEAD_DIRS.push(ends[i].dir);
    return refForkJoins(LEAD_DIRS);
  }
  LEAD_DIRS.length = 0;
  for (let i = 0; i < lead.length; i++) LEAD_DIRS.push(ends[lead[i]].dir);
  const fj = refForkJoins(LEAD_DIRS);
  const groups = [];
  for (let gi = 0; gi < fj.groups.length; gi++) {
    const g = fj.groups[gi], ms = [];
    for (let k = 0; k < g.members.length; k++) ms.push(lead[g.members[k]]);
    const out = { ...g, members: ms };
    if (g.trunk != null) out.trunk = lead[g.trunk];
    groups.push(out);
  }
  const nl = lead.length, total = nl + strands.length;
  for (let a = 0; a < total; a++) {
    for (let b = Math.max(a + 1, nl); b < total; b++) {
      groups.push({ members: [a < nl ? lead[a] : strands[a - nl], strands[b - nl]], fillet: 1, strand: true });
    }
  }
  let runOn = fj.runOn;
  if (runOn) runOn = [lead[runOn[0]], lead[runOn[1]]];
  return { groups, runOn };
}



function refVeinJoins(items, nearCourse) {
  const joins = [], pairs = new Set();
  const straight = [];
  const pairKey = (a, b) => Math.min(a.row, b.row) + ':' + Math.max(a.row, b.row);
  const endOf = (it, i) => (i ? it.pts[it.pts.length - 1] : it.pts[0]);
  const rEnd = (it, i) => it.obj.glR[i ? N - 1 : 0];
  const add = (ends, c, trunk) => {
    const uniq = [...new Map(ends.map((e) => [e[0].row, e])).values()];
    if (uniq.length < 2) return;
    const reachOf = (list) => {
      let spread = 0, rMin = Infinity, rMax = 0;
      for (const [it, i] of list) {
        const q = i == null ? c : endOf(it, i), r = i == null ? it.obj.glMaxR : rEnd(it, i);
        spread = Math.max(spread, Math.hypot(q[0] - c[0], q[1] - c[1]));
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      }
      return { spread, rMin, rMax };
    };
    const isStrand = ([it]) => it.kind === 's';
    const all = reachOf(uniq), own = uniq.some(isStrand) ? reachOf(uniq.filter((e) => !isStrand(e))) : all;
    const kOf = (m) => clamp(1.2 * m.rMin + 1.2, 1.5, 11);
    const dir = ([it, i]) => { if (i == null) return null; const P = it.pts, n = P.length, a = i ? P[n - 1] : P[0], b = i ? P[Math.max(0, n - 4)] : P[Math.min(n - 1, 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    const { groups, runOn } = refNodeJoins(uniq.map((e) => ({ dir: dir(e), strand: isStrand(e) })));
    if (runOn) straight.push({ a: uniq[runOn[0]][0].row, ia: uniq[runOn[0]][1], b: uniq[runOn[1]][0].row, ib: uniq[runOn[1]][1], fork: uniq.filter((e) => !isStrand(e)).length > 2, x: c[0], y: c[1], o: uniq.filter((e) => isStrand(e) && e[1] != null).flatMap(([it, i]) => [it.row, i]) });
    const rows = uniq.map(([it]) => it);
    for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) pairs.add(pairKey(rows[a], rows[b]));
    for (const g of groups) {
      const k = kOf(g.strand ? all : own), reach = all.spread + 2 * all.rMax + k + 6;
      joins.push({ x: c[0], y: c[1], reach, k, fillet: g.fillet, members: g.members.map((i) => rows[i].row), trunk: g.trunk != null ? rows[g.trunk].row : trunk, fork: g.trunk != null });
    }
  };
  const byNode = new Map();
  for (const it of items) {
    if (it.kind === 'f') continue;
    const pre = it.x.isArt ? 'a:' : '';
    for (const i of [0, 1]) { const n = pre + (i ? it.endNode || it.x.e.to : it.x.e.from); if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push([it, i]); }
  }
  for (let ends of byNode.values()) {
    while (ends.length) {
      const q0 = endOf(...ends[0]);
      const near = ends.filter(([it, i]) => { const q = endOf(it, i); return Math.hypot(q[0] - q0[0], q[1] - q0[1]) < 20; });
      ends = ends.filter((e) => !near.includes(e));
      if (near.length < 2) continue;
      const c = near.reduce((a, [it, i]) => { const q = endOf(it, i); return [a[0] + q[0] / near.length, a[1] + q[1] / near.length]; }, [0, 0]);
      add(near, c);
    }
  }
  const n = items.length, bx = new Float64Array(4 * n), art = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const it = items[k], P = it.pts, m = it.obj.glMaxR + 4;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    bx[4 * k] = x0 - m; bx[4 * k + 1] = y0 - m; bx[4 * k + 2] = x1 + m; bx[4 * k + 3] = y1 + m;
    art[k] = it.x.isArt ? 1 : 0;
  }
  for (let a = 0; a < n; a++) {
    const it = items[a];
    for (let i = 0; i < 2; i++) {
      const q = endOf(it, i), qx = q[0], qy = q[1], rq = rEnd(it, i);
      for (let k = 0; k < n; k++) {
        if (k === a || art[k] !== art[a] || qx < bx[4 * k] || qx > bx[4 * k + 2] || qy < bx[4 * k + 1] || qy > bx[4 * k + 3]) continue;
        const y = items[k];
        if (y === it || pairs.has(pairKey(it, y))) continue;
        if (nearCourse(y.pts, q, y.obj.glMaxR + 0.5 * rq + 2)) add([[it, i], [y, null]], q, y.x.e.id === it.x.e.id ? undefined : y.row);
      }
    }
  }
  return { joins, straight };
}
const refRunOnSamples = (it, n) => (it.ra ? Math.max(2, Math.round(n * (1 - it.f))) : n);
function refSmoothRunOn(items, straight) {
  const out = new Map(), byRow = new Map(items.map((it) => [it.row, it])), E = 10;
  const pt = (P, i, end) => (end ? P[P.length - 1 - i] : P[i]);
  for (const { a, ia, b, ib, x, y, o } of straight) {
    const A = byRow.get(a), B = byRow.get(b);
    if (!A || !B) continue;
    const PA = out.get(a) || A.pts.map((q) => q.slice()), PB = out.get(b) || B.pts.map((q) => q.slice());
    if (PA.length < 2 * E + 2 || PB.length < 2 * E + 2) continue;
    // (Since 6 Nov the stretch shortens, 10 → 6 → 4 → 2 samples, until the curve passes within RUN_ON_MISS of the join: the
    // midpoint of the two ends. vein-joins.js smoothRunOn.)
    const ea = pt(PA, 0, ia), eb = pt(PB, 0, ib), J = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
    let e = E, Ea, Eb, bez;
    for (;;) {
      Ea = refRunOnSamples(A, e); Eb = refRunOnSamples(B, e);
      const p0 = pt(PA, Ea, ia), p0b = pt(PA, Ea + 1, ia), p3 = pt(PB, Eb, ib), p3b = pt(PB, Eb + 1, ib);
      const L = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / 3;
      const ta = [p0[0] - p0b[0], p0[1] - p0b[1]], tb = [p3[0] - p3b[0], p3[1] - p3b[1]];
      const na = Math.hypot(...ta) || 1, nb = Math.hypot(...tb) || 1;
      const p1 = [p0[0] + (ta[0] / na) * L, p0[1] + (ta[1] / na) * L], p2 = [p3[0] + (tb[0] / nb) * L, p3[1] + (tb[1] / nb) * L];
      bez = (t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
      if (e <= 2 || runOnMiss(...p0, ...p1, ...p2, ...p3, ...J) <= RUN_ON_MISS) break;
      e = Math.max(2, Math.round(e * 0.6));
    }
    for (let i = 0; i <= Ea; i++) PA[ia ? PA.length - 1 - i : i] = bez(0.5 * (1 - i / Ea));
    for (let i = 0; i <= Eb; i++) PB[ib ? PB.length - 1 - i : i] = bez(0.5 + 0.5 * (i / Eb));
    out.set(a, PA); out.set(b, PB);
    // (The strands that end on the node end on the trunk where it passes now, easing back to their own course over STRAND_SNAP samples: vein-joins.js smoothRunOn.)
    const mid = bez(0.5), sx = mid[0] - x, sy = mid[1] - y;
    for (let k = 0; k < o.length; k += 2) {
      const it = byRow.get(o[k]);
      if (!it) continue;
      const P = out.get(o[k]) || it.pts.map((q) => q.slice());
      for (let j = 0; j <= STRAND_SNAP && j < P.length; j++) {
        const w = 1 - j / STRAND_SNAP, k2 = w * w * (3 - 2 * w), at = o[k + 1] ? P.length - 1 - j : j;
        P[at] = [P[at][0] + sx * k2, P[at][1] + sy * k2];
      }
      out.set(o[k], P);
    }
  }
  return out;
}

// ── Random figures ─────────────────────────────────────────────────────────────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Vessels between a few nodes: the ends of a node scattered round it (some within 20 of each other, some not), tributaries ending on
// another vessel's course, strands beside a collateral, a cava drawn as one (ra, f), arteries and veins apart, feeders.
function figure(seed) {
  const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
  const nodes = Array.from({ length: 3 + Math.floor(R() * 6) }, (_, k) => ({ id: 'N' + k, x: 40 + R() * 600, y: 40 + R() * 400 }));
  const items = [];
  let row = Math.floor(R() * 5);
  const course = (p, q, bend) => Array.from({ length: N }, (_, i) => { const u = i / (N - 1); return [p[0] + (q[0] - p[0]) * u + Math.sin(u * Math.PI) * bend, p[1] + (q[1] - p[1]) * u + Math.cos(u * 2) * bend * 0.3]; });
  const radii = (r0) => Float64Array.from({ length: N }, (_, i) => r0 * (0.8 + 0.4 * Math.sin(i / 9)));
  const scatter = (nd) => [nd.x + (R() - 0.5) * (R() < 0.6 ? 14 : 70), nd.y + (R() - 0.5) * (R() < 0.6 ? 14 : 70)];
  const add = (kind, from, to, isArt, extra = {}) => {
    const pts = extra.pts || course(extra.p0 || scatter(from), extra.p1 || scatter(to), (R() - 0.5) * 60);
    const glR = radii(1 + R() * 5);
    let mx = 0; for (const r of glR) mx = Math.max(mx, r);
    const it = { x: { isArt, e: { id: extra.id || 'E' + row, from: from.id, to: to.id } }, obj: { glR, glMaxR: mx }, row: row++, kind, pts, ...extra.rest };
    items.push(it); return it;
  };
  const nv = 4 + Math.floor(R() * 14);
  for (let k = 0; k < nv; k++) {
    const a = pick(nodes); let b = pick(nodes); if (b === a) b = nodes[(nodes.indexOf(a) + 1) % nodes.length];
    add('v', a, b, R() < 0.2);
  }
  // Tributaries ending on another vessel's course (the end exactly on it, or a few px off).
  for (let k = 0; k < 3 + Math.floor(R() * 4); k++) {
    const host = pick(items), at = host.pts[8 + Math.floor(R() * 48)], a = pick(nodes), b = pick(nodes);
    add('v', a, b, host.x.isArt, { p0: [at[0] + (R() - 0.5) * 6, at[1] + (R() - 0.5) * 6], p1: scatter(b), id: R() < 0.2 ? host.x.e.id : undefined });
  }
  // A collateral's strands at a node, feeders and branches.
  if (R() < 0.8) { const a = pick(nodes), b = pick(nodes); const base = add('v', a, b, false); for (let k = 0; k < 2 + Math.floor(R() * 4); k++) add('s', a, b, false, { p0: base.pts[0], p1: base.pts[N - 1] }); }
  for (let k = 0; k < Math.floor(R() * 3); k++) add('f', pick(nodes), pick(nodes), false);
  for (let k = 0; k < Math.floor(R() * 3); k++) add('c', pick(nodes), pick(nodes), false);
  // The cava drawn as one: a run-on pair, one carrying the other.
  if (R() < 0.5) { const cv = items.find((it) => it.kind === 'v' && !it.x.isArt); if (cv) { cv.ra = {}; cv.f = 0.3 + R() * 0.4; cv.endNode = pick(nodes).id; } }
  // A pair of vessels meeting head on at a node: the run-on pair the smoothing redraws.
  if (R() < 0.9) {
    const nd = pick(nodes), L = 120 + R() * 100, ang = R() * 6.28, dx = Math.cos(ang), dy = Math.sin(ang);
    const far = (s, d) => [nd.x + dx * s * d, nd.y + dy * s * d];
    add('v', nd, pick(nodes), false, { p0: [nd.x, nd.y], p1: far(L, 1) });
    add('v', pick(nodes), nd, false, { p0: far(L, -1), p1: [nd.x + (R() - 0.5), nd.y + (R() - 0.5)] });
  }
  // Rows in a shuffled order: items are not in row order.
  for (let k = items.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [items[k], items[j]] = [items[j], items[k]]; }
  return items;
}

const joinsOut = (J) => Array.from(J, (j) => ({ x: j.x, y: j.y, reach: j.reach, k: j.k, fillet: j.fillet, members: Array.from(j.members), trunk: j.trunk, fork: j.fork, key: j.key }));
const refJoinsOut = (J) => J.map((j) => ({ ...j, key: joinKeyOf(j) }));
const straightOut = (S) => Array.from(S, (s) => ({ a: s.a, ia: s.ia, b: s.b, ib: s.ib, fork: s.fork }));
const smoothOut = (items, get) => items.map((it) => { const p = get(it.row); return p ? p.map((q) => Array.from(q)) : null; });

test('the joins pass makes the joins, runs on and smoothed courses of the code it replaced, join for join and point for point', () => {
  let withRun = 0, withStrandJoin = 0, withTrunk = 0, smoothed = 0, many = 0;
  const A = newJoinStore(), B = newJoinStore();   // (two stores written again for each figure, as the frame path flips between two)
  for (let seed = 1; seed <= 300; seed++) {
    const items = figure(seed), st = seed % 2 ? A : B;
    const ref = refVeinJoins(items, nearCourse), refSm = refSmoothRunOn(items, ref.straight);
    const J = veinJoins(items, N, st), sm = smoothRunOn(items, st.straight, st);
    assert.deepEqual(joinsOut(J), refJoinsOut(ref.joins), `joins of figure ${seed}`);
    assert.deepEqual(straightOut(st.straight), straightOut(ref.straight), `runs on of figure ${seed}`);
    assert.deepEqual(smoothOut(items, (r) => sm.get(r)), smoothOut(items, (r) => refSm.get(r)), `smoothed courses of figure ${seed}`);
    withRun += ref.straight.length > 0; withStrandJoin += ref.joins.some((j) => j.members.length === 2 && items.some((it) => it.kind === 's' && j.members.includes(it.row))); withTrunk += ref.joins.some((j) => j.trunk != null);
    smoothed += refSm.size > 0; many += ref.joins.length > 8;
  }
  // (The figures reach every branch of the pass: a run-on pair, a strand pair, a trunk, a smoothed course, a crowded node.)
  assert.ok(withRun > 100 && withStrandJoin > 20 && withTrunk > 100 && smoothed > 50 && many > 30, JSON.stringify({ withRun, withStrandJoin, withTrunk, smoothed, many }));
});

test('an answer is not written over by a call given the other store (the frame path flips between two)', () => {
  const A = newJoinStore(), B = newJoinStore();
  const items1 = figure(11), items2 = figure(12);
  const J1 = veinJoins(items1, N, A), sm1 = smoothRunOn(items1, A.straight, A);
  const before = { j: joinsOut(J1), s: smoothOut(items1, (r) => sm1.get(r)) };
  veinJoins(items2, N, B); smoothRunOn(items2, B.straight, B);
  assert.deepEqual({ j: joinsOut(J1), s: smoothOut(items1, (r) => sm1.get(r)) }, before);
  // A store given nothing new gives the same answer twice.
  assert.deepEqual(joinsOut(veinJoins(items1, N, A)), before.j);
});

test('the kept answer of fork-joins is the plain one forkJoins and nodeJoins give', () => {
  const R = rng(5);
  for (let t = 0; t < 400; t++) {
    const n = 1 + Math.floor(R() * 7);
    const ends = Array.from({ length: n }, () => { const a = R() * 6.3; return { dir: R() < 0.1 ? null : [Math.cos(a), Math.sin(a)], strand: R() < 0.3 }; });
    assert.deepEqual(nodeJoins(ends), refNodeJoins(ends));
    assert.deepEqual(forkJoins(ends.map((e) => e.dir)), refForkJoins(ends.map((e) => e.dir)));
  }
});
