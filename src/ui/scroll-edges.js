// Soft edges on the lists that scroll (1 Nov 2026, scroll-edges): a 12 px fade at an edge only while there is more beyond it in
// that direction. At the top of a list there is no top fade, scrolled to the end no bottom fade, and a list that does not scroll
// has no fade at all (it carries no class). The fades ease in and out on --d-small as an end is reached or left: this module only
// says which ends have more (--sedge-t / --sedge-b, 0 or 1, registered in app.css; a menu's veils ease them by their opacity, a list's mask takes them at once); the stylesheet draws them
// (a mask on the scrolling element, or a sticky veil on a menu, which is its own glass and must keep its edge and shadow whole).
//
// Which lists: the menu's two columns, the Treat and Tests bodies, the docked cards' scroller and every popover menu (Settings, Blood,
// Layers, the lens menu, and the phone's sheets). Left to their own: the History list (its own mask) and the search palette.
//
// Cost: no scroll listener and no read of the page as it scrolls or in a frame: the browser reports the ends (IntersectionObserver), and
// the box's overflow and padding are read only as it is resized; a list is only watched while it is in the page.
import { restPass } from './rest-pass.js';
import { reduceMotionMQ } from './motion.js';

const LISTS = '.um-col, .um-cols, .tc-body, .ac-scroll, .menu:not(.tl-history), .instrument-workspace .dock-pane';
const SLOP = 1;   // (px: a fraction of a pixel of scroll, from zoom or rounding, is not "more")

/** Which ends of a scrolled box have more beyond them: [top, bottom] as 0 or 1. A box that does not scroll has neither. */
export function edgeState(scrollTop, scrollHeight, clientHeight) {
  if (scrollHeight - clientHeight <= SLOP) return null;
  return [scrollTop > SLOP ? 1 : 0, scrollHeight - clientHeight - scrollTop > SLOP ? 1 : 0];
}

