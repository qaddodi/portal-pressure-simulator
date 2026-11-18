// The periportal plexus of a cavernous transformation (C8): the main channel on the patient's right of the clotted trunk, and channels on both sides of it (CAV_CHANNELS, drawn in the frame of the
// trunk by cavernoma-strand.js: "both sides and curved", each leaving and rejoining the trunk at its own place, 17 Nov 2026, Mohammad's T3 mock). Each is one whole vessel from stump to stump, never
// crossing another, and it grows in whole (never an end in the air) as the recruitment rises. Checked on the numbers the stage draws from: the main channel's course, the strands as
// stage-frame.js strandAt makes them, and the trunk's own meandered course. (13 Nov 2026: crossing strands and a torn patch at the hilum; what the plexus joins is tests/cavernoma-joins.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAV_CHANNELS, CAV_GROW, EDGE_PATH, END_HOSTS, JOIN_REFUSED, NODE_POS, STRANDS, STRAND_PLATEAU, STRAND_WAVE, WIG_CAP } from '../src/ui/anatomy.js';
import { clotStretch } from '../src/ui/clot-shape.js';
import { CAV_MAIN_FROM, cavGrow, cavOffset, cavStrand, frameAt, trunkFrame } from '../src/ui/cavernoma-strand.js';
// (stage-paths.js reaches the page's helpers, which look for the browser's globals when they load.)
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { createPaths } = await import('../src/ui/stage-paths.js');

const N = 64;
const { wiggle, meander } = createPaths({ N_SAMPLES: N, scratchG: null });
// An absolute 'M … C …' path as N samples equally spaced along its length (as the stage samples it).
function sample(d) {
  const v = d.match(/-?[\d.]+/g).map(Number), fine = [];
  for (let j = 2; j + 5 < v.length; j += 6) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = v.slice(j - 2, j + 6);
    for (let k = j === 2 ? 0 : 1; k <= 200; k++) { const t = k / 200, u = 1 - t; fine.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]); }
  }
  const cum = [0];
  for (let k = 1; k < fine.length; k++) cum.push(cum[k - 1] + Math.hypot(fine[k][0] - fine[k - 1][0], fine[k][1] - fine[k - 1][1]));
  const L = cum.at(-1), out = [];
  for (let q = 0, j = 0; q < N; q++) {
    const s = (L * q) / (N - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([fine[j][0] + (fine[j + 1][0] - fine[j][0]) * f, fine[j][1] + (fine[j + 1][1] - fine[j][1]) * f]);
  }
  return out;
}
// (A polyline 'M x y L x y …' path, the hepatic artery's.)
const poly = (d) => { const v = d.match(/-?[\d.]+/g).map(Number), o = []; for (let i = 0; i + 1 < v.length; i += 2) o.push([v[i], v[i + 1]]); return o; };
const base = sample(EDGE_PATH.C8), pv = [meander(sample(EDGE_PATH.PV_TRUNK_1), 'PV_TRUNK_1'), meander(sample(EDGE_PATH.PV_TRUNK), 'PV_TRUNK')],   // (the trunk is cut where the coronary vein joins it: its two pieces end to end)
  ha = poly(EDGE_PATH.A_HEP), F = trunkFrame(pv), pvAll = [...pv[0], ...pv[1]];
// The main channel as drawn, with its serpentine at its widest (WIG_CAP); the strands as strandAt draws them (cavStrand, in the anatomy).
const main = wiggle(base, WIG_CAP.C8, 'C8'.length);
const defs = CAV_CHANNELS.C8, strands = defs.map((c) => cavStrand(F, c, N, 0, main)), channels = [main, ...strands];
// Signed distance of a point from a course (+: the hepatic artery's side of the trunk).
function sideOf(P, p) {
  let best = Infinity, sg = 1;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy,
      t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)), qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best) { best = d; sg = Math.sign(dx * (p[1] - qy) - dy * (p[0] - qx)) || 1; }
  }
  return sg * best;
}
const haSide = Math.sign(sideOf(pvAll, ha[Math.floor(ha.length / 2)]));
const side = (p) => sideOf(pvAll, p) * haSide;   // (+: the hepatic artery's side)
const mid = (S) => S[N >> 1];
const distTo = (P, p) => { let best = Infinity; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return best; };
const arcAt = (p) => { let bu = 0, bd = Infinity; const o = [0, 0, 0, 0]; for (let u = 0; u <= F.L; u += 0.25) { frameAt(F, u, o); const d = Math.hypot(p[0] - o[0], p[1] - o[1]); if (d < bd) { bd = d; bu = u; } } return bu; };

