// The treatment menu for the patient on screen (new-features recs C2; Mohammad, 8 Nov 2026: "build item 4").
//
//   tool: { kind: 'menu' }
//
// One chart: every treatment this patient could get, each worked out on the slide's own state by the presenter's calculation worker (ctx.run,
// one step a treatment, each from the slide's state), drawn as a dot at the PPG it reaches (up) against the liver's flow it costs (across). The
// encephalopathy summary's sentence, "Every shunt trades a lower gradient for less sinusoidal flow", becomes a picture: the drugs sit near the
// patient's own ring, the shunts run down and to the left, and the Meso-Rex is the one dot that goes down and to the right, where the liver
// gains. A dot's size is the share of the portal blood that bypasses the liver; its colour is the PPG's own rating (green under 6, amber to 12,
// red from 12: pressure-cuts.js). The PPG 12 line and the liver's 55% line are the app's cut-offs.
//
// What is offered follows the patient (menuOptions): a treatment already in place is the ring, not a dot; a TIPS is not offered through a clotted
// trunk; the Meso-Rex only where the slides' own rule allows it (proc-anim.js GRAFTS.rex.can); recanalization only for a clotted trunk. The
// surgical shunts are the same parameters the talks and the free sim set (surgical-shunts.js), so the model is one.
//
// Drawn on the GPU as the app's other charts are (svg-gl.js, host 'curve': the curve's own looks, chart-looks/time.js), at the card's size. The
// numbers are worked out once per deck, when its states are in, and kept; until they are there the frame shows and the dots fade in over it.
//
// Optional: title (the card's heading), rows (a list of option ids, to offer only some: 'propranolol', 'carvedilol', 'pse', 'warren', 'tips8',
// 'tips10', 'mesocaval', 'portocaval', 'rex', 'recanalization').

import { RATE } from './table-marks.js';
import { SEV_OF_RATE } from '../engine/pressure-cuts.js';
import { fittedType } from './chart-ctx.js';
import { plotPanel } from './plot-look.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { readMetric } from './layout-snap.js';
import { leftScale, xDomain, xAxisRow, xAxisName, fmtTick, placeDotNames, placeWord, namesCrowded, cutsOf } from './tool-curve.js';
import { SURGICAL_BY_ID } from './surgical-shunts.js';

const sv = svgModel;
const CV_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn, as the curve's)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cw = (t, f, b) => String(t).length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)
const occluded = (p, id) => 1 - (1 - (p.stenosis?.[id] || 0)) * (1 - (p.thrombus?.[id] || 0));

// One record for each treatment: its id, its names (the full one, a shorter for a tight spot), the change it makes to the patient's settings (a
// patch the worker merges), whether it is already in place (then it is the ring, not a dot) and whether it can be offered to this patient.
const surgical = (id, key, name, short) => ({ id, name, short, patch: SURGICAL_BY_ID[key].apply({}), has: (p) => SURGICAL_BY_ID[key].on(p), can: (p) => !SURGICAL_BY_ID[key].blocked(p) });
const NO_TIPS = (p) => !p.tips?.on && occluded(p, 'PV_TRUNK') < 0.8 && !p.dips?.on;
export const MENU = [
  { id: 'propranolol', name: 'Propranolol', patch: { drugs: { propranolol: true, carvedilol: false } }, has: (p) => !!p.drugs?.propranolol, can: () => true },
  { id: 'carvedilol', name: 'Carvedilol', patch: { drugs: { carvedilol: true, propranolol: false } }, has: (p) => !!p.drugs?.carvedilol, can: () => true },
  { id: 'pse', name: 'Splenic embolization', short: 'Embolization', patch: { splenicRx: 1 }, has: (p) => (p.splenicRx || 0) >= 1, can: (p) => !p.splenicRx },
  { id: 'recanalization', name: 'Recanalization', short: 'Recanalize', patch: { thrombus: { PV_TRUNK: 0 } }, has: () => false, can: (p) => (p.thrombus?.PV_TRUNK || 0) >= 0.5 },
  { id: 'tips8', name: 'TIPS, 8 mm', patch: { tips: { on: true, d: 8 } }, has: () => false, can: NO_TIPS },
  { id: 'tips10', name: 'TIPS, 10 mm', patch: { tips: { on: true, d: 10 } }, has: () => false, can: NO_TIPS },
  { ...surgical('warren', 'warren', 'Warren shunt'), can: (p) => !SURGICAL_BY_ID.warren.on(p) },
  { ...surgical('mesocaval', 'mesocaval', 'Mesocaval shunt', 'Mesocaval') },
  { ...surgical('portocaval', 'pc-es', 'Portocaval shunt', 'Portocaval') },
  { ...surgical('rex', 'rex', 'Meso-Rex bypass', 'Meso-Rex') },
];
const BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m]));

