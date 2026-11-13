// Geometry for the shunt route audit and for the generator of the custom shunts' anatomic courses
// (scripts/gen-custom-shunt-paths.mjs, tests/shunt-routes.test.js). Pure: node only, no browser, no DOM.
//
// A shunt's drawn course "runs on top of" another vessel when it stays within the ON radius of it, heading the same way (within 25°),
// and "runs alongside" it within the PAR radius. A crossing at a decent angle is neither. Both are measured on the course sampled
// every few units, ignoring the stretch next to the shunt's own two stations (it leaves and joins vessels there).

import { EDGES } from '../src/engine/topology.js';
import { ANAT_HIDDEN, CIRCUIT_PATH, EDGE_PATH, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN_NODES, NODE_POS, metroPath } from '../src/ui/anatomy.js';

// ── sampling a path's text (M, L, C and Q only: all the stage's courses) ──
export function sampleD(d, step = 3) {
  const t = d.match(/[MLCQ]|-?[\d.]+/g), out = [];
  let i = 0, cur = null, cmd = null;
  const num = () => +t[i++];
  const line = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); };
  while (i < t.length) {
    if (/[MLCQ]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M') { cur = [num(), num()]; out.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { const q = [num(), num()]; line(cur, q); cur = q; }
    else if (cmd === 'Q') {
      const c = [num(), num()], q = [num(), num()], n = Math.max(2, Math.ceil(Math.hypot(q[0] - cur[0], q[1] - cur[1]) / step));
      for (let k = 1; k <= n; k++) { const s = k / n, u = 1 - s; out.push([u * u * cur[0] + 2 * u * s * c[0] + s * s * q[0], u * u * cur[1] + 2 * u * s * c[1] + s * s * q[1]]); }
      cur = q;
    } else {
      const c1 = [num(), num()], c2 = [num(), num()], q = [num(), num()], n = Math.max(4, Math.ceil((Math.hypot(q[0] - cur[0], q[1] - cur[1]) * 1.3) / step));
      for (let k = 1; k <= n; k++) { const s = k / n, u = 1 - s; out.push([0, 1].map((j) => u * u * u * cur[j] + 3 * u * u * s * c1[j] + 3 * u * s * s * c2[j] + s * s * s * q[j])); }
      cur = q;
    }
  }
  return out;
}

export const EDGE = Object.fromEntries(EDGES.map((e) => [e.id, e]));
export const arcLength = (P) => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; };
const tangent = (P, i) => { const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const distSeg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };
const nearest = (p, Q) => { let m = 1e9, j = 0; for (let k = 0; k < Q.length - 1; k++) { const d = distSeg(p, Q[k], Q[k + 1]); if (d < m) { m = d; j = k; } } return [m, j]; };

/** The drawn vessels (each edge's sampled course) of the anatomy, without the custom shunts. */
export function anatomyLines(custom = null) {
  const L = {};
  for (const e of EDGES) {
    if (e.kind === 'wedge' || HIDDEN_EDGES.has(e.id) || ANAT_HIDDEN.has(e.id) || e.shunt === 'custom') continue;
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    if (!a || !b) continue;
    L[e.id] = sampleD(EDGE_PATH[e.id] || `M${a[0][0]} ${a[0][1]} L ${b[0][0]} ${b[0][1]}`);
  }
  if (custom) for (const [id, d] of Object.entries(custom)) L[id] = sampleD(d);
  return L;
}
/** The circuit's fixed lines (each edge's sampled course), without the custom shunts. */
export function circuitLines() {
  const L = {};
  for (const e of EDGES) {
    if (e.kind === 'wedge' || HIDDEN_EDGES.has(e.id) || e.shunt === 'custom') continue;
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    if (!a || !b) continue;
    L[e.id] = sampleD(CIRCUIT_PATH[e.id] || metroPath(a[1], b[1]));
  }
  return L;
}
export const anatomyStations = () => Object.keys(NODE_POS).filter((id) => !HIDDEN_NODES.has(id) && !ANAT_HIDDEN_NODES.has(id)).map((id) => NODE_POS[id][0]);

