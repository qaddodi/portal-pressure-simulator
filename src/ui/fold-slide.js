// Accordions that open and shut by transform: a drawer, never a height eased.
//
// An answer under its question (a slide's checklist), a tapped ⓘ's text under its slider, a menu row's preview under the row: each
// used to ease its row's height (grid-template-rows 0fr → 1fr), which lays the page out on every frame of the ease. Here the row takes
// its new height at once, and what shows moves on the compositor: opening, the text slides down out from under its row inside the
// row's clip while everything after it in `root` slides down by the same height; shutting, both slide up by it and the row closes once
// they have landed. The height is read once, at the tap (an event, never a frame). 1 Nov 2026, the owner: nothing laid out in motion.
//
//   slideFold({ item, inner, root, open, set, ms })
//     item   the element whose followers move (the row, or the list item holding it)
//     inner  what slides inside the clip (the text; its height is the distance)
//     root   the box whose content moves (followers are read up to it)
//     set    set(on): the class change that opens or shuts it (laid out at once)
//
// Reduced motion, or no Web Animations: set at once, as before with no ease.

import { EASE_ARRIVE } from './ease.js';
import { reduceMotionMQ } from './motion.js';

const runs = new WeakMap();
const reduced = () => typeof matchMedia === 'function' && reduceMotionMQ.matches;

/** The elements after `item` that its height pushes: its later siblings and its ancestors' later siblings, up to `root`. */
export function followers(item, root) {
  const out = [];
  for (let n = item; n && n !== root; n = n.parentElement) for (let s = n.nextElementSibling; s; s = s.nextElementSibling) out.push(s);
  return out;
}

export function slideFold({ item, inner, root, open, set, ms }) {
  const was = runs.get(item);
  if (was) { runs.delete(item); for (const a of was.anims) a.cancel(); if (was.closing) set(false); }
  if (reduced() || !inner?.animate) { set(open); return; }
  if (open) set(true);
  const H = inner.offsetHeight;   // (once, at the tap)
  if (!H) { if (!open) set(false); return; }
  const up = { transform: `translateY(${-H}px)`, opacity: 0 }, rest = { transform: 'none', opacity: 1 };
  const o = { duration: ms, easing: EASE_ARRIVE, fill: open ? 'none' : 'forwards' };
  const anims = [inner.animate(open ? [up, rest] : [rest, up], o)];
  for (const f of followers(item, root)) anims.push(f.animate(open ? [{ transform: `translateY(${-H}px)` }, { transform: 'none' }] : [{ transform: 'none' }, { transform: `translateY(${-H}px)` }], { ...o, composite: 'add' }));
  const run = { anims, closing: !open };
  runs.set(item, run);
  anims[0].onfinish = () => {
    if (runs.get(item) !== run) return;
    runs.delete(item);
    if (!open) set(false);
    for (const a of anims) a.cancel();
  };
}
