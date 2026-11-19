// The guideline path card (7 Nov 2026; Mohammad's pick: A, the whole chart, on a Mac or an iPad held sideways, and P2, a small map with one
// reading, on a phone and an iPad held upright; mocks at artifact QxXCFjXnD8dSki5UWgYWxG and G8n2ujW8wXL8sVxXpmygqx): tool { kind: 'path',
// of: 'first-visit' | 'bleed', patient?, title? } puts a Baveno VIII flowchart in the data card with the patient's own path lit.
//   of: 'first-visit'   Fig. 1, a patient with suspected cACLD at a first visit: lit from the model's liver stiffness, platelets and spleen
//                       stiffness (the tiles' own readings, so a slider or a button moves the path)
//   of: 'bleed'         Fig. 3, acute variceal bleeding: lit from the case's source of bleeding, Child–Pugh score, active bleeding, control and
//                       fitness for TIPS, and the model's HVPG
//   of: 'psvdscore' | 'recomp' | 'pvtgrid' | 'ladder'   the kinds that are not trees (path-cards.js): a score card, a checklist, a grid of two
//                       questions and a ladder of stages, lit from the slide's own answers (patient: { sg, hi, ac, cc } | { ca, ev, lf } |
//                       { r, c } | { s, rc }); the head (the pill, the answers as chips where they help), the rule and the foot are this card's
//   patient: { lsm, plt, bmi, ant, ssm }  or  { src: 'ov' | 'gv', cp, active, hvpg, ctrl, fit }
//                       the slide's own facts; the model's readings replace lsm, plt, ssm and hvpg where it has them (path-data.js patientFor).
//                       ANTICIPATE, the Child–Pugh score, active bleeding and control are not in the model: they are the case's.
// All of it is drawn on the GPU (Mohammad's rule, 7 Nov 2026): the card is ONE model, its connectors, dots and every word (the kicker, the
// patient's numbers, the nodes' words, the reading, the source) laid out here from Inter's own metrics (text-gl.js layoutParagraph, the widths
// then taken from the outlines drawn) and painted by the charts' shared context (svg-gl.js, looks in chart-looks/path.js). No page text and no
// layout read: the page holds the empty box, and the picture's label carries the summary for a screen reader.
// The whole chart (a column of at least COL_MIN px a leaf) is drawn where the card is that wide and the page is not the phone layout; a phone,
// an iPad held upright and any narrower card get a small map with the one reading under it. The trees reserve room for the widest patient and
// the longest reading, so the card never changes size with the case; a score card, grid or ladder is sized for the slide's own patient
// (it never changes while the card is up), so no room is kept for another patient's rows (tests/path-phone-height.test.js holds the height on a phone).

import { h, PHONE_MQ, SIDEWAYS_MQ } from './util.js';
import { viewSize } from './layout-snap.js';
import { TILE } from './table-marks.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { loadMetrics, layoutParagraph, textWidth } from './text-gl.js';
import { PATHS, mapWordsOf, knownOf, OUTCOMES, WORST, isLive, litOf, outcomeOf, readingFor, chipsOf, patientFor } from './path-data.js';
import { headKeys } from './card-tiles.js';
import { CARD_WIDE_MIN, cardCompact, isCardKind, layout as cardLayout, model as cardModel } from './path-cards.js';

