// The stent editor of Tests › IR › TIPS (17 Nov 2026, Mohammad: "editing the stent easier even from the test card should be able to edit. Stenosis the
// distal or proximal end should be a different option than making a waist with some length"; then "we should be able to edit the TIPS right from this
// view please, no need to open the card", "elegantly"; and the play-test: the stent drawing must stay the card's main content). One slim row of value
// chips, each the stent's number as it stands, the same controls as the stent's vessel card from the one list both read (actions.js stentControls):
//   Diameter 10 mm | Stenosis 5.0 mm · Distal | Waist 6.0 mm · 2.0 cm   (three quiet tokens, a hairline between them, each its caption over its value)
// A tap on a chip turns the row, in the same height, into that chip's control: its slider and value, the choice that goes with it (the stenosis's end,
// the waist's ends), and Done. Escape, Done or a tap on the control's name gives the chips back. The rows sit in one grid cell and crossfade, so the
// row's height never changes and nothing below it moves. The waist's length and ends open with the waist (no chip that does nothing until a waist exists).
// The opening is one motion (Mohammad, 17 Nov: "the transition when you click a button to open the slider look much better, seamless"): the chip's own
// surface grows from where the chip is to the row's width and its neighbours fade, the row's controls rise into it; Done runs it back to the chip. The
// surface is three pieces (two rounded ends and a middle) so its ends keep their round as it grows: transforms only, on the compositor.
// A drag sends the newest value once per frame and the last at once when the hand lets go (as the vessel card does: card.js); a change made anywhere
// else (the vessel card, a slide, undo) is followed between frames.

import { h, paintRange } from './util.js';
import { store, updateParams } from './store.js';
import { frameFor } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { stentControls } from './actions.js';
import { readBox } from './layout-snap.js';
import { D_SMALL, EASE_MOVE } from './ease.js';
import { reduced } from './motion.js';

const nextFrame = frameFor('stent-editor');
/** The chips, by the controls' ids in actions.js stentControls: each a slider and the choice that goes with it, under the chip's name. */
export const EDITOR_CHIPS = [
  { id: 'dia', name: 'Diameter', ids: ['diameter'] },
  { id: 'end', name: 'Stenosis', ids: ['narrow', 'site'] },
  { id: 'waist', name: 'Waist', ids: ['waistD', 'waist', 'ends'] },   // (its length and its ends open with it: no chip that does nothing until a waist exists, 17 Nov)
];
/** The caption of a control that is not its chip's first slider (the waist's length): an open row with two sliders names the second. */
const CAPTION = { waist: 'Length' };

/** A value as the editor shows it: the millimetres first, then the rest (a percentage) ("40% · 6.0 mm" → ["6.0 mm", "40%"]). */
export function splitValue(t) {
  const i = t.indexOf(' · ');
  if (i < 0) return [t, ''];
  const a = t.slice(0, i), b = t.slice(i + 3);
  return b.endsWith('mm') && !a.endsWith('mm') ? [b, a] : [a, b];
}

// One editor on screen at a time (play-test F39, 17 Nov 2026: with the stent's vessel card and Tests › IR › TIPS both open the chips showed twice). The
// TIPS view's editor leads (Mohammad edits there without opening the vessel card): while it is shown, a vessel card's editor for the same stent folds to
// one line of the stent's numbers, which fades in where its chips were.
const LEADS = new Set(), CARDS = new Set();
const hubSync = () => { for (const c of CARDS) c.fold([...LEADS].some((l) => l.shown && l.sid() === c.sid())); };

/** createStentEditor({ id, lead, compact }): { el, update(frame), setStent(id), setShown(on), open(chipId), close(), destroy() }. `id` is the stent ('TIPS',
 *  'DIPS'); `lead` the Tests view's own (a vessel card's folds while it is shown); `compact` its chips in one row, each its name over its value. */
