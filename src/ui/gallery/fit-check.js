// The Check action of the gallery page (plan 2.7): runs the shared fit rules (fit-rules.js) on whatever card is on the screen of the device in hand,
// outlines each problem in red, and hands back a list to copy. No layout-snap import and no DOM at top level: the caller hands in the layout reads
// (`io`, the page gives layout-snap.js's) and the document, so a unit test runs it with a fake page. It runs on a tap, never per frame.
import { readCards, readStructureCard, judgeCards, judgeStructureCard, reportText, WORDS_MIN_PX } from './fit-rules.js';

export const OUTLINE_ID = 'gallery-fit-outlines';

/**
 * Reads the slide's cards (and the open structure card, if any), judges them, and names the element each problem is about.
 * io: { box, rects, style, metric, ctm }. pps: window.pps (its `card.el` and `presenter.busy()` are used when present).
 * Returns { problems: [{ kind, text, line, where, el }], busy, slide, structure }. `busy`: the presenter was still moving cards, so a
 * "shown before whole" finding may be only the entry itself (check again once it rests).
 */
export function runCheck({ io, pps, oldRules = false, doc = document }) {
  const els = new Map();
  const tio = { ...io, seen: (k, el) => { if (!els.has(k)) els.set(k, el); } };
  const env = { minPx: WORDS_MIN_PX }, opts = { oldRules };
  const problems = [];
  const deck = readCards(tio, env);
  for (const p of judgeCards(deck, opts)) problems.push({ ...p, where: 'slide', el: els.get(p.kind === 'ratio' ? 'ratio' : p.text) || null });
  const card = pps?.card?.el;
  const sm = card && !card.hidden ? readStructureCard(tio, card, env) : null;
  for (const p of judgeStructureCard(sm, opts)) problems.push({ ...p, where: 'card', el: els.get(['blank', 'cut', 'tall'].includes(p.kind) ? 'card' : p.text) || null });
  let busy = false;
  try { busy = !!pps?.presenter?.busy?.(); } catch { /* (no presenter: not busy) */ }
  return { problems, busy, slide: deck.shown > 0, structure: !!sm };
}

/** Removes the red outlines. */
export function clearOutlines(doc = document) { doc.getElementById(OUTLINE_ID)?.remove(); }

/**
 * Puts a red outline round each problem's element, numbered as the list is (one outline per element, its numbers joined).
 * box(el) is the layout read (layout-snap's readBox). Returns the number of outlines drawn.
 */
export function drawOutlines(problems, { box, doc = document }) {
  clearOutlines(doc);
  const byEl = new Map();
  problems.forEach((p, i) => { if (p.el) byEl.set(p.el, [...(byEl.get(p.el) || []), i + 1]); });
  if (!byEl.size) return 0;
  const wrap = doc.createElement('div');
  wrap.id = OUTLINE_ID;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000';
  let n = 0;
  for (const [el, nums] of byEl) {
    const b = box(el);
    if (!b || !(b.width > 0 && b.height > 0)) continue;
    const d = doc.createElement('div');
    d.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;box-sizing:border-box;border:2px solid var(--danger);border-radius:4px;box-shadow:0 0 0 1px var(--surface)`;
    const t = doc.createElement('span');
    t.textContent = nums.join(', ');
    t.style.cssText = 'position:absolute;left:-2px;top:-2px;transform:translateY(-100%);background:var(--danger);color:var(--text-inverse);font:600 12px/16px system-ui,sans-serif;padding:0 5px;border-radius:4px 4px 4px 0;white-space:nowrap';
    d.append(t);
    wrap.append(d);
    n++;
  }
  if (n) doc.body.append(wrap);
  return n;
}

/** The text to copy: the report, with each problem numbered as its outline is. */
export function numberedReport(problems, where) {
  const text = reportText(problems.map((p, i) => ({ ...p, text: `#${i + 1} ${p.text}` })), where);
  return text;
}
