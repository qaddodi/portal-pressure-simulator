import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins, CELL } from '../src/ui/veins-bin.js';

// A frame where only the blood moved repaints only the cells a lumen can reach (binVeins' `blood`); the other vessel cells
// hold casings, shadows and the plate, which come out as the last frame left them. So every point a lumen can reach must lie
// in one of those cells, or the blood would stand still there; and only frames where nothing but the blood moved may skip the rest.
const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const coil = (t) => Array.from({ length: 40 }, (_, i) => [200 + i * 6, 300 + Math.sin(i * 0.7 + t) * 12 * t]);
const cellsOf = (arr, n) => new Set(Array.from({ length: n }, (_, i) => `${arr[i * 6]},${arr[i * 6 + 1]}`));
const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(ax + dx * h - px, ay + dy * h - py);
};
// Every point within `core` of a tube (on a fine grid), in the cell that holds it.
function lumenCells(tubes) {
  const out = new Set();
  for (const t of tubes) {
    const P = t.bin || t.pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x - t.core); y0 = Math.min(y0, y - t.core); x1 = Math.max(x1, x + t.core); y1 = Math.max(y1, y + t.core); }
    for (let y = y0; y <= y1; y += 0.5) for (let x = x0; x <= x1; x += 0.5) {
      let d = Infinity;
      for (let i = 0; i < P.length - 1 && d > t.core; i++) d = Math.min(d, segDist(x, y, P[i], P[i + 1]));
      if (d <= t.core) out.add([x, y]);
    }
  }
  return out;
}

const scene = (t = 0.5) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 30, core: 18 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 24, core: 12 },
    { id: 2, pts: coil(t), reach: 26, core: 14 },
    { id: 3, pts: line(60, 260, 20, 9, -2), reach: 22, core: 10 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1] }],
});

test('every point a lumen can reach lies in a blood cell', () => {
  const { tubes, joins } = scene();
  const b = binVeins(tubes, joins), blood = cellsOf(b.blood, b.nBlood);
  // (A cell's origin is the binning's x0 + k CELL: find the cell holding a point from any blood cell's origin.)
  const ox = b.blood[0], oy = b.blood[1], cellOf = ([x, y]) => `${ox + Math.floor((x - ox) / CELL) * CELL},${oy + Math.floor((y - oy) / CELL) * CELL}`;
  let missed = 0;
  for (const p of lumenCells(tubes)) if (!blood.has(cellOf(p))) missed++;
  assert.equal(missed, 0, 'no lumen point outside the blood cells');
});

test('the blood cells are vessel cells, in the same layout, and fewer when the cores are narrower than the reach', () => {
  const { tubes, joins } = scene();
  const b = binVeins(tubes, joins), all = cellsOf(b.cells, b.nCells);
  const rows = new Map(Array.from({ length: b.nCells }, (_, i) => [`${b.cells[i * 6]},${b.cells[i * 6 + 1]}`, Array.from(b.cells.subarray(i * 6, i * 6 + 6))]));
  for (let i = 0; i < b.nBlood; i++) {
    const k = `${b.blood[i * 6]},${b.blood[i * 6 + 1]}`;
    assert.ok(all.has(k), 'a blood cell is a vessel cell');
    assert.deepEqual(Array.from(b.blood.subarray(i * 6, i * 6 + 6)), rows.get(k), 'with the same entries');
  }
  assert.ok(b.nBlood < b.nCells, `${b.nBlood} blood cells of ${b.nCells}`);
});

test('every cell listing a join is a blood cell (the fillet swells the lumens there)', () => {
  const { tubes, joins } = scene();
  const b = binVeins(tubes, joins), blood = cellsOf(b.blood, b.nBlood);
  for (let i = 0; i < b.nCells; i++) if (b.cells[i * 6 + 5] > 0) assert.ok(blood.has(`${b.cells[i * 6]},${b.cells[i * 6 + 1]}`));
});

test('vessels without a core keep every cell (the lobule)', () => {
  const tubes = scene().tubes.map(({ core, ...t }) => t);
  const b = binVeins(tubes, scene().joins);
  assert.equal(b.nBlood, b.nCells);
  assert.deepEqual(Array.from(b.blood), Array.from(b.cells));
});

