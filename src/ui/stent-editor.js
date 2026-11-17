// The stent editor, one for the TIPS and DIPS vessel card and Tests › IR › TIPS (17 Nov 2026, Mohammad approved the mock
// /mnt/project-files/tips-geometry-mocks/tips-cards-elegant.html: "Do it exactly like this please with all the animations and no insane bugs").
// Three rows, each its name and the stent's value as it stands, from the one list both cards read (actions.js stentControls):
//   Diameter   10 mm
//   Stenosis   Distal 5.0 mm       (a short focal narrowing at one end: its end and its lumen)
//   Waist      6.3 mm × 3.0 cm     (the reduction made on purpose, mid stent: its lumen, its length, its ends)
// A tap grows that row's own surface into its controls, in place: the surface (nine pieces, so its corners keep their round) grows from the row's box to
// the editor's room (the zone the card gives it: the vessel card's rows and actions, the IR card's chart and rows), the row's name and value glide to the
// panel's top line and stay the same words, Done comes in where the chevron was, and the controls rise into the room. Done, Escape or the name runs it back.
// Transforms and opacity only, on the compositor; the boxes are read once, on the tap (layout-snap.js).
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
const R = 12;   // (the surface's corner radius, px: the card's controls' --r-card)

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

// One editor on screen at a time (play-test F39): the TIPS view's leads; while it is shown a vessel card's editor for the same stent folds to one line.
const LEADS = new Set(), CARDS = new Set();
const hubSync = () => { for (const c of CARDS) c.fold([...LEADS].some((l) => l.shown && l.sid() === c.sid())); };

