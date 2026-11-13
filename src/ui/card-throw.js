// A slide change's cards thrown out and brought in on one clock (Mohammad, 2 Nov 2026: "Cards slides are super glitchy ... The most
// important interaction of them all"). Every card that moves on Next or Back (the teaching card's words and its glass, a data card, a
// panel) is moved here, by its inline transform and opacity, written in the scheduler's frame from the eases' clock (frame.js easeNow).
// Nothing else animates them while they move: no CSS transition (inline transition: none) and no WAAPI. So the words and the GPU glass,
// which reads the same inline values in the same frame (glass-gl.js moveOf), never part, and a long frame holds every card where it was
// instead of the compositor's words running on ahead of the main thread's glass. A card already moving is taken from wherever it is
// (Next pressed mid-entrance, a swipe let go): its next move starts from there, never from a jump.

import { frameFor, cancelFrame, easeNow, beginMotion } from './frame.js';
import { cubicBezier } from './ease.js';
import { classSoon, runSoon } from './class-soon.js';
import { caught } from './caught.js';
import { D_SMALL, D_SURFACE } from './ease.js';
import { signalMove } from './num-move.js';

/** How far (px) the new card comes in from, and the stagger (ms) of a second card behind the first. */
export const THROW_IN = 56, THROW_STAGGER = 40;
const nextFrame = frameFor('card-throw');
// (Look 1, "One track", Mohammad, 2 Nov 2026: "do what he recommends". The old card and the new ride one rail, a card's width and a gap
// apart, as iOS pages: 560 ms on a calm curve that starts quick and settles long, no overshoot (its y never passes 1).)
// (Since Mohammad's next note, the same day, "it should all be responsive": every leaving card sets off on the frame of the tap, on the
// rail's curve.)
// (Out on the rail's curve, which starts at once and fast, gone from sight by 85 % of its way (a few frames), and in on it from
// the same distance.)
export const RAIL_MS = 560, RAIL_GAP = 24;   // motion-scale: own pace (the rail throw, decided with the cards)
export const easeRail = cubicBezier(0.32, 0.72, 0, 1);

/** Where a card is at k (0 to 1) of its move, on the rail's curve: out, gone from sight by 85 % of its way; in, with no overshoot,
 *  whole by 40 % of its way. */
export function throwAt(kind, k, from, to) { return throwInto({ x: 0, o: 0 }, kind, k, from, to); }
/** The same, written into out ({x, o}) in place: what the frame uses, so a moving card costs no object a frame. */
export function throwInto(out, kind, k, from, to) {
  k = k <= 0 ? 0 : k >= 1 ? 1 : k;
  const e = easeRail(k), f = kind === 'out' ? Math.min(1, e / 0.85) : kind === 'back' ? e : Math.min(1, e / 0.4);   // ('back': a card let go short of a swipe, fading in on its way as it moves, not ahead of it)
  out.x = from.x + (to.x - from.x) * e; out.o = from.o + (to.o - from.o) * f;
  return out;
}

