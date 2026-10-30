// The criteria card (teaching card C2, 25 Oct; review/deck-teaching-ideas/recommendations.md): tool { kind: 'criteria', rows } puts a
// guideline's rule list in the data card, where a phone shows it (the causes line under the words, where these lists sat, is the
// first thing a small screen drops). Up to four rows, each a rule in words:
//   'Child–Pugh C, 10 to 13 points'                     a plain row
//   { text, note }                                      note: the case's own value, in words, at the row's right ("C 10")
//   { text, key, op, value }  or  [text, key, op, value]  a row read from the live model (a tile key: 'hvpg', 'asc', ...):
//                                                       its reading at the right with a quiet tick when met and a dash when not,
//                                                       following the model as the tiles do (a slider, a button, a time-lapse)
//   lit: true                                           sets the row that applies to the case in full-white words
//   met: true | false                                   the case meets the row (its note large, "meets it ✓" under it) or not ("not met")
//   cut: 'C 10–13', '≥20 mmHg'                          the row's cut-off, set large at its left (a step larger on a card 480 px and up)
//   and: 'PLT ≥150K'                                    a second condition of the same rule, small on the cut-off's own line after a "+" ('≤15 kPa + PLT ≥150K'):
//                                                       both values read together (Mohammad 26–27 Oct). Comparisons are always symbols, > < ≥ ≤
//   **...** in text                                     the rule's numbers in bold ('Child–Pugh B, **>7**, ...')
// ticks: false on the tool leaves the live marks off (a classification such as the Sarin classes, where no row is "met").
// V3 (26 Oct, his "V3 build it"; review/guideline-cards-ideas/round8): the rules in the serif, a lead line on how they combine
// (lead), the rule's number in an outlined pill when the slide's notes cite one (rule), a "This case" column set apart by space
// alone (no vertical line, his rule), quiet words on the rows the case does not meet, and a verdict line at the foot (verdict:
// the words up to its first colon in bold).
// Plain rules (no cut-off column; his pick 26 Oct, "C with D's key words", review/look-first-card-ideas): a mark at each row's left,
// a ring for a thing to check and a numeral when the order matters (ordered: true on the tool), the ring filled for the row that
// applies to the case (lit) or that the model meets: outlined is the rule, filled is the case, as the rule pill. Mark the rows' key
// words with **...** (ink in quiet words); a lead that only reads after its list goes in verdict, at the foot.
// The card never changes size with the reading: each reading's slot is as wide as its widest number, the marks cross-fade.
// Zones (27 Oct, his pick G2, review/first-visit-card-ideas/graph): zones: 'first-visit' draws a rule as regions on a graph in place
// of rows (a rule whose cut-offs overlap, such as the EGD's <20 kPa inside the 15–25 gray zone, reads as distinct regions there):
// the zones in the tiles' band colours on a rounded plot the card's full width, a hatched area for a second question laid over them,
// and the axis numbers inside the plot on the lines they mark, white with a dark outline as the FibroScan readings. key: lines under
// the graph, centred ('**Gray:** ...', or { text, swatch: 'hatch' } for the hatched area's line). The plot's height follows its width
// only, so the card never changes size with the case.

import { h, fmt } from './util.js?v=f7abb6eb4f';
import { TILE } from './table-marks.js?v=bca5ebb624';
import { plotPanel } from './plot-look.js?v=5037697da7';