/** The nine pieces of the growing surface, each placed for the panel's full size by the stylesheet; grow() moves them from a row's box. */
const PIECES = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const PIECE_CLASS = ['se-s se-s-tl', 'se-s se-s-tc', 'se-s se-s-tr', 'se-s se-s-ml', 'se-s se-s-mc', 'se-s se-s-mr', 'se-s se-s-bl', 'se-s se-s-bc', 'se-s se-s-br'];   // (written out: the stylesheet's check finds each)

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
  // the panel: its surface, its top line (the row's name and value, and Done) and its body (the open row's controls)
  const surf = h('div', { class: 'se-surf', 'aria-hidden': 'true' }, PIECE_CLASS.map((c) => h('i', { class: c })));
  const surfEls = [...surf.children];   // alloc-rare: once per editor
  // (The name's words are a span of their own: the button is 44 px tall round them, so its box is not where they are. The glide moves the words onto the
  // row's words, measured word to word; measured from the button they landed 12 px low and 2 px right, then jumped home when the panel went: 17 Nov.)
  const pNameT = h('span', { class: 'se-ph-nt' });
  const pName = h('button', { type: 'button', class: 'se-ph-n', tabindex: '-1' }, pNameT), pVal = h('span', { class: 'se-ph-v' });
  const done = h('button', { type: 'button', class: 'se-done' }, 'Done');
  const pTrail = h('span', { class: 'se-ph-tr' }, pVal, done);
  const head = h('div', { class: 'se-ph' }, pName, pTrail);
  const body = h('div', { class: 'se-pb' });
  const panel = h('div', { class: 'se-panel', role: 'dialog', 'data-open': '', 'aria-hidden': 'true' }, surf, head, body);
  panel.inert = true;
  pName.addEventListener('click', () => setOpen(''));
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
    const cap = h('div', { class: 'se-cap' }, h('span', {}, v.id === 'diameter' ? '' : CAPTION[v.id] || v.label), val);
    const ends = v.id === 'diameter' ? h('div', { class: 'se-ends', 'aria-hidden': 'true' }, h('span', {}, `${v.min} mm`), h('span', {}, `${v.max} mm`)) : null;
    const cell = h('div', { class: 'se-ctl range-wrap', 'data-ctl': v.id }, cap, input, ends);
    const r = { v, cell, input, val, kind: 1, shown: NaN, pend: false, x: 0, fresh: true, hist: false, raf: 0, dim: null, lum, d, lo, hi };
    const toIn = (x) => (lum ? +(r.d * (1 - x)).toFixed(1) : x), fromIn = (y) => (lum ? (y >= r.d - 0.05 ? 0 : Math.max(0, Math.min(v.max, 1 - y / r.d))) : y);
    r.toIn = toIn;
    r.paint = (x) => {
      r.shown = x;
      const y = toIn(x);
      val.textContent = lum ? (x > 0.004 ? `${mm1(y)} mm` : 'Open') : v.id === 'diameter' ? '' : splitValue(v.format(x))[0];
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
    const cell = h('div', { class: 'se-ctl se-ctl-seg', 'data-ctl': v.id }, h('span', { class: 'se-cap' }, h('span', {}, CAPTION[v.id] || v.label)), seg);
    return { v, cell, seg, btns, kind: 2, shown: null, dim: null };
  }

  // ── the grow: the surface's nine pieces from the row's box to the panel's, the top line's two ends from the row's words to their own ──
  function grow(row, opening) {
    for (const a of anims) a.cancel();
    anims = [];
    if (reduced() || !surf.animate) return null;
    const pb = readBox(panel), rb = readBox(row);
    if (!pb || !rb || !(pb.width > 2 * R) || !(pb.height > 2 * R) || !(rb.width > 2 * R)) return null;
    const rn = readBox(row.querySelector('.se-row-n')), rv = readBox(row.querySelector('.se-row-v')), hn = readBox(pNameT), hv = readBox(pVal);
    const sx = rb.left - pb.left, sy = rb.top - pb.top, sw = rb.width, shh = Math.max(2 * R, rb.height), PW = pb.width, PH = pb.height;
    const kx = (sw - 2 * R) / (PW - 2 * R), ky = (shh - 2 * R) / (PH - 2 * R);
    const T = (x, y, a = 1, b = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${a.toFixed(4)}, ${b.toFixed(4)})`;
    const from = { tl: T(sx, sy), tc: T(sx, sy, kx), tr: T(sx + sw - PW, sy), ml: T(sx, sy, 1, ky), mc: T(sx, sy, kx, ky), mr: T(sx + sw - PW, sy, 1, ky), bl: T(sx, sy + shh - PH), bc: T(sx, sy + shh - PH, kx), br: T(sx + sw - PW, sy + shh - PH) };
    const o = { duration: D_SURFACE, easing: EASE_ARRIVE, fill: opening ? 'none' : 'forwards' };
    const run = (e, f) => anims.push(e.animate(opening ? [{ transform: f }, { transform: 'none' }] : [{ transform: 'none' }, { transform: f }], o));
    for (let i = 0; i < surfEls.length; i++) run(surfEls[i], from[PIECES[i]]);   // (an array: an HTMLCollection has no forEach, which threw here and left every panel open, 17 Nov)
    if (rn && hn) run(pName, T(rn.left - hn.left, rn.top - hn.top));
    if (rv && hv) run(pTrail, T(rv.right - hv.right, rv.top - hv.top));
    // The surface is the row's own raised fill only while it moves: it comes up as it leaves the row and is gone by the time it lands back on it, so the
    // panel going away at the end of a close changes nothing on screen (17 Nov, Mohammad: a closing row "snaps" back into place).
    anims.push(surf.animate(opening ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: D_SURFACE, easing: 'linear', fill: opening ? 'none' : 'forwards' }));
    const fade = { duration: opening ? D_SMALL : D_SMALL * 0.6, easing: EASE_ARRIVE, delay: opening ? D_SMALL * 0.5 : 0, fill: 'both' };
    anims.push(body.animate(opening ? [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 1 }, { opacity: 0 }], fade));
    anims.push(done.animate(opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL, easing: EASE_ARRIVE, delay: opening ? D_SMALL * 0.4 : 0, fill: 'both' }));
    return anims[0];
  }

  function show(rowId) {
    const r = rows.find((x) => x.id === rowId);
    body.replaceChildren(...(r ? r.ctls.map((c) => c.cell) : []));
    pNameT.textContent = r ? r.name : ''; pName.setAttribute('aria-label', r ? `Close ${r.name}` : 'Close');
    done.setAttribute('aria-label', r ? `Done with ${r.name}` : 'Done');
    pVal.textContent = r ? r.text : '';
    panel.dataset.row = rowId || '';
  }
  function setOpen(rowId) {
    rowId = rowId || '';
    if (rowId === openId || (rowId && folded)) return;   // (a folded card has no rows on screen: nothing of it opens)
    const was = rows.find((x) => x.id === openId), to = rows.find((x) => x.id === rowId);
    clearTimeout(closing); closing = 0;
    openId = rowId;
    for (const r of rows) r.btn.setAttribute('aria-expanded', r.id === openId ? 'true' : 'false');
    if (to) {
      show(rowId);
      panel.dataset.open = rowId; el.dataset.open = rowId;
      panel.inert = false; panel.setAttribute('aria-hidden', 'false'); rowsEl.inert = true;
      grow(to.btn, true);
      // (`reveal(panel)`: the holder brings an opened panel into sight, Tests › IR, whose panel opens under the chart.)
      reveal?.(panel);
      const first = to.ctls[0];
      (first?.input || first?.btns?.find((b) => b.getAttribute('aria-pressed') === 'true') || done).focus({ preventScroll: true });
    } else {
      rowsEl.inert = folded; panel.inert = true; panel.setAttribute('aria-hidden', 'true');
      el.dataset.open = '';
      const a = was ? grow(was.btn, false) : null;
      const end = () => { closing = 0; if (!openId) { for (const x of anims) x.cancel(); anims = []; panel.dataset.open = ''; show(''); } };
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
      const val = h('span', { class: 'se-row-v' });
      const btn = h('button', { type: 'button', class: 'se-row', 'data-row': g.id, 'aria-expanded': 'false', 'aria-label': `Edit ${g.name}` }, h('span', { class: 'se-row-n' }, g.name), val, svgIcon('chev-right', 'se-row-c'));
      btn.addEventListener('click', () => setOpen(g.id));
      rows.push({ id: g.id, name: g.name, btn, val, ctls: own, text: '' });
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
      const t = rowValue(r.id, sid, p);
      if (t !== r.text) { r.text = t; r.val.textContent = t; r.val.classList.toggle('se-none', t === 'None'); if (r.id === openId) pVal.textContent = t; }
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
      rowsEl.inert = on || !!openId;
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
