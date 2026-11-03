// The view pill's fold (main.js): when its buttons change (the Sinusoid button comes with the lobule and goes with it;
// Anatomy and Circuit go into the sinusoid view and come back out of it), the pill does not snap to its new width. Its face
// (.vp-face, the glass behind the buttons) grows or shrinks about its centre, the buttons that stay slide to their new
// places, and a button that comes or goes travels with its nearest neighbour that stays, uncovered or covered by the
// moving edge of the face: the Sinusoid button slides out from behind Lobule, Anatomy and Circuit fold in behind it
// (17 Oct, Mohammad). All of it on one clock and curve (FOLD_MS, FOLD_EASE), while the pill as a whole glides with the zoom.
//
// Only transform and opacity move the buttons (no layout per frame, and nothing the dock's ResizeObserver
// sees); the face is an absolutely placed box with nothing inside, so its width eases at no cost to anything else.
// Every measure is taken in the pill's own px from its centre, so a glide of the whole pill (main.js) does not enter it,
// and one fold taking over from another starts from wherever the buttons and the face are drawn at that moment.

// (The glide rides the camera's curve, the quintic of ease.js, and its CSS copy is --ease-move: one curve for a move, premium-feel R3.)
import { easeMove, D_SURFACE, EASE_ARRIVE } from './ease.js';
import { readStyle } from './layout-snap.js';
import { splitFace } from './face-split.js';
export const easeIO3 = easeMove;
// The fold is quicker than the zoom it plays in (17 Oct, Mohammad: "should be faster and eased"), on the app's own ease
// (tokens.css --ease: quick off the mark, settling gently), so the buttons have folded well before the pill lands.
export const FOLD_MS = D_SURFACE, FOLD_EASE = EASE_ARRIVE;

/**
 * The fold, worked out. before / after: the buttons drawn then and at rest, each { key, l, r, o } (left and right edges in the
 * pill's px from its centre, and opacity); order: every key in the buttons' order. Per key that moves:
 * { kind: 'stay' | 'in' | 'out', dx0, dx1, o0, o1 }: its offset at the start and at the end, from its resting place (stay,
 * in) or from where it was drawn (out, which a ghost plays), and its opacity at the start and the end.
 */
export function foldPlan(before, after, order) {
  const b = new Map(before.map((e) => [e.key, e])), a = new Map(after.map((e) => [e.key, e]));   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  const stay = order.filter((k) => b.has(k) && a.has(k));   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  const shift = (k) => b.get(k).l - a.get(k).l;   // (how far a staying button starts from its resting place)   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  // A button that comes or goes moves with the staying button nearest it, so it is never drawn over that one.
  const near = (k) => {   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    const i = order.indexOf(k);
    let best = null;
    for (const s of stay) if (best == null || Math.abs(order.indexOf(s) - i) < Math.abs(order.indexOf(best) - i)) best = s;
    return best == null ? 0 : shift(best);
  };
  const plan = new Map();   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  for (const k of order) {
    if (b.has(k) && a.has(k)) plan.set(k, { kind: 'stay', dx0: shift(k), dx1: 0, o0: b.get(k).o, o1: 1 });   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    else if (a.has(k)) plan.set(k, { kind: 'in', dx0: near(k), dx1: 0, o0: 0, o1: 1 });   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    else if (b.has(k)) plan.set(k, { kind: 'out', dx0: 0, dx1: -near(k), o0: b.get(k).o, o1: 0 });   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  }
  return plan;
}

/** The clip that keeps the buttons inside the face, as insets (px) from the button row's own box: seg is the row's { l, r }. */
export const faceClip = (w, seg) => ({ l: -w / 2 - seg.l, r: seg.r - w / 2 });

/**
 * A coming or going button shown only inside the face, by its opacity alone (no clip: a clip-path repaints the row every frame).
 * l, r: its edges at rest (pill px from the centre); pl, pr: its padding, so a..b is its word; dx0 → dx1 its offset; o0 → o1 its own
 * fade; e0 → e1 the face's half width; inset: how far the face's rounded end sits in from its half width at the word's height. All of
 * these move linearly in the fold's eased progress, so the keyframes' offsets are taken in it (the effect carries the easing).
 *
 * The word shows only while all of it is inside the face: its opacity is its own fade times its margin to the face's nearer edge over
 * a short ramp, and zero while any of it is outside. (It used to show by the share the face covered, so a half-covered word was drawn
 * at half strength past the pill's edge mid-fold, 2 Nov.) Each margin is linear in the progress, so the moment it reaches zero and the
 * moment it reaches the ramp are keyframes of their own: between two keyframes the word's opacity eases while the margin stays on
 * one side of zero, and no frame draws any of it outside. The ramp is never longer than the margin the word has at rest, so the last
 * keyframe (a coming word) or the first (a going one) is the word at rest, at its full fade.
 */
