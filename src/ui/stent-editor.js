// The stent editor of Tests › IR › TIPS (17 Nov 2026, Mohammad: "editing the stent easier even from the test card should be able to edit. Stenosis the
// distal or proximal end should be a different option than making a waist with some length"; then "we should be able to edit the TIPS right from this
// view please, no need to open the card", "elegantly"). The same controls as the stent's vessel card, from the one list both read (actions.js
// stentControls), in two slim rows so the view fits the card with no scrolling, one narrowing a row:
//   Diameter 10.0 mm   Stenosis 6.0 mm · 40%   End      [Proximal | Distal]
//   Waist 6.0 mm · 40%  Length 2.0 cm           Ends     [Abrupt | Tapered]
// Each cell is its name and value over its slider (or its choice); the columns line up across the two rows. In a narrow card (a phone) the value keeps
// its millimetres and drops the percentage. It fades in with the view, and its cells fade in when the chip changes stent; nothing pops.
// A drag sends the newest value once per frame and the last at once when the hand lets go (as the vessel card does: card.js); a change made anywhere
// else (the vessel card, a slide, undo) is followed between frames. A control that does nothing now (the waist's length and ends with no waist, the
// stenosis's end with no stenosis) dims where it stands, never hidden, so nothing moves.

import { h, paintRange } from './util.js';
import { store, updateParams } from './store.js';
import { frameFor } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { stentControls } from './actions.js';

const nextFrame = frameFor('stent-editor');
/** The cells, two rows of three, by the controls' ids in actions.js stentControls (row 1 the stent and its end stenosis, row 2 its mid waist). */
export const EDITOR_CELLS = [['diameter', 'narrow', 'site'], ['waistD', 'waist', 'ends']];
/** A cell's short name where the card's is longer (the row says whose length it is); the control's own label stays its accessible name. */
const SHORT = { waist: 'Length' };

/** A value as the editor shows it: the millimetres first, then the rest (a percentage), which a narrow card leaves out ("40% · 6.0 mm" → ["6.0 mm", "40%"]). */
export function splitValue(t) {
  const i = t.indexOf(' · ');
  if (i < 0) return [t, ''];
  const a = t.slice(0, i), b = t.slice(i + 3);
  return b.endsWith('mm') && !a.endsWith('mm') ? [b, a] : [a, b];
}

/** createStentEditor({ id }): { el, update(frame), setStent(id), destroy() }. `id` is the stent ('TIPS', 'DIPS'). */
export function createStentEditor({ id = 'TIPS' } = {}) {
  const el = h('div', { class: 'stent-editor', role: 'group', 'aria-label': 'Edit stent' });
  let sid = null, rows = [], off = null;

  function sliderRow(v) {
    const input = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, 'aria-label': v.label, 'data-def': v.def ?? null });
    const val = h('span', { class: 'se-val' }), sub = h('span', { class: 'se-sub' });
    const row = h('div', { class: 'se-cell', 'data-ctl': v.id }, h('div', { class: 'se-top' }, h('span', { class: 'se-name' }, SHORT[v.id] || v.label), val, sub), h('div', { class: 'range-wrap se-range' }, input));
    const cells = [row];
    const r = { v, row, cells, input, val, kind: 1, shown: NaN, pend: false, x: 0, fresh: true, hist: false, raf: 0 };
    const paint = (x) => { r.shown = x; const t = v.format(x), [main, rest] = splitValue(t); val.textContent = main; sub.textContent = rest; attrSoon(input, 'aria-valuetext', t); paintRange(input, (x - v.min) / (v.max - v.min)); };
    r.paint = paint;
    const send = () => {
      if (!r.pend) return;
      r.pend = false;
      const x = r.x;
      updateParams((p) => { v.set(p, x); return p; }, { history: r.hist, label: v.hist || v.label });
    };
    const flush = () => { r.raf = 0; if (r.pend) runSoon(send); };
    input.addEventListener('pointerdown', () => { r.fresh = true; });
    input.addEventListener('keydown', () => { r.fresh = true; });
    input.addEventListener('input', () => {
      const x = parseFloat(input.value);
      paint(x);
      if (!r.pend) { r.pend = true; r.hist = r.fresh; }
      r.fresh = false; r.x = x;
      if (!r.raf) r.raf = nextFrame(flush);
    });
    input.addEventListener('change', () => { r.raf = 0; if (r.pend) runSoon(send); });
    return r;
  }
  function segRow(v) {
    const btns = v.options.map((o) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false' }, o[1]);
      b.addEventListener('click', () => v.set(o[0]));
      b._val = o[0];
      return b;
    });
    const row = h('div', { class: 'se-cell se-choice', 'data-ctl': v.id }, h('div', { class: 'se-top' }, h('span', { class: 'se-name' }, v.label)), h('div', { class: 'seg full ac-seg small se-seg', role: 'group', 'aria-label': v.label }, btns));
    return { v, row, cells: [row], btns, kind: 2, shown: null };
  }

  function build(newId) {
    sid = newId;
    const byId = new Map(stentControls(sid).map((v) => [v.id, v]));
    rows = [];
    const kids = [];
    for (const ids of EDITOR_CELLS) for (const cid of ids) {
      const v = byId.get(cid);
      if (!v) { kids.push(h('div', { class: 'se-cell' })); continue; }   // (an empty cell keeps the columns)
      const r = v.type === 'seg' ? segRow(v) : sliderRow(v);
      rows.push(r); kids.push(r.row);
    }
    el.replaceChildren(...kids);
    sync(store.get().params, true);
  }
  // Follow the params: each slider not in the hand takes the model's value, each choice its pressed button, each control its dimming.
  function sync(p, force = false) {
    for (const r of rows) {
      if (r.kind === 1) { const x = r.v.get(p); if ((force || x !== r.shown) && document.activeElement !== r.input) { propSoon(r.input, 'value', String(x)); r.paint(x); } }
      else { const cur = r.v.get(); if (force || cur !== r.shown) { r.shown = cur; for (const b of r.btns) attrSoon(b, 'aria-pressed', b._val === cur ? 'true' : 'false'); } }
      const dim = !!r.v.dimIf?.(p);
      if (dim !== r.dim) { r.dim = dim; for (const c of r.cells) c.classList.toggle('se-dim', dim); }
    }
  }
  off = store.on('params', () => sync(store.get().params));
  build(id);
  return {
    el,
    /** Which stent it edits (the IR view's chip). */
    setStent(newId) { if (newId && newId !== sid) build(newId); },
    update() {},
    destroy() { off?.(); off = null; },
  };
}
