// The criteria card (teaching card C2, 25 Oct; review/deck-teaching-ideas/recommendations.md): tool { kind: 'criteria', rows } puts a
// guideline's rule list in the data card, where a phone shows it (the causes line under the words, where these lists sat, is the
// first thing a small screen drops). Up to four rows, each a rule in words:
//   'Child–Pugh C, 10 to 13 points'                     a plain row
//   { text, note }                                      note: the case's own value, in words, at the row's right ("C 10")
//   { text, key, op, value }  or  [text, key, op, value]  a row read from the live model (a tile key: 'hvpg', 'asc', ...):
//                                                       its reading at the right with a quiet tick when met and a dash when not,
//                                                       following the model as the tiles do (a slider, a button, a time-lapse)
//   lit: true                                           sets the row that applies to the case in full-white words
// ticks: false on the tool leaves the marks off (a classification such as the Sarin classes, where no row is "met").
// The card never changes size with the reading: each reading's slot is as wide as its widest number, the marks cross-fade.

import { h, fmt } from './util.js?v=1176d4c92c';
import { TILE } from './table-marks.js?v=b717587a61';

export const CRITERIA_MAX = 4;
const OPS = { '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b };
/** A row as written ('text', [text, key, op, value] or { text, key?, op?, value?, note?, lit? }), read into one shape; null if it has no words. */
export function criteriaRow(r) {
  const o = typeof r === 'string' ? { text: r } : Array.isArray(r) ? { text: r[0], key: r[1], op: r[2], value: r[3] } : r && typeof r === 'object' ? { ...r } : null;
  if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
  const live = typeof o.key === 'string' && !!OPS[o.op] && Number.isFinite(+o.value);
  return { text: o.text.trim(), note: typeof o.note === 'string' && o.note.trim() ? o.note.trim() : null, lit: !!o.lit, key: live ? o.key : null, op: live ? o.op : null, value: live ? +o.value : null };
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

export function createCriteria() {
  const list = h('ul', { class: 'pzc-list', role: 'list' });
  const el = h('div', { class: 'pz-crit' }, list);
  let rows = [], parts = [];
  function build(t) {
    rows = criteriaRows(t);
    const ticks = t?.ticks !== false;
    el.classList.toggle('no-ticks', !ticks);
    parts = rows.map((r) => {
      const read = r.key ? h('span', { class: 'pzc-v' }, '—') : null;
      const mark = r.key && ticks ? h('span', { class: 'pzc-m', 'aria-hidden': 'true' }, h('i', { class: 'y' }, '✓'), h('i', { class: 'n' }, '–')) : null;
      const end = r.key ? h('span', { class: 'pzc-end' }, read, mark) : r.note ? h('span', { class: 'pzc-end pzc-note' }, r.note) : null;
      const li = h('li', { class: 'pzc-row', ...(r.lit ? { 'data-lit': '' } : {}) }, h('span', { class: 'pzc-t' }, r.text), end);
      return { r, li, read, mark };
    });
    list.replaceChildren(...parts.map((p) => p.li));
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
