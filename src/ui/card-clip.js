// What a card still cuts off after its fit (review 15 Nov 2026, PC-2).
//
// The fit (presenter.js fitCards) shrinks a card's words until its parts fit its box, but it stops at its floor (12 px, the
// card's smallest size) and it counts no overflow inside a part with a height cap (that clips by design). A card that ends its
// fit still too full therefore showed no sign of it: the words' last line was cut and nothing said so. This reads the words
// themselves, where they sit, after the fit has settled: any line of text that reaches past the box that clips it (the card's, or
// a capped part's own) is a clipped card, and the presenter records it by slide (degrade('card-clipped:<slide>:<card>')).
//
// Only text counts: a chart's canvas, a picture hanging past its tile, a closed fold and a pinned chip are not words.
// All reads go through layout-snap.js; this runs in a rest pass, never in a frame.

import { readBox, readRects, readStyle } from './layout-snap.js';

/** A line cut by a pixel or so is rounding, not clipping. */
export const SLACK = 1.5;

/**
 * How far the most outlying of `rects` reaches past `bound`, down (v) and right (h), in px (0 when none does).
 * Rects with no width or no height are layout boxes with no glyphs, not words.
 */
export function reachPast(rects, bound) {
  let v = 0, h = 0;
  for (const q of rects) {
    if (!q.width || !q.height) continue;
    v = Math.max(v, q.bottom - bound.bottom);
    h = Math.max(h, q.right - bound.right);
  }
  return { v, h };
}

/** True when a reach (reachPast) is more than rounding. */
export const isClipped = (r) => r.v > SLACK || r.h > SLACK;

// (A part that is never counted: it is hidden, folded shut, drawn on a GPU canvas, pinned over the card, or a card header /
// tile row whose pictures and chips reach past their boxes by design: the same exceptions presenter.js overflowOf makes.)
const NOT_WORDS = '.pz-dh, .pz-tiles';
const apart = (s) => s.display === 'none' || s.visibility === 'hidden' || s.position === 'absolute' || s.position === 'fixed';

/**
 * The reach of a card's words past what clips them: {v, h}, in px.
 * A part with a height cap clips at its own box, any other part at the card's.
 */
export function clippedBy(card) {
  const cb = readBox(card);
  let v = 0, h = 0;
  const g = document.createRange();
  for (const c of card.children) {
    if (c.hidden || c.matches(NOT_WORDS)) continue;
    const s = readStyle(c);
    if (apart(s) || s.maxHeight === '0px') continue;
    const bound = s.maxHeight !== 'none' ? { bottom: Math.min(cb.bottom, readBox(c).bottom), right: cb.right } : cb;
    const seen = new Map();   // (a text's parent chain: counted once)
    const visible = (el) => {
      for (let e = el; e && e !== card; e = e.parentElement) {
        let ok = seen.get(e);
        if (ok === undefined) { ok = e.matches('canvas, svg, [hidden]') ? false : !apart(readStyle(e)) && readStyle(e).maxHeight !== '0px'; seen.set(e, ok); }
        if (!ok) return false;
      }
      return true;
    };
    const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      g.selectNodeContents(n);
      const r = reachPast(readRects(g), bound);
      if (r.v > v) v = r.v;
      if (r.h > h) h = r.h;
    }
  }
  return { v, h };
}
