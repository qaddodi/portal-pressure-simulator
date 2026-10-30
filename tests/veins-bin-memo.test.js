import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binVeins } from '../src/ui/veins-bin.js';
import { readFileSync } from 'node:fs';

// While collaterals coil, one vessel's points change on each model frame and the rest hold still. Binning remembers each
// vessel's cells, so only the moving one is tested again; the result must match a fresh binning entry for entry, and when
// nothing about the geometry changed it must be the very same object, so the figure skips the 4 MB re-upload.
const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const coil = (t) => Array.from({ length: 40 }, (_, i) => [200 + i * 6, 300 + Math.sin(i * 0.7 + t) * 12 * t]);
const scene = (t, reach = 9) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 },
    { id: 2, pts: coil(t), reach },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1] }],
});
const same = (a, b) => {
  assert.equal(a.nEnt, b.nEnt); assert.equal(a.nCells, b.nCells); assert.equal(a.rows, b.rows);
  assert.deepEqual(Array.from(a.ent), Array.from(b.ent));
  assert.deepEqual(Array.from(a.cells), Array.from(b.cells));
};

test('remembered binning matches a fresh one while a vessel coils', () => {
  const memo = new Map();
  for (const [t, reach] of [[0, 9], [0.3, 9], [0.6, 9], [0.6, 12], [0.9, 12]]) {
    const { tubes, joins } = scene(t, reach);
    same(binVeins(tubes, joins, memo), binVeins(tubes, joins));
  }
});

test('the geometry is not rebuilt while nothing about it changed', () => {
  const memo = new Map();
  const a = binVeins(scene(0.5).tubes, scene(0.5).joins, memo);
  assert.equal(binVeins(scene(0.5).tubes, scene(0.5).joins, memo), a, 'same vessels, points, reaches and joins: same result object');
  const moved = binVeins(scene(0.6).tubes, scene(0.6).joins, memo);
  assert.notEqual(moved, a, 'a coiling vessel moved: a new result');
  const j = scene(0.6);
  j.joins[0].k = 0.5;
  assert.notEqual(binVeins(j.tubes, j.joins, memo), moved, 'a join changed: a new result');
  const fewer = scene(0.6);
  fewer.tubes.pop();
  const r = binVeins(fewer.tubes, fewer.joins, memo);
  same(r, binVeins(fewer.tubes, fewer.joins));
});

test('the figure uploads the vessel geometry only when binning gave a new result', async () => {
  const { readFileSync } = await import('node:fs');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /binVeins\([^;]*, binMemo\);\s*\n(?:\s*\/\/.*\n)*\s*let patched = null;\s*if \(bins !== binShown\) \{\s*if \(bins\.patch && binShown\?\.ent === bins\.ent\) \{ veins\.patchGeometry\(bins\); if \(bins\.patchRows\) patched = bins\.patchRows; \} else veins\.setGeometry\(bins\);\s*binShown = bins;\s*\}/);
});

// A coiling collateral on the catheter slide: each coil step was a whole redraw of the vessel layer (his Mac readouts, 30 Oct). A patch
// that moved vessels' points alone now names them, and the figure draws their cells again as it does for vessels whose radii changed.
test('a coil patch names the vessels it moved, and every entry it changed lies in a cell that lists one of them', () => {
  const memo = new Map();
  const a = binVeins(scene(0.5).tubes, scene(0.5).joins, memo);
  const ent0 = Float32Array.from(a.ent);
  const r = binVeins(scene(0.5006).tubes, scene(0.5006).joins, memo);
  assert.ok(r.patch && r.ent === a.ent, 'a patch');
  assert.deepEqual(r.patchTubes, [2], 'the coil alone');
  assert.equal(r.patchJoins, 0);
  const lists = (c, id) => { for (let e = r.cells[c * 6 + 2], e1 = e + r.cells[c * 6 + 3]; e < e1; e++) if (r.ent[e * 8 + 4] === id) return true; return false; };
  let changed = 0;
  for (let e = 0; e < r.nEnt; e++) {
    let diff = false;
    for (let f = 0; f < 8; f++) if (!Object.is(ent0[e * 8 + f], r.ent[e * 8 + f])) diff = true;
    if (!diff) continue;
    changed++;
    let ok = false;
    for (let c = 0; c < r.nCells && !ok; c++) if (e >= r.cells[c * 6 + 2] && e < r.cells[c * 6 + 2] + r.cells[c * 6 + 3] && r.patchTubes.some((id) => lists(c, id))) ok = true;
    assert.ok(ok, `entry ${e} changed outside the moved vessels' cells`);
  }
  assert.ok(changed > 0);
  // A join written again: its entries named, and its members among the rows the figure names to its next draw.
  const j = scene(0.5006);
  j.joins[0].k = 0.55;
  const rj = binVeins(j.tubes, j.joins, memo);
  assert.ok(rj.patch && rj.patchJoins === 1 && rj.patchTubes.length === 0);
  assert.ok(rj.patchJoinEnts.length > 0);
  assert.deepEqual([...rj.patchRows].sort(), [0, 1]);
});

