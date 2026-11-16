import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureLobule } from '../scripts/lobule-joins.mjs';
import { pointsFromEntries, joinEntryList } from '../src/ui/veins-mesh-data.js';
import { tubeRows, F_ENDS, TUBE_ROW_FLOATS, TUBE_NO_END } from '../src/ui/tube-data.js';
import { joinEntriesInto } from '../src/ui/tube-stage2.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { sinK } from '../src/ui/lobule-mouths.js';

// 16 Nov 2026, Mohammad: "when the sinusoids swell up in SOS there seems to be on the bifurcation a disconnect, like they're not connected". Two causes, both held here: (1) the lobule drew a
// sinusoid merge with no join work at all, so the wider parent's round end cap lay over its kids' ends (an arc across the lumen and tone bands that did not meet); (2) a wider parent
// met narrower kids at a step in the wall (a width a generation: 1, 1.15, 1.3), the larger the sinusoids the larger the step.

const cap = await captureLobule({});
const FL = 52, nT = cap.tubes.length, T = (r, k) => cap.up.tube[r * FL + k], rad = (r, i) => cap.up.rad[(r * N_SAMPLES + i) * 4];
const isSin = (r) => [0.1, 0.11, 0.12].some((z) => Math.abs(T(r, 9) - z) < 1e-6);
const merges = cap.joins.filter((j) => j.members.length >= 3 && j.members.filter(isSin).length >= 3);
const nearest = (r, j) => { let k = 0, bd = Infinity; cap.tubes[r].pts.forEach((p, i) => { const d = Math.hypot(p[0] - j.x, p[1] - j.y); if (d < bd) { bd = d; k = i; } }); return k; };

test('the lobule\'s sinusoid rows carry F_ENDS, and no other row does', () => {
  for (let r = 0; r < nT; r++) {
    const has = (Math.floor(T(r, 10) + 0.5) & F_ENDS) !== 0, z = T(r, 9), sinus = isSin(r) || Math.abs(z - 0.09) < 1e-6;
    assert.equal(has, sinus, `row ${r} z ${z}`);
  }
});

test('every merge of sinusoids has its ends worked out: one end continues another, the rest end on it (no round caps laid over each other)', () => {
  const b = cap.bins, P = {}, jl = {};
  pointsFromEntries(b.ent, b.cells, b.nCells, nT, P);
  joinEntryList(b.cells, b.nCells, jl);
  const list = jl.list.subarray ? jl.list.subarray(0, jl.n ?? jl.list.length) : jl.list, seen = new Set(), uniq = [];
  for (const e of list) if (!seen.has(e)) { seen.add(e); uniq.push(e); }
  const ent = new Float32Array(uniq.length * 8);
  joinEntriesInto(b.ent, Int32Array.from(uniq), uniq.length, -1, ent);
  const out = {};
  tubeRows(cap.up.tube, nT, ent, out, P.pts, F_ENDS);
  const code = (r, sl) => out.rows[r * TUBE_ROW_FLOATS + sl];
  let cont = 0, trunk = 0;
  for (const j of merges) for (const r of j.members.filter(isSin)) {
    const sl = nearest(r, j) < N_SAMPLES / 2 ? 1 : 2, c = code(r, sl);
    assert.notEqual(c, TUBE_NO_END, `row ${r}'s end at (${j.x.toFixed(0)}, ${j.y.toFixed(0)}) has no join`);
    if (c <= -2) cont++; else trunk++;
  }
  assert.ok(cont >= merges.length * 2 - 1 && trunk >= merges.length, `${cont} continuing ends and ${trunk} ends on a trunk in ${merges.length} merges`);
  // a row of the lobule that does not carry the flag (the discs, the inlets, the twigs, the lymph) keeps no ends
  for (let r = 0; r < nT; r++) if ((Math.floor(T(r, 10) + 0.5) & F_ENDS) === 0) { assert.equal(code(r, 1), TUBE_NO_END, `row ${r}`); assert.equal(code(r, 2), TUBE_NO_END, `row ${r}`); }
});

test('no step in width at any merge: every sinusoid that meets at a merge has the same width there (at any swelling, which scales a width by a function of position only)', () => {
  assert.ok(merges.length >= 30, `${merges.length} merges`);
  for (const j of merges) {
    const w = j.members.filter(isSin).map((r) => rad(r, nearest(r, j)));
    const spread = (Math.max(...w) - Math.min(...w)) / Math.max(...w);
    assert.ok(spread < 0.05, `at (${j.x.toFixed(0)}, ${j.y.toFixed(0)}) the widths are ${w.map((x) => x.toFixed(2))} (${(spread * 100).toFixed(1)}%)`);
  }
  // sinK itself: 1 at the portal end, 1.3 at the vein, falling steadily, no step
  assert.equal(sinK(0.95), 1);
  assert.ok(Math.abs(sinK(0.07) - 1.3) < 1e-9);
  let prev = Infinity;
  for (let r = 0; r <= 1.0; r += 0.01) { const k = sinK(r); assert.ok(k <= prev + 1e-12); prev = k; }
  const src = readFileSync(new URL('../src/ui/lobule-zoom-field.js', import.meta.url), 'utf8');
  assert.match(src, /case 's0': case 's1': return rs \* sinK\(t\.rho\[i\]\);/);
  assert.match(src, /case 's2': return rs \* sinK\(t\.rho\[i\]\) \* flareAt/);
  assert.doesNotMatch(src, /case 's1': return rs \* 1\.15/);
});