export const FADE_RAMP = 8;
export function coverFade({ l, r, pl = 0, pr = 0, dx0, dx1, o0, o1, e0, e1, inset = 0 }, steps = 16) {
  const a0 = l + pl, b0 = r - pr;
  // The two margins (left edge of the face to the word's left, the word's right to the face's right edge), each m + k p.
  const lin = [   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    { m: (a0 + dx0) + (e0 - inset), k: (dx1 - dx0) + (e1 - e0) },   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    { m: (e0 - inset) - (b0 + dx0), k: (e1 - e0) - (dx1 - dx0) },   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  ];
  const margin = (p) => Math.min(...lin.map((q) => q.m + q.k * p));   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  const restP = o1 >= o0 ? 1 : 0, ramp = Math.max(1e-3, Math.min(FADE_RAMP, margin(restP)));
  const at = new Set();   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  for (let i = 0; i <= steps; i++) at.add(i / steps);
  for (const q of lin) {
    if (Math.abs(q.k) < 1e-9) continue;
    for (const v of [0, ramp]) { const p = (v - q.m) / q.k; if (p > 0 && p < 1) at.add(p); }   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  }
  return [...at].sort((x, y) => x - y).map((p) => {   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
    const show = Math.max(0, Math.min(1, margin(p) / ramp));
    return { offset: p, opacity: +((o0 + (o1 - o0) * p) * show).toFixed(4) };   // alloc-rare: plans the pill's fold once per change of its buttons (a tap), not per frame; the plan and keyframes are handed to the Web Animations API, which runs them on the compositor
  });
}

const running = new Set();
// While a fold plays, the row wears .vp-fold: the highlight (seg-glide.js, the row's ::before)
// then travels on the fold's clock and curve, so it lands on its button as the button lands, inside the face as it grows or shrinks.
let folding = null, foldTimer = 0;
function unmark() {
  clearTimeout(foldTimer); foldTimer = 0;
  if (folding) { folding.classList.remove('vp-fold'); folding = null; }
}
/** Ends a fold where it stands: its animations dropped (each button at rest) and its ghosts removed. */
export function stopFold() {
  for (const x of running) { if (x instanceof Element) x.remove(); else x.cancel(); }
  running.clear();
  unmark();
}

/** What the pill draws now: its face's width and each button's edges and opacity, in its own px from its centre. */
export function pillState(seg, box) {
  const B = box.getBoundingClientRect(), z = box.offsetHeight ? B.height / box.offsetHeight : 1, cx = B.left + B.width / 2;
  const face = box.querySelector(':scope > .vp-face');
  if (!B.width || !face) return null;
  const btns = [];   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  for (const el of seg.querySelectorAll(':scope > button')) {   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    const key = el.dataset.ghostOf || el.dataset.view;
    if (!key || !el.getClientRects().length || btns.some((e) => e.key === key)) continue;   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    const q = el.getBoundingClientRect(), cs = getComputedStyle(el);
    btns.push({ key, el, l: (q.left - cx) / z, r: (q.right - cx) / z, pl: parseFloat(cs.paddingLeft) || 0, pr: parseFloat(cs.paddingRight) || 0, o: +cs.opacity, fs: parseFloat(cs.fontSize) || 0 });   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  }
  const S = seg.getBoundingClientRect(), F = face.getBoundingClientRect(), rad = parseFloat(readStyle(face).borderTopLeftRadius) || 0;
  // (The face's rounded end, at the height of a word: a word's glyphs stand about 0.6 em either side of the pill's middle.)
  const hy = Math.min(rad, 0.6 * Math.max(0, ...btns.map((e) => e.fs)));   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  const inset = rad > 0 ? rad - Math.sqrt(rad * rad - hy * hy) : 0;
  return { w: F.width / z, inset, btns, seg: { l: (S.left - cx) / z, r: (S.right - cx) / z, t: (S.top - B.top) / z, b: (B.bottom - S.bottom) / z } };   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
}

