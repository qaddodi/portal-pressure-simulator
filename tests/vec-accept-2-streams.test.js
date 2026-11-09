// Acceptance 2 (vector-renderer-plan.md section 11): stream ownership at crossings and confluences.
// Node judges: on the real anatomy (cirr-decomp, A's compiled regions) a crossing region joins none of its members to each other while a join
// region's joins name theirs; C's pixel rules (JS twins of the shader's owner and stream choice) give a crossing the front lumen's stream only,
// never a mix, and a confluence the streams of its joined members; D's junction weights sum to one for any flow and swap with a reversal, eased.
// On the devices: a crossing, and the portal confluence.
import { bootAnatomy } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/ui/vec-contract.js';
import { createVecGraph } from '../src/ui/vec-graph.js';
import { createReach, createCompiled, compileGrid, regionOf, NS } from '../src/ui/vec-compile.js';

const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
const build = (f) => {
  const graph = createVecGraph();
  graph.fromBins(f.bins, f.nTubes); graph.attrs(f.tube);
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  graph.radii(radAll);
  const out = createCompiled(); compileGrid(graph, createReach(), out);
  return { graph, out };
};
const anatomy = build(A.figure());
const { pixelOwner, pixelStreams, compositeGroups } = await import('../src/ui/vec-region-glsl.js');
void compositeGroups;
const MB = await import('../src/ui/vec-blood-math.js');

// every region of the compiled figure, as a plain view
const regions = [];
for (let slot = 0; slot < anatomy.out.nRegions; slot++) regions.push(regionOf(anatomy.out, slot));
const bit = (r, k) => (r.kind & k) !== 0;

test('the figure has crossings and confluences to judge', () => {
  assert.ok(regions.filter((r) => bit(r, C.K_CROSS) && !bit(r, C.K_JOIN)).length > 0, 'unconnected crossings');
  assert.ok(regions.filter((r) => bit(r, C.K_JOIN)).length > 0, 'joins');
});

test('a crossing region (no join) joins none of its members; a join region joins only members it lists, and its trunk is one of them', () => {
  let crossings = 0, joins = 0;
  for (const r of regions) {
    if (bit(r, C.K_CROSS) && !bit(r, C.K_JOIN)) {
      crossings++;
      assert.equal(r.joins.length, 0, 'a crossing with no join lists no join');
      for (let a = 0; a < r.members.length; a++) assert.equal(r.members[a].flags & C.M_JOINED, 0, `member ${a} of a crossing is not marked joined`);
    }
    if (bit(r, C.K_JOIN)) {
      joins++;
      assert.ok(r.joins.length >= 1 && r.joins.length <= C.MAX_JOINS, 'joins listed');
      for (const j of r.joins) {
        const listed = [...Array(r.members.length).keys()].filter((m) => (j.mask >> m) & 1);
        assert.ok(listed.length >= 2, 'a join joins at least two members');
        assert.ok(j.trunk < 0 || (j.mask >> j.trunk) & 1, 'the trunk is a joined member');
        for (const m of listed) assert.ok(r.members[m].flags & C.M_JOINED, 'a joined member is marked joined');
      }
    }
  }
  assert.ok(crossings > 0 && joins > 0);
});

// ── C's pixel rules, run over random members: a crossing shows the front lumen's stream only ──
const rnd = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

test('crossing: inside both lumens of two unconnected vessels the owner is the one in front and its stream is the only one shown, whichever way round', () => {
  const r = rnd(5);
  for (let n = 0; n < 2000; n++) {
    const zA = r() * 10, zB = zA + 0.1 + r() * 5;   // B is in front of A
    const members = [{ sd: -(0.1 + r() * 4), z: zA, own: true, joined: new Set() }, { sd: -(0.1 + r() * 4), z: zB, own: true, joined: new Set() }];
    for (const order of [[0, 1], [1, 0]]) {
      const ms = order.map((i) => members[i]);
      const ow = pixelOwner(ms);
      assert.equal(ms[ow].z, zB, 'the front vessel owns the pixel');
      const streams = pixelStreams(ms.map((m) => ({ ...m, r: 3, u: 0.5, len: 50 })), ow, new Set([ow]));
      assert.deepEqual(streams, [{ member: ow, weight: 1 }], 'one stream, the owner\'s, whole');
    }
  }
});

