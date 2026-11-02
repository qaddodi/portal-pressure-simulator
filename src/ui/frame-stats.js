// Frame statistics, shared by the app (frame.js's frame recorder, the ?perf readout's long-frame log) and the frame-time gate
// (scripts/frame-gate.mjs, which reads the recorder's raw numbers out of the page and judges them in Node). No DOM here, so the
// same code runs in both and in a unit test.
//
// A frame, as the scheduler (frame.js watchFrames) reports it:
//   { now, gap, script, parts }
//   now     the frame's timestamp (ms)
//   gap     ms since the previous frame's timestamp when the scheduler was running frame after frame (0 when it had been idle,
//           so there is no interval to speak of)
//   script  ms the scheduler's callbacks took in this frame (CPU time issuing work; the browser's style, layout, paint and the
//           GPU come on top and are not in it)
//   parts   [[surface, phase, ms], ...] one entry per callback; phase is 'early', 'late' or 'final' (frame.js framePhase)

/** A frame whose interval or script time is over this many ms goes in the long-frame log (P4: "?perf prints each frame over 50 ms"). */
export const LONG_FRAME_MS = 50;
/** An interval past this is a sleeping tab (or a debugger), not a frame time: it is dropped from the intervals. */
export const SLEEP_MS = 2000;
const PHASES = ['early', 'late', 'final'];

// ── Honest statistics (recs_cgpt R02, 2 Nov 2026) ── ?statfix=0 turns all of this off (the old recorder, as it was).
// A foreground stall is kept whatever its length: an interval is dropped as a sleeping tab only when the page really was suspended
// in it (the page went hidden, was frozen or hidden by pagehide; or the frame says so with `suspended`), never for its length alone.
// The whole session counts: interval and script times also go into streaming histograms (fixed log buckets, a few hundred counters,
// nothing kept per frame), so a soak past the raw lists' last `keepFrames` frames still has its p50…p99.9 and worst. The raw lists
// keep the newest frames, a bounded ring. And next to the 50 ms log, a cadence-relative miss log: a frame whose interval is past
// 1.5 × the display's cadence (the median of recent intervals) missed round(gap / cadence) − 1 chances to draw.
export const STATFIX = !(typeof location !== 'undefined' && /[?&]statfix=0\b/.test(location.search || ''));
let suspendedAt = -Infinity, lifecycle = false;
// (Listened for from the first frame recorded, not at load: a page nobody records adds no listener.)
function watchLifecycle() {
  if (lifecycle || !STATFIX || typeof document === 'undefined' || typeof addEventListener !== 'function' || !document.addEventListener) return;
  lifecycle = true;
  const mark = () => { suspendedAt = performance.now(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) mark(); else suspendedAt = Math.max(suspendedAt, performance.now()); });
  document.addEventListener('freeze', mark);
  document.addEventListener('resume', mark);
  addEventListener('pagehide', mark);
  addEventListener('pageshow', mark);
}
/** Marks the page suspended now (tests, and a caller that knows of a suspension the events above miss). */
export function noteSuspended(at = typeof performance !== 'undefined' ? performance.now() : 0) { suspendedAt = at; }

// Histogram buckets: bucket i holds values up to HIST_BASE × HIST_RATIO^i ms (0.05 ms … ~60 s, 4% apart): one bucket's width
// is the quantile's error, so a p99 read from it is within 4%.
const HIST_BASE = 0.05, HIST_RATIO = 1.04, HIST_N = 360, LN_R = Math.log(HIST_RATIO);
const histIndex = (v) => (v <= HIST_BASE ? 0 : Math.min(HIST_N - 1, Math.ceil(Math.log(v / HIST_BASE) / LN_R)));
const histTop = (i) => HIST_BASE * HIST_RATIO ** i;
/** A streaming histogram: add(v) costs a log and an increment; summary() gives n, p50, p95, p99, p999, max and mean. */
export function createHistogram() {
  const counts = new Uint32Array(HIST_N);
  let n = 0, sum = 0, max = 0;
  const add = (v) => { if (!(v >= 0)) return; counts[histIndex(v)]++; n++; sum += v; if (v > max) max = v; };
  const q = (p) => {
    if (!n) return 0;
    const want = Math.min(n, Math.floor(n * p) + 1);
    let c = 0;
    for (let i = 0; i < HIST_N; i++) { c += counts[i]; if (c >= want) return Math.min(max, histTop(i)); }
    return max;
  };
  const summary = () => ({ n, p50: q(0.5), p95: q(0.95), p99: q(0.99), p999: q(0.999), max, mean: n ? sum / n : 0 });
  const dump = () => ({ counts: Array.from(counts), n, sum, max });
  const load = (d) => { if (!d) return; for (let i = 0; i < HIST_N; i++) counts[i] += d.counts?.[i] || 0; n += d.n || 0; sum += d.sum || 0; max = Math.max(max, d.max || 0); };
  const reset = () => { counts.fill(0); n = 0; sum = 0; max = 0; };
  return { add, summary, dump, load, reset };
}
/** A histogram's summary from its dump (the raw numbers a page hands the gate). */
export function histSummary(d) { const h = createHistogram(); h.load(d); return h.summary(); }