/** The treatments offered to a patient (their settings): the menu's records in its order, less those already in place or not suited to him; `rows`
 *  (the slide's list of ids) offers only those. */
export function menuOptions(params, rows = null) {
  const p = params || {}, want = Array.isArray(rows) ? rows.filter((id) => BY_ID[id]) : null;
  return MENU.filter((m) => (!want || want.includes(m.id)) && !m.has(p) && m.can(p));
}
/** The ring's name: the patient with nothing done to him, or as he stands now when something already is. */
export const baseName = (params) => (MENU.some((m) => m.has(params || {})) ? 'As now' : 'No treatment');
/** The steps for ctx.run: each treatment its own change from the slide's state (every step starts again from it). */
export const menuSteps = (opts) => opts.map((m) => ({ params: m.patch, restart: true }));
/** The dots, in shown units, from the run's states: [{ id, name, short, ppg, liver, shunt }] (a treatment the model gave no reading for left out). */
export function menuPoints(opts, outs) {
  if (!Array.isArray(outs) || outs.length !== opts.length) return null;
  return opts.map((m, i) => ({ id: m.id, name: m.name, short: m.short || m.name, ppg: outs[i]?.fp?.ppg, liver: outs[i]?.fp?.liver, shunt: outs[i]?.fp?.shunt }))
    .filter((q) => Number.isFinite(q.ppg) && Number.isFinite(q.liver));
}
/** The PPG's rating colour token for a dot ('ok', 'caution', 'danger'), from the app's own cut-offs. */
export const ratingTok = (ppg) => SEV_OF_RATE[RATE.ppg(ppg, {})[0]] || 'ok';
/** A dot's radius for the share of portal blood that bypasses the liver (0 to 1), in px at type size f. */
export const dotRadius = (shunt, f) => f * (0.26 + 0.3 * clamp(Number.isFinite(shunt) ? shunt : 0, 0, 1));

// Each deck's menus, kept once worked out (by deck, then slide).
const kept = new WeakMap();
const keepOf = (deck) => { if (!deck) return new Map(); let m = kept.get(deck); if (!m) kept.set(deck, (m = new Map())); return m; };
const ready = new WeakMap();   // (a menu already worked out, as its value: a promise's cannot be read at once)
const keyOf = (t, c) => JSON.stringify([c?.slide?.id ?? c?.index, t.rows ?? null]);
function menuWork(t, c, myKey = keyOf(t, c)) {
  const store = keepOf(c.deck);
  let p = store.get(myKey);
  if (p) return p;
  if (!c.snap || !c.params) return null;
  const opts = menuOptions(c.params, t.rows);
  p = (opts.length ? c.run(menuSteps(opts)) : Promise.resolve([])).then((outs) => { const pts = menuPoints(opts, outs); return pts && { pts, base: c.fp ?? null, name: baseName(c.params) }; });
  store.set(myKey, p);
  p.then((v) => { if (!v) store.delete(myKey); else ready.set(p, v); }, () => store.delete(myKey));
  return p;
}
const haveOf = (t, c) => { const p = c?.snap ? keepOf(c.deck).get(keyOf(t, c)) : null; return p ? ready.get(p) ?? null : null; };
/** Starts the slide's menu once the deck's states are in, so the chart is whole when its slide comes up (slide-ext.js: a tool's warm). */
export const warmMenu = (t, c) => (t && c ? menuWork(t, c) ?? null : null);

