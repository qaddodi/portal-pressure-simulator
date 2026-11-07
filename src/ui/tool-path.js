// The guideline path card (7 Nov 2026; Mohammad's pick: A, the whole chart, on a Mac or an iPad held sideways, and P2, a small map with one
// reading, on a phone and an iPad held upright; mocks at artifact QxXCFjXnD8dSki5UWgYWxG and G8n2ujW8wXL8sVxXpmygqx): tool { kind: 'path',
// of: 'first-visit' | 'bleed', patient?, title? } puts a Baveno VIII flowchart in the data card with the patient's own path lit.
//   of: 'first-visit'   Fig. 1, a patient with suspected cACLD at a first visit: lit from the model's liver stiffness, platelets and spleen
//                       stiffness (the tiles' own readings, so a slider or a button moves the path)
//   of: 'bleed'         Fig. 3, acute variceal bleeding: lit from the case's source of bleeding, Child–Pugh score, active bleeding, control and
//                       fitness for TIPS, and the model's HVPG
//   patient: { lsm, plt, bmi, ant, ssm }  or  { src: 'ov' | 'gv', cp, active, hvpg, ctrl, fit }
//                       the slide's own facts; the model's readings replace lsm, plt, ssm and hvpg where it has them (path-data.js patientFor).
//                       ANTICIPATE, the Child–Pugh score, active bleeding and control are not in the model: they are the case's.
// All of it is drawn on the GPU (Mohammad's rule, 7 Nov 2026): the card is ONE model, its connectors, dots and every word (the kicker, the
// patient's numbers, the nodes' words, the reading, the source) laid out here from Inter's own metrics (text-gl.js layoutParagraph, the widths
// then taken from the outlines drawn) and painted by the charts' shared context (svg-gl.js, looks in chart-looks/path.js). No page text and no
// layout read: the page holds the empty box, and the picture's label carries the summary for a screen reader.
// The whole chart (a column of at least COL_MIN px a leaf) is drawn where the card is that wide and the page is not the phone layout; a phone,
// an iPad held upright and any narrower card get a small map with the one reading under it. Both reserve room for the widest patient and
// the longest reading, so the card never changes size with the case.

import { h, PHONE_MQ } from './util.js';
import { TILE } from './table-marks.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { loadMetrics, layoutParagraph, textWidth } from './text-gl.js';
import { PATHS, MAP_WORDS, OUTCOMES, WORST, litOf, outcomeOf, readingFor, chipsOf, patientFor } from './path-data.js';

export const COL_MIN = 104, NODE_MAX = 140, ROOT_MAX = 330, GAP_Y = 26, MAP_UNIT = 66, GAP = 10;
const PILL_H = 22, PILL_PAD = 10;
const TOKEN = { n: 'text', ok: 'ok', warn: 'caution', bad: 'danger' };
const svg = svgModel;
/** The type of each kind of words: weight, size and line height in px (the look that draws it is path.<role>). */
export const ROLE = {
  kick: { weight: 600, size: 12, lh: 16 }, chips: { weight: 500, size: 13, lh: 18 }, foot: { weight: 400, size: 12, lh: 16 },
  t: { weight: 400, size: 12, lh: 16 }, r: { weight: 600, size: 13, lh: 16 }, s: { weight: 400, size: 12, lh: 16 }, st: { weight: 500, size: 12, lh: 16 },
  rh: { weight: 600, size: 21, lh: 26 }, rs: { weight: 500, size: 12, lh: 26 }, rp: { weight: 400, size: 14, lh: 20 },
};

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
  const { at, n } = slots(tree), slot = W / n, nw = Math.min(NODE_MAX, slot - 10), out = new Map();
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
export function mapPlace(tree, W, k = 1, oy = 0) {
  const { at, n, maxd } = slots(tree), pad = W < 330 ? 34 : 38, nodes = new Map(), paths = new Map();
  const X = (id) => (n > 1 ? pad + ((at.get(id).x - 0.5) / (n - 1)) * (W - 2 * pad) : W / 2), Y = (id) => oy + 12 + at.get(id).d * MAP_UNIT;
  for (const { n: node } of flat(tree)) nodes.set(node.id, { x: X(node.id), y: Y(node.id), words: MAP_WORDS[node.id] || null });
  for (const e of edgesOf(tree)) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const y0 = a.y + (a.words ? (8 + a.words.length * 12.5) * k : 0);
    paths.set(e.to, `M${a.x},${y0}V${y0 + 12}H${b.x}V${b.y}`);
  }
  return { nodes, paths, H: 12 + maxd * MAP_UNIT + 44 * k };
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
const nodeGap = (paras) => (pi) => (paras.length > 1 && pi === 0 && paras[0][0].face === 't' ? 1 : 2);
/** The reading of one outcome as paragraphs: the verdict, then the why and the next step. */
export const readParas = (r) => [[{ text: r.head, face: 'rh' }], [{ text: `${r.why} ${r.next}`, face: 'rp' }]];

