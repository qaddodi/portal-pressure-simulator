// The screen report's chart reader (plan: /mnt/project-files/card-gallery-plan/screen-report-recs.md, step 2b): what each chart on the screen holds, read from
// the charts' models (svg-gl.js) BEFORE the GPU draws them, with no pixel read.
//
// A chart's model is a hidden tree of plain elements (svgModel) that its builder writes and the picture draws from. This reader walks the same trees and asks the
// painter's own functions for what the painter would use: the look read for each piece (lookOfPiece: its fill, stroke, strength, size and anchor), a piece's
// words (wordsOf, a value that glides is held on the piece), its held geometry (geoOf), its transform (transformOf) and the place a piece the chart moves is
// drawn at now (moveAt). It works nothing out a second way: the one thing it adds is the role of each piece (chart-roles.js), from the look key the builder gave it.
//
// readCharts(root, io) → { charts: [chart] }, one chart for each drawing the page holds (a box of class svg-gl-box with a model in it). Numbers are rounded to
// 0.1 so two reads of the same state are equal. A chart:
//   { id, host, aria, viewBox: [x, y, w, h] | null, size: [w, h] | null, fit, axes, keys: {x, y} | null,
//     texts:  [{ role, look, text, x, y, anchor, size, op, fill, k? }],
//     lines:  [{ role, look, x1, y1, x2, y2, stroke, op }],
//     rects:  [{ role, look, x, y, w, h, fill, op, tone? }],
//     dots:   [{ role, look, x, y, r, fill, op, v? }],
//     legend: { entries: [words], where: 'html' | 'chart' | 'none', zones: bool } }   (zones: the legend is a zones' key, the words each zone is named by)
// Positions are the drawing's own units (its viewBox's, a CSS pixel for the charts that draw at the element's own pixels), with every group's transform and
// every glide's present place applied. Only pieces the picture would draw are listed (shown, a strength over 0.2%).
//
// Marks a chart builder may put on its pieces for the rules to use (all optional; nothing reads them but this file and the rules):
//   data-fit="on" on the drawing: its axes are cut to the points plotted (chart-rules.js axes-fit-data)
//   data-xk / data-yk on the drawing: the model keys of its two axes
//   data-k on a text: it prints the model's number for that key (number-rules.js)
//   data-v on a dot: "key:number,key:number", the readings it was placed from (number-rules.js)
// io = { box(el) → { width, height } | null, style(el) → { display } } (layout-snap.js reads, or plain DOM reads in a headless layout run); without it a chart has no
// size and a legend is told shown unless it is [hidden] or its own style says display: none.
import { roleOf } from './chart-roles.js';

// The painter's own functions (svg-gl.js: lookOfPiece, wordsOf, geoOf, transformOf, moveAt), handed in with setPainter by screen/chart-deps.js: svg-gl.js reads the
// page's globals as it loads, so this file (and the report builder that registers it) stays loadable in a node test with no page. Until it is set, readCharts says nothing.
let P = null;
/** Hands the reader the painter's functions. */
export const setPainter = (painter) => { P = painter; };
const lookOfPiece = (el) => P.lookOfPiece(el), wordsOf = (el) => P.wordsOf(el), geoOf = (el, k) => P.geoOf(el, k), transformOf = (s) => P.transformOf(s), moveAt = (el) => P.moveAt(el);

/** Where a legend (a key under or beside a plot) is written in the page: the first of these in a chart's card. */
export const LEGEND_SELECTOR = '.pze-key, .pft-key, .pzc-key, .pzk-key, .sv-legend, .legend-inline, .keys, .keys-g, .ir-keys, .fr-key, .pze-ckey';
/** The legends that name a chart's zones (the planes' keys); the others key a hatch, a line or a swatch and say nothing about zone words. */
export const ZONE_KEY_SELECTOR = '.pze-key, .pze-ckey';
const CARD_ROOT = '.pz-data, .pz-text, .pz-panel, .action-card, .dock-pane, #dock, .pz-vis, .pz-visual';

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ID = [1, 0, 0, 1, 0, 0];
const pt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

/** The words of a model's text piece as the picture draws them: its own held words, else its tspans' (one per line, kept apart by a space), else its text. */
export function textOfPiece(el) {
  if (el._t != null) return collapse(el._t);
  const spans = [...el.children].filter((c) => c.localName === 'tspan');
  return collapse(spans.length ? spans.map((c) => wordsOf(c)).join(' ') : wordsOf(el));
}

