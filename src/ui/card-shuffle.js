// Shuffle: two cards in one place, for a screen too short to hold the teaching card and the data card one under the other
// (Mohammad, 19 Nov 2026, "I like shuffle, let's implement it when the vertical screen is not enough. No text scrolling inside cards.", from the
// mock /mnt/project-files/sideways-depth-mock, variation C). On an iPhone held sideways (844 x 390) the pair stood in about 245 px and an
// instrument card with its 12 px lettering ran off the screen or scrolled. Now each card has the whole room, one in front and one behind it, its
// top edge showing above the front card as a strip. A swipe up or down (a tap on the strip) shuffles them: the front card slips out to the
// right with a small tilt and tucks behind, the one behind grows forward, in one spring that follows the finger.
//
// How it moves (presenter-ladders.js decides WHEN, this file decides HOW):
//  - one position p, 0 = the words in front, 1 = the instrument in front; a critically damped spring (no bounce) takes it to the nearest end;
//  - each card is moved by paused Web Animations that this file scrubs with `currentTime = p * 1000`: a transform that is ADDED to whatever
//    transform the card already has (a card thrown away by a swipe, or leaving, keeps its own), a clip-path that shows only the strip while it is
//    behind, and a dimming veil (its ::after) that darkens it. The page writes nothing per frame but those times; the moving is the compositor's;
//  - layout reads happen with the animations parked (park(), resume()), so no box is ever measured through the shuffle's own transform;
//  - the card in front is the one above in z-order (class pz-shuf-data on the root while the instrument is in front, flipped as the two cross).
//
// Pure helpers (shufPose, shufKeyframes, shufDim, spring) are unit-tested in node: tests/card-shuffle.test.js.

import { frameFor } from './frame.js';
import { clamp01, lerp } from './num.js';
import { readMetric, readBox } from './layout-snap.js';

export const SHUF = Object.freeze({
  lift: 22,       // px of the slot above the front card where the strip of the card behind shows
  strip: 24,      // px of the card behind that shows (about the lift, over the card in front's top edge, so it never crosses into it): its top edge, its title or its header
  gapX: 14,       // px between the leaving card and the one standing, at the middle of the shuffle: the leaving card slips out to the right by its own width and this, so at the middle the two do not overlap and the order of their layers is swapped where nothing shows
  drop: 18,       // px the leaving card sinks at the middle
  tilt: 0,        // degrees it turns at the middle (none: the glass follows a translation and a scale at rest, never a turn)
  back: 0.92,     // the size of the card behind
  dimData: 0.26,  // how dark the data card is while it is behind
  dimWords: 0.14, // and the teaching card's two layers (its words, its glass): each half the weight, they stand one over the other
  wide: 'min(520px, 62vw)',   // the cards' width (--pz-cw) on a screen too short for the pair at the usual 340: a wider column holds the same words and instrument in fewer lines, so more fit stacked and fewer need to shuffle
  drag: 170,      // px of finger travel for the whole shuffle
  radius: 18,     // px, the cards' corner (the clip keeps it)
  steps: 12,      // keyframes along the way (the curve between them is a straight line, the sine is smooth at this many)
  w: 13,          // the spring's stiffness: about 0.4 s to settle
});


/**
 * Where a card is when the shuffle is at p (0: the words in front; 1: the instrument in front). card: 'words' or 'data'; h: the card's height, px
 * (the card turns about its centre; its top edge is held where the pose says so; lo: the px that show while it is behind; w: its width, which sets how far it slips out). → { f (0 behind, 1 in front), x, y (the top edge's shift), s, rz, ty (the translateY that does it), vis (px of the card that show) }
 */
export function shufPose(card, p, h, lo = SHUF.strip, w = 0) {
  const q = clamp01(p), f = card === 'words' ? 1 - q : q;
  const o = card === 'words' ? Math.sin(Math.PI * q) : 0;   // (the words' card is the one that slips out and back: the same way whichever way the swipe goes)
  const s = lerp(SHUF.back, 1, f) - 0.02 * o;
  const y = lerp(-SHUF.lift, 0, f) + SHUF.drop * o;
  const vis = lo + (h - lo) * f * f * (3 - 2 * f);   // (smoothstep: the strip stays a strip until the card is well on its way forward)
  return { f, x: (w + SHUF.gapX) * o, y, s, rz: SHUF.tilt * o, ty: y - (1 - s) * h / 2, vis: Math.min(h, vis) };
}

