// The lobule's real data against the Tube renderer's buffers and caps (docs/recommendations/tube-renderer-lobule-plan.md, brief L-E).
// Node only: the real lobule layer is booted in jsdom with the GL stub (scripts/warm/dom.mjs), it bins its tubes and joins as it does for
// the renderer, and this prints what thread L-D must fit: rows, joins, patch groups, their overlaps, how much of the vessel length lies inside a
// join's reach, the sharpest joint, the largest radius, the `z` values and their smallest gap.
//
//   node scripts/lobule-joins.mjs [--lymph] [--json]
//
// Where the numbers come from:
//  - rows, joins: what the lobule hands `binVeins` (its `binAway` hook: the tubes `{ id, pts, reach }` and the joins), then the Mesh's own
//    `binVeins`, `joinEntryList` and `patchGroups` run on that binning, as the renderer does.
//  - `z`, tier: what the lobule passes to `setTubes` (float 9 and float 8 of each row's 52). `setTubes` is one `texSubImage2D` of that
//    array, so this wraps the stub context's `texSubImage2D` (the width 13 x MAXT upload) and keeps the last array sent.
//  - radii: the lobule gives the renderer each row's radii at its 64 samples (`setRadii`, sent by `flushRadii` as a 64 x rows RGBA upload, and
//    each row's largest as a 1 x rows RED upload); both uploads are kept the same way, so the largest radius is the real one, not the `reach`.
import { fileURLToPath } from 'node:url';
import { N_SAMPLES, MITRE_LIMIT } from '../src/ui/veins-mesh.js';
import { PG_M, PG_J, PG_W, TUBE_FLOATS, joinEntryList, patchGroups } from '../src/ui/veins-mesh-data.js';
import { tubeIndex, tubeVertex, TUBE_LEVEL } from '../src/ui/tube-geo.js';

export const MAXT = 320;                                  // the lobule's GPU rows (lobule-zoom.js MAXT)
const TUBE_TEXELS = TUBE_FLOATS / 4;                      // 13 (veins-gl TUBE_TEXELS)
export const MITRE_DEG = (2 * Math.acos(1 / MITRE_LIMIT) * 180) / Math.PI;   // the turn the Tube's mitre still joins (120)
export const Z_GAP_MIN = 0.009;                           // the smallest gap between two kinds' z that hK = 0.008 can leave in order
const ROOT = new URL('../', import.meta.url).pathname;

