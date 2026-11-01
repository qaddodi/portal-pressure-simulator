// Geometry without layout reads (1 Nov 2026, the owner's rule: no per-frame DOM layout or style reads; docs/gpu-practices.md).
// The browser already lays the page out once per frame. These hand that work's results to the page instead of asking for them
// again, so nothing here forces a layout:
//   sizeOf(el)        an element's border box { w, h }, kept by one shared ResizeObserver (null until its first report)
//   watchSize(el, f)  the same, and f(size, el) each time it changes (after the browser's layout, before paint)
//   rectSoon(el)      a Promise of the element's box on screen as the browser's next rendering step lays it out (transforms
//                     included, like getBoundingClientRect), by a one-shot IntersectionObserver: nothing is laid out for it
//   rectsSoon(els)    the same for several, in their order
//   restTask(f)       f once, in a task of its own after the current one (several asks before it runs make one call): where
//                     work that measures runs once a change has been laid out, never inside a frame or a motion callback
const sizes = new WeakMap(), subs = new WeakMap();
let ro = null;
function sizeObserver() {
  if (ro || typeof ResizeObserver === 'undefined') return ro;
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const b = e.borderBoxSize?.[0] || e.borderBoxSize;
      // (Old Safari reports only the content box: the padding and border are its own, read from the box the observer gives.)
      const s = b && b.inlineSize != null ? { w: b.inlineSize, h: b.blockSize } : { w: e.contentRect.width, h: e.contentRect.height };
      const was = sizes.get(e.target);
      sizes.set(e.target, s);
      if (!was || was.w !== s.w || was.h !== s.h) for (const f of subs.get(e.target) || []) f(s, e.target);
    }
  });
  return ro;
}
export function watchSize(el, f) {
  if (!el) return () => {};
  if (f) { if (!subs.has(el)) subs.set(el, new Set()); subs.get(el).add(f); }
  if (!sizes.has(el)) sizeObserver()?.observe(el, { box: 'border-box' });
  return () => subs.get(el)?.delete(f);
}
export function sizeOf(el) {
  if (!el) return null;
  if (!sizes.has(el)) { sizes.set(el, null); sizeObserver()?.observe(el, { box: 'border-box' }); }
  return sizes.get(el);
}
const waiting = new Map();   // element -> resolvers
let io = null;
function rectObserver() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const fs = waiting.get(e.target);
      if (!fs) continue;
      waiting.delete(e.target); io.unobserve(e.target);
      for (const f of fs) f(e.boundingClientRect);
    }
  });
  return io;
}
const EMPTY = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
export function rectSoon(el) {
  if (!el || !el.isConnected || !rectObserver()) return Promise.resolve(EMPTY);
  return new Promise((res) => {
    const fs = waiting.get(el);
    if (fs) { fs.push(res); return; }
    waiting.set(el, [res]);
    io.observe(el);
  });
}
export const rectsSoon = (els) => Promise.all([...els].map(rectSoon));
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
