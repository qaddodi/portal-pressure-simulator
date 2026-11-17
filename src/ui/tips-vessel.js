// The TIPS and DIPS vessel card's body (17 Nov 2026, Mohammad approved the mock tips-cards-elegant.html: "Do it exactly like this please"): the stent drawn to
// scale (tips-figure.js, the stent alone, coloured by the scanner's velocity), one line of numbers (the PPG, the flow, the fastest gate), and the three rows that
// edit it (stent-editor.js). No pressure bar and no tiles: the card's own name row says what it is and its state, the line says the three numbers that matter.
// The rows' panel grows over the rows and the card's actions under them (Doppler, Dye, Remove), never over the stent, which shows each change as it is made.
// The numbers follow the store's frame (the figure glides a jump); a word is written only when the number it prints changes.

import { h, fmt } from './util.js';
import { store, hiddenNow } from './store.js';
import { createTipsFigure } from './tips-figure.js';
import { createStentEditor } from './stent-editor.js';

/** The line's three readings: name (shown only where the unit alone is not enough), unit, decimals, and the value from a frame's metrics and the stent's record. */
export const VESSEL_KEYS = [
  { id: 'ppg', k: 'PPG', u: 'mmHg', d: 1, hide: 'pv', v: (m) => m.ppg },
  { id: 'flow', k: '', u: 'L/min', d: 1, hide: 'model', v: (m, st) => st?.flow ?? null },
  { id: 'peak', k: '', u: 'cm/s', d: 0, hide: 'model', v: (m, st) => st?.vPeak ?? null, aria: 'Peak velocity' },
];

/** createTipsVessel({ id, onOpen }) → { el, destroy() }: the vessel card's panel for the TIPS or the DIPS. onOpen(id): the folded line's way into Tests › IR › TIPS. */
export function createTipsVessel({ id = 'TIPS', onOpen = null } = {}) {
  const fig = createTipsFigure({ id, labels: false, chart: false });
  const keys = VESSEL_KEYS.map((t) => { const b = h('b', {}, '—'); const e = h('span', { class: 'ir-kv', 'data-k': t.id }, t.k ? h('em', {}, t.k) : null, b, h('u', {}, t.u)); return { t, e, b, txt: '' }; });
  const line = h('div', { class: 'ir-keys tv-keys' }, keys.map((x) => x.e));
  const zone = h('div', { class: 'se-zone tv-zone' });
  const editor = createStentEditor({ id, onOpen, zone });
  zone.append(editor.el, editor.panel);
  const el = h('div', { class: 'tv' }, fig.el, line, zone);
  function paint(f) {
    if (!f?.metrics) return;
    fig.update(f);
    const m = f.metrics, st = id === 'DIPS' ? m.dips : m.tips, hidden = hiddenNow();
    for (const x of keys) {
      const t = x.t, raw = st || t.id === 'ppg' ? t.v(m, st) : null;
      const v = raw == null || hidden?.has(t.hide) ? null : raw;
      const txt = v == null || !Number.isFinite(v) ? '—' : fmt(v, t.d);
      if (txt !== x.txt) { x.txt = txt; x.b.textContent = txt; x.e.setAttribute('aria-label', `${t.aria || t.k || t.u}: ${v == null ? 'not measured' : `${txt} ${t.u}`}`); }
    }
  }
  const off = store.on('frame', () => paint(store.get().frame));
  paint(store.get().frame);
  return {
    el,
    update(f) { paint(f); },
    destroy() { off?.(); fig.dispose(); editor.destroy(); },
  };
}
