// Top bar motion: when a button appears or disappears (the Sinusoid view opening, the lobule layers
// menu, the focused sinusoid mode hiding buttons, a patient name that is longer or shorter), the bar
// does not pop. The new button fades and grows in, a removed one fades out as a ghost, and everything
// next to them glides to its new place (FLIP: first measure, last measure, play the difference).
//
// Only transform, opacity and clip-path animate (the compositor does the work, and no layout runs per
// frame). Positions are read from offsetLeft/offsetTop, which ignore transforms, so a measure taken while
// a glide is still playing is the true layout and an interrupted glide continues from where it was.
// Nothing moves on a window resize or with reduced motion: the bar just takes its new layout.

const ITEMS = '.tb-id, .tb-id > *, .sb-left, .sb-right, #viewSeg, #viewSeg > button, .sb-right > *, .top-right, .top-right > *';
// Pills that grow reveal their new width from the old one instead of snapping wide.
const GROW = '.tb-id, .top-right, #viewSeg';
const MOVE_MS = 260, IN_MS = 220, OUT_MS = 130, EASE = 'cubic-bezier(.2,.8,.2,1)';

export function initTopbarMotion() {
  const bar = document.getElementById('topbar'), app = document.getElementById('app');
  if (!bar || !app || !bar.animate) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const pageXY = (el) => { let x = 0, y = 0; for (let n = el; n && n !== document.body; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
  const measure = () => {
    const m = new Map([[bar, { vis: bar.offsetParent !== null, ...pageXY(bar) }]]);
    for (const el of bar.querySelectorAll(ITEMS)) {
      if (el.closest('[data-ghost]')) continue;
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
        if (frames.length) { const a = el.animate(frames, { duration: MOVE_MS, easing: EASE }); a.id = 'tbm'; }
        if (t.dw < -2 && el.matches(GROW)) ghost(el, s, { own, tot, next }, true);
        if (t.dw > 2 && el.matches(GROW)) {
          const a = el.animate([{ clipPath: `inset(-32px ${t.dw}px -32px -32px)` }, { clipPath: 'inset(-32px -32px -32px -32px)' }], { duration: MOVE_MS, easing: EASE });
          a.id = 'tbm';
        }
      }
    }
        next.set(bar, barNext);
    snap = next;
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
    const a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: 'ease-out', fill: 'forwards' });
    a.id = 'tbm'; a.onfinish = a.oncancel = () => g.remove();
  }

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
    if (hit && !pending) { pending = true; run(); }
  });
  app._sin = app.classList.contains('sin-focus');
  mo.observe(bar, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class', 'data-fit'], attributeOldValue: true });
  mo.observe(app, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  for (const id of ['scenarioName']) { const e = document.getElementById(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true }); }

  // Layout that changes with no mutation of ours (fonts, a resize) is only recorded, never animated.
  const ro = new ResizeObserver(() => { if (snap) resnap(); });
  ro.observe(bar);
  for (const el of bar.querySelectorAll(ITEMS)) ro.observe(el);

  const start = () => requestAnimationFrame(() => requestAnimationFrame(resnap));
  (document.fonts?.ready || Promise.resolve()).then(start, start);
}
