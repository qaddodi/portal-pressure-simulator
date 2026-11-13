// The ?perf readout's text for a surface's callbacks and draws, the long-frame log and the slowest inputs, kept apart from the readout itself so
// the device lap (lap.js) can write the same lines without importing the readout (which only ?perf may load). perf-readout.js re-exports them.
import { LONG_FRAME_MS, longFrameLine } from './frame-stats.js';
const LONG_LINES = 15;
/** Each surface's callbacks and the frames it really drew (frame.js noteDraw) over a window, from two readings of perf().totals. */
const sKeys = [], sCount = [], sDraw = [];   // (the surfaces that asked, their callbacks and draws, kept and written over)
export function surfaceLine(a, b) {
  let n = 0;
  for (const k of Object.keys(b.asks)) {   // alloc-rare: once as a gesture's window closes
    const c = b.asks[k] - (a.asks[k] || 0);
    if (c > 0) { sKeys[n] = k; sCount[n] = c; sDraw[n] = k in b.drawn ? b.drawn[k] - (a.drawn[k] || 0) : null; n++; }
  }
  if (!n) return '';
  // (Most callbacks first; those with as many keep the order they came in.)
  for (let i = 1; i < n; i++) {
    const k = sKeys[i], c = sCount[i], d = sDraw[i];
    let j = i - 1;
    while (j >= 0 && sCount[j] < c) { sKeys[j + 1] = sKeys[j]; sCount[j + 1] = sCount[j]; sDraw[j + 1] = sDraw[j]; j--; }
    sKeys[j + 1] = k; sCount[j + 1] = c; sDraw[j + 1] = d;
  }
  let text = '  surfaces (callbacks / draws): ';
  for (let i = 0; i < n; i++) text += (i ? ', ' : '') + sKeys[i] + ' ' + sCount[i] + (sDraw[i] == null ? '' : ' / ' + sDraw[i]);   // alloc-rare: once as a gesture's window closes; the report's text
  return text;
}
/** The long-frame log as text (premium-feel recs P4): every frame whose interval or script time passed LONG_FRAME_MS, the newest
 *  `n` of them, each with the surfaces that ran in it (surface, phase, ms) and what the scheduler does not account for. Times are
 *  seconds since the page opened. One line to paste instead of an afternoon of guessing. */
export function longFramesText(long, n = LONG_LINES) {
  if (!long.length) return `Long frames (over ${LONG_FRAME_MS} ms): none`;
  const shown = long.slice(-n);
  return [`Long frames (over ${LONG_FRAME_MS} ms; the newest ${shown.length} of ${long.length}, seconds since the page opened):`, ...shown.map((f) => longFrameLine(f))].join('\n');
}
/** The input-to-first-change measure (frame.js perf().inputToPaint, input-latency.js) as text: counts, p50, p95, the slowest. */
export function inputsText(api) {
  const s = api?.summary();
  if (!s || !s.n) return `Inputs (a tap, press or key to the frame the page first changed): none answered yet${s?.ignored ? `, ${s.ignored} with no change` : ''}`;
  const slow = api.slowest(4).map((d) => `${d.kind} ${d.target} ${d.ms.toFixed(0)} ms`).join(', ');
  return [`Inputs (a tap, press or key to the frame the page first changed; the last ${Math.min(s.n, 200)} of ${s.n}${s.ignored ? `, ${s.ignored} with no change` : ''}): p50 ${s.p50.toFixed(0)}, p95 ${s.p95.toFixed(0)}, worst ${s.worst.toFixed(0)} ms`, `  slowest: ${slow}`].join('\n');
}
