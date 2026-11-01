// Soft edges on the lists that scroll (1 Nov 2026, scroll-edges): a 12 px fade at an edge only while there is more beyond it in
// that direction. At the top of a list there is no top fade, scrolled to the end no bottom fade, and a list that does not scroll
// has no fade at all (it carries no class). The fades ease in and out on --d-small as an end is reached or left: this module only
// says which ends have more (--sedge-t / --sedge-b, 0 or 1, registered in app.css and transitioned there); the stylesheet draws them
// (a mask on the scrolling element, or a sticky veil on a menu, which is its own glass and must keep its edge and shadow whole).
//
// Which lists: the menu's two columns, the Treat and Tests bodies, the docked cards' scroller and every popover menu (Settings, Blood,
// Layers, the lens menu, and the phone's sheets). Left to their own: the History list (its own mask) and the search palette.
//
// ?edges=0 switches it off: nothing is observed, no class is added, and the page is as it was before this file.
//
// Cost: one passive scroll listener per list, and a read of scrollTop / scrollHeight / clientHeight (no other layout read) in at most
// one frame per list; a list is only watched while it is in the page.
import { D_SMALL } from './ease.js?v=615d96d663';
import { frameFor } from './frame.js?v=15d5254a2c';

const nextFrame = frameFor('scroll-edges');

const LISTS = '.um-col, .um-cols, .tc-body, .ac-scroll, .menu:not(.tl-history), .instrument-workspace .dock-pane';
const SLOP = 1;   // (px: a fraction of a pixel of scroll, from zoom or rounding, is not "more")

export const edgesOff = (search = typeof location !== 'undefined' ? location.search : '') => /[?&]edges=0\b/.test(search);

/** Which ends of a scrolled box have more beyond them: [top, bottom] as 0 or 1. A box that does not scroll has neither. */
export function edgeState(scrollTop, scrollHeight, clientHeight) {
  if (scrollHeight - clientHeight <= SLOP) return null;
  return [scrollTop > SLOP ? 1 : 0, scrollHeight - clientHeight - scrollTop > SLOP ? 1 : 0];
}

export function initScrollEdges(root = document.body) {
  if (!root || edgesOff()) return null;
  const lists = new WeakMap();   // list -> { el, raf, drop }
  const ro = new ResizeObserver((entries) => { for (const e of entries) { const l = lists.get(e.target) || owner.get(e.target); if (l) schedule(l); } });
  const owner = new WeakMap();   // (a child watched for the list it sits in -> that list's record)

  function schedule(l) { if (!l.raf) l.raf = nextFrame(() => { l.raf = 0; sync(l); }); }

  function sync(l) {
    const { el } = l;
    if (!el.isConnected) return;
    // (A box whose overflow is visible or clipped, as the menu's column holder is on a desktop, does not scroll, whatever its content does.)
    const oy = getComputedStyle(el).overflowY;
    const st = oy === 'auto' || oy === 'scroll' ? edgeState(el.scrollTop, el.scrollHeight, el.clientHeight) : null;
    if (!st) {
      // Nothing to scroll (any more): the fades ease out and then the class goes, so a list that just fit does not snap.
      if (el.classList.contains('se') && !l.drop) {
        el.style.setProperty('--sedge-t', '0'); el.style.setProperty('--sedge-b', '0');
        l.drop = setTimeout(() => { l.drop = 0; el.classList.remove('se'); schedule(l); }, D_SMALL + 40);
      }
      return;
    }
    if (l.drop) { clearTimeout(l.drop); l.drop = 0; }
    if (!el.classList.contains('se')) {
      // (the padding the veil on a menu reaches through, so it ends at the panel's own edge)
      const cs = getComputedStyle(el);
      el.style.setProperty('--fade-pt', cs.paddingTop); el.style.setProperty('--fade-pb', cs.paddingBottom);
      el.style.setProperty('--sedge-t', '0'); el.style.setProperty('--sedge-b', '0');
      el.classList.add('se');
      // The class and the first values land in separate frames, so the fade eases in from nothing rather than appearing.
      l.raf = nextFrame(() => { l.raf = 0; sync(l); });
      return;
    }
    const [t, b] = st;
    if (el.style.getPropertyValue('--sedge-t') !== String(t)) el.style.setProperty('--sedge-t', String(t));
    if (el.style.getPropertyValue('--sedge-b') !== String(b)) el.style.setProperty('--sedge-b', String(b));
  }

  function watch(el) {
    if (lists.has(el)) return;
    const l = { el, raf: 0, drop: 0 };
    lists.set(el, l);
    el.addEventListener('scroll', () => schedule(l), { passive: true });
    ro.observe(el);
    // Content that changes inside a list the size of the list (a filter hiding rows) changes how far it scrolls, not its box:
    // its children are watched too, and again when they are replaced.
    const kids = () => { for (const c of el.children) if (!owner.has(c)) { owner.set(c, l); ro.observe(c); } schedule(l); };
    new MutationObserver(kids).observe(el, { childList: true });
    kids();
  }

  function scan(node) {
    if (node.nodeType !== 1 || node instanceof SVGElement) return;
    if (node.matches(LISTS)) watch(node);
    for (const el of node.querySelectorAll(LISTS)) watch(el);
  }

  scan(root);
  new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) scan(n); }).observe(root, { childList: true, subtree: true });
  return true;
}

if (typeof document !== 'undefined' && typeof ResizeObserver !== 'undefined') initScrollEdges();
