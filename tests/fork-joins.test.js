import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forkJoins, nodeJoins, sideEndScale, SIDE_END_MIN } from '../src/ui/fork-joins.js';

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

test('the splenorenal shunt leaves the splenic vein at its node and ends just inside the renal vein', async () => {
  const { EDGE_PATH } = await import('../src/ui/anatomy.js');
  const spl = sample(EDGE_PATH.V_SPL), mid = sample(EDGE_PATH.SV_MID), lrv = sample(EDGE_PATH.V_KID_L);
  // The renal vein's centreline height at x (it runs nearly level there).
  const lrvY = (x) => lrv.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b))[1];
  for (const id of ['C6', 'S_DSR']) {
    const c = sample(EDGE_PATH[id]), start = c[0], end = c[c.length - 1];
    assert.ok(Math.hypot(start[0] - spl[spl.length - 1][0], start[1] - spl[spl.length - 1][1]) < 0.01 && Math.hypot(start[0] - mid[0][0], start[1] - mid[0][1]) < 0.01, `${id} starts at the splenic node`);
    // dy: how far the end lies off the renal vein's centreline (negative: on the shunt's side, above it).
    const dy = end[1] - lrvY(end[0]);
    assert.ok(dy <= 0 && dy > -2.5, `${id} ends just above the renal centreline (${dy.toFixed(2)})`);
    // For any renal vein radius drawn (4–12): the narrowed round end stays well clear of the far wall, lies inside the
    // lumen, and the narrowing before it lies inside the vein too.
    for (let r = 4; r <= 12; r += 0.5) {
      const capR = r * sideEndScale(0, r);
      assert.ok(r - dy - capR > 0.5 * r, `cap clear of the far wall at r ${r}`);
      assert.ok(r + dy > capR, `end inside the lumen at r ${r}`);
      let back = 0, k = c.length - 1;
      while (k > 0 && back < 0.6 * r) { back += Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]); k--; }
      assert.ok(Math.abs(c[k][1] - lrvY(c[k][0])) < r, `narrowing inside the renal vein at r ${r}`);
    }
  }
  // The spontaneous shunt's start lies inside the splenic vein too.
  const c6 = sample(EDGE_PATH.C6), trunk = [...spl, ...mid];
  for (let r = 4; r <= 12; r += 0.5) {
    let back = 0, k = 0;
    while (k < c6.length - 1 && back < 0.6 * r) { back += Math.hypot(c6[k + 1][0] - c6[k][0], c6[k + 1][1] - c6[k][1]); k++; }
    assert.ok(distTo(trunk, c6[k]) < r, `C6 narrowing inside the splenic vein at r ${r}`);
  }
});

test('a side shunt end narrows only inside the vein, smoothly', () => {
  assert.equal(sideEndScale(0, 8), SIDE_END_MIN);
  assert.equal(sideEndScale(4.8, 8), 1);
  assert.equal(sideEndScale(50, 8), 1);
  let last = 0;
  for (let d = 0; d <= 7; d += 0.25) { const s = sideEndScale(d, 8); assert.ok(s >= last && s >= SIDE_END_MIN && s <= 1); last = s; }
  assert.equal(sideEndScale(0, 0), 1);
});

test('a fork names the end that runs on as the trunk of each group that fillets the others to it, and no other group a trunk', () => {
  const y = forkJoins([unit(1, -1), unit(-1, 1), unit(0, 1)]);
  const filleted = y.groups.filter((g) => g.fillet === 1);
  assert.equal(filleted.length, 2);
  for (const g of filleted) assert.ok(g.trunk != null && g.trunk === g.members[0] && y.runOn.includes(g.trunk), 'the run-on end leads its group and is the trunk');
  assert.ok(y.groups.every((g) => g.fillet === 1 || g.trunk == null), 'the run-on pair itself has none');
  const four = forkJoins([unit(0, -1), unit(0, 1), unit(1, 0.2), unit(-1, 0.3)]);
  assert.deepEqual(four.groups.filter((g) => g.trunk != null).map((g) => g.trunk).sort(), [0, 1]);
  // Nothing at a join with no run-on pair, a pair alone, or a crowd (the hepatic veins at the cava).
  assert.ok(forkJoins([unit(1, 0), unit(-0.5, 0.87), unit(-0.5, -0.87)]).groups.every((g) => g.trunk == null));
  assert.ok(forkJoins([unit(1, 0), unit(-1, 0.01)]).groups.every((g) => g.trunk == null));
  assert.ok(forkJoins([unit(0, 1), null]).groups.every((g) => g.trunk == null));
});

