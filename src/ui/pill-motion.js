// The view pill's fold (main.js): when its buttons change (the Sinusoid button comes with the lobule and goes with it;
// Anatomy and Circuit go into the sinusoid view and come back out of it), the pill does not snap to its new width. Its face
// (.vp-face, the glass behind the buttons) grows or shrinks about its centre, the buttons that stay slide to their new
// places, and a button that comes or goes travels with its nearest neighbour that stays, uncovered or covered by the
// moving edge of the face: the Sinusoid button slides out from behind Lobule, Anatomy and Circuit fold in behind it
// (17 Oct, Mohammad). All of it on one clock and curve (FOLD_MS, FOLD_EASE), while the pill as a whole glides with the zoom.
//
// Only transform, opacity and clip-path move the buttons (no layout per frame, and nothing the dock's ResizeObserver
// sees); the face is an absolutely placed box with nothing inside, so its width eases at no cost to anything else.
// Every measure is taken in the pill's own px from its centre, so a glide of the whole pill (main.js) does not enter it,
// and one fold taking over from another starts from wherever the buttons and the face are drawn at that moment.

export const easeIO3 = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const EASE_IO3 = 'cubic-bezier(.65, 0, .35, 1)';   // (easeIO3 as a CSS curve)
// The fold is quicker than the zoom it plays in (17 Oct, Mohammad: "should be faster and eased"), on the app's own ease
// (tokens.css --ease: quick off the mark, settling gently), so the buttons have folded well before the pill lands.
export const FOLD_MS = 420, FOLD_EASE = 'cubic-bezier(.2, .8, .2, 1)';

/**
 * One frame of the pill's glide (main.js sinMotion), on one axis, all in screen px. at: the pill's centre as drawn now, which
 * holds its own shift (its transform) and the slide of the dock it sits on
 * (dock); from: where it was when the move began; k: the share of the way still to go (1 − ease). Its resting place is what is
 * left; the shift returned draws it at from + (rest − from)(1 − k), whatever the dock under it is doing. (The dock's slide is taken
 * off too: the pill rides on it, so leaving it in drew the pill off the screen with the dock, out of the sinusoid, 17 Oct.)
 */
export function glideShift(at, shift, dock, from, k) {
  const rest = at - shift - dock;
  return { rest, shift: (from - rest) * k - dock };
}

/**
 * The fold, worked out. before / after: the buttons drawn then and at rest, each { key, l, r, o } (left and right edges in the
 * pill's px from its centre, and opacity); order: every key in the buttons' order. Per key that moves:
 * { kind: 'stay' | 'in' | 'out', dx0, dx1, o0, o1 }: its offset at the start and at the end, from its resting place (stay,
 * in) or from where it was drawn (out, which a ghost plays), and its opacity at the start and the end.
 */
export function foldPlan(before, after, order) {
  const b = new Map(before.map((e) => [e.key, e])), a = new Map(after.map((e) => [e.key, e]));
  const stay = order.filter((k) => b.has(k) && a.has(k));
  const shift = (k) => b.get(k).l - a.get(k).l;   // (how far a staying button starts from its resting place)
  // A button that comes or goes moves with the staying button nearest it, so it is never drawn over that one.
  const near = (k) => {
    const i = order.indexOf(k);
    let best = null;
    for (const s of stay) if (best == null || Math.abs(order.indexOf(s) - i) < Math.abs(order.indexOf(best) - i)) best = s;
    return best == null ? 0 : shift(best);
  };
  const plan = new Map();
  for (const k of order) {
    if (b.has(k) && a.has(k)) plan.set(k, { kind: 'stay', dx0: shift(k), dx1: 0, o0: b.get(k).o, o1: 1 });
    else if (a.has(k)) plan.set(k, { kind: 'in', dx0: near(k), dx1: 0, o0: 0, o1: 1 });
    else if (b.has(k)) plan.set(k, { kind: 'out', dx0: 0, dx1: -near(k), o0: b.get(k).o, o1: 0 });
  }
  return plan;
}

/** The clip that keeps the buttons inside the face, as insets (px) from the button row's own box: seg is the row's { l, r }. */
export const faceClip = (w, seg) => ({ l: -w / 2 - seg.l, r: seg.r - w / 2 });

const running = new Set();
/** Ends a fold where it stands: its animations dropped (each button at rest) and its ghosts removed. */
export function stopFold() {
  for (const x of running) { if (x instanceof Element) x.remove(); else x.cancel(); }
  running.clear();
}