const runs = new Map();
let ask = 0;
// (Motion state, for whoever must know whether a card is still arriving (presenter.js: layout, keep, input). Each start() has an id; the
// last id a card had is kept, so a card held out of sight still names the run that took it there. Waiters for a landing are kept per
// card, not on the run, so a repeated throwIn mid-way (the same way in, taken from where it is) is still waited for.)
let runIds = 0;
const lastRun = new WeakMap();
const lands = new Map();
const settleLands = (el, ok) => { const w = lands.get(el); if (!w) return; lands.delete(el); for (let i = 0; i < w.length; i++) w[i](ok); };
// (Written important: a card's leave class holds its opacity at 0 with !important (app.css .pz-shade.stack.pz-leave), which put the glass
// out at once while its words were still going.)
// (A card's opacity is written as one of 1001 strings, each made the first time its thousandth is wanted and kept: the fade costs no
// string a frame. The transform's text takes the card's own x, which no table can hold, so it is the one string a moving card makes.)
const OPACITY = new Array(1001);
const opacityText = (o) => { const i = o > 0 ? (o < 1 ? Math.round(o * 1000) : 1000) : 0; return OPACITY[i] ?? (OPACITY[i] = (i / 1000).toFixed(3)); };   // alloc-rare: fills each of the 1001 table entries once, ever
// (A property is written only when its text changes: a card whose opacity has settled at 1 or 0 (in whole by 40 % of its way, out gone by
// 85 %) or whose x holds still makes no style write for it in the frames left, so a move's last third restyles nothing but the transform.)
const write = (el, x, o) => {
  const st = el.style, tx = `translateX(${x.toFixed(2)}px)`, ot = opacityText(o);
  if (st.transform !== tx) st.setProperty('transform', tx, 'important');
  if (st.opacity !== ot || st.getPropertyPriority('opacity') !== 'important') st.setProperty('opacity', ot, 'important');
};
// (pz-throwing: the card is moved here, from its first frame out until it is let go at rest (or out of sight, held, until its class lets it go).
// Mohammad, 2 Nov 2026: "the teaching card moves away, the data card just pops out disappears, and they don't go away same time". The data
// card on the Mac, iPad and phone is a readings sheet whose leave class (.pz-sheet.pz-hide) faded its parts and its two glass pieces on a CSS
// clock of their own (--d-small) and hid it after that, while the card itself rode 560 ms with the words: its glass and its readings were
// gone in a third of the move. While thrown, its parts stand whole and only the card's inline opacity, on this clock, fades it: app.css.)
const rest = (el) => { el.style.removeProperty('transform'); el.style.removeProperty('opacity'); el.style.removeProperty('transition'); classSoon(el, THROWING, false); signalMove(); };   // (let go a task after the frame, never in it: class-soon.js)
const THROWING = 'pz-throwing';
// (Where a card stands now: its inline translateX and opacity, as a swipe's finger or an earlier move left them, else at rest.)
function here(el) {
  const r = runs.get(el);
  if (r) return { x: r.x, o: r.o };
  const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform || '');
  const o = parseFloat(el.style.opacity);
  return { x: m ? +m[1] : 0, o: Number.isFinite(o) ? o : 1 };
}
// (Cards that have just landed, to be let go a task after the frame: kept in one list and let go by one function, so landing makes no closure.)
const landed = [];
function restLanded() {
  for (let i = 0; i < landed.length; i++) { const el = landed[i]; if (!runs.has(el) && !held.has(el) && !pinned.has(el)) rest(el); }
  landed.length = 0;
}
const pos = { x: 0, o: 0 };   // (where the card being stepped is: one object for every card, every frame)
// (3 Nov 2026, his iPhone: the data card stood still part way in (dim, a little to the right, no glass) and stayed. A move lives in one
// loop for every card, and that loop asked for its next frame only after the last card was stepped: one card whose step threw ended the
// loop for all of them, with their runs still held and no frame asked for, so each stood where it was until another move began. Now a
// card's step is its own try, the loop's next frame is asked in a finally, and a move that no frame has finished a grace after its own end
// is finished by a timer (guard, below), whatever stopped the frames.)
// Lands a run: the card at the end of its way, its holder told, a card coming in let go a task after the frame.
function land(el, r, x, o) {
  runs.delete(el); write(el, x, o);
  if (r.kind !== 'out') { landed.push(el); runSoon(restLanded); }
  try { r.done?.(); } finally { settleLands(el, r.kind !== 'out'); }
}
function stepRun(el, r, now) {
  const k = r.ms > 0 ? (now - r.t0) / r.ms : 1;
  if (k < 0) return;   // (a staggered card waits where it starts)
  const p = throwInto(pos, r.kind, k, r.from, r.to);
  r.x = p.x; r.o = p.o;
  if (k >= 1 || (r.kind === 'out' && p.o <= 0.001)) land(el, r, p.x, p.o);   // (in: at rest now, its inline values let go a task after the frame, unless a new move took it: class-soon.js)
  else write(el, p.x, p.o);
}
function step() {
  ask = 0;
  try {
    const now = easeNow();
    for (const [el, r] of runs) {
      try { stepRun(el, r, now); } catch (e) { caught('card-throw:step', e); if (runs.get(el) === r) { try { land(el, r, r.to.x, r.to.o); } catch (e2) { runs.delete(el); caught('card-throw:land', e2); } } }
    }
  } finally {
    // Every card has reached this frame's position before the glass is asked to draw in the final phase.
    signalMove();
    if (runs.size && !ask) ask = nextFrame(step);
    try { settle(); outCheck(); } catch (e) { caught('card-throw:settle', e); }
  }
}
// (The guard: one timer for every move, asked when a move starts and again for the next deadline. A move still running GUARD_MS after
// its own end on the wall clock was not finished by a frame (the loop stopped, or the frames came too late): it lands where it was
// going, its holder told, as step would have. A page whose frames run on time never reaches it.)
const GUARD_MS = 400;   // motion-scale: not a move (a guard for stopped frames)
let guardT = 0, guardAt = Infinity;
function guardBy(deadline) {
  if (guardT && guardAt <= deadline) return;
  if (guardT) clearTimeout(guardT);
  guardAt = deadline;
  guardT = setTimeout(guard, Math.max(16, deadline - performance.now()));
  guardT.unref?.();
}
function guard() {
  if (guardT) clearTimeout(guardT);
  guardT = 0; guardAt = Infinity;
  const wall = performance.now();
  let soonest = Infinity;
  for (const [el, r] of runs) {
    if (wall >= r.dead) { try { land(el, r, r.to.x, r.to.o); } catch (e) { runs.delete(el); caught('card-throw:guard', e); } }
    else if (r.dead < soonest) soonest = r.dead;
  }
  signalMove();
  if (runs.size && !ask) ask = nextFrame(step);
  if (soonest < Infinity) guardBy(soonest);
  try { settle(); outCheck(); } catch (e) { caught('card-throw:guard', e); }
}
/** Moves still running past their own end by the guard's grace now (for the tests: what the timer would land). */
export const throwGuard = guard;
// (R20: the throws are one transition the page's deferrable work waits out, from the first card moving to the last one landing.)
let endMove = null;
const settle = () => { if (!runs.size) { if (guardT) clearTimeout(guardT); guardT = 0; guardAt = Infinity; if (endMove) { endMove(); endMove = null; } } };
function start(el, kind, to, ms, delay, done) {
  endMove ||= beginMotion('card throw', ms + delay + 2000);
  const from = here(el);
  runs.delete(el); pinned.delete(el);
  if (kind === 'out') settleLands(el, false);   // (a card sent out will not land: whoever waited for it arriving is told)
  el.classList?.add(THROWING); classSoon(el, THROWING, true);   // (on in the task that starts the move; a let-go still waiting is overruled)
  el.style.setProperty('transition', 'none', 'important');
  write(el, from.x, from.o);   // (at once, in the task that starts it: no frame shows the class's own place in between)
  signalMove();
  const dead = performance.now() + delay + ms + GUARD_MS;
  const run = ++runIds; lastRun.set(el, run);
  runs.set(el, { run, kind, from, to, x: from.x, o: from.o, t0: easeNow() + delay, ms, done, dead });
  outCheck();   // A replacement that no longer goes out can release the waiting slide immediately.
  if (!ask) ask = nextFrame(step);
  guardBy(dead);
}

