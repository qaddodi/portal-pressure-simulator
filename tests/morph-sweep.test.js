import { stageSource } from './stage-src.js';
// The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"): a stretch of the
// change is binned once, ahead (veins-sweep.js binSwept, in sweep-worker.js), and each of its frames only sends the vessels' points
// and the joins (stage.js morphFrame, veins-gl setMorphFrame). These check that the stretch's lists hold every segment and join that
// can draw in a cell at any frame the stage lets through, and that the stage checks a frame before it draws from them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binSwept, writePoints, writeJoinNow } from '../src/ui/veins-sweep.js';
import { CELL } from '../src/ui/veins-bin.js';

const N = 16, SLACK = 6;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const segD2 = (px, py, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, h = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2));
  return (a[0] + dx * h - px) ** 2 + (a[1] + dy * h - py) ** 2;
};
// A vessel's course at a few moments: a wavy line that moves and bends from one to the next.
function course() {
  const x0 = 40 + rnd() * 200, y0 = 40 + rnd() * 200, ang = rnd() * Math.PI, len = 120 + rnd() * 120, mx = (rnd() - 0.5) * 120, my = (rnd() - 0.5) * 120;
  return [0, 1, 2].map((m) => Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1), bend = Math.sin(u * Math.PI * (1 + m * 0.5)) * 14 * m;
    return [x0 + Math.cos(ang) * len * u - Math.sin(ang) * bend + mx * m / 2, y0 + Math.sin(ang) * len * u + Math.cos(ang) * bend + my * m / 2];
  }));
}
const tubes = [3, 8, 11].map((id) => ({ id, path: course(), reach: 10 + Math.round(rnd() * 8), core: 4 }));
const joins = [{ path: [[120, 120], [130, 126], [150, 140]], reach: 14, k: 3, fillet: 0.5, members: [3, 8], trunk: 3, fork: false }];
const b = binSwept(tubes, joins, { rows: 16, samples: N, slack: SLACK });
const cellAt = new Map();
for (let c = 0; c < b.nCells; c++) { const o = c * 6; cellAt.set(`${b.cells[o]},${b.cells[o + 1]}`, [...b.cells.subarray(o, o + 6)]); }
const listed = (x, y) => cellAt.get(`${Math.floor(x / CELL) * CELL},${Math.floor(y / CELL) * CELL}`) || null;
// A frame between two moments: each point on the line between its two samples, then moved by up to the slack (as morphFrame lets through).
function frameAt(t, j, f) {
  return t.path[j].map((p, i) => { const q = t.path[j + 1][i], a = rnd() * Math.PI * 2, r = rnd() * SLACK * 0.95; return [p[0] + (q[0] - p[0]) * f + Math.cos(a) * r, p[1] + (q[1] - p[1]) * f + Math.sin(a) * r]; });
}

test('every segment of a frame within the slack of its stretch is listed, with heads and runs that hold it, where it reaches', () => {
  for (let trial = 0; trial < 12; trial++) {
    const j = trial % 2, f = rnd();
    for (const t of tubes) {
      const P = frameAt(t, j, f);
      for (let i = 0; i < N - 1; i++) {
        const xs = [P[i][0], P[i + 1][0]], ys = [P[i][1], P[i + 1][1]];
        for (let x = Math.min(...xs) - t.reach; x <= Math.max(...xs) + t.reach; x += 3) for (let y = Math.min(...ys) - t.reach; y <= Math.max(...ys) + t.reach; y += 3) {
          if (segD2(x, y, P[i], P[i + 1]) > t.reach ** 2) continue;
          const c = listed(x, y);
          assert.ok(c, `a cell at ${x.toFixed(0)},${y.toFixed(0)} for vessel ${t.id}`);
          let found = false;
          for (let e = c[2]; e < c[2] + c[3]; e++) {
            if (b.ent[e * 8 + 4] !== t.id || b.ent[e * 8 + 5] !== -1) continue;
            // The head's circle holds every point of its stretch; each run's circle holds its segments' points.
            const hx = b.ent[e * 8], hy = b.ent[e * 8 + 1], hr = b.ent[e * 8 + 2], n = b.ent[e * 8 + 7];
            for (let g = e + 1; g <= e + n; g++) {
              const s = b.ent[g * 8 + 5];
              for (const p of [P[s], P[s + 1]]) assert.ok(Math.hypot(p[0] - hx, p[1] - hy) <= hr + 1e-3, 'in the head\'s circle');
              if (s === i) found = true;
            }
            for (let g = e + 1; g <= e + n;) {
              const ax = b.ent[g * 8], ay = b.ent[g * 8 + 1], rr = b.ent[g * 8 + 6], m = b.ent[g * 8 + 7];
              for (let k = g; k < g + m; k++) { const s = b.ent[k * 8 + 5]; for (const p of [P[s], P[s + 1]]) assert.ok(Math.hypot(p[0] - ax, p[1] - ay) <= rr + 1e-3, 'in the run\'s circle'); }
              g += m;
            }
          }
          assert.ok(found, `vessel ${t.id} segment ${i} listed at ${x.toFixed(0)},${y.toFixed(0)}`);
        }
      }
    }
  }
});