/** The smallest a figure's words may be drawn on screen, in px (7c, play-test 16 Nov 2026: the Stages figure was drawn at 60% and its 11-12 px words came out at about 8 px, unreadable on a projector). Every ROLE is at least 12 px (the small phone grid's answer 11), and a figure is never fitted below FIT_MIN of its size, so its smallest word is at least FIG_TEXT_MIN. */
export const FIG_TEXT_MIN = 10, ROLE_MIN = 11, ROLE_SMALL = ['ctc', 'csc'], FIT_MIN = FIG_TEXT_MIN / ROLE_MIN;   // (ROLE_SMALL: the small layout's (a phone's) grid answers and their second line, 11 px, drawn whole on a phone, never fitted down)
export const COL_MIN = 104, NODE_MAX = 140, NODE_MAX_E3 = 176, E3_LEAVES = 3, ROOT_MAX = 330, GAP_Y = 20, MAP_UNIT = 66, GAP = 10;
const PILL_H = 22, PILL_PAD = 10, FIT_SHARE = 0.55;   // (the data card keeps under half the window's height for the picture, which with the card's own rows is all it has; never drawn below 60%: 72% left the Rule of five 513 px tall in a 482 px card on a 900 px Mac, 62% still 11 px over in one 481 px high)
export const TOKEN = { n: 'text', ok: 'ok', warn: 'caution', bad: 'danger', acc: 'accent' };
const svg = svgModel;
/** The type of each kind of words: weight, size and line height in px (the look that draws it is path.<role>). */
export const ROLE = {
  kick: { weight: 600, size: 12, lh: 16 }, chips: { weight: 500, size: 13, lh: 18 }, foot: { weight: 400, size: 12, lh: 16 },
  t: { weight: 400, size: 12, lh: 15 }, r: { weight: 600, size: 13, lh: 16 }, s: { weight: 400, size: 12, lh: 15 }, st: { weight: 500, size: 12, lh: 15 },
  rh: { weight: 600, size: 21, lh: 26 }, rs: { weight: 500, size: 12, lh: 26 }, rp: { weight: 400, size: 14, lh: 20 },
  // the score card, checklist, grid and ladder (path-cards.js): a row's name and definition, an answer and its points, a zone's name
  rn: { weight: 600, size: 13, lh: 17 }, rd: { weight: 400, size: 12, lh: 16 }, op: { weight: 600, size: 12, lh: 16 }, pt: { weight: 600, size: 12, lh: 16 }, zl: { weight: 500, size: 12, lh: 14 },
  // the grid's column and row names, a cell's words (the small layout's a little smaller) and its second line
  gh: { weight: 500, size: 12, lh: 16 }, gr: { weight: 600, size: 12, lh: 16 }, gs: { weight: 400, size: 12, lh: 14 }, ct: { weight: 600, size: 12, lh: 16 }, ctc: { weight: 600, size: 11, lh: 14 }, cs: { weight: 400, size: 12, lh: 14 }, csc: { weight: 400, size: 11, lh: 14 },
  // the ladder's stage label, "Patient is here", what the stage means, and the way back (its lead and its words)
  sn: { weight: 500, size: 12, lh: 14 }, yo: { weight: 600, size: 12, lh: 14 }, sw: { weight: 600, size: 12, lh: 16 }, bk: { weight: 400, size: 12, lh: 16 }, bb: { weight: 600, size: 12, lh: 16 },
};

/** The readings the card's header row already shows as tiles (card-tiles.js headKeys: the slide's tiles beside its instrument), so the card does not say them again. */
export const tiledOf = (s, phone = false) => new Set(headKeys(s, phone));

