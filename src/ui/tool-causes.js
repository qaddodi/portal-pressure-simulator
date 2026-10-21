// Deck visuals V5: "What raises the pressure" in the data card (package C, review/deck-visuals-recs.md §9).
//
//   tool: { kind: 'causes', metric: 'ppg' }   ('ppg', 'hvpg' or 'pv')
//
// A waterfall read from top to bottom, across the card's whole width: a "Healthy" bar at the healthy reading, then one step
// per cause from the running total (right for a rise, left for a fall, its signed mmHg at the step's end), then a "Now" bar at
// the case's reading in its rating's colour, the same number and colour as its tile. Thin dashed lines at the reading's
// cut-offs (PPG 6 and 12, HVPG 5 and 10, portal 10 and 15) run behind the bars, numbered under them, so the steps show where
// the case crosses them. The causes come from the Why? panel's leave-one-out code (engine/explain.js) run on the slide's own
// state on the presenter's calculation worker (the slide's step asks for it: ext-model.js). At most five causes, the largest
// (fewer when the card is too short for their rows); whatever they leave of the rise (the causes overlap, and the smaller
// ones) is the grey "Causes together" step, so the printed steps add up exactly to the printed "Now". Each step takes
// its mechanism's colour (resistance, inflow, the heart, shunts (collaterals among them), drugs); no key: every row is named.
// While a compare button or what-if slider moves the live model, the causes are worked out again on the live state and the
// steps ease to their new places. These are the model's own shares: a deck line that quotes them needs a source.

import { TILE, RATE, tileShown } from './table-marks.js?v=1dc429fe31';
import { cutsOf } from './tool-curve.js?v=3534ce8960';
import { DRUGS } from '../engine/scenario.js?v=fa99b897ff';
import { frameFor } from './frame.js?v=22467f9d04';
const nextFrame = frameFor('tool-causes');

const CS_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
export const METRICS = ['ppg', 'hvpg', 'pv'];
export const metricOf = (t) => (METRICS.includes(t?.metric) ? t.metric : 'ppg');
export const MOST = 5;

// The mechanisms, in the order their steps are drawn, each with its colour.
export const GROUPS = [
  ['res', 'Resistance', '--tr-pv'],
  ['inflow', 'Inflow', '--tr-var'],
  ['heart', 'Heart', '--tr-ivc'],
  ['shunts', 'Shunts', '--tr-cav'],   // (collaterals, the spontaneous portosystemic shunts, with TIPS and surgical shunts)
  ['drugs', 'Drugs', '--tr-hv'],
];
const DRUG_LABELS = new Set(Object.values(DRUGS).map((d) => d.label));
// Each cause the Why? panel can name (engine/explain.js factors), by its label, to its mechanism. (The ascites's pressure
// on the veins counts as resistance; a splenectomy, less inflow; balloon tamponade closes collaterals.)
const RULES = [
  ['res', /^(Cirrhosis\b|(Presinusoidal|Sinusoidal|Postsinusoidal) fibrosis|Stenosis of |Clot in |Occluded |Ascites\b)/],
  ['inflow', /^(Splanchnic vaso|Chronic splanchnic|Systemic arteriolar|Pregnancy\b|Arterioportal|Extra blood volume|Blood loss|Active bleeding|Splenectomy|Partial splenic|Extra plasma|Fewer red cells|Transfused red cells|Smaller plasma|Serum albumin)/],
  ['heart', /^(Right-heart contractility|Tricuspid regurgitation|Pericardial constraint)/],
  ['shunts', /^(Collaterals|TIPS\b|DIPS\b|Portocaval shunt|Distal splenorenal shunt|Mesocaval shunt|Balloon tamponade)/],
];
/** A cause's mechanism (a GROUPS key), or null for one no rule names. */
export function groupOf(label) {
  if (DRUG_LABELS.has(label)) return 'drugs';
  return RULES.find(([, re]) => re.test(label))?.[0] ?? null;
}
// (A step's words: the cause without the size it already shows as a length.)
export const shortLabel = (label) => label.replace(/^(Extra blood volume|Blood loss) [+\d].*$/, '$1').replace(/^Chronic splanchnic vasodilation$/, 'Splanchnic vasodilation')
  .replace(/^Serum albumin .*$/, 'Low serum albumin').replace(/^Right-heart contractility$/, 'Weak right heart');
