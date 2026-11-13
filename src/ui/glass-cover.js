// Any glass over any glass hides it whole (Mohammad, 12 Nov 2026: "what happens when two cards are on top of each other?" ... "why can't the text be
// covered too?" ... then, of the colour key's pill showing through the Settings sheet: "not just settings", "EVERY CARD", "should be able to cover
// other cards", "multiple too"). Every glass is drawn in the figure's canvas, below all of the page, so the top glass covers the lower glass there,
// but the lower card's words, lines and buttons are the page's, above that canvas, and showed through the top card. Here the lower card is cut (its
// clip-path, which the compositor applies) to leave out the shape of every glass above it: the top one then hides everything of the ones under it,
// as one sheet of glass would, however many lie stacked.
//
// Every glass of every region and renderer is on one board (the deck's cards, the sheets, Settings and the menus, the top bar's pills, the colour
// key, the toasts, the callouts, the liver's pane). Which one lies above is the page's own stacking (stackOf, read with the page: its stacking
// contexts, z-index and order), never the order the regions were made in. A card the page cuts with a clip-path of its own keeps it, and its parts (its children) are
// cut instead; a card and a part of it never cut each other. A card the page already clips itself keeps its clip, and its parts are cut instead. A clip is written only when what covers a card changed (a card sliding over another cuts it again each frame of the
// slide), and taken off once nothing covers it.
//
//   const part = glassCover();          // one renderer's place on the board
//   part.apply(panes, ownClip)          // its glasses as drawn: { g, r (client px), rad ([tl, tr, br, bl] px) | null, box, st, cv, cvo, kids, also, a }
//   part.clear()                        // its glasses off the board, every cut they made taken off
import { readStyle } from './layout-snap.js';

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

// ── Stacking (read with the page, never in a frame) ──
// An element's place in the page's paint order: its chain of stacking contexts from the outermost down, ending with what it is painted as in the
// innermost (itself, or the nearest positioned element it is painted with). Each entry: { el, rank } (rank: its z-index where it has one; 0 for a
// positioned element or a context without one; -0.5 for one painted in the flow, under the positioned ones).
const nonNone = (v) => !!v && v !== 'none';
function entryOf(e, memo) {
  let s = memo.get(e);
  if (s) return s;
  const cs = readStyle(e), pos = cs.position, placed = !!pos && pos !== 'static', zi = cs.zIndex;
  const z = !zi || zi === 'auto' ? null : parseInt(zi, 10) || 0, o = parseFloat(cs.opacity);
  // (What makes a stacking context, as the browser's CSS has it. A clip-path or a mask does too, but not here: the cut this file writes is one.)
  const ctx = pos === 'fixed' || pos === 'sticky' || (placed && z !== null) || o < 1 || nonNone(cs.transform) || nonNone(cs.translate) || nonNone(cs.scale) || nonNone(cs.rotate)
    || nonNone(cs.filter) || nonNone(cs.backdropFilter) || cs.isolation === 'isolate' || (!!cs.mixBlendMode && cs.mixBlendMode !== 'normal')
    || /transform|opacity|filter|translate|scale|rotate/.test(cs.willChange || '') || /paint|layout|strict|content/.test(cs.contain || '');
  s = { el: e, rank: placed && z !== null ? z : placed || ctx ? 0 : -0.5, placed, ctx };   // alloc-rare: once per element per read of the page
  memo.set(e, s);
  return s;
}
/** The stacking chain of `el` (outermost first). memo: a Map kept for one read of the page, so shared ancestors are read once. */
export function stackOf(el, memo = new Map()) {   // alloc-rare: read with the page
  const out = [], root = el?.ownerDocument?.documentElement || null;   // alloc-rare: read with the page, never in a frame
  let leaf = null;
  for (let e = el; e && e !== root; e = e.parentElement) {
    const s = entryOf(e, memo);
    if (!leaf) {
      // (Painted in the flow of the context it is in: itself, under that context's positioned ones.)
      if (s.ctx && e !== el) { leaf = { el, rank: -0.5 }; out.push(leaf, s); continue; }   // alloc-rare: read with the page
      if (s.placed || s.ctx) { leaf = s; out.push(s); }
      continue;
    }
    if (s.ctx) out.push(s);
  }
  if (!leaf) out.push({ el, rank: -0.5 });   // alloc-rare: read with the page
  return out.reverse();
}
/** > 0 when chain A paints above chain B, < 0 below, 0 when one holds the other (or either is unknown). */
export function stackCmp(A, B) {
  if (!A || !B) return 0;
  const n = Math.min(A.length, B.length);
  let i = 0;
  while (i < n && A[i].el === B[i].el) i++;
  if (i >= n) return 0;
  const a = A[i], b = B[i];
  if (a.rank !== b.rank) return a.rank - b.rank;
  const at = a.el.compareDocumentPosition?.(b.el) || 0;
  return at & 4 ? -1 : at & 2 ? 1 : 0;   // (4: b comes after a, so b is above; a descendant comes after its ancestor)
}

let diff = false;
const put = (a, k, v) => { if (a[k] !== v) diff = true; a[k] = v; };
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const UP = 0.5;   // (a glass covers the ones under it once it shows at least half: a card fading in or out cuts them at the middle of its fade)

