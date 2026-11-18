// The TIPS view of Tests › IR (16 Nov 2026; plan /mnt/project-files/tips-geometry/tips-test-card-plan.md): the stent's own test, beside the
// Measure view the HVPG tab always was. A two-way switch (Measure | TIPS, the same control as Pressure's and Scope's) sits in the pane's head row,
// and this file builds it and the TIPS view. The stent is edited here too (17 Nov 2026, Mohammad: "even from the test card should be able to edit"; this
// replaces the read-only decision T1): the stent editor (stent-editor.js) sits under the chips, the same controls as the vessel card's, from one list.
//
// Rules this keeps (Mohammad, 16 Nov 2026 and earlier):
//   - Nothing pops in or out. The TIPS segment is always there; with no stent it dims (opacity) and a tap says why, as a procedure button that cannot
//     be played does (hvpg-proc.js). A stent placed lights it; nothing switches the view for the person. A stent taken away while the view is open
//     sends it back to Measure, whose panel fades up (as Scope's second view does, dock.js setEndoSub).
//   - After a TIPS nothing here says HVPG: the two gradients are the PPG (portal vein − IVC) and the stent's own drop, "Across stent".
//   - The numbers are the stent's own, from the engine's one calculation (metrics.tips, metrics.dips: engine.stentState, stent-geom.js), the same as the
//     fingerprint's tipsFlow and tipsDp and the Doppler's gates. The peak velocity is the engine's own (stentState vPeak, the fastest of the three Doppler gates, the same as the card and the fingerprint's tipsVel).
//   - The readings are on this view alone: not on the bottom bar or in Readouts, where they would appear and vanish with the stent.
// The view itself (17 Nov 2026, Mohammad approved the mock tips-cards-elegant.html: "Do it exactly like this please with all the animations"): its title (the
// stent, its state, Velocity | Pressure, and a menu for Tube vs patient and Compare), one line of numbers (no tiles), the stent drawn to scale with its chart
// under it on the same x (tips-figure.js, made the first time the view opens, so a person who never opens it pays nothing), and the three rows that edit it
// (stent-editor.js), whose three tiles open a tray under them (option A), never over the chart. Compare is ir-compare.js (Then, Now, Change against the app's own pin); Tube vs patient
// is ir-curves.js (the stent's flow against one setting, in the patient and as a tube on a bench, each point settled on a calculation worker of its own).

import { h, fmt, swapText, toast, svgIcon } from './util.js';
import { store, hiddenNow } from './store.js';
import { classSoon, attrSoon, dataSoon } from './class-soon.js';
import { STENT_RANGE as RANGE } from './table-marks.js';
import { stentBand, gateKindsOf, reductionJet, lumenShown } from '../engine/stent-geom.js';
import { createTipsFigure } from './tips-figure.js';
import { createIrCompare } from './ir-compare.js';
import { createIrCurves } from './ir-curves.js';
import { createStentEditor } from './stent-editor.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';
import { leaveFade } from './leave-fade.js';
import { readBox } from './layout-snap.js';
import { reduced } from './motion.js';

/** The stents the Tests view reads, in the order it names them: the TIPS, then the DIPS. (A drawn stent has no metrics yet: plan §8.) */
export const stentIds = (p, out = []) => { out.length = 0; if (p?.tips?.on) out.push('TIPS'); if (p?.dips?.on) out.push('DIPS'); return out; };
/** The Doppler card's own range for an 8 to 10 mm stent's peak velocity, cm/s (doppler.js, topology.js: 90 to 190; one copy, table-marks.js). */
export const STENT_RANGE = RANGE;
const PEAK_BAND = [0, 0];   // alloc-rare: made once (peakBand's range for a stent of another diameter, read at once)
/** The range for this stent's own diameter (stent-geom.js stentBand: the reference range for 8 to 10 mm, scaled and provisional for another). */
export const peakBand = (st) => stentBand(st?.d, STENT_RANGE, PEAK_BAND);
/** Whether the gates over `hi` read only the deliberate reduction's jet (stent-geom.js reductionJet): then the tile says so, in the neutral tone, not Out of range. */
export const reductionJetIn = (st, hi) => !!st?.peaks && st.red > 0.004 && reductionJet(st.peaks, gateKindsOf(st.end, st.red, st.site, JET_KINDS), hi);
const JET_KINDS = [null, null, null];   // alloc-rare: made once (read at once)
const mm = (x) => String(Math.round(x * 10) / 10);
/** The line under the chip: the stent's width, then each of its two narrowings as the editor names them (the waist mid stent, the stenosis at its
 *  end: stent-geom.js), or "open". A record with no split (before 17 Nov 2026) names its narrowest lumen. */
