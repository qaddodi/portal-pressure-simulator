// The vector renderer's per-component GPU timers (docs/recommendations/vector-renderer-plan-r1.md section 4; workstream L).
//
// What it measures: the GPU time of each component of a vector frame (the strips, each leaf class's draw, the organs, the overlays, the blood, the
// present and the glass), with EXT_disjoint_timer_query_webgl2 behind two hooks the renderer core (workstream E) calls around each component:
//
//     const M = createVecMeasure(gl);            // once, with the renderer
//     M.frame();                                 // once at the start of a vector frame (optional: it counts frames for the means)
//     M.begin(COMP.strips); …draw…; M.end(COMP.strips);
//     M.poll();                                  // once a frame, after the draws: reads the queries that have finished
//
// Only with `?perf` (gpuProbe.on, set by perf-readout.js). Without it begin, end, frame and poll return at their first line and touch no GL: no query
// is made, nothing is read, the hot path pays one flag test. With it, the queries may split a render pass on some GPUs (a tiler ends the pass at a
// query), so the numbers are a little slower than shipped; the panel says so.
//
// A pool of POOL queries is made once and recycled. Results are read asynchronously: a query that is not ready is left for the next poll (nothing waits),
// and every result read after the browser reports GPU_DISJOINT_EXT is dropped (a disjoint result is not a time). TIME_ELAPSED queries do not nest, so a
// component begun inside another ends the outer one's query and starts its own; when the inner one ends the outer one's query starts again. Each piece
// is added to its own component, so an outer component's time is the sum of its pieces and an inner one is not counted twice.
//
// The ?perf panel's "Vector work" section is `vecWorkText()` (perf-readout.js adds it): the time by component, the leaves by class, the L_WIDE count
// and the last benchmark's report (vec-bench.js).
import { gpuProbe } from './gpu-probe.js';

/** The components, in the order the panel lists them. The leaf classes follow vec-contract.js (L_LAYERED … L_MORPH); L_SINGLE is the strips'. */
export const COMP = Object.freeze({ strips: 0, layered: 1, cross: 2, join: 3, wide: 4, morph: 5, organs: 6, overlays: 7, blood: 8, present: 9, glass: 10 });
export const COMP_NAMES = Object.freeze(['strips', 'L_LAYERED', 'L_CROSS', 'L_JOIN', 'L_WIDE', 'L_MORPH', 'organs', 'overlays', 'blood', 'present', 'glass']);
export const N_COMP = COMP_NAMES.length;
/** The leaf classes the panel counts, by contract value 1 … 6 (index = class − 1). */
export const LEAF_NAMES = Object.freeze(['L_SINGLE', 'L_LAYERED', 'L_CROSS', 'L_JOIN', 'L_WIDE', 'L_MORPH']);
export const POOL = 24;
const MAX_NEST = 8;
const EXT_NAME = 'EXT_disjoint_timer_query_webgl2';

// What the panel reads: the latest measure made, the last leaf counts the renderer reported, the last benchmark's report.
let current = null, lastReport = '';
const leafCounts = new Float64Array(LEAF_NAMES.length);
let leafNote = '';

/**
 * The timers of one renderer. `opts.on`: whether to measure (default: gpuProbe.on, the ?perf flag). A test passes its own.
 * Returns { begin, end, frame, poll, reset, noteLeaves, setReport, text, stats } (see the file's header).
 */
