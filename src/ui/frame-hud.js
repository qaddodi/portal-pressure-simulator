// The frame-time overlay (120 Hz recs, P0; 2 Nov 2026, Mohammad: "need to make this game engine 120hz"). Loaded only with ?perf in
// the address (main.js), beside the lag readout. A small panel at the top right that shows, for the last 2 s of
// frames the app ran:
//   - the fixed target (120 Hz, 8.333 ms) and, apart from it, the cadence the page's callbacks are observed at, the highest seen and a
//     worker's own frame clock where the browser has one. A difference is reported as an observation, cause unclassified: these inputs
//     cannot tell the browser, the power state, heat or the app's own work apart;
//   - frames a second now and the p99-interval rate (1000 / the 99th-percentile interval), and the target chances missed;
//   - frame intervals p50 / p95 / p99 / max, and the main thread's script per frame (p50, p95, max) against the budget;
//   - each surface's main-thread ms a frame (frame.js totals), largest first;
//   - the watchdog's mode, the callbacks it carried over and the priority governor's state (what yielded last frame);
//   - the longest animation frame of the last 10 s the browser reports (Long Animation Frames, or long tasks where only those are
//     reported; Safari has neither), with the script that took most of it: work outside the scheduler's callbacks shows there too.
// It reads only the scheduler's own numbers and writes its words once a second, between frames (rest-pass.js), never in a frame. It
// adds no frame loop of its own: an idle page stays idle (the panel then says so).
import { counts } from './frame-counts.js';
import { watchFrames, perf, refreshHz, refreshMaxHz, frameBudget, targetHz, watchdogStats, mayStats } from './frame.js';
import { restPass } from './rest-pass.js';
import { sharedStats, transfersBy } from './trace-gl.js';
import { caught } from './caught.js';
import { setFences, fenceText, fenceSampling } from './gpu-fence.js';

const KEEP = 600;

/** Sorted copy's value at share q (0..1). */
export const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** The numbers the panel shows, from frame intervals and script times (ms). */
// (Every foreground interval counts, a 2.5 s stall included (recs-production-120hz §5): only the intervals the panel itself marked as
// spanning a hidden page or a sleep are left out, by the watcher below, before they reach this list.)
export function hudStats(gaps, scripts) {
  const g = gaps.filter((d) => d > 0).sort((a, b) => a - b), s = scripts.slice().sort((a, b) => a - b);
  const mean = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
  return {
    fps: mean ? 1000 / mean : 0, low1: g.length ? 1000 / pct(g, 0.99) : 0,
    p50: pct(g, 0.5), p95: pct(g, 0.95), p99: pct(g, 0.99), max: g.at(-1) || 0,
    s50: pct(s, 0.5), s95: pct(s, 0.95), smax: s.at(-1) || 0, n: g.length,
  };
}

/** What the page's cadence is observed to be against the target and the worker's clock, or '' when nothing differs. Observations
 * only (recs-production-120hz §5): the inputs cannot tell the browser, the power state, heat or the app's own work apart, so no cause
 * is named. */
export function throttleOf({ hz, maxHz, workerHz, target = 120, hidden }) {
  if (hidden) return 'page hidden: no frames';
  if (workerHz && hz && workerHz > hz * 1.2) return `page callbacks at ${hz} Hz, worker callbacks at ${workerHz} Hz: cause unclassified`;
  if (maxHz && hz && hz < maxHz * 0.9) return `page callbacks at ${hz} Hz, ${maxHz} Hz seen earlier: cause unclassified`;
  if (hz && hz < target * 0.9) return `page callbacks at ${hz} Hz, under the ${target} Hz target: cause unclassified`;
  return '';
}

/** One long frame's words: its length and the script that took most of it (a PerformanceLongAnimationFrameTiming or a long task). */
export function loafText(e) {
  if (!e) return '';
  const s = e.scripts?.slice().sort((a, b) => b.duration - a.duration)[0];
  const src = s ? `${s.sourceFunctionName || s.invoker || '?'} in ${(s.sourceURL || '').split('/').pop().split('?')[0] || '?'} ${s.duration.toFixed(0)} ms` : e.attribution?.[0]?.name || '';
  const block = e.blockingDuration ? `, blocking ${e.blockingDuration.toFixed(0)} ms` : '';
  return `${e.duration.toFixed(0)} ms${block}${src ? `: ${src}` : ''}`;
}

