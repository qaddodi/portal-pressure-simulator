import test from 'node:test';
import assert from 'node:assert/strict';
import { forkJoins, sideEndScale } from '../src/ui/fork-joins.js';

const unit = (x, y) => { const L = Math.hypot(x, y); return [x / L, y / L]; };
// A pair of members, order-free.
const has = (groups, m, fillet) => groups.some((g) => g.members.length === m.length && m.every((i) => g.members.includes(i)) && (fillet == null || Math.abs(g.fillet - fillet) < 1e-9));

test('a tributary on a trunk node fillets to both trunk stretches, never the trunk to itself', () => {
  // Splenic vein from the right, on to the left; the shunt (or the IMV) down.
  const { groups, runOn } = forkJoins([unit(1, -1), unit(-1, 1), unit(0, 1)]);
  assert.deepEqual(runOn, [0, 1]);
  assert.ok(has(groups, [0, 1], 0), 'the trunk runs on with no fillet');
  assert.ok(has(groups, [0, 2], 1) && has(groups, [1, 2], 1), 'the tributary is filleted to each stretch');
  assert.ok(!groups.some((g) => g.fillet === 1 && g.members.includes(0) && g.members.includes(1)), 'no full fillet across the trunk');
});

test('a four-way fork keeps the run-on pair apart from its full fillet', () => {
  const { groups, runOn } = forkJoins([unit(0, -1), unit(0, 1), unit(1, 0.2), unit(-1, 0.3)]);
  assert.deepEqual(runOn, [0, 1]);
  assert.ok(has(groups, [0, 2, 3], 1) && has(groups, [1, 2, 3], 1) && has(groups, [0, 1], 0));
  for (const g of groups) assert.ok(g.members.length <= 4);
});

test('joins without a head-on pair, two-end run-ons and crowded joins are as before', () => {
  assert.deepEqual(forkJoins([unit(1, 0), unit(-0.5, 0.87), unit(-0.5, -0.87)]), { groups: [{ members: [0, 1, 2], fillet: 1 }], runOn: null });
  const two = forkJoins([unit(1, 0), unit(-1, 0.05)]);
  assert.deepEqual(two.runOn, [0, 1]);
  assert.equal(two.groups.length, 1);
  assert.ok(two.groups[0].fillet < 0.1);
  // A vessel passing the join (no end there) never runs on.
  assert.deepEqual(forkJoins([unit(0, 1), null]), { groups: [{ members: [0, 1], fillet: 1 }], runOn: null });
  const crowd = forkJoins(Array.from({ length: 5 }, (_, i) => unit(Math.cos(i * 1.2566), Math.sin(i * 1.2566))));
  assert.equal(crowd.runOn, null);
  assert.equal(crowd.groups.length, 10);
});

// The splenorenal shunt's course (anatomy.js): sampled cubic paths, as the stage samples them.
const sample = (d, n = 200) => {
  const v = d.match(/-?\d+(?:\.\d+)?/g).map(Number), pts = [];
  let p0 = [v[0], v[1]];
  for (let i = 2; i + 5 < v.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x, y] = v.slice(i, i + 6);
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * p0[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y]);
    }
    p0 = [x, y];
  }
  return pts;
};
const distTo = (pts, q) => Math.min(...pts.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));

test('the splenorenal shunt leaves the splenic vein at its node and ends on the renal vein centreline', async () => {
  const { EDGE_PATH } = await import('../src/ui/anatomy.js');
  for (const id of ['C6', 'S_DSR']) {
    const c = sample(EDGE_PATH[id]), start = c[0], end = c[c.length - 1];
    const spl = sample(EDGE_PATH.V_SPL), mid = sample(EDGE_PATH.SV_MID), lrv = sample(EDGE_PATH.V_KID_L);
    assert.ok(Math.hypot(start[0] - spl[spl.length - 1][0], start[1] - spl[spl.length - 1][1]) < 0.01 && Math.hypot(start[0] - mid[0][0], start[1] - mid[0][1]) < 0.01, `${id} starts at the splenic node`);
    const off = distTo(lrv, end);
    assert.ok(off < 1, `${id} ends on the renal vein's centreline (${off.toFixed(2)} off)`);
    // For any renal vein radius drawn (3–12), the shunt's end (at most the vein's own width, then halved) stays clear of
    // the far wall by over a third of the radius, and its narrowing lies inside the vein.
    for (let r = 3; r <= 12; r += 0.5) {
      const capR = r * sideEndScale(0, r);
      assert.ok(r - off - capR > 0.35 * r, `cap clear of the far wall at r ${r}`);
      let back = 0, k = c.length - 1;
      while (k > 0 && back < 0.8 * r) { back += Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]); k--; }
      assert.ok(distTo(lrv, c[k]) < r, `narrowing inside the renal vein at r ${r}`);
    }
  }
  // The spontaneous shunt's start lies inside the splenic vein too.
  const c6 = sample(EDGE_PATH.C6), trunk = [...sample(EDGE_PATH.V_SPL), ...sample(EDGE_PATH.SV_MID)];
  for (let r = 3; r <= 12; r += 0.5) {
    let back = 0, k = 0;
    while (k < c6.length - 1 && back < 0.8 * r) { back += Math.hypot(c6[k + 1][0] - c6[k][0], c6[k + 1][1] - c6[k][1]); k++; }
    assert.ok(distTo(trunk, c6[k]) < r, `C6 narrowing inside the splenic vein at r ${r}`);
  }
});

test('a side shunt end narrows to half only inside the vein, smoothly', () => {
  assert.equal(sideEndScale(0, 8), 0.5);
  assert.equal(sideEndScale(6.4, 8), 1);
  assert.equal(sideEndScale(50, 8), 1);
  let last = 0;
  for (let d = 0; d <= 7; d += 0.25) { const s = sideEndScale(d, 8); assert.ok(s >= last && s >= 0.5 && s <= 1); last = s; }
  assert.equal(sideEndScale(0, 0), 1);
});