// (What the causes add only together: pressure is flow times resistance, so two causes raise it more than each alone; the
// smaller causes left out fold in too.)
export const OTHER = 'Causes together';
export const HEALTHY = 'Healthy', NOW = 'Now';

/** The causes from an explain result: { bars: [{ key, label, group, delta, shown }], other, otherShown, total, current, base,
 *  baseShown, currentShown, unit, digits }. At most `most` causes (the largest), drawn by mechanism; the bars and other always
 *  sum to the total, and the printed base, steps and other add up exactly to the printed current (the tile's number). */
export function causeBars(r, most = MOST) {
  if (!r || !Number.isFinite(r.total)) return null;
  const d = r.digits ?? 1;
  const min = 0.5 * Math.pow(10, -d);
  const cs = (r.contributions || []).filter((c) => Number.isFinite(c.delta) && Math.abs(c.delta) >= min).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, Math.max(0, most));
  const order = (g) => { const i = GROUPS.findIndex(([k]) => k === g); return i < 0 ? GROUPS.length : i; };
  const bars = cs.map((c) => ({ key: c.label, label: shortLabel(c.label), group: groupOf(c.label), delta: c.delta }))
    .sort((a, b) => order(a.group) - order(b.group) || Math.abs(b.delta) - Math.abs(a.delta));
  const other = r.total - bars.reduce((s, b) => s + b.delta, 0);
  // (The numbers printed: the healthy and current readings as a tile prints them, each step rounded, and the other step
  // whatever is left, so they add up exactly. Counted in the last digit's units, free of float error.)
  const base = Number.isFinite(r.base) ? r.base : (Number.isFinite(r.current) ? r.current - r.total : 0);
  const current = Number.isFinite(r.current) ? r.current : base + r.total;
  const u = Math.pow(10, d), n = (v) => Math.round(v * u), nt = (v) => Math.round(+v.toFixed(d) * u);
  for (const b of bars) b.shown = n(b.delta) / u;
  const otherShown = (nt(current) - nt(base) - bars.reduce((s, b) => s + n(b.delta), 0)) / u;
  return { bars, other, otherShown, total: r.total, current, base, baseShown: nt(base) / u, currentShown: nt(current) / u, unit: r.unit || 'mmHg', digits: d };
}

/** The waterfall's rows from causeBars' result, top to bottom: the healthy bar, a step per cause and the other step, each from
 *  the running total a to b, and the current bar. shown is the printed number (signed for a step); rate a total's rating. */
export function steps(data, metric = 'ppg') {
  if (!data) return [];
  const rate = (v) => (RATE[metric] ? RATE[metric](tileShown(metric, v))[0] : null);
  const rows = [{ key: HEALTHY, label: HEALTHY, kind: 'total', a: 0, b: data.base, shown: data.baseShown, rate: rate(data.base) }];
  let run = data.base;
  for (const s of [...data.bars, { key: OTHER, label: OTHER, group: null, delta: data.other, shown: data.otherShown }]) {
    rows.push({ key: s.key, label: s.label, kind: 'step', group: s.group, a: run, b: run + s.delta, shown: s.shown });
    run += s.delta;
  }
  rows.push({ key: NOW, label: NOW, kind: 'total', a: 0, b: data.current, shown: data.currentShown, rate: rate(data.current) });
  return rows;
}

/** The scale: from zero (so a rise keeps its true size) to the highest running total, stretched to a cut-off that lies close
 *  above it, so the case's place against the cut-offs shows. */
export function domainOf(rows, metric = 'ppg') {
  const vs = rows.flatMap((r) => [r.a, r.b]).filter(Number.isFinite);
  const lo = Math.min(0, ...vs), top = Math.max(0, ...vs);
  let hi = top;
  for (const c of cutsOf(metric)) if (c.v > hi && c.v <= 1.6 * top) hi = c.v;
  hi += 0.04 * (hi - lo);
  return { lo, hi: hi - lo < 1 ? lo + 1 : hi };
}

