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
// (Look 1, "One track", Mohammad, 2 Nov 2026: "do what he recommends". The old card and the new ride one rail, a card's width and a gap
// apart, as iOS pages: 560 ms on a calm curve that starts quick and settles long, no overshoot (its y never passes 1).)
// (The copies that held the old card until the new one was ready (railHold) are off by default since Mohammad's next note, the same day:
// "it should all be responsive": every leaving card now sets off on the frame of the tap, on the rail's curve. ?railhold=1: the copies.)
export const RAIL = typeof location !== 'undefined' && /[?&]railhold=1\b/.test(location.search || '');
// (Instant: out on the rail's curve, which starts at once and fast, gone from sight by 85 % of its way (a few frames), and in on it from
// the same distance. ?instant=0: the throw's own curves, as before.)
export const INSTANT = typeof location === 'undefined' || !/[?&]instant=0\b/.test(location.search || '');
export const RAIL_MS = 560, RAIL_GAP = 24;
const easeRail = cubicBezier(0.32, 0.72, 0, 1);

/** Where a card is at k (0 to 1) of its move: out, it gathers pace and fades evenly; in, it speeds up and slows to rest evenly, with
 *  no overshoot, and is whole by 60 % of the way. */
export function throwAt(kind, k, from, to) {
  k = k <= 0 ? 0 : k >= 1 ? 1 : k;
  if (kind === 'rail-out' || kind === 'rail-in') {
    // (One track: both cards on the one curve, side by side; the old one fades only over the last half of its way, the new one is whole
    // by 40 % of its way, so the screen never holds an empty glass.)
    const e = easeRail(k), f = kind === 'rail-out' ? Math.max(0, (e - 0.5) / 0.5) : Math.min(1, e / 0.4);
    return { x: from.x + (to.x - from.x) * e, o: from.o + (to.o - from.o) * f };
  }
  if (INSTANT) {
    const e = easeRail(k), f = kind === 'out' ? Math.min(1, e / 0.85) : Math.min(1, e / 0.4);
    return { x: from.x + (to.x - from.x) * e, o: from.o + (to.o - from.o) * f };
  }
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
    if (k >= 1 || (INSTANT && r.kind === 'out' && p.o <= 0.001)) { runs.delete(el); if (r.kind === 'in' || r.kind === 'rail-in') rest(el); else write(el, p.x, p.o); r.done?.(); continue; }
    write(el, p.x, p.o);
  }
  if (runs.size) ask = nextFrame(step);
  outCheck();
}
function start(el, kind, to, ms, delay, done) {
  const from = here(el);
  runs.delete(el); pinned.delete(el);
  el.style.setProperty('transition', 'none', 'important');
  write(el, from.x, from.o);   // (at once, in the task that starts it: no frame shows the class's own place in between)
  runs.set(el, { kind, from, to, x: from.x, o: from.o, t0: easeNow() + delay, ms, done });
  if (!ask) ask = nextFrame(step);
}

/** Throws el out the way the talk goes (dir 'next': to the left; 'back': to the right), dist px, fading to nothing over D_SMALL. It is
 *  left out of sight, held at an inline 0 (no offset) until it comes in again or its leave class goes (hold, below). */
export function throwOut(el, dir, dist, done) {
  if (!el) return;
  const s = dir === 'back' ? 1 : -1;
  start(el, 'out', { x: s * dist, o: 0 }, INSTANT ? RAIL_MS : D_SMALL, 0, () => { hold(el); done?.(); });
}

// (2 Nov 2026, his iPhone: "the glass appears alone then flashes off then the new card slides over". A card's GPU glass (glass-gl.js)
// takes its fade from the inline opacity written here while one is there, and from the page's styles read between frames otherwise.
// Dropping the inline 0 the moment a card was out left the glass, until the page was read again a frame later, with no fade of the
// card's own: drawn whole, on its own, at its place, then out. So a card out of sight keeps its inline 0 (its offset goes, so its box
// reads at its place) until it comes in again, or until its leave class goes without a throw (another way in), when it is let go then,
// in the same frame as its class. ?throwhold=0: let go at once, as before.)
const HOLD = typeof location === 'undefined' || !/[?&]throwhold=0\b/.test(location.search || '');
const held = new Set();
const OUT_CLS = ['pz-leave', 'pz-hide'];
const holdMo = typeof MutationObserver === 'function' ? new MutationObserver(() => {
  for (const el of [...held]) {
    if (runs.has(el)) { held.delete(el); continue; }
    if (!el.isConnected || !OUT_CLS.some((c) => el.classList.contains(c))) { held.delete(el); rest(el); }
  }
  if (!held.size) holdMo.disconnect();
}) : null;
function hold(el) {
  if (!HOLD || !holdMo) { rest(el); return; }
  el.style.removeProperty('transform');
  el.style.setProperty('opacity', '0', 'important');
  if (!OUT_CLS.some((c) => el.classList.contains(c))) { rest(el); return; }
  held.add(el);
  holdMo.observe(el, { attributes: true, attributeFilter: ['class'] });
}
/** Whether el is out of sight, held at an inline 0 by its throw. */
export const throwHeld = (el) => held.has(el);