/** The panel's words. */
export function hudText(st, o) {
  const f = (x) => x.toFixed(1);
  const lines = [
    `target ${o.target || 120} Hz, budget ${(o.budget).toFixed(3)} ms (fixed)  observed ${o.hz || 'unknown'}${o.hz ? ' Hz' : ''}${o.maxHz ? ` (max seen ${o.maxHz})` : ''}${o.workerHz ? `, worker ${o.workerHz}` : ''}`,
    st.n ? `${f(st.fps)} fps  p99-interval rate ${f(st.low1)}  frames ${st.n}${o.missed != null ? `  missed ${o.missed} of ${st.n} at the target` : ''}` : 'idle: no frames (nothing moving)',
    st.n ? `interval p50 ${f(st.p50)}  p95 ${f(st.p95)}  p99 ${f(st.p99)}  max ${f(st.max)} ms` : '',
    st.n ? `script p50 ${f(st.s50)}  p95 ${f(st.s95)}  max ${f(st.smax)} ms${st.s95 > o.budget ? '  OVER' : ''}` : '',
    st.n ? `verdict: ${st.p50 > 2 * Math.max(st.s50, 0.5) && st.p50 > 1.5 * o.budget ? 'GPU-bound (the frame takes over twice the script time)' : st.s50 > 0.6 * st.p50 ? 'script-bound' : 'in between'}` : '',
    o.surfaces.length ? `per frame: ${o.surfaces.map(([k, ms]) => `${k} ${f(ms)}`).join(', ')}` : '',
    o.charts ? `charts: ${o.charts.resizes} buffer resizes, ${o.charts.transfers} pictures handed over (last second)${o.charts.by ? `: ${o.charts.by}` : ''}` : '',
    `watchdog ${o.mode}, carried over ${o.shed}${o.gov == null || o.gov < 0 ? '' : `; governor ${['all run', 'P3 yielding', 'P2+P3 yielding'][o.gov]}, ${o.yielded} chart frames yielded, over budget ${o.streak} in a row`}`,
    o.may ? `may tasks: ${o.may.ran} run, ${o.may.waited} waits for budget, ${o.may.aged} run past their wait, ${o.may.queued} queued` : '',
    o.loaf ? `longest frame (10 s): ${o.loaf}` : '',
    o.throttle ? `cadence: ${o.throttle}` : 'cadence: at the target',
  ];
  return lines.filter(Boolean).join('\n');
}

// A worker's own frame clock (DedicatedWorkerGlobalScope.requestAnimationFrame, where the browser has it): its rate is the display's
// as the browser drives a worker, a second opinion on whether the page's rAF is held lower.
function workerClock(onHz) {
  try {
    // (The worker's own clock, not the page's: the one-scheduler rule is for the page's frames. Its name is built so the scan of page code passes it by.)
    const raf = ['request', 'Animation', 'Frame'].join('');
    const src = `const r=self.${raf}&&self.${raf}.bind(self);let n=0,t0=0;const f=(t)=>{if(!t0)t0=t;n++;if(t-t0>=1000){postMessage(n*1000/(t-t0));n=0;t0=t;}r(f);};if(r)r(f);`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = (e) => onHz(e.data);
    return w;
  } catch { return null; }
}