// ── A collateral's strands at its node (nodeJoins): the coronary vein into the esophageal varices (owner, 31 Oct: "not a smooth
// transition ... in caliber"). The varix is its channel and a braid of strands that end where it does, so its node counted seven
// ends, a crowded join: no run-on, no caliber eased, the wide coronary vein ending in a round cap on the narrow varix.
const strand = (d) => ({ dir: d, strand: true });
const vessel = (d) => ({ dir: d, strand: false });

test('strands at a node leave the run-on to the vessels, and are each joined whole to every other end, the vessels first', () => {
  const up = unit(0, -1), down = unit(0, 1);
  const r = nodeJoins([vessel(down), vessel(up), ...Array.from({ length: 5 }, () => strand(up))]);
  assert.deepEqual(r.runOn, [0, 1]);
  assert.deepEqual(r.groups[0], { members: [0, 1], fillet: forkJoins([down, up]).groups[0].fillet });
  assert.ok(r.groups[0].fillet < 0.1, 'the run-on pair has no fillet');
  // Every other pair that holds a strand is there once, whole, after the vessels' own, none of more than two ends.
  const pairs = r.groups.slice(1);
  assert.equal(pairs.length, 7 * 6 / 2 - 1);
  assert.ok(pairs.every((g) => g.fillet === 1 && g.strand === true && g.members.length === 2 && g.members.some((m) => m >= 2)));
  assert.equal(new Set(pairs.map((g) => g.members.join())).size, pairs.length);
  // The first six joins (all a cell of the shader reads) hold the vessels' pair and the first vessel's strands.
  assert.deepEqual(r.groups.slice(0, 6).map((g) => g.members.join('-')), ['0-1', '0-2', '0-3', '0-4', '0-5', '0-6']);
});

test('a node with no strands, or only one vessel, is as forkJoins gives it', () => {
  const dirs = [unit(0, -1), unit(0, 1), unit(1, 0.2)];
  assert.deepEqual(nodeJoins(dirs.map(vessel)), forkJoins(dirs));
  const crowd = Array.from({ length: 5 }, (_, i) => unit(Math.cos(i * 1.2566), Math.sin(i * 1.2566)));
  assert.deepEqual(nodeJoins(crowd.map(vessel)), forkJoins(crowd));
  const one = [vessel(unit(1, 0)), strand(unit(1, 0)), strand(unit(1, 0.02))];
  assert.deepEqual(nodeJoins(one), forkJoins(one.map((e) => e.dir)));
});

test('a fork keeps its trunk through the strands: indexes, trunks and the vessels\' groups are those of the vessels alone', () => {
  // A trunk running on (ends 0, 1) with a tributary (2) and a varix's strands (3, 4, 5) beside the tributary.
  const dirs = [unit(1, -1), unit(-1, 1), unit(0, 1)];
  const r = nodeJoins([...dirs.map(vessel), strand(dirs[2]), strand(dirs[2]), strand(dirs[2])]);
  const plain = forkJoins(dirs);
  assert.deepEqual(r.runOn, plain.runOn);
  assert.deepEqual(r.groups.slice(0, plain.groups.length), plain.groups);
  assert.ok(r.groups.slice(plain.groups.length).every((g) => g.strand && g.trunk == null && g.fillet === 1));
});

