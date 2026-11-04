// A bottom sheet that moves without laying anything out per frame (the phone's Details, Treat and Tests sheets, main.js sheetBehaviour).
//
// The sheet's own box stands still: it is laid out once at the height a gesture needs (the taller of where it is and where it may
// go) and committed once at rest. What moves is its content, every child, and a plate (.sheet-plate, its first child) that wears
// the sheet's paper and shadow: each rides `translate` only, all on the same value, so the card is one piece. Over the thumb dock
// the sheet's still clip (app.css, its cut at the resting foot) hides what slides below the tab row's top line; sideways it slides
// past the screen's edge. A pull, a settle, a sink out and a refit are all this one offset: no height, top or clip animates, and
// the frames carry the eases (script-glide.js: the content's inline translate written in the frame the glass reads it in, 3 Nov 2026 "cards
// trailing behind": a compositor animation can stand a display frame off the glass drawn over the same sheet).
import { D_SMALL, EASE_ARRIVE, cssCurve } from './ease.js';
import { moverOf, signalMove } from './num-move.js';
import { glideTranslate, glideStop, glideY, glideCall } from './script-glide.js';

/** The sheet's moving parts (its plate first, put in once). */
export function sheetParts(el) {
  let plate = el.querySelector(':scope > .sheet-plate');
  if (!plate) {
    plate = document.createElement('i');
    plate.className = 'sheet-plate'; plate.setAttribute('aria-hidden', 'true');
    el.prepend(plate);
  }
  el.classList.add('has-plate');
  return [...el.children];
}

const runs = new WeakMap();   // sheet -> { parts: its moving children, to: where the ease goes }
export { cssCurve as curveOf };
/** Where the content is drawn now, px down from its place in the box (the eased value mid-way, as the frames last wrote it). */
export function sheetOffset(el) {
  const r = runs.get(el);
  if (r) {
    const y = glideY(r.parts[0]);
    return y === y ? y : r.to;
  }
  return el._sheetOff || 0;
}

// A pull: every child (the plate included) is held y px down by a number, `translate` run by a kept paused animation per child (num-move.js),
// so the finger's move writes no string. The inline translate the children carry stays as it was (the end of the last ease, or nothing)
// under it until the pull lets go (setSheetOffset, stopSheet): the animation replaces it while it lives, and it is cancelled in the same
// task as the resting value is written, so the card is never drawn between the two.
const drags = new WeakMap();   // sheet -> { kids: its children as bound, movers: one per child }
/** Holds the content y px down by a number (the pull): no string, no object. */
export function dragSheet(el, y) {
  let d = drags.get(el);
  const kids = el.children, n = kids.length;
  let ok = !!d && d.kids.length === n;
  for (let i = 0; ok && i < n; i++) if (d.kids[i] !== kids[i]) ok = false;
  if (!ok) d = bindDrag(el, d);
  el._sheetOff = y;
  for (let i = 0; i < n; i++) d.movers[i].set(0, y);
}
function bindDrag(el, was) {
  if (was) for (const m of was.movers) m.cancel();   // alloc-rare: the sheet's children changed in the middle of a pull, or the pull's first move
  const kids = [...el.children];   // alloc-rare: bound at the pull's first move (and if the children change), never per move
  const d = { kids, movers: kids.map((c) => moverOf(c, 'translate', 'y', true)) };   // alloc-rare: bound at the pull's first move (and if the children change), never per move
  drags.set(el, d);
  return d;
}
function dropDrag(el) {
  const d = drags.get(el);
  if (!d) return;
  drags.delete(el);
  for (const m of d.movers) m.cancel();
}

/** Holds the content y px down (0: in place), stopping any ease. */
export function setSheetOffset(el, y) {
  stopSheet(el);
  el._sheetOff = y;
  const v = y ? `0px ${y}px` : '';
  for (const c of el.children) c.style.translate = v;   // (its plate put in as the sheet was set up: sheetParts)
  signalMove();
}

export function stopSheet(el) {
  dropDrag(el);
  const r = runs.get(el);
  if (!r) return;
  const y = glideY(r.parts[0]);
  if (Number.isFinite(y)) el._sheetOff = y;
  runs.delete(el); clearTimeout(r.timer);
  for (const c of r.parts) glideStop(c);
  glideStop(el);   // (the sheet's own called run, glideSheet's `frame`)
}

/** Eases the content from where it is drawn to y px down, on `easing` (a finger's carry curve, or the arrival), then calls done. */
// frame(offset): called in each frame with the offset the content is drawn at (the same eased value the parts are written with), for what grows with
// the sheet (the Tests chart, dock-sheet.js).
export function glideSheet(el, y, { easing = EASE_ARRIVE, duration = D_SMALL, done, frame } = {}) {
  const from = sheetOffset(el);
  stopSheet(el);
  const parts = [...el.children];   // (the plate first, put in as the sheet was set up: sheetParts)
  el._sheetOff = y;
  const v = y ? `0px ${y}px` : '';
  if (Math.abs(from - y) < 0.5) { for (const c of parts) c.style.translate = v; frame?.(y); signalMove(); done?.(); return; }
  const ease = cssCurve(easing);
  // alloc-rare: a sheet's ease begins: one record and its end, once for each move, not for each frame
  const r = { parts, to: y, timer: 0 };
  runs.set(el, r);
  // (Put where it lands, in the exact text the stylesheet and a pull expect; every part's glide ended first, so none writes after.)
  const end = () => { if (runs.get(el) !== r) return; runs.delete(el); clearTimeout(r.timer); for (const c of parts) { glideStop(c); c.style.translate = v; } signalMove(); done?.(); };
  for (let i = 0; i < parts.length; i++) glideTranslate(parts[i], 0, from, 0, y, duration, ease, i ? undefined : end);
  if (frame) glideCall(el, duration, ease, (e) => frame(from + (y - from) * e));   // (after the parts: the same frame, the same ease)
  r.timer = setTimeout(end, duration + 120);   // (a page whose frames stall, in the background or a busy browser, still lands on time)
}
