// Live style values of the figure's hidden SVG model, held in script while the GPU draws and the page's styles are written once the
// figure rests (stage.js setG). The GPU painters (organ-paint.js) read an element's opacity from its inline style as they paint; while
// a write is held they read it from here instead, so a frame of the change between the views writes nothing to the page for them.
const live = new WeakMap();

/** Holds `v` as `el`'s `prop` (as the style names it: 'opacity'). */
export function setLive(el, prop, v) {
  let m = live.get(el);
  if (!m) live.set(el, (m = {}));   // alloc-rare: once per element, the first time a style is held for it (then written in place)
  m[prop] = v;
}
/** The held value of `el`'s `prop`, or undefined when the page's own is current. */
export function getLive(el, prop) {
  const m = live.get(el);
  return m ? m[prop] : undefined;
}
/** The page has `el`'s `prop` written: the held value goes. */
export function dropLive(el, prop) {
  const m = live.get(el);
  if (m) delete m[prop];
}