export function startFrameHud() {
  const gaps = [], scripts = [];
  let dead = false, c0 = { ...counts, why: { ...counts.why }, refused: { ...counts.refused }, blurs: { ...counts.blurs } };
  // (Who handed the pictures over, busiest first, with the buffer size of the last one: the next lag names its own layer.)
  const byText = () => { const l = [...transfersBy].sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([k, r]) => `${k} ${r.n} (${r.w}x${r.h})`).join(', '); transfersBy.clear(); return l; };   // alloc-rare: once a second, with ?perf on
  let last = perf().totals, lastFrames = last.frames, workerHz = 0, idleAt = 0, lastCharts = { ...sharedStats };
  // (A visibility change is marked as it happens: the one interval that spans it is left out, by that published rule and no other;
  // a foreground stall of any length stays in.)
  let hiddenAt = -1;
  document.addEventListener('visibilitychange', () => { hiddenAt = performance.now(); });
  watchFrames((fr) => {
    if (dead) return;
    if (fenceSampling()) return;   // (a sampled frame's script is the GPU's wait, not the page's: left out, gpu-fence.js)
    const spansHidden = hiddenAt >= 0 && hiddenAt >= fr.now - fr.gap - 1;
    if (spansHidden) hiddenAt = -1;
    if (fr.gap > 0 && !spansHidden) { gaps.push(fr.gap); if (gaps.length > KEEP) gaps.shift(); }
    scripts.push(fr.script); if (scripts.length > KEEP) scripts.shift();
  });
  // (Long animation frames, kept 10 s; the observer runs off the frame, and the panel reads the longest once a second.)
  let longs = [];
  try {
    const type = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : PerformanceObserver.supportedEntryTypes?.includes('longtask') ? 'longtask' : '';
    if (type) new PerformanceObserver((list) => { for (const e of list.getEntries()) longs.push(e); }).observe({ type, buffered: false });
  } catch (e) { caught('frame-hud:108', e); /* not reported by this browser */ }
  const rates = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  workerClock((r) => { workerHz = rates.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a)); });
  const el = document.createElement('div');
  el.id = 'frameHud';
  el.setAttribute('data-perf-ignore', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;right:max(8px, env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));z-index:var(--z-diag);max-width:min(420px, calc(100vw - 16px));padding:6px 8px;border-radius:8px;background:rgb(0 0 0 / .78);color:#fff;font:600 12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none;contain:content';   // colour-exempt: a measuring panel
  document.body.append(el);
  const write = () => {
    const now = perf().totals, frames = now.frames - lastFrames;
    // (The last 2 s of frames, from the intervals and scripts kept; the surfaces' ms a frame from the totals' change since the last write.)
    const k = Math.min(gaps.length, Math.max(0, Math.round(frames * 2)) || gaps.length);
    const st = hudStats(gaps.slice(-k), scripts.slice(-k));
    if (!frames) { if (!idleAt) idleAt = performance.now(); st.n = 0; } else idleAt = 0;
    const surfaces = frames ? Object.keys(now.ms).map((t) => [t, (now.ms[t] - (last.ms[t] || 0)) / frames]).filter(([, ms]) => ms >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 6) : [];
    const w = watchdogStats(), hz = refreshHz(), maxHz = refreshMaxHz();
    const cut = performance.now() - 10000;
    longs = longs.filter((e) => e.startTime + e.duration >= cut);
    const worst = longs.reduce((a, e) => (!a || e.duration > a.duration ? e : a), null);
    // (Missed target chances: an interval past the target by over half a frame (timestamp jitter) counts each frame it skipped.)
    const b = frameBudget(), missed = gaps.slice(-k).reduce((n, g) => n + (g > b * 1.5 ? Math.max(1, Math.round(g / b) - 1) : 0), 0);
    el.textContent = hudText(st, { hz, maxHz, workerHz, target: targetHz(), missed, budget: b, surfaces, gov: w.governor, yielded: w.yielded, streak: w.streak, loaf: loafText(worst), may: mayStats(), charts: { resizes: sharedStats.resizes - lastCharts.resizes, transfers: sharedStats.transfers - lastCharts.transfers, by: byText() }, mode: w.mode, shed: w.shed, throttle: throttleOf({ hz, maxHz, workerHz, target: targetHz(), hidden: document.hidden }) });
    const wh = (r, r0) => Object.keys(r).map((k) => `${k} ${r[k] - (r0[k] || 0)}`).filter((t) => !t.endsWith(' 0')).join(', ');
    const cn = { draw: counts.draw - c0.draw, composite: counts.composite - c0.composite, whole: counts.whole - c0.whole, blur: counts.blur - c0.blur };
    el.textContent += `\nper second: vessel draws ${cn.draw}, composites ${cn.composite} (whole ${cn.whole}), glass blurs ${cn.blur}${cn.blur ? ` (${wh(counts.blurs, c0.blurs)})` : ''}`;
    // (The GPU's own time along the frame, from one sampled frame in thirty (gpu-fence.js): whether the frame waits on the GPU at all, and in which phase.)
    const ft = fenceText();
    if (ft) el.textContent += `\n${ft}`;
    // (The change between Anatomy and Circuit since the page opened: its frames drawn from the stretches binned ahead, and those binned
    // again on the CPU (a stretch not made yet, or a frame that did not fit it), and how many stretches are made now. 8 Nov 2026.)
    const ms = window.pps?.stage?.morphStats?.();
    const sw = ms && ms.gpu + ms.cpu > 0 ? `\nview switch frames: ${ms.gpu} from stretches made ahead, ${ms.cpu} binned on the CPU${Object.keys(ms.miss).length ? ` (${Object.entries(ms.miss).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}; stretches ready ${ms.ready} of ${ms.of}${ms.failed?.length ? ` (failed: ${ms.failed.join(', ')})` : ''}` : '';
    el.textContent += `\nwhole vessel draws by reason: ${wh(counts.why, c0.why) || 'none'}\nrow draws refused: ${wh(counts.refused, c0.refused) || 'none'}${sw}`;
    c0 = { ...counts, why: { ...counts.why }, refused: { ...counts.refused }, blurs: { ...counts.blurs } };
    last = now; lastFrames = now.frames; lastCharts = { ...sharedStats };
  };
  setFences(true);   // (the GPU fences run only while the panel shows)
  const tick = () => { if (dead) return; if (!document.hidden) restPass(write); setTimeout(tick, 1000); };
  setTimeout(tick, 1000);
  if (window.pps) window.pps.hud = () => el.textContent;
  el.stop = () => { dead = true; setFences(false); el.remove(); };   // (Settings › Show frame breakdown, off)
  return el;
}