export function createPath() {
  const pic = h('div', { class: 'pzp-pic' });
  const gl = createSvgGL(pic, { host: 'path' });
  const el = h('div', { class: 'pz-path' }, pic);
  let t = null, spec = null, of = 'first-visit', sl = null, W = 0, patient = null, lay = null, shownKey = '', ready = false, asked = false;

  function ctxFor() { try { const cx = chartCtx(pic); delete cx.svk; gl.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ } }
  function ask() { if (asked) return; asked = true; loadMetrics().then(() => { ready = true; if (spec && W > 0) layout(); }).catch(() => { asked = false; }); }

  /** Everything that does not change with the patient: the columns, the nodes' words and their heights, the rooms reserved, the total height. */
  function layout() {
    if (!spec || !(W > 0) || !ready) return;
    const compact = mapFor(spec.tree, W, typeof matchMedia === 'function' && matchMedia(PHONE_MQ).matches);
    ctxFor();
    const L = { compact, y: {} }, worst = WORST[of], base = patient || worst;
    let y = 0;
    L.y.kick = y; y += PILL_H + 6;
    // (the patient's numbers: room for the widest patient's, whatever this one has)
    const chipsH = (p) => flow([[{ text: chipsOf(of, p).join(' · '), face: 'chips' }]], W).h;
    L.chipsH = Math.max(chipsH(base), chipsH(worst), ROLE.chips.lh);
    L.y.chips = y; y += L.chipsH + GAP;
    L.y.pic = y;
    if (compact) {
      L.k = mapType(W) / 12;
      L.map = mapPlace(spec.tree, W, L.k, y);
      y += L.map.H + GAP;
      L.y.rule1 = y; y += 12;
      L.y.read = y;
      L.readH = Math.max(...OUTCOMES[of].flatMap((k) => [base, worst].map((p) => flow(readParas(readingFor(of, k, p)), W, { gap: 4 }).h)));
      y += L.readH + GAP;
    } else {
      const boxes = treeBoxes(spec.tree, W), heights = new Map(), fl = new Map();
      for (const [id, b] of boxes) {
        const paras = nodeParas(sl.byId.get(id), id === spec.tree.id), f = flow(paras, b.w, { align: 'center', gap: nodeGap(paras) });
        fl.set(id, f); heights.set(id, f.h);
      }
      L.tree = { ...treePlace(spec.tree, boxes, heights, y), boxes, flows: fl };
      y += L.tree.H + GAP;
    }
    L.y.rule2 = y; y += 7;
    L.y.foot = y;
    L.foot = flow([[{ text: spec.foot, face: 'foot' }]], W);
    y += L.foot.h;
    L.H = Math.ceil(y);
    lay = L;
    pic.style.height = `${L.H}px`;
    shownKey = '';
    paint();
  }

  const piece = (role, x, y, text, on, tone) => svg('text', { x, y, class: on ? 'lit' : '', 'data-look': `path.${role}`, 'data-p-tone': tone, 'text-anchor': 'start', 'font-size': ROLE[role].size }, text);

  function modelOf(Lit, out, said) {
    const kids = [], lit = [], dim = [], oy = lay.y.pic;
    const place = (items, ox, ot, on, tone) => { for (const i of items) kids.push(piece(i.face, ox + i.x, ot + i.y, i.text, on, tone)); };
    const rule = (y) => kids.push(svg('path', { d: `M0,${y + 0.5}H${W}`, 'data-look': 'path.rule' }));
    // the head: the algorithm's source and the patient's numbers
    // the source in a pill (as the pills of the app: a quiet fill, the words in the second ink)
    const pw = Math.ceil(textWidth(spec.kick, { weight: ROLE.kick.weight, size: ROLE.kick.size })) + 2 * PILL_PAD;
    kids.push(svg('rect', { x: 0, y: lay.y.kick, width: pw, height: PILL_H, rx: PILL_H / 2, 'data-look': 'path.pill' }));
    kids.push(piece('kick', PILL_PAD, lay.y.kick + (PILL_H - ROLE.kick.lh) / 2 + 12.5, spec.kick, false, 'text'));
    place(flow([[{ text: chipsOf(of, patient).join(' · '), face: 'chips' }]], W).items, 0, lay.y.chips, false, 'text');
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
        for (const i of flow(readParas(r), W, { gap: 4 }).items) kids.push(piece(i.face, i.x, lay.y.read + i.y, i.text, true, TOKEN[r.tone]));
      }
    } else {
      for (const { n } of sl.flat) {
        const b = lay.tree.boxes.get(n.id), on = Lit.has(n.id) || n.id === spec.tree.id;
        place(lay.tree.flows.get(n.id).items, b.left, oy + lay.tree.tops.get(n.id), on, TOKEN[n.tone]);
      }
    }
    rule(lay.y.rule2);
    place(lay.foot.items, 0, lay.y.foot, false, 'text');
    return svg('svg', { width: W, height: lay.H, viewBox: `0 0 ${W} ${lay.H}`, face: 'img', 'aria-label': `${spec.label}, the patient's path lit. ${said}` }, ...kids);
  }

  /** The path lit for the patient as it stands: the picture is drawn again only when what shows has changed. */
  function paint() {
    if (!spec || !patient || !lay) return;
    const Lit = litOf(of, patient), out = outcomeOf(of, Lit), r = out ? readingFor(of, out, patient) : null;
    const chips = chipsOf(of, patient).join(' · ');
    const key = `${[...Lit].sort().join()}|${W}|${lay.compact}|${chips}|${lay.compact && r ? `${r.why}${r.next}` : ''}`;
    if (key === shownKey) return;
    shownKey = key;
    gl.show(modelOf(Lit, lay.compact ? out : null, r ? `${chips}. ${r.head}. ${r.why} ${r.next}` : chips), false);
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
      of = t.of === 'bleed' ? 'bleed' : 'first-visit';
      spec = PATHS[of];
      const fl = flat(spec.tree);
      sl = { ...slots(spec.tree), flat: fl, edges: edgesOf(spec.tree), byId: new Map(fl.map(({ n }) => [n.id, n])) };
      el.dataset.n = String(sl.n); el.dataset.of = of;
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