export const CRITERIA_MAX = 4;
/** The graphs a criteria card can draw (zones), in their own units: x and y ranges, the zones, the hatched area and the axis marks. */
export const ZONES = {
  // Baveno VIII 1.15, 1.16, 1.19: CSPH ruled out at ≤15 kPa with PLT ≥150K, ruled in at ≥25 kPa, the gray zone between; with no
  // carvedilol the EGD can be skipped at <20 kPa with PLT ≥150K (the hatched area).
  'first-visit': {
    x: [5, 35], y: [50, 250],
    zones: [
      { rate: 'ok', x: [5, 15], y: [150, 250], name: 'No CSPH', at: [10, 190] },
      { rate: 'mid', x: [15, 25], y: [50, 250], name: 'Gray', at: [20, 112] },
      { rate: 'mid', x: [5, 15], y: [50, 150] },
      { rate: 'hi', x: [25, 35], y: [50, 250], name: 'CSPH', at: [30, 150] },
    ],
    hatch: { x: [5, 20], y: [150, 250] },
    xTicks: [15, 20, 25], xName: 'LSM kPa', yTick: [150, '150K'], yName: 'PLT',
  },
};
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids.filter(Boolean)); return e; };
let zoneN = 0;
/** A key line as written ('**Gray:** ...' or { text, swatch }), read into its words (bold parts) and swatch; null if it has no words. */
export function keyLine(k) {
  const o = typeof k === 'string' ? { text: k } : k && typeof k === 'object' ? k : null;
  const t = str(o?.text);
  return t ? { parts: t.split('**'), swatch: o.swatch === 'hatch' ? 'hatch' : null, plain: t.replace(/\*\*/g, '') } : null;
}
const OPS = { '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b };
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** A row as written ('text', [text, key, op, value] or { text, key?, op?, value?, note?, lit?, met?, cut?, and? }), read into one shape; null if it has no words. */
export function criteriaRow(r) {
  const o = typeof r === 'string' ? { text: r } : Array.isArray(r) ? { text: r[0], key: r[1], op: r[2], value: r[3] } : r && typeof r === 'object' ? { ...r } : null;
  if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
  const live = typeof o.key === 'string' && !!OPS[o.op] && Number.isFinite(+o.value);
  const raw = o.text.trim();
  return { text: raw.replace(/\*\*/g, ''), bold: raw.includes('**') ? raw.split('**') : null, note: str(o.note), lit: !!o.lit, met: typeof o.met === 'boolean' ? o.met : null, cut: str(o.cut), and: str(o.and), key: live ? o.key : null, op: live ? o.op : null, value: live ? +o.value : null };
}
/** The rows a tool shows: its first four rows that have words. */
export const criteriaRows = (t) => (Array.isArray(t?.rows) ? t.rows.map(criteriaRow).filter(Boolean).slice(0, CRITERIA_MAX) : []);
/** Whether a live row is met by a fingerprint (null: no reading). The reading is judged as its tile prints it. */
export function criteriaMet(row, fp) {
  const v = row?.key ? fp?.[row.key] : null;
  if (v == null || !Number.isFinite(v)) return null;
  const T = TILE[row.key] || {}, shown = +(v * (T.x ?? 1)).toFixed(T.d ?? 1);
  return OPS[row.op](shown, row.value);
}
/** A live row's reading as its tile prints it, with the unit: "21.3 mmHg". */
export function criteriaReading(row, fp) {
  const v = row?.key ? fp?.[row.key] : null;
  if (v == null || !Number.isFinite(v)) return '—';
  const T = TILE[row.key] || {};
  return `${fmt(v * (T.x ?? 1), T.d ?? 1)}${T.u ? ` ${T.u}` : ''}`;
}
/** A cut-off in its parts: a comparison sign and a unit in the sans (the serif has no ≥ or ≤), the number in the serif. */
export function cutParts(c) {
  const m = /^([≥≤<>]?)\s*(.*?)(?:\s+(mmHg|kPa|mL|L|g\/dL|mg\/dL|%|months|mo))?$/.exec(c || '');
  return m && m[2] ? { sign: m[1] || '', num: m[2], unit: m[3] || '' } : null;
}
/** The verdict's bold lead (up to and with its first colon) and the rest. */
export function verdictParts(v) {
  const t = str(v);
  if (!t) return null;
  const i = t.indexOf(':');
  return i > 0 ? { bold: t.slice(0, i + 1), rest: t.slice(i + 1).trimStart() } : { bold: '', rest: t };
}
/** Whether a tool has the case column: a row with a note on the case or a live reading. */
export const criteriaHasCase = (t) => criteriaRows(t).some((r) => r.note || r.key);

export function createCriteria() {
  const lead = h('p', { class: 'pzc-lead' });
  const rule = h('span', { class: 'pz-val cut pzc-rule' });
  const top = h('div', { class: 'pzc-top' }, lead, rule);
  const list = h('ul', { class: 'pzc-list', role: 'list' });
  const verdict = h('p', { class: 'pzc-verdict' });
  const plot = h('div', { class: 'pzc-zones' });
  const key = h('div', { class: 'pzc-key' });
  const el = h('div', { class: 'pz-crit' }, top, list, plot, key, verdict);
  let rows = [], parts = [], fig = null, drawnW = 0;
  const id = `pzz${++zoneN}`;
  // The zones graph at the card's width: drawn again only when the width changes.
  function drawZones() {
    const W = Math.round(plot.clientWidth);
    if (!fig || !W || W === drawnW) return;
    drawnW = W;
    const fs = Math.max(12, Math.min(14, (parseFloat(getComputedStyle(el).fontSize) || 14) * 0.93)), sm = 12;
    const ph = Math.round(W * (W < 420 ? 0.46 : 0.34));
    const X = (k) => ((k - fig.x[0]) / (fig.x[1] - fig.x[0])) * W, Y = (p) => ((fig.y[1] - p) / (fig.y[1] - fig.y[0])) * ph;
    const box = (a, extra = {}) => svg('rect', { x: X(a.x[0]), y: Y(a.y[1]), width: X(a.x[1]) - X(a.x[0]), height: Y(a.y[0]) - Y(a.y[1]), ...extra });
    const word = (x, y, t, cls, anchor = 'middle', size = fs) => svg('text', { x, y, class: `pzz-w ${cls || ''}`, 'text-anchor': anchor, 'font-size': size }, t);
    const panel = plotPanel(svg, 0, 0, W, ph, { fill: false });   // (the shared rounded plot, plot-look.js)
    const g = svg('g', { 'clip-path': panel.url }, ...fig.zones.map((z) => box(z, { class: 'pzz-z', 'data-rate': z.rate })), fig.hatch ? box(fig.hatch, { fill: `url(#${id}h)` }) : null);
    const by = ph - 8;
    plot.replaceChildren(svg('svg', { width: W, height: ph, viewBox: `0 0 ${W} ${ph}`, role: 'img', 'aria-label': fig.label || '' },
      svg('defs', {}, panel.clip,
        svg('pattern', { id: `${id}h`, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('rect', { width: 2, height: 7, class: 'pzz-hl' }))),
      g,
      ...fig.zones.filter((z) => z.name).map((z) => word(X(z.at[0]), Y(z.at[1]) + fs * 0.36, z.name, 'n')),
      ...fig.xTicks.map((k) => word(X(k), by, String(k), 'v', 'middle', sm)),
      word(W - 8, by, fig.xName, 'q', 'end', sm),
      word(8, Y(fig.yTick[0]) + 4, fig.yTick[1], 'v', 'start', sm),
      word(8, 8 + sm, fig.yName, 'q', 'start', sm)));
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (fig && el.isConnected) drawZones(); }).observe(plot);
  function swatch() {
    return svg('svg', { class: 'pzc-sw', width: 22, height: 14, viewBox: '0 0 22 14', 'aria-hidden': 'true' },
      svg('defs', {}, svg('clipPath', { id: `${id}s` }, svg('rect', { width: 22, height: 14, rx: 4 }))),
      svg('g', { 'clip-path': `url(#${id}s)` }, svg('rect', { width: 22, height: 14, class: 'pzz-swb' }), ...[-14, -7, 0, 7, 14, 21, 28].map((x) => svg('line', { x1: x, y1: 14, x2: x + 14, y2: 0, class: 'pzz-swl' }))));
  }
  function caseCell(r, ticks) {
    if (r.key) {
      const read = h('span', { class: 'pzc-v' }, '—');
      const mark = ticks ? h('span', { class: 'pzc-m', 'aria-hidden': 'true' }, h('i', { class: 'y' }, 'meets it ✓'), h('i', { class: 'n' }, 'not met')) : null;
      return { end: h('span', { class: 'pzc-end' }, read, mark), read, mark };
    }
    if (!r.note) return { end: h('span', { class: 'pzc-end' }), read: null, mark: null };
    const sub = r.met === true ? h('span', { class: 'pzc-m' }, h('i', { class: 'y' }, 'meets it ✓')) : r.met === false ? h('span', { class: 'pzc-m' }, h('i', { class: 'n' }, 'not met')) : null;
    return { end: h('span', { class: 'pzc-end pzc-note' }, h('span', { class: 'pzc-v' }, r.note), sub), read: null, mark: null };
  }
  function cutCell(r) {
    const c = cutParts(r.cut);
    if (!c) return h('span', { class: 'pzc-c', 'aria-hidden': 'true' });
    // (Hidden from a screen reader when the row's words say the same; a second condition is only here, so it is read.)
    return h('span', { class: 'pzc-c', ...(r.and ? {} : { 'aria-hidden': 'true' }) }, c.sign ? h('span', { class: 'pzc-s' }, c.sign) : null, c.num, c.unit ? h('span', { class: 'pzc-u' }, c.unit) : null, r.and ? h('span', { class: 'pzc-and' }, `+ ${r.and}`) : null);
  }
  function build(t) {
    rows = criteriaRows(t);
    const ticks = t?.ticks !== false, hasCase = rows.some((r) => r.note || r.key), hasCut = rows.some((r) => r.cut);
    el.classList.toggle('no-ticks', !ticks);
    el.classList.toggle('has-case', hasCase);
    el.classList.toggle('has-cut', hasCut);
    el.classList.toggle('has-lit', rows.some((r) => r.lit));
    el.classList.toggle('ordered', t?.ordered === true);
    lead.textContent = str(t?.lead) || '';
    rule.textContent = str(t?.rule) || '';
    top.hidden = !lead.textContent && !rule.textContent;
    lead.hidden = !lead.textContent; rule.hidden = !rule.textContent;
    fig = ZONES[t?.zones] ? { ...ZONES[t.zones], label: str(t?.title) || '' } : null; drawnW = 0;
    el.classList.toggle('has-zones', !!fig);
    plot.hidden = !fig;
    if (!fig) plot.replaceChildren(); else drawZones();
    const keys = (Array.isArray(t?.key) ? t.key : []).map(keyLine).filter(Boolean);
    key.replaceChildren(...keys.map((k) => h('p', { class: 'pzc-kl' }, k.swatch ? swatch() : null, h('span', {}, ...k.parts.map((x, i) => (i % 2 ? h('b', {}, x) : x)).filter((x) => x !== '')))));
    key.hidden = !keys.length;
    const v = verdictParts(t?.verdict);
    verdict.replaceChildren(...(v ? [v.bold ? h('b', {}, v.bold) : null, v.bold ? ' ' : null, v.rest].filter(Boolean) : []));
    verdict.hidden = !v;
    parts = rows.map((r) => {
      const { end, read, mark } = caseCell(r, ticks);
      const state = r.met === true ? { 'data-met': 'yes' } : r.met === false ? { 'data-met': 'no' } : {};
      const li = h('li', { class: r.key ? 'pzc-row pzc-live' : 'pzc-row', ...(r.lit ? { 'data-lit': '' } : {}), ...(r.note && !r.lit && r.met == null ? { 'data-quiet': '' } : {}), ...state }, cutCell(r), h('span', { class: 'pzc-t' }, r.bold ? r.bold.map((t, i) => (i % 2 ? h('b', {}, t) : t)).filter((t) => t !== '') : r.text), end);
      return { r, li, read, mark };
    });
    const headRow = hasCase ? [h('li', { class: 'pzc-row pzc-hrow', 'aria-hidden': 'true' }, h('span', { class: 'pzc-c' }), h('span', { class: 'pzc-t' }), h('span', { class: 'pzc-end' }, 'This case'))] : [];
    list.replaceChildren(...headRow, ...parts.map((p) => p.li));
    list.hidden = !rows.length;
  }
  function pin(fp) {
    for (const p of parts) {
      if (!p.r.key) continue;
      const t = criteriaReading(p.r, fp), met = criteriaMet(p.r, fp);
      if (p.read.textContent !== t) p.read.textContent = t;
      const m = met == null ? 'none' : met ? 'yes' : 'no';
      if (p.li.dataset.met !== m) p.li.dataset.met = m;
      p.li.setAttribute('aria-label', `${p.r.text}: ${t}, ${met == null ? 'no reading' : met ? 'met' : 'not met'}`);
    }
  }
  return {
    el,
    configure(t, ctx) { build(t); if (ctx?.fp) pin(ctx.fp); },
    pin(fp) { if (fp) pin(fp); },
    clear() {},
    dispose() {},
  };
}
