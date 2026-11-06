// The scope view on the figure (mock C1, Mohammad 6 Nov 2026: "C1 is perfect; let's do it ... everywhere where we have scopes").
// On a slide that shows the varices (scope-lens-rule.js scopeLensFor) a ring sits on the varix columns of the lower esophagus with a
// small scope badge; it is one of the figure's marks, drawn by the GPU with the vessels (stage-clamps.js), so it moves with every zoom,
// pan and view change. Tapping it opens a round lens in the nearest empty space (never over the cards, the bar or the bleed), joined to
// the ring by a faint cone (figure marks, stage-clamps.js): the live endoscopic view (the scope instrument's own GPU field, instruments.js, with its bleed and bands).
//
// The lens is laid on the screen, so it never rides a move: as the figure starts to move (a pan, a pinch, a slide's camera glide, a
// resize or the switch to the Circuit) it hides at once, and once the figure has held still it opens again beside the ring where the
// ring now stands, as the corner credit does (credit.js). Nothing of it eases behind the figure. The cone is drawn by the figure's GPU marks,
// the field by the scope's shader into the cards' GPU drawer; the page paints neither.
import { h } from './util.js';
import { createEndoscopy } from './instruments.js';
import { wordSetter } from './gl-words.js';
import { frameFor } from './frame.js';
import { readBox, stageBox, safeSides } from './layout-snap.js';
import { placeLens, coneLines, ringHit, scopeLensFor } from './scope-lens-rule.js';
import { varicesPresent } from './store.js';

const nextFrame = frameFor('scope-lens');
const noop = () => {};
// (How long the figure must hold still before the lens opens again, ms, and how often it is looked at.)
const STILL_MS = 160;

/**
 * stage: the figure (setScopeRing, scopeRingAt, onScopeView, layoutKey); store: the app's store (frames); root: the element the lens is laid
 * in (the presenter's layer over the figure, the stage's own corner as 0, 0); avoid(): the elements the lens keeps clear of (the cards, the bar).
 */