/** The chart's geometry for a card w × h px in type f px: its scales from the dots (and the ring), the plot's box and the words' rows. */
export function geo(w, h, f, dots, base, steps = false, baseLabel = '') {
  const rowH = 1.5 * f, ys = [...dots.map((d) => d.ppg), base?.ppg].filter(Number.isFinite), xs = [...dots.map((d) => d.liver), base?.liver].filter(Number.isFinite);
  // (The scale runs on nice numbers round the dots, from zero only when they come near it: a patient whose dots lie between 20 and 60 gets that stretch, not the first third empty.)
  const [x0, x1] = xDomain(xs);
  // (Under the key row, the caption of the dots' size; on a card too narrow for it beside the reading's name, a row of its own.)
  const read = 'PPG, mmHg', size = 'Dot size: portosystemic shunt fraction', two = cw(read, f, 1) + cw(size, f, 1) + 4 * f > w, keyH = (two ? 2 : 1) * rowH + 0.2 * f;
  const stepKey = steps ? stepKeyOf(dots, w, f, base ? baseLabel : '') : null, stepH = stepKey?.rows ? stepKey.rows * rowH + 0.3 * f : 0;
  const most = clamp(Math.floor((h - 3.3 * f - stepH - keyH - 2 * f) / (1.6 * f)) + 1, 3, 7), sL = leftScale('ppg', ys, most, [12]);
  const ax = { name: 'Sinusoidal flow, % of normal', unit: '%', d: 0, k: 'liver' };
  const tw = Math.max(...sL.ticks.map((v) => cw(fmtTick(v, 0), f))), L = Math.ceil(tw + 14), R = Math.floor(w - 10);
  const { xt, nameAt } = xAxisRow(x0, x1, L, R, w, f, ax, Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f)))));
  const foot = (nameAt == null ? 3.1 : 1.7) * f, T = keyH + 1.4 * f, B = h - foot - 0.2 * f - stepH;
  return { w, h, f, rowH, x0, x1, xt, nameAt, sL, ax, read, size, two, keyH, foot, stepKey, stepH, L, R, T, B: Math.max(T + 3 * f, B) };
}
// The key under the chart when the dots carry numbers: each "1 Propranolol", left to right and wrapped to rows of the chart's width.
// (The ring, the patient as he stands, leads the key with a small ring of its own.)
function stepKeyOf(dots, w, f, baseLabel = '') {
  let x = 0, row = 0;
  const first = baseLabel ? [{ n: '', ring: true, id: '', name: baseLabel, w: 0.9 * f + cw(baseLabel, f, 1) }] : [];
  const items = [...first, ...[...dots].sort((a, b) => a.liver - b.liver).map((d, k) => ({ n: k + 1, id: d.id, name: d.short, w: cw(String(k + 1), f, 1) + 0.45 * f + cw(d.short, f, 1) }))].map((it) => {
    if (x > 0 && x + it.w > w) { row++; x = 0; }
    const at = { ...it, x, row }; x += it.w + 1.4 * f; return at;
  });
  return { items, rows: items.length ? row + 1 : 0 };
}

