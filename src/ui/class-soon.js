// Class and text writes made between frames, never in one.
//
// A class toggled or a label's words changed from a gesture's move, a timer or a frame callback made the page restyle inside the
// frame (docs/gpu-practices.md: no DOM writes in motion). Here the write is asked for and applied in a task of its own straight after, once, the last
// ask of a class (or of an element's words) winning, so a burst of asks is one write and an add then a remove ends removed.
//
//   classSoon(el, 'name', true | false)   the class is on / off after a task of its own, straight after
//   textSoon(el, 'words')                 the element's textContent after a task of its own, straight after
//
// A write that must land before the next frame paints (a class that holds a transition off while a transform is set) stays where it is.


const classes = new Map();   // element → Map(class → on)
const words = new Map();     // element → text
let pending = false;
const jobs = [];   // (whole functions asked for with runSoon)

function flush() {
  pending = false;
  const c = classes, w = words;
  if (c.size) for (const [el, m] of c) for (const [name, on] of m) el.classList.toggle(name, on);
  if (w.size) for (const [el, t] of w) if (el.textContent !== t) el.textContent = t;
  c.clear(); w.clear();
  for (const fn of jobs.splice(0)) { try { fn(); } catch (e) { setTimeout(() => { throw e; }); } }
}
// (A task of its own right after the current one, not a rest pass: the rest passes share the preparation budget and may wait
// for a quiet interval while something moves, which would land stage-busy or figure-focus late, after the move they were for.
// A class write costs next to nothing, so it takes no budget. The task runs before the next frame's callbacks, never inside one.)
let port = null;
const ask = () => {
  if (pending) return;
  pending = true;
  if (!port && typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(); ch.port1.onmessage = flush; ch.port1.unref?.(); port = ch.port2; }
  if (port) port.postMessage(0); else setTimeout(flush, 0);
};

/** Puts the class on (or takes it off) in the next rest pass; the last ask of an element's class wins. */
export function classSoon(el, name, on) {
  if (!el) return;
  let m = classes.get(el);
  if (!m) classes.set(el, (m = new Map()));
  m.set(name, !!on);
  ask();
}
/** Sets the element's words in the next rest pass; the last ask wins. */
export function textSoon(el, text) {
  if (!el) return;
  words.set(el, String(text));
  ask();
}
/** Runs fn in the same task as the queued class and text writes, straight after the current one (asked first, run in order). */
export function runSoon(fn) { jobs.push(fn); ask(); }
