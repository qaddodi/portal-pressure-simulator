// The vector renderer's workload, measured in node (docs/recommendations/vector-renderer-plan-r1.md section 4; workstream L).
//
//   node scripts/vec-workload.mjs                       every benchmark at the iPhone's and the Mac's picture sizes, old structure (and new, once
//                                                       K's leaves are in), written to docs/vector-workload.json and printed
//   node scripts/vec-workload.mjs --bench anat-deep --pic mac --stride 8
//   node scripts/vec-workload.mjs --scene anatomy|lobule   (one scene per process: the anatomy and the lobule boot different DOMs)
//
// For each named benchmark (src/ui/vec-bench.js: the same cameras the app's ?vecbench uses) it boots the real anatomy (tests/vec-anatomy.js) or
// the real lobule (the recipe of tests/vec-lobule.test.js), compiles it, and replays the fragment's steps in JS at every STRIDE-th device pixel
// centre (tests/vec-replay.js): projected pixels by class and by strip; bound tests, segment tests, surviving candidates (mean, p95, max) and
// active joins per pixel. "old" is the fixed 16-unit classification at ef44ef0 (scripts/vec-old/, its member loop replayed as it is: 48 members,
// whole intervals); "new" is A's runs and K's leaves. Cell percentages are not reported: the work is.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1]; };
const only = opt('scene', null);

const ANATOMY = ['anat-fit', 'anat-deep', 'pinch', 'blood-only'], LOBULE = ['cv-junction', 'lobule-tissue'];

if (!only) {
  // One process a scene (the two boots install different globals); then one merged report.
  const outDir = opt('out', path.join(ROOT, 'docs'));
  const parts = [];
  for (const scene of ['anatomy', 'lobule']) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--scene', scene, '--json', '-'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });
    if (r.status !== 0) { console.error(`vec-workload: the ${scene} run failed (exit ${r.status})`); process.exit(r.status || 1); }
    parts.push(JSON.parse(r.stdout));
  }
  const all = { when: new Date().toISOString(), results: parts.flatMap((p) => p.results), notes: [...new Set(parts.flatMap((p) => p.notes))], sweep: parts.flatMap((p) => p.sweep ?? []), easing: parts.flatMap((p) => p.easing ?? []) };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'vector-workload.json'), JSON.stringify(all));
  const { reportText } = await import('./vec-workload-report.mjs');
  console.log(reportText(all));
  process.exit(0);
}

// ─────────────────────────── one scene ───────────────────────────
let stride = +opt('stride', 4) || 4;
const mainStride = stride;
const wantBench = opt('bench', null) ? String(opt('bench')).split(',') : null;
const wantPic = opt('pic', null) ? String(opt('pic')).split(',') : null;
const quiet = opt('json', null) === '-';
const log = (...a) => { if (quiet) console.error(...a); else console.log(...a); };

const R = new URL('../src/ui/', import.meta.url).href;
const T = new URL('../tests/', import.meta.url).href;
const OLDD = new URL('./vec-old/', import.meta.url).href;

let figure = null, lobuleBins = null, A = null, anatomyTaps = null;
if (only === 'anatomy') {
  const mod = await import(`${T}vec-anatomy.js`);
  anatomyTaps = mod.taps;
  A = await mod.bootAnatomy();
  await A.preset('cirr-decomp', 40);
  figure = A.figure();
} else {
  const page = (await import(new URL('./warm/dom.mjs', import.meta.url).href)).installPage();
  lobuleBins = (W, H) => bootLobuleBins(page, W, H, true);
}

const { PICTURES, PICTURE_NAMES, BENCHMARKS, benchMatrix, deviceSize, worldAt, pxOf } = await import(`${R}vec-bench.js`);
const REP = await import(`${T}vec-replay.js`);
const { N_SAMPLES } = await import(`${R}veins-mesh.js`);

