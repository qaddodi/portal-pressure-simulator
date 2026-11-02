// Class changes made from a frame or a motion handler, applied between frames.
//
// A frame path that toggles a class writes the page's DOM there. Here the wanted state is kept in a Map, and the classes are
// written once, only where one differs from what the element has, in a rest pass (rest-pass.js: a task of its own before the
// next frame). hasClass() answers with the wanted state, so a caller that asks straight after setClass() sees what it set.
//
//   setClass(el, 'on', true)   wants the class on (false: off)
//   hasClass(el, 'on')         the wanted state if one is waiting, else the element's
import { restPass } from './rest-pass.js?v=b1da783ead';

const want = new Map();   // el -> Map(name -> boolean)
let ask = 0;

function apply() {
  ask = 0;
  const now = [...want];
  want.clear();
  for (const [el, names] of now) for (const [name, on] of names) if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

export function setClass(el, name, on) {
  if (!el) return;
  on = !!on;
  let m = want.get(el);
  if (!m) { if (el.classList.contains(name) === on) return; want.set(el, m = new Map()); }
  m.set(name, on);
  if (!ask) ask = restPass(apply);
}

export function hasClass(el, name) {
  const w = want.get(el)?.get(name);
  return w === undefined ? el.classList.contains(name) : w;
}