/**
 * How course P of edge `id` meets the other lines of one view ('anat' or 'circ'): { total, on, par, onBy, parBy, cx }
 * (lengths of the course on top of / alongside others, with the vessel each is, and the vessels it crosses with the number of crossings).
 */
export function judge(id, P, lines, view) {
  const e = EDGE[id], mine = new Set([e.from, e.to]);
  const pos = (n) => NODE_POS[n]?.[view === 'anat' ? 0 : 1];
  const onR = view === 'anat' ? 13 : 9, parR = view === 'anat' ? 26 : 22, endFree = view === 'anat' ? 16 : 30;
  let on = 0, par = 0;
  const onBy = {}, parBy = {}, cx = {};
  for (let i = 1; i < P.length; i++) {
    const seg = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]), p = P[i], tg = tangent(P, i);
    let skip = false;
    for (const n of [e.from, e.to]) { const q = pos(n); if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < endFree) skip = true; }
    if (skip) continue;
    for (const [oid, Q] of Object.entries(lines)) {
      if (oid === id) continue;
      const o = EDGE[oid], shared = [o.from, o.to].filter((n) => mine.has(n));
      if (shared.length) { const q = pos(shared[0]); if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < endFree) continue; }
      const [dm, j] = nearest(p, Q);
      if (dm > parR) continue;
      const ot = tangent(Q, Math.min(Q.length - 1, j + 1));
      if (Math.abs(tg[0] * ot[0] + tg[1] * ot[1]) <= Math.cos((25 * Math.PI) / 180)) continue;
      if (dm < onR) { on += seg; onBy[oid] = (onBy[oid] || 0) + seg; } else { par += seg; parBy[oid] = (parBy[oid] || 0) + seg; }
    }
  }
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const [oid, Q] of Object.entries(lines)) {
    const o = EDGE[oid];
    if (oid === id || mine.has(o.from) || mine.has(o.to)) continue;
    let n = 0;
    for (let i = 1; i < P.length; i++) for (let k = 1; k < Q.length; k++) {
      if (side(P[i - 1], P[i], Q[k - 1]) * side(P[i - 1], P[i], Q[k]) < 0 && side(Q[k - 1], Q[k], P[i - 1]) * side(Q[k - 1], Q[k], P[i]) < 0) { n++; k += 3; }
    }
    if (n) cx[oid] = n;
  }
  return { total: arcLength(P), on, par, onBy, parBy, cx };
}
/** The pieces of a circuit course that are not horizontal, vertical or at 45° (within 8°), longer than 4 units. */
export function offAngles(P) {
  const bad = [];
  for (let i = 1; i < P.length; i++) {
    const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1];
    if (Math.hypot(dx, dy) < 4) continue;
    const a = (((Math.atan2(dy, dx) * 180) / Math.PI) % 180 + 180) % 180;
    if (Math.min(...[0, 45, 90, 135, 180].map((t) => Math.abs(a - t))) > 8) bad.push([P[i - 1].map(Math.round), Math.round(a)]);
  }
  return bad;
}

// ── the search: smooth courses (one cubic, or two joined smoothly at a waypoint) that keep off the other vessels ──
const NB = 12;   // direction bins over 180 degrees
const binOf = (dx, dy) => { const a = (((Math.atan2(dy, dx) * 180) / Math.PI) % 180 + 180) % 180; return Math.round(a / (180 / NB)) % NB; };
const bitsAround = (b, w = 2) => { let m = 0; for (let k = -w; k <= w; k++) m |= 1 << ((((b + k) % NB) + NB) % NB); return m; };
const rot = (v, deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
const bez = (a, b, c, d, n) => { const out = []; for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * d[j])); } return out; };

