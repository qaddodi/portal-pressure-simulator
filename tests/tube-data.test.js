import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TIERS, TUBE_FLOATS } from '../src/ui/veins-mesh-data.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { WEB_FLOATS } from '../src/ui/tube-joint.js';
import { endTrunk, endContinues } from '../src/ui/tube-join-glsl.js';
import { F_DOTTED, TUBE_ROW_FLOATS, TUBE_NO_END, tubeRows, tubeBuckets, rowIsExact, webInstances, websByTier } from '../src/ui/tube-data.js';
import { scene, straight, ray } from './tube-web-helpers.js';

// The Tube's row records, tier buckets and web instances (brief S2-J). Node only; hand-built scenes (tests/tube-web-helpers.js).

const T = 4;
const rec = (rows, r) => Array.from(rows.subarray(r * TUBE_ROW_FLOATS, (r + 1) * TUBE_ROW_FLOATS));

test('the flags tube-data.js keeps are the renderer\'s', async () => {
  // (veins-gl.js needs a page: the stand-ins tests/vessel-fs-tube.test.js uses)
  globalThis.ResizeObserver ??= class { observe() {} };
  globalThis.MutationObserver ??= class { observe() {} };
  globalThis.window ??= globalThis;
  globalThis.Element ??= class {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
  globalThis.addEventListener ??= () => {};
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
  const gl = await import('../src/ui/veins-gl.js');
  assert.equal(F_DOTTED, gl.F_DOTTED);
  assert.equal(TUBE_FLOATS, gl.TUBE_TEXELS * 4);
});

test('tubeRows: a dotted row, a clipped row and a row ending on a trunk are exact; the others plain', () => {
  const sc = scene([
    straight(-100, 0, 100, 0, T),                  // 0: the trunk, plain
    straight(0.5, 0, 0.5, 100, 2),                 // 1: ends on the trunk at its start (sample 0)
    straight(0.5, -100, 0.5, 0, 2),                // 2: ends on the trunk at its end (sample 63)
    { ...straight(0, 50, 100, 50, 1), flags: F_DOTTED },   // 3: dotted
    { ...straight(0, 70, 100, 70, 1), clip: [0, 0.8] },    // 4: clipped at the end
    { ...straight(0, 80, 100, 80, 1), clip: [0.2, 1] },    // 5: clipped at the start
    straight(0, 90, 100, 90, 1),                   // 6: plain
  ], [
    { x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 },
    { x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 2], trunk: 0 },
  ]);
  const out = {};
  const r = tubeRows(sc.tube, sc.nRows, sc.ent, out, sc.pts);
  assert.equal(r, out); assert.equal(out.n, 7);
  // the trunk's nearest sample to x = 0.5: sample 32 at x = 1.587 (31 is at -1.587)
  assert.deepEqual(rec(out.rows, 0), [0, TUBE_NO_END, TUBE_NO_END, 2]);
  assert.deepEqual(rec(out.rows, 1), [1, 0 * N_SAMPLES + 32, TUBE_NO_END, 3], 'row 1 ends on the trunk at its start');
  assert.deepEqual(rec(out.rows, 2), [2, TUBE_NO_END, 0 * N_SAMPLES + 32, 3], 'row 2 ends on the trunk at its end');
  assert.deepEqual(rec(out.rows, 3), [3, TUBE_NO_END, TUBE_NO_END, 3]);
  assert.deepEqual(rec(out.rows, 4), [4, TUBE_NO_END, TUBE_NO_END, 3]);
  assert.deepEqual(rec(out.rows, 5), [5, TUBE_NO_END, TUBE_NO_END, 3]);
  assert.deepEqual(rec(out.rows, 6), [6, TUBE_NO_END, TUBE_NO_END, 2]);
  assert.equal(out.exact, 5);
  assert.equal(out.ended, 2, 'rows 1 and 2 carry a join end (the ?perf lumen line counts them)');
  for (const [row, want] of [[0, false], [1, true], [2, true], [3, true], [4, true], [5, true], [6, false]]) assert.equal(rowIsExact(out.rows, row), want, `row ${row}`);
  // a one-float buffer reads as "no ends": the + 2 puts a record's w above 1.5 whatever its kind
  for (let q = 0; q < 7; q++) assert.ok(out.rows[q * 4 + 3] > 1.5);
  // without the points no row has an end
  const bare = tubeRows(sc.tube, sc.nRows, sc.ent, {});
  assert.deepEqual(rec(bare.rows, 1), [1, TUBE_NO_END, TUBE_NO_END, 2]);
  // the same buffer is written again, not remade; the second call has the same answer
  const first = out.rows;
  tubeRows(sc.tube, sc.nRows, sc.ent, out, sc.pts);
  assert.equal(out.rows, first);
  assert.deepEqual(rec(out.rows, 1), [1, 32, TUBE_NO_END, 3]);
});

