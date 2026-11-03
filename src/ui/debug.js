// Debug overlay: FPS and frame time, zoom, pixel ratio and build. Off by default; choices persist.
import { gpuProbe } from './gpu-probe.js';

import { propSoon } from './class-soon.js';
import { finalFrameFor, cancelFrame } from './frame.js';
import { caught } from './caught.js';
// (The overlay's loop goes through the app's one frame scheduler, last in each frame, never a requestAnimationFrame of its own.)
const nextFrame = finalFrameFor('debug');
const KEY = 'pps.debug';
const OPTS = [['fps', 'FPS and frame time'], ['zoom', 'Zoom level and scale'], ['res', 'Render resolution scale'], ['graph', 'Frame graph'], ['gpu', 'GPU time per step']];
let st = {};
let stamps = [], cv = null, hist = [], el = null, raf = 0, last = 0, fps = 0, ms = 0, getZoom = null;
// GPU time per step (gpu-probe.js): each frame's interval with the steps' times in it; the slowest in the last 10 s stays shown.
// The frames are three lists kept side by side (the time, the interval, the steps' times), oldest first; written in place.
const FT = [], FD = [], FP = [];
let prevT = 0;
const WORST_MS = 10000, SLOW_MS = 50, GRAPH_N = 150;
const LINES = [];                       // (the overlay's lines of text, one redraw's)
const GRAPH_LINES = [30, 60, 120];      // (the graph's three guide lines, in frames a second)
// The steps of one frame (or of the slow frames added up), as names and times in these two lists, KN of them; stepsText turns them into the line.
const KS = [], VS = [], SUMS = new Map();
let KN = 0, SLOW_DT = 0;
function loadSteps(parts) { KN = 0; for (const k in parts) { KS[KN] = k; VS[KN] = parts[k]; KN++; } }
// (Every frame slower than SLOW_MS added up, step by step; returns the number of them and their total time.)
function loadSlow() {
  SUMS.clear();
  let n = 0, dt = 0;
  for (let i = 0; i < FT.length; i++) {
    if (!(FD[i] > SLOW_MS)) continue;
    n++; dt += FD[i];
    const parts = FP[i];
    for (const k in parts) SUMS.set(k, (SUMS.get(k) || 0) + parts[k]);
  }
  KN = 0;
  for (const k of SUMS.keys()) { KS[KN] = k; VS[KN] = SUMS.get(k); KN++; }
  SLOW_DT = dt;
  return n;
}
// (What the steps leave of the frame is the rest of the page: its other script, style, layout, painting and compositing.)
function stepsText(dt) {
  let sum = 0;
  for (let i = 0; i < KN; i++) sum += VS[i];
  KS[KN] = 'rest of page'; VS[KN] = Math.max(0, dt - sum); KN++;
  let n = 0;
  for (let i = 0; i < KN; i++) if (VS[i] >= 0.05) { KS[n] = KS[i]; VS[n] = VS[i]; n++; }
  // Slowest first (those equal keep their order).
  for (let i = 1; i < n; i++) {
    const k = KS[i], v = VS[i];
    let j = i - 1;
    while (j >= 0 && VS[j] < v) { KS[j + 1] = KS[j]; VS[j + 1] = VS[j]; j--; }
    KS[j + 1] = k; VS[j + 1] = v;
  }
  let text = '';
  // alloc-rare: the overlay's steps line: built at most 10 times a second, only while the GPU-time option is on
  for (let i = 0; i < n; i++) text += `${i ? ' · ' : ''}${KS[i]} ${VS[i].toFixed(1)}`;
  return text || 'none';
}
const any = () => OPTS.some(([k]) => st[k]);
export const debugOptions = () => OPTS;
export const debugOn = (k) => !!st[k];
export function initDebug(zoomFn) { getZoom = zoomFn; sync(); }
export function setDebug(k, on) {
  st = { ...st, [k]: !!on };
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { caught('debug:28', e); /* private mode */ }
  sync();
}
function sync() {
  gpuProbe.on = !!st.gpu;
  if (!st.gpu) { gpuProbe.take(); FT.length = FD.length = FP.length = 0; prevT = 0; }
  if (!any()) { cancelFrame(raf); raf = 0; el?.remove(); el = null; return; }
  if (!el) {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:calc(64px + env(safe-area-inset-top));z-index:var(--z-diag);pointer-events:none;padding:4px 8px;border-radius:8px;background:rgb(var(--black-rgb) / .65);color:var(--white);font:600 11px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));box-sizing:border-box';
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
    if (prevT) { FT.push(t); FD.push(t - prevT); FP.push(gpuProbe.take()); }
    while (FT.length && FT[0] < t - WORST_MS) { FT.shift(); FD.shift(); FP.shift(); }
  }
  prevT = t;
  if (t - last < 100) return;
  last = t;
  fps = stamps.length > 1 ? ((stamps.length - 1) * 1000) / (t - stamps[0]) : 0; ms = fps ? 1000 / fps : 0;
  hist.push(fps); if (hist.length > GRAPH_N) hist.shift();
  let nl = 0;
  // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
  if (st.fps) LINES[nl++] = `${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`;
  // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
  if (st.zoom) { let z = ''; try { z = getZoom ? Number(getZoom()).toFixed(2) : ''; } catch (e) { caught('debug:77', e); /* no stage yet */ } LINES[nl++] = `zoom ${z}×`; }
  if (st.gpu && FT.length) {
    const now = FT.length - 1;
    let worst = 0;
    for (let i = 1; i < FT.length; i++) if (FD[i] > FD[worst]) worst = i;
    loadSteps(FP[now]);
    // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
    LINES[nl++] = `frame ${FD[now].toFixed(0)} ms: ${stepsText(FD[now])}`;
    loadSteps(FP[worst]);
    // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
    LINES[nl++] = `slowest in 10 s, ${FD[worst].toFixed(0)} ms: ${stepsText(FD[worst])}`;
    // Every slow frame of the 10 s added up, step by step: where a lag that lasts goes, not only its worst moment.
    const slow = loadSlow();
    // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
    if (slow) LINES[nl++] = `${slow} slow frames in 10 s, ${SLOW_DT.toFixed(0)} ms: ${stepsText(SLOW_DT)}`;
  }
  // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
  if (st.res) LINES[nl++] = `pixel ratio ${devicePixelRatio} · ${Math.round(innerWidth * devicePixelRatio)}×${Math.round(innerHeight * devicePixelRatio)}`;
  if (el) {
    let tn = el.firstChild;
    if (!tn || tn.nodeType !== 3) { tn = document.createTextNode(''); el.prepend(tn); }
    let text = '';
    // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
    for (let i = 0; i < nl; i++) text += `${i ? '\n' : ''}${LINES[i]}`;
    propSoon(tn, 'nodeValue', text);   // (between frames: a text write is a style and layout pass)
  }
  if (cv) {
    // The frame graph as 150 bars and three lines moved by transforms only (no canvas drawn, no style read): each bar's scaleY is its
    // frame rate over the scale's top. (The scale tops at 120 once a frame rate over 60 has been seen in the window, so a ProMotion
    // screen's 120 shows as 120.)
    let fast = false;
    for (let i = 0; i < hist.length && !fast; i++) fast = hist[i] > 66;
    const top = fast ? 120 : 60, off = GRAPH_N - hist.length;
    for (let i = 0; i < GRAPH_N; i++) {
      // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
      const v = i < off ? 0 : hist[i - off], k = (Math.min(v, top) / top).toFixed(3);
      // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
      if (cv.bars[i].k !== k) { cv.bars[i].k = k; cv.bars[i].style.transform = `scaleY(${k})`; }
    }
    // alloc-rare: the overlay's text and bar values: built at most 10 times a second (the 100 ms gate above), only while an overlay option is on; never in a default run
    for (let i = 0; i < 3; i++) { const f = GRAPH_LINES[i], ln = cv.lines[i], y = `translateY(${(-38 * Math.min(f, top) / top).toFixed(1)}px)`, o = f > top ? '0' : '1'; if (ln.y !== y) { ln.y = y; ln.style.transform = y; } if (ln.o !== o) { ln.o = o; ln.style.opacity = o; } }
  }
}