/** How dark a card is at p (0 to 1, the veil's opacity). words: true for a layer of the teaching card; layers: how many stand over one another. */
export function shufDim(card, p, layers = 1) {
  const f = card === 'words' ? 1 - clamp01(p) : clamp01(p);
  const top = card === 'words' ? SHUF.dimWords / layers : SHUF.dimData;
  return top * (1 - f);
}

const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/**
 * How much of a card's words and numbers show while the card is f of the way forward (0 behind, 1 in front): none while it is a strip, whole once it is well on its
 * way. The strip shows the card's edge and its handle and never a piece of a line (19 Nov 2026, the sweep: a half line of the card behind showed in 406 of 412 Shuffle
 * slides, cut across by the strip's edge; Mohammad: "disgusting stray text"). The words are not clipped to a line, they are not there: whatever the card holds, however tall its first line.
 */
export const shufInk = (f) => smooth(INK_FROM, INK_TO, f);
/** The handle in the strip: a short bar that says "this card is behind, swipe or tap". Whole while the card is behind, gone before the card is half forward. */
export const shufHandle = (f) => 1 - smooth(HANDLE_FROM, HANDLE_TO, f);
const INK_FROM = 0.3, INK_TO = 0.75, HANDLE_FROM = 0.05, HANDLE_TO = 0.45;

/** The keyframes of one card's transform (to be ADDED to its own), its clip-path, its veil, its contents' opacity (ADDED to their own: 0 whole, -1 gone) and its handle's, from p = 0 (offset 0) to p = 1 (offset 1). */
export function shufKeyframes(card, h, layers = 1, lo = SHUF.strip, w = 0) {
  const tf = [], clip = [], dim = [], ink = [], tab = [];
  for (let i = 0; i <= SHUF.steps; i++) {
    const offset = i / SHUF.steps, g = shufPose(card, offset, h, lo, w);
    tf.push({ offset, transform: `translate(${g.x.toFixed(2)}px, ${g.ty.toFixed(2)}px) rotate(${g.rz.toFixed(3)}deg) scale(${g.s.toFixed(4)})` });
    // (the front card's clip reaches 40 px past its box on every side, so its shadow is never cut; the strip's clip is the card's own edge)
    const e = 40 * g.f;
    clip.push({ offset, clipPath: `inset(${(-e).toFixed(1)}px ${(-e).toFixed(1)}px ${(h - g.vis - e).toFixed(1)}px ${(-e).toFixed(1)}px round ${SHUF.radius}px)` });
    dim.push({ offset, opacity: shufDim(card, offset, layers).toFixed(3) });
    ink.push({ offset, opacity: (shufInk(g.f) - 1).toFixed(3) });
    tab.push({ offset, opacity: shufHandle(g.f).toFixed(3) });
  }
  return { tf, clip, dim, ink, tab };
}

/** One step of the critically damped spring toward `target`: { p, v, done }. dt in seconds (never more than 32 ms). */
export function spring(p, v, target, dt, w = SHUF.w) {
  const d = Math.min(0.032, Math.max(0, dt)), x = p - target;
  const nv = v + (-2 * w * v - w * w * x) * d, np = p + nv * d;
  if (Math.abs(np - target) < 0.0005 && Math.abs(nv) < 0.005) return { p: target, v: 0, done: true };
  return { p: np, v: nv, done: false };
}

/** The end a release goes to: where a throw of the finger's speed (p per second) would carry p. */
export const shufEnd = (p, v) => (p + v * 0.16 > 0.5 ? 1 : 0);
/**
 * Where a let-go swipe sends the cards: a swipe up brings the instrument forward, a swipe down the words, whatever the cards were doing (a swipe in the middle of a
 * glide takes the spring over, so six alternating swipes are six moves); a swipe too short and slow to mean either goes to the nearer end. dy: the finger's travel, px, up positive.
 */