// The catheter slide (his Mac readout on f6a1c24, 30 Oct): its collaterals' joins ease with the widths, so nearly every coil step wrote
// a join again too, and each was a whole redraw ("no kept layer" in every frame). The cells a patch can change are now the moved
// vessels' cells and the cells holding the join entries it wrote: every entry that changed is in one of them.
test('every entry a patch changes, a join\'s included, lies in a moved vessel\'s cell or a cell marked for its joins', async () => {
  const { cellsOfJoinEntries } = await import('../src/ui/veins-bin.js');
  const memo = new Map();
  const a = binVeins(scene(0.5).tubes, scene(0.5).joins, memo);
  const ent0 = Float32Array.from(a.ent);
  const j = scene(0.5006);
  j.joins[0].k = 0.47;
  const r = binVeins(j.tubes, j.joins, memo);
  assert.ok(r.patch && r.ent === a.ent && r.patchJoins === 1 && r.patchTubes.length === 1);
  const { mark, k } = cellsOfJoinEntries(r.cells, r.nCells, r.patchJoinEnts);
  // (By brute force: the cells whose join part holds an entry.)
  const want = new Set();
  for (const e of r.patchJoinEnts) for (let c = 0; c < r.nCells; c++) if (e >= r.cells[c * 6 + 4] && e < r.cells[c * 6 + 4] + r.cells[c * 6 + 5]) want.add(c);
  assert.deepEqual([...mark.keys()].filter((c) => mark[c]), [...want].sort((x, y) => x - y));
  assert.equal(k, want.size);
  assert.ok(k > 0);
  const lists = (c, id) => { for (let e = r.cells[c * 6 + 2], e1 = e + r.cells[c * 6 + 3]; e < e1; e++) if (r.ent[e * 8 + 4] === id) return true; return false; };
  let changed = 0;
  for (let e = 0; e < r.nEnt; e++) {
    let diff = false;
    for (let f = 0; f < 8; f++) if (!Object.is(ent0[e * 8 + f], r.ent[e * 8 + f])) diff = true;
    if (!diff) continue;
    changed++;
    let ok = false;
    for (let c = 0; c < r.nCells && !ok; c++) {
      const inSegs = e >= r.cells[c * 6 + 2] && e < r.cells[c * 6 + 2] + r.cells[c * 6 + 3], inJoins = e >= r.cells[c * 6 + 4] && e < r.cells[c * 6 + 4] + r.cells[c * 6 + 5];
      if ((inSegs && r.patchTubes.some((id) => lists(c, id))) || (inJoins && mark[c])) ok = true;
    }
    assert.ok(ok, `entry ${e} changed outside the cells marked`);
  }
  assert.ok(changed > 0);
  // Several entries, a mark already holding some: only the new ones are counted.
  const again = cellsOfJoinEntries(r.cells, r.nCells, r.patchJoinEnts, mark);
  assert.equal(again.k, 0);
});

test('the renderer keeps its vessel layer for a geometry patch, and the figure names its rows to the next draw', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  const body = gl.slice(gl.indexOf('patchGeometry(bins) {'), gl.indexOf('/** A vessel\'s lumen radius'));
  assert.match(body, /figVer\+\+;/);
  assert.match(body, /if \(bins\.patchTubes && bins\.cells === cellsCPU && bins\.ent === entCPU\) \{\s*for \(const r of bins\.patchTubes\) \{ radRows\.add\(r\); moved\[r\] = 1; \}/);
  assert.match(body, /patchK \+= cellsOfJoinEntries\(cellsCPU, nCells, bins\.patchJoinEnts, patchMark \|\|= new Uint8Array\(nCells\)\)\.k;/);
  assert.match(body, /\} else \{ fboOK = false; movedAll = true; \}/);
  // (radRows: a partial draw or a pan's shift is refused unless it is given every one of those rows: radCovered. The joins' cells go
  // with the cells drawn again (rowParts), a pan takes them too, and every draw that lets go of radRows lets go of them.)
  assert.match(gl, /if \(!radCovered\(rows\)\) return refuse\('radii not listed'\);/);
  assert.match(gl, /const panAt = fboOK && radCovered\(rows\)/);
  assert.match(gl, /if \(patchK\) for \(let c = 0; c < nCells; c\+\+\) if \(patchMark\[c\] && !part\.mark\[c\]\) \{ part\.mark\[c\] = 1; part\.k\+\+; \}/);
  assert.match(gl, /const pan = panAt && \(!\(tubesNew \|\| radRows\.size \|\| patchK\) \|\| parts\);/);
  assert.doesNotMatch(gl, /radRows\.clear\(\)(?!; patchMark = null)/, 'every let-go of radRows lets go of the joins\' cells');
  assert.match(gl, /movedAll = true; patchMark = null; patchK = 0;/, 'a whole binning drops them');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /if \(patched\) for \(const r of patched\) veinsRows\.add\(r\);\s*else tubesNew = true;/);
  // (Rows waiting keep the loop from sleeping, as a dirty layer does, and a hidden page draws them as it draws a dirty layer.)
  assert.match(stage, /const rowsWait = veinsRows\.size > 0 && !!veins && !veins\.lost && !!vLook && !!F;\s*if \(still && !veinsDirty && !rowsWait && /);
  assert.match(stage, /if \(plateRedraw \|\| \(document\.hidden && \(veinsDirty \|\| veinsRows\.size\)\)\) \{/);
});

