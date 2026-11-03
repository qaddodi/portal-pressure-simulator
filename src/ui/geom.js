// Geometry without layout reads (1 Nov 2026, the owner's rule: no per-frame DOM layout or style reads; docs/gpu-practices.md).
// The browser already lays the page out once per frame. These hand that work's results to the page instead of asking for them
// again, so nothing here forces a layout:
//   sizeOf(el)        an element's border box { w, h }, kept by one shared ResizeObserver (null until its first report)
//   watchSize(el, f)  the same, and f(size, el) each time it changes (after the browser's layout, before paint)
//   rectSoon(el)      a Promise of the element's box on screen as the browser's next rendering step lays it out (transforms
//                     included, like getBoundingClientRect), by a one-shot IntersectionObserver: nothing is laid out for it
//   rectsSoon(els)    the same for several, in their order
//   rectInto(el, f)   f(box) once, as rectSoon's Promise would answer, with no Promise: f is the caller's own kept function (asking
//                     from a frame or a scroll or motion handler makes nothing)
//   restTask(f)       f once, in a task of its own after the current one (several asks before it runs make one call): where
//                     work that measures runs once a change has been laid out, never inside a frame or a motion callback
const sizes = new WeakMap(), subs = new WeakMap();
const BORDER_BOX = { box: 'border-box' }, NOOP = () => {};   // (the observer keeps neither)
let ro = null;
function sizeObserver() {
  if (ro || typeof ResizeObserver === 'undefined') return ro;
  ro = new ResizeObserver(onSizes);   // alloc-rare: the one observer, made when the first element is watched
  return ro;
}
function onSizes(entries) {
  for (const e of entries) {
    const b = e.borderBoxSize?.[0] || e.borderBoxSize;
    // (Old Safari reports only the content box: the padding and border are its own, read from the box the observer gives.)
    // (A new record for each report: a caller keeps the one it was given (main.js, the dock's glide: the size before a change).)
    const s = b && b.inlineSize != null ? { w: b.inlineSize, h: b.blockSize } : { w: e.contentRect.width, h: e.contentRect.height };   // alloc-rare: only when an element's size is reported, which the browser does when it changed
    const was = sizes.get(e.target);
    sizes.set(e.target, s);
    if (!was || was.w !== s.w || was.h !== s.h) { const fs = subs.get(e.target); if (fs) for (const f of fs) f(s, e.target); }
  }
}
export function watchSize(el, f) {
  if (!el) return NOOP;
  if (f) { if (!subs.has(el)) subs.set(el, new Set()); subs.get(el).add(f); }   // alloc-rare: once per element, when it is first watched (callers watch behind a flag)
  if (!sizes.has(el)) sizeObserver()?.observe(el, BORDER_BOX);
  return () => subs.get(el)?.delete(f);   // alloc-rare: once per element, with the watch
}
export function sizeOf(el) {
  if (!el) return null;
  if (!sizes.has(el)) { sizes.set(el, null); sizeObserver()?.observe(el, BORDER_BOX); }
  return sizes.get(el);
}
const waiting = new Map();   // element -> the functions waiting for its box (a list taken from `lists`)
const lists = [];            // lists no element waits on: reused, so asking for a box makes none
let io = null;
function rectObserver() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver(onRects);   // alloc-rare: the one observer, made at the first ask
  return io;
}
function onRects(entries) {
  for (const e of entries) {
    const fs = waiting.get(e.target);
    if (!fs) continue;
    waiting.delete(e.target); io.unobserve(e.target);
    // (The list goes back to the pool before its functions run: one that asks again gets a list of its own.)
    const n = fs.length;
    for (let i = 0; i < n; i++) { const f = fs[i]; fs[i] = null; f(e.boundingClientRect); }
    fs.length = 0; lists.push(fs);
  }
}
const EMPTY = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
/** f(box) once, when the browser's next rendering step has laid `el` out (a box of zeros for an element not on the page, at once). */
export function rectInto(el, f) {
  if (!el || !el.isConnected || !rectObserver()) { f(EMPTY); return; }
  const fs = waiting.get(el);
  if (fs) { fs.push(f); return; }
  const list = lists.pop() || [];   // alloc-rare: only while the pool is empty (it holds every list given back)
  list.push(f);
  waiting.set(el, list);
  io.observe(el);
}
export function rectSoon(el) {
  if (!el || !el.isConnected || !rectObserver()) return Promise.resolve(EMPTY);
  return new Promise((res) => rectInto(el, res));
}
export const rectsSoon = (els) => Promise.all([...els].map(rectSoon));   // alloc-rare: one ask per menu opening (a user action)
const tasks = new Map();
export function restTask(f) {
  if (tasks.has(f)) return;
  tasks.set(f, setTimeout(() => { tasks.delete(f); f(); }, 0));
}
// (Runs it now if it is waiting: a caller that needs what it publishes before it goes on.)
export function flushTask(f) {
  if (!tasks.has(f)) return false;
  clearTimeout(tasks.get(f)); tasks.delete(f); f();
  return true;
}