const fmt = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const signed = (v, d) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? fmt(0, d) : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(d));
export const shownText = (r, d) => (r.kind === 'step' ? signed(r.shown, d) : fmt(r.shown, d));
const cw = (t, f, b) => String(t).length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)
/** A label in lines no wider than w (type f): split at the space nearest its middle when it does not fit on one, and only a
 *  label too long for two lines takes a third (filled word by word). */
export function wrapLabel(label, w, f) {
  if (cw(label, f) <= w) return [label];
  const sp = [...label.matchAll(/ /g)].map((m) => m.index);
  if (!sp.length) return [label];
  const mid = label.length / 2, i = sp.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const two = [label.slice(0, i), label.slice(i + 1)];
  if (two.every((l) => cw(l, f) <= w)) return two;
  const out = [];
  for (const word of label.split(' ')) {
    const l = out.length ? `${out.at(-1)} ${word}` : word;
    if (out.length && cw(l, f) <= w) out[out.length - 1] = l; else out.push(word);
  }
  return out;
}

export const GAP = 4;   // px: the least room between any two drawn things (words, bars, lines)
const LH = 1.15;        // (a label's second line, in em)
/** The chart's layout for a card w × h at type f: the words' column (Lw), the plot from bx0 to bx1, each row's place y and
 *  its words' lines, the bars' thickness bh, the bottom of the cut-off lines (B) and the axis numbers' baseline (axY).
 *  fits: false when the rows need more height than the card has. */
export function layout(w, h, f, rows) {
  const gap = Math.max(GAP, 0.35 * f);
  // (The words take under half the card, a little more when a long cause would otherwise need three lines.)
  let labelMax = (w < 300 ? 0.44 : 0.46) * w;
  if (rows.some((r) => wrapLabel(r.label, labelMax, f).length > 2)) labelMax = 0.5 * w;
  const Lw = Math.min(0.56 * w, Math.max(cw(HEALTHY, f), ...rows.map((r) => Math.max(...wrapLabel(r.label, labelMax, f).map((x) => cw(x, f))))));
  const Vw = cw('+00.0', f, true), vgap = Math.max(GAP + 1, 0.45 * f);
  const bx0 = Lw + 0.9 * f, bx1 = w - Vw - vgap;
  // (Each row as tall as its words, with the room left shared between the rows (at most two lines of type each), the block
  // centred in the card with the axis numbers under it.)
  const lines = rows.map((r) => wrapLabel(r.label, Lw, f));
  const need = lines.map((l) => f + (l.length - 1) * LH * f);
  const axH = gap + 1.05 * f;
  const avail = h - axH, sum = need.reduce((s, x) => s + x, 0), n = Math.max(1, rows.length);
  const extra = Math.min(2 * f, Math.max(gap, (avail - sum) / n));
  const fits = sum + n * gap <= avail + 0.01;
  const blockH = sum + n * extra + axH, top = Math.max(0, (h - blockH) / 2);
  let y = top;
  const place = rows.map((r, i) => { const slot = need[i] + extra, c = y + slot / 2; y += slot; return { key: r.key, y: c, lines: lines[i] }; });
  const B = y, axY = B + gap + 0.8 * f;
  // (Bars no thicker than a line of type, and thin enough that a step's number stays clear of the bars above and below it,
  // its glyphs reaching 0.42 em either side of the row's middle.)
  const d = place.slice(1).map((p, i) => p.y - place[i].y);
  const minD = d.length ? Math.min(...d) : 2 * f;
  const bh = Math.max(4, Math.min(0.95 * f, minD - 2 * gap, 2 * (minD - 0.42 * f - gap)));
  return { w, h, f, gap, vgap, Lw, Vw, bx0, bx1, rows: place, bh, top, B, axY, fits };
}
/** The most causes whose rows fit the card (fewer fold into "Causes together", so the steps still add up). */
export function fitBars(r, w, h, f, metric = 'ppg') {
  for (let m = MOST; m > 0; m--) {
    const data = causeBars(r, m);
    if (!data) return null;
    if (layout(w, h, f, steps(data, metric)).fits) return data;
  }
  return causeBars(r, 0);
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat(2).filter((k) => k != null));
  return el;
};
const colourOf = (g) => (GROUPS.find(([k]) => k === g)?.[2] ? `var(${GROUPS.find(([k]) => k === g)[2]})` : 'var(--text-3)');

