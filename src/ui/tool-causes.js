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

import { TILE, RATE, tileShown } from './table-marks.js';
import { cutsOf } from './tool-curve.js';
import { DRUGS } from '../engine/scenario.js';
import { restClass } from './rest-pass.js';
import { frameFor } from './frame.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts } from './svg-gl.js';
import { numWords, signedWords } from './num-words.js';
import { reduceMotionMQ } from './motion.js';
import { chartCtx } from './chart-ctx.js';
const nextFrame = frameFor('tool-causes');
const mix = (a, b, k) => a + (b - a) * k;   // (one step toward b)

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
  ['inflow', /^(Splanchnic vaso|Chronic splanchnic|Systemic arteriolar|Pregnancy\b|Arterioportal|Extra blood volume|Blood loss|Active bleeding|Splenectomy|Partial splenic|Extra plasma|Fewer red cells|Transfused red cells|Smaller plasma|Serum albumin|Anemia of liver disease|Large spleen)/],
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
const cw = (t, f, b) => t.length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)
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

// (2 Nov 2026: the chart is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = svgModel;
const colourOf = (g) => (GROUPS.find(([k]) => k === g)?.[2] || '--text-3').replace(/^--/, '');   // (a mechanism's colour token, by its name in theme-tokens.js: what a bar's data-p-c holds)

