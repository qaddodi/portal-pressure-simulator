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
// One deadline for all of it (2 Nov 2026, audit R03: a drain ran every queued pass in one task, so a burst of card fits, chart
// lettering and glyph work as a slide's cards landed made one long task in the middle of the motion). A drain now runs passes until
// REST_SLICE ms have gone (and stops sooner when the person's input is waiting, where the browser tells: isInputPending), then hands the
// rest to a task of its own after the browser has had its turn (a zero timer: a frame can come between). The order asked for is kept,
// each pass still runs once, and a pass cancelled before its turn never runs. restStats() counts slices, passes carried and the oldest
// wait. ?restslice=0: every pass in one drain, as before.
const SLICE_ON = !(typeof location !== 'undefined' && /[?&]restslice=0\b/.test(location.search || ''));
export const REST_SLICE = 6;
const asked = new Map();   // (id → when it was asked, for the wait)
const stats = { drains: 0, sliced: 0, carried: 0, maxWait: 0, maxDrain: 0 };
/** The rest passes' counts since the page opened: drains, drains cut short, passes carried to a later task, the longest wait and drain (ms). */
export const restStats = () => ({ ...stats });
let carry = null;   // (passes left from a drain cut short: they go first, before anything asked since)
const inputWaiting = () => { try { return !!globalThis.navigator?.scheduling?.isInputPending?.(); } catch { return false; } };
function drain() {
  posted = false;
  const now = carry || new Map();
  for (const [id, fn] of q) now.set(id, fn);
  carry = null;
  q = new Map();   // (asked for while these run: the next pass)
  const t0 = performance.now();
  stats.drains++;
  for (const [id, fn] of now) {
    now.delete(id);
    const at = asked.get(id); asked.delete(id);
    if (at != null) stats.maxWait = Math.max(stats.maxWait, t0 - at);
    try { fn(); } catch (e) { setTimeout(() => { throw e; }); }
    if (SLICE_ON && now.size && (performance.now() - t0 > REST_SLICE || inputWaiting())) {
      carry = now; stats.sliced++; stats.carried += now.size;
      setTimeout(drain, 0);
      posted = true;
      break;
    }
  }
  stats.maxDrain = Math.max(stats.maxDrain, performance.now() - t0);
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
  if (asked.size < 4096) asked.set(id, performance.now());
  post();
  return id;
}
/** Cancels a rest pass not yet run (0 and spent ids are ignored). */
export function cancelRest(id) {
  if (!id) return;
  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); } else if (!q.delete(id)) carry?.delete(id);
  asked.delete(id);
}