export class CurveRouter {
  constructor(step = 4) { this.step = step; }
  reset({ lines, stations, bounds, rOn = 14, rPar = 28, rStation = 17 }) {
    const [x0, y0, x1, y1] = bounds, step = this.step;
    Object.assign(this, { x0, y0, nx: Math.ceil((x1 - x0) / step) + 1, ny: Math.ceil((y1 - y0) / step) + 1, rOn, rPar, rStation });
    const N = this.nx * this.ny;
    this.on = new Uint16Array(N); this.par = new Uint16Array(N); this.thin = new Uint8Array(N); this.stn = new Uint8Array(N);
    for (const pts of lines) this.addLine(pts);
    for (const [x, y] of stations) this.stamp(this.stn, x, y, rStation, 1);
    return this;
  }
  stamp(arr, x, y, r, v) {
    const { x0, y0, nx, ny, step } = this;
    const i0 = Math.max(0, Math.ceil((x - r - x0) / step)), i1 = Math.min(nx - 1, Math.floor((x + r - x0) / step));
    const j0 = Math.max(0, Math.ceil((y - r - y0) / step)), j1 = Math.min(ny - 1, Math.floor((y + r - y0) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = x0 + i * step - x, dy = y0 + j * step - y; if (dx * dx + dy * dy < r * r) arr[j * nx + i] |= v; }
  }
  addLine(pts) {
    for (let m = 1; m < pts.length; m++) {
      const [ax, ay] = pts[m - 1], [bx, by] = pts[m], L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const bits = bitsAround(binOf(bx - ax, by - ay)), n = Math.ceil(L / 2);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        this.stamp(this.on, x, y, this.rOn, bits); this.stamp(this.par, x, y, this.rPar, bits); this.stamp(this.thin, x, y, 6, 1);
      }
    }
  }
  at(x, y) { const i = Math.round((x - this.x0) / this.step), j = Math.round((y - this.y0) / this.step); return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? -1 : j * this.nx + i; }
  /** What course P costs: lengths on top of / alongside lines, crossings, station passes, sharp bends (the ends p, q are exempt within `free`). */
  measure(P, p, q, free = 16) {
    let on = 0, par = 0, cross = 0, stn = 0, prevThin = 0, len = 0, out = 0, bend = 0;
    for (let i = 1; i < P.length; i++) {
      const seg = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      len += seg;
      const x = P[i][0], y = P[i][1];
      if (i + 1 < P.length) {
        const ax = x - P[i - 1][0], ay = y - P[i - 1][1], bx = P[i + 1][0] - x, by = P[i + 1][1] - y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la > 1e-6 && lb > 1e-6) { const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / ((la + lb) / 10); if (turn > 0.11) bend += (turn - 0.11) * ((la + lb) / 10); }
      }
      const c = this.at(x, y);
      if (c < 0) { out += seg; continue; }
      if (Math.hypot(x - p[0], y - p[1]) < free || Math.hypot(x - q[0], y - q[1]) < free) { prevThin = 1; continue; }
      const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)], bit = 1 << binOf(b[0] - a[0], b[1] - a[1]);
      if (this.on[c] & bit) on += seg; else if (this.par[c] & bit) par += seg;
      const th = this.thin[c];
      if (th && !prevThin) cross++;
      prevThin = th;
      if (this.stn[c]) stn += seg;
    }
    return { on, par, cross, stn, len, out, bend };
  }
}
// (A detour costs more and more the longer it runs: a course twice the chord is worse than crossing a handful of vessels.)
const price = (r, d) => 14 * r.on + 3.5 * r.par + 30 * r.cross + 30 * r.stn + 40 * r.out + 0.5 * (r.len - d) + 0.0012 * (r.len - d) ** 2 + 350 * r.bend;

