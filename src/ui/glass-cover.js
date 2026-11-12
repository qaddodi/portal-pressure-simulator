// A card over a card hides it whole (Mohammad, 12 Nov 2026: "what happens when two cards are on top of each other?" ... "why can't the text be
// covered too?"). The glass of every card is drawn in the figure's canvas, the later card over the earlier (glass-gl.js drawPanes), so the top
// card's glass already covers the lower card's glass. The lower card's words, lines and buttons are the page's, above that canvas, and showed
// through the top card. Here the lower card is cut (its clip-path, which the compositor applies) to leave out the top card's shape: the top card
// then hides everything of the one under it, as one sheet of glass would.
//
// Only cards of one glass.add region cover each other (the deck's cards: teaching, case, data, readings), whose draw order is their page order;
// a card the page cuts with a clip-path of its own is never cut here. A clip is written only when what covers a card changed (a card sliding
// over another cuts it again each frame of the slide), and taken off once nothing covers it.
//
//   const cover = glassCover();
//   cover.apply(panes, sameGroup)   // panes in draw order: { g, r (client px), rad ([tl, tr, br, bl] px) | null, box (r is g's own box) }
//   cover.clear()                   // every clip written taken off (the glass let go)

const ARC = 4;   // (segments a rounded corner of the cut is laid with)
const OUT = 400;   // (CSS px the clip reaches past the card's box all round: its own shadow and anything it lays outside its box stay)

/** The clip that leaves out `holes` (client rects { left, top, right, bottom, rad }) from an element whose box is `r` (client px), as a CSS
 *  polygon, even-odd, in % of its box (a card scaled or moved by a transform is cut where it is drawn). Holes that overlap are taken as one box. */