/** The cadence-relative miss counter: the display's cadence from recent intervals, and each frame's missed chances. */
export function createMissLog({ keep = 120, ratio = 1.5 } = {}) {
  const recent = [], log = [];
  let cadence = 0, frames = 0, misses = 0, missed = 0, run = 0, longestRun = 0;
  const add = (at, gap) => {
    if (!(gap > 0)) { run = 0; return; }
    frames++;
    if (cadence && gap > ratio * cadence) {
      const lost = Math.max(1, Math.round(gap / cadence) - 1);
      misses++; missed += lost; run += lost; if (run > longestRun) longestRun = run;
      log.push({ at, gap, cadence, missed: lost }); if (log.length > keep) log.shift();
    } else run = 0;
    // (The cadence: the median of the last 15 intervals under 50 ms, a long frame not counted toward it.)
    if (gap < 50) { recent.push(gap); if (recent.length > 15) recent.shift(); cadence = [...recent].sort((a, b) => a - b)[recent.length >> 1]; }
  };
  const summary = () => ({ frames, cadence, misses, missed, longestRun });
  const reset = () => { recent.length = 0; log.length = 0; cadence = 0; frames = 0; misses = 0; missed = 0; run = 0; longestRun = 0; };
  return { add, summary, log, reset };
}

/** The q-quantile (0..1) of an ascending list, nearest rank: the same rule scripts/perf.mjs uses for its p50 and p95. */
export function percentile(sorted, q) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
}

/** n, p50, p95, p99, max and mean of a list of numbers (zeros for an empty list). */
export function summarize(values) {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return { n, p50: percentile(v, 0.5), p95: percentile(v, 0.95), p99: percentile(v, 0.99), max: n ? v[n - 1] : 0, mean: n ? v.reduce((s, x) => s + x, 0) / n : 0 };
}

/**
 * Records frames. Keeps the raw numbers (a list of intervals, a list of script times, and for each surface the ms it took in each
 * frame it ran in) so a caller can merge several recordings before judging them, and a ring of the long frames.
 *
 *   const r = createFrameRecorder();   watchFrames(r.add);   ...   r.snapshot()   r.raw()   r.long
 */
export function createFrameRecorder({ longMs = LONG_FRAME_MS, keepLong = 60, keepFrames = 20000 } = {}) {
  let gaps = [], scripts = [], byTag = {}, phases = { early: [], late: [], final: [] }, count = 0, seen = 0, dropped = 0;
  const long = [];
  const hGap = createHistogram(), hScript = createHistogram(), miss = createMissLog();
  const reset = () => { gaps = []; scripts = []; byTag = {}; phases = { early: [], late: [], final: [] }; count = 0; seen = 0; dropped = 0; long.length = 0; hGap.reset(); hScript.reset(); miss.reset(); };
  // (The raw lists as a ring: past keepFrames by a quarter, the oldest are dropped at once, so the cost stays a slice now and then.)
  const trim = () => {
    const cut = (a) => a.splice(0, a.length - keepFrames);
    if (scripts.length > keepFrames * 1.25) { cut(gaps); cut(scripts); for (const p of PHASES) cut(phases[p]); for (const k in byTag) if (byTag[k].length > keepFrames) cut(byTag[k]); }
  };
  /** Whether an interval is a suspension (the page was hidden or frozen in it), not a stall: the only reason to drop it. */
  const suspended = (f) => !!f.suspended || (f.gap > 0 && suspendedAt >= (f.now ?? 0) - f.gap - 1 && suspendedAt <= (f.now ?? Infinity) + 1);
  /** Takes one frame (the shape above). Matches watchFrames' callback, so `watchFrames(recorder.add)` works as it is. */
  const add = (f) => {
    if (STATFIX) return addFix(f);
    const gap = f.gap > 0 && f.gap < SLEEP_MS ? f.gap : 0;
    const sum = {}, ph = { early: 0, late: 0, final: 0 };
    for (const [tag, phase, ms] of f.parts || []) { sum[tag] = (sum[tag] || 0) + ms; if (phase in ph) ph[phase] += ms; }
    if (count < keepFrames) {
      count++;
      if (gap) gaps.push(gap);
      scripts.push(f.script);
      for (const tag in sum) (byTag[tag] ||= []).push(sum[tag]);
      for (const p of PHASES) phases[p].push(ph[p]);
    }
    if (gap > longMs || f.script > longMs) {
      const top = (f.parts || []).slice().sort((a, b) => b[2] - a[2]).slice(0, 4).map(([tag, phase, ms]) => [tag, phase, ms]);
      long.push({ at: f.now, gap, script: f.script, phases: ph, top, outside: Math.max(0, (gap || f.script) - f.script) });
      if (long.length > keepLong) long.shift();
    }
  };
  const addFix = (f) => {
    watchLifecycle();
    const sus = f.gap > 0 && suspended(f);
    if (sus) dropped++;
    const gap = f.gap > 0 && !sus ? f.gap : 0;
    const sum = {}, ph = { early: 0, late: 0, final: 0 };
    for (const [tag, phase, ms] of f.parts || []) { sum[tag] = (sum[tag] || 0) + ms; if (phase in ph) ph[phase] += ms; }
    seen++; count++;
    if (gap) { gaps.push(gap); hGap.add(gap); }
    scripts.push(f.script); hScript.add(f.script);
    for (const tag in sum) (byTag[tag] ||= []).push(sum[tag]);
    for (const p of PHASES) phases[p].push(ph[p]);
    trim();
    miss.add(f.now, gap);
    if (gap > longMs || f.script > longMs) {
      const top = (f.parts || []).slice().sort((a, b) => b[2] - a[2]).slice(0, 4).map(([tag, phase, ms]) => [tag, phase, ms]);
      long.push({ at: f.now, gap, script: f.script, phases: ph, top, outside: Math.max(0, (gap || f.script) - f.script) });
      if (long.length > keepLong) long.shift();
    }
  };
  /** The recording as lists of numbers: intervals, script times, each surface's per-frame ms, each phase's per-frame ms. */
  const raw = () => ({ frames: count, ...(STATFIX ? { whole: { gap: hGap.dump(), script: hScript.dump(), misses: miss.summary(), suspended: dropped, frames: seen } } : {}), gaps: gaps.slice(), scripts: scripts.slice(), byTag: Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, v.slice()])), phases: { early: phases.early.slice(), late: phases.late.slice(), final: phases.final.slice() } });
  const snapshot = () => summarizeRaw(raw());
  return { add, raw, snapshot, reset, long, misses: miss.log };
}

