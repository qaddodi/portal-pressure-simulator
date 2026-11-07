// The guideline path card (7 Nov 2026; Mohammad's pick: A, the whole chart, on a Mac or an iPad held sideways, and P2, a small map with one
// reading, on a phone; mocks at artifact QxXCFjXnD8dSki5UWgYWxG and G8n2ujW8wXL8sVxXpmygqx): tool { kind: 'path', of: 'first-visit' | 'bleed',
// patient?, title? } puts a Baveno VIII flowchart in the data card with the patient's own path lit.
//   of: 'first-visit'   Fig. 1, a patient with suspected cACLD at a first visit: lit from the model's liver stiffness, platelets and spleen
//                       stiffness (the tiles' own readings, so a slider or a button moves the path)
//   of: 'bleed'         Fig. 3, acute variceal bleeding: lit from the case's source of bleeding, Child–Pugh score, active bleeding, control and
//                       fitness for TIPS, and the model's HVPG
//   patient: { lsm, plt, bmi, ant, ssm }  or  { src: 'ov' | 'gv', cp, active, hvpg, ctrl, fit }
//                       the slide's own facts; the model's readings replace lsm, plt, ssm and hvpg where it has them (path-data.js patientFor).
//                       ANTICIPATE, the Child–Pugh score, active bleeding and control are not in the model: they are the case's.
// The whole chart (the card as wide as the leaves need, a column of at least COL_MIN px each) is page words on nodes placed by this file, the
// connectors a model drawn on the GPU (chart-looks/path.js); a phone, an iPad held upright (Mohammad, 7 Nov 2026: "similar to iPhone") and any
// card narrower than the leaves need draw a small map, all on the GPU, with the one reading under it. Both hold every state's room (the chart's nodes are the same for every patient; the readings are stacked in one cell),
// so the card never changes size with the patient.

import { h, PHONE_MQ } from './util.js';
import { TILE } from './table-marks.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { readMetric } from './layout-snap.js';
import { PATHS, MAP_WORDS, OUTCOMES, litOf, outcomeOf, readingFor, chipsOf, patientFor } from './path-data.js';

export const COL_MIN = 104, NODE_MAX = 140, ROOT_MAX = 330, GAP_Y = 26, MAP_UNIT = 66;
const TOKEN = { n: 'text', ok: 'ok', warn: 'caution', bad: 'danger' };
const CSS_TONE = { n: 'var(--text)', ok: 'var(--ok)', warn: 'var(--caution)', bad: 'var(--danger)' };
const svg = svgModel;

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
/** Whether a card of this width (px) draws the whole chart: every leaf gets COL_MIN. */
export const wideFor = (tree, W) => W >= slots(tree).n * COL_MIN;
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
/** The whole chart's rows, given each node's height at its width: id → top, the total height and the connectors' paths (to-id → d). */
export function treePlace(tree, boxes, heights) {
  const rows = []; let maxd = 0;
  for (const { n, d } of flat(tree)) { rows[d] = Math.max(rows[d] || 0, heights.get(n.id) || 0); maxd = Math.max(maxd, d); }
  const topOf = []; let y = 0;
  for (let d = 0; d <= maxd; d++) { topOf[d] = y; y += (rows[d] || 0) + GAP_Y; }
  const tops = new Map(), paths = new Map();
  for (const { n, d } of flat(tree)) tops.set(n.id, topOf[d]);
  for (const e of edgesOf(tree)) {
    const a = boxes.get(e.from), b = boxes.get(e.to);
    paths.set(e.to, ortho(a.cx, tops.get(e.from) + (heights.get(e.from) || 0) + 3, b.cx, tops.get(e.to) - 3));
  }
  return { tops, paths, H: Math.max(0, y - GAP_Y) };
}
/** Whether a card this wide in this page draws the small map: a phone, or an iPad held upright (the phone layout: Mohammad, 7 Nov 2026), or a card too narrow for the leaves. */
export const mapFor = (tree, W, phone) => !!phone || !wideFor(tree, W);
/** The size of the small map's words in a card this wide: 12 px, larger where the card has room (an iPad held upright). */
export const mapType = (W) => (W >= 560 ? 14 : 12);
/** The small map at a width: each node's centre, the connectors' paths and the height. A node's words stand under its dot. */
export function mapPlace(tree, W, k = 1) {
  const { at, n, maxd } = slots(tree), pad = W < 330 ? 34 : 38, nodes = new Map(), paths = new Map();
  const X = (id) => (n > 1 ? pad + ((at.get(id).x - 0.5) / (n - 1)) * (W - 2 * pad) : W / 2), Y = (id) => 12 + at.get(id).d * MAP_UNIT;
  for (const { n: node } of flat(tree)) nodes.set(node.id, { x: X(node.id), y: Y(node.id), words: MAP_WORDS[node.id] || null });
  for (const e of edgesOf(tree)) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const y0 = a.y + (a.words ? (8 + a.words.length * 12.5) * k : 0);
    paths.set(e.to, `M${a.x},${y0}V${y0 + 12}H${b.x}V${b.y}`);
  }
  return { nodes, paths, H: 12 + maxd * MAP_UNIT + 44 * k };
}