export function createCauses({ host } = {}) {
  const reduceMQ = reduceMotionMQ;
  const el = document.createElement('div');
  el.className = 'pz-cbars';
  const gl = createSvgGL(el, { host: 'causes' });
  let t = null, ctx = null, G = null, parts = null, lastSz = '', raf = 0, raw = null, data = null, list = [], gen = 0, busy = false, again = null, mode = 'own';
  const rows = new Map();   // key → { els, cur: { a, b, y, o }, goal, label, group, kind }
  const rowList = [];       // (the same rows in the order they came, walked by index in a frame: no iterator made)
  const alive = [];         // (the rows at their goal this frame, in the order of their places: kept, emptied each paint)
  const domCur = { lo: 0, hi: 1 }, domGoal = { lo: 0, hi: 1 };   // (the scale, easing after its goal: both kept, written in place)
  let hasDom = false;
  // (The dashed links' points: three pairs a link (its top, its foot, a lifted pen), kept.)
  const linkBuf = new Float64Array(6 * 32);

  const size = () => {
    const w = el.clientWidth;
    let hs = 12;   // (the host's type size, from the chart's looks table: the card's own sizes handed over, never read off the page)
    try { const cx = chartCtx(el); delete cx.svk; gl.setCtx(cx); hs = gl.hostSize(); } catch { /* (no card round it yet: the sizes as they stand) */ }
    const f = Math.max(hs || 12, CS_MIN);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  function makeRow(r) {
    const { f } = G, lines = G.rows.find((p) => p.key === r.key)?.lines || wrapLabel(r.label, G.Lw, f);
    const label = sv('text', { class: 'pcs-l', 'data-look': 'causes.l', x: 0, 'text-anchor': 'start' }, lines.map((l, j) => sv('tspan', { 'data-look': 'causes.l.span', x: 0, dy: j ? `${LH}em` : null }, l)));
    const bar = sv('rect', r.kind === 'total' ? { class: 'pcs-b', 'data-look': 'causes.bar.total', rx: 2 } : { class: 'pcs-b', 'data-look': 'causes.bar.step', 'data-p-c': colourOf(r.group), rx: 2 });
    const val = sv('text', { class: 'pcs-v', 'data-look': 'causes.val' });
    const g = sv('g', { 'data-look': 'causes.row', class: 'pcs-row' + (r.key === OTHER ? ' other' : '') + (r.kind === 'total' ? ' total' : '') + (r.key === NOW ? ' now' : '') }, label, bar, val);
    setGeo(g, 'opacity', r.cur.o);   // (the strength is held on the piece as a number: set before its look is read)
    r.left = null;
    r.els = { g, label, bar, val, lines: lines.length };
    parts.rowsG.append(g);
  }
  function build() {
    const { w, h, f } = G;
    const cutsG = sv('g', { 'data-look': 'causes.g' }), links = sv('path', { class: 'pcs-c', 'data-look': 'causes.link' }), rowsG = sv('g', { 'data-look': 'causes.g' }), axG = sv('g', { class: 'pcs-ax', 'data-look': 'causes.g' });
    const cuts = cutsOf(metricOf(t)).map((c) => {
      const line = sv('line', { 'data-look': 'causes.cut.line', y1: G.rows[0] ? Math.max(0, G.rows[0].y - G.bh / 2 - G.gap) : 0, y2: G.B });
      const num = sv('text', { 'data-look': 'causes.cut.num', y: G.axY, 'text-anchor': 'middle' }, fmt(c.v, Number.isInteger(c.v) ? 0 : 1));
      cutsG.append(sv('g', { class: 'pcs-cut', 'data-look': 'causes.cut', 'data-rate': c.rate }, line));
      axG.append(sv('g', { class: 'pcs-cut', 'data-look': 'causes.cut', 'data-rate': c.rate }, num));
      return { v: c.v, line, num, tw: cw(num.textContent, f, true) };
    });
    const unit = sv('text', { class: 'pcs-u', 'data-look': 'causes.unit', x: w, y: G.axY, 'text-anchor': 'end' }, data?.unit || TILE[metricOf(t)]?.u || 'mmHg');
    axG.append(unit);
    const svg = sv('svg', { 'data-look': 'causes.root', viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'font-size': `${f.toFixed(2)}px` }, cutsG, links, rowsG, axG);
    return { svg, rowsG, links, cuts, unit, uw: cw(unit.textContent, f) };
  }
  const X = (v) => G.bx0 + (v - domCur.lo) * (G.bx1 - G.bx0) / Math.max(1e-6, domCur.hi - domCur.lo);
  function paint() {
    if (!parts || !hasDom) return;
    const { f, bh, vgap, bx0, gap, w } = G, dg = data?.digits ?? 1;
    // (The cut-offs inside the scale, each numbered under its line; a number that would come within the gap of the one
    // before it, or of the unit at the right, is left out (its line stays).)
    let lastR = -Infinity;
    const ux0 = w - parts.uw;
    for (let i = 0; i < parts.cuts.length; i++) {
      const c = parts.cuts[i], x = X(c.v), on = c.v > domCur.lo && c.v < domCur.hi;
      setGeo(c.line, 'x1', x); setGeo(c.line, 'x2', x); setGeo(c.num, 'x', x);
      restClass(c.line.parentNode, 'off', !on);
      const l = x - c.tw / 2, r = x + c.tw / 2, show = on && l >= lastR + gap && r <= ux0 - gap;
      restClass(c.num.parentNode, 'off', !show);
      if (show) lastR = r;
    }
    alive.length = 0;
    for (let i = 0; i < rowList.length; i++) {
      const r = rowList[i], { label, bar, val, g, lines } = r.els, c = r.cur, a = c.a, b = c.b, y = c.y;
      setGeo(g, 'opacity', c.o);
      setGeo(label, 'y', y + 0.35 * f - (lines - 1) * LH * 0.5 * f);
      const x0 = X(Math.min(a, b)), x1 = X(Math.max(a, b));
      const wd = r.goal?.shown ? Math.max(3, x1 - x0) : Math.max(0, x1 - x0);   // (a printed step shows at least a stub)
      const bl = r.kind === 'step' && b < a ? x1 - wd : x0;
      setGeo(bar, 'x', bl); setGeo(bar, 'width', wd);
      setGeo(bar, 'y', y - bh / 2); setGeo(bar, 'height', bh);
      if (r.rate !== undefined && g.dataset.rate !== (r.rate || '')) g.dataset.rate = r.rate || '';   // (only when it changes: a change is read again for its colour)
      // (The number at the step's end: right of a rise or a total, left of a fall when it has room there (clear of the words),
      // else right of it.)
      const settled = r.goal && Math.abs(b - r.goal.b) < 1e-9 && Math.abs(a - r.goal.a) < 1e-9, step = r.kind === 'step';
      const v = settled ? r.goal.shown : step ? b - a : b;
      const txt = step ? signedWords(v, dg) : numWords(v, dg);
      setWords(val, txt);
      const vw = cw(txt, f, true), left = step && b < a && bl - vgap - vw >= bx0;
      setGeo(val, 'x', left ? bl - vgap : bl + wd + vgap);
      if (r.left !== left) { r.left = left; val.setAttribute('text-anchor', left ? 'end' : 'start'); }
      setGeo(val, 'y', y + 0.35 * f);
      if (r.goal?.o === 1) alive.push(r);
    }
    // (Dashed links carry the running total from each bar's end down to the next bar: the rows in the order of their places, by insertion.)
    for (let i = 1; i < alive.length; i++) {
      const r = alive[i];
      let j = i - 1;
      while (j >= 0 && alive[j].cur.y > r.cur.y) { alive[j + 1] = alive[j]; j--; }
      alive[j + 1] = r;
    }
    let n = 0;
    for (let i = 0; i + 1 < alive.length && n + 3 <= 96; i++) {
      const p = alive[i].cur, q = alive[i + 1].cur, x = X(p.b), y0 = p.y + bh / 2, y1 = q.y - bh / 2;
      if (y1 - y0 > 1) {
        linkBuf[2 * n] = x; linkBuf[2 * n + 1] = y0; linkBuf[2 * n + 2] = x; linkBuf[2 * n + 3] = y1; linkBuf[2 * n + 4] = NaN; linkBuf[2 * n + 5] = 0;
        n += 3;
      }
    }
    setPts(parts.links, linkBuf, n, false);
  }
  // Every row glides after its goal: its ends, place and fade (never a jump), and the scale with them.
  function tick() {
    raf = 0;
    const kk = reduceMQ.matches ? 1 : 0.18;
    if (!hasDom) { domCur.lo = domGoal.lo; domCur.hi = domGoal.hi; hasDom = true; }
    else { domCur.lo = mix(domCur.lo, domGoal.lo, kk); domCur.hi = mix(domCur.hi, domGoal.hi, kk); }
    let moving = Math.abs(domCur.lo - domGoal.lo) + Math.abs(domCur.hi - domGoal.hi) > 1e-3;
    if (!moving) { domCur.lo = domGoal.lo; domCur.hi = domGoal.hi; }
    for (let i = rowList.length - 1; i >= 0; i--) {
      const r = rowList[i], c = r.cur, g = r.goal;
      c.a = mix(c.a, g.a, kk); c.b = mix(c.b, g.b, kk); c.y = mix(c.y, g.y, kk); c.o = mix(c.o, g.o, kk);
      if (Math.abs(c.a - g.a) < 0.005 && Math.abs(c.b - g.b) < 0.005 && Math.abs(c.y - g.y) < 0.2 && Math.abs(c.o - g.o) < 0.01) { c.a = g.a; c.b = g.b; c.y = g.y; c.o = g.o; } else moving = true;
      if (g.o === 0 && c.o === 0) { r.els?.g.remove(); rows.delete(r.key); rowList.splice(i, 1); }
    }
    paint();
    gl.paint();   // (the picture draws the moved bars in this same frame)
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
      if (!r) { r = { key: s.key, label: s.label, group: s.group, kind: s.kind, left: null, cur: { a: s.a, b: s.kind === 'step' ? s.a : s.b, y, o: 0 } }; rows.set(s.key, r); rowList.push(r); makeRow(r); }
      r.rate = s.rate;
      r.goal = { a: s.a, b: s.b, y, o: 1, shown: s.shown };
    });
    for (const [key, r] of rows) if (!seen.has(key)) r.goal = { ...r.cur, o: 0, shown: r.goal?.shown };
    { const d0 = list.length ? domainOf(list, metricOf(t)) : null; domGoal.lo = d0 ? d0.lo : 0; domGoal.hi = d0 ? d0.hi : 1; }
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
    gl.show(parts.svg, false);
    for (const r of rows.values()) makeRow(r);
    if (!hasDom) { const d0 = list.length ? domainOf(list, k) : null; domCur.lo = d0 ? d0.lo : 0; domCur.hi = d0 ? d0.hi : 1; hasDom = true; }
    paint(); aim();
    gl.place(parts.svg);   // (its looks as this paint left them)
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
      if (fresh) { raw = null; data = null; for (const r of rows.values()) r.els?.g.remove(); rows.clear(); rowList.length = 0; hasDom = false; redraw(); }
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
    dispose() { t = null; ctx = null; parts = null; rows.clear(); rowList.length = 0; gl.dispose(); el.replaceChildren(); },
  };
}