/** The drawing: { svg, G }. dots: menuPoints (or [] for the frame alone), base: the slide's own reading ({ ppg, liver, shunt }), baseName: the ring's name. */
export function build(w, h, f, dots, base, baseLabel, steps = false) {
  const G = geo(w, h, f, dots, base, steps, baseLabel), { L, R, T, B, sL, x0, x1 } = G;
  const X = (v) => L + (R - L) * (v - x0) / ((x1 - x0) || 1), Y = (v) => B - (B - T) * clamp((v - sL.min) / ((sL.max - sL.min) || 1), 0, 1);
  const n1 = (v) => +v.toFixed(1), ty = (y) => n1(y + 0.35 * f);
  const panel = plotPanel(sv, 0, G.keyH + 0.2 * f, w, B + G.foot - (G.keyH + 0.2 * f) - G.stepH);
  const grid = sL.ticks.map((v) => sv('g', { class: 'ptk-grid' }, sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: n1(Y(v)), y2: n1(Y(v)) }),
    sv('text', { 'data-look': 'time.grid.text', 'data-p-c': 'text-2', x: L - 6, y: ty(Y(v)), 'text-anchor': 'end' }, fmtTick(v, 0))));
  // (The ring is the patient as he stands; each treatment is a dot, sized by the blood that bypasses the liver and coloured by the PPG's rating.)
  const ring = base && Number.isFinite(base.ppg) && Number.isFinite(base.liver) ? [X(base.liver), Y(base.ppg)] : null, rr = Math.max(5, f * 0.45);
  const pts = dots.map((d) => ({ d, x: X(d.liver), y: Y(d.ppg), r: dotRadius(d.shunt, f), c: ratingTok(d.ppg) }));
  const half = (r) => r + 2;
  const named = [...(ring ? [{ id: '', x: ring[0], y: ring[1], r: rr, txt: baseLabel }] : []), ...pts.map((q) => ({ id: q.d.id, x: q.x, y: q.y, r: q.r, txt: q.d.short }))];
  const boxes = named.map((q) => [q.x - half(q.r), q.y - half(q.r), q.x + half(q.r), q.y + half(q.r)]), segs = [];
  // (The cut-offs: the PPG's red line, and the liver's severe line when the dots reach it; each named over its line, at the end the dots leave clear.)
  const pc = cutsOf('ppg').find((c) => c.rate === 'hi' && c.v > sL.min && c.v < sL.max), lc = cutsOf('liver').find((c) => c.rate === 'hi' && c.v > x0 && c.v < x1);
  const cutEls = [], inside = [0, 0, w, h];
  if (pc) {
    const y = Y(pc.v), txt = `PPG ${pc.v}`, tw = 1.12 * cw(txt, f, true);
    const at = placeWord([{ x: L + 3, y: y - 0.35 * f, anchor: 'start' }, { x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' }, { x: R - 3, y: y + 1.05 * f, anchor: 'end' }], tw, f, { boxes, inside });
    cutEls.push(sv('g', { class: 'ptk-grid cut', 'data-rate': pc.rate }, sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: n1(y), y2: n1(y) }),
      sv('text', { class: 'pcv-cut', 'data-look': 'cv.cut', 'data-nomorph': '', x: n1(at.x), y: n1(at.y), 'text-anchor': at.anchor }, txt)));
    boxes.push(at.box); segs.push(Object.assign([L, y, R, y], { w: 5 }));
  }
  if (lc) {
    const x = X(lc.v), txt = `Liver ${lc.v}`, tw = 1.12 * cw(txt, f, true), y = T - 0.45 * f;
    const at = placeWord([{ x, y, anchor: 'middle' }, { x: x + 0.3 * f, y, anchor: 'start' }, { x: x - 0.3 * f, y, anchor: 'end' }], tw, f, { boxes, inside });
    cutEls.push(sv('g', { class: 'ptk-grid cut', 'data-rate': lc.rate }, sv('line', { 'data-look': 'plot.grid.line', x1: n1(x), x2: n1(x), y1: n1(T - 0.2 * f), y2: n1(B) }),
      sv('text', { class: 'pcv-cut', 'data-look': 'cv.cut', 'data-nomorph': '', x: n1(at.x), y: n1(at.y), 'text-anchor': at.anchor }, txt)));
    boxes.push(at.box); segs.push(Object.assign([x, T, x, B], { w: 5 }));
  }
  // (The key row: the reading at the left, what a dot's size means at the right.)
  const keyRow = sv('g', { class: 'pft-key' },
    sv('text', { 'data-look': 'time.key.text', 'data-p-c': 'text-2', x: 0, y: ty(0.75 * f) }, sv('tspan', { 'data-look': 'time.span' }, 'PPG'), sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, ', mmHg')),
    sv('text', { 'data-look': 'time.key.unit', 'data-p-c': 'text-3', x: G.two ? 0 : w, y: ty((G.two ? 2.25 : 0.75) * f), 'text-anchor': G.two ? 'start' : 'end' }, G.size));
  const axis = [sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
    ...G.xt.map((x) => sv('text', { class: 'pft-tk', 'data-look': 'time.tk', x: n1(X(x)), y: n1(B + 1.25 * f), 'text-anchor': X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }, fmtTick(x, 0))),
    sv('text', { class: 'pcv-ax', 'data-look': 'cv.ax', x: n1(G.nameAt ?? clamp((L + R) / 2, 8 + cw(xAxisName(G.ax), f, 1) / 2, w - 8 - cw(xAxisName(G.ax), f, 1) / 2)), y: n1(B + (G.nameAt == null ? 2.6 : 1.25) * f), 'text-anchor': 'middle' }, xAxisName(G.ax))];
  // (The words keep off every dot, the ring, the cut-offs and the chart's edge; a name that cannot stand close and clear gives way to numbers and a key.)
  const num = new Map(G.stepKey?.items.filter((it) => !it.ring).map((it) => [it.id, String(it.n)]) || []);
  const items = named.map((q) => ({ x: q.x, y: q.y, w: !q.id && num.size ? 0 : 1.08 * cw(num.get(q.id) ?? q.txt, f, true) }));
  const ob = { boxes, segs, lines: [{ y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], inside: [0, 0, w, h] };
  const spots = named.length ? placeDotNames(items, f, half(Math.max(...named.map((q) => q.r))), ob) : [];
  const crowded = !steps && dots.length > 0 && namesCrowded(spots, f);
  const nameEls = [], leadEls = [];
  named.forEach((q, i) => {
    const s = spots[i], word = num.get(q.id) ?? q.txt;
    if (!s?.ok || (!q.id && num.size)) return;   // (with numbers, the ring is named in the key)
    nameEls.push(sv('text', { class: `pcv-dname${num.size && q.id ? ' pcv-dnum' : ''}`, 'data-look': 'cv.dname', 'data-nomorph': '', x: n1(s.x), y: n1(s.y), 'text-anchor': s.anchor }, word));
    if (s.lead) leadEls.push(sv('line', { class: 'pcv-lead', 'data-look': 'cv.lead', 'data-nomorph': '', x1: n1(s.lead[0]), y1: n1(s.lead[1]), x2: n1(s.lead[2]), y2: n1(s.lead[3]) }));
  });
  const dotEls = pts.map((q) => sv('circle', { class: 'pcv-dot', 'data-look': 'cv.dot', 'data-p-c': q.c, cx: n1(q.x), cy: n1(q.y), r: n1(q.r) }));
  const ringEl = ring ? sv('circle', { class: 'pcv-ring', 'data-look': 'cv.ring', 'data-p-c': 'text-2', cx: n1(ring[0]), cy: n1(ring[1]), r: n1(rr) }) : null;
  const stepsKey = G.stepKey?.rows ? sv('g', { class: 'pcv-steps' }, G.stepKey.items.map((it) => { const y = B + G.foot + 1.3 * f + it.row * G.rowH;
    return it.ring ? sv('g', {}, sv('circle', { class: 'pcv-ring', 'data-look': 'cv.ring', 'data-p-c': 'text-2', cx: n1(it.x + 0.35 * f), cy: n1(y - 0.05 * f), r: n1(0.3 * f) }),
      sv('text', { class: 'pcv-sk', 'data-look': 'cv.sk', x: n1(it.x + 0.9 * f), y: n1(y) }, it.name))
      : sv('text', { class: 'pcv-sk', 'data-look': 'cv.sk', x: n1(it.x), y: n1(y) }, sv('tspan', { class: 'pcv-sn', 'data-look': 'cv.sn' }, String(it.n)), ` ${it.name}`); })) : null;
  const label = `Treatment menu: PPG against sinusoidal flow. ${ring ? `${baseLabel} ${Math.round(base.ppg)} mmHg, ${Math.round(base.liver)}%` : ''}${dots.map((d) => `; ${d.name} ${d.ppg.toFixed(1)} mmHg, ${Math.round(d.liver)}%`).join('')}`;
  const svg = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': label, style: `font-size: ${f.toFixed(2)}px` },
    sv('defs', {}, panel.clip), panel.back, grid, cutEls, keyRow, axis, stepsKey, leadEls, dotEls, ringEl, nameEls);
  svg.dataset.points = String(dots.length);   // (the browser checks read it: 0 until the numbers are there)
  return { svg, G, crowded };
}