test('a join is listed, by its index, wherever it reaches along the course of its centres', () => {
  const j = joins[0];
  for (let k = 0; k < 20; k++) {
    const u = rnd() * (j.path.length - 1), a = j.path[Math.floor(u)], c = j.path[Math.min(j.path.length - 1, Math.floor(u) + 1)], f = u - Math.floor(u);
    const cx = a[0] + (c[0] - a[0]) * f, cy = a[1] + (c[1] - a[1]) * f;
    for (let x = cx - j.reach; x <= cx + j.reach; x += 3) for (let y = cy - j.reach; y <= cy + j.reach; y += 3) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > j.reach ** 2) continue;
      const cell = listed(x, y);
      if (!cell) continue;   // (a join draws only where a vessel's cell is)
      let found = false;
      for (let e = cell[4]; e < cell[4] + cell[5]; e++) if (b.ent[e * 8] === 0) found = true;
      assert.ok(found, `join listed at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
});

test('the frame\'s rows follow the lists: each vessel\'s points by row and sample, then the joins', () => {
  assert.equal(b.posBase, b.entRows * 2048);
  assert.equal(b.joinBase, b.posBase + 16 * N / 2);
  assert.ok(b.rows * 2048 >= b.joinBase + joins.length);
  const ent = new Float32Array(b.ent.length), P = tubes[1].path[2];
  writePoints(ent, b.posBase, N, 8, P);
  const o = (b.posBase + 8 * N / 2) * 4;
  assert.deepEqual([ent[o + 6], ent[o + 7]], [Math.fround(P[3][0]), Math.fround(P[3][1])]);
  writeJoinNow(ent, b.joinBase, 0, 5, 6, 7, 3, 0.5);
  assert.deepEqual([...ent.subarray(b.joinBase * 4, b.joinBase * 4 + 4)], [5, 6, 7, Math.fround(300.495)]);
});

test('a frame of the change draws from a stretch only once every point, reach and join is checked; else it is binned as before', () => {
  const stage = stageSource();
  const mf = stage.slice(stage.indexOf('  function morphFrame(items) {'), stage.indexOf('  const veinsRows = new Set();'));
  assert.ok(mf.indexOf("return morphMiss('course')") < mf.indexOf('veins.setMorphFrame(buf)'));
  assert.ok(mf.indexOf("return morphMiss('joins')") < mf.indexOf('veins.useMorphSet(pc.set)'));
  assert.ok(mf.includes("if (reachOf(it) > pc.reach.get(it.row)) return morphMiss('reach');"));
  assert.match(stage, /const MORPH_GPU = typeof Worker !== 'undefined';/);
  assert.match(stage, /if \(\(key !== (?:live\.)?(?:live\.)?vBinKey \|\| grew\) && gpuProbe\.time\(null, 'vessel sync: (?:live\.)?(?:live\.)?morph frame', morphFrame, items\)\) (?:live\.)?(?:live\.)?vBinKey = key;\n\s*else if \(key !== (?:live\.)?(?:live\.)?vBinKey \|\| grew\)/);
  // The shader reads the points and joins from the frame's rows only with morphOn.
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(morphOn == 1\) \{ int si = int\(B\.y \+ 0\.5\); A = vec4\(PT\(id, si\), PT\(id, si \+ 1\)\); \}/);
  assert.match(gl, /if \(morphOn == 1\) A = JT\(int\(A\.x \+ 0\.5\)\);/);
  // The worker is bundled with the build.
  assert.match(readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'), /sweep-worker\.js/);
});

test('the change keeps the labels up: solved at the tap, ridden on the morph\'s clock, crossfaded by its progress', () => {
  const stage = stageSource();
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  // (No label work on a frame of the change: updateLabels returns while viewXf stands, and nothing is solved as it lands.)
  assert.match(stage, /if \((?:live\.)?(?:live\.)?viewXf\) return;/);
  assert.match(stage, /if \((?:live\.)?camMove\) \{ if \(!(?:live\.)?vtGliding\) camSettle\(\); return; \}/);
  assert.match(stage, /writeVT\(u >= 1 \? \{ \.\.\.viewXf\.to \} : lerpVT\((?:live\.)?viewXf\.from, (?:live\.)?viewXf\.to, u\)\);/);   // (u: the camera's share of the change, view-xf.js viewXfCamU: a framing asked for mid-change retargets it)
  // (From the change's progress and the share at which the new labels were whole (view-xf.js viewXfMix): the ghosts ride at full until then, never a timer.)
  assert.match(stage, /const m = viewXfMix\(p, x\.landAt, XF_MIX\);\s*xfLayer\(m\.n\);\s*(?:live\.)?labelGL\.crossfade\(m\.o, m\.n\);/);
  assert.doesNotMatch(stage, /XF_FADE_MS|xfRamp/);
  const sv = stage.slice(stage.indexOf('    setView(v) {'), stage.indexOf('    relayout() {'));
  assert.ok(sv.includes('viewXfStart(d)') && !sv.includes('morph-fade'));
  assert.doesNotMatch(css, /(?:live\.)?morph-fade/);
});
