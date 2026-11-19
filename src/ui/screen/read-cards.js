// The cards part: each card on the screen (the presenter's teaching, data and panel cards, an open structure card, the Tests dock, a toast): its box,
// how opaque it is, what stage it is in, every line of its words with the size it reaches the screen at, and the fit-rule readings (fit-rules.js's own
// readers, run as the Check button runs them). Layout only: words and boxes, never a picture. Words the GPU letters are not in the page and not here.
//
// The words and boxes come from the gallery's readers (readWords, readBoxes) and the fit rules' readers (readCards, readStructureCard); readCardLines below
// adds only what they do not carry (the size of each line) and walks the page exactly as readWords does, so a test holds that its lines are readWords' lines.
import { registerReader } from './registry.js';
import { WORD_ROOTS, readWords, readBoxes } from '../gallery/readers.js';
import { readCards, readStructureCard, readSheet, WORDS_MIN_PX } from '../gallery/fit-rules.js';
import { readEdges, compactEdges } from '../gallery/edge-rules.js';
import { box4, r1, r2, CARD_KINDS } from './util.js';

export { CARD_KINDS };

/**
 * ONE SELF-CONTAINED FUNCTION (like fit-rules.js's readers; scripts/fit-io.mjs can send it into a page). For each root of env.roots (default WORD_ROOTS) that is
 * up: { box: [l, t, r, b] | null, opacity (product of every opacity above it), classes, lines: [[text, px], ...] } where px is the size a letter reaches
 * the screen at (font size times every `zoom` above it). The walk is readWords': hidden, faded and screen-reader-only words left out, an element with words
 * of its own is one line.
 */
export function readCardLines(io, env) {
  const roots = (env && env.roots) || ['.pz-case', '.pz-text', '.pz-data', '.pz-panel', '.action-card', '#dock', '.toast'];
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = st(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return st(el).visibility !== 'hidden';
  };
  const eop = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { if (n.hidden || st(n).display === 'none') return 0; o *= +st(n).opacity; } return o; };
  const screenPx = (el) => {
    const fs = parseFloat(st(el).fontSize);
    if (!fs) return 0;
    let k = 1;
    for (let a = el; a; a = a.parentElement) k *= parseFloat(st(a).zoom) || 1;
    return fs * k;
  };
  const out = {};
  for (const q of roots) {
    const root = document.querySelector(q);
    if (!root || !vis(root)) continue;
    const lines = [];
    const walk = (el) => {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS' || el.classList.contains('sr-only') || el.classList.contains('ac-ghost') || !vis(el)) return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (own || !el.childElementCount) {
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (t) lines.push([t, Math.round(screenPx(el) * 10) / 10]);
        return;
      }
      for (const k of el.children) walk(k);
    };
    for (const k of root.children) walk(k);
    const b = io.box(root);
    out[q] = { box: b && b.width > 0 && b.height > 0 ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null, opacity: Math.round(eop(root) * 100) / 100, classes: String(root.className?.baseVal ?? root.className ?? ''), lines };
  }
  return out;
}

/** The stage a card is in, from the classes the presenter and the structure card put on it and its opacity. */
export function stageOf({ classes = '', opacity = 1 }, preparing = false) {
  if (preparing || /\b(pz-prep|ac-prep)\b/.test(classes)) return 'preparing';
  if (/\bpz-leave\b/.test(classes)) return 'leaving';
  if (/\bpz-enter\b/.test(classes) && opacity < 0.95) return 'entering';
  return opacity < 0.95 ? 'fading' : 'shown';
}

const NUM = /[−-]?\d[\d,]*(?:\.\d+)?(?:\s?(?:mmHg|cm\/s|mL\/min|mL|L\/min|mm|cm|kPa|%|x))?/g;