export function createMenu() {
  const el = document.createElement('div');
  el.className = 'pz-curve pz-menu';   // (the curve's card: its height, type and number styles)
  const gl = createSvgGL(el, { host: 'curve' });
  let t = null, ctx = null, data = null, key = '', lastSz = '', parts = null;
  const size = () => { const f = fittedType(el, gl, CV_MIN); return [Math.max(160, readMetric(el, 'clientWidth') || 420), Math.max(8 * f, readMetric(el, 'clientHeight') || 240), f]; };
  function redraw(fade) {
    if (!t) return;
    const [w, h, f] = size();
    lastSz = [w, h, f].map(Math.round).join('x');
    const dots = data?.pts ?? [], base = data?.base ?? ctx?.fp ?? null, name = data?.name ?? baseName(ctx?.params);
    let b = build(w, h, f, dots, base, name);
    // (A crowd of names: numbers on the dots and a key under the chart, if the plot keeps its height; else the names stay and any with no clear spot is left out.)
    if (b.crowded) { const b2 = build(w, h, f, dots, base, name, true); if (b2.G.B - b2.G.T >= 5 * f) b = b2; }
    const old = parts;
    parts = b;
    gl.show(b.svg, !!(fade && old));
    gl.place(b.svg);
  }
  const remake = () => { if (!t || !parts || !el.isConnected) return; const sz = size().map(Math.round).join('x'); if (sz !== lastSz) redraw(false); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(remake).observe(el);
  async function fetchMenu(myKey, c) {
    const p = menuWork(t, c, myKey);
    if (!p) return;   // (the slide's state is not ready: shown again, it asks again)
    const r = await p.catch(() => null);
    // (Still this slide's instrument: configured with this context and no other since.)
    if (!r || key !== myKey || ctx !== c) return;
    data = r; redraw(true);
  }
  return {
    el,
    configure(tool, c) {
      const k2 = keyOf(tool, c);
      t = tool; ctx = c || null;
      if (k2 !== key) {
        key = k2; data = haveOf(tool, c);
        redraw(!!parts);
        if (!data && ctx) fetchMenu(key, ctx);
      } else if (!data && ctx) fetchMenu(key, ctx);
    },
    pin() {}, update() {}, clear() {},
    /** The card has fitted: drawn again if its zoom, and so the chart's type, is not what it was drawn at (the observer does not see a zoom). */
    refit: remake,
    dispose() { t = null; ctx = null; parts = null; gl.dispose(); el.replaceChildren(); },
  };
}
