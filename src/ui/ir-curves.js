// The Tube vs patient curves of Tests › IR › TIPS (17 Nov 2026; plan /mnt/project-files/tips-geometry/tips-test-card-plan.md §3.3, push D): the stent's flow against
// one setting of the stent, twice. The solid line is the stent IN THE PATIENT: each point is the live patient with only that setting changed and settled, worked out
// on a calculation worker of its own (calc-client.js; the live model keeps running). The dashed line is the same stent as a TUBE ON A BENCH, a fixed 7 mmHg across it
// and no patient behind it (stent-geom.js benchFlow, the engine's stentState .bench, the fingerprint's tipsBench). A tube loses more than a patient does when it is
// made worse, because the patient's portal pressure rises and pushes harder; the picture shows why a bench number overstates what a stent does.
// The chart is the deck's own (tool-curve.js createCurve), given a context that stands in for a slide: the live snapshot, the live parameters and the live fingerprint.
// Nothing here pins or edits a stent: the sweep reads, and the stent is changed on its vessel card (Details) or in Treat.
// After a TIPS nothing here says HVPG.

import { h } from './util.js';
import { store } from './store.js';
import { host } from './host.js';
import { createCurve } from './tool-curve.js';
import { sharedCalc } from './calc-client.js';
import { attrSoon, dataSoon } from './class-soon.js';
import { restPass } from './rest-pass.js';
import { GEOM_RANGE, BENCH_DP } from '../engine/stent-geom.js';

export const SWEEPS = ['diameter', 'waist', 'length'];
const LABEL = { diameter: 'Diameter', waist: 'Waist length', length: 'Stent length (idealized)' };
export const NO_WAIST = 'This stent has no narrowing, so its waist length changes nothing. Narrow it on its vessel card, then come back.';
const SETTLE_MS = 450;   // (a drag on the stent's card ends before the sweep starts: one sweep, not thirty)

/** The curve tool for a stent and a setting: the sweep's x axis, the two lines (the patient's flow, the bench's), their words. */
export function curveToolOf(which, sweep) {
  const id = which === 'DIPS' ? 'DIPS' : 'TIPS', k = id === 'DIPS' ? 'dips' : 'tips';
  const s = sweep === 'waist' ? { param: `stentGeom.${id}.waist`, from: GEOM_RANGE.waist[0], to: GEOM_RANGE.waist[1], step: 0.5, unit: 'cm' }
    : sweep === 'length' ? { param: `stentGeom.${id}.len`, from: GEOM_RANGE.len[0], to: GEOM_RANGE.len[1], step: 1, unit: 'cm' }
    : { param: `${k}.d`, from: 6, to: 12, step: 1, unit: 'mm' };
  return { kind: 'curve', ...s, label: LABEL[sweep] || LABEL.diameter, lines: [`${k}Flow`, `${k}Bench`], oneScale: true, cuts: false, names: { [`${k}Flow`]: 'In the patient', [`${k}Bench`]: `Tube alone, ${BENCH_DP} mmHg` } };
}
/** Whether a setting changes anything for a stent as it stands: a waist length matters only to a narrowed stent. */
export const sweepMatters = (sweep, st) => sweep !== 'waist' || (st?.s ?? 0) > 0.0005;

/** Returns { el, update(frame, which), stop() }. update is called while the view is on screen; the sweep starts when the stent, the setting or the patient changes. */
export function createIrCurves() {
  let sweep = 'diameter', which = 'TIPS', lastKey = '', lastParams = null, timer = 0, token = 0, frame = null, shownMatters = true;
  const curve = createCurve();
  const btns = SWEEPS.map((k) => h('button', { type: 'button', class: 'ps-btn', 'data-sweep': k, 'aria-pressed': String(k === sweep), onclick: () => setSweep(k) }, LABEL[k]));
  const sw = h('div', { class: 'pressure-switch ir-sweep', role: 'group', 'aria-label': 'Setting to vary' }, btns);
  const note = h('p', { class: 'ctl-sub ir-note' }, `Solid: the stent in this patient, each point settled. Dashed: the same stent as a tube on a bench with ${BENCH_DP} mmHg across it. The ring is the stent as it stands.`);
  const warn = h('p', { class: 'ctl-sub ir-note ir-warn' }, NO_WAIST);   // (always laid out, faded in and out by its owner's data-flat: nothing pops, nothing shifts)
  const el = h('div', { class: 'ir-curves', 'data-flat': '' }, sw, h('div', { class: 'ir-chart' }, curve.el), warn, note);

  function setSweep(k) {
    if (k === sweep) return;
    sweep = k;
    for (const b of btns) attrSoon(b, 'aria-pressed', String(b.dataset.sweep === k));
    lastKey = '';
    if (frame) update(frame, which);
  }
  // One sweep: the live snapshot and fingerprint, then the chart is told to work out its points from there.
  async function start(my) {
    let got;
    try { got = await Promise.all([host.request('snapshot'), host.request('metrics')]); } catch { return; }
    const snap = got[0]?.snap, fp = got[1]?.result;
    if (my !== token || !snap || !fp) return;
    const calc = sharedCalc(), params = store.get().params, deck = {};   // (a new deck object each time: the chart keeps its points per deck, so a changed patient is never answered from the one before)
    const ctx = {
      slide: { id: `ir-${my}` }, index: 0, deck, snap, params, fp, liveParams: () => store.get().params, fpOf: () => null, shown: () => true,
      run: (steps, from = snap) => { const out = []; return calc.sequence(steps, from, (m) => { out[m.i] = { snap: m.snap, base: m.base, params: m.params, fp: m.fp, extra: m.extra, trail: m.trail }; }).then((end) => (end?.type === 'error' ? null : out)); },
    };
    curve.configure(curveToolOf(which, sweep), ctx);
  }
  function update(f, w = 'TIPS') {
    frame = f;
    const st = store.get(), p = st.params, m = f?.metrics, stent = m ? (w === 'DIPS' ? m.dips : m.tips) : null;
    const matters = sweepMatters(sweep, stent);
    if (matters !== shownMatters) { shownMatters = matters; dataSoon(el, 'flat', matters ? '' : '1'); }
    if (!stent) return;
    // (The patient or the setting changed: a new sweep, after the changes stop. The stent's own numbers move every beat, so the key is the parameters, not the frame.)
    const key = `${w}|${sweep}`;
    if (key === lastKey && p === lastParams) return;
    lastKey = key; lastParams = p; which = w;
    clearTimeout(timer);
    const my = ++token;
    timer = setTimeout(() => restPass(() => start(my)), SETTLE_MS);
  }
  const stop = () => { clearTimeout(timer); token++; };
  return { el, update, stop, sweep: () => sweep, setSweep, chart: curve };
}
