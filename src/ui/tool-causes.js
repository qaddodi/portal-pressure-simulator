// Deck visuals V5: "What raises the pressure" bars in the data card (package C, review/deck-visuals-recs.md §9).
//
//   tool: { kind: 'causes', metric: 'ppg' }   ('ppg', 'hvpg' or 'pv')
//
// One flat bar per cause, its length the mmHg it adds to the reading (or, left of the line, takes from it), from the Why?
// panel's leave-one-out code (engine/explain.js) run on the slide's own state on the presenter's calculation worker (the
// slide's step asks for it: ext-model.js). At most five causes, the largest; whatever they leave of the rise from healthy
// (the causes overlap, and the smaller ones) is the "Interaction and other" bar, so the bars always add up to the rise.
// Each bar takes its mechanism's colour (resistance, inflow, the heart, shunts (collaterals among them), drugs), named in a key under
// them. While a compare button or what-if slider moves the live model, the causes are worked out again on the live state and
// the bars ease to their new lengths. These are the model's own shares: a deck line that quotes them needs a source.

import { TILE } from './table-marks.js?v=810c0a1575';
import { DRUGS } from '../engine/scenario.js?v=1ee7733788';
import { frameFor } from './frame.js?v=67ca200c87';
const nextFrame = frameFor('tool-causes');

const CS_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
export const METRICS = ['ppg', 'hvpg', 'pv'];
export const metricOf = (t) => (METRICS.includes(t?.metric) ? t.metric : 'ppg');
export const MOST = 5;

// The mechanisms, in the order their bars are drawn, each with its colour.
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
// (A bar's words: the cause without the size it already shows as a length.)
export const shortLabel = (label) => label.replace(/^(Extra blood volume|Blood loss) [+\d].*$/, '$1').replace(/^Chronic splanchnic vasodilation$/, 'Splanchnic vasodilation')
  .replace(/^Serum albumin .*$/, 'Low serum albumin').replace(/^Right-heart contractility$/, 'Weak right heart');
export const OTHER = 'Interaction and other';

/** The bars from an explain result: { bars: [{ key, label, group, delta }], other, total, current, base, unit, digits }.
 *  At most `most` causes (the largest), drawn by mechanism; the bars and other always sum to the total. */
export function causeBars(r, most = MOST) {
  if (!r || !Number.isFinite(r.total)) return null;
  const min = 0.5 * Math.pow(10, -(r.digits ?? 1));
  const cs = (r.contributions || []).filter((c) => Number.isFinite(c.delta) && Math.abs(c.delta) >= min).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, most);
  const order = (g) => { const i = GROUPS.findIndex(([k]) => k === g); return i < 0 ? GROUPS.length : i; };
  const bars = cs.map((c) => ({ key: c.label, label: shortLabel(c.label), group: groupOf(c.label), delta: c.delta }))
    .sort((a, b) => order(a.group) - order(b.group) || Math.abs(b.delta) - Math.abs(a.delta));
  const other = r.total - bars.reduce((s, b) => s + b.delta, 0);
  // (The numbers printed: each bar rounded, and the other bar whatever is left of the rounded rise, so the printed numbers
  // add up exactly to the printed rise. Counted in the last digit's units, free of float error.)
  const u = Math.pow(10, r.digits ?? 1), n = (v) => Math.round(v * u);
  for (const b of bars) b.shown = n(b.delta) / u;
  const otherShown = (n(r.total) - bars.reduce((s, b) => s + n(b.delta), 0)) / u;
  return { bars, other, otherShown, total: r.total, current: r.current, base: r.base, unit: r.unit || 'mmHg', digits: r.digits ?? 1 };
}

