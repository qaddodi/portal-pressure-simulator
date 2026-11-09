// Brute-force judgements of a compiled grid (tests 1 to 6 of plan 9.A), written from the vessels' points and radii with no call into the compiler's own
// geometry. Shared by tests/vec-compile.test.js (cirr-decomp) and tests/vec-compile-presets.test.js (every preset). Not a *.test.js.
import assert from 'node:assert/strict';
import {
  GRID_W, CELL_EMPTY, CELL_SIMPLE, CELL_REGION, WIN_MAX, MAX_MEMBERS, MAX_JOINS, K_JOIN, K_CROSSTIER, M_JOINED, REGION_QUAD_PAD_PX,
} from '../src/ui/vec-contract.js';
import { createVecGraph } from '../src/ui/vec-graph.js';
import { createReach, createCompiled, compileGrid, cellOfPixel, cellOfWorld, regionOf, NS } from '../src/ui/vec-compile.js';
import { N_QUADS } from '../src/ui/veins-mesh.js';
export { ptSeg2, ptRect2, segRectD2 };
export const TOL = 1e-3;
export const CS = (v) => v.out.cs;
export const kindAt = (out, t) => out.cells[t * 4];
// ── Brute-force geometry (written here) ──
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function ptSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}
function ptRect2(px, py, x0, y0, x1, y1) { const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0, dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0; return dx * dx + dy * dy; }
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function segSegX(ax, ay, bx, by, cx, cy, dx, dy) {   // proper or touching intersection
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by), d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segRectD2(ax, ay, bx, by, x0, y0, x1, y1) {   // squared distance between a segment and a box
  if (inRect(ax, ay, x0, y0, x1, y1) || inRect(bx, by, x0, y0, x1, y1)) return 0;
  if (segSegX(ax, ay, bx, by, x0, y0, x1, y0) || segSegX(ax, ay, bx, by, x1, y0, x1, y1) || segSegX(ax, ay, bx, by, x1, y1, x0, y1) || segSegX(ax, ay, bx, by, x0, y1, x0, y0)) return 0;
  let m = Math.min(ptRect2(ax, ay, x0, y0, x1, y1), ptRect2(bx, by, x0, y0, x1, y1));
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) m = Math.min(m, ptSeg2(cx, cy, ax, ay, bx, by));
  return m;
}

export function build(f) {
  const graph = createVecGraph();
  graph.fromBins(f.bins, f.nTubes); graph.attrs(f.tube);
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  graph.radii(radAll);
  const reach = createReach(), out = createCompiled();
  compileGrid(graph, reach, out);
  return { f, graph, radAll, reach, out };
}


/** The cells a row's segment touches at its compiled reach (shrunk by TOL so a borderline cell is not demanded): [{ cell, i }] over all on rows. */
function touches(v, shrink) {
  const { graph, reach, out } = v, cs = CS(v), res = [];
  for (let r = 0; r < graph.nRows; r++) {
    if (!graph.rows[r].on) continue;
    for (let i = 0; i < N_QUADS; i++) {
      if (!graph.seg[r * N_QUADS + i]) continue;
      const o = (r * NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3];
      const R = Math.max(reach.rb[r * NS + i], reach.rb[r * NS + i + 1]) + reach.pad[r] + (shrink ? -TOL : TOL), R2 = R * R;
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - out.x0) / cs)), cx1 = Math.min(out.nx - 1, Math.floor((Math.max(ax, bx) + R - out.x0) / cs));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - R - out.y0) / cs)), cy1 = Math.min(out.ny - 1, Math.floor((Math.max(ay, by) + R - out.y0) / cs));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const wx = out.x0 + cx * cs, wy = out.y0 + cy * cs;
        if (segRectD2(ax, ay, bx, by, wx, wy, wx + cs, wy + cs) <= R2) res.push({ cell: cy * GRID_W + cx, row: r, i });
      }
    }
  }
  return res;
}