/** A reading as its tile prints it (the cut-offs are judged on what the tile shows). */
export function shownOf(k, v) { const T = TILE[k] || {}; return +(v * (T.x ?? 1)).toFixed(T.d ?? 1); }
/** The nodes of a tree in order, each with its depth. */
export function flat(tree) { const out = []; (function w(n, d) { out.push({ n, d }); (n.kids || []).forEach((k) => w(k, d + 1)); })(tree, 0); return out; }
/** Where each node stands in leaf slots (a leaf at the middle of its slot, a parent at the middle of its first and last child), and how many leaves. */
export function slots(tree) {
  const at = new Map(); let n = 0, maxd = 0;
  (function w(node, d) {
    maxd = Math.max(maxd, d);
    if (!node.kids) { at.set(node.id, { x: n + 0.5, d }); n++; return; }
    node.kids.forEach((k) => w(k, d + 1));
    at.set(node.id, { x: (at.get(node.kids[0].id).x + at.get(node.kids[node.kids.length - 1].id).x) / 2, d });
  })(tree, 0);
  return { at, n, maxd };
}
/** The connectors, parent to child. */
export function edgesOf(tree) { const out = []; (function w(n) { (n.kids || []).forEach((k) => { out.push({ from: n.id, to: k.id, tone: k.tone }); w(k); }); })(tree); return out; }
/** A connector as a path: down from the parent, along, down into the child, the corners rounded. */
export function ortho(x1, y1, x2, y2) {
  const ym = y1 + (y2 - y1) / 2;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1}V${y2}`;
  const r = Math.min(8, Math.abs(x2 - x1) / 2, (y2 - y1) / 2), d = x2 > x1 ? 1 : -1;
  return `M${x1},${y1}V${ym - r}Q${x1},${ym} ${x1 + d * r},${ym}H${x2 - d * r}Q${x2},${ym} ${x2},${ym + r}V${y2}`;
}
/** Whether a card of this width (px) has room for the whole chart: every leaf gets COL_MIN. */
export const wideFor = (tree, W) => W >= slots(tree).n * COL_MIN;
/** Whether a card this wide in this page draws the small map: a phone, or an iPad held upright (the phone layout: Mohammad, 7 Nov 2026), or a card too narrow for the leaves. */
export const mapFor = (tree, W, phone) => !!phone || !wideFor(tree, W);
/** The size of the small map's words in a card this wide: 12 px, larger where the card has room (an iPad held upright). */
export const mapType = (W) => (W >= 560 ? 14 : 12);
/** The whole chart's boxes at a width: id → { left, w, cx, d } (a node's width is its column's, the root's up to ROOT_MAX). */
export function treeBoxes(tree, W) {
  const { at, n } = slots(tree), slot = W / n;
  const nw = Math.min(n <= E3_LEAVES ? NODE_MAX_E3 : NODE_MAX, slot - 10);   // (a chart of up to three leaves fills the card with wider boxes: E3, Mohammad 7 Nov 2026)
  const out = new Map();
  for (const { n: node, d } of flat(tree)) {
    const w = node.id === tree.id ? Math.min(W - 8, ROOT_MAX) : nw;
    const left = Math.max(0, Math.min(W - w, at.get(node.id).x * slot - w / 2));
    out.set(node.id, { left, w, cx: left + w / 2, d });
  }
  return out;
}
/** The whole chart's rows, given each node's height at its width: id → top, the total height and the connectors' paths (to-id → d, y from oy). */
export function treePlace(tree, boxes, heights, oy = 0) {
  const rows = []; let maxd = 0;
  for (const { n, d } of flat(tree)) { rows[d] = Math.max(rows[d] || 0, heights.get(n.id) || 0); maxd = Math.max(maxd, d); }
  const topOf = []; let y = 0;
  for (let d = 0; d <= maxd; d++) { topOf[d] = y; y += (rows[d] || 0) + GAP_Y; }
  const tops = new Map(), paths = new Map();
  for (const { n, d } of flat(tree)) tops.set(n.id, topOf[d]);
  for (const e of edgesOf(tree)) {
    const a = boxes.get(e.from), b = boxes.get(e.to);
    paths.set(e.to, ortho(a.cx, oy + tops.get(e.from) + (heights.get(e.from) || 0) + 3, b.cx, oy + tops.get(e.to) - 3));
  }
  return { tops, paths, H: Math.max(0, y - GAP_Y) };
}
/** The small map at a width (k: the words' size over 12): each node's centre, the connectors' paths and the height. A node's words stand under its dot. */
export function mapPlace(tree, W, k = 1, oy = 0, wordsOf = () => null, tight = false) {
  const { at, n, maxd } = slots(tree), pad = W < 330 ? 34 : 38, nodes = new Map(), paths = new Map();
  const unit = tight && k === 1 ? 50 : maxd >= 3 && k === 1 ? 56 : MAP_UNIT;   // (tight: a card whose real room asks for it, 50: two lines of 12 px words, the elbow's 12 and a few px to spare)   // (a map four levels deep, at 12 px words, is a little tighter: the first-visit path stood 254 px tall on a phone)
  const X = (id) => (n > 1 ? pad + ((at.get(id).x - 0.5) / (n - 1)) * (W - 2 * pad) : W / 2), Y = (id) => oy + 12 + at.get(id).d * unit;
  for (const { n: node } of flat(tree)) nodes.set(node.id, { x: X(node.id), y: Y(node.id), words: wordsOf(node.id) });
  for (const e of edgesOf(tree)) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const y0 = a.y + (a.words ? (8 + a.words.length * 12.5) * k : 0);
    paths.set(e.to, `M${a.x},${y0}V${y0 + 12}H${b.x}V${b.y}`);
  }
  return { nodes, paths, H: 12 + maxd * unit + 44 * k };
}

/**
 * Paragraphs of runs ({ text, role }) laid out in a column: the lines broken as the browser would (Inter's metrics), each part's width then
 * taken from the outlines that are drawn, so a line is centred (or left) on what shows. → { items: [{ text, role, x, y }], h } with y the
 * baseline; gap: px after a paragraph (a number, or a function of its index). Needs loadMetrics() to have resolved.
 */
export function flow(paras, width, { align = 'left', gap = 0 } = {}) {
  const items = [], gapOf = typeof gap === 'function' ? gap : () => gap;
  let y = 0, last = 0;
  paras.forEach((runs, pi) => {
    if (!runs.length) return;
    const { lines } = layoutParagraph(runs.map((r) => ({ text: r.text, weight: ROLE[r.face].weight, size: ROLE[r.face].size })), width * 0.97);   // (3 % room: the lines are broken on the browser's measure and drawn from the outlines, a hair wider)
    for (const ln of lines) {
      const parts = ln.runs.map((p) => { const face = runs[p.run].face, R = ROLE[face]; return { text: p.text, face, w: textWidth(p.text, { weight: R.weight, size: R.size }) }; });
      const total = parts.reduce((s, p) => s + p.w, 0), lh = Math.max(...parts.map((p) => ROLE[p.face].lh));
      let x = align === 'center' ? Math.max(0, (width - total) / 2) : 0;
      for (const p of parts) {
        const R = ROLE[p.face];
        items.push({ text: p.text, face: p.face, x, y: y + (lh - R.size * 1.21) / 2 + R.size * 0.97 });
        x += p.w;
      }
      y += lh;
    }
    last = gapOf(pi);
    y += last;
  });
  return { items, h: items.length ? y - last : 0 };
}
/** A node's words as paragraphs: its condition, its verdict, its detail (no statement numbers: the card names its source once, in the pill). */
export function nodeParas(n, isRoot) {
  const lead = (isRoot || !n.r) ? [{ text: n.t, face: 'r' }] : [{ text: n.t, face: 't' }];
  const out = [lead];
  if (n.r) out.push([{ text: n.r, face: 'r' }]);
  if (n.s) out.push([{ text: n.s, face: 's' }]);
  return out;
}
const nodeGap = (paras, extra = 0) => (pi) => (paras.length > 1 && pi === 0 && paras[0][0].face === 't' ? 1 + extra : 2);
/**
 * The room each node's condition (its first paragraph, where a verdict follows it) needs added under it so that the verdicts of one row stand on one line: id → px, the row's tallest condition
 * less this node's own. leadH(paras, width) is a condition's height at its box's width. Pure: tests/tool-path-level.test.js runs it with a stand-in.
 */
export function treeLeadExtra(tree, boxes, parasOf, leadH) {
  const own = new Map(), rowMax = [];
  for (const { n, d } of flat(tree)) {
    const paras = parasOf(n.id);
    if (!(paras.length > 1 && paras[0][0].face === 't')) continue;
    const h = leadH(paras, boxes.get(n.id).w);
    own.set(n.id, { h, d }); rowMax[d] = Math.max(rowMax[d] || 0, h);
  }
  const out = new Map();
  for (const [id, { h, d }] of own) out.set(id, Math.max(0, rowMax[d] - h));
  return out;
}
/** The reading of one outcome as paragraphs: the verdict, then the why and the next step. */
export const readParas = (r) => [[{ text: r.head, face: 'rh' }], [{ text: `${r.why} ${r.next}`, face: 'rp' }]];

/** What path-cards.js lays a score card, grid or ladder out with: the card's own type, lines and shapes. */
export const CARD_HELPERS = { flow, ROLE, svg, textWidth, readParas, TOKEN };

/**
 * The small map's body (a phone, an iPad upright) at a width: the map and the room for the reading under it. A patient the slide fixes has one
 * reading, so the card is as tall as it; one the live model moves keeps room for the tallest reading of every outcome. → { k, map, readH, H }
 */
export function mapBodyOf(of, spec, patient, Wv, W = Wv, oy = 0, tight = false) {
  const k = mapType(W) / 12, worst = WORST[of], map = mapPlace(spec.tree, Wv, k, oy, (id) => mapWordsOf(of, id), tight);
  const own = isLive(of) ? null : outcomeOf(of, litOf(of, patient));
  const rd = (key, p) => flow(readParas(readingFor(of, key, p)), Wv, { gap: 4 }).h;
  const readH = own ? rd(own, patient) : Math.max(...OUTCOMES[of].flatMap((key) => [patient, worst].map((p) => rd(key, p))));
  return { k, map, readH, H: map.H + GAP + 12 + readH };
}

export function createPath() {
  const pic = h('div', { class: 'pzp-pic' });
  const gl = createSvgGL(pic, { host: 'path' });
  const el = h('div', { class: 'pz-path' }, pic);
  let t = null, slide = null, spec = null, of = 'first-visit', sl = null, card = false, W = 0, patient = null, lay = null, shownKey = '', ready = false, asked = false;

  function ctxFor() { try { const cx = chartCtx(pic); delete cx.svk; gl.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ } }
  function ask() { if (asked) return; asked = true; loadMetrics().then(() => { ready = true; if (spec && W > 0) layout(); }).catch(() => { asked = false; }); }

  /** Everything that does not change with the patient: the columns, the nodes' words and their heights, the rooms reserved, the total height. */
  function layout(sc = 1, small = false, tight = false) {
    const G = tight ? 6 : GAP, R1 = tight ? 8 : 12, R2 = tight ? 4 : 7;   // (tight: the rows closer, only where the card's real room asks for it, below)
    if (!spec || !(W > 0) || !ready) return;
    const Wv = W / sc;   // (the width the picture is laid out in: wider than the card when it is drawn smaller to fit the card's height)
    // (A phone held sideways gives its cards the wallet column (400 px) (card-shuffle.js SHUF.col: the wallet): a card that wide is not the phone layout's small map but the card or chart a Mac draws.)
    const phone = typeof matchMedia === 'function' && matchMedia(PHONE_MQ).matches && !(matchMedia(SIDEWAYS_MQ).matches && W >= CARD_WIDE_MIN);
    const compact = small || (card ? cardCompact(W, phone) : mapFor(spec.tree, W, phone));
    ctxFor();
    const L = { compact, y: {} }, worst = WORST[of], base = patient || worst;
    let y = 0;
    // (no head row of its own: the card's header row names the card and carries the tiles' readings; the source's pill stands in the foot row with the figure's number)
    // (the patient's numbers the header's tiles do not already show: room for the widest patient's, whatever this one has; a kind whose patient has none draws no row and leaves no gap)
    const tiled = tiledOf(slide, phone);
    const chipsH = (p) => (chipsOf(of, p, tiled).length ? flow([[{ text: chipsOf(of, p, tiled).join(' · '), face: 'chips' }]], Wv).h : 0);
    // (a card kind's patient is the slide's own and never changes while it is up: its row is this patient's alone, none when it has no chips)
    L.tiled = tiled;
    L.chipsH = card ? chipsH(base) : isLive(of) ? Math.max(chipsH(base), chipsH(worst)) : chipsH(base);
    L.y.chips = y; if (L.chipsH) y += L.chipsH + G;
    L.y.pic = y;
    if (card) {
      // (a score card, a grid or a ladder: path-cards.js lays out the tallest body any patient can have)
      L.card = cardLayout(spec.algo, Wv, compact, base, CARD_HELPERS, true);
      y += L.card.H + G;
    } else if (compact) {
      const B = mapBodyOf(of, spec, base, Wv, W, y, tight);
      L.k = B.k; L.map = B.map;
      y += L.map.H + G;
      L.y.rule1 = y; y += R1;
      L.y.read = y;
      L.readH = B.readH;
      y += L.readH + G;
    } else {
      const boxes = treeBoxes(spec.tree, Wv), heights = new Map(), fl = new Map();
      // (Results stand level: a condition that wraps to a second line in one node (LSM <15 and platelets ≥150) must not leave its verdict lower than its neighbours', Stiffness 9, Rule of five,
      // 19 Nov 2026, play-test. Each row's conditions take the room of the tallest, the rest of the node's words under it.)
      const lead = treeLeadExtra(spec.tree, boxes, (id) => nodeParas(sl.byId.get(id), id === spec.tree.id), (paras, w) => flow([paras[0]], w, { align: 'center' }).h);
      for (const [id, b] of boxes) {
        const paras = nodeParas(sl.byId.get(id), id === spec.tree.id), f = flow(paras, b.w, { align: 'center', gap: nodeGap(paras, lead.get(id) || 0) });
        fl.set(id, f); heights.set(id, f.h);
      }
      L.tree = { ...treePlace(spec.tree, boxes, heights, y), boxes, flows: fl };
      y += L.tree.H + G;
    }
    L.y.rule2 = y; y += R2;
    L.y.foot = y;
    L.foot = flow([[{ text: spec.foot, face: 'foot' }]], Wv);
    // (the foot row: the figure's number on the left, the source's pill on the right, centred on one line)
    L.pillW = Math.ceil(textWidth(spec.kick, { weight: ROLE.kick.weight, size: ROLE.kick.size })) + 2 * PILL_PAD;
    L.footH = Math.max(L.foot.h, PILL_H);
    y += L.footH;
    L.H = Math.ceil(y); L.Wv = Wv; L.sc = sc;
    // (a chart or card taller than the data card can hold is drawn smaller, all of it together, rather than cut off at the bottom: the card keeps
    // about half the window's height for it; the phone's small map has its own room)
    const given = parseFloat(pic.closest?.('.pz-data')?.style.getPropertyValue('--pz-room'));   // (the room the data card really has for the instrument, presenter-zoom.js toolRoom; none on a phone's sheet)
    const room = given > 0 ? given : Math.max(300, viewSize().h * FIT_SHARE);
    // (The small map is fitted the same way off a phone: on a 900 px Mac the Rule of five map stood 513 px tall in a 482 px card and the card cut its last 90 px.)
    if (sc === 1 && (!compact || !phone) && L.H > room) {
      // (B13, 16 Nov 2026: fitted down to 60% the Baveno bleeding chart's words came out at 5 to 6 px. A figure that needs less than FIT_MIN of its size to fit
      // is not shrunk past it: the whole chart gives way to the small map (12 px words and up), whose own height is fitted the same way.)
      // (Where the data card's real room says it, the rows stand closer first (6 px, not 10). A card that has a real room never draws its words under 12 px (the data card's floor, Mohammad's rule):
      // the picture is then drawn at full size, tight, and what the room cannot hold is the layout's to give (the sweep names it). A phone's sheet, with no room given, keeps its figure floor, FIT_MIN.)
      if (!tight && given > 0) return layout(1, small, true);
      const need = room / L.H, floor = given > 0 ? 1 : FIT_MIN;   // (no allowance: the wallet, 19 Nov 2026, took the Shuffle's 10 px with it; a card that has a real room never draws its words under 12 px)
      if (need >= floor) return layout(need, small, tight);
      if (!compact) return layout(1, true, tight);
      if (floor < 1) return layout(floor, small, tight);
    }
    L.Hr = Math.ceil(L.H * sc);
    lay = L;
    pic.style.height = `${L.Hr}px`;
    shownKey = '';
    paint();
  }

  const piece = (role, x, y, text, on, tone) => svg('text', { x, y, class: on ? 'lit' : '', 'data-look': `path.${role}`, 'data-p-tone': tone, 'text-anchor': 'start', 'font-size': ROLE[role].size }, text);

  function modelOf(Lit, out, said) {
    const kids = [], lit = [], dim = [], oy = lay.y.pic;
    const place = (items, ox, ot, on, tone) => { for (const i of items) kids.push(piece(i.face, ox + i.x, ot + i.y, i.text, on, tone)); };
    const rule = (y) => kids.push(svg('path', { d: `M0,${y + 0.5}H${lay.Wv}`, 'data-look': 'path.rule' }));
    // the head: the patient's numbers that no tile in the card's header row shows
    if (lay.chipsH) place(flow([[{ text: chipsOf(of, patient, lay.tiled).join(' · '), face: 'chips' }]], lay.Wv).items, 0, lay.y.chips, false, 'text');
    // the foot: the figure's number and, in a pill (as the pills of the app: a quiet fill, the words in the second ink), the source it comes from
    const foot = () => {
      const fy = lay.y.foot, px = lay.Wv - lay.pillW, py = fy + (lay.footH - PILL_H) / 2;
      place(lay.foot.items, 0, fy + (lay.footH - lay.foot.h) / 2, false, 'text');
      kids.push(svg('rect', { x: px, y: py, width: lay.pillW, height: PILL_H, rx: PILL_H / 2, 'data-look': 'path.pill' }));
      kids.push(piece('kick', px + PILL_PAD, py + (PILL_H - ROLE.kick.lh) / 2 + 12.5, spec.kick, false, 'text'));
    };
    if (card) {
      kids.push(...cardModel(spec.algo, lay.card, patient, CARD_HELPERS, oy));
      rule(lay.y.rule2);
      foot();
      return svg('svg', { width: W, height: lay.Hr, viewBox: `0 0 ${lay.Wv} ${lay.H}`, role: 'img', 'aria-label': `${spec.label}. ${said}` }, ...kids);
    }
    // the chart or the map: connectors first (grey under, the path over), then the nodes
    const paths = lay.compact ? lay.map.paths : lay.tree.paths;
    for (const e of sl.edges) {
      const on = Lit.has(e.to);
      (on ? lit : dim).push(svg('path', { d: paths.get(e.to), class: on ? 'lit' : '', 'data-look': 'path.edge', 'data-p-tone': TOKEN[e.tone] }));
    }
    kids.push(...dim, ...lit);
    if (lay.compact) {
      for (const { n } of sl.flat) {
        const p = lay.map.nodes.get(n.id), on = Lit.has(n.id), k = lay.k;
        kids.push(svg('circle', { cx: p.x, cy: p.y, r: on ? 5.5 : 4, class: on ? 'lit' : '', 'data-look': 'path.dot', 'data-p-tone': TOKEN[n.tone] }));
        if (p.words) p.words.forEach((ln, i) => kids.push(svg('text', { x: p.x, y: p.y + (19 + i * 12.5) * k, class: on ? 'lit' : '', 'data-look': 'path.word', 'data-p-tone': TOKEN[n.tone], 'text-anchor': 'middle', 'font-size': 12 * k }, ln)));
      }
      rule(lay.y.rule1);
      if (out) {
        const r = readingFor(of, out, patient);
        for (const i of flow(readParas(r), lay.Wv, { gap: 4 }).items) kids.push(piece(i.face, i.x, lay.y.read + i.y, i.text, true, TOKEN[r.tone]));
      }
    } else {
      for (const { n } of sl.flat) {
        const b = lay.tree.boxes.get(n.id), on = Lit.has(n.id) || n.id === spec.tree.id;
        place(lay.tree.flows.get(n.id).items, b.left, oy + lay.tree.tops.get(n.id), on, TOKEN[n.tone]);
      }
    }
    rule(lay.y.rule2);
    foot();
    return svg('svg', { width: W, height: lay.Hr, viewBox: `0 0 ${lay.Wv} ${lay.H}`, role: 'img', 'aria-label': `${spec.label}, the patient's path lit. ${said}` }, ...kids);
  }

  /** The path lit for the patient as it stands: the picture is drawn again only when what shows has changed. */
  function paint() {
    if (!spec || !patient || !lay) return;
    const Lit = litOf(of, patient), out = outcomeOf(of, Lit), r = out ? readingFor(of, out, patient) : null;
    const chips = chipsOf(of, patient, lay.tiled).join(' · ');
    // (the key holds all that shows: the answers lit, the width and layout, the chips, and the reading's words)
    const key = `${[...Lit].sort().join()}|${W}|${lay.compact}|${chips}|${(card || lay.compact) && r ? `${card ? `${r.head}|` : ''}${r.why}${r.next}` : ''}`;
    if (key === shownKey) return;
    shownKey = key;
    gl.show(modelOf(Lit, lay.compact ? out : null, `${chipsOf(of, patient).join(', ')}${r ? `. ${r.head}. ${r.why} ${r.next}` : ''}`.replace(/^\. /, '').trim()), false);   // (what a screen reader hears has every number, tiled or not)
  }

  function pin(fp) {
    if (!spec) return;
    patient = patientFor(t, fp, shownOf);
    if (lay) paint();
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    const w = Math.round(es[0]?.contentRect?.width || 0);
    if (w && w !== W && spec && el.isConnected) { W = w; layout(); } else if (w) W = w;
  }) : null;
  ro?.observe(pic);

  return {
    el,
    configure(tool, ctx) {
      t = tool || {};
      slide = ctx?.slide || null;
      of = knownOf(t.of);
      spec = PATHS[of];
      card = isCardKind(spec.kind);
      if (card) { sl = null; el.dataset.n = '0'; } else {
        const fl = flat(spec.tree);
        sl = { ...slots(spec.tree), flat: fl, edges: edgesOf(spec.tree), byId: new Map(fl.map(({ n }) => [n.id, n])) };
        el.dataset.n = String(sl.n);
      }
      el.dataset.of = of; el.dataset.kind = spec.kind;
      patient = patientFor(t, ctx?.fp, shownOf);
      lay = null; shownKey = '';
      ask();
      if (W > 0 && ready) layout();
    },
    pin,
    clear() {},
    refit() { shownKey = ''; if (W > 0) layout(); },
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
