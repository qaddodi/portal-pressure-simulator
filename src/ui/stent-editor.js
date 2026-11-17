// The stent editor of Tests › IR › TIPS (17 Nov 2026, Mohammad: "editing the stent easier even from the test card should be able to edit. Stenosis the
// distal or proximal end should be a different option than making a waist with some length"). The same controls as the stent's vessel card, from
// the one list both read (actions.js stentControls), laid out in two labelled groups so the two clinically different narrowings never look like one:
//   Diameter
//   Stenosis · at an end       Stenosis (severity), End (Proximal | Distal)
//   Waist · mid stent          Waist (its diameter), Waist length, Ends (Abrupt | Tapered)
// A drag sends the newest value once per frame and the last at once when the hand lets go (as the vessel card does: card.js); a change made anywhere
// else (the vessel card, a slide, undo) is followed between frames. A control that does nothing now (the waist's length and ends with no waist, the
// stenosis's end with no stenosis) dims where it stands, never hidden, so nothing moves.

import { h, paintRange } from './util.js';
import { store, updateParams } from './store.js';
import { frameFor } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { stentControls } from './actions.js';

const nextFrame = frameFor('stent-editor');
/** The groups, by the controls' ids in actions.js stentControls. */
export const EDITOR_GROUPS = [
  { id: 'dia', title: '', ids: ['diameter'] },
  { id: 'end', title: 'Stenosis', sub: 'at an end', ids: ['narrow', 'site'] },
  { id: 'waist', title: 'Waist', sub: 'mid stent', ids: ['waistD', 'waist', 'ends'] },
];

/** createStentEditor({ id }): { el, update(frame), setStent(id), destroy() }. `id` is the stent ('TIPS', 'DIPS'). */
export function createStentEditor({ id = 'TIPS' } = {}) {
  const el = h('div', { class: 'stent-editor', role: 'group', 'aria-label': 'Edit stent' });
  let sid = null, rows = [], off = null;

  function sliderRow(v) {
    const input = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, 'aria-label': v.label, 'data-def': v.def ?? null });
    const val = h('span', { class: 'ctl-val' });
    const row = h('div', { class: 'ac-c ac-slider', 'data-ctl': v.id }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-name' }, v.short || v.label), val), h('div', { class: 'range-wrap' }, input));
    const r = { v, row, input, val, kind: 1, shown: NaN, pend: false, x: 0, fresh: true, hist: false, raf: 0 };
    const paint = (x) => { r.shown = x; const t = v.format(x); val.textContent = t; attrSoon(input, 'aria-valuetext', t); paintRange(input, (x - v.min) / (v.max - v.min)); };
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
    const row = h('div', { class: 'ac-c ac-segrow', 'data-ctl': v.id }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-name' }, v.label)), h('div', { class: 'seg full ac-seg small', role: 'group', 'aria-label': v.label }, btns));
    return { v, row, btns, kind: 2, shown: null };
  }

  function build(newId) {
    sid = newId;
    const ctl = stentControls(sid), byId = new Map(ctl.map((v) => [v.id, v]));
    rows = [];
    const groups = EDITOR_GROUPS.map((g) => {
      const kids = [];
      for (const cid of g.ids) {
        const v = byId.get(cid);
        if (!v) continue;
        const r = v.type === 'seg' ? segRow(v) : sliderRow(v);
        rows.push(r); kids.push(r.row);
      }
      return h('section', { class: `se-group se-${g.id}` }, g.title ? h('h4', { class: 'se-title' }, g.title, g.sub ? h('em', {}, ` · ${g.sub}`) : null) : null, h('div', { class: 'se-ctls' }, kids));
    });
    el.replaceChildren(...groups);
    sync(store.get().params, true);
  }
  // Follow the params: each slider not in the hand takes the model's value, each choice its pressed button, each control its dimming.
  function sync(p, force = false) {
    for (const r of rows) {
      if (r.kind === 1) { const x = r.v.get(p); if ((force || x !== r.shown) && document.activeElement !== r.input) { propSoon(r.input, 'value', String(x)); r.paint(x); } }
      else { const cur = r.v.get(); if (force || cur !== r.shown) { r.shown = cur; for (const b of r.btns) attrSoon(b, 'aria-pressed', b._val === cur ? 'true' : 'false'); } }
      const dim = !!r.v.dimIf?.(p);
      if (dim !== r.dim) { r.dim = dim; r.row.classList.toggle('ac-dim', dim); }
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
