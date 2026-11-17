// The TIPS view of Tests › IR (16 Nov 2026; plan /mnt/project-files/tips-geometry/tips-test-card-plan.md): the stent's own test, beside the
// Measure view the HVPG tab always was. A two-way switch (Measure | TIPS, the same control as Pressure's and Scope's) sits in the pane's head row,
// and this file builds it and the TIPS view. The view is a read-only test: the stent is changed on its vessel card (Details) or in Treat, never here.
//
// Rules this keeps (Mohammad, 16 Nov 2026 and earlier):
//   - Nothing pops in or out. The TIPS segment is always there; with no stent it dims (opacity) and a tap says why, as a procedure button that cannot
//     be played does (hvpg-proc.js). A stent placed lights it; nothing switches the view for the person. A stent taken away while the view is open
//     sends it back to Measure, whose panel fades up (as Scope's second view does, dock.js setEndoSub).
//   - After a TIPS nothing here says HVPG: the two gradients are the PPG (portal vein − IVC) and the stent's own drop, "Across stent".
//   - The numbers are the stent's own, from the engine's one calculation (metrics.tips, metrics.dips: engine.stentState, stent-geom.js), the same as the
//     fingerprint's tipsFlow and tipsDp and the Doppler's gates. The peak velocity is the Doppler card's own: STENT_DOPPLER_K times the fastest gate.
//   - The readings are on this view alone: not on the bottom bar or in Readouts, where they would appear and vanish with the stent.
// Push A is the switch, the stent chip and four readings. The side view, the pressure bar, the curves and Compare come on top of this (plan §8).

import { h, fmt, clamp, countTo, swapText, toast } from './util.js';
import { store, hiddenNow } from './store.js';
import { tileEl } from './tile-el.js';
import { classSoon, attrSoon, dataSoon } from './class-soon.js';
import { PPG_CUTS } from '../engine/pressure-cuts.js';
import { stentReadsOf, STENT_DOPPLER_K } from '../engine/topology.js';
import { fillQ } from './shown.js';
import { tipsGoal } from './table-marks.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';

/** The stents the Tests view reads, in the order it names them: the TIPS, then the DIPS. (A drawn stent has no metrics yet: plan §8.) */
export const stentIds = (p, out = []) => { out.length = 0; if (p?.tips?.on) out.push('TIPS'); if (p?.dips?.on) out.push('DIPS'); return out; };
/** The Doppler card's own range for a stent's peak velocity, cm/s (doppler.js, topology.js: 90 to 190). */
export const STENT_RANGE = Object.freeze([90, 190]);
const READ = [0, 0, 0];   // alloc-rare: made once (stentReadsOf writes into it; stentPeak reads it at once)
/** The fastest of a stent's three Doppler gates as a scanner reads it, cm/s: the open stent's mean speed, a narrowing's jet at its gates, times K. */
export function stentPeak(params, id, st) {
  if (!st || !(st.vOpen >= 0)) return null;
  const r = stentReadsOf(params, id, st.vOpen, READ);
  return STENT_DOPPLER_K * Math.max(r[0], r[1], r[2]);
}
const mm = (x) => String(Math.round(x * 10) / 10);
/** The line under the chip: the stent's width, and its narrowing when it has one. */
export const stentLine = (st) => (!st ? 'No stent' : st.s > 0.0005 ? `${mm(st.d)} mm, narrowed to ${mm(st.dWaist)} mm` : `${mm(st.d)} mm, open`);