/** Summaries (n, p50, p95, p99, max, mean) of a recording's raw numbers, or of several merged with mergeRaw. */
export function summarizeRaw(r) {
  return {
    frames: r.frames, gap: summarize(r.gaps), script: summarize(r.scripts),
    surfaces: Object.fromEntries(Object.entries(r.byTag).map(([k, v]) => [k, summarize(v)])),
    phases: Object.fromEntries(Object.entries(r.phases).map(([k, v]) => [k, summarize(v)])),
    ...(r.whole ? { whole: { frames: r.whole.frames, gap: histSummary(r.whole.gap), script: histSummary(r.whole.script), misses: r.whole.misses, suspended: r.whole.suspended } } : {}),
  };
}

/** Several recordings' raw numbers as one (the six slide changes of a deck judged together). */
export function mergeRaw(list) {
  const out = { frames: 0, gaps: [], scripts: [], byTag: {}, phases: { early: [], late: [], final: [] } };
  for (const r of list) {
    out.frames += r.frames; out.gaps.push(...r.gaps); out.scripts.push(...r.scripts);
    for (const k in r.byTag) (out.byTag[k] ||= []).push(...r.byTag[k]);
    for (const p of PHASES) out.phases[p].push(...(r.phases?.[p] || []));
    if (r.whole) {
      const w = (out.whole ||= { frames: 0, gap: createHistogram(), script: createHistogram(), misses: { frames: 0, cadence: 0, misses: 0, missed: 0, longestRun: 0 }, suspended: 0 });
      w.frames += r.whole.frames || 0; w.gap.load(r.whole.gap); w.script.load(r.whole.script); w.suspended += r.whole.suspended || 0;
      const m = r.whole.misses || {};
      w.misses.frames += m.frames || 0; w.misses.misses += m.misses || 0; w.misses.missed += m.missed || 0;
      w.misses.longestRun = Math.max(w.misses.longestRun, m.longestRun || 0); w.misses.cadence ||= m.cadence || 0;
    }
  }
  if (out.whole) out.whole = { ...out.whole, gap: out.whole.gap.dump(), script: out.whole.script.dump() };
  return out;
}

/** The surfaces with the largest p95, most expensive first: [[surface, summary], ...]. */
export function topSurfaces(surfaces, n = 3) {
  return Object.entries(surfaces).sort((a, b) => b[1].p95 - a[1].p95 || b[1].max - a[1].max).slice(0, n);
}

/**
 * One long frame as a line the owner can paste: when, how long, what ran in it (surface, phase, ms; largest first) and what the
 * scheduler's own callbacks do not account for (the browser's style, layout and paint, other scripts, the GPU or the screen).
 */
export function longFrameLine(f, t0 = 0) {
  const sec = ((f.at - t0) / 1000).toFixed(1);
  const what = f.top.length ? f.top.map(([tag, phase, ms]) => `${tag} ${phase} ${ms.toFixed(0)}`).join(', ') : 'no callback';
  const ph = PHASES.filter((p) => f.phases[p] >= 0.5).map((p) => `${p} ${f.phases[p].toFixed(0)}`).join(' / ');
  const head = f.gap ? `${f.gap.toFixed(0)} ms between frames` : `${f.script.toFixed(0)} ms in one frame`;
  return `  ${sec} s: ${head}, script ${f.script.toFixed(0)} ms${ph ? ` (${ph})` : ''}: ${what}${f.gap ? `; outside the scheduler ${f.outside.toFixed(0)} ms` : ''}`;
}