export function checkBuilt(v, t, name) {
  const on = v.graph.rows.filter((r) => r.on).length;
  assert.ok(on > 40, `${on} vessel rows`);
  assert.ok(v.graph.joins.n > 50, `${v.graph.joins.n} joins`);
  assert.ok(!v.out.tooWide && v.out.nx <= GRID_W, `grid ${v.out.nx} wide`);
  const st = v.out.stats;
  t.diagnostic(`${name}: ${on} rows, ${v.graph.joins.n} joins, grid ${v.out.nx}x${v.out.ny}; ${JSON.stringify(st)}`);
}
export function check1(v, t, name, opts) {
  const { graph, reach, out } = v, cs = CS(v), B = 24;
  const segs = [], bucket = new Map();
  for (let r = 0; r < graph.nRows; r++) {
    if (!graph.rows[r].on) continue;
    for (let i = 0; i < N_QUADS; i++) {
      if (!graph.seg[r * N_QUADS + i]) continue;
      const o = (r * NS + i) * 2, R = Math.max(reach.rb[r * NS + i], reach.rb[r * NS + i + 1]) + reach.pad[r] - TOL;
      const s = { r, ax: graph.pts[o], ay: graph.pts[o + 1], bx: graph.pts[o + 2], by: graph.pts[o + 3], R2: R * R };
      const id = segs.push(s) - 1;
      for (let by = Math.floor((Math.min(s.ay, s.by) - R) / B); by <= Math.floor((Math.max(s.ay, s.by) + R) / B); by++) {
        for (let bx = Math.floor((Math.min(s.ax, s.bx) - R) / B); bx <= Math.floor((Math.max(s.ax, s.bx) + R) / B); bx++) {
          const k = bx * 100003 + by; let a = bucket.get(k); if (!a) bucket.set(k, a = []); a.push(id);
        }
      }
    }
  }
  let pts = 0, two = 0, one = 0;
  const STEP = opts?.step ?? 3;
  for (let y = out.y0; y < out.y0 + out.ny * cs; y += STEP) for (let x = out.x0; x < out.x0 + out.nx * cs; x += STEP) {
    const list = bucket.get(Math.floor(x / B) * 100003 + Math.floor(y / B));
    if (!list) continue;
    let r0 = -1, r1 = -1;
    for (const id of list) {
      const s = segs[id];
      if (ptSeg2(x, y, s.ax, s.ay, s.bx, s.by) > s.R2) continue;
      if (r0 < 0) r0 = s.r; else if (s.r !== r0) { r1 = s.r; break; }
    }
    if (r0 < 0) continue;
    pts++;
    const c = cellOfWorld(out, x, y);
    assert.ok(c >= 0, `a point (${x}, ${y}) in a vessel's reach is outside the grid`);
    if (r1 >= 0) { two++; assert.equal(kindAt(out, c), CELL_REGION, `point (${x.toFixed(1)}, ${y.toFixed(1)}) is in the reach of rows ${r0} and ${r1} but its cell is kind ${kindAt(out, c)}`); }
    else { one++; assert.notEqual(kindAt(out, c), CELL_EMPTY, `point (${x.toFixed(1)}, ${y.toFixed(1)}) is in row ${r0}'s reach but its cell is empty`); }
  }
  assert.ok(two > 20 && one > 200, `the check saw ${two} two-vessel points and ${one} one-vessel points`);
  t.diagnostic(`${name}: ${pts} points in a reach, ${two} in two or more: all in regions`);
}
export function check2(v, t, name, opts) {
  const { out } = v, tl = touches(v, true), want = new Map();
  for (const e of tl) { let m = want.get(e.cell); if (!m) want.set(e.cell, m = new Map()); let q = m.get(e.row); if (!q) m.set(e.row, q = [1e9, -1]); q[0] = Math.min(q[0], e.i); q[1] = Math.max(q[1], e.i); }
  let simple = 0, widest = 0;
  for (let cy = 0; cy < out.ny; cy++) for (let cx = 0; cx < out.nx; cx++) {
    const tx = cy * GRID_W + cx;
    if (kindAt(out, tx) !== CELL_SIMPLE) continue;
    simple++;
    const row = out.cells[tx * 4 + 1], i0 = out.cells[tx * 4 + 2], i1 = out.cells[tx * 4 + 3];
    const m = want.get(tx);
    assert.ok(m && m.has(row), `ordinary cell ${cx},${cy} names row ${row} but no segment of it reaches the cell`);
    assert.equal(m.size, 1, `ordinary cell ${cx},${cy}: ${m.size} vessels reach it`);
    const [lo, hi] = m.get(row);
    assert.ok(i0 <= lo && i1 >= hi, `cell ${cx},${cy}: run ${i0}-${i1} misses a segment in ${lo}-${hi}`);
    assert.ok(i1 - i0 + 1 <= WIN_MAX, `cell ${cx},${cy}: run of ${i1 - i0 + 1} over WIN_MAX ${WIN_MAX}`);
    widest = Math.max(widest, i1 - i0 + 1);
  }
  // and no cell with a vessel reaching it is empty
  for (const [tx] of want) assert.notEqual(kindAt(out, tx), CELL_EMPTY, `cell texel ${tx} has a vessel in reach and is empty`);
  assert.ok(simple >= (opts?.minSimple ?? 100), `${simple} ordinary cells`);
  t.diagnostic(`${name}: ${simple} ordinary cells (${(100 * simple / (simple + out.stats.regions)).toFixed(0)}% of the occupied), widest run ${widest}`);
}
export function check3(v, t, name) {
  const { graph, reach, out } = v, J = graph.joins, cs = CS(v);
  const mapAt = (R0) => {   // texel -> joins whose disc (bound R0 from reach.jb) reaches it
    const per = new Map();
    for (let j = 0; j < J.n; j++) {
      if (!(J.reach[j] > 0)) continue;
      const R = reach.jb[j] + R0;
      for (let cy = Math.max(0, Math.floor((J.y[j] - R - out.y0) / cs)); cy <= Math.min(out.ny - 1, Math.floor((J.y[j] + R - out.y0) / cs)); cy++) {
        for (let cx = Math.max(0, Math.floor((J.x[j] - R - out.x0) / cs)); cx <= Math.min(out.nx - 1, Math.floor((J.x[j] + R - out.x0) / cs)); cx++) {
          const wx = out.x0 + cx * cs, wy = out.y0 + cy * cs;
          if (ptRect2(J.x[j], J.y[j], wx, wy, wx + cs, wy + cs) > R * R) continue;
          const tx = cy * GRID_W + cx; let a = per.get(tx); if (!a) per.set(tx, a = []); a.push(j);
        }
      }
    }
    return per;
  };
  const per = mapAt(-TOL), outer = mapAt(TOL);   // (a join a hair inside the bound may or may not be listed: a count between the two)
  let cellsChecked = 0, over = 0;
  for (const [tx, js] of per) {
    assert.equal(kindAt(out, tx), CELL_REGION, `a join reaches cell texel ${tx} and it is kind ${kindAt(out, tx)}`);
    const reg = regionOf(out, out.cells[tx * 4 + 1]);
    assert.ok(reg.kind & K_JOIN, `cell ${tx}: region without K_JOIN`);
    cellsChecked++;
    if (js.length > MAX_JOINS) {
      over++;
      assert.equal(reg.joins.length, MAX_JOINS, `cell ${tx}: ${js.length} joins reach it, the region lists ${reg.joins.length}`);
      for (const rj of reg.joins) assert.ok(outer.get(tx).some((j) => J.x[j] === rj.x && J.y[j] === rj.y), `cell ${tx}: a listed join does not reach the cell`);
      continue;
    }
    const hi = Math.min(MAX_JOINS, outer.get(tx).length);
    assert.ok(reg.joins.length >= js.length && reg.joins.length <= hi, `cell ${tx}: ${js.length} joins reach it (${hi} at the edge), the region lists ${reg.joins.length}`);
    for (const j of js) {
      // (several joins can lie at one point: it is listed when some listed join has its numbers and all its members)
      const mine = [];
      for (let q = 0; q < 4; q++) { const r = J.mem[j * 4 + q]; if (r >= 0 && graph.rows[r].on) mine.push(r); }
      const found = reg.joins.some((rj) => {
        if (rj.x !== J.x[j] || rj.y !== J.y[j] || rj.reach !== J.reach[j] || rj.k !== J.k[j] || rj.fillet !== J.fillet[j]) return false;
        const listed = new Set();
        reg.members.forEach((mb, m) => { if (Math.floor(rj.mask / 2 ** m) % 2) listed.add(mb.row); });
        if (listed.size !== mine.length || !mine.every((r) => listed.has(r))) return false;
        if (J.trunk[j] >= 0 && graph.rows[J.trunk[j]].on && (reg.members[rj.trunk]?.row !== J.trunk[j] || rj.fork !== (J.fork[j] === 1))) return false;
        return true;
      });
      assert.ok(found, `cell ${tx}: join ${j} (members ${mine.join(',')}, trunk ${J.trunk[j]}) is not listed with its numbers and members`);
      for (const mb of reg.members) if (mine.includes(mb.row)) assert.ok(mb.flags & M_JOINED, `cell ${tx}: member ${mb.row} of join ${j} lacks M_JOINED`);
    }
  }
  assert.ok(cellsChecked > 100);
  t.diagnostic(`${name}: ${cellsChecked} join cells checked; ${over} have more than MAX_JOINS (${MAX_JOINS}) joins reaching them (stats.overJoins ${out.stats.overJoins}, most in one ${out.stats.maxJoins})`);
}
export function check4(v, t, name, opts) {
  const { graph, out } = v;
  let withBit = 0;
  for (let cy = 0; cy < out.ny; cy++) for (let cx = 0; cx < out.nx; cx++) {
    const tx = cy * GRID_W + cx;
    if (kindAt(out, tx) !== CELL_REGION) continue;
    const reg = regionOf(out, out.cells[tx * 4 + 1]);
    let differs = false;
    for (const rj of reg.joins) {
      let tier = -1;
      reg.members.forEach((mb, m) => { if (!(Math.floor(rj.mask / 2 ** m) % 2)) return; const tr = graph.rows[mb.row].tier; if (tier >= 0 && tr !== tier) differs = true; tier = tr; });
    }
    assert.equal(!!(reg.kind & K_CROSSTIER), differs, `cell ${cx},${cy}: tiers ${differs ? 'differ' : 'agree'} and K_CROSSTIER is ${reg.kind & K_CROSSTIER ? 'set' : 'clear'}`);
    if (differs) withBit++;
  }
  assert.ok(opts?.allowNone || withBit > 0, 'no cell with joined vessels of different tiers: the figure has no tiers to judge');
  t.diagnostic(`${name}: ${withBit} cross-tier regions`);
}
export function check5(v, t, name) {
  const { out } = v;
  assert.equal(out.stats.overMembers, 0, `${out.stats.overMembers} cells hold more than ${MAX_MEMBERS} vessels (a stop point); the largest holds ${out.stats.maxMembers}`);
  for (let s = 0; s < out.nRegions; s++) {
    const reg = regionOf(out, s);
    assert.ok(reg.members.length <= MAX_MEMBERS && reg.joins.length <= MAX_JOINS);
  }
  t.diagnostic(`${name}: largest region ${out.stats.maxMembers} vessels (limit ${MAX_MEMBERS}), most joins reaching one cell ${out.stats.maxJoins}`);
}
export function check6(v, t, name) {
  const { out } = v;
  let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let pixels = 0, edge = 0;
  for (let k = 0; k < 300; k++) {
    const sc = 0.25 + rnd() * rnd() * 7, th = rnd() * Math.PI * 2, cos = Math.cos(th), sin = Math.sin(th);
    const gx = out.x0 + rnd() * out.nx * out.cs, gy = out.y0 + rnd() * out.ny * out.cs;   // the world point that lands near the middle of a 1200 × 800 view
    const tx = 600 - sc * (cos * gx - sin * gy), ty = 400 - sc * (sin * gx + cos * gy);
    const inv = Float32Array.of(cos / sc, -sin / sc, sin / sc, cos / sc, -(cos * tx + sin * ty) / sc, -(-sin * tx + cos * ty) / sc);
    for (let q = 0; q < 200; q++) {
      const fx = Math.floor(rnd() * 1200) + 0.5, fy = Math.floor(rnd() * 800) + 0.5;
      const wx = inv[0] * fx + inv[2] * fy + inv[4], wy = inv[1] * fx + inv[3] * fy + inv[5];   // (float64: the truth)
      const t = cellOfPixel(out, inv, fx, fy);
      pixels++;
      const ux = (wx - out.x0) / out.cs, uy = (wy - out.y0) / out.cs, cx = Math.floor(ux), cy = Math.floor(uy);
      const nearEdge = Math.min(ux - cx, cx + 1 - ux, uy - cy, cy + 1 - uy) * out.cs < 5e-3;
      if (t < 0) { assert.ok(nearEdge || cx < 0 || cy < 0 || cx >= out.nx || cy >= out.ny, 'a pixel inside the grid has no cell'); continue; }
      const tcx = t % GRID_W, tcy = (t / GRID_W) | 0;
      if (!nearEdge) assert.equal(t, cy * GRID_W + cx, `pixel (${fx}, ${fy}): the rule says cell ${tcx},${tcy}, the truth is ${cx},${cy}`);
      else edge++;
      // the owner's quad (its cell widened by REGION_QUAD_PAD_PX device pixels) covers the pixel; and no other cell's formula names the pixel
      const pad = REGION_QUAD_PAD_PX / sc, x0 = out.x0 + tcx * out.cs, y0 = out.y0 + tcy * out.cs;
      assert.ok(wx >= x0 - pad && wx <= x0 + out.cs + pad && wy >= y0 - pad && wy <= y0 + out.cs + pad, `pixel (${fx}, ${fy}) is outside its own cell's widened quad`);
      let owners = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ox = tcx + dx, oy = tcy + dy;
        if (ox < 0 || oy < 0 || ox >= out.nx || oy >= out.ny) continue;
        if (cellOfPixel(out, inv, fx, fy) === oy * GRID_W + ox) owners++;
      }
      assert.equal(owners, 1);
    }
  }
  assert.ok(pixels > 50000 && edge < pixels / 50);
}