test('tubeRows: a join with no trunk, or a trunk listed as a plain member, puts no row on a vessel', () => {
  const sc = scene([ray(0, 0, 0, 80, 3), ray(0, 0, 130, 80, 3)], [{ x: 0, y: 0, reach: 14, k: 0.5, fillet: 1, members: [0, 1] }]);
  const out = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts);
  for (let q = 0; q < 2; q++) assert.deepEqual(rec(out.rows, q), [q, TUBE_NO_END, TUBE_NO_END, 2]);
  assert.equal(out.exact, 0);
});

test('tubeRows: an end of the trunk\'s own does not end it on itself, and a row keeps its first trunk', () => {
  const sc = scene([straight(0, 0, 100, 0, T), straight(0, 20, 100, 20, T), straight(0.4, 0, 0.4, 20, 1.5)], [
    { x: 0.4, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 2], trunk: 0 },
    { x: 0.4, y: 20, reach: 14, k: 0.4, fillet: 1, members: [1, 2], trunk: 1 },
  ]);
  const out = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts);
  assert.deepEqual(rec(out.rows, 0), [0, TUBE_NO_END, TUBE_NO_END, 2], 'a trunk is not on a vessel');
  assert.equal(out.rows[2 * 4 + 1], 0 * N_SAMPLES + 0, 'row 2 starts on row 0 at its sample 0');
  assert.equal(out.rows[2 * 4 + 2], 1 * N_SAMPLES + 0, 'and ends on row 1 at its sample 0');
});

test('tubeRows: a branch ends on the row that runs through its join whether or not the join marks it the trunk (a T with no mark)', () => {
  const sc = scene([straight(-100, 0, 100, 0, T), straight(0, 0, 0, 100, 2)], [{ x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1] }]);
  const out = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts);
  assert.equal(out.rows[1 * 4 + 1], endTrunk(0, 31), 'row 1 starts on row 0 at its nearest sample');
  assert.equal(out.rows[1 * 4 + 2], TUBE_NO_END);
  assert.deepEqual(rec(out.rows, 0).slice(1, 3), [TUBE_NO_END, TUBE_NO_END], 'the trunk is not on a vessel');
  assert.ok(rowIsExact(out.rows, 1) && !rowIsExact(out.rows, 0));
});