export function readCardsPart(ctx) {
  const { io, doc, pps } = ctx;
  if (!doc?.querySelector) return null;
  const minPx = ctx.env.minPx || WORDS_MIN_PX;
  const lines = readCardLines(io, ctx.env);
  const roots = Object.keys(lines);
  const prep = !!doc.querySelector('.pz.pz-prep');
  const cards = roots.map((sel) => {
    const c = lines[sel], title = sel === '.pz-text' ? (c.lines.find(([, p]) => p > 0)?.[0] ?? null) : null;
    const h = doc.querySelector(`${sel} .pz-h`);
    return { sel, kind: CARD_KINDS[sel] || sel, box: c.box, opacity: r2(c.opacity), stage: stageOf(c, prep && sel.startsWith('.pz')), title: h ? h.textContent.replace(/\s+/g, ' ').trim() : title, lines: c.lines.map(([t, p]) => [t, r1(p)]), nums: [...new Set(c.lines.flatMap(([t]) => t.match(NUM) || []))].slice(0, 40) };
  });
  const judged = readCardsJudged({ io, pps, minPx });
  const layout = cards.some((c) => c.box);
  return { layout, shown: judged.fit.shown, n: judged.fit.n, fonts: judged.fit.fonts, cards, fit: judged.fit, structure: judged.structure, sheet: judged.sheet, edges: layout ? judged.edges : null };
}

/**
 * What the fit rules and the edge rules judge, read the way the Check always read it: the edges as the cards stand (the Shuffle's card behind showing only its strip), then with the Shuffle
 * parked (its animations off, so each card is read at its own size and place, not scaled and clipped as the card behind: card-shuffle.js) the slide's cards and the open structure card.
 * One read for every runner (the Check, the Sweep, the Phone check, the packet and the sweeps), so a card is judged in one state, not in two. Only the leaves that fail are kept in `edges`
 * (compactEdges), so a report holds the evidence and not every line. io may carry `seen(key, el)`, which names the element of each problem (the Check's red outlines).
 * Returns { fit, structure, edges, sheet } (the phone sheet on show, or null; edges null when the page cannot be walked). Sync, and never in a frame: it runs on a tap or a sweep's step.
 */
export function readCardsJudged({ io, pps, minPx = WORDS_MIN_PX }) {
  let edges = null;
  try { edges = compactEdges(readEdges(io)); } catch { /* (a page the edge reader cannot walk has no edges to judge) */ }
  let sheet = null;
  try { sheet = readSheet(io); } catch { /* (no sheet to read on a page that cannot be walked) */ }
  let sh = null;
  try { sh = pps?.presenter?.shuffle?.() || null; } catch { sh = null; }
  sh?.park();
  try {
    const fit = readCards(io, { minPx });
    const el = pps?.card?.el;
    const structure = el && !el.hidden ? readStructureCard(io, el, { minPx }) : null;
    return { fit, structure, edges, sheet };
  } finally { sh?.resume(); }
}

registerReader({
  id: 'cards', owner: 'src/ui/presenter.js', order: 30, read: readCardsPart,
  text(c, ctx) {
    if (!c.cards.length) return ['Cards: none on the screen.'];
    const out = [];
    for (const k of c.cards) {
      const at = k.box ? ` ${k.box[2] - k.box[0]}×${k.box[3] - k.box[1]} at ${k.box[0]},${k.box[1]}` : (c.layout ? '' : ' (no layout here)');
      const sizes = k.lines.map((l) => l[1]).filter((p) => p > 0);
      const body = sizes.length ? `, ${k.lines.length} lines, text ${Math.min(...sizes)}${Math.max(...sizes) !== Math.min(...sizes) ? `–${Math.max(...sizes)}` : ''} px` : '';
      out.push(`${k.kind[0].toUpperCase()}${k.kind.slice(1)}${k.title ? ` "${k.title}"` : ''}:${at}, ${k.stage}${body}.`);
      if (ctx.detail === 'full') for (const [t, p] of k.lines) out.push(`    ${p} px  ${t}`);
    }
    return out;
  },
});

export { readWords, readBoxes, WORD_ROOTS, box4 };