test('the plexus lies on both sides of the clotted trunk, close to it and as many on each, the main channel on the patient\'s right and the artery\'s side the lane beside it', () => {
  assert.equal(STRANDS.C8.length, defs.length, 'one strand for each channel');
  const at = channels.map((S) => side(mid(S)));
  for (const d of at) assert.ok(Math.abs(d) >= 6 && Math.abs(d) <= 48, `a channel lies ${d.toFixed(1)} from the trunk's centreline (on its wall, or off from it)`);
  const right = at.filter((d) => d < 0), art = at.filter((d) => d > 0);
  assert.ok(right.length >= 3 && art.length >= 3, `channels on one side only (${at.map((d) => d.toFixed(1))})`);
  assert.ok(Math.abs(right.length - art.length) <= 1, `one side holds ${right.length} channels and the other ${art.length}: ${at.map((d) => d.toFixed(1))}`);
  assert.ok(side(mid(main)) < 0, 'the main channel is on the patient\'s right of the trunk, away from the hepatic artery');
});

test('the channels grow in one after another, on alternate sides: the main channel first, never lopsided by more than one, each the next in caliber and further out', () => {
  const order = defs.map((c, i) => ({ r0: c.r0, side: Math.sign(c.v), k: c.k, i }));
  for (let i = 1; i < order.length; i++) assert.ok(order[i].r0 > order[i - 1].r0, `channel ${i} begins at ${order[i].r0}, no later than the one before`);
  assert.ok(order[0].r0 > 0 && order.at(-1).r0 + CAV_GROW <= 1, 'every channel is full grown by full recruitment, and none is there at none');
  // (The main channel is on the right; each next channel makes the sides one apart at most.)
  let right = 1, art = 0;
  for (const o of order) {
    if (o.side > 0) right++; else art++;
    assert.ok(Math.abs(right - art) <= 1, `after channel ${o.i + 1} the sides hold ${right} and ${art}`);
  }
  assert.ok(defs.every((c) => c.k > 0 && c.k <= 1), 'a channel is never wider than the main one');
});

test('every channel is one whole vessel, on the trunk\'s centreline at both ends, each end at its own place on the stump, and none within 8 of the confluence or the hilum nodes', () => {
  const ends = [];
  for (const [k, S] of channels.entries()) for (const [i, name] of [[0, 'CONF'], [N - 1, 'PVH']]) {
    const p = S[i];
    assert.ok(Math.abs(side(p)) < 0.6, `channel ${k} ends ${side(p).toFixed(2)} off the trunk's centreline`);
    assert.ok(Math.hypot(p[0] - NODE_POS[name][0][0], p[1] - NODE_POS[name][0][1]) > 8, `channel ${k} ends within 8 of ${name}`);
    ends.push({ k, name, u: name === 'CONF' ? arcAt(p) : F.L - arcAt(p) });
  }
  // (Spread along each stump, 2.2 apart at least so no two ends are one blob, and over 14 units or more: "connected at different places proximally and distally".)
  for (const name of ['CONF', 'PVH']) {
    const us = ends.filter((e) => e.name === name).map((e) => e.u).sort((a, b) => a - b);
    assert.ok(us.at(-1) - us[0] >= 14, `the ends at ${name} lie within ${(us.at(-1) - us[0]).toFixed(1)} of each other (spread them)`);
    for (let i = 1; i < us.length; i++) assert.ok(us[i] - us[i - 1] >= 2.2, `two ends at ${name} lie ${(us[i] - us[i - 1]).toFixed(1)} apart`);
  }
  // (They nest: on each side the farther channel leaves the trunk, and rejoins it, nearer its node than the one inside it, so none crosses another.)
  for (const sgn of [1, -1]) {
    const on = defs.filter((c) => Math.sign(c.v) === sgn).sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
    for (let i = 1; i < on.length; i++) assert.ok(on[i].a < on[i - 1].a && on[i].z < on[i - 1].z, `the channel at ${on[i].v} does not nest outside the one at ${on[i - 1].v}`);
    if (sgn > 0) assert.ok(on[0].a < CAV_MAIN_FROM && on[0].z < CAV_MAIN_FROM, 'the first channel on the main channel\'s side nests outside it (it leaves at 22)');
  }
  assert.deepEqual(END_HOSTS.C8, ['PV_TRUNK_1', 'PV_TRUNK'], 'the plexus may join only the trunk (its upper end lies over the IVC in the picture)');
});

