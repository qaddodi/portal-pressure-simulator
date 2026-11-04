// Top bar motion: when a button appears or disappears (the Sinusoid view opening, the lobule layers
// menu, the focused sinusoid mode hiding buttons, a patient name that is longer or shorter), the bar
// does not pop. The new button fades and grows in, a removed one fades out as a ghost, and everything
// next to them glides to its new place (FLIP: first measure, last measure, play the difference).
//
// Only transform and opacity animate (the compositor does the work: nothing repaints and no layout runs per
// frame; a pill that grows glides its plate and shows what it gained as the plate covers it, never by a clip-path). Positions are read from offsetLeft/offsetTop, which ignore transforms, so a measure taken while
// a glide is still playing is the true layout and an interrupted glide continues from where it was.
// Nothing moves on a window resize or with reduced motion: the bar just takes its new layout.
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_IN, EASE_MOVE } from './ease.js';
import { removeSoon } from './class-soon.js';
import { reduceMotionMQ } from './motion.js';

const ITEMS = '.tb-id, .tb-id > *, .sb-left, .sb-right, #viewSeg, #viewSeg > button, .sb-right > :not(.tb-face), .top-right, .top-right > *';
// Pills that grow reveal their new width from the old one instead of snapping wide.
const GROW = '.tb-id, .top-right, #viewSeg';
const MOVE_MS = D_SMALL, IN_MS = D_SMALL, OUT_MS = D_FLIP, EASE = EASE_ARRIVE;
// The lens pill (the Layers and Blood chips and the colour key) glides its plate to a new width on the key's own clock (a new lens
// takes D_SURFACE on EASE_MOVE, legend-morph.js), anchored at its right edge so the chevron and the key stay put as it grows or
// shrinks.
// A plate that changes width glides by transform only: two fixed-size copies of the plate (the narrower of the old and new
// widths, laid out once before the glide) slide apart or together, their union the pill from its old span to its new, and the
// real face, already at its new width, shows again as they land. No width animates, so no layout runs per frame and the bar's
// ResizeObserver never sees a moving size. A change of more than twice the narrower width crossfades the old plate out over the
// new one instead (the two copies could not cover it).

