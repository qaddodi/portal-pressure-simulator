// The scope view on the figure (mock C1, Mohammad 6 Nov 2026: "C1 is perfect; let's do it ... everywhere where we have scopes").
// On a slide that shows the varices (scope-lens-rule.js scopeLensFor) a ring sits on the varix columns of the lower esophagus with a
// small scope badge; it is one of the figure's marks, drawn by the GPU with the vessels (stage-clamps.js), so it moves with every zoom,
// pan and view change. Tapping it opens a round lens in the nearest empty space (never over the cards, the bar or the bleed), joined to
// the ring by a faint cone (figure marks, stage-clamps.js): the live endoscopic view (the scope instrument's own GPU field, instruments.js, with its bleed and bands).
//
// The lens is laid on the screen but is kept to its ring: on every step of the camera (a pan, a pinch, a slide's glide, a resize) the ring's
// place is read from the figure's own matrix (stage.scopeRingInto) and the lens layer is moved by a transform to the same offset from it, in
// the same frame, so ring and lens move as one, never eased behind the figure and never hidden by it (6 Nov 2026: "make sure if the camera
// is zooming, everything adjusts appropriately"; "as the slide is playing i can't click on the scope"). Only the cone, which the figure's GPU
// marks draw in world units, is taken down while the camera moves and laid again once it has held still; the lens is then looked at once
// more, and moves (by a glide) only if it no longer fits clear of the cards. The field is drawn by the scope's shader into the cards' GPU
// drawer; the page paints neither.
import { h } from './util.js';
import { createEndoscopy } from './instruments.js';
import { wordSetter } from './gl-words.js';
import { frameFor } from './frame.js';
import { readBox, stageBox, safeSides } from './layout-snap.js';
import { placeLens, coneLines, ringHit, scopeLensFor, scopeGrows, lensFits, lensCentre, LENS_GAP } from './scope-lens-rule.js';
import { varicesPresent } from './store.js';
import { gastricUp } from '../engine/scenario.js';

// (The ring stands while the patient has varices and no balloon tamponade is in: with a tube's balloon up there is no scope to look
// through; Mohammad 6 Nov 2026, "remove the scope view button when there is a balloon tamponade".)
const NO_P = {};

const nextFrame = frameFor('scope-lens');
const noop = () => {};
// (How long the camera must hold still before the cone is laid again and the lens is looked at once more, ms.)
const STILL_MS = 160;
// (How long the varices must be gone before the ring leaves a slide that shows them, ms: a patient loading, or a size crossing the cut-off with the beat, never takes it down.)
const GONE_MS = 900;
// (How long it takes to glide shut, ms: the --d-small its opacity and transform run for, app.css .pz-lens.)
const SHUT_MS = 240;

