// Debug overlay: FPS and frame time, zoom, pixel ratio and build. Off by default; choices persist.
import { gpuProbe } from './gpu-probe.js?v=625c2c9315';
import { finalFrameFor, cancelFrame } from './frame.js?v=ae4d297959';
// (The overlay's loop goes through the app's one frame scheduler, last in each frame, never a requestAnimationFrame of its own.)
const nextFrame = finalFrameFor('debug');
const KEY = 'pps.debug';
const OPTS = [['fps', 'FPS and frame time'], ['zoom', 'Zoom level and scale'], ['res', 'Render resolution scale'], ['graph', 'Frame graph'], ['gpu', 'GPU time per step']];
let st = {};
// (A stored choice counts only where ?debug is in the address: the toggles live behind it, so one made on an earlier visit must not leave an
// overlay on every plain load with no way to turn it off but Reset everything.)
const asked = typeof location !== 'undefined' && /[?&]debug(?=[=&#]|$)/.test(location.search || '');
try { st = asked ? JSON.parse(localStorage.getItem(KEY) || '{}') || {} : {}; } catch { st = {}; }
let stamps = [], cv = null, hist = [], el = null, raf = 0, last = 0, fps = 0, ms = 0, getZoom = null;
// GPU time per step (gpu-probe.js): each frame's interval with the steps' times in it; the slowest in the last 10 s stays shown.
let frames = [], prevT = 0;
const WORST_MS = 10000, SLOW_MS = 50, GRAPH_N = 150;
const sumFrames = (fs) => { const parts = {}; for (const f of fs) for (const [k, v] of Object.entries(f.parts)) parts[k] = (parts[k] || 0) + v; return { dt: fs.reduce((a, f) => a + f.dt, 0), parts }; };
// (What the steps leave of the frame is the rest of the page: its other script, style, layout, painting and compositing.)
const stepsText = (f) => Object.entries({ ...f.parts, 'rest of page': Math.max(0, f.dt - Object.values(f.parts).reduce((a, b) => a + b, 0)) }).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ') || 'none';
const any = () => OPTS.some(([k]) => st[k]);
export const debugOptions = () => OPTS;
export const debugOn = (k) => !!st[k];
export function initDebug(zoomFn) { getZoom = zoomFn; sync(); }
export function setDebug(k, on) {
  st = { ...st, [k]: !!on };
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode */ }
  sync();
}
function sync() {
  gpuProbe.on = !!st.gpu;
  if (!st.gpu) { gpuProbe.take(); frames = []; prevT = 0; }
  if (!any()) { cancelFrame(raf); raf = 0; el?.remove(); el = null; return; }
  if (!el) {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:calc(64px + env(safe-area-inset-top));z-index:2147483000;pointer-events:none;padding:4px 8px;border-radius:8px;background:rgb(var(--black-rgb) / .65);color:var(--white);font:600 11px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));box-sizing:border-box';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  if (st.graph && !cv) {
    cv = document.createElement('div');
    cv.style.cssText = 'position:relative;width:240px;height:40px;margin-top:4px;overflow:hidden';
    cv.bars = []; cv.lines = [];
    for (let i = 0; i < GRAPH_N; i++) {
      const b = document.createElement('i');
      b.style.cssText = `position:absolute;left:${(i * 240 / GRAPH_N).toFixed(2)}px;bottom:1px;width:${(240 / GRAPH_N).toFixed(2)}px;height:38px;background:var(--debug-line);transform-origin:50% 100%;transform:scaleY(0)`;
      cv.bars.push(b); cv.append(b);
    }
    for (let i = 0; i < 3; i++) {
      const ln = document.createElement('i');
      ln.style.cssText = 'position:absolute;left:0;bottom:1px;width:240px;height:1px;background:rgb(var(--white-rgb) / .25)';
      cv.lines.push(ln); cv.append(ln);
    }
    el.append(cv);
  }
  if (!st.graph && cv) { cv.remove(); cv = null; }
  if (!raf && !document.hidden) { last = performance.now(); prevT = 0; stamps = []; raf = nextFrame(tick); }
}
// (Not in a hidden tab: the overlay's frame loop stops there and starts again when the page is shown.)
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (any()) sync(); });
function tick(t) {
  raf = document.hidden ? 0 : nextFrame(tick);
  stamps.push(t);
  while (stamps[0] < t - 1000) stamps.shift();
  if (st.gpu) {
    if (prevT) frames.push({ t, dt: t - prevT, parts: gpuProbe.take() });
    while (frames.length && frames[0].t < t - WORST_MS) frames.shift();
  }
  prevT = t;
  if (t - last < 100) return;
  last = t;
  fps = stamps.length > 1 ? ((stamps.length - 1) * 1000) / (t - stamps[0]) : 0; ms = fps ? 1000 / fps : 0;
  hist.push(fps); if (hist.length > GRAPH_N) hist.shift();
  const L = [];
  if (st.fps) L.push(`${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`);
  if (st.zoom) { let z = ''; try { z = getZoom ? Number(getZoom()).toFixed(2) : ''; } catch { /* no stage yet */ } L.push(`zoom ${z}×`); }
  if (st.gpu && frames.length) {
    const now = frames[frames.length - 1], worst = frames.reduce((a, b) => (b.dt > a.dt ? b : a));
    L.push(`frame ${now.dt.toFixed(0)} ms: ${stepsText(now)}`);
    L.push(`slowest in 10 s, ${worst.dt.toFixed(0)} ms: ${stepsText(worst)}`);
    // Every slow frame of the 10 s added up, step by step: where a lag that lasts goes, not only its worst moment.
    const slow = frames.filter((f) => f.dt > SLOW_MS);
    if (slow.length) L.push(`${slow.length} slow frames in 10 s, ${slow.reduce((a, f) => a + f.dt, 0).toFixed(0)} ms: ${stepsText(sumFrames(slow))}`);
  }
  if (st.res) L.push(`pixel ratio ${devicePixelRatio} · ${Math.round(innerWidth * devicePixelRatio)}×${Math.round(innerHeight * devicePixelRatio)}`);
  if (el) {
    let tn = el.firstChild;
    if (!tn || tn.nodeType !== 3) { tn = document.createTextNode(''); el.prepend(tn); }
    tn.nodeValue = L.join('\n');
  }
  if (cv) {
    // The frame graph as 150 bars and three lines moved by transforms only (no canvas drawn, no style read): each bar's scaleY is its
    // frame rate over the scale's top. (The scale tops at 120 once a frame rate over 60 has been seen in the window, so a ProMotion
    // screen's 120 shows as 120.)
    const top = hist.some((v) => v > 66) ? 120 : 60, off = GRAPH_N - hist.length;
    for (let i = 0; i < GRAPH_N; i++) {
      const v = i < off ? 0 : hist[i - off], k = (Math.min(v, top) / top).toFixed(3);
      if (cv.bars[i].k !== k) { cv.bars[i].k = k; cv.bars[i].style.transform = `scaleY(${k})`; }
    }
    [30, 60, 120].forEach((f, i) => { const ln = cv.lines[i], y = `translateY(${(-38 * Math.min(f, top) / top).toFixed(1)}px)`, o = f > top ? '0' : '1'; if (ln.y !== y) { ln.y = y; ln.style.transform = y; } if (ln.o !== o) { ln.o = o; ln.style.opacity = o; } });
  }
}
