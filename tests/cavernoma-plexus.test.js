// The periportal plexus of a cavernous transformation (C8) hugs the occluded portal trunk on both sides, its channels never cross, it stays clear of
// the hepatic artery, and it leaves and rejoins the open stumps of the trunk below and above the clot, away from the crowded confluence and hilum
// nodes (13 Nov 2026, Mohammad's shots of 0dd1522f, fbf7941f and 257136bf: one-sided, crossing strands and a torn patch at the hilum). Checked on
// the numbers the stage draws from: the main channel's course, its strands as stage-frame.js strandAt makes them (STRAND_PLATEAU), and the trunk's
// own meandered course.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH, END_HOSTS, NODE_POS, STRANDS, STRAND_PLATEAU, WIG_CAP } from '../src/ui/anatomy.js';
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
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const base = sample(EDGE_PATH.C8), pv = meander(sample(EDGE_PATH.PV_TRUNK), 'PV_TRUNK'), ha = poly(EDGE_PATH.A_HEP);
// The strands as strandAt draws them, with the main channel's serpentine at its widest (WIG_CAP).
const main = wiggle(base, WIG_CAP.C8, 'C8'.length);
const strandOf = (off, ride) => {
  const A = base[0], B = base[N - 1], cl = Math.hypot(B[0] - A[0], B[1] - A[1]), nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl, pa = STRAND_PLATEAU.C8;
  return base.map((p, i) => { const v = i / (N - 1), o = off * sm(v / pa) * sm((1 - v) / pa); return [p[0] + nx * o + ride * (main[i][0] - p[0]), p[1] + ny * o + ride * (main[i][1] - p[1])]; });
};
const strands = STRANDS.C8.map(([off, ride]) => strandOf(off, ride));
const channels = [main, ...strands];
// Signed distance of a point from a course (+: the hepatic artery's side of the trunk).
function sideOf(P, p) {
  let best = Infinity, sg = 1;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best) { best = d; sg = Math.sign(dx * (p[1] - qy) - dy * (p[0] - qx)) || 1; }
  }
  return sg * best;
}
const haSide = Math.sign(sideOf(pv, ha[Math.floor(ha.length / 2)]));
const side = (p) => sideOf(pv, p) * haSide;
const mid = (S) => S[N >> 1];

test('the plexus hugs the clotted trunk on both sides: channels on each side, clear of its wall and close to it', () => {
  const at = channels.map((S) => side(mid(S)));
  assert.ok(at.some((d) => d > 0) && at.some((d) => d < 0), `channels on one side only (${at.map((d) => d.toFixed(1))})`);
  for (const d of at) assert.ok(Math.abs(d) >= 6.4 && Math.abs(d) <= 20, `a channel lies ${d.toFixed(1)} from the trunk's centreline (on its wall, or off from it)`);
});

test('the first strand to grow in lies on the other side of the trunk from the main channel', () => {
  assert.notEqual(Math.sign(side(mid(main))), Math.sign(side(mid(strands[0]))));
});

test('no two channels cross: along the whole plexus each keeps its place across the trunk, a clear gap apart', () => {
  for (let i = 1; i < N - 1; i++) {
    const at = channels.map((S) => side(S[i]));
    const order = at.map((d, k) => [d, k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join();
    if (i > 8 && i < N - 9) assert.equal(order, channels.map((S, k) => [side(mid(S)), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(), `channels swap places at sample ${i}`);
    for (let a = 0; a < channels.length; a++) for (let b = a + 1; b < channels.length; b++) {
      if (i > 12 && i < N - 13) assert.ok(Math.hypot(channels[a][i][0] - channels[b][i][0], channels[a][i][1] - channels[b][i][1]) > 6.5, `channels ${a} and ${b} touch at sample ${i}`);
    }
  }
});

test('the plexus keeps off the hepatic artery: no channel comes within 4.2 units of it (measured on screen: its radius 2.2 and the fine strand\'s 1.3, and a gap)', () => {
  for (const [k, S] of channels.entries()) for (let i = 0; i < N; i++) {
    const d = Math.abs(sideOf(ha, S[i]));
    assert.ok(d > 4.2, `channel ${k} is ${d.toFixed(1)} from the hepatic artery at sample ${i}`);
  }
});

test('the plexus leaves and rejoins the trunk\'s open stumps, on its centreline, away from the confluence and the hilum nodes', () => {
  for (const p of [base[0], base[N - 1]]) {
    assert.ok(Math.abs(sideOf(pv, p)) < 0.6, `an end lies ${sideOf(pv, p).toFixed(2)} off the trunk's centreline`);
    for (const n of ['CONF', 'PVH']) assert.ok(Math.hypot(p[0] - NODE_POS[n][0][0], p[1] - NODE_POS[n][0][1]) > 21, `an end lies within the join reach of ${n}`);
  }
  for (const S of strands) for (const i of [0, N - 1]) assert.ok(Math.hypot(S[i][0] - base[i][0], S[i][1] - base[i][1]) < 0.01, 'a strand ends off its channel');
  assert.deepEqual(END_HOSTS.C8, ['PV_TRUNK'], 'the plexus may join only the trunk (its upper end lies over the IVC in the picture)');
});

test('no channel kinks where it is seen (outside the trunk\'s wall)', () => {
  for (const [k, S] of channels.entries()) for (let i = 2; i < N; i++) {
    if (Math.abs(side(S[i - 1])) < 6) continue;
    const ax = S[i - 1][0] - S[i - 2][0], ay = S[i - 1][1] - S[i - 2][1], bx = S[i][0] - S[i - 1][0], by = S[i][1] - S[i - 1][1];
    const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    assert.ok(c > Math.cos(Math.PI / 6), `channel ${k} turns ${(Math.acos(c) * 180 / Math.PI).toFixed(0)} degrees at sample ${i}`);
  }
});