/** What the pill draws now: its face's width and each button's edges and opacity, in its own px from its centre. */
export function pillState(seg, box) {
  const B = box.getBoundingClientRect(), z = box.offsetHeight ? B.height / box.offsetHeight : 1, cx = B.left + B.width / 2;
  const face = box.querySelector(':scope > .vp-face');
  if (!B.width || !face) return null;
  const btns = [];
  for (const el of seg.querySelectorAll(':scope > button')) {
    const key = el.dataset.ghostOf || el.dataset.view;
    if (!key || !el.getClientRects().length || btns.some((e) => e.key === key)) continue;
    const q = el.getBoundingClientRect();
    btns.push({ key, el, l: (q.left - cx) / z, r: (q.right - cx) / z, o: +getComputedStyle(el).opacity });
  }
  const S = seg.getBoundingClientRect();
  return { w: face.getBoundingClientRect().width / z, btns, seg: { l: (S.left - cx) / z, r: (S.right - cx) / z, t: (S.top - B.top) / z, b: (B.bottom - S.bottom) / z } };
}

/**
 * Plays the fold from `before` (pillState, taken before the buttons changed) to the pill as it now rests in `box`, over ms.
 * (A running fold is taken over: its picture was in `before`.)
 */
export function foldPill(seg, box, before, ms = FOLD_MS) {
  stopFold();
  const after = pillState(seg, box);
  if (!after || !(ms > 0)) return;
  const order = [...seg.querySelectorAll(':scope > button[data-view]')].map((el) => el.dataset.view);
  const plan = foldPlan(before.btns, after.btns, order);
  const moves = Math.abs(before.w - after.w) > 0.5 || [...plan.values()].some((p) => p.kind !== 'stay' || Math.abs(p.dx0) > 0.5 || p.o0 < 0.99);
  if (!moves) return;
  const opt = { duration: ms, easing: FOLD_EASE }, keep = (a) => { running.add(a); a.onfinish = a.oncancel = () => running.delete(a); return a; };
  keep(box.querySelector(':scope > .vp-face').animate([{ width: `${before.w.toFixed(2)}px` }, { width: `${after.w.toFixed(2)}px` }], opt));
  const real = (k) => seg.querySelector(`:scope > button[data-view="${k}"]`);
  for (const [k, p] of plan) {
    if (p.kind !== 'out') {
      keep(real(k).animate([{ transform: `translateX(${p.dx0.toFixed(2)}px)`, opacity: p.o0 }, { transform: 'none', opacity: 1 }], opt));
      continue;
    }
    // A button going away: a copy of it stays in the row (out of its layout) where it was drawn and travels with its
    // neighbour while the face's edge covers it. (Not a button the page knows: no data-view, so nothing finds or hides it.)
    const was = before.btns.find((e) => e.key === k), g = real(k).cloneNode(true);
    for (const at of ['data-view', 'title', 'hidden']) g.removeAttribute(at);
    g.setAttribute('aria-hidden', 'true'); g.inert = true; g.tabIndex = -1; g.dataset.ghost = ''; g.dataset.ghostOf = k; g.classList.add('vp-ghost');
    Object.assign(g.style, { position: 'absolute', top: '0', left: `${(was.l - after.seg.l).toFixed(2)}px`, width: `${(was.r - was.l).toFixed(2)}px`, margin: '0', pointerEvents: 'none' });
    seg.append(g); running.add(g);
    const a = g.animate([{ transform: 'none', opacity: p.o0 }, { transform: `translateX(${p.dx1.toFixed(2)}px)`, opacity: 0 }], { ...opt, fill: 'forwards' });
    a.onfinish = () => { g.remove(); running.delete(g); };
    running.add(a); a.oncancel = () => running.delete(a);
  }
  // The row is cut to the face as it eases (round, as the face is), so a button coming or going shows only inside it.
  const rad = getComputedStyle(box).borderTopLeftRadius || '21px', s = after.seg;
  const clip = (w) => { const c = faceClip(w, s); return `inset(${(-s.t).toFixed(2)}px ${c.r.toFixed(2)}px ${(-s.b).toFixed(2)}px ${c.l.toFixed(2)}px round ${rad})`; };
  keep(seg.animate([{ clipPath: clip(before.w) }, { clipPath: clip(after.w) }], opt));
}
