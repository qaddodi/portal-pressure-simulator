// The gallery API's two page readers (plan faster-checks-recs 3.5): the words on the screen and the boxes of the cards. Each is ONE SELF-CONTAINED
// FUNCTION, like fit-rules.js's readers: it uses nothing outside its own body but the `io` it is handed (and the page's `document`/`window`), so the
// device calls it with layout-snap.js's reads and scripts/fit-io.mjs sends `fn.toString()` into headless Chromium with plain DOM reads.
// io = { box(el), rects(el), style(el), metric(el, key), ctm(el) }. No DOM import at top level: a unit test loads this in node.

/** The roots the readers look in: the presenter's three cards, an open structure card, the Tests card, a toast. */
export const WORD_ROOTS = ['.pz-text', '.pz-data', '.pz-panel', '.action-card', '#dock', '.toast'];

/**
 * The words on the screen, per card. Only elements that would show (nothing hidden, faded out or parked), text kept whole (an element with words of its own, or with no
 * element child), spaces collapsed, screen-reader-only words left out. Words the GPU letters (chart tick labels, GL words) are not in the page
 * and so not here.
 * env.roots: other root selectors (default WORD_ROOTS).
 * Returns { vw, vh, cards: { '<selector>': ['words', ...] } }; a root that is not up is left out.
 */
export function readWords(io, env) {
  const roots = (env && env.roots) || ['.pz-text', '.pz-data', '.pz-panel', '.action-card', '#dock', '.toast'];
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight');
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = st(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return st(el).visibility !== 'hidden';
  };
  const cards = {};
  for (const q of roots) {
    const root = document.querySelector(q);
    if (!root || !vis(root)) continue;
    const out = [];
    // (An element with words of its own is one piece of text, its inline children included: "Flow <b>toward</b> the liver." is one line, not two stray words.)
    const walk = (el) => {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS' || el.classList.contains('sr-only') || el.classList.contains('ac-ghost') || !vis(el)) return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (own || !el.childElementCount) {
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
        return;
      }
      for (const k of el.children) walk(k);
    };
    for (const k of root.children) walk(k);
    cards[q] = out;
  }
  return { vw, vh, cards };
}

/**
 * Where each card stands, rounded to 2 px so a diff between two runs shows a real move, not a sub-pixel one.
 * env.roots: other selectors (default WORD_ROOTS).
 * Returns { vw, vh, boxes: { '<selector>': [left, top, right, bottom] } }; a card that is not up (absent, hidden, no size) is left out.
 */
export function readBoxes(io, env) {
  const roots = (env && env.roots) || ['.pz-text', '.pz-data', '.pz-panel', '.action-card', '#dock', '.toast'];
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight');
  const r2 = (v) => Math.round(v / 2) * 2;
  const boxes = {};
  for (const q of roots) {
    const el = document.querySelector(q);
    if (!el || el.hidden) continue;
    if (io.style(el).display === 'none') continue;
    const b = io.box(el);
    if (!b || !(b.width > 0) || !(b.height > 0)) continue;
    boxes[q] = [r2(b.left), r2(b.top), r2(b.right), r2(b.bottom)];
  }
  return { vw, vh, boxes };
}