test('a remembered binning (a coil patched in place) has the same blood cells as a fresh one', () => {
  const memo = new Map();
  for (const t of [0, 0.3, 0.6, 0.6, 0.9]) {
    const s = scene(t);
    const a = binVeins(s.tubes, s.joins, memo), f = binVeins(s.tubes, s.joins);
    assert.equal(a.nBlood, f.nBlood);
    assert.deepEqual(Array.from(a.blood), Array.from(f.blood));
  }
  // A coil tested against its points when it began (bin): moving the drawn points keeps the cells and the blood cells.
  const s = scene(0.6), memo2 = new Map();
  const bin = s.tubes[2].pts;
  binVeins(s.tubes.map((t) => (t.id === 2 ? { ...t, bin, reach: t.reach + 3, core: t.core + 3 } : t)), s.joins, memo2);
  const moved = s.tubes.map((t) => (t.id === 2 ? { ...t, pts: coil(0.65), bin, reach: t.reach + 3, core: t.core + 3 } : t));
  const p = binVeins(moved, s.joins, memo2), f = binVeins(moved, s.joins);
  assert.deepEqual(Array.from(p.blood), Array.from(f.blood));
});

test('the figure bins each vessel with a core and repaints the redrawn cells whole after a partial vessel redraw', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // The core: the reach less the 18 reachOf adds for casing, shadow and glow, plus a pad.
  assert.match(stage, /const reachOf = \(it\) => Math\.ceil\(\(it\.obj\.glMaxR \+ \(it\.x\.wallPx \|\| 1\) \+ 18\) \/ 2\) \* 2;/);
  assert.match(stage, /const core = reach - 18 \+ BLOOD_PAD;/);
  assert.match(stage, /reach: reach \+ a\.m, core: core \+ a\.m/);
  // drawRows changed the vessel layer under some cells: its composite repaints those cells whole (shape and tint both), the rest as the
  // blood's frame does (external review, 21 Oct: one changed cell repainted every cell).
  assert.match(gl, /const both = part\.k \+ tintPart\.k;\n\s*if \(both\) \{ const mark = part\.mark; for \(let c = 0; c < nCells; c\+\+\) if \(tintPart\.mark\[c\]\) mark\[c\] = 1; uploadPart\(\{ mark, k: both \}\); \}\n\s*this\.composite\(look, blood, full, both\);/);
  // (Those cells come split by the vessel program that drew them, veins-bin splitCells: both lists are composited.)
  assert.match(gl, /if \(part\) \{ if \(partG\) \{ gl\.bindVertexArray\(partVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, partG\); \} if \(partS\) \{ gl\.bindVertexArray\(partSVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, partS\); \} \}/);
  assert.match(gl, /function uploadPart\(\{ mark \}\) \{\n\s*const \{ gen, one, nGen: g, nOne: o \} = splitCells\(cellsCPU, nCells, simpleOf, mark\);/);
});

test('a frame where only the blood moved leaves the pixels with no lumen as drawn, and every other pass draws them all', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // (Mohammad's Mac at rest, zoom 4.24, 21 Oct: the blood squares' other pixels were most of each frame's GPU work.)
  const main = gl.slice(gl.indexOf('void main() {\n  ivec2 ip = ivec2(gl_FragCoord.xy);\n  uvec4 g'));
  // The lumen test comes first, before the plate, glows and fluid are read, and is the same lumen the blood, dye and origin need.
  assert.match(main, /^void main\(\) \{\n {2}ivec2 ip = ivec2\(gl_FragCoord\.xy\);\n {2}uvec4 g = texelFetch\(gbuf, ip, 0\);\n(?: {2}\/\/.*\n)+ {2}if \(bloodOnly == 1 && g\.x == 0u\) discard;\n/);
  assert.match(main, /float vis = g\.x > 0u \?/);
  assert.match(main, /\(vis > 0\.005 \|\| \(dyeOn == 1 && g\.x > 0u\)\)/);
  assert.equal((main.match(/uvec4 g = /g) || []).length, 1);
  // Set to 1 only around the blood squares' own draw; the whole picture, the redraw after drawRows (all) and the fluid's cells
  // (its ripple moves every pixel of them) draw every pixel.
  const comp = gl.slice(gl.indexOf('    composite(look, blood = {}, full = false, part = 0) {'), gl.indexOf('    /** Whether organ outlines can be drawn here'));
  assert.match(comp, /if \(full\) \{\n\s*gl\.uniform1i\(U\.bloodOnly, 0\);/);
  assert.match(comp, /gl\.uniform1i\(U\.bloodOnly, 0\);\n\s*if \(part\) \{[^\n]*\}\n\s*gl\.uniform1i\(U\.bloodOnly, 1\);\n\s*if \(nBlood\) \{ gl\.bindVertexArray\(bloodVAO\);[^\n]*\}\n\s*gl\.uniform1i\(U\.bloodOnly, 0\);\n\s*if \(fl\?\.ripple && nFluid\)/);
  assert.equal((comp.match(/U\.bloodOnly/g) || []).length, 4);
});
