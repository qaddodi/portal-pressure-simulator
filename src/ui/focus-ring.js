// Keyboard focus rings, polished (sprint 1 Nov). The stylesheet already draws the ring (a 2 px outline on :focus-visible);
// this file only looks after the three ways it used to go wrong. It adds no element and no class, and writes nothing into
// the page: each fix is one short Web Animations effect on the focused control, cancelled when focus leaves it.
//
//   - Eased: a ring that the keyboard brings in fades up from clear over --d-small on --ease-arrive, not snaps. (An effect
//     that ends at the stylesheet's own value, so if a frame is dropped the ring is still there.)
//   - Never clipped: a ring sits 2 px off its control and is 2 px thick, so a control that touches the edge of a card, a menu,
//     a scroll area or the screen had the outer half of its ring cut off. Such a control wears its ring inside instead.
//   - Never on a click: a control that took focus after a mouse or finger (a menu or a dialog moving focus to its first
//     button, Safari's habit of focusing what is clicked) shows no ring. The keyboard (Tab, an arrow, any key) brings it back,
//     and a text field keeps its ring whatever reached it.
//   - Windows high contrast and Reduce Motion: the first draws the ring itself, so this file leaves it alone; the second
//     gets the ring at once.
//   - Alike: the one class it puts on <html>, fr, switches on a short block in app.css that gives the rings that were the accent
//     colour or 1 px off their control the focus colour and the 2 px of the rest.
//   - ?focusring=0: this file does nothing and the page is today's.
import { D_SMALL } from './ease.js?v=fc509dabe4';

/** ?focusring=0 in a page's search string: this file does nothing. */
export const ringOff = (search) => /[?&]focusring=0\b/.test(String(search ?? ''));

/** True when a ring `reach` px beyond the box `r` would be cut by any of the clip boxes (all {left, top, right, bottom}). */
export function ringClipped(r, clips, reach) {
  if (!(reach > 0)) return false;
  for (const c of clips) {
    if (r.left - reach < c.left - .5 || r.top - reach < c.top - .5 || r.right + reach > c.right + .5 || r.bottom + reach > c.bottom + .5) return true;
  }
  return false;
}

/** Whether a computed style makes its element the containing block of fixed-position children. */
const holdsFixed = (cs) => cs.transform !== 'none' || cs.filter !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none')
  || /paint|layout|strict|content/.test(cs.contain || '') || /transform|filter/.test(cs.willChange || '');

/** The boxes that clip an element's overflow: each ancestor that clips (overflow other than visible, or contain: paint)
 *  and the screen. A fixed or absolute element is clipped only by the ancestors it is laid out in. */
export function clipBoxes(el) {
  const out = [{ left: 0, top: 0, right: innerWidth, bottom: innerHeight }];
  let skip = '';   // '' | 'fixed' | 'abs': ancestors an out-of-flow element is not inside of
  let cs = getComputedStyle(el);
  if (cs.position === 'fixed') skip = 'fixed'; else if (cs.position === 'absolute') skip = 'abs';
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    cs = getComputedStyle(a);
    if (skip === 'fixed') { if (!holdsFixed(cs)) continue; skip = ''; }
    else if (skip === 'abs') { if (cs.position === 'static' && !holdsFixed(cs)) continue; skip = ''; }
    if (a !== document.body && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || /paint|strict|content/.test(cs.contain || ''))) {
      const r = a.getBoundingClientRect(), w = a.offsetWidth, k = w ? r.width / w : 1;
      out.push({ left: r.left + a.clientLeft * k, top: r.top + a.clientTop * k, right: r.left + (a.clientLeft + a.clientWidth) * k, bottom: r.top + (a.clientTop + a.clientHeight) * k });
    }
    if (cs.position === 'fixed') skip = 'fixed'; else if (cs.position === 'absolute') skip = 'abs';
  }
  return out;
}

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);
/** A field the keyboard types into: its ring (and caret) always show, whatever reached it. */
export const isTextEntry = (el) => {
  const t = el.localName;
  return t === 'textarea' || t === 'select' || el.isContentEditable === true || (t === 'input' && TEXT_TYPES.has((el.type || 'text').toLowerCase()));
};

export function startFocusRing(root = typeof document !== 'undefined' ? document : null, search = typeof location !== 'undefined' ? location.search : '') {
  if (!root || ringOff(search) || typeof root.addEventListener !== 'function') return null;
  const mq = (q) => matchMedia(q).matches;
  if (mq('(forced-colors: active)')) return null;   // (the system draws the ring)
  document.documentElement.classList.add('fr');   // (the stylesheet's ring colours and offsets alike, app.css next to :focus-visible)
  let by = 'kb';   // what last reached for the page: 'ptr' (mouse, pen, finger) or 'kb'
  let held = null;   // { el, anims }: the effects on the control that has the ring
  const drop = () => { if (!held) return; for (const a of held.anims) { try { a.cancel(); } catch { /* gone */ } } held = null; };

  function lit(el) {
    if (!(el instanceof HTMLElement) || !el.animate) return;
    drop();
    try { if (!el.matches(':focus-visible')) return; } catch { return; }
    const cs = getComputedStyle(el);
    if (cs.outlineStyle === 'none' || cs.outlineStyle === 'hidden') return;   // (this control draws its ring some other way)
    const anims = [];
    const w = parseFloat(cs.outlineWidth) || 0, off = parseFloat(cs.outlineOffset) || 0;
    if (by === 'ptr' && !isTextEntry(el)) {
      anims.push(el.animate({ outlineColor: 'transparent' }, { duration: 1, fill: 'forwards' }));
    } else {
      // Cut off? The ring reaches off + w beyond the control's box.
      let inset = false;
      try { inset = ringClipped(el.getBoundingClientRect(), clipBoxes(el), off + w); } catch { /* measure again below */ }
      if (inset) anims.push(el.animate({ outlineOffset: `${-w}px` }, { duration: 1, fill: 'forwards' }));
      if (!mq('(prefers-reduced-motion: reduce)') && cs.outlineColor) {
        anims.push(el.animate([{ outlineColor: 'transparent' }, { outlineColor: cs.outlineColor }], { duration: D_SMALL, easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-arrive').trim() || 'ease-out' }));
      }
      // (A scroll that focus itself causes can move the control against an edge after this point: measured once more as the focus
      // call that moved it returns (its scroll into view is done by then), in a task of its own, never in a frame.)
      if (!inset) setTimeout(() => {
        if (!held || held.el !== el || !el.isConnected) return;
        try {
          if (ringClipped(el.getBoundingClientRect(), clipBoxes(el), off + w)) held.anims.push(el.animate({ outlineOffset: `${-w}px` }, { duration: 1, fill: 'forwards' }));
        } catch { /* leave the ring as it is */ }
      }, 0);
    }
    held = { el, anims };
  }

  const onFocusIn = (e) => lit(e.target);
  const onFocusOut = (e) => { if (held && held.el === e.target) drop(); };
  root.addEventListener('pointerdown', () => { by = 'ptr'; }, true);
  root.addEventListener('keydown', (e) => { if (!/^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) by = 'kb'; }, true);
  root.addEventListener('focusin', onFocusIn, true);
  root.addEventListener('focusout', onFocusOut, true);
  return { stop() { drop(); root.removeEventListener('focusin', onFocusIn, true); root.removeEventListener('focusout', onFocusOut, true); } };
}

if (typeof document !== 'undefined' && document.body) startFocusRing();