test('crossing: a lumen the owner is not joined to never takes part in the pixel, however near it is', () => {
  const r = rnd(6);
  for (let n = 0; n < 2000; n++) {
    const ms = [0, 1, 2].map((i) => ({ sd: (r() * 2 - 1) * 4, z: r() * 10, own: true, r: 2 + r() * 3, u: r(), len: 20 + r() * 60, joined: new Set() }));
    const ow = pixelOwner(ms), streams = pixelStreams(ms, ow, new Set([ow]));
    assert.equal(streams.length, 1);
    assert.equal(streams[0].member, ow);
  }
});

test('confluence: the pixel shows its joined members\' streams, weights in 0 to 1 summing to 1, and never an unjoined member\'s', () => {
  const r = rnd(7);
  let two = 0;
  for (let n = 0; n < 3000; n++) {
    const k = 2 + ((r() * 3) | 0);
    const ms = [...Array(k + 1).keys()].map(() => ({ sd: (r() * 2 - 1) * 3, z: 0, own: true, r: 2 + r() * 3, u: 0.2 + r() * 0.6, len: 20 + r() * 60, joined: new Set() }));
    const joined = new Set([...Array(k).keys()]);   // members 0..k-1 are joined to each other; the last crosses them
    ms.forEach((m, i) => { if (i < k) m.joined = joined; });
    const ow = 0, streams = pixelStreams(ms, ow, joined);
    const sum = streams.reduce((s, q) => s + q.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `weights sum to ${sum}`);
    assert.ok(streams.length >= 1 && streams.length <= 2);
    for (const q of streams) { assert.ok(joined.has(q.member), 'only a joined member\'s stream'); assert.ok(q.weight >= 0 && q.weight <= 1); }
    if (streams.length === 2) two++;
  }
  assert.ok(two > 100, `the samples included pixels shared by two streams (${two})`);
});

// ── D's junction weights ──
test('confluence: the blend weights sum to 1 for any set of members and flows', () => {
  const r = rnd(8);
  for (let n = 0; n < 5000; n++) {
    const k = 2 + ((r() * 3) | 0);
    const share = [], vd = [], near = [];
    for (let i = 0; i < k; i++) { share.push(r()); vd.push((r() * 2 - 1) * 30); near.push(r() < 0.5 ? 1 : 0); }
    const w = MB.mixWeights(share, vd, near);
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'sum to one');
    for (const x of w) assert.ok(x >= 0 && x <= 1);
  }
  assert.ok(Math.abs(MB.mixWeights([0, 0], [1, 1], [0, 0]).reduce((a, b) => a + b, 0) - 1) < 1e-12, 'also when no member has a share');
});

test('confluence: the member whose blood runs in supplies the junction, a reversal swaps them, and the swap is eased (no step through zero flow)', () => {
  const share = [0.5, 0.5], near = [1, 1];
  const w = (v) => MB.mixWeights(share, [v, -v], near);
  const fwd = w(20), back = w(-20);
  assert.ok(fwd[0] > fwd[1], 'the member running toward the junction end leads');
  assert.ok(Math.abs(fwd[0] - back[1]) < 1e-12 && Math.abs(fwd[1] - back[0]) < 1e-12, 'a reversal swaps the two exactly');
  // sweeping the flow through zero: the lead changes hands without a jump
  let worst = 0, prev = null;
  for (let v = 20; v >= -20; v -= 0.05) { const x = w(v)[0]; if (prev !== null) worst = Math.max(worst, Math.abs(x - prev)); prev = x; }
  assert.ok(worst < 0.02, `the largest step in a weight over 0.05 of flow was ${worst.toFixed(4)}`);
  assert.ok(Math.abs(w(0)[0] - 0.5) < 1e-12, 'at no flow they share equally');
});