// A coil step moves one vessel's points without changing which cells list it: the last result is patched in place, entry for
// entry what a whole binning gives, and only the rows that changed are marked for upload (round 2 review, G1-3: a whole
// binning and a 4 MB upload at every model frame of a coil, for 20–35 s after a patient change or a talk start).
test('a coil step patches the last binning in place, entry for entry a whole binning', () => {
  const memo = new Map();
  const a = binVeins(scene(0.5).tubes, scene(0.5).joins, memo);
  const ent0 = Float32Array.from(a.ent);
  let last = a, patched = 0;
  for (const t of [0.5004, 0.5008, 0.5012]) {
    const { tubes, joins } = scene(t), r = binVeins(tubes, joins, memo);
    assert.notEqual(r, last, 'the points moved: a new result, so the figure uploads it');
    same(r, binVeins(tubes, joins));
    if (r.patch) {
      patched++;
      assert.equal(r.ent, a.ent, 'patched in place');
      assert.equal(r.cells, a.cells, 'the cells are as uploaded');
      const W = 2048 * 4;
      for (let i = 0; i < ent0.length; i++) if (!Object.is(ent0[i], r.ent[i])) assert.ok(r.patch.some(([r0, r1]) => i >= r0 * W && i < (r1 + 1) * W), `a changed float (${i}) outside the rows marked for upload`);
    }
    ent0.set(r.ent); last = r;
  }
  assert.equal(patched, 3, 'each small coil step is a patch');
  assert.equal(binVeins(scene(0.5012).tubes, scene(0.5012).joins, memo), last, 'nothing changed since: the same result');
  // A step that moves the vessel into other cells, a join into other cells, or another set of vessels: a whole binning.
  const far = binVeins(scene(0.9).tubes, scene(0.9).joins, memo);
  assert.ok(!far.patch && far.ent !== a.ent);
  same(far, binVeins(scene(0.9).tubes, scene(0.9).joins));
  const j = scene(0.9);
  j.joins[0].k = 0.5;
  const rj = binVeins(j.tubes, j.joins, memo);
  assert.ok(rj.patch && rj.ent === far.ent, 'a join\'s blend changed, its cells did not: a patch');
  same(rj, binVeins(j.tubes, j.joins));
  j.joins[0].reach = 60;
  const rw = binVeins(j.tubes, j.joins, memo);
  assert.ok(!rw.patch && rw.ent !== far.ent, 'a join reaching other cells: a whole binning');
  same(rw, binVeins(j.tubes, j.joins));
  const fewer = scene(0.9);
  fewer.tubes.pop();
  same(binVeins(fewer.tubes, fewer.joins, memo), binVeins(fewer.tubes, fewer.joins));
});

