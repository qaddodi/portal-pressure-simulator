// The stent editor of Tests › IR › TIPS (17 Nov 2026, Mohammad: "editing the stent easier even from the test card should be able to edit. Stenosis the
// distal or proximal end should be a different option than making a waist with some length"; then "we should be able to edit the TIPS right from this
// view please, no need to open the card", "elegantly"; and the play-test: the stent drawing must stay the card's main content). One slim row of value
// chips, each the stent's number as it stands, the same controls as the stent's vessel card from the one list both read (actions.js stentControls):
//   [Diameter 10 mm] [Stenosis 5.0 mm · Distal] [Waist 6.0 mm] [Length 2.0 cm] [Ends Abrupt]
// A tap on a chip turns the row, in the same height, into that chip's control: its slider and value, the choice that goes with it (the stenosis's end,
// the waist's ends), and Done. Escape, Done or a tap on the control's name gives the chips back. The rows sit in one grid cell and crossfade, so the
// row's height never changes and nothing below it moves. A chip whose control does nothing now (the waist's length with no waist) dims, never hidden.
// A drag sends the newest value once per frame and the last at once when the hand lets go (as the vessel card does: card.js); a change made anywhere
// else (the vessel card, a slide, undo) is followed between frames.

import { h, paintRange } from './util.js';
import { store, updateParams } from './store.js';
import { frameFor } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { stentControls } from './actions.js';

const nextFrame = frameFor('stent-editor');
/** The chips, by the controls' ids in actions.js stentControls: each a slider and the choice that goes with it, under the chip's name. */
export const EDITOR_CHIPS = [
  { id: 'dia', name: 'Diameter', ids: ['diameter'] },
  { id: 'end', name: 'Stenosis', ids: ['narrow', 'site'] },
  { id: 'waist', name: 'Waist', ids: ['waistD'] },
  { id: 'len', name: 'Length', ids: ['waist'] },
  { id: 'ends', name: 'Ends', ids: ['ends'] },   // (its own chip, so Length reads "1.0 cm" whole on a phone: play-test F36)
];

/** A value as the editor shows it: the millimetres first, then the rest (a percentage) ("40% · 6.0 mm" → ["6.0 mm", "40%"]). */
export function splitValue(t) {
  const i = t.indexOf(' · ');
  if (i < 0) return [t, ''];
  const a = t.slice(0, i), b = t.slice(i + 3);
  return b.endsWith('mm') && !a.endsWith('mm') ? [b, a] : [a, b];
}

