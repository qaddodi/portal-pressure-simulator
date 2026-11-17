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
// Push A was the switch, the stent chip and four readings. Push B puts the stent cards under them (tool-stent.js createStent, built by the instrument-cards
// thread): the side view and the bar of where the pressure goes, one picture each, fed the dock's live frame (update(f), never pin). They are made the first
// time the view opens, so a person who never opens it pays nothing. Push C adds the sub-switch Inside the stent | Compare (ir-compare.js: Then, Now, Change against
// the app's own pin). Push D adds Tube vs patient (ir-curves.js: the stent's flow against one setting, in the patient and as a tube on a bench, each point settled on
// a calculation worker of its own). The trace comes on top of this (plan §8).

import { h, fmt, clamp, countTo, swapText, toast } from './util.js';
import { store, hiddenNow } from './store.js';
import { tileEl } from './tile-el.js';
import { classSoon, attrSoon, dataSoon } from './class-soon.js';
import { PPG_CUTS } from '../engine/pressure-cuts.js';
import { fillQ } from './shown.js';
import { tipsGoal, STENT_RANGE as RANGE } from './table-marks.js';
import { stentBand, gateKindsOf, reductionJet } from '../engine/stent-geom.js';
import { createStent } from './tool-stent.js';
import { createIrCompare } from './ir-compare.js';
import { createIrCurves } from './ir-curves.js';
import { createStentEditor } from './stent-editor.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';

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
  const w = st.red > 0.0005 ? `waist ${mm(st.d * (1 - st.red))} mm over ${mm(st.geom?.waist ?? 1)} cm` : '';
  const e = st.end > 0.0005 ? `${st.site === 'proximal' ? 'proximal' : 'distal'} stenosis to ${mm(st.d * (1 - st.end))} mm` : '';
  return `${mm(st.d)} mm, ${w && e ? `${w}, ${e}` : w || e || 'open'}`;
};

export const NO_STENT_WHY = 'There is no TIPS or DIPS in this patient. Place one from Treat, and this view fills in.';
const PPG_TITLE = 'PPG = portal vein pressure − IVC pressure, read through the stent. After a TIPS it is the gradient to read. 12 mmHg is the reference line, not a target for this patient; the aim is set by the clinical goal.';
// The four readings: name, unit, decimals, the bar's scale and ticks, the value from the model's metrics, the word under it and its band.
// (The ids and words are the instrument-cards plan's: "Across stent", "Stent peak velocity". `hide` is the readout set that hides it in Explore.)
const TILES = [
  { id: 'ppg', k: 'PPG', u: 'mmHg', d: 1, scale: [0, 25], ticks: [PPG_CUTS.red], hide: 'pv', title: PPG_TITLE,
    v: (m) => m.ppg, word: (v) => tipsGoal(v, true)[1], sev: () => 'none' },   // (a reference line, not a verdict: neither a target met nor missed; the words are table-marks.js tipsGoal's, the one copy)
  { id: 'flow', k: 'TIPS flow', u: 'L/min', d: 1, scale: [0, 3], ticks: [], hide: 'model', title: 'The flow through the stent, from the portal side to the hepatic vein.',
    v: (m, st) => st?.flow ?? null, word: () => '', sev: () => 'none' },
  { id: 'dp', k: 'Across stent', u: 'mmHg', d: 1, scale: [0, 25], ticks: [], hide: 'model', title: 'The pressure drop from the stent\'s portal end to its hepatic vein end. It is smaller than the PPG: the rest is outside the stent.',
    v: (m, st) => st?.dp ?? null, word: () => '', sev: () => 'none' },
  { id: 'peak', k: 'Stent peak velocity', u: 'cm/s', d: 0, scale: [0, 400], ticks: STENT_RANGE, hide: 'model', title: 'The fastest of the three Doppler gates, as the Doppler card prints it. A working 8 to 10 mm stent reads 90 to 190 cm/s; another diameter shows a provisional model band.',
    v: (m, st) => st?.vPeak ?? null,
    // (An 8 to 10 mm stent: the reported range, "In range" / "Out of range". Another diameter: a model band the app scaled, provisional, in words and tone that are not a verdict.)
    word: (v, st) => { const r = peakBand(st), inside = v >= r[0] && v <= r[1]; return st?.still ? 'No flow' : v > r[1] && reductionJetIn(st, r[1]) ? 'Reduction jet' : r === STENT_RANGE ? (inside ? 'In range' : 'Out of range') : inside ? 'In band' : v < r[0] ? 'Under band' : 'Over band'; },
    sev: (v, st) => { const r = peakBand(st); return st?.still || r === STENT_RANGE && !(v > r[1] && reductionJetIn(st, r[1])) && !(v >= r[0] && v <= r[1]) ? 'caution' : 'none'; } },
];
const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1);

/**
 * host: the pane's element, which holds the Measure view's own parts and, last, the TIPS view this makes (it sets host.dataset.view; the stylesheet shows one).
 * onChange(): the pane repaints. (onEdit is no longer used: the stent is edited in the view itself.)
 * Returns { head, el, update(frame), view() }.
 */