export function createScopeLens({ stage, store, root, avoid = () => [] }) {
  const shut = h('button', { type: 'button', class: 'pz-lens-x', 'aria-label': 'Close the scope view', onclick: (e) => { e.stopPropagation(); close(); } }, '×');
  const disc = h('div', { class: 'pz-lens-disc', role: 'img', 'aria-label': 'Endoscopic view of the esophagus, live' });
  const cap = h('span', { class: 'pz-lens-cap' });
  const el = h('div', { class: 'pz-lens', hidden: '' }, disc, shut, cap);
  disc.addEventListener('click', () => close());
  root.prepend(el);   // (under the cards)
  const words = wordSetter([cap]);
  let inst = null, offFrame = null, offVx = null, has = false, want = false, isOpen = false, dead = false, stillT = 0, lastKey = '', capText = '', fp = null, feedAsk = 0;

  // ── The tap on the ring, and the figure moving ──
  function tap(cx, cy) {
    if (!want || !has || dead) return false;
    const ring = stage.scopeRingAt?.();
    if (!ring || !ringHit(cx - ring.ox, cy - ring.oy, ring)) return false;
    if (isOpen) close(); else open();
    return true;
  }
  // (The pointer over the ring, by a mouse: the figure's cursor turns to a hand, written only when that changes.)
  let hand = false;
  function hover(cx, cy, kind) {
    const ring = kind === 'mouse' && want && has && !dead ? stage.scopeRingAt?.() : null;
    const on = !!ring && ringHit(cx - ring.ox, cy - ring.oy, ring);
    if (on !== hand) { hand = on; (root.parentElement || root).classList.toggle('pz-lens-hand', on); }
  }
  function moved() {
    if (!isOpen || dead) return;
    // (Hidden at once, by its opacity alone: the one write a move may make; it is laid again, or hidden for good, once the figure is still.)
    if (el.style.opacity !== '0') el.style.opacity = '0';
    stage.setScopeCone?.(null);   // (the cone goes with it, and is laid again with it)
    lastKey = '';
    if (!stillT) stillT = setTimeout(stillCheck, STILL_MS);
  }
  // (The figure has held still once its view key reads the same twice, a look apart: then the lens opens again where the ring now is.)
  function stillCheck() {
    stillT = 0;
    if (!isOpen || dead) return;
    const k = stage.layoutKey?.() ?? '';
    if (k !== lastKey) { lastKey = k; stillT = setTimeout(stillCheck, STILL_MS); return; }
    place();
  }
  stage.onScopeView?.(moved, tap);
  const offView = store.on('view', moved, { frames: false });

  // (The ring stands only while the patient has varices: the store's one test, varicesPresent, looked at on each frame while the slide
  // wants it, the ring shown or taken off only when that answer changes. A lens open when they go closes.)
  const ringNow = () => stage.setScopeRing(want && has, isOpen);
  function vxFrame(f) {
    const v = varicesPresent(f);
    if (v === has) return;
    has = v;
    if (!has && isOpen) close(); else ringNow();
  }
  // ── Open and shut ──
  function open() {
    if (dead || !want || !has) return;
    isOpen = true;
    ringNow();
    if (!inst) {
      inst = createEndoscopy({ onAction: noop });
      if (fp) inst.pin?.(fp);
      inst.el.classList.remove('dock-pane'); inst.el.classList.add('pz-lens-inst');   // (laid as the lens, not as a Tests tab)
      disc.append(inst.el);
    }
    inst.shown?.(true);
    offFrame ||= store.on('frame', (f) => { if (isOpen && f) { inst.update(f); caption(f); } });
    place();
  }
  // (The scope drawn from the newest frame once its lens has its size: a frame taken in while the lens had none was dropped by the scope,
  // which then drew the last one it had kept, a slide's old state, until the model moved; Mohammad 6 Nov 2026, "the varix is BLEEDING;
  // yet the scope view is showing a small varices without bleeding". Two frames on: the size is measured the frame after it is laid.)
  function feed() {
    feedAsk = 0;
    const f = store.get().frame;
    if (isOpen && f && inst) { inst.update(f); caption(f); }
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(stillT); stillT = 0;
    el.classList.remove('on'); el.hidden = true; el.style.opacity = '';
    offFrame?.(); offFrame = null;
    inst?.shown?.(false);
    if (!dead) ringNow();
  }
  // The caption under the lens: the varices' grade and an active bleed, written only when it changes (drawn on the GPU: gl-words.js).
  function caption(f) {
    const vx = f.metrics?.varix, bleed = !!(f.bleed?.active && f.bleed.site === 'VAR'), bands = Math.round(f.bands || 0);
    const t = !vx?.present ? 'No varices' : `${vx.grade?.label || 'Large'} varices${bleed ? ' · bleeding' : bands ? ' · banded' : ''}`;
    if (t !== capText) { capText = t; words.set(cap, t); }
  }

  // ── Where it opens ──
  // (Read once per opening, at rest, between frames: the cards' boxes and the stage's; never in a frame of a move.)
  function place() {
    if (!isOpen || dead) return;
    const ring = stage.scopeRingAt?.(), sb = stageBox();
    if (!ring || !sb) { el.hidden = true; return; }
    const W = sb.width, H = sb.height, ss = safeSides() || { l: 0, r: 0 };
    const rects = [ring.bleed];
    for (const n of avoid()) {
      if (!n || n.hidden || !n.isConnected) continue;
      const q = readBox(n);
      if (!q || q.width < 2 || q.height < 2) continue;
      rects.push({ l: q.left - sb.left, t: q.top - sb.top, r: q.right - sb.left, b: q.bottom - sb.top });
    }
    const size = Math.round(Math.min(150, Math.max(70, Math.min(W, H) * 0.18)));
    const L = placeLens(ring, { l: ss.l, t: 0, r: W - ss.r, b: H }, rects, size);
    if (!L) { el.hidden = true; return; }
    const lines = coneLines({ x: ring.x, y: ring.y, r: ring.r }, { x: L.x, y: L.y, r: L.r + 5 });
    // (The lens's layer may not start at the figure's own corner: everything is laid from the figure's corner, moved by the difference.)
    const rb = readBox(root), dx = Math.round(sb.left - (rb?.left ?? sb.left)), dy = Math.round(sb.top - (rb?.top ?? sb.top));
    // (Laid once per opening: its place, size and the cone's box; the lens comes in by its own opacity and transform.)
    // alloc-rare: once per opening, never per frame
    Object.assign(disc.style, { left: `${L.x - L.r + dx}px`, top: `${L.y - L.r + dy}px`, width: `${2 * L.r}px`, height: `${2 * L.r}px` });
    const ang = Math.PI / 4;
    // alloc-rare: once per opening, never per frame
    Object.assign(shut.style, { left: `${Math.round(L.x + L.r * Math.cos(-ang) - 14) + dx}px`, top: `${Math.round(L.y + L.r * Math.sin(-ang) - 14) + dy}px` });
    // alloc-rare: once per opening, never per frame
    Object.assign(cap.style, { left: `${L.x + dx}px`, top: `${L.y + L.r + 12 + dy}px` });
    // (It grows out of the ring: the transform's origin is the ring, seen from the lens.)
    el.style.setProperty('--lens-ox', `${Math.round(ring.x - (L.x - L.r))}px`);
    el.style.setProperty('--lens-oy', `${Math.round(ring.y - (L.y - L.r))}px`);
    el.hidden = false; el.style.opacity = '';
    stage.setScopeCone?.(lines);
    nextFrame(() => { if (isOpen && !el.hidden) el.classList.add('on'); feedAsk ||= nextFrame(feed); });
  }
  return {
    el,
    /** The slide now up (null: none). Its ring is shown when the slide shows the varices; a lens left open closes. */
    slide(s) {
      if (dead) return;
      close();
      want = scopeLensFor(s);
      if (want && !offVx) offVx = store.on('frame', vxFrame);
      else if (!want && offVx) { offVx(); offVx = null; }
      has = want && varicesPresent(store.get().frame);
      ringNow();
    },
    /** Whether the lens is open (the tests, a keyboard close). */
    isOpen: () => isOpen,
    close,
    /** The slide's own numbers (presenter-tools pin): the lens's scope shows the size the tiles and the figure show. */
    pin(f) { fp = f || null; inst?.pin?.(fp); },
    /** A tap (client px) in a talk, where the figure takes no other: true when it was on the ring. */
    tap,
    /** The pointer moving over the figure (client px, its kind): a hand over the ring. */
    hover,
    dispose() {
      if (dead) return;
      close();
      dead = true;
      stage.setScopeRing(false, false);
      (root.parentElement || root).classList.remove('pz-lens-hand');
      stage.onScopeView?.(null, null);
      offView?.(); offVx?.(); offVx = null;
      words.dispose?.();
      inst?.dispose?.(); inst = null;
      el.remove();
    },
  };
}