async function bootLobuleBins(page, W, H, lymph) {
  const win = page.dom.window;
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' ? BOX : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  for (const [k, v] of [['clientWidth', W], ['clientHeight', H], ['offsetWidth', W], ['offsetHeight', H]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true, writable: true });
  const { createCore } = await import(new URL('../src/worker-core.js', import.meta.url).href);
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 200 && !frames.length; i++) await new Promise((r) => setTimeout(r, 50));
  core.handle({ type: 'run', running: false });
  const { createVeinsGL, binVeins } = await import(`${R}veins-gl.js`);
  const { createLobuleZoom } = await import(`${R}lobule-zoom.js`);
  const { store } = await import(`${R}store.js`);
  store.set({ lobuleLayers: { ...store.get().lobuleLayers, lymph } });
  const wrap = page.document.getElementById('stageView');
  const cv = page.document.createElement('canvas'); cv.width = W; cv.height = H; wrap.append(cv);
  const veins = createVeinsGL(cv, { tubes: 220, force: true, who: 'stage' });
  let got = null;
  const lz = createLobuleZoom({ host: wrap, binAway: (tubes, joins) => { got = { tubes, joins }; return binVeins(tubes, joins); }, figure: () => veins.top });
  lz.update(frames.at(-1));
  const q = lz.preparePieces();
  for (let i = 0; i < 80 && !got; i++) { if (!lz.prepareRun(q)) break; await new Promise((r) => setImmediate(r)); }
  wrap.removeChild(cv);
  return got;
}

// ── The old structure: the frozen compiler on the figure's binning ──
async function oldStructure(bins, nTubes, tubeNow, radAll) {
  const { createVecCompiler } = await import(`${OLDD}vec-compile.mjs`);
  const comp = createVecCompiler();
  const view = comp.build(bins, nTubes, { tubeNow, radAll });
  return { comp, view, tables: REP.oldTables(comp.graph, view) };
}
async function anatomyOld() {
  const f = figure, NS = N_SAMPLES;
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  return oldStructure(f.bins, f.nTubes, f.tube, radAll);
}
async function lobuleOld(pic) {
  const { binVeins } = await import(`${R}veins-bin.js`);
  const { tubes, joins } = await lobuleBins(pic.w, pic.h);
  const n = tubes.length, bins = binVeins(tubes, joins), NS = N_SAMPLES;
  const radAll = new Float32Array(n * NS * 4), tubeNow = new Float32Array(n * 52);
  for (const t of tubes) {
    const wall = 1, r = Math.max(0.5, (t.reach - 10 - wall) / 1.6);
    for (let i = 0; i < NS; i++) radAll[(t.id * NS + i) * 4] = r;
    tubeNow[t.id * 52 + 3] = wall; tubeNow[t.id * 52 + 7] = 1; tubeNow[t.id * 52 + 8] = 1;
  }
  return { ...(await oldStructure(bins, n, tubeNow, radAll)), tubes, joins };
}

