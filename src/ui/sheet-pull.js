// A sheet let go by a finger, carried by the compositor (Mohammad, 3 Nov 2026: "100% GPU, no glitches").
//
// The pull itself is num-move.js (a paused animation of the panel's translate whose clock the finger sets: a number per move). The let-go that
// used to be eased by a --sink style write every frame (sinkTo) carries that same paused animation's clock on, frame by frame on the shared
// scheduler, from where the finger left the panel to where it goes, on the curve that carries the finger's own speed on (ease.js carryCurve):
// no style is written, and the sheet's GPU frost reads the same number in the same frame (13 Nov 2026). Without a mover (or with a dock clip)
// it is one compositor animation instead.
//
//   const r = pullRelease(panel, 'translate', mover, dy, to, ms, easing, done);   // eases dy → to, then done; the mover is taken away once it is in place
//   pullAt(r)   // where the let-go has the panel now (px down), worked out from its own clock and curve: no style is read
//   pullStop(r) // the let-go stops where it stands (a new touch takes the panel over)

import { cssCurve } from './ease.js';
import { dockCut } from './num-move.js';
import { frameFor } from './frame.js';

const nextFrame = frameFor('sheet-release');

const OFF = (prop, y) => (prop === 'translate' ? `0px ${y}px` : `translateY(${y}px)`);   // alloc-rare: a let-go's two ends, made as the finger lifts

/**
 * Lets the pull go: the panel eases from `from` px down to `to` over `ms` on `easing`, then `done` is called. A pull let go back to 0 hands
 * the panel back to its stylesheet at the end (its animation is cancelled); one that goes (to > 0) stays where it lands until the panel
 * leaves the page. `pull` (the pull's mover, num-move.js: anything with cancel()) is taken away once the let-go is in place under it, so the panel never shows a frame
 * at the page's own place between the two. Returns the let-go's record (pullAt, pullStop).
 */
export function pullRelease(el, prop, pull, from, to, ms, easing, done, clip = false) {
  // (13 Nov 2026, iPhone: "when I close the menu by swiping down the whole thing flickers and goes blank". The let-go was a compositor animation,
  // and the sheet's frost, drawn by the GPU in the figure's canvas from script, was worked out from that animation's clock: the browser showed the
  // sheet a frame or more further on than the frost was drawn, so the frost trailed above the sinking sheet, an empty pane over the figure,
  // and its last place stayed a frame after the sheet had gone. Headless, frame by frame: the glass held at 306 px while the sheet was at 645.
  // Now the let-go is the pull's own number carried on frame by frame on the shared scheduler (num-move.js: one paused animation, its clock set),
  // as the finger moved it: the sheet and its frost take the same number in the same frame, which is why the drag itself never trailed.)
  if (pull?.set && !clip) {
    // alloc-rare: a let-go's record and its frame step, once for each release of the finger
    const r = { a: null, pull, from, to, ms, ease: cssCurve(easing), over: false, timer: 0, t0: performance.now() };
    const end = () => {
      if (r.over) return;
      r.over = true; clearTimeout(r.timer);
      pull.set(0, to);
      if (!to) pull.cancel();   // (back where the stylesheet puts it)
      done?.();
    };
    r.end = end;
    const step = () => {
      if (r.over) return;
      const k = Math.min(1, (performance.now() - r.t0) / ms);
      if (k >= 1) { end(); return; }
      pull.set(0, from + (to - from) * r.ease(k));
      nextFrame(step);
    };
    nextFrame(step);
    r.timer = setTimeout(end, ms + 120);   // (a page whose frames stall, in the background or a busy browser, still lands on time)
    return r;
  }
  if (typeof el.animate !== 'function') { pull?.cancel(); done?.(); return null; }
  // alloc-rare: a let-go: one animation, its record and its end, once for each release of the finger
  const a = el.animate(clip ? [{ [prop]: OFF(prop, from), clipPath: dockCut(from) }, { [prop]: OFF(prop, to), clipPath: dockCut(to) }] : [{ [prop]: OFF(prop, from) }, { [prop]: OFF(prop, to) }], { duration: ms, easing, fill: 'both' });
  // alloc-rare: the let-go's record and its end, once for each release of the finger
  const r = { a, from, to, ms, ease: cssCurve(easing), over: false, timer: 0, t0: performance.now() };
  pull?.cancel();
  // alloc-rare: the let-go's end
  const end = () => {
    if (r.over) return;
    r.over = true; clearTimeout(r.timer);
    if (!to) a.cancel();   // (back where the stylesheet puts it: the animation's hold is no longer needed)
    done?.();
  };
  a.onfinish = end;
  r.timer = setTimeout(end, ms + 120);   // (a page whose frames stall, in the background or a busy browser, still lands on time)
  return r;
}

/** Where a let-go has the panel now, px down (its end once it is over). */
export function pullAt(r) {
  if (!r) return 0;
  if (r.over) return r.to;
  const t = r.a ? r.a.currentTime : performance.now() - r.t0;
  if (typeof t !== 'number' || !(r.ms > 0)) return r.to;
  const k = Math.max(0, Math.min(1, t / r.ms));
  return k >= 1 ? r.to : r.from + (r.to - r.from) * r.ease(k);
}

/** Stops a let-go where it stands: the animation is cancelled (the caller holds the panel there with a new pull) and its end never comes. */
export function pullStop(r) {
  if (!r || r.over) return;
  r.over = true; clearTimeout(r.timer);
  if (r.a) { r.a.onfinish = null; r.a.cancel(); }   // (a let-go carried by the pull's own number leaves the mover where it is: the new pull takes it from there)
}