export function shufDir(p, v, dy) {
  const fast = Math.abs(v) > 0.8;
  if (fast || Math.abs(dy) >= 18) return (fast ? v > 0 : dy > 0) ? 1 : 0;
  return p > 0.5 ? 1 : 0;
}
/** The position of a finger that has moved dy px up (negative dy is down) from where p was p0: it gives past the ends. */
export function shufDrag(p0, dy) {
  const v = p0 + dy / SHUF.drag;
  return v < 0 ? v * 0.25 : v > 1 ? 1 + (v - 1) * 0.25 : v;
}

/**
 * The shuffle of the presenter's two cards. live.ui: { root, text, shade, data }. All methods are safe to call when it is off.
 *   sync(on, key)   after a layout: on = the slide's pair is shuffled; key = the slide and size it was laid out for (a new key brings the words back in front)
 *   park() / resume()   take the animations off for a layout read, put them back
 *   active()        the shuffle is on
 *   touch(type, y, onBehind)  a finger: 'start' (onBehind: it came down on the card behind, so a tap there brings that card forward), 'move', 'end'
 *   go(to)          springs to 0 or 1
 */
export function createShuffle(live) {
  let on = false, key = '', p = 0, v = 0, target = 0, dragging = false, raf = 0, last = 0, parked = 0, tapOK = false;
  let anims = [];   // [{ el, tf, clip, dim }]
  let y0 = 0, p0 = 0, hist = [], moved = false, lastDy = 0;
  const nowMs = () => performance.now();

  const root = () => live.ui?.root;
  function dropAnims() { for (const a of anims) for (const k of [a.tf, a.clip, a.dim, a.tab, ...(a.inks || [])]) { try { k?.cancel(); } catch { /* (an animation already gone) */ } } anims = []; }
  function scrub() { const t = p * 1000; for (const a of anims) { a.tf.currentTime = t; a.clip.currentTime = t; a.dim.currentTime = t; if (a.tab) a.tab.currentTime = t; for (const k of a.inks) k.currentTime = t; } }
  function front() { const r = root(); if (r) r.classList.toggle('pz-shuf-data', p > 0.5); }

  function build() {
    dropAnims();
    const ui = live.ui;
    if (!ui || !on) return;
    // (The words' card stands pad px below its glass's top: the words give no strip of their own (the card behind shows its glass and its kicker only: a strip of
    // the title's first line, cut in half, read as text over text), so the words' lo is 0.)
    const sets = [[ui.text, 'words', 2, 0, false], [ui.shade, 'words', 2, SHUF.strip, true], [ui.data, 'data', 1, SHUF.strip, true]];
    for (const [el, card, layers, lo, glass] of sets) {
      if (!el || !el.animate) continue;
      const h = readMetric(el, 'offsetHeight'), b = readBox(el);
      if (!(h > 0) || !b) continue;
      const w = b.width;
      const kf = shufKeyframes(card, h, layers, lo, w);
      const mk = (frames, opts, on = el) => { const a = on.animate(frames, { duration: 1000, fill: 'both', easing: 'linear', ...opts }); a.pause(); a.currentTime = p * 1000; return a; };   // motion-scale: own pace (paused: the finger and the spring set the time, 1000 is the timeline's unit, never a length of time)
      anims.push({
        el, card, h, w, lo, top: b.top, left: b.left, glass,
        tf: mk(kf.tf, { composite: 'add' }),
        clip: mk(kf.clip),
        dim: mk(kf.dim, { pseudoElement: '::after' }),
        // (The words and numbers of a card behind are not there, and its handle is: the strip never holds a piece of a line. Each part of the card takes the same
        // keyframes, added to its own opacity, so a part that is fading in or out for its own reasons keeps doing it.)
        inks: [...el.children].filter((c) => c.animate).map((c) => mk(kf.ink, { composite: 'add' }, c)),
        tab: glass ? mk(kf.tab, { pseudoElement: '::before' }) : null,
      });
    }
    front();
  }

  // The foot a glass is cut at (the GPU draws it in the figure's canvas, where a page clip-path cannot reach it): client px, from where the card stands now. One kept
  // object per element, read by the glass in each frame it draws (glass-gl.js, cards.cut): the strip's foot while the card is behind, no cut once it is in front.
  const cuts = new WeakMap(), FAR = 1e6;
  function footOf(el) {
    if (!on) return FAR;
    for (const a of anims) {
      if (a.el !== el || !a.glass) continue;
      const g = shufPose(a.card, p, a.h, a.lo, a.w);
      return g.f > 0.995 ? FAR : a.top + g.y + g.vis * g.s;
    }
    return FAR;
  }
  const cutOf = (el) => {
    if (!on || !el) return null;
    let c = cuts.get(el);
    if (!c) { c = { get bottom() { return footOf(el); } }; cuts.set(el, c); }
    return c;
  };
  // Whether a client point is on the strip of the card behind (a finger's width taller than the strip, never under 36 px).
  function stripHit(x, y) {
    if (!on) return false;
    const behind = p > 0.5 ? 'words' : 'data';
    for (const a of anims) {
      if (a.card !== behind || !a.glass) continue;
      const g = shufPose(a.card, p, a.h, a.lo, a.w), left = a.left + g.x + a.w * (1 - g.s) / 2, top = a.top + g.y;
      const hh = Math.max(36, g.vis * g.s);
      return x >= left - 6 && x <= left + a.w * g.s + 6 && y >= top - 6 && y <= top + hh;
    }
    return false;
  }

  function frame(ts) {
    raf = 0;
    if (!on) return;
    if (!dragging) {
      const dt = last ? (ts - last) / 1000 : 0.016; last = ts;
      const s = spring(p, v, target, dt);
      p = s.p; v = s.v;
      scrub(); front();
      if (!s.done) raf = frameFor('shuffle')(frame);
      else last = 0;
    }
  }
  function run() { if (!raf && on) { last = 0; raf = frameFor('shuffle')(frame); } }

  const api = {
    active: () => on,
    front: () => (p > 0.5 ? 'data' : 'words'),
    position: () => p,
    sync(next, k) {
      const r = root();
      const was = on;
      on = !!next;
      if (r) { r.classList.toggle('pz-shuf', on); live.ui.shade?.classList.toggle('pz-shuf', on); live.ui.data?.classList.toggle('pz-shuf', on); }
      if (!on) { dropAnims(); if (r) r.classList.remove('pz-shuf-data'); p = 0; v = 0; target = 0; key = ''; return; }
      // (A new slide or size: the words come back in front, by the spring, never by a jump: the cards are still leaving or just arriving.)
      if (k !== key) { key = k; if (was && p !== 0) { target = 0; v = 0; } else { p = 0; target = 0; v = 0; } }
      if (!parked) build();   // (a layout in progress parks it: resume() builds it once the cards are measured)
      if (target !== p || v) run();
    },
    park() { parked++; if (anims.length) dropAnims(); },
    resume() { if (parked > 0) parked--; if (!parked && on) build(); },
    go(to) { if (!on) return; target = to; run(); },
    cutOf,
    stripHit,
    /** A card is to be zoomed: it is brought to the front (the pair then holds still while the zoom is up: touch). */
    hold(card) { if (!on) return; target = card === 'words' ? 0 : 1; v = 0; run(); },
    settled: () => !dragging && !raf && p === target,
    touch(type, y, onBehind) {
      if (!on) return;
      if (live.ui?.zoom?.on) return;   // (a card zoomed: the pair holds still)
      if (type === 'start') { dragging = true; moved = false; lastDy = 0; tapOK = !!onBehind; y0 = y; p0 = p; v = 0; hist = [[nowMs(), p]]; target = p; return; }
      if (!dragging) return;
      if (type === 'move') {
        const dy = y0 - y;
        if (Math.abs(dy) > 4) moved = true;
        lastDy = dy; p = shufDrag(p0, dy); target = p;
        scrub(); front();
        const n = nowMs(); hist.push([n, p]); while (hist.length > 2 && n - hist[0][0] > 90) hist.shift();
        return;
      }
      // end
      dragging = false;
      if (!moved) { if (tapOK) { target = p < 0.5 ? 1 : 0; v = 0; run(); } return; }
      const a = hist[0], b = hist[hist.length - 1];
      v = (b[1] - a[1]) / Math.max(1, b[0] - a[0]) * 1000;
      target = shufDir(p, v, lastDy); run();
    },
  };
  return api;
}