// ── The replay over a picture ──
const cnt = REP.newCounts();
function replayPicture(replay, tables, m, pic, { blood = false, names, scale = stride * stride }) {
  const [W, H] = deviceSize(pic), px = pxOf(m), wp = [0, 0];
  const byClass = new Map(), all = REP.newTally(), strips = new Map();
  let work = 0, cost = 0, boundSum = 0, segSum = 0, joinSum = 0, nonEmpty = 0;
  for (let y = stride >> 1; y < H; y += stride) {
    for (let x = stride >> 1; x < W; x += stride) {
      worldAt(m, H, x + 0.5, y + 0.5, wp);
      replay(tables, wp[0], wp[1], px, cnt);
      if (cnt.cls === 0) continue;
      // The BLOOD pass (V_BLOOD): the lumen strip covers the lumen and 2 px past it; a region or leaf quad covers its whole square.
      const isStrip = names[cnt.cls] === 'strip' || names[cnt.cls] === 'L_SINGLE';
      if (blood && isStrip && !(cnt.lumenD <= 2 * px)) continue;
      nonEmpty++;
      const name = names[cnt.cls] ?? `class ${cnt.cls}`;
      let t = byClass.get(name);
      if (!t) byClass.set(name, t = REP.newTally());
      REP.addCounts(t, cnt); REP.addCounts(all, cnt);
      work += cnt.work; cost += cnt.cost; boundSum += cnt.bound; segSum += cnt.seg; joinSum += cnt.joinTests + cnt.joinIters;
      if (isStrip && cnt.row >= 0) strips.set(cnt.row, (strips.get(cnt.row) || 0) + 1);
    }
  }
  const classes = {};
  for (const [name, t] of [...byClass].sort((a, b) => b[1].px - a[1].px)) classes[name] = REP.tallyRow(t, scale);
  const topStrips = [...strips].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([row, n]) => ({ row, px: n * scale }));
  return {
    size: [W, H], stride, projectedPx: nonEmpty * scale, classes, all: REP.tallyRow(all, scale), strips: { rows: strips.size, px: [...strips.values()].reduce((a, b) => a + b, 0) * scale, top: topStrips },
    totals: { work: work * scale, cost: cost * scale, bound: boundSum * scale, seg: segSum * scale, junction: joinSum * scale },
  };
}

// Instances the draw would make: strips drawn (rows with an ordinary cell in view) and quads (region cells in view); the cells in the picture, counted from the grid.
function oldInstances(T, m, pic) {
  const [W, H] = deviceSize(pic), px = pxOf(m), wp0 = worldAt(m, H, 0, 0), wp1 = worldAt(m, H, W, H);
  const x0 = Math.min(wp0[0], wp1[0]), x1 = Math.max(wp0[0], wp1[0]), y0 = Math.min(wp0[1], wp1[1]), y1 = Math.max(wp0[1], wp1[1]);
  const GW = 256, rows = new Set();
  let regions = 0, simple = 0;
  const c0x = Math.max(0, Math.floor((x0 - T.gridO[0]) / T.cs)), c1x = Math.min(T.gridN[0] - 1, Math.floor((x1 - T.gridO[0]) / T.cs));
  const c0y = Math.max(0, Math.floor((y0 - T.gridO[1]) / T.cs)), c1y = Math.min(T.gridN[1] - 1, Math.floor((y1 - T.gridO[1]) / T.cs));
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const t = (cy * GW + cx) * 4, k = T.cells[t];
    if (k === 1) { simple++; rows.add(T.cells[t + 1]); } else if (k === 2) regions++;
  }
  void px;
  return { stripRows: rows.size, simpleCells: simple, regionCells: regions };
}

const OLD_NAMES = REP.CLASS_NAMES, NEW_NAMES = REP.NEW_CLASS_NAMES;
const REACH_U = REP.REPLAY_LOOK.reachU;

// ── The new structure: A's runs on the same graph, K's leaves over them, packed as the renderer uploads them ──
const policyOf = (o = {}) => ({ ...K.defaultPolicy(), ...o });
async function newStructure(graph, { headroom, policy = {} } = {}) {
  const { createRuns } = await import(`${R}vec-runs.js`);
  const C = await import(`${R}vec-contract.js`);
  const runs = createRuns(graph, { shOff: [...REP.REPLAY_LOOK.shOff], aa: C.REACH_AA, headroom: headroom ?? C.BOUND_HEADROOM });
  runs.build();
  const rd = {}, jd = {};
  runs.packRuns(rd); runs.packJoins(jd);
  const set = K.createLeafSet(), pol = policyOf(policy);
  const t0 = performance.now();
  K.buildLeaves(runs, graph.joins, null, pol, set);
  const ms = performance.now() - t0;
  const tables = REP.newTables(set.tables, rd.data, jd.data, graph, { shOff: REP.REPLAY_LOOK.shOff, reachU: REACH_U }, runs.headroom);
  const rep = set.report;
  return { runs, set, tables, buildMs: +ms.toFixed(1), policy: pol, report: { cells: rep.cells, leaves: rep.leaves, nodes: rep.nodes, byClass: rep.byClass, depth: rep.depth, runRefs: rep.runRefs, joinRefs: rep.joinRefs, wide: rep.wide.length, overWide: rep.overWide.map((e) => ({ x: e.x, y: e.y, size: e.size, rows: e.rows })), falseProximity: rep.falseProximity.length } };
}