export function createPath() {
  const kick = h('p', { class: 'pzp-kick' }), chipsEl = h('p', { class: 'pzp-chips' });
  const pic = h('div', { class: 'pzp-pic' });
  const gl = createSvgGL(pic, { host: 'path' });
  const reads = h('div', { class: 'pzp-reads' });
  const sr = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const foot = h('p', { class: 'pzp-foot' });
  const el = h('div', { class: 'pz-path' }, h('div', { class: 'pzp-head' }, kick, chipsEl), pic, reads, sr, foot);
  let t = null, spec = null, of = 'first-visit', sl = null, W = 0, compact = false, patient = null, geo = null, shownKey = '', readsKey = '';
  const nodeEls = new Map(), readEls = new Map();

  function ctxFor() { try { const cx = chartCtx(pic); delete cx.svk; gl.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ } }

  // The nodes' words: a condition, its verdict and the statement's number, and a line of detail. Made once for the slide.
  function nodeEl(n) {
    const e = h('div', { class: `pzp-n${n.r ? '' : ' nor'}${n.act ? ' act' : ''}${n.id === spec.tree.id ? ' root' : ''}`, 'data-id': n.id, style: { '--tone': CSS_TONE[n.tone] } },
      h('span', { class: 'pzp-t' }, n.t, n.r ? null : (n.stmt ? h('span', { class: 'pzp-st' }, n.stmt) : null)),
      n.r ? h('span', { class: 'pzp-r' }, n.r, n.stmt ? h('span', { class: 'pzp-st' }, n.stmt) : null) : null,
      n.s ? h('span', { class: 'pzp-s' }, n.s) : null);
    return e;
  }
  function build() {
    for (const e of nodeEls.values()) e.remove();
    nodeEls.clear();
    for (const { n } of sl.flat) { const e = nodeEl(n); nodeEls.set(n.id, e); pic.append(e); }
    reads.replaceChildren(); readEls.clear();
    for (const k of OUTCOMES[of]) {
      const head = h('span', { class: 'pzp-rh' }), st = h('span', { class: 'pzp-rs' }), p = h('p', { class: 'pzp-rp' });
      const e = h('div', { class: 'pzp-rd', 'data-k': k }, h('p', { class: 'pzp-rt' }, head, st), p);
      readEls.set(k, { e, head, st, p }); reads.append(e);
    }
    readsKey = ''; shownKey = '';
  }

  function layout() {
    if (!spec || !(W > 0)) return;
    compact = mapFor(spec.tree, W, typeof matchMedia === 'function' && matchMedia(PHONE_MQ).matches);
    el.classList.toggle('compact', compact);
    ctxFor();
    if (compact) {
      geo = { ...mapPlace(spec.tree, W, mapType(W) / 12), kind: 'map', k: mapType(W) / 12 };
      pic.style.height = `${Math.ceil(geo.H)}px`;
    } else {
      const boxes = treeBoxes(spec.tree, W);
      for (const [id, b] of boxes) { const e = nodeEls.get(id); e.style.width = `${b.w}px`; e.style.left = `${b.left}px`; }
      const heights = new Map();
      for (const id of boxes.keys()) heights.set(id, readMetric(nodeEls.get(id), 'offsetHeight'));
      const pl = treePlace(spec.tree, boxes, heights);
      for (const [id, y] of pl.tops) nodeEls.get(id).style.top = `${y}px`;
      geo = { ...pl, boxes, kind: 'tree' };
      pic.style.height = `${Math.ceil(pl.H)}px`;
    }
    shownKey = '';
    paint();
  }

  function modelOf(L) {
    const lit = [], dim = [];
    const hh = Math.ceil(geo.H);
    for (const e of sl.edges) {
      const d = geo.paths.get(e.to), on = L.has(e.to);
      (on ? lit : dim).push(svg('path', { d, class: on ? 'lit' : '', 'data-look': 'path.edge', 'data-p-tone': TOKEN[e.tone] }));
    }
    const kids = [...dim, ...lit];
    if (geo.kind === 'map') {
      for (const { n } of sl.flat) {
        const p = geo.nodes.get(n.id), on = L.has(n.id);
        kids.push(svg('circle', { cx: p.x, cy: p.y, r: on ? 5.5 : 4, class: on ? 'lit' : '', 'data-look': 'path.dot', 'data-p-tone': TOKEN[n.tone] }));
        if (p.words) p.words.forEach((ln, i) => kids.push(svg('text', { x: p.x, y: p.y + (19 + i * 12.5) * geo.k, class: on ? 'lit' : '', 'data-look': 'path.word', 'data-p-tone': TOKEN[n.tone], 'text-anchor': 'middle', 'font-size': 12 * geo.k }, ln)));
      }
    }
    return svg('svg', { width: W, height: hh, viewBox: `0 0 ${W} ${hh}`, role: 'img', 'aria-label': `${spec.label}, the patient's path lit` }, ...kids);
  }

  /** The path lit for the patient as it stands: the nodes' state, the picture and the reading, each written only when it changed. */
  function paint() {
    if (!spec || !patient) return;
    const L = litOf(of, patient), key = `${[...L].sort().join()}|${W}|${compact}`;
    const chips = chipsOf(of, patient).join(' · ');
    if (chipsEl.textContent !== chips) chipsEl.textContent = chips;
    const out = outcomeOf(of, L);
    const rk = OUTCOMES[of].map((k) => readingFor(of, k, patient)).map((r) => `${r.head}|${r.why}|${r.next}`).join('¦');
    if (rk !== readsKey) {
      readsKey = rk;
      for (const k of OUTCOMES[of]) {
        const r = readingFor(of, k, patient), x = readEls.get(k);
        x.head.textContent = r.head; x.st.textContent = r.stmt; x.p.textContent = `${r.why} ${r.next}`; x.e.style.setProperty('--tone', CSS_TONE[r.tone]);
      }
    }
    for (const [k, x] of readEls) x.e.classList.toggle('on', k === out);
    if (key === shownKey) return;
    shownKey = key;
    for (const [id, e] of nodeEls) e.classList.toggle('lit', L.has(id) || id === spec.tree.id);
    if (geo) gl.show(modelOf(L), false);
    const r = out ? readingFor(of, out, patient) : null;
    sr.textContent = r ? `${r.head}. ${r.why} ${r.next}` : '';
  }

  function pin(fp) {
    if (!spec) return;
    patient = patientFor(t, fp, shownOf);
    paint();
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
      sl = { ...slots(spec.tree), flat: flat(spec.tree), edges: edgesOf(spec.tree) };
      el.dataset.n = String(sl.n); el.dataset.of = of;
      kick.textContent = spec.kick; foot.textContent = spec.foot;
      patient = patientFor(t, ctx?.fp, shownOf);
      build();
      if (W > 0) layout(); else paint();
    },
    pin,
    clear() {},
    refit() { shownKey = ''; if (W > 0) layout(); },
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