// A coiling vessel's cells tested against its points when the coil began, reaching farther by as much as it can still
// move: every step a patch, the cells listing it everywhere a binning of its own points would, and the entries those of a
// whole binning of the same tubes.
test('a vessel binned against other points: listed wherever its own points would be, its entries its own', () => {
  const memo = new Map(), from = coil(0.5), m = 2;
  const tube = (t) => ({ ...scene(t), tubes: scene(t).tubes.map((x) => (x.id === 2 ? { ...x, bin: from, reach: x.reach + m } : x)) });
  const first = binVeins(tube(0.5).tubes, tube(0.5).joins, memo);
  for (const t of [0.55, 0.6, 0.65]) {
    const { tubes, joins } = tube(t), r = binVeins(tubes, joins, memo);
    assert.ok(r.patch && r.ent === first.ent, `t ${t}: a patch`);
    same(r, binVeins(tubes, joins));
    // Every (cell, segment) a binning of its own points lists is listed here too.
    const own = binVeins(scene(t).tubes, scene(t).joins), pairs = (b) => {
      const out = new Set();
      for (let c = 0; c < b.nCells; c++) for (let e = b.cells[c * 6 + 2], e1 = e + b.cells[c * 6 + 3]; e < e1; e++) if (b.ent[e * 8 + 4] === 2 && b.ent[e * 8 + 5] >= 0) out.add(`${b.cells[c * 6]},${b.cells[c * 6 + 1]},${b.ent[e * 8 + 5]},${b.ent[e * 8]},${b.ent[e * 8 + 1]}`);
      return out;
    };
    const mine = pairs(r);
    for (const p of pairs(own)) assert.ok(mine.has(p), `t ${t}: segment ${p} missing`);
  }
});

test('each cell lists each vessel under a head circle, then in runs of one vessel, each run bounded around its start', async () => {
  const { RUN } = await import('../src/ui/veins-bin.js');
  const b = binVeins(scene(0.4).tubes, scene(0.4).joins);
  let runs = 0, heads = 0;
  for (let c = 0; c < b.nCells; c++) {
    const s0 = b.cells[c * 6 + 2], n = b.cells[c * 6 + 3];
    let groupEnd = s0;
    for (let e = s0; e < s0 + n;) {
      const q0 = e * 8;
      if (e === groupEnd) {
        // A head: segment index -1, the stretch's length, every point of the stretch inside its circle.
        assert.equal(b.ent[q0 + 5], -1, 'each vessel\'s stretch starts with a head');
        const len = b.ent[q0 + 7];
        assert.ok(len >= 1 && e + 1 + len <= s0 + n, 'a stretch stays inside its cell');
        for (let k = e + 1; k <= e + len; k++) {
          const q = k * 8;
          assert.equal(b.ent[q + 4], b.ent[q0 + 4], 'a stretch is one vessel');
          assert.notEqual(b.ent[q + 5], -1);
          for (const [x, y] of [[b.ent[q], b.ent[q + 1]], [b.ent[q + 2], b.ent[q + 3]]]) assert.ok(Math.hypot(x - b.ent[q0], y - b.ent[q0 + 1]) <= b.ent[q0 + 2], 'every point of the stretch lies within its head circle');
        }
        if (e + 1 + len < s0 + n) assert.notEqual(b.ent[(e + 1 + len) * 8 + 4], b.ent[q0 + 4], 'a stretch holds all of the vessel\'s run of the list');
        groupEnd = e + 1 + len; heads++; e++;
        continue;
      }
      const len = b.ent[q0 + 7], rho = b.ent[q0 + 6];
      assert.ok(len >= 1 && len <= RUN && e + len <= groupEnd, 'a run stays inside its stretch');
      for (let k = e; k < e + len; k++) {
        const q = k * 8;
        assert.equal(b.ent[q + 4], b.ent[q0 + 4], 'a run is one vessel');
        if (k > e) assert.equal(b.ent[q + 7], 0, 'only a run\'s first entry carries it');
        for (const [x, y] of [[b.ent[q], b.ent[q + 1]], [b.ent[q + 2], b.ent[q + 3]]]) assert.ok(Math.hypot(x - b.ent[q0], y - b.ent[q0 + 1]) <= rho, 'every point of the run lies within its radius');
      }
      // A run ends at RUN segments or where the stretch ends.
      if (len < RUN) assert.equal(e + len, groupEnd);
      runs++; e += len;
    }
    assert.equal(groupEnd, s0 + n);
  }
  assert.ok(runs > 0 && heads > 0);
});

test('squared distances bin exactly as Math.hypot did (round 2 review, P3): same entries, bit for bit', async () => {
  const { createHash } = await import('node:crypto');
  // Fingerprints of the entries and cells taken with the Math.hypot version (before 18 Oct).
  const want = { 0: [766, 139, '21f27f695fbed023'], 0.5: [790, 148, '7be0340013fcfd65'], 0.9: [792, 151, 'fff0da2a6def8bd9'] };
  for (const [t, [nEnt, nCells, sum]] of Object.entries(want)) {
    const s = scene(+t), r = binVeins(s.tubes, s.joins);
    const got = createHash('sha256').update(Buffer.from(r.ent.buffer)).update(Buffer.from(r.cells.buffer)).digest('hex').slice(0, 16);
    assert.deepEqual([r.nEnt, r.nCells, got], [nEnt, nCells, sum], `t ${t}`);
  }
  assert.doesNotMatch(readFileSync(new URL('../src/ui/veins-bin.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), /Math\.hypot\(/);
});
