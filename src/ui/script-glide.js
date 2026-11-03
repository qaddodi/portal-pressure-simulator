// A card's glide or fade written by the frames, on the eases' clock (3 Nov 2026, "cards trailing behind").
//
// A card moved by el.animate() (or a CSS transition) is moved by the compositor from a clock of its own; the GPU glass over the figure is
// drawn by the page in its frame from the page's time, and the two can stand a display frame apart (0 or 1, from run to run: measured on
// presented frames), so the glass trails or leads its card. A card whose inline translate or opacity is written here, in the scheduler's
// frame, is written in the frame the glass reads it in (glass-gl.js moveOf): they cannot part. card-throw.js does the same for a slide
// change's cards; this is for the other moves of a card (a card placed anew, the talk's closing fade).
//
//   glideTranslate(el, x0, y0, x1, y1, ms, ease, done)   el.style.translate from (x0, y0) px to (x1, y1) px; at the end it stands at (x1, y1)
//   glideOpacity(el, o0, o1, ms, ease)                   el.style.opacity from o0 to o1; resolves when it is there
//   glideCall(el, ms, ease, write, done)                 write(e) each frame with the eased progress 0..1 (the caller writes what it likes, in the frame); e is exactly 1 in the last
//   glideStop(el)                                        ends what glides on el where it stands (its inline values kept)
// A second glide on the same property of an element takes over from where the first stands, never from a jump.

import { frameFor, cancelFrame, easeNow } from './frame.js';
import { signalMove } from './num-move.js';

const nextFrame = frameFor('script-glide');
const runs = new Map();   // element → { t: its translate run | null, o: its opacity run | null, c: its called run | null }
let ask = 0;

const OPACITY = new Array(1001);
const opacityText = (o) => { const i = o > 0 ? (o < 1 ? Math.round(o * 1000) : 1000) : 0; return OPACITY[i] ?? (OPACITY[i] = (i / 1000).toFixed(3)); };   // alloc-rare: fills each of the 1001 table entries once, ever

function step() {
  ask = 0;
  const now = easeNow();
  for (const [el, r] of runs) {
    const t = r.t;
    if (t) {
      const u = t.ms > 0 ? Math.min(1, Math.max(0, (now - t.t0) / t.ms)) : 1, e = u >= 1 ? 1 : t.ease(u);
      t.x = t.x0 + (t.x1 - t.x0) * e; t.y = t.y0 + (t.y1 - t.y0) * e;
      el.style.translate = `${t.x.toFixed(2)}px ${t.y.toFixed(2)}px`;
      if (u >= 1) { r.t = null; t.done?.(); }
    }
    const o = r.o;
    if (o) {
      const u = o.ms > 0 ? Math.min(1, Math.max(0, (now - o.t0) / o.ms)) : 1, e = u >= 1 ? 1 : o.ease(u);
      o.v = o.v0 + (o.v1 - o.v0) * e;
      el.style.opacity = opacityText(o.v);
      if (u >= 1) { r.o = null; o.res(); }
    }
    const c = r.c;
    if (c) {
      const u = c.ms > 0 ? Math.min(1, Math.max(0, (now - c.t0) / c.ms)) : 1;
      c.write(u >= 1 ? 1 : c.ease(u));
      if (u >= 1) { r.c = null; c.done?.(); }
    }
    // A completion callback may have stopped this record and started another glide on the same element.
    if (!r.t && !r.o && !r.c && runs.get(el) === r) runs.delete(el);
  }
  // One wake for the frame, after every card part has been written. Glass draws in the scheduler's final phase.
  signalMove();
  // A completion callback may already have requested the next frame for a replacement glide.
  if (runs.size && !ask) ask = nextFrame(step);
}
const runOf = (el) => { let r = runs.get(el); if (!r) runs.set(el, (r = { t: null, o: null, c: null })); return r; };   // alloc-rare: a card's first glide
const go = () => { if (!ask) ask = nextFrame(step); };

export function glideTranslate(el, x0, y0, x1, y1, ms, ease, done) {
  const r = runOf(el), was = r.t;
  if (was) { x0 = was.x; y0 = was.y; }   // (taken over from where it stands)
  r.t = { x0, y0, x1, y1, x: x0, y: y0, ms, ease, t0: easeNow(), done };   // alloc-rare: one record a glide, not a frame
  el.style.translate = `${x0.toFixed(2)}px ${y0.toFixed(2)}px`;
  signalMove();
  go();
}

export function glideOpacity(el, o0, o1, ms, ease) {
  const r = runOf(el), was = r.o;
  if (was) { o0 = was.v; was.res(); }
  return new Promise((res) => { r.o = { v0: o0, v1: o1, v: o0, ms, ease, t0: easeNow(), res }; el.style.opacity = opacityText(o0); signalMove(); go(); });   // alloc-rare: one record and promise a fade, not a frame
}

/** Where el's translate glide has it now, px down (NaN when none is under way): the value last written, no style read. */
export const glideY = (el) => runs.get(el)?.t?.y ?? NaN;
/** The corresponding horizontal position, for a finger taking over an unfinished glide. */
export const glideX = (el) => runs.get(el)?.t?.x ?? NaN;

/** Calls write(e) in each frame for ms, e the eased progress (1 exactly in the last), then done: for a move that is more than a translate or an opacity (a scale). */
export function glideCall(el, ms, ease, write, done) {
  const r = runOf(el);
  r.c = { ms, ease, write, done, t0: easeNow() };   // alloc-rare: one record a glide, not a frame
  write(0);
  signalMove();
  go();
}

/** Whether a translate glide is under way on el. */
export const glideRunning = (el) => !!runs.get(el)?.t;

export function glideStop(el) {
  const r = runs.get(el);
  if (!r) return;
  r.t = null; r.c = null; r.o?.res(); r.o = null;
  runs.delete(el);
  if (!runs.size && ask) { cancelFrame(ask); ask = 0; }
}
