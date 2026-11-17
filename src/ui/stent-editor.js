// The stent editor, one for the TIPS and DIPS vessel card and Tests › IR › TIPS (17 Nov 2026, Mohammad approved the mock
// /mnt/project-files/tips-geometry-mocks/tips-cards-elegant.html: "Do it exactly like this please with all the animations and no insane bugs").
// Option A, the tab tray (17 Nov 2026, Mohammad: "Ok build A", /mnt/project-files/stent-tile-mocks/stent-tiles-three-ways.html): three tiles side by side,
// each its name, its value and one small line, from the one list both cards read (actions.js stentControls):
//   Diameter 8.0 mm / Whole stent    Stenosis None / Ends clear (or 5.0 mm / Distal)    Waist 6.0 mm / × 3.5 cm
// A tap fills the tile in and a tray unrolls from under the row with its controls, its two-way choice and Done at its foot; the other tiles stay, so another
// tap moves the tray to them (it stretches to their height), a tap on the open tile, Done or Escape rolls it back up. Nothing covers the stent or its chart:
// the tray is in the card's flow, under the tiles. Transforms and opacity only, on the compositor; the boxes are read once, on the tap (layout-snap.js).
// The lumens are set in mm (the slider's right is the open stent), as the rows say them; the params keep the share (stenosis, stentGeom.red), as the engine reads it.
// A drag sends the newest value once per frame and the last at once when the hand lets go; a change made anywhere else (the other card, a slide, undo)
// is followed between frames. One editor on screen at a time (play-test F39): while the Tests view's is shown, a vessel card's for the same stent folds to
// one line of its narrowings, the way into that view.

import { h, svgIcon, paintRange } from './util.js';
import { store, updateParams } from './store.js';
import { frameFor } from './frame.js';
import { runSoon, propSoon, attrSoon, dataSoon } from './class-soon.js';
import { stentControls } from './actions.js';
import { readBox } from './layout-snap.js';
import { D_SURFACE, D_SMALL, EASE_ARRIVE } from './ease.js';
import { reduced } from './motion.js';
import { GLIDE_EVENT } from './card-glide.js';

const nextFrame = frameFor('stent-editor');
/** The rows, by the controls' ids in actions.js stentControls: each opens its controls, in this order. */
export const EDITOR_ROWS = [
  { id: 'dia', name: 'Diameter', ids: ['diameter'] },
  { id: 'end', name: 'Stenosis', ids: ['site', 'narrow'] },
  { id: 'waist', name: 'Waist', ids: ['waistD', 'waist', 'ends'] },
];
/** (Kept for the deck and the tests that name the chips: the rows are the same three.) */
export const EDITOR_CHIPS = EDITOR_ROWS;
/** The captions in the open row (the lumens are in mm, the rest as the control names it). */
const CAPTION = { narrow: 'Lumen', waistD: 'Lumen', waist: 'Length', site: 'At', ends: 'Ends' };
/** Controls whose value is a share narrowed (0 open): the slider shows the lumen left, in mm. */
const LUMEN = new Set(['narrow', 'waistD']);
const R = 12;   // (the tray's corner radius, px: the card's controls' --r-card)

/** A value as the editor shows it: the millimetres first, then the rest (a percentage) ("40% · 6.0 mm" → ["6.0 mm", "40%"]). */
export function splitValue(t) {
  const i = t.indexOf(' · ');
  if (i < 0) return [t, ''];
  const a = t.slice(0, i), b = t.slice(i + 3);
  return b.endsWith('mm') && !a.endsWith('mm') ? [b, a] : [a, b];
}
const mm1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
/** A row's value, from the params (the words the row and the open panel's top line both show). */
export function rowValue(rowId, id, p) {
  const ctl = new Map(stentControls(id).map((v) => [v.id, v]));
  const dia = ctl.get('diameter'), d = dia ? dia.get(p) : 10;
  if (rowId === 'dia') return `${mm1(d)} mm`;
  if (rowId === 'end') {
    const s = ctl.get('narrow')?.get(p) || 0;
    if (!(s > 0.004)) return 'None';
    const at = ctl.get('site')?.get();
    return `${at === 'proximal' ? 'Proximal' : 'Distal'} ${mm1(d * (1 - s))} mm`;
  }
  const red = ctl.get('waistD')?.get(p) || 0;
  if (!(red > 0.004)) return 'None';
  return `${mm1(d * (1 - red))} mm × ${mm1(ctl.get('waist')?.get(p) ?? 1)} cm`;
}

