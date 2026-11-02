// The frame-time overlay (120 Hz recs, P0; 2 Nov 2026, Mohammad: "need to make this game engine 120hz"). Loaded only with ?perf in
// the address (main.js), beside the lag readout; ?hud=0 leaves it out. A small panel at the top right that shows, for the last 2 s of
// frames the app ran:
//   - the refresh the browser offers the page, the highest seen, and whether the page is held under it (a throttle: Safari's 60 Hz cap
//     for pages, Low Power Mode's 30, a hidden tab), told by the page's frames, a worker's own frame clock where the browser has one,
//     and the device;
//   - frames a second now and the 1 % low (the rate of the slowest 1 % of frames);
//   - frame intervals p50 / p95 / p99 / max, and the main thread's script per frame (p50, p95, max) against the budget;
//   - each surface's main-thread ms a frame (frame.js totals), largest first;
//   - the watchdog's mode and the callbacks it carried over.
// It reads only the scheduler's own numbers and writes its words once a second, between frames (rest-pass.js), never in a frame. It
// adds no frame loop of its own: an idle page stays idle (the panel then says so).
import { watchFrames, perf, refreshHz, refreshMaxHz, frameBudget, watchdogStats } from './frame.js?v=ae4d297959';
import { restPass } from './rest-pass.js?v=bf0c42ead5';
import { sharedStats } from './trace-gl.js?v=ddb94858b8';

export const HUD_OFF = (search) => /[?&]hud=0\b/.test(String(search ?? ''));
const KEEP = 600;

/** Sorted copy's value at share q (0..1). */
export const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** The numbers the panel shows, from frame intervals and script times (ms). */
export function hudStats(gaps, scripts) {
  const g = gaps.filter((d) => d > 0 && d < 1000).sort((a, b) => a - b), s = scripts.slice().sort((a, b) => a - b);
  const mean = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
  return {
    fps: mean ? 1000 / mean : 0, low1: g.length ? 1000 / pct(g, 0.99) : 0,
    p50: pct(g, 0.5), p95: pct(g, 0.95), p99: pct(g, 0.99), max: g.at(-1) || 0,
    s50: pct(s, 0.5), s95: pct(s, 0.95), smax: s.at(-1) || 0, n: g.length,
  };
}

/** Why the page may be held under the panel's rate, or '' when nothing says it is. */
export function throttleOf({ hz, maxHz, workerHz, apple, hidden }) {
  if (hidden) return 'hidden tab: no frames';
  if (workerHz && hz && workerHz > hz * 1.2) return `held at ${hz} Hz (a worker's frames come at ${workerHz} Hz)`;
  if (maxHz && hz && hz < maxHz * 0.9) return `held at ${hz} Hz (${maxHz} Hz seen: Low Power Mode, heat or the browser)`;
  if (apple && hz && hz <= 60) return 'likely Safari\'s 60 Hz cap for pages (Settings › Apps › Safari › Advanced › Feature Flags: turn off "Prefer Page Rendering Updates near 60fps", or use High Refresh)';
  return '';
}

/** The panel's words. */
export function hudText(st, o) {
  const f = (x) => x.toFixed(1);
  const lines = [
    `${o.hz || '?'} Hz offered${o.maxHz ? ` (max seen ${o.maxHz})` : ''}${o.workerHz ? `, worker ${o.workerHz}` : ''}  budget ${f(o.budget)} ms`,
    st.n ? `${f(st.fps)} fps  1% low ${f(st.low1)}  frames ${st.n}` : 'idle: no frames (nothing moving)',
    st.n ? `interval p50 ${f(st.p50)}  p95 ${f(st.p95)}  p99 ${f(st.p99)}  max ${f(st.max)} ms` : '',
    st.n ? `script p50 ${f(st.s50)}  p95 ${f(st.s95)}  max ${f(st.smax)} ms${st.s95 > o.budget ? '  OVER' : ''}` : '',
    o.surfaces.length ? `per frame: ${o.surfaces.map(([k, ms]) => `${k} ${f(ms)}`).join(', ')}` : '',
    o.charts ? `charts: ${o.charts.resizes} buffer resizes, ${o.charts.transfers} pictures handed over (last second)` : '',
    `watchdog ${o.mode}, carried over ${o.shed}`,
    o.throttle ? `throttle: ${o.throttle}` : 'throttle: none seen',
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
  if (HUD_OFF(location.search)) return null;
  const gaps = [], scripts = [];
  let last = perf().totals, lastFrames = last.frames, workerHz = 0, idleAt = 0, lastCharts = { ...sharedStats };
  watchFrames((fr) => {
    if (fr.gap > 0) { gaps.push(fr.gap); if (gaps.length > KEEP) gaps.shift(); }
    scripts.push(fr.script); if (scripts.length > KEEP) scripts.shift();
  });
  const rates = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  workerClock((r) => { workerHz = rates.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a)); });
  const el = document.createElement('div');
  el.id = 'frameHud';
  el.setAttribute('data-perf-ignore', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;right:max(8px, env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));z-index:2147483001;max-width:min(420px, calc(100vw - 16px));padding:6px 8px;border-radius:8px;background:rgb(0 0 0 / .78);color:#fff;font:600 12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none;contain:content';   // colour-exempt: a measuring panel
  document.body.append(el);
  const apple = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const write = () => {
    const now = perf().totals, frames = now.frames - lastFrames;
    // (The last 2 s of frames, from the intervals and scripts kept; the surfaces' ms a frame from the totals' change since the last write.)
    const k = Math.min(gaps.length, Math.max(0, Math.round(frames * 2)) || gaps.length);
    const st = hudStats(gaps.slice(-k), scripts.slice(-k));
    if (!frames) { if (!idleAt) idleAt = performance.now(); st.n = 0; } else idleAt = 0;
    const surfaces = frames ? Object.keys(now.ms).map((t) => [t, (now.ms[t] - (last.ms[t] || 0)) / frames]).filter(([, ms]) => ms >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 6) : [];
    const w = watchdogStats(), hz = refreshHz(), maxHz = refreshMaxHz();
    el.textContent = hudText(st, { hz, maxHz, workerHz, budget: frameBudget(), surfaces, charts: { resizes: sharedStats.resizes - lastCharts.resizes, transfers: sharedStats.transfers - lastCharts.transfers }, mode: w.mode, shed: w.shed, throttle: throttleOf({ hz, maxHz, workerHz, apple, hidden: document.hidden }) });
    last = now; lastFrames = now.frames; lastCharts = { ...sharedStats };
  };
  const tick = () => { if (!document.hidden) restPass(write); setTimeout(tick, 1000); };
  setTimeout(tick, 1000);
  if (window.pps) window.pps.hud = () => el.textContent;
  return el;
}