/**
 * stage: the figure (setScopeRing, setScopeCone, scopeRingAt, scopeRingInto, onScopeView); store: the app's store (frames); root: the element the lens is laid
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
  let inst = null, offFrame = null, offVx = null, has = false, want = false, grows = false, isOpen = false, dead = false, stillT = 0, capText = '', fp = null, feedAsk = 0, hideT = 0, goneT = 0, lastMove = 0, coneOn = false, glideT = 0;
  // The lens's anchor, read at its opening: the lens's centre then (stage px) and its direction from the ring (a unit pair), its radius, the gap; and the kept records the camera's steps write into.
  const A = { cx: 0, cy: 0, ux: 1, uy: 0, R: 0, gap: LENS_GAP, dx: 0, dy: 0 }, rg = { x: 0, y: 0, r: 0 }, lc = { x: 0, y: 0 };

  // ── The tap on the ring, and the figure moving ──
  function tap(cx, cy) {
    if (dead) return false;
    // (Open, any tap on the figure shuts it: Mohammad 6 Nov 2026, "i should close the scope by clicking anywhere on the slide".)
    if (isOpen) { close(); return true; }
    if (!want || !has) return false;
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
  // ── The camera moving ──
  // On each step of it (stage-camera.js applyVT, and a resize): the lens layer is moved to where the ring now is, by one transform write, in the
  // frame the figure is drawn in. The cone (marks in world units) comes down at the first step and is laid again when the camera has held still.
  function moved() {
    if (!isOpen || dead || el.hidden) return;
    if (!stage.scopeRingInto?.(rg)) { close(); return; }   // (the figure has left the varices: the Circuit, the lobule)
    if (glideT) { clearTimeout(glideT); glideT = 0; el.classList.remove('glide'); }
    follow();
    if (coneOn) { coneOn = false; stage.setScopeCone?.(null); }
    lastMove = performance.now();
    if (!stillT) stillT = setTimeout(stillCheck, STILL_MS);
  }
  // (The lens's centre for the ring where rg has it: the same direction from the ring, the same gap past its edge.)
  function follow() {
    lensCentre(lc, rg, A);
    const tx = lc.x - A.cx, ty = lc.y - A.cy;
    if (tx === A.dx && ty === A.dy) return;
    A.dx = tx; A.dy = ty;
    el.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`;
  }
  // (The camera has held still: the cone is laid again, and the lens, if it no longer fits clear of the cards or the stage, glides to the nearest spot that does.)
  function stillCheck() {
    stillT = 0;
    if (!isOpen || dead) return;
    const wait = lastMove + STILL_MS - performance.now();
    if (wait > 8) { stillT = setTimeout(stillCheck, wait); return; }
    settle();
  }
  stage.onScopeView?.(moved, tap);
  const offView = store.on('view', moved, { frames: false });

  // (The ring stands while the slide shows the varices and the patient has them, or the slide is one that grows them (a time-lapse, a ramp):
  // there it stands from the first frame, and the lens shows "No varices" until they come, then each size as it grows. The store's one test,
  // varicesPresent, is looked at on each frame while the slide wants it. The ring is shown at once when the answer turns yes; it is taken off
  // only after the answer has been no for GONE_MS, and never under an open lens: a patient loading, or a size crossing the 2.5 mm cut-off
  // with the beat, took the ring and a lens just opened away; Mohammad 6 Nov 2026, "when they're loading i can't click the scope".)
  const ringNow = () => stage.setScopeRing(want && has, isOpen);
  const seen = (f) => !gastricUp(store.get().params || NO_P) && (grows || varicesPresent(f));
  function vxFrame(f) {
    if (seen(f)) {
      if (goneT) { clearTimeout(goneT); goneT = 0; }
      if (!has) { has = true; ringNow(); }
      return;
    }
    if (!has || goneT) return;
    // (A balloon tamponade takes the ring at once: there is no scope to look through; the rest wait.)
    if (gastricUp(store.get().params || NO_P)) { goneNow(); return; }
    goneT = setTimeout(goneNow, GONE_MS);
  }
  function goneNow() {
    clearTimeout(goneT); goneT = 0;
    if (dead || !has || seen(store.get().frame)) return;
    if (isOpen && !gastricUp(store.get().params || NO_P)) return;   // (an open lens goes on showing the esophagus: the ring goes when it is shut)
    has = false;
    if (isOpen) close(); else ringNow();
  }
  // ── Open and shut ──
  function open() {
    if (dead || !want || !has) return;
    isOpen = true;
    clearTimeout(hideT); hideT = 0; drop();
    ringNow();
    // (A scope of its own for each opening, drawn first from the frame now: the scope eases its varix's size on the model's clock, so one
    // kept from an earlier opening, or a talk paused on its slide, went on showing the varix it first saw, small and dry beside a large
    // one bleeding on the figure; Mohammad 6 Nov 2026, "still discrepency between what the scope sees and reality".)
    {
      inst = createEndoscopy({ onAction: noop });
      if (fp) inst.pin?.(fp);
      inst.el.classList.remove('dock-pane'); inst.el.classList.add('pz-lens-inst');   // (laid as the lens, not as a Tests tab)
      disc.append(inst.el);
    }
    inst.shown?.(true);
    offFrame ||= store.on('frame', (f) => { if (isOpen && f && inst) { inst.update(f); caption(f); } });
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
  // (The scope of an opening, let go once its lens is shut: its GPU context given back with it.)
  function drop() { if (!inst) return; inst.dispose?.(); inst.el.remove(); inst = null; }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(stillT); stillT = 0;
    // (It glides shut as it opened, back into the ring, by its own opacity and transform on the compositor; laid hidden once that is over.)
    const glide = el.classList.contains('on') && !el.hidden && el.style.opacity !== '0';
    el.classList.remove('on');
    clearTimeout(hideT);
    if (glide && !dead) hideT = setTimeout(() => { hideT = 0; if (!isOpen) { el.hidden = true; el.style.opacity = ''; drop(); } }, SHUT_MS);
    else { el.hidden = true; el.style.opacity = ''; drop(); }
    offFrame?.(); offFrame = null;
    if (coneOn) { coneOn = false; stage.setScopeCone?.(null); }
    clearTimeout(glideT); glideT = 0; el.classList.remove('glide');
    // (The varices gone while the lens was up: the ring leaves now, after its wait, as it would have.)
    if (!dead && has && !seen(store.get().frame)) vxFrame(store.get().frame);
    if (!dead) ringNow();
  }
  // The caption under the lens: the varices' grade and an active bleed, written only when it changes (drawn on the GPU: gl-words.js).
  function caption(f) {
    const vx = f.metrics?.varix, bleed = !!(f.bleed?.active && f.bleed.site === 'VAR'), bands = Math.round(f.bands || 0);
    const t = !vx?.present ? 'No varices' : `${vx.grade?.label || 'Large'} varices${bleed ? ' · bleeding' : bands ? ' · banded' : ''}`;
    if (t !== capText) { capText = t; words(cap, t); }
  }

  // ── Where it opens ──
  // (Read at the opening and when the camera has come to rest, between frames: the cards' boxes and the stage's; never in a frame of a move.)
  // The stage's room for the lens, and the rectangles it keeps clear of (the bleed, the cards, the bar), in stage px.
  const fieldOf = (ring, sb) => {
    const ss = safeSides() || { l: 0, r: 0 };
    const rects = [ring.bleed];
    for (const n of avoid()) {
      if (!n || n.hidden || !n.isConnected) continue;
      const q = readBox(n);
      if (!q || q.width < 2 || q.height < 2) continue;
      rects.push({ l: q.left - sb.left, t: q.top - sb.top, r: q.right - sb.left, b: q.bottom - sb.top });
    }
    return { bounds: { l: ss.l, t: 0, r: sb.width - ss.r, b: sb.height }, rects };
  };
  // The cone, from the ring to the lens where it now stands, as the figure's marks (taken down while the camera moves).
  function layCone(ring, cx, cy) {
    const lines = coneLines({ x: ring.x, y: ring.y, r: ring.r }, { x: cx, y: cy, r: A.R + 5 });
    stage.setScopeCone?.(lines);
    coneOn = !!lines;
  }
  function place() {
    if (!isOpen || dead) return;
    const ring = stage.scopeRingAt?.(), sb = stageBox();
    if (!ring || !sb) { el.hidden = true; return; }
    const W = sb.width, H = sb.height, { bounds, rects } = fieldOf(ring, sb);
    const size = Math.round(Math.min(150, Math.max(70, Math.min(W, H) * 0.18)));
    const L = placeLens(ring, bounds, rects, size);
    if (!L) { el.hidden = true; return; }
    // (The lens's layer may not start at the figure's own corner: everything is laid from the figure's corner, moved by the difference.)
    const rb = readBox(root), dx = Math.round(sb.left - (rb?.left ?? sb.left)), dy = Math.round(sb.top - (rb?.top ?? sb.top));
    // (Laid once per opening: its place and size; the lens comes in by its own opacity and transform, and follows its ring by a transform of the layer, follow.)
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
    // (Its anchor: where it stands and which way from the ring, so a move of the camera finds it again from the ring alone.)
    const d = Math.hypot(L.x - ring.x, L.y - ring.y) || 1;
    A.cx = L.x; A.cy = L.y; A.ux = (L.x - ring.x) / d; A.uy = (L.y - ring.y) / d; A.R = L.r; A.gap = d - ring.r - L.r; A.dx = 0; A.dy = 0;
    rg.x = ring.x; rg.y = ring.y; rg.r = ring.r;
    el.style.transform = ''; el.classList.remove('glide');
    el.hidden = false; el.style.opacity = '';
    layCone(ring, L.x, L.y);
    nextFrame(() => { if (isOpen && !el.hidden) el.classList.add('on'); feedAsk ||= nextFrame(feed); });
  }
  // The camera has come to rest: the lens is where its ring's place and its own offset put it; if that spot has gone under a card or off the stage,
  // it glides to the nearest one that is free (its size kept); the cone is laid between the two again.
  function settle() {
    const ring = stage.scopeRingAt?.(), sb = stageBox();
    if (!ring || !sb) { close(); return; }
    rg.x = ring.x; rg.y = ring.y; rg.r = ring.r;
    follow();
    const { bounds, rects } = fieldOf(ring, sb);
    let { x: cx, y: cy } = lensCentre(lc, ring, A);
    if (!lensFits(cx, cy, A.R, bounds, rects)) {
      const L = placeLens(ring, bounds, rects, A.R, true);
      if (L) {
        const d = Math.hypot(L.x - ring.x, L.y - ring.y) || 1;
        A.ux = (L.x - ring.x) / d; A.uy = (L.y - ring.y) / d; A.gap = d - ring.r - A.R; cx = L.x; cy = L.y;
        el.classList.add('glide'); clearTimeout(glideT); glideT = setTimeout(() => { glideT = 0; el.classList.remove('glide'); }, SHUT_MS + 60);
        follow();
      }
    }
    layCone(ring, cx, cy);
  }
  return {
    el,
    /** The slide now up (null: none). Its ring is shown when the slide shows the varices; a lens left open closes. */
    slide(s) {
      if (dead) return;
      close();
      want = scopeLensFor(s);
      grows = want && scopeGrows(s);
      clearTimeout(goneT); goneT = 0;
      if (want && !offVx) offVx = store.on('frame', vxFrame);
      else if (!want && offVx) { offVx(); offVx = null; }
      has = want && seen(store.get().frame);
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
      clearTimeout(hideT); hideT = 0;
      stage.setScopeRing(false, false);
      (root.parentElement || root).classList.remove('pz-lens-hand');
      stage.onScopeView?.(null, null);
      clearTimeout(goneT); goneT = 0; clearTimeout(glideT); glideT = 0;
      offView?.(); offVx?.(); offVx = null;
      words.dispose?.();
      drop();
      el.remove();
    },
  };
}
