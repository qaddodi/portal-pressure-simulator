// The wallet: two cards in one place, for a screen too short to hold the teaching card and the data card one under the other
// (Mohammad, 19 Nov 2026: "the shuffle on the landscape iphone SUCKS ... let's do wallet and can be swiped up or down and change the card ... and card centered vertically",
// from the mock /mnt/project-files/sideways-alt-mocks/index.html, which replaced the depth-stack "Shuffle" of /mnt/project-files/sideways-depth-mock). On an iPhone held sideways
// (852 x 393) the pair stood in about 245 px and an instrument card with its 12 px lettering ran off the screen or scrolled. Now each card has the whole room, one centred on the
// screen in front and the other waiting behind it at the foot, its top 48 px showing as a strip (its grab bar and its name). A swipe up or down on either card (a tap on the strip) changes the
// card: the one at the foot rises over the one in front, which sinks to the foot behind it. Nothing scales, turns or is clipped: the glass follows a translation and nothing else.
// (The file keeps its name and the page its `shuffle`/`pz-shuf` names: the sweep, the gallery and the throw already speak them.)
//
// How it moves (presenter-ladders.js decides WHEN and where the cards stand, this file decides HOW they move):
//  - one position p, 0 = the words in front, 1 = the instrument in front; a critically damped spring (no bounce) takes it to the nearer end;
//  - each card is moved by paused Web Animations that this file scrubs with `currentTime = p * 1000`: a translateY that is ADDED to whatever transform the card already has (a card
//    thrown away by a swipe, or leaving, keeps its own), and the opacity of its words and numbers, which are taken out while it is a strip (never a half line of text) and its strip's
//    name. The page writes nothing per frame but those times; the moving is the compositor's;
//  - the cards stand at rest centred top to bottom, each by its own height; the animation only carries the one behind down to the foot and back. Its translate is a share of the card's own
//    box (50 %) and one length that does not depend on the card (half the screen less the strip), so a slide change that gives the card a new height keeps a true pose (CRD-3);
//  - layout reads happen with the animations parked (park(), resume()), so no box is ever measured through the shuffle's own transform;
//  - the card coming forward is always the one above in z-order (class pz-shuf-data on the root while the instrument is the one coming or in front), so nothing flips mid-move.
//
// Pure helpers (shufFall, shufPoseCss, shufKeyframes, shufDrag, shufDir, spring) are unit-tested in node: tests/card-shuffle.test.js.

import { frameFor } from './frame.js';
import { readMetric, readBox } from './layout-snap.js';
import { setThrowPose } from './card-throw.js';

export const SHUF = Object.freeze({
  strip: 48,      // px of the card behind that show at the foot of the screen: its grab bar and its name (a finger's height, never a piece of a line)
  gap: 14,        // px least between the foot of the card in front and the top of the strip
  cols: ['min(400px, 62vw)', 'min(460px, 62vw)', 'min(520px, 62vw)'],   // the wallet's card widths (--pz-cw), one for both cards, centred on the screen: 400 first; a slide whose words or instrument need more height takes a wider column (fewer lines), never a smaller type
  drag: 190,      // px of finger travel for the whole change
  steps: 12,      // keyframes along the way
  w: 14,          // the spring's stiffness: about 0.4 s to settle
});


const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The tallest a card in front can be: centred, with the strip and its gap below it (and the same above, so it stays centred). H: the screen's height. */
export const shufMaxH = (H) => Math.max(0, H - 2 * (SHUF.strip + SHUF.gap));

// The screen's height and the padding of the words' glass, in the page's px: written by sync() after each layout, read by every pose (module state: the throw composes the same pose).
const geom = { H: 390, pad: 0 };
export const shufGeom = () => geom;

/**
 * How far down (px) a card at rest must go to stand at the foot, strip showing. card: 'words' (the glass), 'text' (the words, which stand a padding inside the glass) or 'data';
 * h: the card's own box height. Both layers of the teaching card come to the same place: the glass is centred, so its fall is half its height plus half the screen less the strip;
 * the words' own box is two paddings shorter, so its share is the glass's less their half, and it adds the padding back. Pure: the geometry is an argument.
 */
export function shufFall(card, h, geo = geom) {
  return h / 2 + geo.H / 2 - SHUF.strip + (card === 'text' ? geo.pad : 0);
}

/** Where a card is when the wallet is at p: g = how far toward the foot (0 in front, 1 behind). */
export const shufBehind = (card, p) => { const q = clamp01(p); return card === 'data' ? 1 - q : q; };

