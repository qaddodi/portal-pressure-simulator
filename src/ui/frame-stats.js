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
  let gaps = [], scripts = [], byTag = {}, phases = { early: [], late: [], final: [] }, count = 0;
  const long = [];
  const reset = () => { gaps = []; scripts = []; byTag = {}; phases = { early: [], late: [], final: [] }; count = 0; long.length = 0; };
  /** Takes one frame (the shape above). Matches watchFrames' callback, so `watchFrames(recorder.add)` works as it is. */
  const add = (f) => {
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
  /** The recording as lists of numbers: intervals, script times, each surface's per-frame ms, each phase's per-frame ms. */
  const raw = () => ({ frames: count, gaps: gaps.slice(), scripts: scripts.slice(), byTag: Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, v.slice()])), phases: { early: phases.early.slice(), late: phases.late.slice(), final: phases.final.slice() } });
  const snapshot = () => summarizeRaw(raw());
  return { add, raw, snapshot, reset, long };
}

/** Summaries (n, p50, p95, p99, max, mean) of a recording's raw numbers, or of several merged with mergeRaw. */
export function summarizeRaw(r) {
  return {
    frames: r.frames, gap: summarize(r.gaps), script: summarize(r.scripts),
    surfaces: Object.fromEntries(Object.entries(r.byTag).map(([k, v]) => [k, summarize(v)])),
    phases: Object.fromEntries(Object.entries(r.phases).map(([k, v]) => [k, summarize(v)])),
  };
}

/** Several recordings' raw numbers as one (the six slide changes of a deck judged together). */
export function mergeRaw(list) {
  const out = { frames: 0, gaps: [], scripts: [], byTag: {}, phases: { early: [], late: [], final: [] } };
  for (const r of list) {
    out.frames += r.frames; out.gaps.push(...r.gaps); out.scripts.push(...r.scripts);
    for (const k in r.byTag) (out.byTag[k] ||= []).push(...r.byTag[k]);
    for (const p of PHASES) out.phases[p].push(...(r.phases?.[p] || []));
  }
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
