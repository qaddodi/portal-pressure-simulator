// Class and text writes made between frames, never in one.
//
// A class toggled or a label's words changed from a gesture's move, a timer or a frame callback made the page restyle inside the
// frame (docs/gpu-practices.md: no DOM writes in motion). Here the write is asked for and applied in a task of its own straight after, once, the last
// ask of a class (or of an element's words) winning, so a burst of asks is one write and an add then a remove ends removed.
//
//   classSoon(el, 'name', true | false)   the class is on / off after a task of its own, straight after
//   textSoon(el, 'words')                 the element's textContent after a task of its own, straight after
//   attrSoon(el, 'name', value | null)    an attribute set (null: taken off) after the next rest pass
//   dataSoon(el, 'key', value | null)     a data- key set (null: deleted) after the next rest pass
//   propSoon(el, 'hidden', value)         a property (hidden, disabled, nodeValue, value) set after the next rest pass
//   removeSoon(el)                        the element taken out of the page after the next rest pass
//
// A write that must land before the next frame paints (a class that holds a transition off while a transform is set) stays where it is.


import { frameFor } from './frame.js';

const nextFrame = frameFor('classsoon');
const classes = new Map();   // element → Map(class → on)
const words = new Map();     // element → text
const attrs = new Map();     // element → Map(attribute → value | null)
const datas = new Map();     // element → Map(key → value | null)
const props = new Map();     // element → Map(property → value)
const gone = new Set();      // elements to take out
let pending = false;
const jobs = [];   // (whole functions asked for with runSoon)
// The per-element maps (class → on, attribute → value, …) are taken from here when an element is first asked about and given back
// when the asks are written, so a steady stream of asks makes none.
const mapPool = [];
for (let i = 0; i < 64; i++) mapPool.push(new Map());
const takeMap = () => mapPool.pop() || new Map();   // alloc-rare: pool growth, only while more elements are asked at once than the pool holds (a new one only while the pool is still filling)
const giveBack = (outer) => { for (const m of outer.values()) { m.clear(); mapPool.push(m); } };

function flush() {
  pending = false;
  const c = classes, w = words;
  if (c.size) for (const [el, m] of c) for (const [name, on] of m) el.classList.toggle(name, on);
  if (w.size) for (const [el, t] of w) { const text = String(t); if (el.textContent !== text) el.textContent = text; }   // (the words as asked for: String() of a number is its text)
  giveBack(c); c.clear(); w.clear();
  for (const [el, m] of attrs) for (const [k, v] of m) { if (v == null) el.removeAttribute(k); else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v); }
  for (const [el, m] of datas) for (const [k, v] of m) { if (v == null) delete el.dataset[k]; else if (el.dataset[k] !== String(v)) el.dataset[k] = v; }
  for (const [el, m] of props) for (const [k, v] of m) if (el[k] !== v) el[k] = v;
  for (const el of gone) el.remove();
  giveBack(attrs); giveBack(datas); giveBack(props);
  attrs.clear(); datas.clear(); props.clear(); gone.clear();
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
  if (!m) classes.set(el, (m = takeMap()));
  m.set(name, !!on);
  ask();
}
/** Sets the element's words in the next rest pass; the last ask wins. */
export function textSoon(el, text) {
  if (!el) return;
  words.set(el, text);
  ask();
}
/** Runs fn in the same task as the queued class and text writes, straight after the current one (asked first, run in order). */
export function runSoon(fn) { jobs.push(fn); ask(); }

/** The class as it will stand after the next rest pass: the ask waiting, else what the element carries. Reads of a flag written here use this, never a stale answer. */
export function classHas(el, name) {
  const v = classes.get(el)?.get(name);
  return v === undefined ? el.classList.contains(name) : v;
}
const restartEls = [], restartNames = [];
/** The class off now and on again a frame later, so a CSS fade restarts from nothing (no layout read to force it). */
export function restartSoon(el, name) {
  classSoon(el, name, false);
  restartEls.push(el); restartNames.push(name);
  if (restartEls.length === 1) nextFrame(restartOn);
}
function restartOn() { for (let i = 0; i < restartEls.length; i++) classSoon(restartEls[i], restartNames[i], true); restartEls.length = restartNames.length = 0; }
// (An ask that leaves the value as it stands, with none pending, costs one read and no rest pass: a per-frame loop may ask every frame.)
const into = (map, read, el, k, v) => {
  const m = map.get(el);
  const cur = m && m.has(k) ? m.get(k) : read(el, k);
  if (cur === v) return;
  if (m) m.set(k, v); else { const fresh = takeMap(); fresh.set(k, v); map.set(el, fresh); }
  ask();
};
// (A string is its own text; any other value's text is made here, which is the one place that makes one.)
const asText = (v) => (typeof v === 'string' ? v : String(v));   // alloc-rare: only a value that is not already a string; every caller in the app (attrSoon, dataSoon) passes a string or null, so the text is never made here
const readAttr = (el, k) => el.getAttribute(k), readData = (el, k) => el.dataset[k] ?? null, readProp = (el, k) => el[k];
/** Sets the attribute (null: removes it) in the next rest pass; the last ask wins. */
export function attrSoon(el, name, value) { if (el) into(attrs, readAttr, el, name, value == null ? null : asText(value)); }
/** Sets the data- key (null: deletes it) in the next rest pass; the last ask wins. */
export function dataSoon(el, key, value) { if (el) into(datas, readData, el, key, value == null ? null : asText(value)); }
/** Sets the property (hidden, disabled, nodeValue, value) in the next rest pass; the last ask wins. */
export function propSoon(el, prop, value) { if (el) into(props, readProp, el, prop, value); }
/** Takes the element out of the page in the next rest pass. */
export function removeSoon(el) { if (el) { gone.add(el); ask(); } }

/** Writes the class now (a change at a boundary that must show at once) and drops any ask waiting for that class. */
export function classNow(el, name, on) {
  classes.get(el)?.delete(name);
  if (el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
}