/** Boots the real lobule (jsdom, GL stub), lets it bin and send its attributes, and returns what it handed the renderer. Call once a process. */
export async function captureLobule({ lymph = false, W = 1440, H = 900 } = {}) {
  const page = (await import(ROOT + 'scripts/warm/dom.mjs')).installPage();
  const win = page.dom.window;
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' ? BOX : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  for (const [k, v] of [['clientWidth', W], ['clientHeight', H], ['offsetWidth', W], ['offsetHeight', H]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true, writable: true });
  // The renderer's uploads, kept as the GPU would hold them: the tube rows (13 texels x MAXT), each row's radii (64 samples), each row's largest radius.
  const up = { tube: null, rad: new Float32Array(MAXT * N_SAMPLES * 4), rmax: new Float32Array(MAXT), tubeSends: 0 };
  const proto = win.HTMLCanvasElement.prototype, getContext = proto.getContext;
  proto.getContext = function (type) {
    const gl = getContext.call(this, type);
    if (gl && !gl.__lobuleJoins) {
      gl.__lobuleJoins = true;
      const was = gl.texSubImage2D;
      gl.texSubImage2D = function (...a) {
        const [, , , y, w, h, , , data, off = 0] = a;
        if (data instanceof Float32Array) {
          if (w === TUBE_TEXELS && h === MAXT && data.length === MAXT * TUBE_FLOATS) { up.tube = data.slice(); up.tubeSends++; }                         // setTubes
          else if (w === N_SAMPLES && data.length === MAXT * N_SAMPLES * 4) up.rad.set(data.subarray(off, off + h * N_SAMPLES * 4), y * N_SAMPLES * 4);   // flushRadii: all radii
          else if (w === 1 && data.length === MAXT) up.rmax.set(data.subarray(off, off + h), y);                                                      // flushRadii: the largest of each
        }
        return was.apply(this, a);
      };
    }
    return gl;
  };
  const { createCore } = await import(ROOT + 'src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 200 && !frames.length; i++) await new Promise((r) => setTimeout(r, 50));
  core.handle({ type: 'run', running: false });
  const { createVeinsGL, binVeins } = await import(ROOT + 'src/ui/veins-gl.js');
  const { createLobuleZoom } = await import(ROOT + 'src/ui/lobule-zoom.js');
  const { store } = await import(ROOT + 'src/ui/store.js');
  store.set({ lobuleLayers: { ...store.get().lobuleLayers, lymph } });
  const wrap = page.document.getElementById('stageView');
  const cv = page.document.createElement('canvas'); cv.width = W; cv.height = H; wrap.append(cv);
  const veins = createVeinsGL(cv, { tubes: 220, force: true, who: 'stage' });
  let got = null;
  const lz = createLobuleZoom({ host: wrap, binAway: (tubes, joins) => { got = { tubes, joins }; return binVeins(tubes, joins); }, figure: () => veins.top });
  lz.update(frames.at(-1));
  const q = lz.preparePieces();
  for (let i = 0; i < 80 && !got; i++) { if (!lz.prepareRun(q)) break; await new Promise((r) => setImmediate(r)); }
  if (!got) throw new Error('lobule-joins: the lobule never binned');
  lz.stage();   // draws the layer once, unseen: this is what sends the attributes and radii to the renderer
  if (!up.tube) throw new Error('lobule-joins: the lobule sent no attributes (no setTubes upload seen)');
  return { tubes: got.tubes, joins: got.joins, bins: binVeins(got.tubes, got.joins), up, lymph };
}

const hist = (xs) => { const h = {}; for (const x of xs) h[x] = (h[x] || 0) + 1; return h; };
const maxOf = (xs) => xs.reduce((m, x) => (x > m ? x : m), -Infinity);

/** Everything the brief asks for, from a capture. Plain data (numbers, small objects, the rows' points and radii for the lumen-level check). */
export function analyse(cap) {
  const { tubes, joins, bins, up } = cap;
  const ids = tubes.map((t) => t.id);
  const rows = tubes.map((t) => {
    const P = new Array(2 * N_SAMPLES), R = new Array(N_SAMPLES);
    for (let i = 0; i < N_SAMPLES; i++) { P[2 * i] = t.pts[i][0]; P[2 * i + 1] = t.pts[i][1]; R[i] = up.rad[(t.id * N_SAMPLES + i) * 4]; }
    return { id: t.id, z: up.tube[t.id * TUBE_FLOATS + 9], tier: up.tube[t.id * TUBE_FLOATS + 8], rmax: up.rmax[t.id], P, R };
  });
  // the Mesh's own grouping of the joins
  const list = joinEntryList(bins.cells, bins.nCells, {});
  const jl = list.list ? Array.from(list.list.subarray ? list.list.subarray(0, list.n) : list.list) : list;
  const pg = patchGroups(bins.ent, jl, {});
  const nJoins = pg.j.length / 8, boxes = [], perGroup = [];
  for (let g = 0; g < pg.count; g++) {
    const o = g * PG_W, members = new Set();
    for (let k = 0; k < PG_M; k++) if (pg.data[o + 4 + k] > -0.5) members.add(Math.floor(pg.data[o + 4 + k] + 0.5));
    perGroup.push({ vessels: members.size, joins: pg.data[o + 13] });
    boxes.push([pg.data[o], pg.data[o + 1], pg.data[o + 2], members]);
  }
  let overlap = 0, overlapShare = 0;
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    if (Math.abs(A[0] - B[0]) < A[2] + B[2] && Math.abs(A[1] - B[1]) < A[2] + B[2]) {
      overlap++;
      for (const r of A[3]) if (B[3].has(r)) { overlapShare++; break; }
    }
  }
  const joinKeys = new Set();
  for (let i = 0; i < nJoins; i++) joinKeys.add(Array.from(pg.j.subarray(i * 8, i * 8 + 8)).join(','));
  const joinsInGroups = perGroup.reduce((s, g) => s + g.joins, 0);
  // the share of vessel length inside a join's reach (a segment's midpoint within the join's reach circle)
  let len = 0, lenIn = 0;
  for (const t of tubes) for (let i = 0; i < t.pts.length - 1; i++) {
    const [ax, ay] = t.pts[i], [bx, by] = t.pts[i + 1], L = Math.hypot(bx - ax, by - ay), mx = (ax + bx) / 2, my = (ay + by) / 2;
    let hit = false;
    for (let j = 0; j < nJoins; j++) if (Math.hypot(mx - pg.j[j * 8], my - pg.j[j * 8 + 1]) <= pg.j[j * 8 + 2]) { hit = true; break; }
    len += L; if (hit) lenIn += L;
  }
  // the sharpest joint: the turn between two successive segments, and the row and sample it is at
  let sharp = { deg: 0, row: -1, at: -1 };
  for (const t of tubes) for (let i = 1; i < t.pts.length - 1; i++) {
    const a = t.pts[i - 1], b = t.pts[i], c = t.pts[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lu / lv))) * 180) / Math.PI;
    if (deg > sharp.deg) sharp = { deg, row: t.id, at: i };
  }
  // radius: the real radii the lobule gave the renderer (each row's largest); the reach as the binning has it, for comparison
  const radii = rows.map((r) => r.rmax), reaches = tubes.map((t) => t.reach);
  const rMaxRow = rows.reduce((m, r) => (r.rmax > m.rmax ? r : m), rows[0]);
  // the distinct z values (float 9), as float32 sent, and the smallest gap between two
  const zs = [...new Set(rows.map((r) => r.z))].sort((a, b) => a - b);
  let zGap = { gap: Infinity, lo: null, hi: null };
  for (let i = 1; i < zs.length; i++) if (zs[i] - zs[i - 1] < zGap.gap) zGap = { gap: zs[i] - zs[i - 1], lo: zs[i - 1], hi: zs[i] };
  const idx = tubeIndex(MAXT);
  return {
    lymph: cap.lymph, rows: rows.length, maxId: maxOf(ids), joinsHanded: joins.length, joinsUnique: nJoins, groups: pg.count,
    tierHist: hist(rows.map((r) => r.tier)), minTier: Math.min(...rows.map((r) => r.tier)), maxTier: maxOf(rows.map((r) => r.tier)),
    vesselsPerGroup: hist(perGroup.map((g) => g.vessels)), joinsPerGroup: hist(perGroup.map((g) => g.joins)),
    maxVesselsPerGroup: maxOf(perGroup.map((g) => g.vessels)), maxJoinsPerGroup: maxOf(perGroup.map((g) => g.joins)),
    joinsInGroups, distinctJoinsInGroups: joinKeys.size, overlapPairs: overlap, overlapShare,
    lengthInJoinReach: len ? lenIn / len : 0, sharpest: sharp,
    radius: { max: maxOf(radii), row: rMaxRow.id, min: Math.min(...radii), reachMax: maxOf(reaches), source: 'setRadii uploads (each row\'s largest)' },
    zValues: zs, zGap, tubeSends: up.tubeSends,
    index: { isUint16: idx.index instanceof Uint16Array, nIndex: idx.nIndex, maxIndex: idx.index.reduce((m, v) => (v > m ? v : m), 0), nVerts: idx.nVerts, rows: idx.rows.length },
    zRows: rows.map((r) => ({ id: r.id, z: r.z, P: r.P, R: r.R })),
    mitreDeg: MITRE_DEG, PG_M, PG_J, MAXT,
  };
}