/**
 * A card's pose at p as one CSS transform, free of the card's size: half the fall is a share of the card's own box (translate's percentages are those of the element's own box) and the rest is
 * one length that does not depend on the card, so the same text is right for a card of any height. It is the one text both the wallet's animation and the throw's inline write use
 * (card-throw.js composes it, setThrowPose), so a card thrown on a slide change keeps its place and the two never fight over `transform`.
 */
export function shufPoseCss(card, p, geo = geom) {
  const g = shufBehind(card, p);
  return `translateY(calc(${(g * 50).toFixed(3)}% + ${(g * (geo.H / 2 - SHUF.strip + (card === 'text' ? geo.pad : 0))).toFixed(2)}px))`;
}

const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const INK_FROM = 0.66, INK_TO = 0.96, NAME_FROM = 0.1, NAME_TO = 0.5;
/**
 * How much of a card's words and numbers show while the card is f of the way forward (0 behind, 1 in front): none while it is a strip or leaving, whole only as it arrives. The strip shows
 * the card's edge, its grab bar and its name and never a piece of a line (19 Nov 2026, the sweep: a half line of the card behind showed in 406 of 412 Shuffle slides; Mohammad:
 * "disgusting stray text"). The words are not clipped to a line, they are not there: whatever the card holds, however tall its first line. Moving, a card's words fade out early and in late, so none
 * shows past the card that is crossing it.
 */
export const shufInk = (f) => smooth(INK_FROM, INK_TO, f);
/** The strip's name: whole while the card is behind, gone before the card is half forward. */
export const shufName = (f) => 1 - smooth(NAME_FROM, NAME_TO, f);