/** A piece the picture would draw: it has a look, is not display none or hidden, and its strength (its own times its groups') is more than 0.2%.
 *  Returns the strength, or 0 for a piece not drawn. */
function strengthOf(el, root) {
  let a = 1;
  for (let n = el; n && n !== root.parentNode; n = n.parentElement) {
    const L = lookOfPiece(n);
    if (!L || L.none || n._hide || n.style?.display === 'none') return 0;
    if (L.hidden && n.style?.visibility !== 'visible') return 0;
    if (n.style?.visibility === 'hidden') return 0;
    const so = n.style?.opacity;
    a *= so !== '' && so != null ? num(so, 1) : L.op;
    if (a <= 0.002) return 0;
  }
  return a;
}

/** The matrix that takes a piece's own units to the drawing's: each group's transform on the way down, and the inline translate a glide is at now. */
function matrixOf(el, root) {
  const chain = [];
  for (let n = el; n && n !== root; n = n.parentElement) chain.push(n);
  let m = ID;
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i], t = n._mat || transformOf(n.getAttribute?.('transform'));
    if (t) m = mul(m, t);
    if (n.style?.transform) { const mv = moveAt(n); if (mv) m = mul(m, [1, 0, 0, 1, mv[0], mv[1]]); }
  }
  return m;
}

const g = (el, k) => num(geoOf(el, k));
const key = (el) => el.getAttribute('data-look') || '';
const tone = (el) => el.getAttribute('data-tone') || null;

/** The key of a legend entry's words: the entry's name, lower case, without its note ("Both raised"). Entries are the text of each list item (or each child). */
function legendEntries(el) {
  const items = el.querySelectorAll('li');
  const rows = items.length ? [...items] : [...el.children];
  const out = [];
  for (const r of rows) {
    // (An entry's name is the first piece of words in it, its note the rest: the key's own markup puts the swatch first, then the name, then the note.)
    const parts = [...r.children].filter((c) => c.localName !== 'i' && collapse(c.textContent)).map((c) => collapse(c.textContent));
    const own = collapse([...r.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' '));
    for (const p of parts.length ? parts : own ? [own] : [collapse(r.textContent)]) if (p) out.push(p);
  }
  return out;
}

function shown(el, io) {
  for (let n = el; n && n.nodeType === 1 && n !== n.ownerDocument?.documentElement; n = n.parentElement) {
    if (n.hidden) return false;
    const d = io?.style ? io.style(n)?.display : n.style?.display;
    if (d === 'none') return false;
  }
  return true;
}

/** The card a picture box stands in (the presenter's cards, a structure card, the Tests dock), or null: a picture outside every card is not a card's chart. */
const cardOf = (box) => { for (let n = box.parentElement; n; n = n.parentElement) if (n.matches?.(CARD_ROOT)) return n; return null; };

/**
 * The legend of a chart: the key nearest to it, written in the page (html: the first ancestor of the box, up to its card, that holds a key the box is not in), else
 * one drawn inside it (chart), else none. The search stops at the box's card: a key elsewhere on the page is no legend of this chart (a bug packet of 19 Nov 2026
 * listed every picture on the screen with the SAAG quadrant's "Protein" key, which the search had found six levels up).
 */
function legendOf(box, card, texts, io) {
  for (let n = box.parentElement; n; n = n.parentElement) {
    const keys = [...n.querySelectorAll(LEGEND_SELECTOR)].filter((k) => !k.contains(box) && !box.contains(k) && shown(k, io));
    const entries = keys.flatMap(legendEntries);
    if (entries.length) return { entries, where: 'html', zones: keys.some((k) => k.matches(ZONE_KEY_SELECTOR)) };
    if (n === card) break;
  }
  const own = texts.filter((t) => t.role === 'legend').map((t) => t.text);
  return own.length ? { entries: own, where: 'chart', zones: false } : { entries: [], where: 'none', zones: false };
}