const fmt = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const signed = (v, d) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? fmt(0, d) : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(d));
const cw = (t, f, b) => String(t).length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)
/** A label in at most two lines no wider than w (type f): split at the space nearest its middle when it does not fit. */
export function wrapLabel(label, w, f) {
  if (cw(label, f) <= w) return [label];
  const sp = [...label.matchAll(/ /g)].map((m) => m.index);
  if (!sp.length) return [label];
  const mid = label.length / 2, i = sp.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [label.slice(0, i), label.slice(i + 1)];
}
/** The key's items laid out in rows no wider than w: [{ k, name, c, x, row }] and the row count. */
export function keyLayout(w, f) {
  let x = 0, row = 0;
  const items = GROUPS.map(([k, name, c]) => {
    const iw = 0.9 * f + 0.4 * f + cw(name, f);
    if (x > 0 && x + iw > w) { x = 0; row++; }
    const it = { k, name, c, x, row }; x += iw + 1.1 * f;
    return it;
  });
  return { items, rows: row + 1 };
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
  let t = null, ctx = null, G = null, parts = null, lastSz = '', raf = 0, data = null, gen = 0, busy = false, again = null, mode = 'own';
  const rows = new Map();   // key → { els, cur: { v, y, o }, goal, label, group }
  let span = null, spanGoal = { neg: 0, pos: 1 };   // (the scale: how far the bars may reach left and right of the line)

  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? CS_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  // The geometry: the head row, MOST + 1 row slots (fixed: the chart never changes height), the key under them.
  function geo(w, h, f) {
    const key = keyLayout(w, f), keyH = key.rows * 1.45 * f;
    // (The rows share the height between them, at most 2.8 lines of type apart: fewer causes stand further apart, so a cause's
    // words that take two lines on a narrow card keep clear of the next.)
    const n = Math.max(3, (data?.bars.length ?? MOST) + 1);
    const T = 2.1 * f, B = h - keyH - 0.6 * f, pitch = Math.min(2.8 * f, Math.max(1.2 * f, (B - T) / n));   // (never past the key)
    const labs = [...rows.values()].map((r) => r.label).concat(OTHER, (data?.bars || []).map((b) => b.label));
    // (The words take at most what leaves the bars three tenths of a narrow card (beside a tile) and a quarter of a wider one, so a
    // small bar still shows.)
    const Vw = cw('+00.0', f, 1) + 4;
    const Lw = Math.min(0.56 * w, w - Vw - 1.2 * f - (w < 300 ? 0.3 : 0.25) * w, Math.max(...labs.map((l) => Math.max(...wrapLabel(l, 0.56 * w, f).map((x) => cw(x, f))))));
    return { w, h, f, key, keyH, T, B, pitch, Lw, Vw, bx0: Lw + 0.8 * f, bx1: w - Vw - 0.4 * f };
  }
  function makeRow(r) {
    const { f, Lw } = G, lines = wrapLabel(r.label, Lw, f);
    const label = sv('text', { class: 'pcs-l', x: 0, 'text-anchor': 'start' }, lines.map((l, j) => sv('tspan', { x: 0, dy: j ? `${1.15}em` : null }, l)));
    const bar = sv('rect', { class: 'pcs-b', height: Math.max(6, 0.95 * f), rx: 2, style: `fill: ${colourOf(r.group)}` });
    const val = sv('text', { class: 'pcs-v', x: G.w, 'text-anchor': 'end' });
    const g = sv('g', { class: 'pcs-row' + (r.key === OTHER ? ' other' : '') }, label, bar, val);
    r.els = { g, label, bar, val, lines: lines.length };
    parts.rowsG.append(g);
  }
  function build() {
    const { w, f, T, B, key, h, keyH } = G;
    const head = sv('text', { class: 'pcs-h', x: 0, y: 1.05 * f }, 'Rise from healthy');
    const total = sv('text', { class: 'pcs-t', x: w, y: 1.05 * f, 'text-anchor': 'end' });
    const zero = sv('line', { class: 'pcs-z', y1: T - 0.2 * f, y2: B });
    const rowsG = sv('g', {});
    const keyG = sv('g', { class: 'pcs-key', transform: `translate(0 ${(h - keyH + 0.9 * f).toFixed(1)})` },
      key.items.map((it) => sv('g', { transform: `translate(${it.x.toFixed(1)} ${(it.row * 1.45 * f).toFixed(1)})` },
        sv('rect', { x: 0, y: -0.7 * f, width: 0.9 * f, height: 0.9 * f, rx: 2, style: `fill: var(${it.c})` }),
        sv('text', { x: 1.3 * f, y: 0.05 * f }, it.name))));
    const svg = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', style: `font-size: ${f.toFixed(2)}px` }, head, total, zero, rowsG, keyG);
    return { svg, total, zero, rowsG };
  }
  function paint() {
    if (!parts || !span) return;
    const { f, bx0, bx1 } = G, k = (bx1 - bx0) / Math.max(1e-6, span.neg + span.pos), x0 = bx0 + span.neg * k;
    parts.zero.setAttribute('x1', x0.toFixed(1)); parts.zero.setAttribute('x2', x0.toFixed(1));
    for (const r of rows.values()) {
      const { label, bar, val, g, lines } = r.els, { v, y, o } = r.cur, bh = +bar.getAttribute('height');
      g.style.opacity = o.toFixed(3);
      label.setAttribute('y', (y + 0.35 * f - (lines - 1) * 0.55 * f).toFixed(1));
      for (const ts of label.children) ts.setAttribute('x', 0);
      bar.setAttribute('x', (v < 0 ? x0 + v * k : x0).toFixed(1)); bar.setAttribute('width', (r.goal?.s ? Math.max(3, Math.abs(v) * k) : Math.max(0, Math.abs(v) * k)).toFixed(1));   // (a printed bar shows at least a stub)
      bar.setAttribute('y', (y - bh / 2).toFixed(1));
      val.setAttribute('y', (y + 0.35 * f).toFixed(1));
      const txt = signed(r.goal && v === r.goal.v && r.goal.s != null ? r.goal.s : v, data?.digits ?? 1);   // (settled: the printed share)
      if (val.textContent !== txt) val.textContent = txt;
    }
  }
  // Every bar glides after its goal: length, place and fade (never a jump).
  function tick() {
    raf = 0;
    const kk = reduceMQ.matches ? 1 : 0.18, mix = (a, b) => a + (b - a) * kk;
    span = span ? { neg: mix(span.neg, spanGoal.neg), pos: mix(span.pos, spanGoal.pos) } : { ...spanGoal };
    let moving = Math.abs(span.neg - spanGoal.neg) + Math.abs(span.pos - spanGoal.pos) > 1e-3;
    if (!moving) span = { ...spanGoal };
    for (const [key, r] of rows) {
      const c = r.cur, g = r.goal;
      const n = { v: mix(c.v, g.v), y: mix(c.y, g.y), o: mix(c.o, g.o) };
      if (Math.abs(n.v - g.v) < 0.005 && Math.abs(n.y - g.y) < 0.2 && Math.abs(n.o - g.o) < 0.01) Object.assign(n, g); else moving = true;
      r.cur = n;
      if (g.o === 0 && n.o === 0) { r.els?.g.remove(); rows.delete(key); }
    }
    paint();
    if (moving) raf = nextFrame(tick);
  }
  // The rows' goals from data: each bar in its slot, the other bar last; rows no longer named fade out where they stand.
  function aim() {
    if (!G || !parts) return;
    const list = data ? [...data.bars, { key: OTHER, label: OTHER, group: null, delta: data.other, shown: data.otherShown }] : [];
    const seen = new Set();
    list.forEach((b, i) => {
      seen.add(b.key);
      const y = G.T + G.pitch * (i + 0.5);
      let r = rows.get(b.key);
      if (!r) { r = { key: b.key, label: b.label, group: b.group, cur: { v: 0, y, o: 0 } }; rows.set(b.key, r); makeRow(r); }
      r.goal = { v: b.delta, y, o: 1, s: b.shown };
    });
    for (const [key, r] of rows) if (!seen.has(key)) r.goal = { ...r.cur, v: r.cur.v, o: 0 };
    const vs = list.map((b) => b.delta);
    spanGoal = { neg: Math.max(0, -Math.min(0, ...vs)), pos: Math.max(0, ...vs, 0) };
    if (spanGoal.neg + spanGoal.pos < 1) spanGoal.pos += 1 - (spanGoal.neg + spanGoal.pos);
    if (parts.total) parts.total.textContent = data ? `${signed(data.total, data.digits)} ${data.unit}` : '';
    const m = TILE[metricOf(t)]?.t || 'The reading';
    parts.svg.setAttribute('aria-label', data ? `${m}: ${fmt(data.current, data.digits)} ${data.unit}, ${signed(data.total, data.digits)} from healthy. `
      + list.map((b) => `${b.label} ${signed(b.shown, data.digits)}`).join(', ') : `${m}: what raises it, being worked out`);
    parts.svg.dataset.bars = String(data ? data.bars.length : 0);   // (the browser checks read it)
    if (!raf) raf = nextFrame(tick);
  }
  function redraw() {
    if (!t) return;
    const [w, hh, f] = size(); lastSz = [w, hh, f].map(Math.round).join('x');
    G = geo(w, hh, f);
    parts = build();
    el.replaceChildren(parts.svg);
    for (const r of rows.values()) makeRow(r);
    paint(); aim();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (!t || !parts || !el.isConnected) return;
    const sz = size().map(Math.round).join('x'); if (sz === lastSz) return;
    redraw();
  }).observe(el);

  const setData = (r) => { data = causeBars(r); redraw(); };   // (laid out again: a new cause's words may need a wider column)
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
      if (fresh) { data = null; for (const r of rows.values()) r.els?.g.remove(); rows.clear(); span = null; redraw(); }
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
