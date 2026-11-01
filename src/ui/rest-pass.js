// Rest passes: layout measured where nothing moves, outside the render loop.
//
// A card fit, a chart's lettering, the figure's insets: work that reads the page's layout once, when a size or the content
// changed (a ResizeObserver, fonts arriving, a card back from its zoom). It used to wait for the next frame of the scheduler
// (frame.js), so it ran inside the render loop with the GPU passes. Here it runs as a task of its own between two frames (a
// MessageChannel message: no 4 ms timer clamp, before the next frame's callbacks), so the loop's frames do only GPU work and
// transforms (docs/gpu-practices.md: no layout reads in a frame). The passes asked for before it runs run together, in the
// order asked, once each. The owner's rule (1 Nov 2026): no per-frame DOM layout reads; reads happen at rest boundaries.
//
//   const id = restPass(fn)   fn runs once, between frames
//   cancelRest(id)
//
// ?restpass=0 runs each on a plain zero timer of its own instead (no shared message port), still never inside a frame.

export const REST_PASS = !(typeof location !== 'undefined' && /[?&]restpass=0\b/.test(location.search || ''));

let q = new Map(), next = 1, posted = false, port = null;
const timers = new Map();
function drain() {
  posted = false;
  const now = q;
  q = new Map();   // (asked for while these run: the next pass)
  for (const fn of now.values()) try { fn(); } catch (e) { setTimeout(() => { throw e; }); }
}
function post() {
  if (posted) return;
  posted = true;
  if (!port && typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(); ch.port1.onmessage = drain; ch.port1.unref?.(); port = ch.port2; }   // (unref: Node, the tests; no such call in a browser)
  if (port) port.postMessage(0); else setTimeout(drain, 0);
}

/** Runs fn once, as a task between two frames (never inside one); returns an id for cancelRest (never 0). */
export function restPass(fn) {
  const id = next++;
  if (!REST_PASS) { timers.set(id, setTimeout(() => { timers.delete(id); fn(); }, 0)); return id; }
  q.set(id, fn);
  post();
  return id;
}
/** Cancels a rest pass not yet run (0 and spent ids are ignored). */
export function cancelRest(id) {
  if (!id) return;
  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); } else q.delete(id);
}