/** A tile's words (option A, Mohammad 17 Nov): its number, its unit and one small line under them (8.0 mm / Whole stent, 5.0 mm / Distal, 6.0 mm / × 3.5 cm, None / Uniform). */
export function tileWords(rowId, id, p) {
  const ctl = new Map(stentControls(id).map((v) => [v.id, v]));
  const d = ctl.get('diameter')?.get(p) ?? 10;
  if (rowId === 'dia') return [mm1(d), 'mm', 'Whole stent'];
  if (rowId === 'end') {
    const s = ctl.get('narrow')?.get(p) || 0;
    if (!(s > 0.004)) return ['None', '', 'Ends clear'];
    return [mm1(d * (1 - s)), 'mm', ctl.get('site')?.get() === 'proximal' ? 'Proximal' : 'Distal'];
  }
  const red = ctl.get('waistD')?.get(p) || 0;
  if (!(red > 0.004)) return ['None', '', 'Uniform'];
  return [mm1(d * (1 - red)), 'mm', `× ${mm1(ctl.get('waist')?.get(p) ?? 1)} cm`];
}

// One editor on screen at a time (play-test F39): the TIPS view's leads; while it is shown a vessel card's editor for the same stent folds to one line.
const LEADS = new Set(), CARDS = new Set();
const hubSync = () => { for (const c of CARDS) c.fold([...LEADS].some((l) => l.shown && l.sid() === c.sid())); };


/** createStentEditor({ id, lead, onOpen, zone, reveal }): { el, panel, update(frame), setStent(id), setShown(on), open(rowId), close(), opened(), destroy() }.
 *  `id` the stent ('TIPS', 'DIPS'); `lead` the Tests view's own (a vessel card's folds while it is shown); `onOpen(id)` what the folded line does (opens
 *  Tests › IR › TIPS on that stent); `zone` the element the panel grows to fill (the card's room: it must be the panel's offset parent), else the editor itself. */
