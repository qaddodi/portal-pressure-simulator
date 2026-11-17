// The Compare view of Tests › IR › TIPS (17 Nov 2026; plan /mnt/project-files/tips-geometry/tips-test-card-plan.md §3.3, push C): what the stent changed since the moment the
// person pinned with "Compare from here" (the app's own pin, store.compareSnap, one for the whole app: this view makes no second one). A table of Then | Now | Change for the
// stent's own readings, in the compare table's own look (.cmp-table: a rise in red, a fall in the accent, the triangle beside it). With nothing pinned the table is
// there with dashes and one line says how to pin, so pinning fills it in and nothing shifts.
// The numbers are the engine's one calculation, then (compareSnap.metrics) and now (the live frame), read the same way as the tiles: metrics.ppg, metrics.tips and
// metrics.dips (engine.stentState). A stent that was not there then shows a dash for then and for the change. After a TIPS the pressure gradient is the PPG, never an HVPG.
// Not built yet: the earlier stent's outline as a dashed ghost over the present lumen (the stent cards take no ghost yet).

import { h, fmt } from './util.js';
import { store } from './store.js';

export const NOTHING_PINNED = 'Pin a moment with Compare from here on the timeline to see what the stent changed.';
const DASH = '—';
// name, unit, decimals, the value from a metrics record (the stent's state, or null with no stent).
const ROWS = [
  { k: 'ppg', n: 'PPG', u: 'mmHg', d: 1, v: (m) => m?.ppg },
  { k: 'flow', n: 'Stent flow', u: 'L/min', d: 1, v: (m, st) => st?.flow },
  { k: 'dp', n: 'Across stent', u: 'mmHg', d: 1, v: (m, st) => st?.dp },
  { k: 'open', n: 'Open diameter', u: 'mm', d: 1, v: (m, st) => st?.d },
  { k: 'end', n: 'End narrowing', u: '%', d: 0, v: (m, st) => (st ? 100 * (st.end ?? 0) : null) },
  { k: 'red', n: 'Waist narrowing', u: '%', d: 0, v: (m, st) => (st ? 100 * (st.red ?? 0) : null) },
  { k: 'lumen', n: 'Narrowest lumen', u: 'mm', d: 1, v: (m, st) => st?.dWaist },
  { k: 'waist', n: 'Waist length', u: 'cm', d: 1, v: (m, st) => (st?.red > 0.0005 ? st.geom?.waist : null) },   // (a stent with no waist has no waist length: a dash, not a length)
  { k: 'taper', n: 'Taper, each end', u: 'cm', d: 1, v: (m, st) => (st?.red > 0.0005 ? st.geom?.trans : null) },
  { k: 'peak', n: 'Stent peak velocity', u: 'cm/s', d: 0, v: (m, st) => st?.vPeak },
];
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** The change between two readings as the compare table prints it: its class, the mark and the words. */
export function changeOf(a, b, d) {
  if (a == null || b == null) return { cls: 'd same', tri: '', txt: DASH };
  const dd = b - a, same = Math.abs(dd) < Math.pow(10, -d) * 0.5;
  return same ? { cls: 'd same', tri: '', txt: DASH } : { cls: 'd ' + (dd > 0 ? 'up' : 'down'), tri: dd > 0 ? '▲' : '▼', txt: `${dd > 0 ? '+' : '−'}${fmt(Math.abs(dd), d)}` };
}

/** Returns { el, update(frame, which) }: which is 'TIPS' or 'DIPS', the stent the table reads. */
export function createIrCompare() {
  const cells = ROWS.map((r) => ({ r, a: h('td', { class: 'a' }, DASH), b: h('td', { class: 'b' }, DASH), d: h('td', { class: 'd same' }, DASH), tri: h('span', { class: 'tri', 'aria-hidden': 'true' }), txt: document.createTextNode(DASH), name: h('span', { class: 'cmp-n' }, r.n) }));
  const thA = h('th', {}, 'Then'), thB = h('th', {}, 'Now');
  const table = h('table', { class: 'cmp-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Reading'), thA, thB, h('th', {}, 'Change'))),
    h('tbody', {}, cells.map((c) => h('tr', {}, h('td', {}, c.name, h('span', { class: 'unit' }, c.r.u)), c.a, c.b, c.d))));
  for (const c of cells) c.d.replaceChildren(c.txt);
  const note = h('p', { class: 'ctl-sub ir-note' }, NOTHING_PINNED);
  const el = h('div', { class: 'ir-compare' }, table, note);
  let lastWhich = '', namesKey = '', noteText = NOTHING_PINNED;
  function update(f, which = 'TIPS') {
    const st0 = store.get(), snap = st0.compareSnap, m = f?.metrics;
    if (!m) return;
    const k = which === 'DIPS' ? 'dips' : 'tips';
    const names = snap ? [snap.names?.[0] || 'Then', snap.names?.[1] || 'Now'] : ['Then', 'Now'];
    const nk = names.join('|');
    if (nk !== namesKey) { namesKey = nk; thA.textContent = names[0]; thB.textContent = names[1]; }
    const text = snap ? `Compared with ${snap.when}. A stent that was not there then shows a dash.` : NOTHING_PINNED;
    if (text !== noteText) { noteText = text; note.textContent = text; }
    if (which !== lastWhich) {
      lastWhich = which;
      cells[1].name.textContent = which === 'DIPS' ? 'DIPS flow' : 'Stent flow';
    }
    const A = snap?.metrics;
    for (const c of cells) {
      const a = A ? num(c.r.v(A, A[k])) : null, b = num(c.r.v(m, m[k]));
      const sa = a == null ? DASH : fmt(a, c.r.d), sb = b == null ? DASH : fmt(b, c.r.d), ch = changeOf(a, b, c.r.d);
      if (c.a.textContent !== sa) c.a.textContent = sa;
      if (c.b.textContent !== sb) c.b.textContent = sb;
      if (c.d.className !== ch.cls) c.d.className = ch.cls;
      if (c.tri.textContent !== ch.tri) c.tri.textContent = ch.tri;
      if (c.txt.data !== ch.txt) c.txt.data = ch.txt;
      const want = ch.tri ? [c.tri, c.txt] : [c.txt];
      if (c.d.childNodes.length !== want.length || want.some((n, j) => c.d.childNodes[j] !== n)) c.d.replaceChildren(...want);
    }
  }
  return { el, update };
}
