// The region shaders' culling, replayed on a real anatomy (plan r1 section 2.4 steps 2 and 3; workstream C): A's runs (vec-runs.js) of the cirrhosis
// preset, every run of every vessel one big leaf; for pixels inside lumens, the candidates of leafCandidates (the JS mirror of the fragment's bound tests)
// must hold the vessel the pixel lies in, and the required member of every join that covers the pixel. (K's real leaves and L's helper replace the
// one big leaf when they land.)
import { bootAnatomy } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './vec-oracle.js';
import { createRuns } from '../src/ui/vec-runs.js';
import * as K from '../src/ui/vec-contract.js';
import { leafCandidates } from '../src/ui/vec-region-glsl.js';

const A = await bootAnatomy();

test('culling never removes a candidate whose contribution reaches the pixel (A\'s runs on a real anatomy, every vessel one big leaf)', { timeout: 240000 }, async (t) => {
  await A.preset('cirr-decomp', 30);
  const fig = A.figure();
  assert.ok(fig && fig.bins);
  const v = build(fig), g = v.graph;
  const runs = createRuns(g).build();
  const NS = fig.rad.length / fig.nTubes;
  // every run of every row is a reference carrying the bits whose bound it has; joins' required runs also carry C_JOIN
  const refs = [], byId = new Map();
  for (let r = 0; r < g.nRows; r++) for (const id of runs.runsOf(r)) {
    const o = id * 4;
    let bits = 0;
    for (const [bit, q] of [[K.C_LUMEN, 0], [K.C_SHADOW, 1], [K.C_GLOW, 2], [K.C_RING, 3]]) if (runs.rad[o + q] > 0) bits |= bit;
    const ref = { row: r, id, chord: Array.from(runs.chord.subarray(o, o + 4)), radii: Array.from(runs.rad.subarray(o, o + 4)), bits };
    byId.set(id, ref); refs.push(ref);
  }
  const joins = [];
  for (let j = 0; j < g.joins.n; j++) {
    const rows = [];
    for (let m = 0; m < 4; m++) { const row = g.joins.mem[j * 4 + m]; if (row >= 0) rows.push(row); }
    joins.push({ c: [g.joins.x[j], g.joins.y[j]], reach: g.joins.reach[j], rows });
    for (const id of runs.joinRunsOf(j)) byId.get(id).bits |= K.C_JOIN;
  }
  const leaf = { refs, joins };
  const shOff = runs.look.shOff;
  let checked = 0, worst = 0, hist = new Map();
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rows = []; for (let r = 0; r < g.nRows; r++) if (g.rows[r].on) rows.push(r);
  for (let n = 0; n < 1500; n++) {
    const r = rows[Math.floor(rnd() * rows.length)], i = Math.floor(rnd() * (NS - 1)), u = rnd();
    const o = (r * NS + i) * 2;
    if (!g.seg[r * (NS - 1) + i]) continue;
    const ax = g.pts[o], ay = g.pts[o + 1], bx = g.pts[o + 2], by = g.pts[o + 3];
    const rad = Math.min(g.rad[r * NS + i], g.rad[r * NS + i + 1]);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, off = (rnd() * 2 - 1) * rad * 0.97;
    const p = [ax + dx * u - dy / L * off, ay + dy * u + dx / L * off];     // a pixel inside this vessel's lumen
    const res = leafCandidates(leaf, p, K.SLOTS_WIDE, shOff);
    checked++;
    const mine = res.cands.find((c) => c.row === r);
    assert.ok(mine && (mine.bits & K.C_LUMEN), `a pixel inside vessel ${r}'s lumen at (${p.map((x) => x.toFixed(2))}) lost its lumen candidate`);
    worst = Math.max(worst, res.cands.length);
    hist.set(res.cands.length, (hist.get(res.cands.length) ?? 0) + 1);
    // every join covering the pixel lists its members as candidates wherever a member's run is required
    for (const ji of res.joins) for (const id of runs.joinRunsOf(ji)) {
      const ref = byId.get(id);
      assert.ok(res.cands.some((c) => c.row === ref.row && (c.bits & K.C_JOIN)), `join ${ji}'s required run of vessel ${ref.row} is missing at the pixel`);
    }
  }
  assert.ok(checked > 800);
  t.diagnostic(`cirr-decomp, one big leaf: ${checked} pixels in lumens; most candidates at one pixel ${worst} (SLOTS ${K.SLOTS}); by count ${JSON.stringify([...hist].sort((a, b) => a[0] - b[0]))}`);
});