export function createStentEditor({ id = 'TIPS', lead = false, onOpen = null, zone = null, reveal = null } = {}) {
  const born = !lead && [...LEADS].some((l) => l.shown && l.sid() === id);
  const el = h('div', { class: 'stent-editor', role: 'group', 'aria-label': 'Edit stent', 'data-open': '', 'data-fold': born ? 'true' : 'false' });
  const rowsEl = h('div', { class: 'se-rows' });
  rowsEl.inert = born;
  const sumText = h('span', { class: 'se-sum-t' });
  const summary = h('button', { type: 'button', class: 'se-summary', 'aria-live': 'polite', 'aria-label': 'Open in Tests, IR' }, sumText, svgIcon('chev-right', 'se-sum-ic'));
  summary.inert = !born; summary.tabIndex = born ? 0 : -1;
  summary.addEventListener('click', () => onOpen?.(sid));
  // the tray (option A, the tab tray): one surface under the tiles that the open tile joins; it unrolls from under them, carries the open tile's controls and,
  // at its foot, its two-way choice (or a line saying the range) and Done. Its paper is three pieces (top, middle, foot) so a change of height keeps its
  // corners round; a patch the open tile's width squares the corner under that tile and glides to the next one.
  const bgT = h('i', { class: 'se-bg se-bg-t' }), bgM = h('i', { class: 'se-bg se-bg-m' }), bgB = h('i', { class: 'se-bg se-bg-b' });
  const join = h('i', { class: 'se-join' });
  const paper = h('div', { class: 'se-paper', 'aria-hidden': 'true' }, bgT, bgM, bgB, join);
  const body = h('div', { class: 'se-pb' });
  const footL = h('div', { class: 'se-fl' });
  const done = h('button', { type: 'button', class: 'se-done' }, 'Done');
  const foot = h('div', { class: 'se-foot' }, footL, done);
  const tin = h('div', { class: 'se-tin' }, paper, body, foot);
  const panel = h('div', { class: 'se-panel', role: 'dialog', 'data-open': '', 'aria-hidden': 'true' }, tin);
  panel.inert = true;
  done.addEventListener('click', () => setOpen(''));
  el.append(rowsEl, summary);
  (zone || el).append(panel);
  let folded = born, sid = null, ctls = [], rows = [], off = null, openId = '', anims = [], closing = 0;

  function sliderCtl(v, d) {
    const lum = LUMEN.has(v.id);
    // (a lumen: the slider runs from the narrowest the control allows to the open stent, in mm; the params keep the share narrowed)
    const lo = lum ? +(d * (1 - v.max)).toFixed(1) : v.min, hi = lum ? d : v.max, step = lum ? 0.1 : v.step;
    const input = h('input', { type: 'range', min: lo, max: hi, step, 'aria-label': v.id === 'diameter' ? `${v.label}` : `${CAPTION[v.id] || v.label}` });
    const val = h('b', { class: 'se-cv' });
    const cap = h('div', { class: 'se-cap' }, h('span', {}, v.id === 'diameter' ? 'Diameter' : CAPTION[v.id] || v.label), val);
    const cell = h('div', { class: 'se-ctl range-wrap', 'data-ctl': v.id }, cap, input);
    const r = { v, cell, input, val, kind: 1, shown: NaN, pend: false, x: 0, fresh: true, hist: false, raf: 0, dim: null, lum, d, lo, hi };
    const toIn = (x) => (lum ? +(r.d * (1 - x)).toFixed(1) : x), fromIn = (y) => (lum ? (y >= r.d - 0.05 ? 0 : Math.max(0, Math.min(v.max, 1 - y / r.d))) : y);
    r.toIn = toIn;
    r.paint = (x) => {
      r.shown = x;
      const y = toIn(x);
      val.textContent = lum ? (x > 0.004 ? `${mm1(y)} mm` : v.id === 'waistD' ? 'No waist' : 'Open') : v.id === 'diameter' ? `${mm1(x)} mm` : splitValue(v.format(x))[0];
      attrSoon(input, 'aria-valuetext', lum ? (x > 0.004 ? `${mm1(y)} mm` : 'open') : v.format(x));
      paintRange(input, (y - r.lo) / Math.max(1e-6, r.hi - r.lo));
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
      const x = fromIn(parseFloat(input.value));
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
    const seg = h('div', { class: 'se-seg', role: 'group', 'aria-label': CAPTION[v.id] || v.label, 'data-at': '0' }, h('i', { class: 'se-thumb', 'aria-hidden': 'true' }), btns);   // (the thumb slides under the pressed choice, as the mock's: a transform)
    const cell = h('div', { class: 'se-ctl se-ctl-seg', 'data-ctl': v.id }, h('span', { class: 'se-cap' }, CAPTION[v.id] || v.label), seg);
    return { v, cell, seg, btns, kind: 2, shown: null, dim: null };
  }

  // ── the tray's motion: transforms and opacity only (the boxes read once, on the tap) ──
  const tileOf = (rowId) => rows.find((x) => x.id === rowId)?.btn;
  // The patch under the open tile: placed by its box (a write on the tap, never in a frame); from `from` (the last tile's box) it glides there.
  function placeJoin(rowId, from) {
    const t = tileOf(rowId), pb = readBox(tin), tb = t && readBox(t);
    if (!pb || !tb) return null;
    const x = tb.left - pb.left, w = tb.width;
    join.style.left = `${x.toFixed(1)}px`; join.style.width = `${w.toFixed(1)}px`;
    if (from && from.w > 0 && w > 0 && !reduced() && join.animate) anims.push(join.animate([{ transform: `translateX(${(from.x - x).toFixed(1)}px) scaleX(${(from.w / w).toFixed(4)})` }, { transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE }));
    return { x, w };
  }
  let joinAt = null;
  function roll(kind, oldH) {
    for (const a of anims) a.cancel();
    anims = [];
    if (reduced() || !tin.animate) return null;
    const H = readBox(tin)?.height || 0;
    if (!(H > 0)) return null;
    const ease = { duration: D_SURFACE, easing: EASE_ARRIVE };
    if (kind === 'open') {
      // (it unrolls: the tray's paper and words slide down from behind the tiles, the tray clipping them at its top; the words follow a beat later)
      anims.push(tin.animate([{ transform: `translateY(${(-H).toFixed(1)}px)` }, { transform: 'none' }], ease));
      for (const e of [body, foot]) anims.push(e.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE, delay: D_SMALL * 0.4, fill: 'both' }));
    } else if (kind === 'close') {
      anims.push(tin.animate([{ transform: 'none' }, { transform: `translateY(${(-H).toFixed(1)}px)` }], { duration: D_SURFACE * 0.8, easing: EASE_ARRIVE, fill: 'forwards' }));
      for (const e of [body, foot]) anims.push(e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL * 0.5, easing: EASE_ARRIVE, fill: 'forwards' }));
    } else if (oldH > 0 && Math.abs(oldH - H) > 0.5) {
      // (another tile: the paper's middle stretches from the old height to the new and its foot and Done ride with it; the new controls fade in)
      const dy = oldH - H, k = Math.max(0, oldH - 2 * R) / Math.max(1, H - 2 * R);
      anims.push(bgM.animate([{ transform: `scaleY(${k.toFixed(4)})` }, { transform: 'none' }], ease));
      for (const e of [bgB, foot]) anims.push(e.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], ease));
    }
    if (kind === 'switch') anims.push(body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }));
    return anims[0] || null;
  }

  function show(rowId) {
    const r = rows.find((x) => x.id === rowId);
    const cells = r ? r.ctls : [];
    body.replaceChildren(...cells.filter((c) => c.kind === 1).map((c) => c.cell));
    const pick = cells.find((c) => c.kind === 2);
    const dia = cells.find((c) => c.v.id === 'diameter');
    footL.replaceChildren(pick ? pick.cell : dia ? h('span', { class: 'se-hint' }, `${dia.v.min} to ${dia.v.max} mm`) : '');
    panel.setAttribute('aria-label', r ? `Edit ${r.name}` : 'Edit stent');
    done.setAttribute('aria-label', r ? `Done with ${r.name}` : 'Done');
    panel.dataset.row = rowId || '';
  }
  function setOpen(rowId) {
    rowId = rowId || '';
    if (rowId === openId || (rowId && folded)) return;
    const was = rows.find((x) => x.id === openId), to = rows.find((x) => x.id === rowId);
    const switching = !!(was && to);
    const oldH = switching ? readBox(tin)?.height || 0 : 0;
    clearTimeout(closing); closing = 0;
    openId = rowId;
    for (const r of rows) r.btn.setAttribute('aria-expanded', r.id === openId ? 'true' : 'false');
    // (The card that holds it glides to its new height, card-glide.js: asked just before the tray changes it.)
    const ask = () => { const E = el.ownerDocument?.defaultView?.CustomEvent || globalThis.CustomEvent; if (E && el.dispatchEvent) el.dispatchEvent(new E(GLIDE_EVENT, { bubbles: true })); };   // (the page's own event kind)
    if (to) {
      const pos = rows.indexOf(to);
      ask();
      show(rowId);
      panel.dataset.open = rowId; el.dataset.open = rowId;
      panel.dataset.pos = pos === 0 ? 'first' : pos === rows.length - 1 ? 'last' : 'mid';
      panel.inert = false; panel.setAttribute('aria-hidden', 'false');
      sync(store.get().params, true);
      const from = switching ? joinAt : null;
      roll(switching ? 'switch' : 'open', oldH);
      joinAt = placeJoin(rowId, from);
      reveal?.(panel);
      if (!switching) { const first = to.ctls[0]; (first?.input || first?.btns?.find((b) => b.getAttribute('aria-pressed') === 'true') || done).focus({ preventScroll: true }); }
    } else {
      panel.inert = true; panel.setAttribute('aria-hidden', 'true');
      el.dataset.open = '';
      const a = was ? roll('close') : null;
      const end = () => { closing = 0; if (!openId) { ask(); for (const x of anims) x.cancel(); anims = []; panel.dataset.open = ''; joinAt = null; show(''); } };
      if (a) a.finished.then(end, end); else end();
      if (was && panel.contains(document.activeElement)) was.btn.focus({ preventScroll: true });
    }
    // (A card must never sit scrolled sideways, play-test F38: its body cannot scroll that way now, and this puts it back should anything ever do so.)
    const sc = el.closest('.ac-body');
    if (sc) sc.scrollLeft = 0;   // (a write only: no layout read)
  }

  function build(newId) {
    sid = newId;
    const byId = new Map(stentControls(sid).map((v) => [v.id, v]));
    const p = store.get().params, d = byId.get('diameter')?.get(p) || 10;
    ctls = []; rows = [];
    for (const g of EDITOR_ROWS) {
      const own = [];
      for (const cid of g.ids) { const v = byId.get(cid); if (v) own.push(v.type === 'seg' ? segCtl(v) : sliderCtl(v, d)); }
      if (!own.length) continue;
      ctls.push(...own);
      // a tile: its name and a chevron, its value, one small line under it; the open tile fills in (its own fill, faded) and joins the tray
      const num = h('b', {}), unit = h('u', {}), val = h('span', { class: 'se-row-v' }, num, unit), sub = h('span', { class: 'se-ts' });
      const btn = h('button', { type: 'button', class: 'se-row', 'data-row': g.id, 'aria-expanded': 'false', 'aria-label': `Edit ${g.name}` },
        h('i', { class: 'se-tfill', 'aria-hidden': 'true' }),
        h('span', { class: 'se-tc' }, h('span', { class: 'se-row-n' }, g.name), svgIcon('chev-down', 'se-row-c')), val, sub);
      btn.addEventListener('click', () => setOpen(openId === g.id ? '' : g.id));
      rows.push({ id: g.id, name: g.name, btn, val, num, unit, sub, ctls: own, text: '', small: '' });
    }
    rowsEl.replaceChildren(...rows.map((r) => r.btn));
    if (openId && !rows.some((r) => r.id === openId)) openId = '';
    show(openId);
    sync(store.get().params, true);
  }
  const onKey = (e) => { if (e.key === 'Escape' && openId) { e.stopPropagation(); setOpen(''); } };
  el.addEventListener('keydown', onKey); panel.addEventListener('keydown', onKey);

  // Follow the params: each slider not in the hand takes the model's value, each choice its pressed button, each row its words and the dimming.
  function sync(p, force = false) {
    const d = stentControls(sid).find((v) => v.id === 'diameter')?.get(p) || 10;
    for (const r of ctls) {
      if (r.kind === 1) {
        if (r.lum && r.d !== d) { r.d = d; r.lo = +(d * (1 - r.v.max)).toFixed(1); r.hi = d; propSoon(r.input, 'min', String(r.lo)); propSoon(r.input, 'max', String(r.hi)); force = true; }
        const x = r.v.get(p);
        if ((force || x !== r.shown) && document.activeElement !== r.input) { propSoon(r.input, 'value', String(r.toIn(x))); r.paint(x); }
      } else { const cur = r.v.get(); if (force || cur !== r.shown) { r.shown = cur; for (const b of r.btns) attrSoon(b, 'aria-pressed', b._val === cur ? 'true' : 'false'); dataSoon(r.seg, 'at', String(Math.max(0, r.btns.findIndex((b) => b._val === cur)))); } }
      const dim = !!r.v.dimIf?.(p);
      if (dim !== r.dim) { r.dim = dim; r.cell.classList.toggle('se-dim', dim); }
    }
    for (const r of rows) {
      const t = rowValue(r.id, sid, p), w = tileWords(r.id, sid, p);
      if (t !== r.text) { r.text = t; r.btn.setAttribute('aria-label', `Edit ${r.name}: ${t}`); }
      if (w[0] !== r.num.textContent) { r.num.textContent = w[0]; r.val.classList.toggle('se-none', w[0] === 'None'); }
      const u = w[1] ? ` ${w[1]}` : '';
      if (u !== r.unit.textContent) r.unit.textContent = u;
      if (w[2] !== r.small) { r.small = w[2]; r.sub.textContent = w[2]; }
    }
    if (!lead) {
      // (The folded line: the stent's narrowings as the rows read them. Its diameter is left out: the card's picture shows it.)
      const st = rows.find((r) => r.id === 'end')?.text, w = rows.find((r) => r.id === 'waist')?.text, parts = [];
      if (st && st !== 'None') parts.push(`Stenosis ${st}`);
      if (w && w !== 'None') parts.push(`Waist ${w}`);
      const t = parts.length ? parts.join(' · ') : 'No narrowing';
      if (t !== sumText.textContent) sumText.textContent = t;
      summary.setAttribute('aria-label', `${t}. Open in Tests, IR`);
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
      attrSoon(el, 'data-fold', on ? 'true' : 'false');   // (the stylesheet swaps the rows for the line, which fades in)
      rowsEl.inert = on;
      summary.inert = !on; summary.tabIndex = on ? 0 : -1;
    },
  };
  if (lead) LEADS.add(me); else CARDS.add(me);
  hubSync();
  return {
    el, panel,
    /** The lead's view is on screen or not (ir-tips.js: the TIPS view shown in an open pane). */
    setShown(on) { on = !!on; if (on !== me.shown) { me.shown = on; if (!on) setOpen(''); hubSync(); } },
    /** Which stent it edits. */
    setStent(newId) { if (newId && newId !== sid) { setOpen(''); build(newId); hubSync(); } },
    /** Open a row's controls ('dia', 'end', 'waist'), or give the rows back (''). */
    open: (rowId) => setOpen(rowId),
    close: () => setOpen(''),
    opened: () => openId,
    update() {},
    destroy() { off?.(); off = null; for (const a of anims) a.cancel(); anims = []; panel.remove(); LEADS.delete(me); CARDS.delete(me); hubSync(); },
  };
}
