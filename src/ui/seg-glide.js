// One gliding selection for every segmented control and tab strip (sprint 1 Nov, brief 1). A segmented control (.seg), the
// Tests / Treat tab row (.instr-tabs) and the menu's Present / Patients tabs (.um-tabs) each used to paint the chosen button's
// own background, so a change faded one pill out and another in, in place: the selection blinked across. Now each control has
// ONE moving piece, the control's own ::before (nothing is added to the page), that travels from the old choice to the new one,
// its left edge, top, width and height together, over --d-small on --ease-move (styles/app.css, next to each control's rules).
//
//   - This file only measures. It finds the controls as they are added (one MutationObserver on the body), puts the chosen
//     button's box on the control as --gx / --gy / --gw / --gh, and adds the class .seg-glide, which turns the button's own
//     fill off and the piece on. The stylesheet draws the piece: a pill (segments, tabs), or the 2 px underline the desktop's
//     tab row and the menu's tabs use, at exactly the place and look the chosen button had.
//   - A change of the choice glides. The first placement, a resize, a font arriving, a button appearing (Sinusoid), a phone
//     turning: no animation, the piece is simply where the choice is. Under a tab that opens its name (the workspace's phone
//     row) the piece follows the tab as it grows, on a short step.
//   - Reduce Motion: the piece does not travel; it fades out where it was and in where it is (--d-flip).
//   - High contrast keeps today's Highlight on the button and hides the piece (the stylesheet).
//   - ?glide=0: this file does nothing, so the page is today's, class for class.
import { D_FLIP, D_SMALL } from './ease.js?v=615d96d663';

const SEL = '.seg, .instr-tabs, .um-tabs';
/** ?glide=0 in a page's search string: this file does nothing and the page is today's. */
export const glideOff = (search) => /[?&]glide=0\b/.test(String(search ?? ''));
const PICKED = '[aria-pressed="true"], [aria-selected="true"]';

/** The control's chosen button: the one, among its own buttons, that is pressed or selected; null when none or several. */
export function chosen(ctl) {
  let one = null;
  for (const b of ctl.children) {
    if (b.localName !== 'button' || b.hidden || !b.matches(PICKED)) continue;
    if (one) return null;
    one = b;
  }
  return one;
}

/** The button's box in the control's own pixels (from its padding edge), whatever scale an ancestor is drawn at; null while
 *  either has no box (hidden, or its card not yet open). */
export function boxIn(ctl, btn) {
  const c = ctl.getBoundingClientRect(), b = btn.getBoundingClientRect(), w = ctl.offsetWidth;
  if (!c.width || !b.width || !w) return null;
  const k = c.width / w;
  return { x: (b.left - c.left) / k - ctl.clientLeft, y: (b.top - c.top) / k - ctl.clientTop, w: b.width / k, h: b.height / k };
}

const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < .05 && Math.abs(a.y - b.y) < .05 && Math.abs(a.w - b.w) < .05 && Math.abs(a.h - b.h) < .05;

export function startSegGlide(root = document.body, search = typeof location !== 'undefined' ? location.search : '') {
  if (glideOff(search) || typeof MutationObserver === 'undefined') return null;
  const states = new Map();   // control -> { btn, box, until, timer }
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    const seen = new Set();
    for (const e of entries) {
      const ctl = e.target.closest?.(SEL);
      if (ctl && states.has(ctl) && !seen.has(ctl)) { seen.add(ctl); settle(ctl, false); }
    }
  }) : null;

  // The piece at a box. `still`: with no transition, and flushed, so the next style pass finds nothing to animate.
  function put(ctl, box, still) {
    const s = ctl.style;
    if (still) ctl.classList.add('glide-still');
    ctl.classList.add('seg-glide');
    s.setProperty('--gx', `${box.x}px`); s.setProperty('--gy', `${box.y}px`); s.setProperty('--gw', `${box.w}px`); s.setProperty('--gh', `${box.h}px`);
    if (still) { void getComputedStyle(ctl, '::before').left; ctl.classList.remove('glide-still'); }
  }
  function drop(ctl) {
    ctl.classList.remove('seg-glide', 'glide-still', 'glide-follow');
    for (const p of ['--gx', '--gy', '--gw', '--gh', '--go']) ctl.style.removeProperty(p);
  }

  /** Bring one control's piece to its choice. `moved`: the choice has just changed (glide); otherwise the choice is where it
   *  was and only the box may have moved (a resize, a button appearing: no animation; or, while a glide is under way, the
   *  piece follows on a short step). */
  function settle(ctl, moved) {
    let st = states.get(ctl);
    if (!ctl.isConnected) { clearTimeout(st?.timer); states.delete(ctl); ro?.unobserve(ctl); return; }
    if (!st) { st = { btn: null, box: null, until: 0, timer: 0 }; states.set(ctl, st); ro?.observe(ctl); }
    for (const b of ctl.children) if (b.localName === 'button') ro?.observe(b);
    const btn = chosen(ctl), box = btn ? boxIn(ctl, btn) : null;
    if (!box) { clearTimeout(st.timer); st.btn = null; st.box = null; drop(ctl); return; }
    const first = !st.box, now = performance.now();
    moved = moved && !first && btn !== st.btn;
    if (!moved && st.btn === btn && same(st.box, box)) return;
    st.btn = btn; st.box = box;
    clearTimeout(st.timer);
    if (first) { put(ctl, box, true); return; }
    if (moved) {
      st.until = now + D_SMALL + 60;
      ctl.classList.remove('glide-follow');
      if (reduce()) {
        // The piece fades out where it was, then is placed and fades in (--d-flip each; the stylesheet gives opacity its step).
        ctl.style.setProperty('--go', '0');
        st.timer = setTimeout(() => { if (!ctl.isConnected || states.get(ctl) !== st) return; const b2 = st.btn && boxIn(ctl, st.btn); if (b2) { st.box = b2; put(ctl, b2, true); } ctl.style.setProperty('--go', '1'); }, D_FLIP);
      } else put(ctl, box, false);
      return;
    }
    if (now < st.until && !reduce()) { ctl.classList.add('glide-follow'); put(ctl, box, false); return; }
    ctl.classList.remove('glide-follow');
    put(ctl, box, true);
  }

  const gather = (node, into) => {
    if (node.nodeType !== 1) return;
    if (node.matches(SEL)) into.add(node);
    for (const c of node.querySelectorAll(SEL)) into.add(c);
  };

  const mo = new MutationObserver((records) => {
    const hit = new Map();   // control -> true when its choice may have changed
    for (const r of records) {
      if (r.type === 'attributes') {
        const p = r.target.parentElement;
        if (!p || !p.matches(SEL)) continue;
        // (A button shown or hidden moves the others: placed again, no animation, unless the choice changed too.)
        hit.set(p, hit.get(p) || r.attributeName !== 'hidden');
      } else {
        const found = new Set();
        for (const n of r.addedNodes) gather(n, found);
        if (r.target.nodeType === 1 && r.target.matches?.(SEL)) found.add(r.target);
        for (const c of found) hit.set(c, hit.get(c) || false);
      }
    }
    for (const [ctl, choice] of hit) settle(ctl, choice);
  });

  const all = new Set(); gather(root, all);
  for (const c of all) settle(c, false);
  mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'hidden'] });
  return { stop() { mo.disconnect(); ro?.disconnect(); for (const [c, s] of states) { clearTimeout(s.timer); drop(c); } states.clear(); } };
}

if (typeof document !== 'undefined' && document.body) startSegGlide();
