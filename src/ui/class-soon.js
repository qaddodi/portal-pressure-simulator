// Class and text writes made between frames, never in one (rest-pass.js).
//
// A class toggled or a label's words changed from a gesture's move, a timer or a frame callback made the page restyle inside the
// frame (docs/gpu-practices.md: no DOM writes in motion). Here the write is asked for and applied in the next rest pass, once, the last
// ask of a class (or of an element's words) winning, so a burst of asks is one write and an add then a remove ends removed.
//
//   classSoon(el, 'name', true | false)   the class is on / off after the next rest pass
//   textSoon(el, 'words')                 the element's textContent after the next rest pass
//
// A write that must land before the next frame paints (a class that holds a transition off while a transform is set) stays where it is.

import { restPass } from './rest-pass.js?v=75e0aa565d';

const classes = new Map();   // element → Map(class → on)
const words = new Map();     // element → text
let pending = false;

function flush() {
  pending = false;
  const c = classes, w = words;
  if (c.size) for (const [el, m] of c) for (const [name, on] of m) el.classList.toggle(name, on);
  if (w.size) for (const [el, t] of w) if (el.textContent !== t) el.textContent = t;
  c.clear(); w.clear();
}
const ask = () => { if (!pending) { pending = true; restPass(flush); } };

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