/** Throws el out the way the talk goes (dir 'next': to the left; 'back': to the right), dist px, fading to nothing over RAIL_MS. It is
 *  left out of sight, held at an inline 0 (no offset) until it comes in again or its leave class goes (hold, below). */
export function throwOut(el, dir, dist, done) {
  if (!el) return;
  const s = dir === 'back' ? 1 : -1;
  start(el, 'out', { x: s * dist, o: 0 }, RAIL_MS, 0, () => { hold(el); done?.(); });
}

// (2 Nov 2026, his iPhone: "the glass appears alone then flashes off then the new card slides over". A card's GPU glass (glass-gl.js)
// takes its fade from the inline opacity written here while one is there, and from the page's styles read between frames otherwise.
// Dropping the inline 0 the moment a card was out left the glass, until the page was read again a frame later, with no fade of the
// card's own: drawn whole, on its own, at its place, then out. So a card out of sight keeps its inline 0 (its offset goes, so its box
// reads at its place) until it comes in again, or until its leave class goes without a throw (another way in), when it is let go then,
// in the same frame as its class.)
const held = new Set();
const OUT_CLS = ['pz-leave', 'pz-hide'];
const holdMo = typeof MutationObserver === 'function' ? new MutationObserver(() => {
  for (const el of [...held]) {
    if (runs.has(el)) { held.delete(el); continue; }
    if (!el.isConnected || !OUT_CLS.some((c) => el.classList.contains(c))) { held.delete(el); rest(el); }
  }
  if (!held.size) holdMo.disconnect();
}) : null;
function releaseHeld(el) {
  held.delete(el);
  if (!held.size) holdMo?.disconnect();
}
function hold(el) {
  if (!holdMo) { rest(el); return; }
  el.style.removeProperty('transform');
  el.style.setProperty('opacity', '0', 'important');
  signalMove();
  if (!OUT_CLS.some((c) => el.classList.contains(c))) { rest(el); return; }
  held.add(el);
  holdMo.observe(el, { attributes: true, attributeFilter: ['class'] });
}
/** Whether el is out of sight, held at an inline 0 by its throw. */
export const throwHeld = (el) => held.has(el);