test('tubeRows: two rows meeting end to end, bent by 45 degrees at most, continue each other (mutually); a sharper bend, a third row or a taken end does not', () => {
  const straightPair = scene([straight(-100, 0, 0, 0, T), straight(0, 0, 100, 0, T)], [{ x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1] }]);
  let out = tubeRows(straightPair.tube, straightPair.nRows, straightPair.ent, {}, straightPair.pts);
  assert.equal(out.rows[0 * 4 + 2], endContinues(1, 0), 'row 0 ends where row 1 starts');
  assert.equal(out.rows[1 * 4 + 1], endContinues(0, N_SAMPLES - 1), 'and row 1 starts where row 0 ends');
  assert.equal(out.rows[0 * 4 + 1], TUBE_NO_END);
  assert.ok(rowIsExact(out.rows, 0) && rowIsExact(out.rows, 1) && out.exact === 2);
  const bent = (deg) => scene([straight(-100, 0, 0, 0, T), ray(0, 0, deg, 100, T)], [{ x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1] }]);
  for (const [deg, want] of [[30, true], [44, true], [50, false], [90, false]]) {
    const sc = bent(deg);
    out = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts);
    assert.equal(out.rows[0 * 4 + 2] !== TUBE_NO_END, want, `a ${deg} degree bend`);
    assert.equal(out.rows[1 * 4 + 1] !== TUBE_NO_END, want, `and the partner, at ${deg}`);
  }
  // a taken end: row 1's start is already given to another join, so the pair is not made (never half a pair)
  const three = scene([straight(-100, 0, 0, 0, T), straight(0, 0, 100, 0, T), straight(-100, 30, 0, 0, T)], [
    { x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [1, 2] },
    { x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1] },
  ]);
  out = tubeRows(three.tube, three.nRows, three.ent, {}, three.pts);
  const back = (r, slot) => out.rows[r * 4 + slot];
  for (const [r, slot] of [[0, 2], [1, 1], [2, 2]]) {
    const v = back(r, slot);
    if (v === TUBE_NO_END) continue;
    const code = -(v + 2), pr = Math.floor(code / N_SAMPLES), ps = code % N_SAMPLES;
    assert.equal(back(pr, ps === 0 ? 1 : 2), -(2 + r * N_SAMPLES + (slot === 1 ? 0 : N_SAMPLES - 1)), `row ${r} and its partner agree`);
  }
});

function tiers() {
  const rows = [
    { ...straight(0, 0, 100, 0, 3), tier: 2 }, { ...straight(0, 10, 100, 10, 3), tier: 0 }, { ...straight(0, 20, 100, 20, 3), tier: 2, flags: F_DOTTED },
    { ...straight(0, 30, 100, 30, 3), tier: 0, clip: [0, 0.5] }, { ...straight(0, 40, 100, 40, 3), tier: 2, alpha: 0 }, { ...straight(0, 50, 100, 50, 3), tier: 1 },
    { ...straight(0, 60, 100, 60, 3), tier: 0 }, { ...straight(0, 70, 100, 70, 3), tier: 2 },
  ];
  return scene(rows, []);
}

test('tubeBuckets: tiers ascending, each tier\'s plain rows first, the records whole, a hidden row left out', () => {
  const sc = tiers();
  const data = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts);
  sc.tube[1 * TUBE_FLOATS + 43] = 1;          // row 1 lit
  sc.tube[5 * TUBE_FLOATS + 43] = 1; sc.tube[5 * TUBE_FLOATS + 47] = 9;   // row 5 lit up
  sc.tube[6 * TUBE_FLOATS + 48] = 0.5;        // row 6 selected
  sc.tube[7 * TUBE_FLOATS + 10] = 4;          // row 7 casts a shadow
  const on = new Uint8Array(8).fill(1);
  const b = tubeBuckets(sc.tube, on, 8, data.rows, {});
  assert.equal(b.n, 7);
  assert.deepEqual(Array.from(b.count.subarray(0, 4)), [3, 1, 3, 0]);
  assert.deepEqual(Array.from(b.start.subarray(0, 4)), [0, 3, 4, 7]);
  assert.deepEqual(Array.from(b.plain.subarray(0, 4)), [2, 1, 2, 0]);
  const ids = [];
  for (let q = 0; q < b.n; q++) ids.push(b.rows[q * TUBE_ROW_FLOATS]);
  assert.deepEqual(ids, [1, 6, 3, 5, 0, 7, 2], 'tier 0: plain 1, 6 then exact 3; tier 1: 5; tier 2: plain 0, 7 then exact 2 (row 4 is hidden)');
  // each record is the row's own
  for (let q = 0; q < b.n; q++) assert.deepEqual(Array.from(b.rows.subarray(q * 4, q * 4 + 4)), rec(data.rows, ids[q]));
  assert.deepEqual(Array.from(b.lit.subarray(0, 3)), [1, 0, 0]); assert.deepEqual(Array.from(b.litUp.subarray(0, 3)), [0, 1, 0]);
  assert.deepEqual(Array.from(b.sel.subarray(0, 3)), [1, 0, 0]); assert.deepEqual(Array.from(b.shadow.subarray(0, 3)), [0, 0, 1]);
  // a row off (on 0) is left out as well
  on[6] = 0;
  const c = tubeBuckets(sc.tube, on, 8, data.rows, b);
  assert.equal(c, b); assert.equal(c.n, 6);
  // the records start with the row, so the stage 1 programs can read them at a stride of 16 bytes
  assert.equal(c.rows[0], 1);
  // grouped like tierBuckets: the same rows per tier
  assert.equal(c.count.length, MAX_TIERS);
});