export function createVecMeasure(gl, opts = {}) {
  const on = opts.on || (() => gpuProbe.on);
  let ext, queries = null, free = null, nFree = 0;
  const pendQ = new Int32Array(POOL), pendC = new Int8Array(POOL), pendF = new Int32Array(POOL);
  let pHead = 0, pCount = 0;
  const stack = new Int8Array(MAX_NEST);
  let depth = 0, live = -1, liveC = -1, frameId = 0, polled = 0;
  const total = new Float64Array(N_COMP), calls = new Uint32Array(N_COMP), framesWith = new Uint32Array(N_COMP), seenFrame = new Int32Array(N_COMP).fill(-1);
  const maxMs = new Float32Array(N_COMP), lastMs = new Float32Array(N_COMP);
  const st = { dropped: 0, disjoint: 0, polls: 0, noExt: false, poolFull: 0 };

  function init() {
    if (ext !== undefined) return ext;
    ext = gl.getExtension(EXT_NAME) || null;
    if (!ext) { st.noExt = true; return null; }
    queries = []; free = new Int32Array(POOL);   // alloc-rare: the pool, made once and only while ?perf measures
    for (let i = 0; i < POOL; i++) { queries.push(gl.createQuery()); free[nFree++] = i; }   // alloc-rare: as above
    return ext;
  }
  function start(c) {
    if (nFree === 0) { st.poolFull++; live = -1; liveC = -1; return; }
    const i = free[--nFree];
    gl.beginQuery(ext.TIME_ELAPSED_EXT, queries[i]);
    live = i; liveC = c;
  }
  function stop() {
    if (live < 0) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    const at = (pHead + pCount) % POOL;
    pendQ[at] = live; pendC[at] = liveC; pendF[at] = frameId; pCount++;
    live = -1; liveC = -1;
  }

  return {
    /** A frame begins (for the per-frame means). */
    frame() { if (!on()) return; frameId++; },
    /** The component `c` (a COMP value) begins; nested inside another, it ends that one's query for now. */
    begin(c) {
      if (!on() || !init()) return;
      if (depth >= MAX_NEST) return;
      stop();
      stack[depth++] = c;
      start(c);
    },
    /** The component `c` ends; the one it was inside, if any, goes on being timed. */
    end(c) {
      if (!on() || !ext || depth === 0) return;
      stop();
      depth--;
      void c;
      if (depth > 0) start(stack[depth - 1]);
    },
    /** Reads the queries that have finished (never waits); drops every result read under GPU_DISJOINT_EXT. */
    poll() {
      if (!on() || !ext) return;
      st.polls++;
      let disjoint = null;
      while (pCount > 0) {
        const q = pendQ[pHead];
        if (!gl.getQueryParameter(queries[q], gl.QUERY_RESULT_AVAILABLE)) break;
        if (disjoint === null) disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
        if (disjoint) { st.dropped++; } else {
          const c = pendC[pHead], ms = gl.getQueryParameter(queries[q], gl.QUERY_RESULT) / 1e6;
          total[c] += ms; calls[c]++; lastMs[c] = ms; if (ms > maxMs[c]) maxMs[c] = ms;
          if (seenFrame[c] !== pendF[pHead]) { seenFrame[c] = pendF[pHead]; framesWith[c]++; }
        }
        free[nFree++] = q; pHead = (pHead + 1) % POOL; pCount--;
      }
      if (disjoint) st.disjoint++;
      polled++;
    },
    /** Forgets what was summed (a benchmark starts clean). The queries in flight finish into the new sums. */
    reset() { total.fill(0); calls.fill(0); framesWith.fill(0); seenFrame.fill(-1); maxMs.fill(0); lastMs.fill(0); st.dropped = 0; st.disjoint = 0; },
    /** The renderer's leaf counts by class (index = contract class − 1), for the panel. */
    noteLeaves(counts, note = '') { for (let i = 0; i < LEAF_NAMES.length; i++) leafCounts[i] = counts[i] || 0; leafNote = note; },
    setReport(text) { lastReport = text; },
    /** Mean ms a frame (over the frames the component ran in), by component. */
    meanMs(c) { return framesWith[c] ? total[c] / framesWith[c] : 0; },
    totalMs: (c) => total[c],
    stats: st,
    get live() { return depth > 0; },
    text() { return textOf(this, total, framesWith, calls, maxMs, st, polled); },
  };
}

function textOf(self, total, framesWith, calls, maxMs, st, polled) {
  const lines = ['Vector work (GPU timers may split the render pass: a little slower than shipped)'];
  if (st.noExt) lines.push('  no GPU timer on this browser (EXT_disjoint_timer_query_webgl2): times are not available');
  else if (!polled) lines.push('  no timing yet: draw some vector frames with ?perf on');
  else {
    const parts = [];
    let sum = 0;
    for (let c = 0; c < N_COMP; c++) {
      if (!calls[c]) continue;
      const m = total[c] / framesWith[c];
      sum += m;
      parts.push(`${COMP_NAMES[c]} ${m.toFixed(2)} ms (max ${maxMs[c].toFixed(2)}, ${framesWith[c]} frames)`);
    }
    lines.push(parts.length ? `  time by component, mean a frame it ran in: ${parts.join('; ')}; sum ${sum.toFixed(2)} ms` : '  no result yet');
    if (st.dropped) lines.push(`  ${st.dropped} results dropped (GPU_DISJOINT_EXT set ${st.disjoint} times)`);
    if (st.poolFull) lines.push(`  ${st.poolFull} pieces not timed (query pool full)`);
  }
  void self;
  return lines.join('\n');
}

/** The "Vector work" section of the ?perf panel: the latest renderer's timers, the leaves by class and the L_WIDE count, the last benchmark. '' when nothing has run. */
export function vecWorkText() {
  const out = [];
  if (current) out.push(current.text());
  let any = false;
  for (let i = 0; i < LEAF_NAMES.length; i++) if (leafCounts[i]) any = true;
  if (any) out.push(`  leaves: ${LEAF_NAMES.map((n, i) => `${n} ${leafCounts[i]}`).join(', ')}; L_WIDE ${leafCounts[4]}${leafNote ? ` (${leafNote})` : ''}`);
  if (lastReport) out.push(lastReport);
  return out.join('\n');
}

/** The measure the panel reads: set by whoever owns the renderer (E) when it makes one. */
export function setCurrentMeasure(m) { current = m; }
/** The last benchmark's report, for the panel when no measure is current. */
export function setLastReport(t) { lastReport = t; }
export const lastBenchReport = () => lastReport;
export const currentMeasure = () => current;