export const stentLine = (st) => {
  if (!st) return 'No stent';
  if (st.red == null && st.end == null) return st.s > 0.0005 ? `${mm(st.d)} mm, narrowed to ${mm(st.dWaist)} mm` : `${mm(st.d)} mm, open`;
  const w = st.red > 0.0005 ? `waist ${mm(lumenShown(st.d * (1 - st.red)))} mm over ${mm(st.geom?.waist ?? 1)} cm` : '';
  const e = st.end > 0.0005 ? `${st.site === 'proximal' ? 'proximal' : 'distal'} stenosis to ${mm(st.d * (1 - st.end))} mm` : '';
  return `${mm(st.d)} mm, ${w && e ? `${w}, ${e}` : w || e || 'open'}`;
};

export const NO_STENT_WHY = 'There is no TIPS or DIPS in this patient. Place one from Treat, and this view fills in.';
const PPG_TITLE = 'PPG = portal vein pressure − IVC pressure, read through the stent. After a TIPS it is the gradient to read. 12 mmHg is the reference line, not a target for this patient; the aim is set by the clinical goal.';
/** The one line of numbers (17 Nov 2026, the approved mock: no tiles): the PPG, the stent's own drop, its flow. `hide`: the readout set that hides it in Explore. */
export const KEYS = [
  { id: 'ppg', k: 'PPG', u: 'mmHg', d: 1, hide: 'pv', title: PPG_TITLE, v: (m) => m.ppg },
  { id: 'dp', k: 'Across stent', u: 'mmHg', d: 1, hide: 'model', title: 'The pressure drop from the stent\'s portal end to the cava. It is smaller than the PPG: the rest is outside the stent.', v: (m, st) => st?.dp ?? null },
  { id: 'flow', k: 'Flow', u: 'L/min', d: 1, hide: 'model', title: 'The flow through the stent, from the portal side to the hepatic vein.', v: (m, st) => st?.flow ?? null },
];
/** The views behind the title's menu: the stent itself, then the two that answer another question. */
export const SUBS = [['inside', 'Inside the stent'], ['curves', 'Tube vs patient'], ['compare', 'Compare']];

/**
 * host: the pane's element, which holds the Measure view's own parts and, last, the TIPS view this makes (it sets host.dataset.view; the stylesheet shows one).
 * onChange(): the pane repaints.
 * Returns { head, el, update(frame), view(), setView(v), sub(), setSub(v), which(), setActive(on), openStent(id), lens(), setLens(k), figure, editor, curves }.
 * The TIPS view (17 Nov 2026, the approved mock tips-cards-elegant.html): its title (the stent, its state, Velocity | Pressure and a menu for the other two
 * views), one line of numbers, the stent drawn to scale with its chart under it on the same x (tips-figure.js), and the three rows that edit it
 * (stent-editor.js), whose tiles' tray unrolls under the tiles, under the chart, so the stent and its chart stay in sight while it is edited.
 */