export function createCauses({ host } = {}) {
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const el = document.createElement('div');
  el.className = 'pz-cbars';
  let t = null, ctx = null, G = null, parts = null, lastSz = '', raf = 0, raw = null, data = null, list = [], gen = 0, busy = false, again = null, mode = 'own';
  const rows = new Map();   // key → { els, cur: { a, b, y, o }, goal, label, group, kind }
  let dom = null, domGoal = { lo: 0, hi: 1 };   // (the scale, easing after its goal)

  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? CS_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  function makeRow(r) {
    const { f } = G, lines = G.rows.find((p) => p.key === r.key)?.lines || wrapLabel(r.label, G.Lw, f);
    const label = sv('text', { class: 'pcs-l', x: 0, 'text-anchor': 'start' }, lines.map((l, j) => sv('tspan', { x: 0, dy: j ? `${LH}em` : null }, l)));
    const bar = sv('rect', { class: 'pcs-b', rx: 2, style: r.kind === 'total' ? null : `fill: ${colourOf(r.group)}` });
    const val = sv('text', { class: 'pcs-v' });
    const g = sv('g', { class: 'pcs-row' + (r.key === OTHER ? ' other' : '') + (r.kind === 'total' ? ' total' : '') + (r.key === NOW ? ' now' : '') }, label, bar, val);
    r.els = { g, label, bar, val, lines: lines.length };
    parts.rowsG.append(g);
  }
  function build() {
    const { w, h, f } = G;
    const cutsG = sv('g', {}), links = sv('path', { class: 'pcs-c' }), rowsG = sv('g', {}), axG = sv('g', { class: 'pcs-ax' });
    const cuts = cutsOf(metricOf(t)).map((c) => {
      const line = sv('line', { y1: G.rows[0] ? Math.max(0, G.rows[0].y - G.bh / 2 - G.gap) : 0, y2: G.B });
      const num = sv('text', { y: G.axY, 'text-anchor': 'middle' }, fmt(c.v, Number.isInteger(c.v) ? 0 : 1));
      cutsG.append(sv('g', { class: 'pcs-cut', 'data-rate': c.rate }, line));
      axG.append(sv('g', { class: 'pcs-cut', 'data-rate': c.rate }, num));
      return { v: c.v, line, num, tw: cw(num.textContent, f, true) };
    });
    const unit = sv('text', { class: 'pcs-u', x: w, y: G.axY, 'text-anchor': 'end' }, data?.unit || TILE[metricOf(t)]?.u || 'mmHg');
    axG.append(unit);
    const svg = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', style: `font-size: ${f.toFixed(2)}px` }, cutsG, links, rowsG, axG);
    return { svg, rowsG, links, cuts, unit, uw: cw(unit.textContent, f) };
  }
  const X = (v) => G.bx0 + (v - dom.lo) * (G.bx1 - G.bx0) / Math.max(1e-6, dom.hi - dom.lo);
  function paint() {
    if (!parts || !dom) return;
    const { f, bh, vgap, bx0, gap, w } = G, dg = data?.digits ?? 1;
    // (The cut-offs inside the scale, each numbered under its line; a number that would come within the gap of the one
    // before it, or of the unit at the right, is left out (its line stays).)
    let lastR = -Infinity;
    const ux0 = w - parts.uw;
    for (const c of parts.cuts) {
      const x = X(c.v), on = c.v > dom.lo && c.v < dom.hi, xs = x.toFixed(1);
      c.line.setAttribute('x1', xs); c.line.setAttribute('x2', xs); c.num.setAttribute('x', xs);
      c.line.parentNode.classList.toggle('off', !on);
      const l = x - c.tw / 2, r = x + c.tw / 2, show = on && l >= lastR + gap && r <= ux0 - gap;
      c.num.parentNode.classList.toggle('off', !show);
      if (show) lastR = r;
    }
    const alive = [];
    for (const r of rows.values()) {
      const { label, bar, val, g, lines } = r.els, { a, b, y, o } = r.cur;
      g.style.opacity = o.toFixed(3);
      label.setAttribute('y', (y + 0.35 * f - (lines - 1) * LH * 0.5 * f).toFixed(1));
      const x0 = X(Math.min(a, b)), x1 = X(Math.max(a, b));
      const wd = r.goal?.shown ? Math.max(3, x1 - x0) : Math.max(0, x1 - x0);   // (a printed step shows at least a stub)
      const bl = r.kind === 'step' && b < a ? x1 - wd : x0;
      bar.setAttribute('x', bl.toFixed(1)); bar.setAttribute('width', wd.toFixed(1));
      bar.setAttribute('y', (y - bh / 2).toFixed(1)); bar.setAttribute('height', bh.toFixed(1));
      if (r.rate !== undefined) g.dataset.rate = r.rate || '';
      // (The number at the step's end: right of a rise or a total, left of a fall when it has room there (clear of the words),
      // else right of it.)
      const settled = r.goal && Math.abs(b - r.goal.b) < 1e-9 && Math.abs(a - r.goal.a) < 1e-9;
      const txt = settled ? shownText({ kind: r.kind, shown: r.goal.shown }, dg) : shownText({ kind: r.kind, shown: r.kind === 'step' ? b - a : b }, dg);
      if (val.textContent !== txt) val.textContent = txt;
      const vw = cw(txt, f, true), left = r.kind === 'step' && b < a && bl - vgap - vw >= bx0;
      val.setAttribute('x', (left ? bl - vgap : bl + wd + vgap).toFixed(1));
      val.setAttribute('text-anchor', left ? 'end' : 'start');
      val.setAttribute('y', (y + 0.35 * f).toFixed(1));
      if (r.goal?.o === 1) alive.push(r);
    }
    // (Dashed links carry the running total from each bar's end down to the next bar.)
    alive.sort((p, q) => p.cur.y - q.cur.y);
    let d = '';
    for (let i = 0; i + 1 < alive.length; i++) {
      const p = alive[i], q = alive[i + 1], x = X(p.cur.b).toFixed(1), y0 = p.cur.y + bh / 2, y1 = q.cur.y - bh / 2;
      if (y1 - y0 > 1) d += `M${x} ${y0.toFixed(1)}V${y1.toFixed(1)}`;
    }
    parts.links.setAttribute('d', d);
  }
  // Every row glides after its goal: its ends, place and fade (never a jump), and the scale with them.
  function tick() {
    raf = 0;
    const kk = reduceMQ.matches ? 1 : 0.18, mix = (a, b) => a + (b - a) * kk;
    dom = dom ? { lo: mix(dom.lo, domGoal.lo), hi: mix(dom.hi, domGoal.hi) } : { ...domGoal };
    let moving = Math.abs(dom.lo - domGoal.lo) + Math.abs(dom.hi - domGoal.hi) > 1e-3;
    if (!moving) dom = { ...domGoal };
    for (const [key, r] of rows) {
      const c = r.cur, g = r.goal;
      const n = { a: mix(c.a, g.a), b: mix(c.b, g.b), y: mix(c.y, g.y), o: mix(c.o, g.o) };
      if (Math.abs(n.a - g.a) < 0.005 && Math.abs(n.b - g.b) < 0.005 && Math.abs(n.y - g.y) < 0.2 && Math.abs(n.o - g.o) < 0.01) Object.assign(n, { a: g.a, b: g.b, y: g.y, o: g.o }); else moving = true;
      r.cur = n;
      if (g.o === 0 && n.o === 0) { r.els?.g.remove(); rows.delete(key); }
    }
    paint();
    if (moving) raf = nextFrame(tick);
  }
  // The rows' goals from data, each in its place; a new row grows out of the running total it starts from, and rows no longer
  // named fade out where they stand.
  function aim() {
    if (!G || !parts) return;
    const seen = new Set();
    list.forEach((s, i) => {
      seen.add(s.key);
      const y = G.rows[i].y;
      let r = rows.get(s.key);
      if (!r) { r = { key: s.key, label: s.label, group: s.group, kind: s.kind, cur: { a: s.a, b: s.kind === 'step' ? s.a : s.b, y, o: 0 } }; rows.set(s.key, r); makeRow(r); }
      r.rate = s.rate;
      r.goal = { a: s.a, b: s.b, y, o: 1, shown: s.shown };
    });
    for (const [key, r] of rows) if (!seen.has(key)) r.goal = { ...r.cur, o: 0, shown: r.goal?.shown };
    domGoal = list.length ? domainOf(list, metricOf(t)) : { lo: 0, hi: 1 };
    const m = TILE[metricOf(t)]?.t || 'The reading';
    parts.svg.setAttribute('aria-label', data ? `${m}: healthy ${fmt(data.baseShown, data.digits)}, now ${fmt(data.currentShown, data.digits)} ${data.unit}. `
      + list.filter((s) => s.kind === 'step').map((s) => `${s.label} ${signed(s.shown, data.digits)}`).join(', ') : `${m}: what raises it, being worked out`);
    parts.svg.dataset.bars = String(data ? data.bars.length : 0);   // (the browser checks read it)
    if (!raf) raf = nextFrame(tick);
  }
  function redraw() {
    if (!t) return;
    const [w, hh, f] = size(); lastSz = [w, hh, f].map(Math.round).join('x');
    const k = metricOf(t);
    data = raw ? fitBars(raw, w, hh, f, k) : null;
    list = steps(data, k);
    G = layout(w, hh, f, list);
    parts = build();
    el.replaceChildren(parts.svg);
    for (const r of rows.values()) makeRow(r);
    if (!dom) dom = list.length ? domainOf(list, k) : { lo: 0, hi: 1 };
    paint(); aim();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (!t || !parts || !el.isConnected) return;
    const sz = size().map(Math.round).join('x'); if (sz === lastSz) return;
    redraw();
  }).observe(el);

  const setData = (r) => { raw = r; redraw(); };   // (laid out again: a new cause's words may need a wider column, or more rows)
  // The live model's causes, worked out on its snapshot (one at a time; the newest asked for runs next).
  async function live(c, g) {
    if (busy) { again = [c, g]; return; }
    busy = true;
    try {
      const snap = (await host?.request?.('snapshot'))?.snap;
      const out = snap && g === gen && c.shown() ? await c.run([{ explain: metricOf(t) }], snap) : null;
      const r = out?.[0]?.extra?.explain?.[metricOf(t)];
      if (r && g === gen && ctx === c && mode === 'live' && c.shown()) setData(r);
    } finally {
      busy = false;
      if (again) { const [c2, g2] = again; again = null; if (g2 === gen && mode === 'live') live(c2, g2); }
    }
  }
  function own(c, g) {
    const r = c.extra?.explain?.[metricOf(t)];
    if (r) { setData(r); return; }
    // (Not c.shown(), which turns true only once the slide has come in: see tool-curve.js fetchCurve.)
    c.whenExtra?.().then((x) => { const r2 = x?.explain?.[metricOf(t)]; if (r2 && g === gen && ctx === c && mode === 'own') setData(r2); });
  }
  return {
    el,
    configure(tool, c) {
      const fresh = t?.metric !== tool?.metric || ctx?.slide !== c?.slide || !parts;
      t = tool; ctx = c || null;
      const g = ++gen;
      if (fresh) { raw = null; data = null; for (const r of rows.values()) r.els?.g.remove(); rows.clear(); dom = null; redraw(); }
      mode = 'own';
      if (ctx) own(ctx, g);
    },
    /** The slide's own state shows the slide's causes; a live state (a compare button, a what-if slider) has its own worked out. */
    pin(fp) {
      if (!t || !ctx || !fp) return;
      // (gen counts slides, not pins: a live state's causes still land while the model eases and pins keep coming.)
      mode = fp === ctx.fp ? 'own' : 'live';
      if (mode === 'own') own(ctx, gen); else live(ctx, gen);
    },
    update() {}, clear() {},
    dispose() { t = null; ctx = null; parts = null; rows.clear(); el.replaceChildren(); },
  };
}