// (A string is made only when what covers a card changed (glassCover's same()): none at rest, one a frame only while a card slides over another.)
const O = `calc(0% - ${OUT}px) calc(0% - ${OUT}px)`;
const HEAD = `polygon(evenodd, ${O}, calc(100% + ${OUT}px) calc(0% - ${OUT}px), calc(100% + ${OUT}px) calc(100% + ${OUT}px), calc(0% - ${OUT}px) calc(100% + ${OUT}px), ${O}`;
let R = null, S = '';
// (A hole is held inside the clip's own outline (OUT past the box): past it, even-odd would show what the hole meant to hide.)
function pt(x, y) {
  const cx = Math.max(R.left - OUT + 1, Math.min(R.right + OUT - 1, x)), cy = Math.max(R.top - OUT + 1, Math.min(R.bottom + OUT - 1, y));
  S += `, ${Math.round((cx - R.left) / R.width * 1e5) / 1e3}% ${Math.round((cy - R.top) / R.height * 1e5) / 1e3}%`;   // alloc-rare: a clip string, made only when what covers a card changed
}
// (One rounded corner from angle a0, a quarter turn of ARC segments; a square one is its point.)
function corner(cx, cy, rr, a0, x, y) {
  if (!rr) { pt(x, y); return; }
  for (let i = 0; i <= ARC; i++) { const a = a0 + (Math.PI / 2) * (i / ARC); pt(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
}
export function coverClip(r, holes) {
  R = r; S = HEAD;
  for (const h of holes) {
    const w = h.right - h.left, ht = h.bottom - h.top, m = Math.min(w / 2, ht / 2), d = h.rad;
    const tl = d ? Math.max(0, Math.min(d[0] || 0, m)) : 0, tr = d ? Math.max(0, Math.min(d[1] || 0, m)) : 0;
    const br = d ? Math.max(0, Math.min(d[2] || 0, m)) : 0, bl = d ? Math.max(0, Math.min(d[3] || 0, m)) : 0;
    // (Clockwise from the top left, back to where it began, then back to the outline's corner.)
    corner(h.left + tl, h.top + tl, tl, Math.PI, h.left, h.top);
    corner(h.right - tr, h.top + tr, tr, -Math.PI / 2, h.right, h.top);
    corner(h.right - br, h.bottom - br, br, 0, h.right, h.bottom);
    corner(h.left + bl, h.bottom - bl, bl, Math.PI / 2, h.left, h.bottom);
    if (tl) pt(h.left, h.top + tl); else pt(h.left, h.top);
    S += `, ${O}`;   // alloc-rare: a clip string, made only when what covers a card changed
  }
  const out = `${S})`;   // alloc-rare: a clip string, made only when what covers a card changed
  R = null; S = '';
  return out;
}

let diff = false;
const put = (a, k, v) => { if (a[k] !== v) diff = true; a[k] = v; };
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The cuts for one glass's cards. */
export function glassCover() {
  const wrote = new Map();   // (element → the clip written on it)
  const own = new WeakMap();   // (element → its page's own clip-path, read before any of ours: a card with one is never cut)
  const now = new Set(), holes = [], holePool = [];
  const sigs = new Map();   // (element → the numbers its clip was made from: a frame with the same writes nothing and makes no string)
  function same(g, r) {
    let a = sigs.get(g);
    const n = 4 + holes.length * 8;
    if (!a || a.length < n + 1) { a = new Float64Array(Math.max(n + 1, 32)); sigs.set(g, a); a[0] = -1; }   // alloc-rare: a card's first cut, or more cards over it than before
    diff = a[0] !== n; a[0] = n;
    put(a, 1, r.left); put(a, 2, r.top); put(a, 3, r.width); put(a, 4, r.height);
    let k = 5;
    for (const h of holes) {
      put(a, k++, h.left); put(a, k++, h.top); put(a, k++, h.right); put(a, k++, h.bottom);
      for (let i = 0; i < 4; i++) put(a, k++, h.rad ? h.rad[i] : 0);
    }
    return !diff;
  }
  function hole(i, p) {
    const h = holePool[i] || (holePool[i] = { left: 0, top: 0, right: 0, bottom: 0, rad: null });   // alloc-rare: the pool grows to the most cards that cover one
    h.left = p.r.left; h.top = p.r.top; h.right = p.r.right; h.bottom = p.r.bottom; h.rad = p.rad || null;
    return h;
  }
  // (Overlapping holes would cancel each other under even-odd: taken as one box, their bounds.)
  function merge(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!meets(a, b)) continue;
        a.left = Math.min(a.left, b.left); a.top = Math.min(a.top, b.top); a.right = Math.max(a.right, b.right); a.bottom = Math.max(a.bottom, b.bottom); a.rad = null;
        list.splice(j, 1); j = i;
      }
    }
  }
  function set(g, v) {
    if (wrote.get(g) === v) return;
    if (!wrote.has(g)) own.set(g, g.style.getPropertyValue('clip-path'));
    g.style.setProperty('clip-path', v);
    wrote.set(g, v);
  }
  function take(g) {
    const was = own.get(g) || '';
    if (was) g.style.setProperty('clip-path', was); else g.style.removeProperty('clip-path');
    wrote.delete(g); sigs.delete(g);
  }
  return {
    /** panes in draw order; sameGroup(a, b): whether two elements' cards cover each other; ownClip(g): whether the page cuts g itself. */
    apply(panes, sameGroup, ownClip) {
      now.clear();
      for (let i = 0; i < panes.length; i++) {
        const p = panes[i];
        if (!p.box || !p.r.width || !p.r.height || now.has(p.g)) continue;
        if (!wrote.has(p.g) && ownClip?.(p.g)) continue;
        holes.length = 0;
        for (let j = i + 1; j < panes.length; j++) {
          const q = panes[j];
          if (q.g === p.g || !meets(p.r, q.r) || !sameGroup(p.g, q.g) || p.g.contains?.(q.g) || q.g.contains?.(p.g)) continue;
          holes.push(hole(holes.length, q));
        }
        if (!holes.length) continue;
        merge(holes);
        now.add(p.g);
        if (same(p.g, p.r) && wrote.has(p.g)) continue;
        set(p.g, coverClip(p.r, holes));
      }
      for (const g of wrote.keys()) if (!now.has(g)) take(g);
    },
    clear() { for (const g of [...wrote.keys()]) take(g); },   // alloc-rare: the glass let go
    get cut() { return wrote.size; },
  };
}