test('tubeBuckets makes nothing in a repeated call (the arrays are the first call\'s)', () => {
  const sc = tiers();
  const data = tubeRows(sc.tube, sc.nRows, sc.ent, {}, sc.pts), on = new Uint8Array(8).fill(1);
  const b = tubeBuckets(sc.tube, on, 8, data.rows, {});
  const kept = [b.rows, b.start, b.count, b.plain, b.lit, b.litUp, b.sel, b.shadow];
  for (let i = 0; i < 5; i++) tubeBuckets(sc.tube, on, 8, data.rows, b);
  assert.deepEqual([b.rows, b.start, b.count, b.plain, b.lit, b.litUp, b.sel, b.shadow].map((x, i) => x === kept[i]), kept.map(() => true));
});

// ---- webs --------------------------------------------------------------------------------------------------------------------

const rec12 = (d, n) => Array.from(d.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS));

test('webInstances: a T makes a web on each side of its tributary, with the leg records the shader reads', () => {
  const sc = scene([straight(-100, 0, 100, 0, T), straight(0.5, 0, 0.5, 100, 2)], [{ x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 0.5, members: [0, 1], trunk: 0 }]);
  const out = webInstances(sc.ent, sc.tube, sc.pts, {});
  assert.equal(out.count, 2); assert.equal(out.joins, 1);
  assert.deepEqual(Array.from(out.kinds.subarray(0, 4)), [0, 0, 0, 2], 'two webs of a join of three legs');
  const rho0 = 0.4 * 0.5;
  // legs sorted by direction: the trunk toward +x (angle 0), the branch (90), the trunk toward -x (180): the webs are (+x, branch) and (branch, -x)
  const a = rec12(out.data, 0), b = rec12(out.data, 1);
  const near = (x, y) => Math.abs(x - y) < 1e-5;
  assert.deepEqual(a.slice(0, 4), [0, 32, 1, 1]); assert.deepEqual(a.slice(4, 8), [1, 0, 1, -1]);
  assert.ok(near(a[8], rho0) && a[9] === 14 && a[10] === 0 && a[11] === 0, `record ${a}`);
  assert.deepEqual(b.slice(0, 4), [1, 0, 1, 1]); assert.deepEqual(b.slice(4, 8), [0, 32, -1, -1]);
  assert.ok(near(b[8], rho0) && b[10] === 1, 'the owner is the trunk: leg B this time');
});

