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
//   cut: 'C 10–13', '20 mmHg'                           the row's cut-off, set large at its left (a step larger on a card 480 px and up)
//   **...** in text                                     the rule's numbers in bold ('Child–Pugh B, **over 7**, ...')
// ticks: false on the tool leaves the live marks off (a classification such as the Sarin classes, where no row is "met").
// V3 (26 Oct, his "V3 build it"; review/guideline-cards-ideas/round8): the rules in the serif, a lead line on how they combine
// (lead), the rule's number in an outlined pill when the slide's notes cite one (rule), a "This case" column set apart by space
// alone (no vertical line, his rule), quiet words on the rows the case does not meet, and a verdict line at the foot (verdict:
// the words up to its first colon in bold).
// The card never changes size with the reading: each reading's slot is as wide as its widest number, the marks cross-fade.

import { h, fmt } from './util.js?v=defb4c4059';
import { TILE } from './table-marks.js?v=b717587a61';

export const CRITERIA_MAX = 4;
const OPS = { '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b };
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** A row as written ('text', [text, key, op, value] or { text, key?, op?, value?, note?, lit?, met?, cut? }), read into one shape; null if it has no words. */
export function criteriaRow(r) {
  const o = typeof r === 'string' ? { text: r } : Array.isArray(r) ? { text: r[0], key: r[1], op: r[2], value: r[3] } : r && typeof r === 'object' ? { ...r } : null;
  if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
  const live = typeof o.key === 'string' && !!OPS[o.op] && Number.isFinite(+o.value);
  const raw = o.text.trim();
  return { text: raw.replace(/\*\*/g, ''), bold: raw.includes('**') ? raw.split('**') : null, note: str(o.note), lit: !!o.lit, met: typeof o.met === 'boolean' ? o.met : null, cut: str(o.cut), key: live ? o.key : null, op: live ? o.op : null, value: live ? +o.value : null };
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
  const el = h('div', { class: 'pz-crit' }, top, list, verdict);
  let rows = [], parts = [];
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
    return h('span', { class: 'pzc-c', 'aria-hidden': 'true' }, c.sign ? h('span', { class: 'pzc-s' }, c.sign) : null, c.num, c.unit ? h('span', { class: 'pzc-u' }, c.unit) : null);
  }
  function build(t) {
    rows = criteriaRows(t);
    const ticks = t?.ticks !== false, hasCase = rows.some((r) => r.note || r.key), hasCut = rows.some((r) => r.cut);
    el.classList.toggle('no-ticks', !ticks);
    el.classList.toggle('has-case', hasCase);
    el.classList.toggle('has-cut', hasCut);
    lead.textContent = str(t?.lead) || '';
    rule.textContent = str(t?.rule) || '';
    top.hidden = !lead.textContent && !rule.textContent;
    lead.hidden = !lead.textContent; rule.hidden = !rule.textContent;
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