export function initTopbarMotion() {
  const bar = document.getElementById('topbar'), app = document.getElementById('app');
  if (!bar || !app || !bar.animate) return;
  const reduce = reduceMotionMQ;
  // (The pill's glass moves onto a face of its own, as the patient pill's, so the plate can change width while the row inside is already laid out.)
  const row = bar.querySelector('.sb-right');
  if (row && !row.querySelector(':scope > .tb-face')) {
    const f = document.createElement('span');
    f.className = 'tb-face'; f.setAttribute('aria-hidden', 'true');
    row.prepend(f); row.classList.add('has-face');
  }
  const lens = row && row.querySelector(':scope > .lens-btn');
  const inRow = (el) => !!row && row.contains(el);

  const pageXY = (el) => { let x = 0, y = 0; for (let n = el; n && n !== document.body; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
  const measure = () => {
    const m = new Map([[bar, { vis: bar.offsetParent !== null, ...pageXY(bar) }]]);
    for (const el of bar.querySelectorAll(ITEMS)) {
      if (el.closest('[data-ghost]') || el.classList.contains('tb-face-lent')) continue;
      const vis = el.offsetParent !== null;
      m.set(el, vis ? { vis, ...pageXY(el), w: el.offsetWidth, h: el.offsetHeight, display: getComputedStyle(el).display } : { vis });
    }
    return m;
  };
  // The translation a running glide has put on an element, with its tracked ancestors' (transforms compound).
  const ownTx = (el) => {
    if (!el.getAnimations().some((a) => a.id === 'tbm')) return { x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: m.m41, y: m.m42 };
  };
  const trackedParent = (el, map) => { for (let p = el.parentElement; p && p !== bar; p = p.parentElement) if (map.has(p)) return p; return null; };

  let snap = null, vw = 0, vh = 0, pending = false;
  const resnap = () => { snap = measure(); vw = innerWidth; vh = innerHeight; };

  function run() {
    pending = false;
    if (!snap) return;
    const next = measure();
    if (reduce.matches || document.hidden || innerWidth !== vw || innerHeight !== vh || !snap.get(bar).vis || !next.get(bar).vis) { resnap(); return; }

    const own = new Map(), tot = new Map();
    const barNext = next.get(bar);
    next.delete(bar);
    for (const el of next.keys()) own.set(el, ownTx(el));
    // Total offset of each element from where it is now to where it appeared a moment ago.
    for (const [el, n] of next) {
      const s = snap.get(el);
      if (!s?.vis || !n.vis) continue;
      let cx = 0, cy = 0;
      for (let p = el; p; p = trackedParent(p, next)) { const o = own.get(p); cx += o.x; cy += o.y; }
      tot.set(el, { x: s.x + cx - n.x, y: s.y + cy - n.y, dw: n.w - s.w });
    }
    // The lens pill hangs from its right edge (its key grows and shrinks to the left): the pill and its key move by how far their
    // right edges moved, not their left, so the chevron holds still and the plate (the face, below) is what changes width.
    const sRow = row && snap.get(row), nRow = row && next.get(row);
    const hang = !!(sRow?.vis && nRow?.vis && Math.abs(sRow.x + sRow.w - nRow.x - nRow.w) + .5 < Math.abs(sRow.x - nRow.x));
    if (hang) for (const el of [row, lens]) {
      const t = tot.get(el), s = snap.get(el), n = next.get(el);
      if (t && s?.vis && n?.vis) t.x += (s.x + s.w - n.x - n.w) - (s.x - n.x);
    }
    for (const el of next.keys()) for (const a of el.getAnimations()) if (a.id === 'tbm') a.cancel();

    for (const [el, n] of next) {
      const s = snap.get(el), p = trackedParent(el, next), ps = p && snap.get(p), pn = p && next.get(p);
      if (n.vis && !s?.vis) {
        if (p && !ps.vis) continue;     // its parent is entering too: the parent's animation carries it
        const a = el.animate([{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'none' }], { duration: IN_MS, delay: 50, easing: EASE, fill: 'backwards' });
        a.id = 'tbm';
      } else if (!n.vis && s?.vis) {
        if (p && !pn.vis) continue;     // its parent is leaving too: the parent's ghost carries it
        ghost(el, s, { own, tot, next });
      } else if (n.vis && s?.vis) {
        const t = tot.get(el), pt = p && tot.get(p);
        const dx = t.x - (pt ? pt.x : 0), dy = t.y - (pt ? pt.y : 0);
        const frames = [];
        if (Math.abs(dx) >= 1.5 || Math.abs(dy) >= 1.5) frames.push({ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' });
        if (frames.length) { const a = el.animate(frames, inRow(el) ? { duration: D_SURFACE, easing: EASE_MOVE } : { duration: MOVE_MS, easing: EASE }); a.id = 'tbm'; }
        if (el === row && Math.abs(t.dw) > 2) {
          const face = row.querySelector(':scope > .tb-face');
          if (face) plateGlide(face, hang ? t.dw : 0, s.w, n.w, { duration: D_SURFACE, easing: EASE_MOVE });
        }
        if (t.dw < -2 && el.matches(GROW)) {
          // A pill with its own face (the patient pill) glides its face from the old width to the new; others leave the old,
          // wider plate fading behind them.
          const face = el.querySelector(':scope > .tb-face');
          if (face) plateGlide(face, 0, s.w, n.w, { duration: MOVE_MS, easing: EASE });
          else if (!face) ghost(el, s, { own, tot, next }, true);
        }
        if (t.dw > 2 && el.matches(GROW)) growPill(el, s, n, next);
      }
    }
        next.set(bar, barNext);
    snap = next;
  }

  // The plate's glide: the face spans [x0, x0 + w0] at the start and [0, w1] at the end, in its pill's new box.
  // Three copies of the face, each p wide (p = the narrower width, laid out once here, before the glide), each cut by a clip that
  // never changes: the left cap, the right cap and the flat middle. The caps ride translate; the middle rides translate and a
  // horizontal scale (its top and bottom hairlines stay 1 px, its rounded ends are cut off), all on the same curve, so together
  // they are always one pill with both ends round. The face itself sits at its new width under them, hidden by an opacity hold
  // until they land. A glide caught by the next takes over from the snapshot, as the width did.
  function plateGlide(face, x0, w0, w1, timing) {
    // (Read before the ghosts are taken off and the glide is cancelled: a read after a write lays the bar out again. The faces are absolute and only
    // transform and opacity are cancelled, so nothing read changes.)
    const anims = face.getAnimations(), p = Math.min(w0, w1), h = face.offsetHeight;
    const R = Math.min(h / 2, p / 2, parseFloat(getComputedStyle(face).borderTopLeftRadius) || 0);
    for (const g of face.parentElement.querySelectorAll(':scope > .tb-face[data-ghost]')) g.remove();
    for (const a of anims) if (a.id === 'tbm') a.cancel();
    const mid = p - 2 * R;
    const mk = (clip, width = p) => {
      const g = face.cloneNode(false);
      g.dataset.ghost = ''; g.setAttribute('aria-hidden', 'true');
      Object.assign(g.style, { width: `${width}px`, clipPath: clip, willChange: 'transform' });
      face.after(g);
      return g;
    };
    const tag = (anim) => { anim.id = 'tbm'; return anim; };
    const at = (k) => (k ? { x: 0, w: w1 } : { x: x0, w: w0 });
    if (mid < 4) {
      // (A plate too short to have a flat middle: the old plate fades out over the new, each at its own fixed size.)
      const old = mk('none', w0);   // (its width set once, before it is placed)
      const a = tag(old.animate([{ translate: `${x0}px 0px`, opacity: 1 }, { translate: `${x0}px 0px`, opacity: 0 }], { ...timing, fill: 'forwards' }));
      a.onfinish = a.oncancel = () => removeSoon(old);
      return tag(face.animate([{ opacity: 0 }, { opacity: 1 }], timing));
    }
    const hold = tag(face.animate([{ opacity: 0 }, { opacity: 0 }], timing));
    const o = 40;   // (room left for the shadow outside the plate)
    const left = mk(`inset(-${o}px ${p - R}px -${o}px -${o}px)`);
    const right = mk(`inset(-${o}px -${o}px -${o}px ${p - R}px)`);
    const middle = mk(`inset(-${o}px ${R - 1}px -${o}px ${R - 1}px)`);   // (1 px under each cap, so no seam shows between them)
    middle.style.transformOrigin = `${R}px 50%`;
    const sx = (k) => Math.max(0, at(k).w - 2 * R) / mid;
    const parts = [
      [left, (k) => ({ translate: `${at(k).x}px 0px` })],
      [right, (k) => ({ translate: `${at(k).x + at(k).w - p}px 0px` })],
      [middle, (k) => ({ translate: `${at(k).x}px 0px`, scale: `${sx(k)} 1` })],
    ];
    for (const [el, f] of parts) tag(el.animate([f(0), f(1)], { ...timing, fill: 'forwards' }));
    // (The copies go with the hold: at the landing, or when the next glide cancels it, so the face is never hidden without them.)
    hold.onfinish = hold.oncancel = () => { for (const [g] of parts) g.remove(); };
    return hold;
  }

  // A pill that grows (a longer name, a button more): its plate glides from the old width to the new by transform alone (plateGlide,
  // on its own face, or on a face lent for the glide when the pill paints its own glass), and what lies past the old edge shows
  // as the plate covers it, by its opacity (coverage of its box by the moving edge, sampled on the glide's curve). No clip-path.
  const LOOK = ['backgroundColor', 'backgroundImage', 'boxShadow', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];
  function growPill(el, s, n, next) {
    const timing = { duration: MOVE_MS, easing: EASE };
    let face = el.querySelector(':scope > .tb-face:not([data-ghost])'), lent = null;
    if (!face) {
      const cs = getComputedStyle(el);
      const paints = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
      if (paints) {
        lent = document.createElement('span');
        lent.className = 'tb-face tb-face-lent'; lent.setAttribute('aria-hidden', 'true');
        const look = {};
        for (const k of LOOK) look[k] = cs[k];
        Object.assign(lent.style, look, { position: 'absolute', zIndex: '-1', left: '0', top: '0', bottom: '0', width: '100%', pointerEvents: 'none', margin: '0', padding: '0' });
        const keep = { position: el.style.position, isolation: el.style.isolation };
        // (the pill's own glass steps aside while the lent face is its child: `:has(> .tb-face-lent)` in app.css)
        if (cs.position === 'static') el.style.position = 'relative';
        el.style.isolation = 'isolate';
        el.prepend(lent);
        lent._restore = () => { lent.remove(); el.style.position = keep.position; el.style.isolation = keep.isolation; };
        face = lent;
      }
    }
    if (face) {
      const hold = plateGlide(face, 0, s.w, n.w, timing);
      if (lent) { const end = () => lent._restore(); if (hold) hold.addEventListener('finish', end), hold.addEventListener('cancel', end); else end(); }
    }
    for (const c of el.children) {
      if (c.classList.contains('tb-face') || c.dataset.ghost != null || c.classList.contains('face-half')) continue;
      const cn = next.get(c);
      if (!cn?.vis || !snap.get(c)?.vis) continue;   // (a button coming in has its own fade)
      const a = cn.x - n.x, b = a + cn.w;
      if (!(b > s.w + 0.5) || !(b - a > 0)) continue;
      const frames = [];
      for (let i = 0; i <= 12; i++) { const k = i / 12, e = s.w + (n.w - s.w) * k; frames.push({ offset: k, opacity: +Math.max(0, Math.min(1, (e - a) / (b - a))).toFixed(4) }); }
      c.animate(frames, timing).id = 'tbm';
    }
  }

  // A clone of the removed button stays where it was and fades out, so it does not vanish in one frame.
  // It lives in the same parent (the look is keyed by parent and by id: the clone sits after the original,
  // so lookups still find that first), so while the parent glides to its new place the clone glides back:
  // the two cancel and it holds still. With plate set it is only the empty pill (a shrinking pill's old,
  // wider background fading behind it).
  function ghost(el, s, ctx, plate) {
    const { own, tot, next } = ctx;
    const g = el.cloneNode(!plate);
    g.removeAttribute('hidden'); g.setAttribute('aria-hidden', 'true'); g.inert = true; g.dataset.ghost = '';
    if (plate) el.before(g); else el.after(g);
    const st = g.style;
    st.setProperty('display', s.display === 'none' ? 'block' : s.display, 'important');
    st.position = 'absolute'; st.margin = '0'; st.width = `${s.w}px`; st.height = `${s.h}px`;
    st.pointerEvents = 'none'; st.transform = 'none';
    const op = g.offsetParent, o = own.get(el) || { x: 0, y: 0 }, opNew = next.get(op);
    let cx = 0, cy = 0;
    for (let q = op; q && next.has(q); q = trackedParent(q, next)) { const t = own.get(q); cx += t.x; cy += t.y; }
    const base = opNew?.vis ? opNew : op && op !== document.body ? pageXY(op) : { x: 0, y: 0 };
    st.left = `${s.x + o.x + cx - base.x}px`; st.top = `${s.y + o.y + cy - base.y}px`;
    const pt = tot.get(op);
    if (pt && (Math.abs(pt.x) >= 1.5 || Math.abs(pt.y) >= 1.5)) {
      g.animate([{ transform: `translate(${-pt.x}px, ${-pt.y}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: EASE }).id = 'tbm';
    }
    const a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: EASE_IN, fill: 'forwards' });
    a.id = 'tbm'; a.onfinish = a.oncancel = () => removeSoon(g);
  }

  // The bar is measured after the browser's own layout of the change and before its paint: a fresh ResizeObserver's first report
  // comes at that point of the next frame, so the glide starts on the very frame the change shows (no pop) and nothing here forces a
  // layout (the mutation callback, a microtask straight after the writes, reads nothing: 2 Nov 2026, "Move everything to GPU").
  // A bar that is not drawn sends no first resize report, but an intersection observer always makes its first report, in the same
  // place of the frame (after layout, before paint): whichever comes first measures, once. No timer.
  // (kind 0: the change's glide; kind 1: the first record.)
  function afterLayout(kind) {
    let done = false;
    const go = () => { if (done) return; done = true; ro1.disconnect(); io1?.disconnect(); if (kind === 0) { if (pending) run(); } else if (!pending) resnap(); };
    const ro1 = new ResizeObserver(() => go()), io1 = typeof IntersectionObserver === 'function' ? new IntersectionObserver(() => go()) : null;
    ro1.observe(bar); io1?.observe(bar);
  }
  function runAfterLayout() { afterLayout(0); }

  // What counts as a change: a button's hidden flag, a class or fit step on the bar, the sinusoid focus
  // class on the app. Repeated writes of the same value (a class re-added while the figure is dragged) do not.
  const was = new Map();
  const mo = new MutationObserver((records) => {
    let hit = false;
    for (const r of records) {
      if (r.type !== 'attributes') { hit = true; continue; }
      const k = r.target, key = r.attributeName;
      if (!was.has(k)) was.set(k, new Map());
      const m = was.get(k);
      if (!m.has(key)) m.set(key, r.oldValue);
    }
    for (const [el, m] of was) for (const [key, old] of m) {
      if (key === 'class' && el === app) { const on = app.classList.contains('sin-focus'); if (on !== el._sin) { el._sin = on; hit = true; } }
      else if (el.getAttribute(key) !== old) hit = true;
    }
    was.clear();
    if (hit && !pending) { pending = true; runAfterLayout(); }
  });
  app._sin = app.classList.contains('sin-focus');
  mo.observe(bar, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class', 'data-fit'], attributeOldValue: true });
  mo.observe(app, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  // (And the lens key and its name, which a new lens swaps: the Blood chip beside them jumped 11-36 px on every L; round 2
  // review, RF4.)
  for (const id of ['scenarioName', 'legend', 'colorModeLabel']) { const e = document.getElementById(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true }); }

  // Layout that changes with no mutation of ours (fonts, a resize) is only recorded, never animated.
  // (Not while a change waits for its measure: the layout it would record is the change's own, which the glide starts from.)
  const ro = new ResizeObserver(() => { if (snap && !pending) resnap(); });
  ro.observe(bar);
  for (const el of bar.querySelectorAll(ITEMS)) ro.observe(el);

  // (The first record once the fonts are in and the bar has been laid out: after layout, not in a frame.)
  const start = () => afterLayout(1);
  (document.fonts?.ready || Promise.resolve()).then(start, start);
}