/** Brings el in from the side the talk comes from (dir 'next': from the right, moving left; 'back': from the left), THROW_IN px, over
 *  D_SURFACE after delay ms, and lets go of it at rest. A card caught mid-way out comes back from where it is. */
export function throwIn(el, dir, delay = 0, dist = 0) {
  if (!el) return;
  pinned.delete(el);
  const s = dir === 'back' ? -1 : 1, was = runs.get(el);
  held.delete(el);
  if (!was || was.kind !== 'out') { el.style.setProperty('transition', 'none', 'important'); write(el, s * (INSTANT && dist ? dist : THROW_IN), 0); runs.delete(el); }
  start(el, 'in', { x: 0, o: 1 }, INSTANT ? RAIL_MS : D_SURFACE, delay);
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
export function throwStop(el) { runs.delete(el); held.delete(el); pinned.delete(el); if (ghosts.has(el)) railAway(el); railHeld.delete(el); if (!runs.size && ask) { cancelFrame(ask); ask = 0; } outCheck(); }

// ── One track (RAIL): the old card stays where it is, whole, as a copy of itself (its ghost), until the new card is laid out and drawn
// behind it; then both ride the rail together. The copy is the old card's own markup, taken as it stood: words, tiles, glass (data-gl:
// the cards' GPU glass draws it, glass-gl.js, through the presenter's list of glasses) and edge, so nothing of it goes missing. A card
// holding a picture the GPU drew (a chart's or an instrument's canvas) is not copied, as a canvas copies empty: it is thrown as before.
const ghosts = new Map();   // (card → { g: its copy, d: the rail's spacing (px), t: its timer })
const ghostEls = new Set();
const railHeld = new Set();
const GHOST_MAX = 15000;   // (a copy never outstays this, whatever happens to the slide change: a slow machine's change takes seconds)
const stripped = ['pz-leave', 'pz-hide', 'pz-enter', 'glw-on'];
/** Whether el can ride the rail: on the page, with no picture of the GPU's in it (a readout's own, gl-words.js, is empty at rest). */
export function railable(el) {
  if (!RAIL || !el || el.hidden || !el.isConnected) return false;
  // (A GPU picture copies empty: its picture is copied into the copy's canvas (createImageBitmap), where the browser can; else thrown.)
  if (!COPY_PICS) for (const c of el.getElementsByTagName('canvas')) if (!c.classList.contains('glw-cv')) return false;
  return true;
}
// (2 Nov 2026, Mohammad: "the data card and the teaching cards move out at different paces; should go together". The data card's charts
// and instruments are drawn on the GPU into canvases of their own (trace-gl.js, shown through a bitmap renderer), which a copy of the card
// takes empty; so the card was thrown, on its own clock, while the words rode the rail. Each picture is now copied into its copy's canvas,
// the GPU's own bitmap, and the card rides the rail with the words. Until the pictures are in, the card itself stays as it is and its copy
// waits unseen; they change places in one task. ?railpics=0: such a card is thrown, as before.)
const COPY_PICS = typeof location === 'undefined' || (typeof createImageBitmap === 'function' && !/[?&]railpics=0\b/.test(location.search || ''));
const copying = new Set();
/** Resolves once every copy's pictures are in (at most PICS_MAX ms): the next words go into a card only once its copy stands in for it. */
const PICS_MAX = 300;
export function railCopies() {
  if (!copying.size) return Promise.resolve();
  return Promise.race([Promise.all([...copying]), new Promise((ok) => setTimeout(ok, PICS_MAX))]);
}
/** The copies on the page now (for the cards' GPU glass to draw). */
export const railGhosts = () => [...ghostEls].filter((g) => g.isConnected);
/** Leaves a copy of el in its place, whole, and takes el out of sight (an inline 0) while its next words are set: d is the rail's spacing. */
export function railHold(el, d, tag, dir) {
  if (ghosts.has(el)) railAway(el);
  runs.delete(el); held.delete(el);
  const g = el.cloneNode(true);
  g.removeAttribute('id');
  for (const n of g.querySelectorAll('[id]')) n.removeAttribute('id');
  for (const n of g.querySelectorAll('.glw-on')) n.classList.remove('glw-on');
  g.classList.remove(...stripped);
  g.classList.add('pz-railcopy');
  g.dataset.ghost = tag;
  g.setAttribute('aria-hidden', 'true');
  g.inert = true;
  g.style.setProperty('pointer-events', 'none', 'important');
  g.style.setProperty('transition', 'none', 'important');
  const at = here(el);
  // (The pictures: each canvas's bitmap into the copy's, the same canvas by its place among them; a readout's own picture (gl-words) is left
  // empty, its words being the page's own in the copy.)
  const src = [...el.getElementsByTagName('canvas')], dst = [...g.getElementsByTagName('canvas')], pics = [];
  if (COPY_PICS && src.length === dst.length) {
    src.forEach((c, i) => {
      if (c.classList.contains('glw-cv') || !(c.width > 0 && c.height > 0)) return;
      pics.push(createImageBitmap(c).then((b) => { const r = dst[i].getContext('bitmaprenderer'); if (r) r.transferFromImageBitmap(b); else b.close?.(); }).catch(() => {}));
    });
  }
  write(g, at.x, pics.length ? 0 : Math.max(at.o, 0));
  // (At the end of the card's layer, so no rule that reads a card's neighbour (the data card's edge, .pz-data + .pz-lip) sees it; the
  // teaching card's glass just after itself, under the cards' layer as it is.)
  if (tag === 'shade') el.after(g); else el.parentNode.append(g);
  ghostEls.add(g);
  // (In the same task: no frame shows the card and its copy both, or neither.)
  const swap = () => {
    if (!ghostEls.has(g) || ghosts.get(el)?.g !== g || runs.has(g)) return;
    write(g, at.x, Math.max(at.o, 0));
    el.style.setProperty('transition', 'none', 'important');
    el.style.removeProperty('transform');
    el.style.setProperty('opacity', '0', 'important');
  };
  railHeld.add(el);
  ghosts.set(el, { g, d, dir, t: setTimeout(() => railAway(el), GHOST_MAX) });
  if (!pics.length) { swap(); return; }
  // (Meanwhile the card stands as it is, whole, whatever its leave class says.)
  el.style.setProperty('transition', 'none', 'important');
  el.style.setProperty('opacity', String(Math.max(at.o, 0)), 'important');
  const p = Promise.race([Promise.all(pics), new Promise((ok) => setTimeout(ok, PICS_MAX))]).then(() => { copying.delete(p); swap(); });
  copying.add(p);
}
function drop(g) { ghostEls.delete(g); g.remove(); }
/** Rides el in on the rail from where its copy stands beside it, and its copy out, on one clock (delay ms after now). False when el has no copy. */
export function railIn(el, dir, delay = 0) {
  const gh = ghosts.get(el);
  if (!gh) return false;
  ghosts.delete(el); clearTimeout(gh.t); railHeld.delete(el); held.delete(el);
  const s = dir === 'back' ? -1 : 1;
  runs.delete(el);
  el.style.setProperty('transition', 'none', 'important');
  write(el, s * gh.d, 0);
  start(el, 'rail-in', { x: 0, o: 1 }, RAIL_MS, delay);
  start(gh.g, 'rail-out', { x: -s * gh.d, o: 0 }, RAIL_MS, delay, () => drop(gh.g));
  return true;
}
/** Sends el's copy (every copy, with no el) out on the rail alone, its card left to its classes: no new card took its place. */
export function railAway(el) {
  for (const [e, gh] of [...ghosts]) {
    if (el && e !== el) continue;
    ghosts.delete(e); clearTimeout(gh.t);
    const s = gh.dir === 'back' ? -1 : 1;
    start(gh.g, 'rail-out', { x: -s * gh.d, o: 0 }, RAIL_MS, 0, () => drop(gh.g));
    if (railHeld.delete(e)) hold(e);
  }
}
/** Whether el waits behind its copy for its next words. */
export const railWaits = (el) => ghosts.has(el);

// ── Out on the tap, while the slide before is still settling (Mohammad, 2 Nov 2026: "when i hit next it takes time to move out of the
// way. it should all be responsive"). A Next pressed while the last change still runs (its landing, its after-steps) used to wait for it
// to finish before the cards moved. The cards that show set off now; out of sight, each is pinned at an inline 0, with no class of its
// own yet, until the change for the new slide takes it (its leave, a throw in), or lets it go (throwRelease).
const pinned = new Set();
export function throwOutNow(el, dir, dist) {
  if (!el) return;
  const s = dir === 'back' ? 1 : -1;
  start(el, 'out', { x: s * dist, o: 0 }, INSTANT ? RAIL_MS : D_SMALL, 0, () => {
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
