// The stent as a device (look T2, Mohammad 13 Nov 2026, stent-mesh.js stentLookD): rings placed on the tube, a white graft over the covered
// stretch (white where the light falls, nearly clear on the shaded side), an open stretch at the portal end ending in round crowns, a gold
// band where the graft starts; the veins' and the stent tool's stents the open stretch alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BARE_CM, GRAFT_LEVELS, bareOf, graftAlpha, stentLookD } from '../src/ui/stent-mesh.js';

// A straight vessel along +x, half-width 12 (so the mocks' unit is 1): f(a, v) = [a, 12 v]. The light comes from the top left, so the
// side at -y is the lit one.
const R = 12, f = (a, v) => [a, R * v];
const pts = (d) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
const A = 300, bare = 80;

test('an all-bare stent (the veins\', the stent tool\'s): open rings end to end, no graft, no band', () => {
  const m = stentLookD(f, A, A);
  assert.equal(m.graft.length, 0);
  assert.equal(m.band, '');
  assert.equal(m.frontCov, '');
  const P = pts(m.frontBare + m.backBare);
  assert.ok(P.length > 100);
  for (const [x, y] of P) { assert.ok(x >= -0.01 && x <= A + 0.01, `inside its length: ${x}`); assert.ok(Math.abs(y) <= R + 1e-6, `on the tube: ${y}`); }
  assert.ok(Math.max(...P.map((p) => p[0])) > A - 20, 'it runs to the far end');
});

test('the portal end finishes in round crowns, not a straight cut', () => {
  const m = stentLookD(f, A, bare);
  const P = pts(m.frontBare), x0 = Math.min(...P.map((p) => p[0]));
  assert.ok(x0 >= 0 && x0 < 2, `the tips reach the end: ${x0}`);
  // the points at the very end are crown tips, a few across the width, not a line across it
  const tips = P.filter((p) => p[0] < x0 + 0.5);
  const ys = tips.map((p) => p[1]);
  assert.ok(tips.length >= 2 && tips.length < P.filter((p) => p[0] < 12).length / 2, 'a few tips, the rest of the first ring curving away');
  assert.ok(Math.max(...ys) - Math.min(...ys) > R / 2, 'crowns spread round the tube');
  // a crown is round: just past its tip the wire turns back slowly (cos), so points within 1 of the tip are close to it across
  assert.ok(!/ L0\.00 /.test(m.frontBare.replace(/M0\.00 [^L]*/g, '')), 'no stroke straight across at the end');
});

test('the covered stent: the graft runs from the band to a scalloped far end, inside the tube', () => {
  const m = stentLookD(f, A, bare);
  assert.ok(m.graft.length >= 3, 'fills by light level');
  const G = m.graft.flatMap(([d]) => pts(d));
  for (const [x, y] of G) { assert.ok(x >= bare - 0.01 && x <= A + 0.01, `the graft between the band and the end: ${x}`); assert.ok(Math.abs(y) <= R + 1e-6); }
  // the far end follows the last ring's crowns: the base fill's end points are spread along x, not all at one x
  const base = pts(m.graft[0][0]), far = base.filter((p) => p[0] > A - 20);
  assert.ok(Math.max(...far.map((p) => p[0])) - Math.min(...far.map((p) => p[0])) > 4, 'a scalloped end');
  const B = pts(m.band);
  assert.ok(B.length > 10 && B.every(([x]) => x >= bare - 0.01 && x <= bare + 4.01), 'the gold band at the graft\'s start, bowed with the tube');
  assert.ok(m.tab, 'the gold tab near the far end');
  assert.ok(pts(m.frontCov).every(([x]) => x > bare && x <= A + 0.01), 'the covered rings start past the band');
});

test('the graft is white where the light falls and nearly clear on the shaded side', () => {
  const m = stentLookD(f, A, bare);
  const ops = m.graft.map(([, o]) => o);
  assert.ok(Math.abs(ops[0] - graftAlpha(0)) < 0.002 && ops[0] < 0.1, 'the whole graft: a tenth of its white');
  let c = 0;
  for (const o of ops) c = 1 - (1 - c) * (1 - o);
  assert.ok(c > 0.8 && c < 0.87, `the lit side builds up to the graft's white: ${c.toFixed(3)}`);
  // each light level's fill lies on the lit side (-y), the highest one most of all
  const top = pts(m.graft.at(-1)[0]), meanY = top.reduce((s, p) => s + p[1], 0) / top.length;
  assert.ok(meanY < -2, `the brightest fill is on the lit side: ${meanY.toFixed(2)}`);
  assert.equal(GRAFT_LEVELS.length + 1, 6);
});

test('unrolled part of the way, nothing past the front is drawn', () => {
  const m = stentLookD(f, A, bare, 0.5);
  for (const d of [m.frontBare, m.backBare, m.frontCov, m.backCov, ...m.graft.map((g) => g[0])]) for (const [x] of pts(d)) assert.ok(x <= A / 2 + 0.01, `past the front: ${x}`);
  assert.equal(stentLookD(f, A, bare, 0.1).graft.length, 0, 'no graft before the front reaches it');
});

test('the bare stretch is 2 cm of the shunt, never more than two fifths of it', () => {
  assert.equal(BARE_CM, 2);
  assert.equal(bareOf(100, 8), 25);
  assert.equal(bareOf(100, 4), 40, 'a short shunt keeps some cover');
  assert.equal(bareOf(100, 0), 25, 'an unknown length is the usual 8 cm');
});
