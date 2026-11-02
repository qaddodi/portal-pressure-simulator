// A slide change's cards thrown out and brought in on one clock (Mohammad, 2 Nov 2026: "Cards slides are super glitchy ... The most
// important interaction of them all"). Every card that moves on Next or Back (the teaching card's words and its glass, a data card, a
// panel) is moved here, by its inline transform and opacity, written in the scheduler's frame from the eases' clock (frame.js easeNow).
// Nothing else animates them while they move: no CSS transition (inline transition: none) and no WAAPI. So the words and the GPU glass,
// which reads the same inline values in the same frame (glass-gl.js moveOf), never part, and a long frame holds every card where it was
// instead of the compositor's words running on ahead of the main thread's glass. A card already moving is taken from wherever it is
// (Next pressed mid-entrance, a swipe let go): its next move starts from there, never from a jump.

import { frameFor, cancelFrame, easeNow } from './frame.js?v=7710f677e2';
import { D_SMALL, D_SURFACE, cubicBezier, easeMove } from './ease.js?v=7513a88c68';

/** How far (px) the new card comes in from, and the stagger (ms) of a second card behind the first. */
export const THROW_IN = 56, THROW_STAGGER = 40;
const easeIn = cubicBezier(0.4, 0, 1, 1);   // (EASE_IN: the card gathers pace as it goes, as a flung one does)
const nextFrame = frameFor('card-throw');

/** Where a card is at k (0 to 1) of its move: out, it gathers pace and fades evenly; in, it speeds up and slows to rest evenly, with
 *  no overshoot, and is whole by 60 % of the way. */
export function throwAt(kind, k, from, to) {
  k = k <= 0 ? 0 : k >= 1 ? 1 : k;
  const e = kind === 'out' ? easeIn(k) : easeMove(k);
  const f = kind === 'out' ? k : Math.min(1, k / 0.6);
  return { x: from.x + (to.x - from.x) * e, o: from.o + (to.o - from.o) * (kind === 'out' ? f : easeMove(f)) };
}

const runs = new Map();
let ask = 0;
// (Written important: a card's leave class holds its opacity at 0 with !important (app.css .pz-shade.stack.pz-leave), which put the glass
// out at once while its words were still going.)
const write = (el, x, o) => { el.style.setProperty('transform', `translateX(${x.toFixed(2)}px)`, 'important'); el.style.setProperty('opacity', o.toFixed(3), 'important'); };
const rest = (el) => { el.style.removeProperty('transform'); el.style.removeProperty('opacity'); el.style.removeProperty('transition'); };
// (Where a card stands now: its inline translateX and opacity, as a swipe's finger or an earlier move left them, else at rest.)
function here(el) {
  const r = runs.get(el);
  if (r) return { x: r.x, o: r.o };
  const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform || '');
  const o = parseFloat(el.style.opacity);
  return { x: m ? +m[1] : 0, o: Number.isFinite(o) ? o : 1 };
}
function step() {
  ask = 0;
  const now = easeNow();
  for (const [el, r] of runs) {
    const k = r.ms > 0 ? (now - r.t0) / r.ms : 1;
    if (k < 0) continue;   // (a staggered card waits where it starts)
    const p = throwAt(r.kind, k, r.from, r.to);
    r.x = p.x; r.o = p.o;
    if (k >= 1) { runs.delete(el); if (r.kind === 'in') rest(el); else write(el, p.x, p.o); r.done?.(); continue; }
    write(el, p.x, p.o);
  }
  if (runs.size) ask = nextFrame(step);
  outCheck();
}
function start(el, kind, to, ms, delay, done) {
  const from = here(el);
  runs.delete(el);
  el.style.setProperty('transition', 'none', 'important');
  write(el, from.x, from.o);   // (at once, in the task that starts it: no frame shows the class's own place in between)
  runs.set(el, { kind, from, to, x: from.x, o: from.o, t0: easeNow() + delay, ms, done });
  if (!ask) ask = nextFrame(step);
}

/** Throws el out the way the talk goes (dir 'next': to the left; 'back': to the right), dist px, fading to nothing over D_SMALL. It is
 *  left out of sight, its inline values dropped once it is there (its class keeps it out: app.css pz-leave, pz-hide). */
export function throwOut(el, dir, dist, done) {
  if (!el) return;
  const s = dir === 'back' ? 1 : -1;
  start(el, 'out', { x: s * dist, o: 0 }, D_SMALL, 0, () => { rest(el); done?.(); });
}

/** Brings el in from the side the talk comes from (dir 'next': from the right, moving left; 'back': from the left), THROW_IN px, over
 *  D_SURFACE after delay ms, and lets go of it at rest. A card caught mid-way out comes back from where it is. */
export function throwIn(el, dir, delay = 0) {
  if (!el) return;
  const s = dir === 'back' ? -1 : 1, was = runs.get(el);
  if (!was || was.kind !== 'out') { el.style.setProperty('transition', 'none', 'important'); write(el, s * THROW_IN, 0); runs.delete(el); }
  start(el, 'in', { x: 0, o: 1 }, D_SURFACE, delay);
}

/** How long (ms) el's way out still has to run (0 when it is not on its way out). */
export function throwLeft(el) { const r = runs.get(el); return r && r.kind === 'out' ? Math.max(0, r.t0 + r.ms - easeNow()) : 0; }

/** Resolves once no card is on its way out (at once when none is). The slide's next words go in only then: a wall-clock wait could end
 *  while the eases' clock, held back by a long frame, still showed the old card on its way, and its words would change mid-flight. */
const outWaits = new Set();
export function throwsOut() {
  if (![...runs.values()].some((r) => r.kind === 'out')) return Promise.resolve();
  return new Promise((done) => outWaits.add(done));
}
function outCheck() {
  if (!outWaits.size || [...runs.values()].some((r) => r.kind === 'out')) return;
  const w = [...outWaits]; outWaits.clear();
  for (const f of w) f();
}

/** Whether el is being moved here now. */
export const throwing = (el) => runs.has(el);

/** Stops el's move where it is (a finger takes it), its inline values kept for whoever takes it next. */
export function throwStop(el) { runs.delete(el); if (!runs.size && ask) { cancelFrame(ask); ask = 0; } outCheck(); }