test('webInstances: repeats of a join, joins with no reach, no fillet, or one leg make nothing; the buffer is kept', () => {
  const sc = scene([straight(-100, 0, 100, 0, T), straight(0.5, 0, 0.5, 100, 2), straight(50, 0, 50, 100, 2)], [
    { x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 },
    { x: 50, y: 0, reach: 14, k: 0.4, fillet: 0, members: [0, 2], trunk: 0 },     // no fillet
  ]);
  const ent = new Float32Array(16 * 8);   // the same join in three cells, the no-fillet join twice, an off join (reach 0), a one-member join
  const put = (n, src) => ent.set(sc.ent.subarray(src * 8, src * 8 + 8), n * 8);
  put(0, 0); put(1, 0); put(2, 0); put(3, 1); put(4, 1);
  ent.set([20, 0, 0, 40.99, 0, 1, -1, -1], 5 * 8);
  ent.set([20, 0, 14, 40.99, 0, -1, -1, -1], 6 * 8);
  ent.fill(-1, 7 * 8 + 4, 7 * 8 + 8);   // an empty entry
  const out = webInstances(ent.subarray(0, 8 * 8), sc.tube, sc.pts, {});
  assert.equal(out.count, 2); assert.equal(out.joins, 3, 'the first join, the no-fillet join (it has legs but no fillet to draw) and the one-member join, whose row runs through it: two legs 180 degrees apart, no corner');
  const kept = out.data;
  webInstances(ent.subarray(0, 8 * 8), sc.tube, sc.pts, out);
  assert.equal(out.data, kept); assert.equal(out.count, 2);
});

test('webInstances: counts are stable and equal on a repeat', () => {
  const sc = scene([straight(-100, 0, 100, 0, T), straight(0.5, 0, 0.5, 100, 2), straight(-30, 0, -30, 100, 2)], [
    { x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 },
    { x: -30, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 2], trunk: 0 },
  ]);
  const a = webInstances(sc.ent, sc.tube, sc.pts, {}), da = Array.from(a.data.subarray(0, a.count * WEB_FLOATS)), n = a.count;
  const b = webInstances(sc.ent, sc.tube, sc.pts, a);
  assert.equal(b.count, n); assert.equal(n, 4);
  assert.deepEqual(Array.from(b.data.subarray(0, n * WEB_FLOATS)), da);
});

test('websByTier: a web is drawn in the higher of its two rows\' tiers, once; a hidden row takes its webs with it', () => {
  const sc = scene([
    { ...straight(-100, 0, 100, 0, T), tier: 1 }, { ...straight(0.5, 0, 0.5, 100, 2), tier: 3 },   // a T across two tiers
    { ...straight(-100, 200, 100, 200, T), tier: 2 }, { ...straight(0.5, 200, 0.5, 300, 2), tier: 2 },   // and one in a tier
    { ...straight(-100, 400, 100, 400, T), tier: 0 }, { ...straight(0.5, 400, 0.5, 500, 2), tier: 0, alpha: 0 },   // a tributary not drawn
  ], [
    { x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 },
    { x: 0.5, y: 200, reach: 14, k: 0.4, fillet: 1, members: [2, 3], trunk: 2 },
    { x: 0.5, y: 400, reach: 14, k: 0.4, fillet: 1, members: [4, 5], trunk: 4 },
  ]);
  const w = webInstances(sc.ent, sc.tube, sc.pts, {});
  assert.equal(w.count, 6);
  const out = websByTier(w.data, w.count, sc.tube, {});
  assert.equal(out.n, 4);
  assert.deepEqual(Array.from(out.count.subarray(0, 5)), [0, 0, 2, 2, 0]);
  assert.deepEqual(Array.from(out.start.subarray(0, 5)), [0, 0, 0, 2, 4]);
  assert.equal(out.data[0], 2); assert.equal(out.data[2 * WEB_FLOATS], 0, 'the cross-tier T\'s webs are in tier 3, after the tier 2 webs');
  // a row that is off takes its webs out
  const on = new Uint8Array(6).fill(1); on[2] = 0;
  const off = websByTier(w.data, w.count, sc.tube, {}, on);
  assert.equal(off.n, 2);
  // the arrays are the first call's
  const kept = [out.data, out.start, out.count];
  websByTier(w.data, w.count, sc.tube, out);
  assert.deepEqual([out.data, out.start, out.count].map((x, i) => x === kept[i]), [true, true, true]);
});