/** Brings el in from the side the talk comes from (dir 'next': from the right, moving left; 'back': from the left), THROW_IN px, over
 *  RAIL_MS after delay ms, and lets go of it at rest. A card caught mid-way out comes back from where it is. */
// (A card comes in from a little to its side, THROW_IN px, fading in, never from where the old one went: Mohammad, 2 Nov 2026, on the Mac,
// "they should kinda slide in from a little bit right, not all the way from the right".)
export function throwIn(el, dir, delay = 0) {
  if (!el) return;
  pinned.delete(el);
  const s = dir === 'back' ? -1 : 1, was = runs.get(el);
  releaseHeld(el);
  // (A card already coming in is taken from where it is, never put back at its start: a second call for it mid-way (a repeated pass of
  // cardsIn, a staggered card asked again) used to drop it from full to nothing and slide it in again, a blink.)
  if (!was) { el.style.setProperty('transition', 'none', 'important'); write(el, s * THROW_IN, 0); runs.delete(el); }
  start(el, 'in', { x: 0, o: 1 }, RAIL_MS, was?.kind === 'in' ? 0 : delay);
}

/** Brings el in where it stands, from nothing to whole, over ms after delay ms, on this clock: no slide, only the fade. For a card that comes
 *  in with no way to come from (no Next or Back: a time-lapse's data card let in once its days end, a slide reached by a jump, the deck's
 *  first). A card caught on a move of its own fades in from where that left it. */
// (10 Nov 2026, Mohammad: "the new card on new slide still sometimes FLICKERS". Such a card faded in by its leave class going, on the CSS
// clock: the browser runs that fade on its compositor, frame after frame, while the card's GPU glass is drawn by the page's own frames. A
// long frame (a time-lapse's last model frame, a new patient's organs, the slide's own build) held the glass where it was while the card's
// words, edge and readings, and the split sheet's two panes, faded on without it: words over no frost, then the frost catching up in one
// step. On this clock, as the throws, the card's fade and its glass are written and read in the same frame, and a long frame holds both.)
export const FADE_MS = D_SURFACE, FADE_DELAY = 120;   // motion-scale: the card's own CSS fade in (app.css: --d-surface after .12s)
export function throwFade(el, delay = FADE_DELAY, ms = FADE_MS) {
  if (!el) return;
  pinned.delete(el);
  const was = runs.get(el);
  releaseHeld(el);
  if (!was) { el.style.setProperty('transition', 'none', 'important'); write(el, 0, 0); }
  start(el, 'back', { x: 0, o: 1 }, ms, was ? 0 : delay);
}

/** A card let go short of a swipe (or one the swipe took along that the next slide keeps) eases back to its place from where the finger left it
 *  (x px, opacity o), on this clock: its inline values are written in the frame the glass reads them in. The CSS animation it was before
 *  (el.animate) is moved by the compositor, which can show it a display frame from where the page's own time puts it; the GPU glass then
 *  trails (or leads) the card by that frame. */
export function throwBack(el, x, o) {
  if (!el) return;
  releaseHeld(el); pinned.delete(el);
  if (runs.get(el)?.kind === 'out') settleLands(el, false);
  runs.delete(el);   // The finger's supplied position supersedes any older throw (a waiter for an arrival keeps waiting for the card's return).
  write(el, x, o);
  start(el, 'back', { x: 0, o: 1 }, D_SMALL, 0);
}

/** How long (ms) el's way out still has to run (0 when it is not on its way out). */
export function throwLeft(el) { const r = runs.get(el); return r && r.kind === 'out' ? Math.max(0, r.t0 + r.ms - easeNow()) : 0; }

