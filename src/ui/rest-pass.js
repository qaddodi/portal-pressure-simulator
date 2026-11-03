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

import { PREP_BUDGET, prepLeft, prepSpend, prepWindowLeft, STARVE_MS, frameMs } from './prep-budget.js';

let q = new Map(), next = 1, posted = false, port = null;
// One deadline for all of it (2 Nov 2026, audit R03: a drain ran every queued pass in one task, so a burst of card fits, chart
// lettering and glyph work as a slide's cards landed made one long task in the middle of the motion). A drain now runs passes until
// REST_SLICE ms have gone (and stops sooner when the person's input is waiting, where the browser tells: isInputPending), then hands the
// rest to a task of its own after the browser has had its turn (a zero timer: a frame can come between). The order asked for is kept,
// each pass still runs once, and a pass cancelled before its turn never runs. restStats() counts slices, passes carried and the oldest
// wait.
export const REST_SLICE = 6;
const asked = new Map();   // (id → when it was asked, for the wait)
const stats = { drains: 0, sliced: 0, carried: 0, maxWait: 0, maxDrain: 0, waited: 0 };
/** The rest passes' counts since the page opened: drains, drains cut short, passes carried to a later task, the longest wait and drain (ms). */
export const restStats = () => ({ ...stats });
let carry = null, passMean = 0;   // (passes left from a drain cut short: they go first, before anything asked since)
const inputWaiting = () => { try { return !!globalThis.navigator?.scheduling?.isInputPending?.(); } catch { return false; } };
// (Review pass 2, priority 1: the slice is also held to the shared preparation budget, prep-budget.js: rest passes, slide preparation
// and the other between-frame work together spend at most what one frame interval leaves (less while something moves). A drain that
// finds the interval spent waits for the next one, unless its oldest pass has waited STARVE_MS: then one pass runs whatever the ledger
// says, so none starves. What a drain spends is charged to the ledger. ?prepbudget=0: the 6 ms slice alone, as before.)
const oldestWait = (t) => { let w = 0; for (const a of asked.values()) { w = Math.max(w, t - a); break; } return w; };
function drain() {
  posted = false;
  const t0 = performance.now();
  const shared = PREP_BUDGET;
  // (recs-production-120hz §15: the slice is at most half the target frame (4.2 ms at 120 Hz), and a pass is not started when the
  // passes' mean cost would carry the drain past it: a callback cannot be stopped once it runs, so it is judged before.)
  let slice = Math.min(REST_SLICE, frameMs() / 2);
  if (shared) {
    const left = prepLeft(t0);
    if (left <= 0 && oldestWait(t0) < STARVE_MS) { stats.waited = (stats.waited || 0) + 1; posted = true; setTimeout(drain, Math.max(1, prepWindowLeft(t0))); return; }
    slice = Math.min(REST_SLICE, Math.max(0, left));
  }
  const now = carry || new Map();
  for (const [id, fn] of q) now.set(id, fn);
  carry = null;
  q = new Map();   // (asked for while these run: the next pass)
  stats.drains++;
  for (const [id, fn] of now) {
    now.delete(id);
    const at = asked.get(id); asked.delete(id);
    if (at != null) stats.maxWait = Math.max(stats.maxWait, t0 - at);
    const p0 = performance.now();
    try { fn(); } catch (e) { setTimeout(() => { throw e; }); }
    const t1 = performance.now();
    passMean += (t1 - p0 - passMean) * 0.1;
    if (now.size && (t1 - t0 > slice || t1 - t0 + passMean > slice || inputWaiting())) {
      carry = now; stats.sliced++; stats.carried += now.size;
      setTimeout(drain, 0);
      posted = true;
      break;
    }
  }
  const ms = performance.now() - t0;
  if (shared) prepSpend(ms);
  stats.maxDrain = Math.max(stats.maxDrain, ms);
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
  q.set(id, fn);
  if (asked.size < 4096) asked.set(id, performance.now());
  post();
  return id;
}
/** Cancels a rest pass not yet run (0 and spent ids are ignored). */
export function cancelRest(id) {
  if (!id) return;
  if (!q.delete(id)) carry?.delete(id);
  asked.delete(id);
}

// A class on or off from a per-frame paint (a ring's "off", a layer's "live"): the class changes only when the answer changes, and the
// write is made between frames, so a tick that repeats the same answer for sixty frames writes nothing. The wanted state is kept on the
// element (restClass_ → {name: on}); the first call always writes, as the element's state is not known yet. Only for a class this
// helper alone sets on that element.
const classWant = new WeakMap();
let classQ = [], classAsk = 0;
function classFlush() {
  classAsk = 0;
  const list = classQ; classQ = [];
  for (let i = 0; i < list.length; i += 3) if (list[i].isConnected !== undefined) list[i].classList.toggle(list[i + 1], list[i + 2]);
}
/** Sets class `name` on `el` to `on` between frames; nothing is queued while the wanted state is unchanged. */
export function restClass(el, name, on) {
  on = !!on;
  let m = classWant.get(el);
  if (!m) classWant.set(el, m = Object.create(null));
  if (m[name] === on) return;
  m[name] = on;
  classQ.push(el, name, on);
  if (!classAsk) classAsk = restPass(classFlush);
}

// Attributes that only describe the page to a screen reader or tag it for the next lookup (aria-label, aria-hidden, data-*): nothing
// on screen depends on them, so a frame never writes them. They are asked for here and written once, between frames, last value
// wins (2 Nov 2026, "Remove attribute writes in lobule and sinusoid").
const attrQ = new Map(), goneQ = new Set(), attrPool = [];   // (element → { name → value; null removes it })
let attrId = 0;
function flushAttrs() {
  attrId = 0;
  const m = attrQ;
  for (const el of goneQ) el.remove();   // (taken out of the page)
  goneQ.clear();
  for (const [el, names] of m) {
    attrQ.delete(el);
    for (const [k, v] of names) {
      if (v == null) el.removeAttribute?.(k);
      else el.setAttribute(k, v);
    }
    names.clear(); attrPool.push(names);   // (kept for the next element asked about: a glide's frames ask for the same few, so no Map is made per frame)
  }
}
/** Writes every attribute asked for through restAttr now (a pass about to measure the page that depends on them calls this first). */
export function flushRestAttrs() { if (attrId) { cancelRest(attrId); flushAttrs(); } }
/** Sets (or, with null, removes) an attribute between frames: the last value asked for before the pass runs is the one written. */
export function restAttr(el, name, value) {
  let names = attrQ.get(el);
  if (!names) attrQ.set(el, names = attrPool.pop() || new Map());   // alloc-rare: a Map made only while the pool is empty (the first few asks of a page's life)
  names.set(name, value);
  if (!attrId) attrId = restPass(flushAttrs);
}
/** Takes a node out of the page between frames (an element nothing shows any more: a spent canvas, a faded-out name). */
export function restRemove(el) {
  goneQ.add(el);
  if (!attrId) attrId = restPass(flushAttrs);
}