/** One drawing: its model root `svg` standing in `box` (the chart's picture box). */
export function readChart(svg, box, io = null, index = 0) {
  const texts = [], lines = [], rects = [], dots = [];
  const vb = (geoOf(svg, 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const walk = (el) => {
    const tag = el.localName;
    if (tag === 'defs' || tag === 'clippath' || tag === 'x-title' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'mask' || tag === 'pattern') return;
    const op = strengthOf(el, svg);
    if (op <= 0.002) return;
    const L = lookOfPiece(el), k = key(el), role = roleOf(k), m = matrixOf(el, svg);
    if (tag === 'text') {
      const text = textOfPiece(el);
      if (!text) return;
      const [x, y] = pt(m, g(el, 'x'), g(el, 'y'));
      const t = { role, look: k, text, x: r1(x), y: r1(y), anchor: L.anchor || 'start', size: r1(L.size * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))), op: r1(op * 10) / 10, fill: L.fill };
      if (el.hasAttribute('data-k')) t.k = el.getAttribute('data-k');
      texts.push(t);
      return;
    }
    if (tag === 'line') {
      const [x1, y1] = pt(m, g(el, 'x1'), g(el, 'y1')), [x2, y2] = pt(m, g(el, 'x2'), g(el, 'y2'));
      lines.push({ role, look: k, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), stroke: L.stroke, op: r1(op * 10) / 10 });
      return;
    }
    if (tag === 'rect') {
      const [x, y] = pt(m, g(el, 'x'), g(el, 'y')), w = g(el, 'width') * Math.abs(m[0]), h = g(el, 'height') * Math.abs(m[3]);
      const r = { role, look: k, x: r1(x), y: r1(y), w: r1(w), h: r1(h), fill: L.fill, op: r1(op * 10) / 10 };
      if (tone(el)) r.tone = tone(el);
      rects.push(r);
      return;
    }
    if (tag === 'circle') {
      const [x, y] = pt(m, g(el, 'cx'), g(el, 'cy'));
      const d = { role, look: k, x: r1(x), y: r1(y), r: r1(g(el, 'r') * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))), fill: L.fill, op: r1(op * 10) / 10 };
      // (A dot may sit in a group that carries the readings it was placed from: the case's ring.)
      if (role === 'case' || role === 'point') for (let n = el; n && n !== svg.parentNode; n = n.parentElement) if (n.hasAttribute?.('data-v')) { d.v = n.getAttribute('data-v'); break; }   // (not its halo: one reading, one dot)
      dots.push(d);
      return;
    }
    for (const c of el.children) walk(c);
  };
  for (const c of svg.children) walk(c);
  const keys = svg.hasAttribute('data-xk') || svg.hasAttribute('data-yk') ? { x: svg.getAttribute('data-xk'), y: svg.getAttribute('data-yk') } : null;
  const b = box && io?.box ? io.box(box) : null;
  const host = box?._svgGL?.local?.host || (box?.getAttribute?.('class') || '').split(' ')[0] || '';
  return {
    id: `${host || 'chart'}#${index}`, host,
    aria: box?.getAttribute?.('aria-label') || svg.getAttribute('aria-label') || box?.querySelector?.('canvas')?.getAttribute('aria-label') || box?.parentElement?.getAttribute?.('aria-label') || '',
    viewBox: vb.length === 4 && vb.every(Number.isFinite) ? vb : null, size: b && b.width > 0 ? [r1(b.width), r1(b.height)] : null,
    fit: svg.getAttribute('data-fit') === 'on', axes: svg.getAttribute('data-axes') === 'on', keys,
    texts, lines, rects, dots, legend: box ? legendOf(box, cardOf(box), texts, io) : { entries: [], where: 'none', zones: false },
  };
}

/** Every chart on the page (or under `root`): one for each drawing in each picture box. */
export function readCharts(root = document, io = null) {
  const charts = [];
  if (!P) return { charts };
  const counts = new Map();
  for (const box of root.querySelectorAll('.svg-gl-box')) {
    // (Only a card's chart: not a readout's GPU words (still), a picture that rides the figure (callout glass, the lobule's leaders: follows), nor one outside every card.)
    const g = box._svgGL;
    if (g?.still || g?.follows || !cardOf(box)) continue;
    for (const svg of box.children) {
      if (!svg.hasAttribute?.('data-svg-model') || !svg.firstElementChild) continue;
      const c = readChart(svg, box, io, 0);
      const n = counts.get(c.id) || 0; counts.set(c.id, n + 1);
      c.id = `${c.host || 'chart'}#${n}`;
      charts.push(c);
    }
  }
  return { charts };
}