/** Resolves once no card is on its way out (at once when none is). The slide's next words go in only then: a wall-clock wait could end
 *  while the eases' clock, held back by a long frame, still showed the old card on its way, and its words would change mid-flight. */
const outWaits = new Set();
const anyOut = () => { for (const r of runs.values()) if (r.kind === 'out') return true; return false; };
export function throwsOut() {
  if (!anyOut()) return Promise.resolve();
  return new Promise((done) => outWaits.add(done));
}
const waitBuf = [];   // (the waiters being called: kept, so a card landing makes no list)
function outCheck() {
  if (!outWaits.size || anyOut()) return;
  for (const f of outWaits) waitBuf.push(f);
  outWaits.clear();
  for (let i = 0; i < waitBuf.length; i++) waitBuf[i]();
  waitBuf.length = 0;
}

/** Whether el is being moved here now. */
export const throwing = (el) => runs.has(el);

/** Stops el's move where it is (a finger takes it), its inline values kept for whoever takes it next. */
export function throwStop(el) { classSoon(el, THROWING, false); runs.delete(el); settleLands(el, false); releaseHeld(el); pinned.delete(el); if (!runs.size && ask) { cancelFrame(ask); ask = 0; } settle(); outCheck(); }


// ── Out on the tap, while the slide before is still settling (Mohammad, 2 Nov 2026: "when i hit next it takes time to move out of the
// way. it should all be responsive"). A Next pressed while the last change still runs (its landing, its after-steps) used to wait for it
// to finish before the cards moved. The cards that show set off now; out of sight, each is pinned at an inline 0, with no class of its
// own yet, until the change for the new slide takes it (its leave, a throw in), or lets it go (throwRelease).
const pinned = new Set();
export function throwOutNow(el, dir, dist) {
  if (!el) return;
  const s = dir === 'back' ? 1 : -1;
  start(el, 'out', { x: s * dist, o: 0 }, RAIL_MS, 0, () => {
    if (OUT_CLS.some((c) => el.classList.contains(c))) { hold(el); return; }
    el.style.removeProperty('transform');
    el.style.setProperty('opacity', '0', 'important');
    pinned.add(el);
  });
}
/** Whether el was sent out on the tap and waits, out of sight, for the new slide's change to take it. */
export const throwPinned = (el) => pinned.has(el);
/** Lets go of a pinned card: to its class's look (a leave class keeps it out). */
export function throwRelease(el) { if (pinned.delete(el)) hold(el); }

// ── Motion state (R01): what a card's throw is doing now, read by the presenter instead of guessing from the browser's animations ──
/** Where el's throw stands, or null when it owns none: { run (the id of the last start for el), kind ('in', 'out', 'back'), x, o (as last
 *  written), left (ms to the end of its way, its delay included; 0 at rest or held), readable (not on its way out and whole), held, pinned }. */
export function throwState(el) {
  const r = runs.get(el), h = held.has(el), p = pinned.has(el);
  if (!r && !h && !p) return null;
  if (!r) return { run: lastRun.get(el) ?? 0, kind: 'out', x: 0, o: 0, left: 0, readable: false, held: h, pinned: p };
  return { run: r.run, kind: r.kind, x: r.x, o: r.o, left: Math.max(0, r.t0 + r.ms - easeNow()), readable: r.kind !== 'out' && r.o >= 0.999, held: h, pinned: p };
}
/** Whether el still has a move, or is held or pinned out of sight (a throw's whole claim on it). */
/** Whether el is on its way out (thrown out, or pinned for it): a card on its way in or held may still be kept. */
export const throwLeaving = (el) => runs.get(el)?.kind === 'out' || pinned.has(el);
export const throwBusy = (el) => runs.has(el) || held.has(el) || pinned.has(el);
/** Resolves true when el's way in (or back) lands, false when it is stopped, or taken out, first; true at once when el has no run, and
 *  false at once when its run is on its way out (it will not land). */
export function throwLanded(el) {
  const r = runs.get(el);
  if (!r) return Promise.resolve(true);
  if (r.kind === 'out') return Promise.resolve(false);
  return new Promise((done) => { const w = lands.get(el); if (w) w.push(done); else lands.set(el, [done]); });
}
/** Whether any of els is busy (see throwBusy). */
export function anyThrowBusy(els) { for (const el of els) if (el && throwBusy(el)) return true; return false; }