/**
 * Plays the fold from `before` (pillState, taken before the buttons changed) to the pill as it now rests in `box`, over ms.
 * (A running fold is taken over: its picture was in `before`.)
 */
export function foldPill(seg, box, before, ms = FOLD_MS) {
  stopFold();
  const after = pillState(seg, box);
  if (!after || !(ms > 0)) return;
  const order = [...seg.querySelectorAll(':scope > button[data-view]')].map((el) => el.dataset.view);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  const plan = foldPlan(before.btns, after.btns, order);
  const moves = Math.abs(before.w - after.w) > 0.5 || [...plan.values()].some((p) => p.kind !== 'stay' || Math.abs(p.dx0) > 0.5 || p.o0 < 0.99);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  if (!moves) return;
  folding = seg; seg.classList.add('vp-fold');   // (app.css gives the highlight --d-surface on --ease-arrive: FOLD_MS, FOLD_EASE)
  foldTimer = setTimeout(unmark, ms + 60);
  const opt = { duration: ms, easing: FOLD_EASE }, keep = (a) => { running.add(a); a.onfinish = a.oncancel = () => running.delete(a); return a; };   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  // (The face's width eased on the compositor: two halves that only translate, face-split.js. The face is centred in the pill: its
  // edges are the pill's centre ± half its width. A face narrower than its two corners takes the new width at once: the pill never is.)
  const face = box.querySelector(':scope > .vp-face'), cx = box.clientWidth / 2;
  const sp = splitFace(face, { a0: cx - before.w / 2, b0: cx + before.w / 2, a1: cx - after.w / 2, b1: cx + after.w / 2 }, opt);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  if (sp) keep(sp);
  const real = (k) => seg.querySelector(`:scope > button[data-view="${k}"]`);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  for (const [k, p] of plan) {
    if (p.kind !== 'out') {
      const at = after.btns.find((e) => e.key === k);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
      if (p.kind === 'in' && at) {
        keep(real(k).animate([{ transform: `translateX(${p.dx0.toFixed(2)}px)` }, { transform: 'none' }], opt));   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
        const fade = coverFade({ l: at.l, r: at.r, pl: at.pl, pr: at.pr, inset: after.inset, dx0: p.dx0, dx1: 0, o0: p.o0, o1: 1, e0: before.w / 2, e1: after.w / 2 });   // (opacity keyframes only)   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
        keep(real(k).animate(fade, opt));
      } else keep(real(k).animate([{ transform: `translateX(${p.dx0.toFixed(2)}px)`, opacity: p.o0 }, { transform: 'none', opacity: 1 }], opt));   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
      continue;
    }
    // A button going away: a copy of it stays in the row (out of its layout) where it was drawn and travels with its
    // neighbour while the face's edge covers it. (Not a button the page knows: no data-view, so nothing finds or hides it.)
    const was = before.btns.find((e) => e.key === k), g = real(k).cloneNode(true);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    for (const at of ['data-view', 'title', 'hidden']) g.removeAttribute(at);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    g.setAttribute('aria-hidden', 'true'); g.inert = true; g.tabIndex = -1; g.dataset.ghost = ''; g.dataset.ghostOf = k; g.classList.add('vp-ghost');
    Object.assign(g.style, { position: 'absolute', top: '0', left: `${(was.l - after.seg.l).toFixed(2)}px`, width: `${(was.r - was.l).toFixed(2)}px`, margin: '0', pointerEvents: 'none' });   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    seg.append(g); running.add(g);
    g.animate([{ transform: 'none' }, { transform: `translateX(${p.dx1.toFixed(2)}px)` }], { ...opt, fill: 'forwards' });   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    const fade = coverFade({ l: was.l, r: was.r, pl: was.pl, pr: was.pr, inset: after.inset, dx0: 0, dx1: p.dx1, o0: p.o0, o1: 0, e0: before.w / 2, e1: after.w / 2 });   // (opacity keyframes only)   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    const a = g.animate(fade, { ...opt, fill: 'forwards' });   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    a.onfinish = () => { g.remove(); running.delete(g); };   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
    running.add(a); a.oncancel = () => running.delete(a);   // alloc-rare: once per change of the view pill's buttons (a tap), not per frame: reads the pill, builds the fold's animations and the ghost of a going button
  }
  // (A button coming or going shows only as the face covers it, by its opacity: coverFade. The row is never clipped.)
}