export function createIrTips({ host, onChange = () => {} } = {}) {
  let view = 'measure', which = 'TIPS', key = '', lastWord = 'TIPS', frame = null, lineT = '';
  const btnM = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'measure', 'aria-pressed': 'true' }, 'Measure');
  const btnT = h('button', { type: 'button', class: 'ps-btn', 'data-view': 'tips', 'aria-pressed': 'false', 'aria-disabled': 'true' }, h('span', {}, 'TIPS'));
  btnT.classList.add('off');
  const head = h('div', { class: 'pressure-switch ir-switch', role: 'group', 'aria-label': 'IR view' }, btnM, btnT);
  btnM.addEventListener('click', () => setView('measure'));
  btnT.addEventListener('click', () => { if (btnT.getAttribute('aria-disabled') === 'true') { toast(NO_STENT_WHY); return; } setView('tips'); });

  const chips = h('div', { class: 'ir-chips', role: 'group', 'aria-label': 'Stent' });
  const line = h('span', { class: 'ir-line' });
  const editor = createStentEditor({ id: which });
  const tiles = TILES.map((t) => {
    const x = tileEl({ id: 'ir-' + t.id, k: t.k, u: t.u, d: t.d, scale: t.scale, ticks: t.ticks, title: t.title }, { inert: true, names: false, width: true });
    return { t, ...x, sev: null, fillL: null, fillW: null, aria: '', ticks: x.el.querySelectorAll('.rb-tick'), band: '' };
  });
  const figs = h('div', { class: 'ir-figs' });
  const editorSlot = h('div', { class: 'ir-editor' }, editor.el);   // (the stent editor, above the sub-switch: stent-editor.js)
  let stent = null, sub = 'inside';   // (the stent cards are made the first time the view opens)
  const cmp = createIrCompare(), crv = createIrCurves();
  const btnI = h('button', { type: 'button', class: 'ps-btn', 'data-sub': 'inside', 'aria-pressed': 'true', title: 'Inside the stent: the readings, the stent in side view and where its pressure goes' }, 'Inside');
  const btnV = h('button', { type: 'button', class: 'ps-btn', 'data-sub': 'curves', 'aria-pressed': 'false' }, 'Tube vs patient');
  const btnC = h('button', { type: 'button', class: 'ps-btn', 'data-sub': 'compare', 'aria-pressed': 'false' }, 'Compare');
  const subSwitch = h('div', { class: 'pressure-switch ir-sub', role: 'group', 'aria-label': 'TIPS view' }, btnI, btnV, btnC);
  btnI.addEventListener('click', () => setSub('inside')); btnV.addEventListener('click', () => setSub('curves')); btnC.addEventListener('click', () => setSub('compare'));
  const subEl = (v) => (v === 'compare' ? cmp.el : v === 'curves' ? crv.el : inside);   // (Inside: the readings and the stent card, one drawing and one lens switch)
  const inside = h('div', { class: 'ir-inside' }, h('div', { class: 'ir-tiles rp-tiles' }, tiles.map((x) => x.el)), figs);
  const stentsRow = h('div', { class: 'ir-stents' }, chips, line);
  const el = h('div', { class: 'ir-tips', 'data-pane-view': 'tips', 'data-sub': 'inside' }, stentsRow, editorSlot, subSwitch, inside, crv.el, cmp.el);

  function setView(v) {
    if (v === view) return;
    view = v;
    host.dataset.view = v;
    attrSoon(btnM, 'aria-pressed', v === 'measure' ? 'true' : 'false'); attrSoon(btnT, 'aria-pressed', v === 'tips' ? 'true' : 'false');
    // The view that comes in fades up where the other was (display flips at once; its parts rise from nothing, as Scope's second view does).
    const parts = v === 'tips' ? [el] : [...host.children].filter((c) => c !== el);
    for (const c of parts) c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
    if (v === 'tips') showStent(); else crv.stop();
    onChange();
    if (frame) update(frame);
  }
  function setSub(v) {
    if (v === sub) return;
    sub = v;
    el.dataset.sub = v;
    attrSoon(btnI, 'aria-pressed', v === 'inside' ? 'true' : 'false'); attrSoon(btnV, 'aria-pressed', v === 'curves' ? 'true' : 'false'); attrSoon(btnC, 'aria-pressed', v === 'compare' ? 'true' : 'false');
    if (v !== 'curves') crv.stop();
    if (v === 'inside') showStent();
    subEl(v).animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });   // (the view that comes in fades up where the other was)
    onChange();
    if (frame) update(frame);
  }
  // The stent cards: the lumen to scale and the bar of where the pressure goes (to the PPG, the part outside the stent hatched). Which stent follows the chip.
  let cfgId = '';
  function showStent() {
    if (!stent) {
      stent = createStent(); figs.append(stent.el); cfgId = '';
      // (The card's one switch, Velocity | Pressure | Where it goes, lives in the view's own header row, beside the stent's chip, not between the pictures: there it took height the figures' band
      // did not count and floated loose under the drawing. It is the same element and its handlers; this view gives it the switches' look.)
      const lsw = stent.el.querySelector(':scope > .sc-lens');
      if (lsw) { lsw.classList.add('pressure-switch', 'ir-color'); stentsRow.append(lsw); }
    }   // alloc-rare: once, when the view first opens
    // (One card: the side view with its chart under it, which follows the lens. --fig-r, the pictures' width over their height together, comes from the card itself (stent.ratio()), read again
    // when the lens or the size changes (update, below), so the figures take the width of the card first.)
    if (cfgId !== which) {
      cfgId = which;
      stent.configure({ kind: 'stent', vessel: which, show: ['card'], to: 'ppg' });   // alloc-rare: when the chip changes
      figR = '';
    }
  }
  let figR = '';   // (the last --fig-r written: a custom property is written only when the card's ratio changes)
  function fitFigs() {
    const r = stent.ratio();
    if (!(r > 0)) return;
    const t = r.toFixed(3);
    if (t !== figR) { figR = t; figs.style.setProperty('--fig-r', t); }
  }
  host.dataset.view = 'measure';

  // The stent set: the switch's word and whether it is lit, and the chips (one per stent; one chip is also the view's title).
  const ids = [];
  function syncStents(p) {
    stentIds(p, ids);
    const k = ids.join();
    if (k !== key) {
      key = k;
      if (!ids.includes(which) && ids.length) { which = ids[0]; editor.setStent(which); }
      const word = ids.length ? (ids.includes('TIPS') ? 'TIPS' : ids[0]) : 'TIPS';
      if (word !== lastWord) { lastWord = word; swapText(btnT.firstChild, word); }
      const on = ids.length > 0;
      classSoon(btnT, 'off', !on); attrSoon(btnT, 'aria-disabled', on ? 'false' : 'true');
      chips.replaceChildren(...ids.map((id) => h('button', { type: 'button', class: 'ir-chip', 'data-id': id, 'aria-pressed': String(id === which), onclick: () => { which = id; editor.setStent(id); syncChips(); if (frame) update(frame); } }, id)));   // alloc-rare: when the set of stents changes, never in a frame
      // (A stent taken away with the view open: back to Measure, which fades up. Nothing is held, nothing is left blank.)
      if (!on && view === 'tips') setView('measure');
    }
  }
  function syncChips() { for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.id === which)); }

  // The peak velocity tile's two cut-off ticks and its title follow the stent's own diameter (peakBand): written when the range changes, never per frame.
  function peakCuts(x, st) {
    const r = peakBand(st), k = `${r[0]}|${r[1]}`;
    if (k === x.band) return;
    x.band = k;
    const t = x.t;
    for (let i = 0; i < x.ticks.length; i++) x.ticks[i].style.left = pos(t, r[i]) * 100 + '%';
    x.el.title = r === STENT_RANGE ? t.title : `The fastest of the three Doppler gates, as the Doppler card prints it. The model band for a ${mm(st.d)} mm stent is ${r[0]} to ${r[1]} cm/s. Provisional: the app scaled the reported 8 to 10 mm range (90 to 190 cm/s) for this diameter, and no study validates it. It is not a surveillance threshold.`;
  }

  function update(f) {
    frame = f;
    const st0 = store.get(), p = st0.params;
    syncStents(p);
    if (view !== 'tips' || !active) return;
    const m = f?.metrics;
    if (!m) return;
    if (sub === 'compare') { cmp.update(f, which); return; }
    if (sub === 'curves') { crv.update(f, which); return; }
    showStent();
    stent.update(f);
    fitFigs();
    const st = which === 'DIPS' ? m.dips : m.tips, hidden = hiddenNow(st0);
    const lt = stentLine(st);
    if (lt !== lineT) { lineT = lt; swapText(line, lt); }
    for (const x of tiles) {
      const t = x.t;
      if (t.id === 'peak') peakCuts(x, st);
      const raw = st || t.id === 'ppg' ? t.v(m, st, p, which) : null;
      const v = raw == null || hidden?.has(t.hide) ? null : raw;
      let sev = 'none', word = v == null ? 'Not measured' : '';
      if (v == null) { countTo(x.val, null); if (x.fillW !== 0) { x.fillW = 0; x.fill.style.setProperty('--fw', 0); } }
      else if (!Number.isFinite(v)) { countTo(x.val, v, t.d); continue; }
      else {
        countTo(x.val, v, t.d, { eased: st0.running });
        sev = t.sev(v, st); word = t.word(v, st);
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
  /** The card is shown or hidden (dock.js pane.shown). Hidden, the sweep is cancelled and the stent pictures are not fed; shown, the live frame is handed over again. */
  let active = true;
  function setActive(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    crv.setActive(on);
    if (on && frame) update(frame);
  }
  host.append(el);
  return { head, el, update, view: () => view, setView, sub: () => sub, setSub, which: () => which, setActive, curves: crv };
}
