// A bottom sheet that moves without laying anything out per frame (the phone's Details, Treat and Tests sheets, main.js sheetBehaviour).
//
// The sheet's own box stands still: it is laid out once at the height a gesture needs (the taller of where it is and where it may
// go) and committed once at rest. What moves is its content, every child, and a plate (.sheet-plate, its first child) that wears
// the sheet's paper and shadow: each rides `translate` only, all on the same value, so the card is one piece. Over the thumb dock
// the sheet's still clip (app.css, its cut at the resting foot) hides what slides below the tab row's top line; sideways it slides
// past the screen's edge. A pull, a settle, a sink out and a refit are all this one offset: no height, top or clip animates, and
// the compositor carries the eases (WAAPI on translate).
import { D_SMALL, EASE_ARRIVE, cssCurve } from './ease.js';

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

const runs = new WeakMap();
export { cssCurve as curveOf };
/** Where the content is drawn now, px down from its place in the box (the eased value mid-way, read from the running ease). */
export function sheetOffset(el) {
  const r = runs.get(el);
  if (r) {
    // (2 Nov 2026: worked out from the run's own clock and curve, not getComputedTiming, which brought the page's styles up to date
    // in the finger's move.)
    const ms = r.anims[0]?.currentTime;
    if (typeof ms !== 'number' || !(r.duration > 0)) return r.to;
    const k = Math.max(0, Math.min(1, ms / r.duration));
    return k >= 1 ? r.to : r.from + (r.to - r.from) * r.ease(k);
  }
  return el._sheetOff || 0;
}

/** Holds the content y px down (0: in place), stopping any ease. */
export function setSheetOffset(el, y) {
  stopSheet(el);
  el._sheetOff = y;
  const v = y ? `0px ${y}px` : '';
  for (const c of el.children) c.style.translate = v;   // (its plate put in as the sheet was set up: sheetParts)
}

export function stopSheet(el) {
  const r = runs.get(el);
  if (!r) return;
  runs.delete(el);
  for (const a of r.anims) a.cancel();
}

/** Eases the content from where it is drawn to y px down, on `easing` (a finger's carry curve, or the arrival), then calls done. */
export function glideSheet(el, y, { easing = EASE_ARRIVE, duration = D_SMALL, done } = {}) {
  const from = sheetOffset(el);
  stopSheet(el);
  const parts = [...el.children];   // (the plate first, put in as the sheet was set up: sheetParts)
  el._sheetOff = y;
  const v = y ? `0px ${y}px` : '';
  for (const c of parts) c.style.translate = v;
  if (Math.abs(from - y) < 0.5 || typeof parts[0].animate !== 'function') { done?.(); return; }
  const anims = parts.map((c) => c.animate([{ translate: `0px ${from}px` }, { translate: `0px ${y}px` }], { duration, easing }));
  const r = { anims, from, to: y, duration, ease: cssCurve(easing) };
  runs.set(el, r);
  let over = false;
  const finish = () => { if (over) return; over = true; if (runs.get(el) === r) runs.delete(el); done?.(); };
  anims[0].onfinish = finish;
  // (A page whose frames stall, in the background or a busy browser, still lands on time.)
  setTimeout(() => { if (runs.get(el) === r) { stopSheet(el); finish(); } }, duration + 120);
}