export function createIrTips({ host, onChange = () => {} } = {}) {
  let view = 'measure', which = 'TIPS', key = '', lastWord = 'TIPS', frame = null, statusT = '';
  const btnM = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'measure', 'aria-pressed': 'true' }, 'Measure');
  const btnT = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'tips', 'aria-pressed': 'false', 'aria-disabled': 'true' }, h('span', {}, 'TIPS'));
  btnT.classList.add('off');
  const head = h('div', { class: 'pressure-switch ir-switch', role: 'group', 'aria-label': 'IR view' }, btnM, btnT);
  btnM.addEventListener('click', () => setView('measure'));
  btnT.addEventListener('click', () => { if (btnT.getAttribute('aria-disabled') === 'true') { toast(NO_STENT_WHY); return; } setView('tips'); });

  // ── the title row: the stent (a choice when there are two), its state, the lens, the menu ──
  const chips = h('div', { class: 'ir-chips', role: 'group', 'aria-label': 'Stent', 'data-n': '0' });
  const status = h('span', { class: 'ir-status', 'data-sev': 'none' }, h('span', { class: 'ir-status-t' }, 'Patent'));
  const lensV = h('button', { type: 'button', class: 'ps-btn', 'data-lens': 'velocity', 'aria-pressed': 'true' }, 'Velocity');
  const lensP = h('button', { type: 'button', class: 'ps-btn', 'data-lens': 'pressure', 'aria-pressed': 'false' }, 'Pressure');
  const lensSw = h('div', { class: 'pressure-switch ir-lens', role: 'group', 'aria-label': 'What the stent shows' }, lensV, lensP);
  lensV.addEventListener('click', () => setLens('velocity')); lensP.addEventListener('click', () => setLens('pressure'));
  const more = h('button', { type: 'button', class: 'ir-more', 'aria-label': 'More views', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, svgIcon('more'));
  const menuBtns = SUBS.map(([k, name]) => h('button', { type: 'button', class: 'ir-mi', role: 'menuitemradio', 'data-sub': k, 'aria-checked': k === 'inside' ? 'true' : 'false' }, svgIcon('check', 'ir-mi-ic'), h('span', {}, name)));
  const menu = h('div', { class: 'ir-menu', role: 'menu', 'aria-label': 'TIPS views', 'data-open': 'false' }, menuBtns);
  menu.inert = true;
  for (const b of menuBtns) b.addEventListener('click', () => { setMenu(false); setSub(b.dataset.sub); });
  more.addEventListener('click', () => setMenu(menu.dataset.open !== 'true'));
  const top = h('div', { class: 'ir-top' }, chips, status, lensSw, more, menu);
  // ── the one line of numbers ──
  const keys = KEYS.map((t) => { const b = h('b', {}, '—'); const e = h('span', { class: 'ir-kv', 'data-k': t.id, title: t.title }, h('em', {}, t.k), b, h('u', {}, t.u)); return { t, e, b, txt: '' }; });
  const keyLine = h('div', { class: 'ir-keys' }, keys.map((x) => x.e));
  // ── the stent and its chart, and the rows that edit it, in one room ──
  const zone = h('div', { class: 'se-zone ir-zone' });
  // (An opened panel under the chart may reach past the pane's foot on a phone: the view scrolls down only as far as the panel's foot needs, so the chart stays as far in sight as it can.)
  const reveal = (panel) => { const a = readBox(panel), b = readBox(el); if (!a || !b) return; const over = a.bottom - b.bottom; if (over > 1) el.scrollBy?.({ top: over + 8, behavior: reduced() ? 'auto' : 'smooth' }); };
  const editor = createStentEditor({ id: which, lead: true, zone, reveal });   // (the lead: a vessel card's editor folds to a line while this one is shown)
  zone.append(editor.el, editor.panel);
  let fig = null;
  const figure = () => { if (!fig) { fig = createTipsFigure({ id: which, labels: true, chart: true }); fig.setLens(lens); zone.prepend(fig.el); } return fig; };   // alloc-rare: once, when the view first shows
  const inside = h('div', { class: 'ir-inside' }, keyLine, zone);
  const cmp = createIrCompare(), crv = createIrCurves();
  let sub = 'inside', lens = 'velocity';
  const el = h('div', { class: 'ir-tips', 'data-pane-view': 'tips', 'data-sub': 'inside' }, top, inside, crv.el, cmp.el);
  // (The tiles' tray unrolls under the tiles, which sit under the chart (17 Nov, Mohammad: "I wanna see the graph while editing"; option A): the stent and its
  // chart stay in sight and follow each drag.)

  function setMenu(on) {
    on = !!on;
    if ((menu.dataset.open === 'true') === on) return;
    menu.dataset.open = on ? 'true' : 'false'; menu.inert = !on; more.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) (menuBtns.find((b) => b.dataset.sub === sub) || menuBtns[0]).focus({ preventScroll: true });
  }
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); more.focus({ preventScroll: true }); } });
  menu.addEventListener('focusout', (e) => { if (!menu.contains(e.relatedTarget) && e.relatedTarget !== more) setMenu(false); });
  function setLens(k) {
    k = k === 'pressure' ? 'pressure' : 'velocity';
    if (k === lens) return;
    lens = k;
    attrSoon(lensV, 'aria-pressed', k === 'velocity' ? 'true' : 'false'); attrSoon(lensP, 'aria-pressed', k === 'pressure' ? 'true' : 'false');
    fig?.setLens(k);
  }
  function setView(v) {
    if (v === view) return;
    // The view that comes in fades up where the other was (display flips at once; its parts rise from nothing, as Scope's second view does), and the one that
    // goes out fades where it stood over it (leave-fade.js: lifted into its ghost before the flip, since a hidden view cannot fade; it was gone at once and the card
    // blank for a beat, 17 Nov 2026).
    const parts = v === 'tips' ? [el] : [...host.children].filter((c) => c !== el);
    const out = leaveFade(v === 'tips' ? [...host.children].filter((c) => c !== el) : [el], parts[0]);
    view = v;
    host.dataset.view = v;
    attrSoon(btnM, 'aria-pressed', v === 'measure' ? 'true' : 'false'); attrSoon(btnT, 'aria-pressed', v === 'tips' ? 'true' : 'false');
    for (const c of parts) c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
    out.start();
    if (v !== 'tips') { crv.stop(); setMenu(false); editor.close(); }
    editor.setShown(active && v === 'tips');
    onChange();
    if (frame) update(frame);
  }
  function setSub(v) {
    if (v === sub || !SUBS.some((x) => x[0] === v)) return;
    const out = leaveFade([subEl(sub)], subEl(v));   // (the view that goes out fades where it stood, leave-fade.js)
    sub = v;
    el.dataset.sub = v;
    for (const b of menuBtns) b.setAttribute('aria-checked', b.dataset.sub === v ? 'true' : 'false');
    if (v !== 'curves') crv.stop();
    if (v !== 'inside') editor.close();
    editor.setShown(active && view === 'tips' && v === 'inside');
    subEl(v).animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });   // (the view that comes in fades up where the other was)
    out.start();
    onChange();
    if (frame) update(frame);
  }
  const subEl = (v) => (v === 'compare' ? cmp.el : v === 'curves' ? crv.el : inside);
  host.dataset.view = 'measure';

  // The stent set: the switch's word and whether it is lit, and the title (one stent: its name; two: a choice).
  const ids = [];
  function pick(id) { which = id; editor.setStent(id); fig?.setStent(id); syncChips(); if (frame) update(frame); }
  function syncStents(p) {
    stentIds(p, ids);
    const k = ids.join();
    if (k !== key) {
      key = k;
      if (!ids.includes(which) && ids.length) { which = ids[0]; editor.setStent(which); fig?.setStent(which); }
      const word = ids.length ? (ids.includes('TIPS') ? 'TIPS' : ids[0]) : 'TIPS';
      if (word !== lastWord) { lastWord = word; swapText(btnT.firstChild, word); }
      const on = ids.length > 0;
      classSoon(btnT, 'off', !on); attrSoon(btnT, 'aria-disabled', on ? 'false' : 'true');
      chips.dataset.n = String(ids.length);
      chips.replaceChildren(...(ids.length ? ids : ['TIPS']).map((id) => h('button', { type: 'button', class: 'ir-chip', 'data-id': id, 'aria-pressed': String(id === which), onclick: () => pick(id) }, id)));   // alloc-rare: when the set of stents changes, never in a frame
      // (A stent taken away with the view open: back to Measure, which fades up. Nothing is held, nothing is left blank.)
      if (!on && view === 'tips') setView('measure');
    }
  }
  /** Open the view on a stent (a vessel card's IR shortcut, a folded card's line): the title, the editor and the figure follow, then the TIPS view shows. */
  function openStent(id) {
    syncStents(store.get().params);   // (the pane may not have been fed a frame yet, the first time a card's IR opens it: read the stents now)
    if (!id || !ids.includes(id)) return false;
    pick(id);
    if (sub !== 'inside') setSub('inside');
    setView('tips');
    if (frame) update(frame);
    return true;
  }
  function syncChips() { for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.id === which)); }

  function update(f) {
    frame = f;
    const st0 = store.get(), p = st0.params;
    syncStents(p);
    if (view !== 'tips' || !active) return;
    const m = f?.metrics;
    if (!m) return;
    if (sub === 'compare') { cmp.update(f, which); return; }
    if (sub === 'curves') { crv.update(f, which); return; }
    figure().update(f);
    const st = which === 'DIPS' ? m.dips : m.tips, hidden = hiddenNow(st0);
    // the state beside the name: flowing, or (one rule, flow-cuts.js stentStill) almost still
    const still = !!st?.still, sT = still ? 'No flow' : 'Patent';
    if (sT !== statusT) { statusT = sT; swapText(status.lastChild, sT); dataSoon(status, 'sev', still ? 'caution' : 'none'); }
    for (const x of keys) {
      const t = x.t, raw = st || t.id === 'ppg' ? t.v(m, st) : null;
      const v = raw == null || hidden?.has(t.hide) ? null : raw;
      const txt = v == null || !Number.isFinite(v) ? '—' : fmt(v, t.d);
      if (txt !== x.txt) { x.txt = txt; x.b.textContent = txt; x.e.setAttribute('aria-label', `${t.k}: ${v == null ? 'not measured' : `${txt} ${t.u}`}`); }
    }
  }
  /** The card is shown or hidden (dock.js pane.shown). Hidden, the sweep is cancelled and the stent pictures are not fed; shown, the live frame is handed over again. */
  let active = true;
  function setActive(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    crv.setActive(on);
    if (!on) { setMenu(false); editor.close(); }
    editor.setShown(on && view === 'tips' && sub === 'inside');
    if (on && frame) update(frame);
  }
  host.append(el);
  return { head, el, update, view: () => view, setView, sub: () => sub, setSub, which: () => which, setActive, openStent, lens: () => lens, setLens, figure: () => fig, editor, curves: crv };
}