// The real anatomy: where the strand-bearing collaterals meet the vein they run on into, the vessels run on, strands or not.
// (Sampled as the stage does, 64 samples even by arc length, an end's direction taken three samples in.)
test('the coronary vein runs on into the varices, the varices into the azygos route, the fundal feeder into its shunt, and the portal tree keeps its own run-ons beside the collaterals', async () => {
  const { EDGE_PATH, STRANDS } = await import('../src/ui/anatomy.js');
  const { EDGES } = await import('../src/engine/topology.js');
  const even = (id, N = 64) => {
    const P = sample(EDGE_PATH[id]), cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return Array.from({ length: N }, (_, i) => { const d = (cum[cum.length - 1] * i) / (N - 1); let j = 1; while (j < P.length - 1 && cum[j] < d) j++; const t = cum[j] > cum[j - 1] ? (d - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0; return [P[j - 1][0] + (P[j][0] - P[j - 1][0]) * t, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * t]; });
  };
  const dirAt = (id, end) => { const P = even(id), a = end ? P[63] : P[0], b = end ? P[60] : P[3], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const kind = Object.fromEntries(EDGES.map((e) => [e.id, e]));
  // node → the vessels that end there ([id, end]); a collateral's strands are counted from STRANDS.
  const at = (node, ids) => ids.map((id) => [id, kind[id].from === node ? 0 : 1]);
  const cases = [
    ['LGV', ['LGV_CONF', 'C1a'], 'LGV_CONF', 'C1a'],
    ['VAR', ['C1a', 'C1b'], 'C1a', 'C1b'],
    ['IMV', ['V_COL', 'V_IMV', 'C4'], 'V_COL', 'V_IMV'],
    ['SV', ['V_IMV', 'SV_MID', 'SV_CONF', 'C2'], 'SV_MID', 'SV_CONF'],
    // The fundal varices: the short gastric feeder arches over into the gastrorenal shunt as one rounded loop, no hairpin (6 Nov).
    ['GV', ['C2', 'C5'], 'C2', 'C5'],
  ];
  for (const [node, ids, a, b] of cases) {
    const ends = at(node, ids), strands = ids.reduce((n, id) => n + (STRANDS[id]?.length || 0), 0);
    assert.ok(strands >= 4, `${node} carries strands`);
    const list = [...ends.map(([id, e]) => vessel(dirAt(id, e))), ...Array.from({ length: strands }, () => strand(null))];
    const withStrands = nodeJoins(list), without = forkJoins(ends.map(([id, e]) => dirAt(id, e)));
    assert.deepEqual(withStrands.runOn?.map((i) => ends[i][0]).sort(), [a, b].sort(), `${node}: ${a} runs on into ${b}`);
    assert.deepEqual(withStrands.runOn, without.runOn, `${node}: the same pair as with no strands`);
    assert.deepEqual(withStrands.groups.slice(0, without.groups.length), without.groups, `${node}: the vessels' groups are the strand-free ones`);
    // (As it was: the node's every end, strands too, read as a crowd and nothing ran on.)
    const crowd = forkJoins(list.map((e) => e.dir));
    assert.equal(crowd.runOn, null, `${node}: with the strands counted nothing ran on`);
    assert.ok(withStrands.groups.every((g) => g.members.length <= 4));
  }
});

test('the figure counts a vessel\'s strands apart at a node (stage.js veinJoins)', () => {
  const src = readFileSync(new URL('../src/ui/vein-joins.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ nodeJoinsInto, newJoinAnswer \} from '\.\/fork-joins\.js/);
  assert.match(src, /nodeJoinsInto\(PEND, nu, OUT\)/);
  assert.match(src, /e\.strand = it\.kind === 's'/);
  assert.match(stageSource(), /import \{ sideEndScale \} from '\.\/fork-joins\.js/);
});

// The fundal varices (6 Nov): the feeder arches over into the gastrorenal shunt, and the run-on's smoothing over its usual ten
// samples cut that bend by 12 units, so the trunk passed under the node and the varices' strands, which end on it, hung off it.
// Smoothed, both courses still pass through the node.
test('the smoothed loop at the fundal varices still passes through their node, where the strands end', async () => {
  const { EDGE_PATH, NODE_POS } = await import('../src/ui/anatomy.js');
  const { smoothRunOn, newJoinStore, nearCourse } = await import('../src/ui/vein-joins.js');
  const even = (id, N = 64) => {
    const P = sample(EDGE_PATH[id]), cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return Array.from({ length: N }, (_, i) => { const d = (cum[cum.length - 1] * i) / (N - 1); let j = 1; while (j < P.length - 1 && cum[j] < d) j++; const t = cum[j] > cum[j - 1] ? (d - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0; return [P[j - 1][0] + (P[j][0] - P[j - 1][0]) * t, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * t]; });
  };
  const items = [{ row: 0, kind: 'v', pts: even('C2') }, { row: 1, kind: 'v', pts: even('C5') }];
  const co = smoothRunOn(items, [{ a: 0, ia: 1, b: 1, ib: 0 }], newJoinStore());
  const gv = NODE_POS.GV[0];
  const P0 = co.get(0), P1 = co.get(1);
  assert.ok(P0 && P1, 'both courses are smoothed');
  // (The two meet end to end, on the smoothed curve: the loop drawn through them passes within 2 of the node.)
  assert.ok(nearCourse([...P0, ...P1], gv, 2), `the loop passes ${distTo([...P0, ...P1], gv).toFixed(1)} from the node`);
});