test('no two channels run into each other along their bodies: past the stumps\' ramps (where they leave the trunk together) their centre lines keep 2.4 units apart', () => {
  for (let a = 0; a < strands.length; a++) for (let b = 0; b < channels.length; b++) {
    if (channels[b] === strands[a]) continue;
    const c = defs[a], ramp = c.ramp ?? 17;
    for (let i = 0; i < N; i++) {
      const p = strands[a][i], u = arcAt(p);
      if (u < c.a + ramp || u > F.L - c.z - ramp) continue;
      assert.ok(distTo(channels[b], p) > 2.4, `channel ${a + 1} meets channel ${b} at sample ${i}`);
    }
  }
});

test('the coronary vein crosses the plexus and ends on the trunk: no channel ends at it or beside it, and no vessel\'s end may open into a channel', () => {
  assert.ok(JOIN_REFUSED.has('C8'), 'the plexus is passed over, never joined (vein-joins.js)');
  const cor = sample(EDGE_PATH.LGV_CONF), end = cor[N - 1];
  assert.ok(Math.abs(sideOf(pvAll, end)) < 6, 'the coronary vein ends on the trunk');
  const u = arcAt(end);
  for (const [k, S] of strands.entries()) for (const i of [0, N - 1]) assert.ok(Math.abs(arcAt(S[i]) - u) > 3, `strand ${k} ends at the coronary vein's end`);
});

test('the plexus keeps off the hepatic artery along the body of each channel: the lane channel clear of it, the outer ones crossing it only where they leave and rejoin the trunk (veins are drawn over the artery)', () => {
  for (const [k, S] of channels.entries()) {
    const outer = k > 0 && defs[k - 1].v < -12;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(sideOf(ha, S[i]));
      if (outer) { if (i > N * 0.25 && i < N * 0.75) assert.ok(d > 4.2, `outer channel ${k} is ${d.toFixed(1)} from the hepatic artery at sample ${i}`); }
      else assert.ok(d > 4.2, `channel ${k} is ${d.toFixed(1)} from the hepatic artery at sample ${i}`);
    }
  }
  // (The lane channel sits between the clot and the artery.)
  assert.ok(defs[0].v < 0 && defs[0].v > -10, 'the first strand lies in the lane between the clot and the artery');
});

test('no channel kinks where it is seen (outside the trunk\'s wall)', () => {
  for (const [k, S] of channels.entries()) for (let i = 2; i < N; i++) {
    if (Math.abs(side(S[i - 1])) < 6) continue;
    const ax = S[i - 1][0] - S[i - 2][0], ay = S[i - 1][1] - S[i - 2][1], bx = S[i][0] - S[i - 1][0], by = S[i][1] - S[i - 1][1];
    const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    assert.ok(c > Math.cos((35 * Math.PI) / 180), `channel ${k} turns ${(Math.acos(c) * 180 / Math.PI).toFixed(0)} degrees at sample ${i}`);
  }
});