export function createStentEditor({ id = 'TIPS', lead = false, compact = false } = {}) {
  const el = h('div', { class: `stent-editor${compact ? ' se-compact' : ''}`, role: 'group', 'aria-label': 'Edit stent', 'data-open': '', 'data-fold': 'false' });
  const chipRow = h('div', { class: 'se-chips se-layer' });
  const summary = h('div', { class: 'se-summary se-layer', 'aria-live': 'polite' });
  let folded = false;
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

  const CHOICE = ' · ';
  // The chip's words: its slider's value as it stands, the millimetres first, and its choice ("5.0 mm · Distal"; "None" alone at nothing).
  function chipText(c, p) {
    const [sl, sg] = c.ctls;
    if (sl.kind === 2) { const cur = sl.v.get(), o = sl.v.options.find((q) => q[0] === cur); return o ? o[1] : ''; }
    const main = splitValue(sl.v.format(sl.v.get(p)))[0];
    if (!sg || main === 'None') return main;
    if (sg.kind === 1) return `${main}${CHOICE}${splitValue(sg.v.format(sg.v.get(p)))[0]}`;   // (the waist: its lumen, then its length)
    const cur = sg.v.get(), o = sg.v.options.find((q) => q[0] === cur);
    return o ? `${main} · ${o[1]}` : main;
  }

  // The surface's grow (open) or shrink (close) between the chip's box and the open row's, read once on the tap (layout-snap), then transforms only.
  const ENDW = 12;   // (each rounded end's width, px: the chip's corner radius, app-06-plate.css)
  function grow(c, opening) {
    if (reduced() || !c.pill.animate) return;
    const a = readBox(c.btn), b = readBox(c.strip);
    if (!a || !b || !(b.width > 2 * ENDW) || !(a.width > 0)) return;
    const L = a.left - b.left, dy = a.top - b.top, sy = a.height / b.height, k = Math.max(0, a.width - 2 * ENDW) / (b.width - 2 * ENDW);
    // (A shrink holds the chip's size until the surface has faded, app-06-plate.css: it never springs back to the row's width while it can be seen.)
    for (const an of c.anims || []) an.cancel();
    const [l, m, r] = c.pill.children, o = { duration: D_SMALL, easing: EASE_MOVE, fill: opening ? 'none' : 'forwards' };
    const at = (x, sx = 1) => `translate(${x.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const run = (el, from) => el.animate(opening ? [{ transform: from }, { transform: 'none' }] : [{ transform: 'none' }, { transform: from }], o);
    c.anims = [run(l, at(L)), run(r, at(L + a.width - b.width)), run(m, at(L, k))];
  }

  function setOpen(cid) {
    const was = openId;
    openId = cid || '';
    if (was !== openId) {
      const back = chips.find((c) => c.id === was), to = chips.find((c) => c.id === openId);
      if (back) grow(back, false);
      if (to) grow(to, true);
    }
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
      const num = h('span', { class: 'se-chip-num' }), unit = h('span', { class: 'se-chip-u' });   // (the number in the card's number style, its unit beside it in the unit's)
      const word = h('span', { class: 'se-chip-v' }, num, unit), pick = h('span', { class: 'se-chip-c' });   // (the value, and the choice beside it, which a narrow card leaves to the open row)
      const btn = h('button', { type: 'button', class: 'se-chip', 'data-chip': g.id, 'aria-label': `Edit ${g.name}` }, h('span', { class: 'se-chip-n' }, g.name), h('span', { class: 'se-chip-w' }, word, pick));
      btn.addEventListener('click', () => setOpen(g.id));
      const name = h('button', { type: 'button', class: 'se-name', tabindex: '-1', 'aria-hidden': 'true' }, g.name);
      name.addEventListener('click', () => setOpen(''));
      const done = h('button', { type: 'button', class: 'se-done', 'aria-label': `Done with ${g.name}` }, 'Done');
      done.addEventListener('click', () => setOpen(''));
      const pill = h('div', { class: 'se-pill', 'aria-hidden': 'true' }, h('i', { class: 'se-pill-l' }), h('i', { class: 'se-pill-m' }), h('i', { class: 'se-pill-r' }));
      // (Each control its own group, so a row too narrow wraps between controls, never between a slider and its value; a second slider is named.)
      let sliders = 0;
      const groups = own.map((r) => h('div', { class: `se-ctl${r.kind === 2 ? ' se-ctl-seg' : ''}` }, r.kind === 1 && sliders++ ? h('span', { class: 'se-cap', 'aria-hidden': 'true' }, CAPTION[g.id] || r.v.label) : null, ...r.cells));
      const strip = h('div', { class: 'se-strip se-layer', 'data-strip': g.id, 'aria-hidden': 'true' }, pill, name, ...groups, done);
      strip.inert = true;
      strips.push(strip);
      chips.push({ id: g.id, btn, word, num, unit, pick, strip, pill, ctls: own, text: '', dim: null });
    }
    chipRow.replaceChildren(...chips.map((c) => c.btn));
    el.replaceChildren(chipRow, ...strips, summary);
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
    if (!lead) {
      // (The folded line: the stent and its narrowings, as the chips read them.)
      const by = (k) => chips.find((c) => c.id === k);
      const parts = [chipText(by('dia'), p)];
      const st = chipText(by('end'), p), w = chipText(by('waist'), p);
      if (st !== 'None') parts.push(`stenosis ${st}`);
      if (w !== 'None') parts.push(`waist ${w.replace(CHOICE, ' × ')}`);
      const t = `${parts.join(' · ')} · edited in Tests › IR`;
      if (t !== summary.textContent) summary.textContent = t;
    }
    for (const c of chips) {
      const t = chipText(c, p);
      if (t !== c.text) {
        c.text = t;
        const i = t.indexOf(CHOICE), w = i < 0 ? t : t.slice(0, i), u = / (mm|cm)$/.exec(w);
        c.num.textContent = u ? w.slice(0, u.index) : w; c.unit.textContent = u ? u[0] : '';
        c.pick.textContent = i < 0 ? '' : t.slice(i);
      }
      const dim = !!c.ctls[0].v.dimIf?.(p);
      if (dim !== c.dim) { c.dim = dim; c.btn.classList.toggle('se-dim', dim); }
    }
  }
  off = store.on('params', () => sync(store.get().params));
  build(id);
  const me = {
    shown: false,
    sid: () => sid,
    fold(on) {
      if (on === folded) return;
      folded = on;
      if (on) setOpen('');
      attrSoon(el, 'data-fold', on ? 'true' : 'false');
      chipRow.inert = on || !!openId;
    },
  };
  if (lead) LEADS.add(me); else CARDS.add(me);
  hubSync();
  return {
    el,
    /** The lead's view is on screen or not (ir-tips.js: the TIPS view shown in an open pane). */
    setShown(on) { on = !!on; if (on !== me.shown) { me.shown = on; hubSync(); } },
    /** Which stent it edits (the IR view's chip). */
    setStent(newId) { if (newId && newId !== sid) { build(newId); hubSync(); } },
    /** Open a chip's control ('dia', 'end', 'waist', 'len', 'ends'), or give the chips back (''). */
    open: (cid) => setOpen(cid),
    close: () => setOpen(''),
    update() {},
    destroy() { off?.(); off = null; LEADS.delete(me); CARDS.delete(me); hubSync(); },
  };
}
