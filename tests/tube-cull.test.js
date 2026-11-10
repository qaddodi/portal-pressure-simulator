import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { rowBoxes, rowBoxesBetween, rowsInside, countInside, BOX_FLOATS } from '../src/ui/tube-cull.js';
import { loadCapture, straight, scene } from './tube-web-helpers.js';

// Which rows are outside the vessel layer (brief P3): node only, no GL, no text of src/ (PR-02). The real rows come from tests/tube-web-capture.mjs (the real
// stage, and the real lobule layer, booted in jsdom), each in its own process; the hand-built scenes are tests/tube-web-helpers.js.

const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 180000;
const boot = (mode, ...extra) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, mode, ...extra], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture ${mode} failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`tube-web-capture gave no JSON: ${e.message}\n${out.slice(-300)}`)); }
  });
});
const runs = { figure: boot('figure'), lobule: boot('lobule') };
for (const p of Object.values(runs)) p.catch(() => {});
const sets = [['figure anatomy', runs.figure.then((f) => f.anatomy)], ['figure circuit', runs.figure.then((f) => f.circuit)], ['lobule', runs.lobule]];
for (const [, p] of sets) p.catch(() => {});

// ---- helpers ------------------------------------------------------------------------------------------------------------

/** The points object the renderer holds (pointsFromEntries' out): { pts, on }. */
function pointsObject(d) {
  const on = new Uint8Array(d.nRows);
  for (const r of d.rows) on[r.id] = 1;
  return { pts: d.pts, on };
}
/** The radii texture mirror: RGBA texels, row r sample i at (r * 64 + i) * 4, radius first. */
function radTexture(d) {
  const rad = new Float32Array(d.nRows * N_SAMPLES * 4);
  for (const r of d.rows) for (let i = 0; i < N_SAMPLES; i++) rad[(r.id * N_SAMPLES + i) * 4] = r.R[i];
  return rad;
}
const widest = (d) => {
  const m = new Float64Array(d.nRows);
  for (const r of d.rows) { let g = 0; for (let i = 0; i < N_SAMPLES; i++) g = Math.max(g, r.R[i]); m[r.id] = g; }
  return m;
};
/** The bounds of the rows' points. */
function bounds(d) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of d.rows) for (let i = 0; i < N_SAMPLES; i++) { const x = r.P[2 * i], y = r.P[2 * i + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
/** Brute force: the smallest distance from any sample of row to the rectangle (0 when inside). */
function nearestToRect(P, rect) {
  let best = Infinity;
  for (let i = 0; i < N_SAMPLES; i++) {
    const x = P[2 * i], y = P[2 * i + 1];
    const dx = Math.max(rect[0] - x, 0, x - rect[2]), dy = Math.max(rect[1] - y, 0, y - rect[3]);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}
/** A rectangle `frac` of the bounds' width and height, centred on the bounds' point (cx, cy) in fractions. */
function windowOf(b, frac, cx, cy) {
  const w = (b[2] - b[0]) * frac, h = (b[3] - b[1]) * frac, x = b[0] + (b[2] - b[0]) * cx, y = b[1] + (b[3] - b[1]) * cy;
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

// ---- Hand-built scenes (fast) ----------------------------------------------------------------------------------------------

test('boxes: min and max of the points, grown by the widest radius; an off row has an empty box', () => {
  const s = scene([{ P: straight(0, 0, 10, 4, 1).P, R: straight(0, 0, 10, 4, 1).R }, { P: straight(100, 100, 120, 100, 2).P, R: straight(100, 100, 120, 100, 2).R }], []);
  const on = new Uint8Array(3); on[0] = 1; on[1] = 1;   // row 2 has no points
  const out = {};
  const rmax = [1, 2, 0];
  rowBoxes({ pts: s.pts, on }, null, rmax, 3, out);
  assert.equal(out.n, 3);
  assert.equal(out.on, 2);
  const b = out.boxes;
  assert.ok(b[0] <= -1 && b[0] > -1.001 && b[1] <= -1 && b[2] >= 11 && b[3] >= 5, `row 0 box ${Array.from(b.subarray(0, 4))}`);
  assert.ok(b[4] <= 98 && b[5] <= 98 && b[6] >= 122 && b[7] >= 102);
  assert.ok(b[8] > b[10] && b[9] > b[11], 'an off row has an empty box (min above max)');
  const flags = new Uint8Array(3);
  rowsInside(b, 3, [-1e9, -1e9, 1e9, 1e9], 1e9, flags);
  assert.deepEqual(Array.from(flags), [1, 1, 0], 'an off row is never inside, whatever the rectangle');
});

test('the radius: rad (a texture mirror), rmax as a number, and the larger of the two wins', () => {
  const v = straight(0, 0, 10, 0, (i) => (i === 7 ? 3 : 1));
  const s = scene([{ P: v.P, R: v.R }], []);
  const rad = new Float32Array(N_SAMPLES * 4); for (let i = 0; i < N_SAMPLES; i++) rad[i * 4] = v.R[i];
  const a = rowBoxes(s.pts, rad, 0, 1, {}).boxes, b = rowBoxes(s.pts, null, 1, 1, {}).boxes, c = rowBoxes(s.pts, rad, 5, 1, {}).boxes;
  assert.ok(a[3] >= 3 && a[3] < 3.001, `rad only: ${a[3]}`);
  assert.ok(b[3] >= 1 && b[3] < 1.001, `rmax number only: ${b[3]}`);
  assert.ok(c[3] >= 5 && c[3] < 5.001, `the larger wins: ${c[3]}`);
  assert.equal(rowBoxes(s.pts, null, 1, 1, {}).on, 1, 'a bare array: a row with points is on');
});

test('rowsInside: edges count, pad grows the box, the flag reports a change only', () => {
  const s = scene([{ P: straight(0, 0, 10, 0, 1).P, R: straight(0, 0, 10, 0, 1).R }], []);
  const boxes = rowBoxes(s.pts, null, 1, 1, {}).boxes;   // about [-1,-1,11,1]
  const f = new Uint8Array(1);
  assert.equal(rowsInside(boxes, 1, [20, 0, 30, 5], 0, f), false, 'starts at 0 and stays 0');
  assert.equal(f[0], 0);
  assert.equal(rowsInside(boxes, 1, [20, 0, 30, 5], 9.5, f), true, 'a pad of 9.5 reaches (11 + 9.5 = 20.5)');
  assert.equal(f[0], 1);
  assert.equal(rowsInside(boxes, 1, [20, 0, 30, 5], 9.5, f), false, 'a repeat call changes nothing');
  assert.equal(rowsInside(boxes, 1, [0, 3, 5, 9], 1.5, f), true, 'above: the box ends at 1, the pad reaches 2.5, the window starts at 3: it leaves');
  assert.equal(f[0], 0);
  assert.equal(rowsInside(boxes, 1, [0, 3, 5, 9], 2.5, f), true, 'a pad of 2.5 reaches 3.5: back in (the edge counts)');
  assert.equal(f[0], 1);
});

test('a stretch between two point sets: the box holds the row at the start, the end and in between', () => {
  const a = scene([{ P: straight(0, 0, 10, 0, 1).P, R: straight(0, 0, 10, 0, 1).R }], []);
  const b = scene([{ P: straight(50, 50, 60, 70, 1).P, R: straight(50, 50, 60, 70, 1).R }], []);
  const out = rowBoxesBetween(a.pts, b.pts, null, 1, 1, {}).boxes;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) for (let i = 0; i < N_SAMPLES; i++) {
    const x = (1 - t) * a.pts[(i >> 1) * 4 + (i & 1) * 2] + t * b.pts[(i >> 1) * 4 + (i & 1) * 2], y = (1 - t) * a.pts[(i >> 1) * 4 + (i & 1) * 2 + 1] + t * b.pts[(i >> 1) * 4 + (i & 1) * 2 + 1];
    assert.ok(x >= out[0] && x <= out[2] && y >= out[1] && y <= out[3], `t ${t} sample ${i} outside the stretch's box`);
  }
  const onlyEnd = new Uint8Array(1), onlyStart = new Uint8Array(1); onlyStart[0] = 1;
  const one = rowBoxesBetween({ pts: a.pts, on: onlyStart }, { pts: b.pts, on: onlyEnd }, null, 0, 1, {}).boxes;
  assert.ok(one[2] < 11 && one[3] < 1.01, 'a row on in one set only takes that set');
});

test('no allocation after the first call', () => {
  const s = scene([{ P: straight(0, 0, 10, 0, 1).P, R: straight(0, 0, 10, 0, 1).R }], []);
  const out = {};
  rowBoxes(s.pts, null, 1, 1, out);
  const kept = out.boxes;
  rowBoxes(s.pts, null, 1, 1, out); rowBoxesBetween(s.pts, s.pts, null, 1, 1, out);
  assert.equal(out.boxes, kept, 'the same buffer');
});

// ---- The real figure and lobule rows ---------------------------------------------------------------------------------------

const counts = [];
for (const [name, run] of sets) {
  test(`${name}: fitted view keeps every row; narrow windows drop only rows that are really outside`, { timeout: BOOT_MS + 20000 }, async (t) => {
    const d = loadCapture(await run);
    const rmaxArr = widest(d), rad = radTexture(d);
    const out = rowBoxes(pointsObject(d), rad, rmaxArr, d.nRows, {});
    assert.equal(out.on, d.rows.length, 'every captured row is on');
    const flags = new Uint8Array(d.nRows), b = bounds(d), PAD = 6;
    const byId = new Map(d.rows.map((r) => [r.id, r]));

    // the fitted view: the rectangle holding everything
    rowsInside(out.boxes, d.nRows, b, 0, flags);
    for (const r of d.rows) assert.equal(flags[r.id], 1, `row ${r.id} is on and inside the fitted rectangle`);
    assert.equal(countInside(flags, d.nRows), d.rows.length);

    // zoom: 1x is the fitted rectangle, then windows 1/4 and 1/10 of the width, at several places
    const line = [`${name}: 1x ${countInside(flags, d.nRows)}/${d.rows.length}`];
    for (const zoom of [4, 10]) {
      let kept = 0, total = 0, dropped = 0;
      for (const [cx, cy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7], [0.35, 0.8], [0.9, 0.1]]) {
        const rect = windowOf(b, 1 / zoom, cx, cy);
        rowsInside(out.boxes, d.nRows, rect, PAD, flags);
        for (const r of d.rows) {
          const near = nearestToRect(r.P, rect);   // the closest sample of the row to the rectangle
          const reach = PAD + rmaxArr[r.id];
          total++;
          if (flags[r.id]) kept++;
          // the rows marked outside really have no point within pad + radius of the window; a row with a point inside is never dropped
          if (!flags[r.id]) { dropped++; assert.ok(near > reach, `${name} ${zoom}x: row ${r.id} dropped with a sample ${near.toFixed(3)} from the window (reach ${reach.toFixed(3)})`); }
          if (near <= reach) assert.equal(flags[r.id], 1, `${name} ${zoom}x: row ${r.id} has a sample within ${reach.toFixed(3)} of the window and was dropped`);
        }
        // and rowsInside agrees with a second call (nothing changed)
        assert.equal(rowsInside(out.boxes, d.nRows, rect, PAD, flags), false, 'a repeat call: no change');
      }
      line.push(`${zoom}x ${(kept / 5).toFixed(1)}/${d.rows.length} kept on average over 5 windows (${dropped} drops)`);
      if (zoom === 10) assert.ok(kept / total < 0.7, `${name}: a tenth-width window should drop a good share (kept ${kept}/${total})`);
    }
    counts.push(line.join(', '));
    t.diagnostic(line.join(', '));

    // a stretch between two views: the figure against itself shifted
    const shifted = { pts: d.pts.map((v, i) => v + (i % 2 ? 7 : -13)), on: pointsObject(d).on };
    const between = rowBoxesBetween(pointsObject(d), shifted, rad, rmaxArr, d.nRows, {});
    const from = rowBoxes(pointsObject(d), rad, rmaxArr, d.nRows, {}), to = rowBoxes(shifted, rad, rmaxArr, d.nRows, {});
    for (const r of d.rows) {
      const o = r.id * BOX_FLOATS;
      assert.ok(between.boxes[o] <= Math.min(from.boxes[o], to.boxes[o]) && between.boxes[o + 2] >= Math.max(from.boxes[o + 2], to.boxes[o + 2]) && between.boxes[o + 1] <= Math.min(from.boxes[o + 1], to.boxes[o + 1]) && between.boxes[o + 3] >= Math.max(from.boxes[o + 3], to.boxes[o + 3]), `row ${r.id}: the stretch's box holds both ends' boxes`);
      assert.ok(byId.has(r.id));
    }
  });
}