test('in the circuit every channel folds onto the main channel\'s lane, whole, and the offset is zero outside its stretch', () => {
  for (const [k, c] of defs.entries()) {
    const S = cavStrand(F, c, N, 1, main);
    for (let i = 0; i < N; i++) assert.ok(distTo(main, S[i]) < 0.5, `channel ${k} sample ${i} is ${distTo(main, S[i]).toFixed(2)} off the main channel's lane in the circuit`);
    assert.equal(cavOffset(c, c.a - 1, F.L), 0, 'no offset before it leaves the trunk');
    assert.equal(cavOffset(c, F.L - c.z + 1, F.L), 0, 'no offset after it rejoins it');
  }
  const half = cavStrand(F, defs[1], N, 0.5, main);
  assert.ok(Math.abs(side(mid(half))) < Math.abs(side(mid(strands[1]))), 'part-way to the circuit the channel is nearer the lane');
});

test('the cavernoma keeps no plateau or wave of its own any more (its channels are drawn in the trunk\'s frame)', () => {
  assert.equal(STRAND_PLATEAU.C8, undefined);
  assert.equal(STRAND_WAVE.C8, undefined);
});

test('a channel grows in whole with the recruitment: none before it begins, all of it by full recruitment, wider at every step, and the main channel is the first', () => {
  for (const c of defs) {
    assert.equal(cavGrow(0, c.r0), 0, 'none at no recruitment');
    assert.equal(cavGrow(c.r0, c.r0), 0, 'none at the moment it begins');
    assert.equal(cavGrow(1, c.r0), 1, 'whole by full recruitment');
    let last = -1;
    for (let r = 0; r <= 1.0001; r += 0.05) { const g = cavGrow(r, c.r0); assert.ok(g >= last, `channel at ${c.v} narrows at recruitment ${r.toFixed(2)}`); last = g; }
  }
  // (At every recruitment the number of channels showing grows, one side never more than one ahead of the other: the same count as the recruitment rises.)
  let was = 0;
  for (let r = 0; r <= 1.0001; r += 0.05) { const n = defs.filter((c) => cavGrow(r, c.r0) > 0.02).length; assert.ok(n >= was, `fewer channels at ${r.toFixed(2)}`); was = n; }
  assert.equal(was, defs.length, 'all of them at full recruitment');
});

test('every channel is anchored on the patent vein beyond the clot, never inside it, each at its own point: no two share an anchor (the stumps, and the clot over the whole trunk at every occlusion)', () => {
  const lit = (P) => P.map(() => [0, 0, 0]);
  const anchors = [];
  for (const [k, S] of channels.entries()) anchors.push({ k, end: 'CONF', u: arcAt(S[0]) }, { k, end: 'PVH', u: arcAt(S[N - 1]) });
  for (const v of [0.3, 0.6, 1]) {
    const c = clotStretch(pv.map((pts) => ({ pts, lit: lit(pts) })), v);
    assert.ok(Math.abs(c.L - F.L) < 0.5, 'the clot is laid over the whole trunk, both pieces');
    for (const a of anchors) assert.ok(a.u < c.from - 2 || a.u > c.to + 2, `channel ${a.k}'s ${a.end} anchor (${a.u.toFixed(1)}) lies in the clot (${c.from.toFixed(1)} to ${c.to.toFixed(1)}) at occlusion ${v}`);
  }
  for (const end of ['CONF', 'PVH']) {
    const us = anchors.filter((a) => a.end === end).map((a) => a.u).sort((a, b) => a - b);
    assert.equal(us.length, channels.length);
    for (let i = 1; i < us.length; i++) assert.ok(us[i] - us[i - 1] >= 2, `two channels share the ${end} anchor (${us[i - 1].toFixed(1)}, ${us[i].toFixed(1)})`);
  }
});