/** The keyframes of one card's transform (to be ADDED to its own), its contents' opacity (ADDED to their own: 0 whole, -1 gone) and its strip's name, from p = 0 (offset 0) to p = 1 (offset 1). */
export function shufKeyframes(card, geo = geom) {
  const tf = [], ink = [], name = [];
  for (let i = 0; i <= SHUF.steps; i++) {
    const offset = i / SHUF.steps, f = 1 - shufBehind(card, offset);
    tf.push({ offset, transform: shufPoseCss(card, offset, geo) });
    ink.push({ offset, opacity: (shufInk(f) - 1).toFixed(3) });
    name.push({ offset, opacity: shufName(f).toFixed(3) });
  }
  return { tf, ink, name };
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
/** The end a finger started from: the nearer one. */
export const shufFrom = (p0) => (p0 < 0.5 ? 0 : 1);
/**
 * Where a let-go swipe sends the cards. A swipe up or down changes the card, whichever way it goes (Mohammad, 19 Nov: "swiped up or down and change the card"): up pulls the card at the
 * foot up over the front one, down sends the front one down; either way p goes to the end it did not start from. A swipe too short and slow to mean it goes to the nearer end.
 * p, v: where it is and its speed (p per second); dy: the finger's travel, px (either way); from: the end it started from (shufFrom).
 */
export function shufDir(p, v, dy, from = shufFrom(p)) {
  const toward = from === 0 ? v : -v;   // (the speed toward the other end)
  if (toward < -0.8) return from;       // (thrown back)
  if (toward > 0.8 || Math.abs(dy) >= 18) return 1 - from;
  return p > 0.5 ? 1 : 0;
}
/** The position of a finger that has moved dy px (up or down: the same change) from where p was p0: it goes toward the end it did not start from and stops there. */
export function shufDrag(p0, dy) {
  const from = shufFrom(p0), v = p0 + (from === 0 ? 1 : -1) * Math.abs(dy) / SHUF.drag;
  return clamp01(v);
}

/**
 * The wallet of the presenter's two cards. live.ui: { root, text, shade, data }. All methods are safe to call when it is off.
 *   sync(on, key, geo)   after a layout: on = the slide's pair is a wallet; key = the slide and size it was laid out for (a new key brings the words back in front); geo = { H, pad } the
 *                        screen's height and the words' glass padding, page px (the pose's one length)
 *   mark(on)        the classes alone, before the cards are fitted (the instruments read them), where sync comes after
 *   park() / resume()   take the animations off for a layout read, put them back
 *   active()        the wallet is on
 *   touch(type, y, onBehind)  a finger: 'start' (onBehind: it came down on the strip, so a tap there brings that card forward), 'move', 'end'
 *   go(to)          springs to 0 or 1
 */
export function createShuffle(live) {
  let on = false, key = '', p = 0, v = 0, target = 0, dragging = false, raf = 0, last = 0, parked = 0, tapOK = false;
  let anims = [];   // [{ el, card, h, top, left, w, tf, inks, mkInk, name }]
  let y0 = 0, p0 = 0, hist = [], moved = false, lastDy = 0, rising = 'data';
  const nowMs = () => performance.now();

  const root = () => live.ui?.root;
  // (CRD-3: a slide change replaces the words of the teaching card, the instrument's parts and the glass's children while the wallet stands: the layout, and with it the rebuild, waits for the
  // throws to land. A child that arrives is hidden at once if its card is behind: the one animation the others have, added to it here, in the microtask after the change, before any frame
  // shows it. Before, the new words stood with no hiding animation through the throw in and showed over the card in front.)
  const kids = typeof MutationObserver === 'function' ? new MutationObserver((recs) => {
    for (const r of recs) {
      const a = anims.find((x) => x.el === r.target);
      if (!a) continue;
      for (const c of r.removedNodes) { const i = a.inks.findIndex((k) => k.effect?.target === c); if (i >= 0) { try { a.inks[i].cancel(); } catch { /* (gone with its child) */ } a.inks.splice(i, 1); } }
      for (const c of r.addedNodes) if (c.nodeType === 1 && c.animate && !a.inks.some((k) => k.effect?.target === c)) a.inks.push(a.mkInk(c));   // alloc-rare: once per child that arrives while the wallet stands
    }
  }) : null;
  function dropAnims() { kids?.disconnect(); for (const a of anims) for (const k of [a.tf, a.name, ...(a.inks || [])]) { try { k?.cancel(); } catch { /* (an animation already gone) */ } } anims = []; }
  function scrub() { const t = p * 1000; for (const a of anims) { a.tf.currentTime = t; if (a.name) a.name.currentTime = t; for (const k of a.inks) k.currentTime = t; } }
  function marks(onNow) { const r = root(); if (r) { r.classList.toggle('pz-shuf', onNow); live.ui.shade?.classList.toggle('pz-shuf', onNow); live.ui.data?.classList.toggle('pz-shuf', onNow); } }
  // The card coming forward stands above the other for the whole change (the one rising from the foot is over the one that sinks behind it), so no layer is swapped where both show.
  function front() { const r = root(); if (r) r.classList.toggle('pz-shuf-data', rising === 'data'); }

  // The ink is every child of the card: its words, its numbers and the deck's tab, whose corner the nav pill would stand over at the foot. What the strip holds is the grab bar and the name, both drawn by the card itself.
  const inkKids = (el) => [...el.children].filter((c) => c.animate);

  function build() {
    dropAnims();
    const ui = live.ui;
    if (!ui || !on) return;
    // (The words' card is the glass (shade) and the words (text) on it: the same pose for both, the text's in its own box's terms. The glass and the instrument carry the strip's name.)
    const sets = [[ui.text, 'text', 'words', false], [ui.shade, 'words', 'words', true], [ui.data, 'data', 'data', true]];
    for (const [el, layer, card, glass] of sets) {
      if (!el || !el.animate) continue;
      const h = readMetric(el, 'offsetHeight'), b = readBox(el);
      if (!(h > 0) || !b) continue;
      const kf = shufKeyframes(layer, geom), ik = shufKeyframes(card, geom);
      const mk = (frames, opts, on = el) => { const a = on.animate(frames, { duration: 1000, fill: 'both', easing: 'linear', ...opts }); a.pause(); a.currentTime = p * 1000; return a; };   // motion-scale: own pace (paused: the finger and the spring set the time, 1000 is the timeline's unit, never a length of time)
      anims.push({
        el, card, layer, h, top: b.top, left: b.left, w: b.width, glass,
        tf: mk(kf.tf, { composite: 'add' }),
        // (The words and numbers of a card behind are not there, and its name is: the strip never holds a piece of a line. Each part of the card takes the same
        // keyframes, added to its own opacity, so a part that is fading in or out for its own reasons keeps doing it.)
        inks: inkKids(el).map((c) => mk(ik.ink, { composite: 'add' }, c)),
        mkInk: (c) => mk(ik.ink, { composite: 'add' }, c),
        name: glass ? mk(ik.name, { pseudoElement: '::after' }) : null,
      });
      kids?.observe(el, { childList: true });
    }
    front();
  }

  // Whether a client point is on the strip of the card behind (a finger's width taller than the strip, never under 36 px), and within the column.
  function stripHit(x, y) {
    if (!on) return false;
    const behind = p > 0.5 ? 'words' : 'data';
    for (const a of anims) {
      if (a.card !== behind || !a.glass) continue;
      const top = a.top + shufFall(a.layer, a.h) * shufBehind(a.layer, p);
      const hh = Math.max(36, SHUF.strip);
      return x >= a.left - 6 && x <= a.left + a.w + 6 && y >= top - 6 && y <= top + hh;
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
      scrub();
      if (!s.done) raf = frameFor('shuffle')(frame);
      else { last = 0; rising = p > 0.5 ? 'data' : 'words'; front(); }
    }
  }
  function run() { if (!raf && on) { last = 0; raf = frameFor('shuffle')(frame); } }

  // The pose a card has now, as the throw composes it into its own inline transform (card-throw.js): '' when the wallet is off or the element is not one of its cards. By the cards, not by the
  // built animations: a throw that begins before the rebuild still keeps the pose, and the first build never shows a snap when the throw lets go.
  const poseOf = (el) => {
    if (!on || !el) return '';
    const ui = live.ui;
    return el === ui?.text ? shufPoseCss('text', p) : el === ui?.shade ? shufPoseCss('words', p) : el === ui?.data ? shufPoseCss('data', p) : '';
  };
  setThrowPose(poseOf);
  const api = {
    poseOf,
    active: () => on,
    front: () => (p > 0.5 ? 'data' : 'words'),
    position: () => p,
    /** The classes only (no build, no motion): the layout writes the slide's decision before the cards are fitted, so the instruments draw against it, never against the last slide's (CRD-1). */
    mark(next) { marks(!!next); },
    sync(next, k, geo) {
      const r = root();
      const was = on;
      on = !!next;
      if (geo) { geom.H = geo.H; geom.pad = geo.pad || 0; }
      marks(on);
      if (!on) { dropAnims(); if (r) r.classList.remove('pz-shuf-data'); p = 0; v = 0; target = 0; key = ''; rising = 'data'; return; }
      // (A new slide or size: the words come back in front, by the spring, never by a jump: the cards are still leaving or just arriving.)
      if (k !== key) { key = k; if (was && p !== 0) { target = 0; v = 0; rising = 'words'; } else { p = 0; target = 0; v = 0; rising = 'words'; } }
      if (!parked) build();   // (a layout in progress parks it: resume() builds it once the cards are measured)
      if (target !== p || v) run();
    },
    park() { parked++; if (anims.length) dropAnims(); },
    resume() { if (parked > 0) parked--; if (!parked && on) build(); },
    go(to) { if (!on) return; rising = to === 1 ? 'data' : 'words'; front(); target = to; run(); },
    /** The glass of the card behind is not cut: it stands partly past the screen's foot, where nothing is drawn. (card-shuffle.js kept no cut since the wallet; the glass asks and is told none.) */
    cutOf: () => null,
    stripHit,
    /** A card is to be zoomed: it is brought to the front (the pair then holds still while the zoom is up: touch). */
    hold(card) { if (!on) return; rising = card === 'words' ? 'words' : 'data'; front(); target = card === 'words' ? 0 : 1; v = 0; run(); },
    settled: () => !dragging && !raf && p === target,
    touch(type, y, onBehind) {
      if (!on) return;
      if (live.ui?.zoom?.on) return;   // (a card zoomed: the pair holds still)
      if (type === 'start') { dragging = true; moved = false; lastDy = 0; tapOK = !!onBehind; y0 = y; p0 = p; v = 0; hist = [[nowMs(), p]]; target = p; rising = shufFrom(p0) === 0 ? 'data' : 'words'; front(); return; }
      if (!dragging) return;
      if (type === 'move') {
        const dy = y - y0;
        if (Math.abs(dy) > 4) moved = true;
        lastDy = dy; p = shufDrag(p0, dy); target = p;
        scrub();
        const n = nowMs(); hist.push([n, p]); while (hist.length > 2 && n - hist[0][0] > 90) hist.shift();
        return;
      }
      // end
      dragging = false;
      if (!moved) { if (tapOK) { rising = p < 0.5 ? 'data' : 'words'; front(); target = p < 0.5 ? 1 : 0; v = 0; run(); } return; }
      const a = hist[0], b = hist[hist.length - 1];
      v = (b[1] - a[1]) / Math.max(1, b[0] - a[0]) * 1000;
      target = shufDir(p, v, lastDy, shufFrom(p0)); run();
    },
  };
  return api;
}