export const NO_STENT_WHY = 'There is no TIPS or DIPS in this patient. Place one from Treat, and this view fills in.';
const PPG_TITLE = 'PPG = portal vein pressure − IVC pressure, read through the stent. After a TIPS it is the gradient to read; the target is under 12 mmHg.';
// The four readings: name, unit, decimals, the bar's scale and ticks, the value from the model's metrics, the word under it and its band.
// (The ids and words are the instrument-cards plan's: "Across stent", "Stent peak velocity". `hide` is the readout set that hides it in Explore.)
const TILES = [
  { id: 'ppg', k: 'PPG', u: 'mmHg', d: 1, scale: [0, 25], ticks: [PPG_CUTS.red], hide: 'pv', title: PPG_TITLE,
    v: (m) => m.ppg, word: (v) => tipsGoal(v)[1], sev: (v) => (tipsGoal(v)[0] === 'ok' ? 'ok' : 'danger') },
  { id: 'flow', k: 'TIPS flow', u: 'L/min', d: 1, scale: [0, 3], ticks: [], hide: 'model', title: 'The flow through the stent, from the portal side to the hepatic vein.',
    v: (m, st) => st?.flow ?? null, word: () => '', sev: () => 'none' },
  { id: 'dp', k: 'Across stent', u: 'mmHg', d: 1, scale: [0, 25], ticks: [], hide: 'model', title: 'The pressure drop from the stent\'s portal end to its hepatic vein end. It is smaller than the PPG: the rest is outside the stent.',
    v: (m, st) => st?.dp ?? null, word: () => '', sev: () => 'none' },
  { id: 'peak', k: 'Stent peak velocity', u: 'cm/s', d: 0, scale: [0, 400], ticks: STENT_RANGE, hide: 'model', title: 'The fastest of the three Doppler gates, as the Doppler card prints it. A working stent reads 90 to 190 cm/s.',
    v: (m, st, p, id) => stentPeak(p, id, st), word: (v) => (v >= STENT_RANGE[0] && v <= STENT_RANGE[1] ? 'In range' : 'Out of range'), sev: (v) => (v >= STENT_RANGE[0] && v <= STENT_RANGE[1] ? 'none' : 'caution') },
];
const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1);

/**
 * host: the pane's element, which holds the Measure view's own parts and, last, the TIPS view this makes (it sets host.dataset.view; the stylesheet shows one).
 * onChange(): the pane repaints. onEdit(id): open the stent's vessel card.
 * Returns { head, el, update(frame), view() }.
 */