/** Is `tubeVertex` the one that knows `z`, `zK`, `hK` (thread A, brief L-A)? Today's puts every row's lumen at the same levels whatever they are. */
export function tubeVertexKnowsZ() {
  const P = new Float64Array(128), R = new Float64Array(64).fill(3);
  for (let i = 0; i < 64; i++) P[2 * i] = i * 4;
  const a = [0, 20, 5, 0], at = (z) => tubeVertex(P, R, a, { w: 1, hRef: 3, z, zK: 1, hK: 0.008 })[2];
  return at(0.4) !== at(0.1);
}

/**
 * Each distinct z (a "kind") against every one above it: the lowest lumen level of any row at the higher z, and the highest at the lower z,
 * as `tubeVertex` (or the `vertex` given: a test's stand-in) places the instance's vertices for the lobule's rows (zK = 1, hK = 0.008, hRef = the largest radius). Returns
 * { hRef, levels: [{ z, rows, lo, hi }] ascending in z, bad: [{ lowZ, highZ, hi, lo }] } with `bad` the pairs where the order is not kept.
 */
export function lumenOrder(a, { zK = 1, hK = 0.008, vertex = tubeVertex } = {}) {
  const M = tubeIndex(MAXT), hRef = a.radius.max, byZ = new Map();
  for (const r of a.zRows) {
    const P = Float64Array.from(r.P), R = Float64Array.from(r.R);
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < M.nVerts; v++) {
      const f = vertex(P, R, M.attr.subarray(v * 4, v * 4 + 4), { w: 1, hRef, z: r.z, zK, hK, glow: false })[2];
      if (f < TUBE_LEVEL.LUMEN0 - 1e-9) continue;   // casing, skirt: not a lumen
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
    const k = byZ.get(r.z) || { z: r.z, rows: 0, lo: Infinity, hi: -Infinity };
    k.rows++; k.lo = Math.min(k.lo, lo); k.hi = Math.max(k.hi, hi); byZ.set(r.z, k);
  }
  const levels = [...byZ.values()].sort((x, y) => x.z - y.z), bad = [];
  for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) if (!(levels[j].lo > levels[i].hi)) bad.push({ lowZ: levels[i].z, highZ: levels[j].z, hi: levels[i].hi, lo: levels[j].lo });
  return { hRef, levels, bad };
}