export function initScrollEdges(root = document.body) {
  if (!root) return null;
  document.documentElement.classList.add('se-gpu');
  const lists = new WeakMap();   // list -> { el, drop, scrolls, pt, pb, kids, view, moreT, moreB }
  const owner = new WeakMap();   // (a child watched for the list it sits in -> that list's record)
  // What the page lays out is read only here, as a box is resized or its children change (never in a frame, never as it scrolls):
  // whether the box scrolls at all (a box whose overflow is visible or clipped, as the menu's column holder is on a desktop, does not,
  // whatever its content does) and its padding, which the veil on a menu reaches through so it ends at the panel's own edge.
  const look = (l) => { const cs = getComputedStyle(l.el); l.scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll'; l.pt = cs.paddingTop; l.pb = cs.paddingBottom; };
  const ro = new ResizeObserver((entries) => { for (const e of entries) { const l = lists.get(e.target) || owner.get(e.target); if (l) { if (l.el === e.target) look(l); apply(l); } } });
  // Which ends have more beyond them comes from the browser's own intersection of the list's children with the list's view
  // (IntersectionObserver: no read of the page): content above when the first child that has a box reaches above the view, below when
  // the last reaches under it. Each child's last report is kept; fine steps, so a tall child reports as it moves.
  const STEPS = Array.from({ length: 51 }, (_, i) => i / 50);
  const io = typeof IntersectionObserver === 'function' ? new Map() : null;   // list -> its IntersectionObserver
  // A child's first and last small piece (its first or last child down to four levels, a [hidden] one skipped): a child taller than the
  // view (a column of the menu) moves in the view without its share in view changing, so its ends are reported by those pieces.
  const leaf = (c, last) => { let n = c; for (let d = 0; d < 4; d++) { let k = last ? n.lastElementChild : n.firstElementChild; while (k && k.hidden) k = last ? k.previousElementSibling : k.nextElementSibling; if (!k) break; n = k; } return n; };
  function ends(l) {
    const { el } = l;
    let o = io?.get(el);
    if (!o && io) {
      o = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const r = e.boundingClientRect;
          if (e.rootBounds) l.view = e.rootBounds;
          l.kids.set(e.target, r.width > 0 || r.height > 0 ? { top: r.top, bottom: r.bottom } : null);
        }
        sides(l); apply(l);
      }, { root: el, threshold: STEPS });
      io.set(el, o);
    }
    const want = new Set();
    l.leaves = new Map();
    for (const c of el.children) { const f = leaf(c, false), z = leaf(c, true); l.leaves.set(c, [f, z]); want.add(c).add(f).add(z); }
    for (const c of [...l.kids.keys()]) if (!want.has(c)) { o?.unobserve(c); l.kids.delete(c); }
    for (const c of want) if (!l.kids.has(c)) { l.kids.set(c, null); o?.observe(c); }
    sides(l);
  }
  // (From the first and the last child that has a box: the content's own two ends, each by its small end piece where it has one.)
  function sides(l) {
    l.moreT = l.moreB = false;
    if (!l.view || !l.leaves) return;
    let first = null, last = null;
    for (const [c, [f, z]] of l.leaves) { if (!l.kids.get(c)) continue; first ||= l.kids.get(f) || l.kids.get(c); last = l.kids.get(z) || l.kids.get(c); }
    if (first && first.top < l.view.top - SLOP) l.moreT = true;
    if (last && last.bottom > l.view.bottom + SLOP) l.moreB = true;
  }

  // Writes only: the list's class and its two variables, from what was read above. No frame, no timer: a menu's veils fade in by
  // their own entrance (a crossfade keyframe in app.css, from the first style they have) and out by their opacity transition, and the
  // class goes when that transition ends; a list's mask takes its ends at once, so its class goes at once.
  const menuOf = (el) => el.classList.contains('menu');
  const still = () => typeof matchMedia === 'function' && reduceMotionMQ.matches;
  const gone = (l) => { l.drop = 0; l.el.classList.remove('se'); };
  function apply(l) {
    const { el } = l;
    if (!el.isConnected) return;
    const st = l.scrolls && (l.moreT || l.moreB) ? [l.moreT ? 1 : 0, l.moreB ? 1 : 0] : null;
    if (!st) {
      // Nothing to scroll (any more): the fades ease out and then the class goes, so a list that just fit does not snap.
      if (el.classList.contains('se') && !l.drop) {
        const was = el.style.getPropertyValue('--sedge-t') === '1' || el.style.getPropertyValue('--sedge-b') === '1';
        el.style.setProperty('--sedge-t', '0'); el.style.setProperty('--sedge-b', '0');
        if (was && menuOf(el) && !still()) l.drop = 1;   // (transitionend / transitioncancel, in watch, takes the class off)
        else gone(l);
      }
      return;
    }
    l.drop = 0;
    if (!el.classList.contains('se')) {
      el.style.setProperty('--fade-pt', l.pt || '0px'); el.style.setProperty('--fade-pb', l.pb || '0px');
      el.style.setProperty('--sedge-t', String(st[0])); el.style.setProperty('--sedge-b', String(st[1]));
      el.classList.add('se');
      return;
    }
    const [t, b] = st;
    if (el.style.getPropertyValue('--sedge-t') !== String(t)) el.style.setProperty('--sedge-t', String(t));
    if (el.style.getPropertyValue('--sedge-b') !== String(b)) el.style.setProperty('--sedge-b', String(b));
  }

  function watch(el) {
    if (lists.has(el) || !io) return;
    const l = { el, drop: 0, scrolls: false, pt: '', pb: '', kids: new Map(), view: null, moreT: false, moreB: false };
    lists.set(el, l);
    el.addEventListener('transitionend', (e) => { if (l.drop && e.target === el && e.pseudoElement && e.propertyName === 'opacity') gone(l); });
    el.addEventListener('transitioncancel', (e) => { if (l.drop && e.target === el && e.pseudoElement) gone(l); });
    look(l);
    ro.observe(el);
    // Content that changes inside a list the size of the list (a filter hiding rows) changes how far it scrolls, not its box:
    // its children are watched too, and again when they are replaced.
    const kids = () => { for (const c of el.children) if (!owner.has(c)) { owner.set(c, l); ro.observe(c); } ends(l); };
    new MutationObserver(kids).observe(el, { childList: true });
    kids();
  }

  function scan(node) {
    if (node.nodeType !== 1 || node instanceof SVGElement) return;
    if (node.matches(LISTS)) watch(node);
    for (const el of node.querySelectorAll(LISTS)) watch(el);
  }

  scan(root);
  // (2 Nov 2026: new lists are looked at between frames (rest-pass.js), not in the observer's microtask: look reads their styles.)
  const added = [];
  let addAsk = 0;
  function scanAdded() { addAsk = 0; for (const n of added.splice(0)) if (n.isConnected) scan(n); }
  new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) added.push(n); if (added.length && !addAsk) addAsk = restPass(scanAdded); }).observe(root, { childList: true, subtree: true });
  return true;
}

if (typeof document !== 'undefined' && typeof ResizeObserver !== 'undefined') initScrollEdges();