/** createStentEditor({ id }): { el, update(frame), setStent(id), open(chipId), close(), destroy() }. `id` is the stent ('TIPS', 'DIPS'). */
export function createStentEditor({ id = 'TIPS' } = {}) {
  const el = h('div', { class: 'stent-editor', role: 'group', 'aria-label': 'Edit stent', 'data-open': '' });
  const chipRow = h('div', { class: 'se-chips se-layer' });
  let sid = null, ctls = [], chips = [], off = null, openId = '', lastOpen = '';

  function sliderCtl(v) {
    const input = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, 'aria-label': v.label, 'data-def': v.def ?? null });
    const main = h('span', { class: 'se-val-m' }), sub = h('span', { class: 'se-sub' });
    const val = h('span', { class: 'se-val' }, main, sub);
    const cell = h('div', { class: 'range-wrap se-range', 'data-ctl': v.id }, input);
    const r = { v, cells: [cell, val], input, val, kind: 1, shown: NaN, pend: false, x: 0, fresh: true, hist: false, raf: 0, dim: null };
    r.paint = (x) => {
      r.shown = x;
      const t = v.format(x), [a, b] = splitValue(t);
      main.textContent = a; sub.textContent = b ? ` · ${b}` : '';   // (the millimetres first; a narrow card leaves the percentage out)
      attrSoon(input, 'aria-valuetext', t); paintRange(input, (x - v.min) / (v.max - v.min));
    };
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
      r.paint(x);
      if (!r.pend) { r.pend = true; r.hist = r.fresh; }
      r.fresh = false; r.x = x;
      if (!r.raf) r.raf = nextFrame(flush);
    });
    input.addEventListener('change', () => { r.raf = 0; if (r.pend) runSoon(send); });
    return r;
  }
  function segCtl(v) {
    const btns = v.options.map((o) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false' }, o[1]);
      b.addEventListener('click', () => v.set(o[0]));
      b._val = o[0];
      return b;
    });
    const cell = h('div', { class: 'seg ac-seg small se-seg', role: 'group', 'aria-label': v.label, 'data-ctl': v.id }, btns);
    return { v, cells: [cell], btns, kind: 2, shown: null, dim: null };
  }

  // The chip's words: its slider's value as it stands, the millimetres first, and its choice ("5.0 mm · Distal"; "None" alone at nothing).
  function chipText(c, p) {
    const [sl, sg] = c.ctls;
    if (sl.kind === 2) { const cur = sl.v.get(), o = sl.v.options.find((q) => q[0] === cur); return o ? o[1] : ''; }
    const main = splitValue(sl.v.format(sl.v.get(p)))[0];
    if (!sg || main === 'None') return main;
    const cur = sg.v.get(), o = sg.v.options.find((q) => q[0] === cur);
    return o ? `${main} · ${o[1]}` : main;
  }
  const CHOICE = ' · ';

  function setOpen(cid) {
    openId = cid || '';
    attrSoon(el, 'data-open', openId);
    for (const c of chips) { const on = c.id === openId; c.strip.inert = !on; c.strip.setAttribute('aria-hidden', on ? 'false' : 'true'); }
    chipRow.inert = !!openId;
    // (A card must never sit scrolled sideways, play-test F38: its body cannot scroll that way now, and this puts it back should anything ever do so.)
    const sc = el.closest('.ac-body');
    if (sc) sc.scrollLeft = 0;   // (a write only: no layout read)
    if (openId) { lastOpen = openId; const r = chips.find((c) => c.id === openId)?.ctls[0]; (r?.input || r?.btns?.[0])?.focus({ preventScroll: true }); }
    else if (lastOpen && el.contains(document.activeElement)) chips.find((c) => c.id === lastOpen)?.btn.focus({ preventScroll: true });
  }

  function build(newId) {
    sid = newId;
    const byId = new Map(stentControls(sid).map((v) => [v.id, v]));
    ctls = []; chips = [];
    const strips = [];
    for (const g of EDITOR_CHIPS) {
      const own = [];
      for (const cid of g.ids) { const v = byId.get(cid); if (v) own.push(v.type === 'seg' ? segCtl(v) : sliderCtl(v)); }
      if (!own.length) continue;
      ctls.push(...own);
      const word = h('span', { class: 'se-chip-v' }), pick = h('span', { class: 'se-chip-c' });   // (the value, and the choice beside it, which a narrow card leaves to the open row)
      const btn = h('button', { type: 'button', class: 'se-chip', 'data-chip': g.id, 'aria-label': `Edit ${g.name}` }, h('span', { class: 'se-chip-n' }, g.name), h('span', { class: 'se-chip-w' }, word, pick));
      btn.addEventListener('click', () => setOpen(g.id));
      const name = h('button', { type: 'button', class: 'se-name', tabindex: '-1', 'aria-hidden': 'true' }, g.name);
      name.addEventListener('click', () => setOpen(''));
      const done = h('button', { type: 'button', class: 'se-done', 'aria-label': `Done with ${g.name}` }, 'Done');
      done.addEventListener('click', () => setOpen(''));
      const strip = h('div', { class: 'se-strip se-layer', 'data-strip': g.id, 'aria-hidden': 'true' }, name, ...own.flatMap((r) => r.cells), done);
      strip.inert = true;
      strips.push(strip);
      chips.push({ id: g.id, btn, word, pick, strip, ctls: own, text: '', dim: null });
    }
    chipRow.replaceChildren(...chips.map((c) => c.btn));
    el.replaceChildren(chipRow, ...strips);
    if (openId && !chips.some((c) => c.id === openId)) openId = '';
    setOpen(openId);
    sync(store.get().params, true);
  }
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { e.stopPropagation(); setOpen(''); } });

  // Follow the params: each slider not in the hand takes the model's value, each choice its pressed button, each chip its words and its dimming.
  function sync(p, force = false) {
    for (const r of ctls) {
      if (r.kind === 1) { const x = r.v.get(p); if ((force || x !== r.shown) && document.activeElement !== r.input) { propSoon(r.input, 'value', String(x)); r.paint(x); } }
      else { const cur = r.v.get(); if (force || cur !== r.shown) { r.shown = cur; for (const b of r.btns) attrSoon(b, 'aria-pressed', b._val === cur ? 'true' : 'false'); } }
      const dim = !!r.v.dimIf?.(p);
      if (dim !== r.dim) { r.dim = dim; for (const c of r.cells) c.classList.toggle('se-dim', dim); }
    }
    for (const c of chips) {
      const t = chipText(c, p);
      if (t !== c.text) { c.text = t; const i = t.indexOf(CHOICE); c.word.textContent = i < 0 ? t : t.slice(0, i); c.pick.textContent = i < 0 ? '' : t.slice(i); }
      const dim = !!c.ctls[0].v.dimIf?.(p);
      if (dim !== c.dim) { c.dim = dim; c.btn.classList.toggle('se-dim', dim); }
    }
  }
  off = store.on('params', () => sync(store.get().params));
  build(id);
  return {
    el,
    /** Which stent it edits (the IR view's chip). */
    setStent(newId) { if (newId && newId !== sid) build(newId); },
    /** Open a chip's control ('dia', 'end', 'waist', 'len', 'ends'), or give the chips back (''). */
    open: (cid) => setOpen(cid),
    close: () => setOpen(''),
    update() {},
    destroy() { off?.(); off = null; },
  };
}