// Leaf quads and strips in the picture (the draw's instances): every non-SINGLE leaf whose square meets the view is a quad; SINGLE leaves are the strips'.
function newInstances(T, m, pic) {
  const [W, H] = deviceSize(pic), a = worldAt(m, H, 0, 0), b = worldAt(m, H, W, H);
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const rows = new Set(), byClass = {};
  let quads = 0, singles = 0;
  for (let l = 0; l < T.nLeaves; l++) {
    const bx = T.leafBox[l * 4], by = T.leafBox[l * 4 + 1], sz = T.leafBox[l * 4 + 2];
    if (bx > x1 || by > y1 || bx + sz < x0 || by + sz < y0) continue;
    const c = T.leaves[l * 8] & 255;
    byClass[NEW_NAMES[c]] = (byClass[NEW_NAMES[c]] || 0) + 1;
    if (c === 1) { singles++; rows.add(T.leaves[l * 8 + 7]); } else quads++;
  }
  return { stripRows: rows.size, singleLeaves: singles, leafQuads: quads, inView: singles + quads, byClass };
}

const results = [], notes = [];
const benches = (only === 'anatomy' ? ANATOMY : LOBULE).filter((b) => !wantBench || wantBench.includes(b));
let K = null;
try { K = await import(`${R}vec-leaves.js`); } catch (e) { if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
if (!K) notes.push('new structure: src/ui/vec-leaves.js is not in the tree; the "new" column and the policy sweep are not measured.');
const sweep = opt('sweep', false), sweepStride = +opt('sweep-stride', 8) || 8;
const chosenArg = opt('policy', null);   // --policy headroom,leafMinPx,leafOverhead,refineGain: the values the main "new" column is built with (default: the contract's)
const chosen = chosenArg ? (([h, m, o, g]) => ({ headroom: h, policy: { leafMinPx: m, leafOverhead: o, refineGain: g } }))(String(chosenArg).split(',').map(Number)) : {};
const combo = opt('combo', null);   // --combo headroom,leafMinPx,leafOverhead,refineGain: measured as one more configuration

/** Replays one benchmark at one picture under a structure and returns the per-instant frames. */
function measure(name, pic, structure, tables, names, replay) {
  const b = BENCHMARKS[name], frames = [];
  for (const t of b.samples ?? [0]) {
    const m = benchMatrix(name, t, pic);
    const rep = replayPicture(replay, tables, m, pic, { blood: b.frame === 'BLOOD', names });
    rep.t = t; rep.instances = structure === 'old' ? oldInstances(tables, m, pic) : newInstances(tables, m, pic);
    frames.push(rep);
  }
  return frames;
}
const avg = (frames, f) => frames.reduce((a, x) => a + f(x), 0) / frames.length;
const objective = (frames, leafCost) => avg(frames, (f) => f.totals.cost + (f.instances.inView ?? 0) * leafCost);

const GRIDS = { headroom: [1.0, 1.05, 1.1, 1.2, 1.35], leafMinPx: [2, 4, 8, 16, 32], leafOverhead: [16, 64, 256, 1024], refineGain: [0.05, 0.2, 0.4] };
const LEAF_QUAD_COST = 64;   // the fixed cost of one leaf quad in the objective, in the cost model's units (K's default leafOverhead; a device timer is what would settle it)
const sweepRows = [];
let oldAnat = null, newAnat = null;
const graphOf = async (bins, nTubes, tubeNow, radAll) => {
  const { createVecGraph } = await import(`${R}vec-graph.js`);
  const g = createVecGraph(); g.fromBins(bins, nTubes); g.attrs(tubeNow); g.radii(radAll);
  return g;
};
for (const name of benches) {
  for (const picName of PICTURE_NAMES) {
    if (wantPic && !wantPic.includes(picName)) continue;
    const pic = PICTURES[picName];
    let O, graphNew;
    if (only === 'anatomy') {
      O = oldAnat ??= await anatomyOld();
      graphNew = K ? (newAnat ??= { graph: await graphOf(figure.bins, figure.nTubes, figure.tube, (() => { const r = new Float32Array(figure.nTubes * N_SAMPLES * 4); for (let i = 0; i < figure.nTubes * N_SAMPLES; i++) r[i * 4] = figure.rad[i]; return r; })()) }).graph : null;
    } else {
      O = await lobuleOld(pic);
      if (K) {
        const { binVeins } = await import(`${R}veins-bin.js`);
        const n = O.tubes.length, bins = binVeins(O.tubes, O.joins), NS = N_SAMPLES;
        const radAll = new Float32Array(n * NS * 4), tubeNow = new Float32Array(n * 52);
        for (const t of O.tubes) { const wall = 1, r = Math.max(0.5, (t.reach - 10 - wall) / 1.6); for (let i = 0; i < NS; i++) radAll[(t.id * NS + i) * 4] = r; tubeNow[t.id * 52 + 3] = wall; tubeNow[t.id * 52 + 7] = 1; tubeNow[t.id * 52 + 8] = 1; }
        graphNew = await graphOf(bins, n, tubeNow, radAll);
      }
    }
    const oldFrames = measure(name, pic, 'old', O.tables, OLD_NAMES, (T, x, y, p, o) => REP.replayOld(T, x, y, p, o));
    results.push({ bench: name, picture: picName, structure: 'old', frame: BENCHMARKS[name].frame, frames: oldFrames, compile: O.view.stats ?? null });
    log(`old  ${name.padEnd(13)} ${picName.padEnd(6)}: ${Math.round(avg(oldFrames, (f) => f.projectedPx))} px, work ${Math.round(avg(oldFrames, (f) => f.totals.work))}, cost ${Math.round(avg(oldFrames, (f) => f.totals.cost))}`);
    if (K) {
      const N = await newStructure(graphNew, chosen);
      const newFrames = measure(name, pic, 'new', N.tables, NEW_NAMES, (T, x, y, p, o) => REP.replayPixel(T, x, y, p, o));
      results.push({ bench: name, picture: picName, structure: 'new', frame: BENCHMARKS[name].frame, frames: newFrames, build: { ms: N.buildMs, headroom: N.runs.headroom, chosenPolicy: chosenArg || 'contract defaults', policy: pick(N.policy), report: N.report } });
      log(`new  ${name.padEnd(13)} ${picName.padEnd(6)}: ${Math.round(avg(newFrames, (f) => f.projectedPx))} px, work ${Math.round(avg(newFrames, (f) => f.totals.work))}, cost ${Math.round(avg(newFrames, (f) => f.totals.cost))}, ${N.report.leaves} leaves`);
    }
    if (sweep && K) await runSweep(name, picName, pic, graphNew);
  }
}
function pick(p) { return { headroom: undefined, leafMinPx: p.leafMinPx, leafOverhead: p.leafOverhead, refineGain: p.refineGain, fitScale: p.fitScale, wBound: p.wBound, wSeg: p.wSeg, wJoin: p.wJoin }; }

// ── The policy sweep: BOUND_HEADROOM, LEAF_MIN_PX, LEAF_OVERHEAD, REFINE_GAIN over a small grid each ──
async function runSweep(name, picName, pic, graph) {
  const cfgs = [];
  const base = { headroom: 1.1, leafMinPx: 8, leafOverhead: 64, refineGain: 0.2 };
  cfgs.push({ ...base });
  for (const [k, vals] of Object.entries(GRIDS)) for (const v of vals) if (v !== base[k]) cfgs.push({ ...base, [k]: v });
  if (combo) { const [h, m, o, g] = String(combo).split(',').map(Number); cfgs.push({ headroom: h, leafMinPx: m, leafOverhead: o, refineGain: g, combo: true }); }
  stride = sweepStride;
  for (const c of cfgs) {
    const N = await newStructure(graph, { headroom: c.headroom, policy: { leafMinPx: c.leafMinPx, leafOverhead: c.leafOverhead, refineGain: c.refineGain } });
    const frames = measure(name, pic, 'new', N.tables, NEW_NAMES, (T, x, y, p, o) => REP.replayPixel(T, x, y, p, o));
    sweepRows.push({ bench: name, picture: picName, stride: sweepStride, ...c, leaves: N.report.leaves, wide: N.report.wide, buildMs: N.buildMs, cost: Math.round(avg(frames, (f) => f.totals.cost)), work: Math.round(avg(frames, (f) => f.totals.work)), inView: Math.round(avg(frames, (f) => f.instances.inView)), objective: Math.round(objective(frames, LEAF_QUAD_COST)) });
    log(`sweep ${name} ${picName} ${JSON.stringify(c)}: objective ${sweepRows.at(-1).objective}, ${N.report.leaves} leaves`);
  }
  stride = mainStride;
}

// ── Width easings: how many rows each headroom rebuilds across the deck's preset changes (a lower headroom makes tighter leaves and more rebuilds) ──
const easing = [];
if (K && A && opt('easing', false)) {
  const { createVecGraph } = await import(`${R}vec-graph.js`);
  const { createRuns } = await import(`${R}vec-runs.js`);
  await A.preset('healthy', 30);
  const f0 = A.figure(), NS = N_SAMPLES;
  const tap = () => anatomyTaps.find((x) => x.who === 'stage');
  tap().radLog = [];
  for (const id of ['cirr-decomp', 'budd-chiari', 'cirr-comp', 'healthy']) await A.preset(id, 45);
  const log = tap().radLog; tap().radLog = null;
  for (const h of GRIDS.headroom) {
    const g = createVecGraph();
    g.fromBins(f0.bins, f0.nTubes); g.attrs(f0.tube);
    const radAll = new Float32Array(f0.nTubes * NS * 4);
    for (let i = 0; i < f0.nTubes * NS; i++) radAll[i * 4] = f0.rad[i];
    g.radii(radAll);
    const runs = createRuns(g, { shOff: [...REP.REPLAY_LOOK.shOff], aa: 1, headroom: h }).build();
    const list = new Int32Array(g.nRows * 2);
    let rowsRebuilt = 0, events = 0;
    for (const { row, r } of log) {
      for (let i = 0; i < NS; i++) radAll[(row * NS + i) * 4] = r[i];
      g.radii(radAll);
      // (Only the rows whose radius went past their run's bound count: pastRows also flags rows that are on with no run in the binning, every call, which is no width easing.)
      let n = 0;
      for (let q = 0; q < runs.views[row].length && !n; q++) {
        const id = runs.views[row][q], i0 = runs.seg[id * 2], i1 = Math.min(N_SAMPLES - 1, runs.seg[id * 2 + 1] + 1);
        for (let i = i0; i <= i1; i++) if (g.rad[row * N_SAMPLES + i] > runs.radB[id] + 1e-4) { n = 1; break; }
      }
      if (n) { events++; rowsRebuilt++; list[0] = row; runs.rebuildRows(list, 1); }
    }
    easing.push({ headroom: h, steps: log.length, rebuildEvents: events, rowsRebuilt });
    log2(`easing headroom ${h}: ${events} rebuild events in ${log.length} row steps, ${rowsRebuilt} rows rebuilt`);
  }
}
function log2(...a) { console.error(...a); }

if (quiet) process.stdout.write(JSON.stringify({ results, notes, sweep: sweepRows, easing }));
else console.log(`${results.length} measurements`, notes.join('\n'));