/** A board: every renderer's glasses together (coverBoard() is one; the page has one, BOARD, which glassCover() places a renderer on). */
export function coverBoard() {
  const parts = new Map();   // (owner → { panes (its own kept list, in its draw order), ownClip })
  const wrote = new Map();   // (element → the clip written on it)
  const own = new WeakMap();   // (element → its page's own inline clip-path, read before any of ours)
  const now = new Set(), holes = [], holePool = [];
  const sigs = new Map();   // (element → the numbers its clip was made from: a frame with the same writes nothing and makes no string)
  const all = [], allPart = [], allOwn = [], tr = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
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
    // (A glass cut at a still foot (a phone sheet sliding up from behind the dock: the sheet layer's clip, p.cut) covers only what is drawn of it,
    // above that foot. Uncut, a sheet still rising covered the whole dock, its play bar, timeline and tabs blanked while it rose: 13 Nov 2026.)
    if (p.cut && p.cut.bottom < h.bottom) { h.bottom = p.cut.bottom; if (h.rad) h.rad = null; }
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
  // (Whether glass j lies above glass i: the page's stacking; for glasses whose stacking was not read, the later of one renderer's.)
  const above = (j, i, st) => {
    const q = all[j], p = all[i], mine = st || p.st;
    if (q.st && mine) return stackCmp(q.st, mine) > 0;
    return allPart[j] === allPart[i] && j > i;
  };
  // (The element a glass's words are in, and its box this frame: the glass's own, or the card it is the paper of (cv, its box cvo px off the glass's).)
  const targetOf = (p) => p.cv || p.g;
  function boxOf(p) {
    const r = p.r, o = p.cv && p.cvo;
    if (!o) return r;
    tr.left = r.left + o[0]; tr.top = r.top + o[1]; tr.right = r.right + o[2]; tr.bottom = r.bottom + o[3];
    tr.width = tr.right - tr.left; tr.height = tr.bottom - tr.top;
    return tr;
  }
  // (One element cut where every glass above glass i lies: el (the card, or a part of it, kid) at box r; g the card it belongs to.)
  // (st: the stacking of el when it is not painted where its glass is: the words of a card, laid in their own element above or below its paper.)
  function cutOne(i, el, r, g, st) {
    if (now.has(el) || !r.width || !r.height) return;
    holes.length = 0;
    for (let j = 0; j < all.length; j++) {
      const q = all[j];
      if (j === i || q.bare || q.g === all[i].g || !(q.a == null || q.a >= UP) || !meets(r, q.r) || (q.cut && q.cut.bottom <= Math.max(r.top, q.r.top))) continue;   // (one still wholly below its foot covers nothing)
      const qt = targetOf(q);
      if (qt === g || g.contains?.(q.g) || q.g.contains?.(g) || g.contains?.(qt) || qt.contains?.(g) || (el !== g && (el.contains?.(q.g) || q.g.contains?.(el))) || !above(j, i, st)) continue;
      holes.push(hole(holes.length, q));
    }
    if (!holes.length) return;
    merge(holes);
    now.add(el);
    if (same(el, r) && wrote.has(el)) return;
    set(el, coverClip(r, holes));
  }
  // (A part's box this frame: kid.o px off the glass's own box.)
  function kidBox(p, k) {
    const r = p.r, o = k.o;
    tr.left = r.left + o[0]; tr.top = r.top + o[1]; tr.right = r.right + o[2]; tr.bottom = r.bottom + o[3];
    tr.width = tr.right - tr.left; tr.height = tr.bottom - tr.top;
    return tr;
  }
  function run() {
    all.length = 0; allPart.length = 0; allOwn.length = 0;
    for (const [id, P] of parts) for (let i = 0; i < P.panes.length; i++) { all.push(P.panes[i]); allPart.push(id); allOwn.push(P.ownClip); }
    now.clear();
    for (let i = 0; i < all.length; i++) {
      const p = all[i], g = targetOf(p);
      if (!p.box || !p.r.width || !p.r.height) continue;
      // (A card the page already cuts with a clip of its own (a phone's dock sheet, sinking under the tab row; an app menu under its bar) keeps
      // that clip: its parts (kids: { el, o, own }, its children as read with the page) are cut instead, each at its own box. A part with a clip
      // of its own is left.)
      // (The words of a card that lie in an element of their own beside its paper (p.also: { el, o, own, st }, the teaching card's text and panel) are
      // cut where the glass above them lies, each by its own stacking, whatever is done with the paper.)
      const A = p.also;
      if (A) for (let k = 0; k < A.length; k++) if (!A[k].own) cutOne(i, A[k].el, kidBox(p, A[k]), g, A[k].st);
      if (!wrote.has(g) && allOwn[i]?.(g)) {
        const K = p.kids;
        if (K) for (let k = 0; k < K.length; k++) if (!K[k].own) cutOne(i, K[k].el, kidBox(p, K[k]), g);
        continue;
      }
      cutOne(i, g, boxOf(p), g);
    }
    for (const g of wrote.keys()) if (!now.has(g)) take(g);
    all.length = 0; allPart.length = 0; allOwn.length = 0;
  }
  return {
    /** One renderer's place on the board. */
    part() {
      const id = {};   // alloc-rare: once per renderer
      return {
        /** panes: its glasses as drawn (kept by the board until the next apply or clear: the renderer's own list); ownClip(el): whether the page cuts el itself. */
        apply(panes, ownClip) { const P = parts.get(id); if (P) { P.panes = panes; P.ownClip = ownClip; } else parts.set(id, { panes, ownClip }); run(); },   // alloc-rare: a renderer's first glasses on the board
        clear() { if (parts.delete(id)) run(); },
        get cut() { return wrote.size; },
        /** Whether el's clip-path is one this board wrote (a read of the page then finds ours, not the page's). */
        mine: (el) => wrote.has(el),
      };
    },
    clear() { parts.clear(); for (const g of [...wrote.keys()]) take(g); },   // alloc-rare: the board let go
    get cut() { return wrote.size; },
  };
}

// (The page's one board: every renderer of glass-gl.js puts its glasses on it.)
const BOARD = coverBoard();
/** A renderer's place on the page's board: { apply(panes, ownClip), clear(), cut }. */
export const glassCover = () => BOARD.part();