export function createIrTips({ host, onChange = () => {}, onEdit = () => {} } = {}) {
  let view = 'measure', which = 'TIPS', key = '', lastWord = 'TIPS', frame = null, lineT = '';
  const btnM = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'measure', 'aria-pressed': 'true' }, 'Measure');
  const btnT = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'tips', 'aria-pressed': 'false', 'aria-disabled': 'true' }, h('span', {}, 'TIPS'));
  btnT.classList.add('off');
  const head = h('div', { class: 'pressure-switch ir-switch', role: 'group', 'aria-label': 'IR view' }, btnM, btnT);
  btnM.addEventListener('click', () => setView('measure'));
  btnT.addEventListener('click', () => { if (btnT.getAttribute('aria-disabled') === 'true') { toast(NO_STENT_WHY); return; } setView('tips'); });

  const chips = h('div', { class: 'ir-chips', role: 'group', 'aria-label': 'Stent' });
  const line = h('span', { class: 'ir-line' });
  const edit = h('button', { type: 'button', class: 'btn sm ir-edit', title: 'Opens the stent\'s vessel card, where its diameter, narrowing and ends are set. This view only reads.', onclick: () => onEdit(which) }, 'Edit stent');
  const tiles = TILES.map((t) => {
    const x = tileEl({ id: 'ir-' + t.id, k: t.k, u: t.u, d: t.d, scale: t.scale, ticks: t.ticks, title: t.title }, { inert: true, names: false, width: true });
    return { t, ...x, sev: null, fillL: null, fillW: null, aria: '' };
  });
  const note = h('p', { class: 'ctl-sub ir-note' }, 'Across stent is the drop between the stent\'s two ends; the PPG runs on from the portal vein to the IVC. After a TIPS, a PPG under 12 mmHg is the target.');
  const el = h('div', { class: 'ir-tips', 'data-pane-view': 'tips' }, h('div', { class: 'ir-stents' }, chips, line, edit), h('div', { class: 'ir-tiles rp-tiles' }, tiles.map((x) => x.el)), note);

  function setView(v) {
    if (v === view) return;
    view = v;
    host.dataset.view = v;
    attrSoon(btnM, 'aria-pressed', v === 'measure' ? 'true' : 'false'); attrSoon(btnT, 'aria-pressed', v === 'tips' ? 'true' : 'false');
    // The view that comes in fades up where the other was (display flips at once; its parts rise from nothing, as Scope's second view does).
    const parts = v === 'tips' ? [el] : [...host.children].filter((c) => c !== el);
    for (const c of parts) c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
    onChange();
    if (frame) update(frame);
  }
  host.dataset.view = 'measure';

  // The stent set: the switch's word and whether it is lit, and the chips (one per stent; one chip is also the view's title).
  const ids = [];
  function syncStents(p) {
    stentIds(p, ids);
    const k = ids.join();
    if (k !== key) {
      key = k;
      if (!ids.includes(which) && ids.length) which = ids[0];
      const word = ids.length ? (ids.includes('TIPS') ? 'TIPS' : ids[0]) : 'TIPS';
      if (word !== lastWord) { lastWord = word; swapText(btnT.firstChild, word); }
      const on = ids.length > 0;
      classSoon(btnT, 'off', !on); attrSoon(btnT, 'aria-disabled', on ? 'false' : 'true');
      chips.replaceChildren(...ids.map((id) => h('button', { type: 'button', class: 'ir-chip', 'data-id': id, 'aria-pressed': String(id === which), onclick: () => { which = id; syncChips(); if (frame) update(frame); } }, id)));   // alloc-rare: when the set of stents changes, never in a frame
      // (A stent taken away with the view open: back to Measure, which fades up. Nothing is held, nothing is left blank.)
      if (!on && view === 'tips') setView('measure');
    }
  }
  function syncChips() { for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.id === which)); }

  function update(f) {
    frame = f;
    const st0 = store.get(), p = st0.params;
    syncStents(p);
    if (view !== 'tips') return;
    const m = f?.metrics;
    if (!m) return;
    const st = which === 'DIPS' ? m.dips : m.tips, hidden = hiddenNow(st0);
    const lt = stentLine(st);
    if (lt !== lineT) { lineT = lt; swapText(line, lt); }
    for (const x of tiles) {
      const t = x.t, raw = st || t.id === 'ppg' ? t.v(m, st, p, which) : null;
      const v = raw == null || hidden?.has(t.hide) ? null : raw;
      let sev = 'none', word = v == null ? 'Not measured' : '';
      if (v == null) { countTo(x.val, null); if (x.fillW !== 0) { x.fillW = 0; x.fill.style.setProperty('--fw', 0); } }
      else if (!Number.isFinite(v)) { countTo(x.val, v, t.d); continue; }
      else {
        countTo(x.val, v, t.d, { eased: st0.running });
        sev = t.sev(v); word = t.word(v);
        const w = pos(t, v), fl = fillQ(0), fw = fillQ(w);
        if (x.fillL !== fl || x.fillW !== fw) { x.fillL = fl; x.fillW = fw; x.fill.style.setProperty('--fl', fl); x.fill.style.setProperty('--fw', fw); }
      }
      x.el.classList.toggle('hidden-val', v == null);
      if (sev !== x.sev) { x.sev = sev; dataSoon(x.el, 'sev', sev); }
      if (word !== x.word) { x.word = word; swapText(x.st, word); x.st.classList.toggle('unmeas', v == null); }
      const aria = `${t.k}: ${v == null ? 'not measured' : `${fmt(v, t.d)} ${t.u}${word ? ', ' + word : ''}`}`;
      if (aria !== x.aria) { x.aria = aria; x.el.setAttribute('aria-label', aria); }
    }
    const nk = which === 'DIPS' ? 'DIPS flow' : 'TIPS flow';
    if (tiles[1].lbl !== nk) { tiles[1].lbl = nk; const k = tiles[1].el.querySelector('.k'); if (k) swapText(k, nk); }
  }
  host.append(el);
  return { head, el, update, view: () => view, setView, which: () => which };
}