/** The best single cubic from p to q: { ctl: [[p, c1, c2, q]], cost, r }. */
export function bestCubic(router, p, q, minBow = 0) {
  const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy), u = [dx / d, dy / d];
  let best = null;
  for (let a1 = -90; a1 <= 90; a1 += 15) for (let a2 = -90; a2 <= 90; a2 += 15) for (const hf of [0.3, 0.5, 0.75]) {
    const h = Math.max(30, hf * d), t1 = rot(u, a1), t2 = rot(u, a2);
    const c1 = [p[0] + t1[0] * h, p[1] + t1[1] * h], c2 = [q[0] - t2[0] * h, q[1] - t2[1] * h];
    const r = router.measure(bez(p, c1, c2, q, Math.max(8, Math.ceil((d * 1.3) / 5))), p, q);
    let cost = price(r, d) + (Math.abs(a1) + Math.abs(a2)) * 0.25;
    if (minBow > 0) { const B = bez(p, c1, c2, q, 24); let dev = 0; for (const b of B) dev = Math.max(dev, Math.abs(dx * (p[1] - b[1]) - (p[0] - b[0]) * dy) / d); cost += 4000 * Math.max(0, minBow - dev / d); }   // (no shunt is a straight run: it bows off its chord by at least minBow of it)
    if (!best || cost < best.cost) best = { ctl: [[p, c1, c2, q]], cost, r };
  }
  return best;
}
/** The best two cubics p → w → q, joined smoothly at a waypoint w on a lattice; only those cheaper than `cap`. */
export function bestVia(router, p, q, cap = Infinity, lattice = 24) {
  const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy), u = [dx / d, dy / d];
  let best = null;
  for (let wy = router.y0 + 20; wy < router.y0 + (router.ny - 1) * router.step - 20; wy += lattice) for (let wx = router.x0 + 20; wx < router.x0 + (router.nx - 1) * router.step - 20; wx += lattice) {
    const c = router.at(wx, wy);
    if (router.on[c] || router.stn[c]) continue;
    const d1 = Math.hypot(wx - p[0], wy - p[1]), d2 = Math.hypot(q[0] - wx, q[1] - wy);
    if (d1 < 50 || d2 < 50 || d1 + d2 > 2.2 * d + 100) continue;
    const v1 = [(wx - p[0]) / d1, (wy - p[1]) / d1], v2 = [(q[0] - wx) / d2, (q[1] - wy) / d2];
    for (const psi of [-60, -30, 0, 30, 60]) {
      const tw = rot(u, psi);
      for (const a1 of [-40, 0, 40]) for (const a2 of [-40, 0, 40]) {
        const t1 = rot(v1, a1), t2 = rot(v2, a2);
        const c1 = [p[0] + t1[0] * 0.4 * d1, p[1] + t1[1] * 0.4 * d1], c2 = [wx - tw[0] * 0.4 * d1, wy - tw[1] * 0.4 * d1];
        const c3 = [wx + tw[0] * 0.4 * d2, wy + tw[1] * 0.4 * d2], c4 = [q[0] - t2[0] * 0.4 * d2, q[1] - t2[1] * 0.4 * d2];
        const P = bez(p, c1, c2, [wx, wy], Math.max(6, Math.ceil(d1 / 5))).concat(bez([wx, wy], c3, c4, q, Math.max(6, Math.ceil(d2 / 5))).slice(1));
        const r = router.measure(P, p, q), cost = price(r, d) + (Math.abs(a1) + Math.abs(a2) + Math.abs(psi)) * 0.2 + 8;
        if (cost >= cap) continue;
        if (!best || cost < best.cost) best = { ctl: [[p, c1, c2, [wx, wy]], [[wx, wy], c3, c4, q]], cost, r };
      }
    }
  }
  return best;
}
/** A chain of cubics as path text, coordinates to a tenth of a unit. */
export function cubicsToD(ctl) {
  const f = (v) => +v.toFixed(1);
  return `M${f(ctl[0][0][0])} ${f(ctl[0][0][1])}` + ctl.map(([, a, b, c]) => ` C ${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])}`).join('');
}
/** The best course from p to q among the lines the router was reset with: one cubic, or two when the single one meets other vessels or crosses many. */
export function searchCourse(router, p, q, minBow = 0) {
  let best = bestCubic(router, p, q, minBow);
  if (best.r.on > 4 || best.r.par > 20 || best.r.cross >= 3) {
    const v = bestVia(router, p, q, best.cost);
    if (v) best = v;
  }
  // A course still on top of something (near a crowded station) gets a finer search of the waypoints.
  if (best.r.on > 10) {
    const v = bestVia(router, p, q, best.cost, 12);
    if (v) best = v;
  }
  return best;
}