const f4 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : x);
function print(a) {
  const out = [];
  out.push(`Lobule on the Tube's buffers (${a.lymph ? 'with the lymph layer' : 'blood only'})`);
  out.push(`rows ${a.rows} (largest id ${a.maxId}, MAXT ${a.MAXT}); tiers ${JSON.stringify(a.tierHist)}; setTubes uploads seen ${a.tubeSends}`);
  out.push(`joins handed ${a.joinsHanded}, unique in groups ${a.joinsUnique} (${a.joinsInGroups} counted by group, ${a.distinctJoinsInGroups} distinct)`);
  out.push(`patch groups ${a.groups}; vessels per group ${JSON.stringify(a.vesselsPerGroup)} (max ${a.maxVesselsPerGroup} of PG_M ${a.PG_M}); joins per group ${JSON.stringify(a.joinsPerGroup)} (max ${a.maxJoinsPerGroup} of PG_J ${a.PG_J})`);
  out.push(`pairs of groups with overlapping boxes ${a.overlapPairs}, of which share a vessel ${a.overlapShare}`);
  out.push(`vessel length inside a join's reach ${(a.lengthInJoinReach * 100).toFixed(1)}%`);
  out.push(`sharpest joint ${a.sharpest.deg.toFixed(1)} degrees (row ${a.sharpest.row}, sample ${a.sharpest.at}); the mitre joins up to ${a.mitreDeg.toFixed(0)}`);
  out.push(`largest radius ${f4(a.radius.max)} (row ${a.radius.row}; from the ${a.radius.source}); smallest row max ${f4(a.radius.min)}; largest binning reach ${f4(a.radius.reachMax)}`);
  out.push(`distinct z (${a.zValues.length}): ${a.zValues.map(f4).join(' ')}; smallest gap ${f4(a.zGap.gap)} (between ${f4(a.zGap.lo)} and ${f4(a.zGap.hi)}; needs >= ${Z_GAP_MIN})`);
  out.push(`tubeIndex(${a.MAXT}): Uint16Array ${a.index.isUint16}, ${a.index.nIndex} indices, largest ${a.index.maxIndex} of ${a.index.nVerts} vertices`);
  if (tubeVertexKnowsZ()) {
    const o = lumenOrder(a);
    out.push(`lumen levels by z (zK 1, hK 0.008, hRef ${f4(o.hRef)}): ${o.levels.map((k) => `${f4(k.z)}: ${f4(k.lo)}..${f4(k.hi)}`).join('  ')}`);
    out.push(o.bad.length ? `ORDER NOT KEPT for ${o.bad.length} pair(s): ${JSON.stringify(o.bad.slice(0, 5))}` : 'every higher z sits wholly above every lower z');
  } else out.push('lumen levels by z: skipped (tubeVertex has no zK / hK yet: thread A, brief L-A)');
  console.log(out.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cap = await captureLobule({ lymph: process.argv.includes('--lymph') });
  const a = analyse(cap);
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(a) + '\n', () => process.exit(0));   // (exit only once the pipe has taken it all)
  else { print(a); process.exit(0); }
}
