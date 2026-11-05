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
import { D_SMALL } from './ease.js';
import { restPass } from './rest-pass.js';
import { caught } from './caught.js';
import { labelWritten } from './label-theme.js';


/** The ring's copy as a box on the screen: the control's box r grown by the outline's offset and width (all scaled by k, the scale
 *  the control is drawn at), and its outer corner radius. */
export function ringBox(r, k, w, off, rad) {
  const g = (off + w) * k, x = r.left - g, y = r.top - g, wd = r.width + 2 * g, ht = r.height + 2 * g;
  const inner = Math.min(Math.max(0, rad * k), Math.min(r.width, r.height) / 2);
  return { x, y, w: wd, h: ht, bw: w * k, rad: Math.max(0, inner + g) };
}

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

/** An inline style held on a control until cancel() (the same shape as an animation's, so the ring's holds drop with its fades):
 *  a set, not an animation (an outline's colour or offset is never eased). */
export function holdStyle(el, prop, value) {
  const was = el.style.getPropertyValue(prop), pri = el.style.getPropertyPriority(prop);
  el.style.setProperty(prop, value, 'important');
  labelWritten(el);   // (a label held so: its GPU picture is told, L3 P5)
  let done = false;
  return { cancel() { if (done) return; done = true; if (was) el.style.setProperty(prop, was, pri); else el.style.removeProperty(prop); labelWritten(el); } };
}

export function startFocusRing(root = typeof document !== 'undefined' ? document : null) {
  if (!root || typeof root.addEventListener !== 'function') return null;
  // The fade is a copy of the ring, laid over the control on its own layer, whose opacity eases in (the compositor's), while the
  // control's own outline waits clear; at the end the copy goes and the outline shows, in one task (nothing of the ring is ever eased
  // by its colour: that repaints the control each frame).
  // The fade on the compositor: false where it cannot be drawn so (then the outline colour eases, as before).
  function fadeCopy(el, cs, w, off, easing, anims) {
    const r = el.getBoundingClientRect(), k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    if (!r.width || !r.height || !(w > 0) || !document.body) return false;
    const rv = cs.borderTopLeftRadius || '0', rad = /%$/.test(rv) ? (parseFloat(rv) / 100) * Math.min(el.offsetWidth, el.offsetHeight) : parseFloat(rv) || 0;
    const b = ringBox(r, k, w, off, rad);
    const ring = document.createElement('div');
    ring.className = 'fr-fade';
    ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: `${b.w}px`, height: `${b.h}px`, transform: `translate(${b.x}px, ${b.y}px)`, boxSizing: 'border-box',
      border: `${b.bw}px ${cs.outlineStyle === 'auto' ? 'solid' : cs.outlineStyle} ${cs.outlineColor}`, borderRadius: `${b.rad}px`, pointerEvents: 'none', zIndex: 'var(--z-ring)', margin: '0', padding: '0', opacity: '0' });
    document.body.append(ring);
    const hide = holdStyle(el, 'outline-color', 'transparent');
    const up = ring.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing, fill: 'forwards' });
    let done = false;
    const end = () => { if (done) return; done = true; ring.remove(); hide.cancel(); up.cancel(); };
    up.addEventListener('finish', end); up.addEventListener('cancel', end);
    anims.push(hide, up);
    return true;
  }
  const mq = (q) => matchMedia(q).matches;
  if (mq('(forced-colors: active)')) return null;   // (the system draws the ring)
  document.documentElement.classList.add('fr');   // (the stylesheet's ring colours and offsets alike, app.css next to :focus-visible)
  let by = 'kb';   // what last reached for the page: 'ptr' (mouse, pen, finger) or 'kb'
  let held = null;   // { el, anims }: the effects on the control that has the ring
  const drop = () => { if (!held) return; for (const a of held.anims) { try { a.cancel(); } catch (e) { caught('focus-ring:114', e); /* gone */ } } held = null; };

  // The ring measured again after the control's own scroll: a rest pass, so the reads sit between two frames.
  function recheck() {
    const el = held?.el;
    if (!el || !el.isConnected) return;
    try {
      if (ringClipped(el.getBoundingClientRect(), clipBoxes(el), held.off + held.w)) held.anims.push(holdStyle(el, 'outline-offset', `${-held.w}px`));
    } catch (e) { caught('focus-ring:122', e); /* leave the ring as it is */ }
  }

  function lit(el) {
    if (!(el instanceof HTMLElement) || !el.animate) return;
    drop();
    try { if (!el.matches(':focus-visible')) return; } catch { return; }
    const cs = getComputedStyle(el);
    if (cs.outlineStyle === 'none' || cs.outlineStyle === 'hidden') return;   // (this control draws its ring some other way)
    const anims = [];
    const w = parseFloat(cs.outlineWidth) || 0, off = parseFloat(cs.outlineOffset) || 0;
    if (by === 'ptr' && !isTextEntry(el)) {
      anims.push(holdStyle(el, 'outline-color', 'transparent'));
    } else {
      // Cut off? The ring reaches off + w beyond the control's box.
      let inset = false;
      try { inset = ringClipped(el.getBoundingClientRect(), clipBoxes(el), off + w); } catch (e) { caught('focus-ring:138', e); /* measure again below */ }
      if (inset) anims.push(holdStyle(el, 'outline-offset', `${-w}px`));
      const ease = () => getComputedStyle(document.documentElement).getPropertyValue('--ease-arrive').trim() || 'ease-out';
      if (!mq('(prefers-reduced-motion: reduce)') && cs.outlineColor) fadeCopy(el, cs, w, inset ? -w : off, ease(), anims);   // (faded on its own layer; where no copy can be made the ring shows at once)
      // (A scroll that focus itself causes can move the control against an edge after this point: measured once more, in a task of
      // its own after the next paint, never inside a frame.)
      if (!inset) setTimeout(() => restPass(recheck), 20);   // (then a rest pass, between frames: the measuring is never in a timer's callback)
    }
    held = { el, anims, off, w };
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
