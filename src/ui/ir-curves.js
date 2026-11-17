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

export const SWEEPS = ['diameter', 'end', 'waist', 'length'];
const LABEL = { diameter: 'Diameter', end: 'End narrowing', waist: 'Waist length', length: 'Stent length (idealized)' };
export const NO_WAIST = 'This stent has no waist, so a waist length changes nothing. Give it a waist in the stent editor above, then come back.';
const SETTLE_MS = 450;   // (a drag on the stent's card ends before the sweep starts: one sweep, not thirty)

/** The curve tool for a stent and a setting: the sweep's x axis, the two lines (the patient's flow, the bench's), their words. */
export function curveToolOf(which, sweep) {
  const id = which === 'DIPS' ? 'DIPS' : 'TIPS', k = id === 'DIPS' ? 'dips' : 'tips';
  const s = sweep === 'end' ? { param: `stenosis.${id}`, from: 0, to: 0.8, step: 0.05, unit: '%' }
    : sweep === 'waist' ? { param: `stentGeom.${id}.waist`, from: GEOM_RANGE.waist[0], to: GEOM_RANGE.waist[1], step: 0.5, unit: 'cm' }
    : sweep === 'length' ? { param: `stentGeom.${id}.len`, from: GEOM_RANGE.len[0], to: GEOM_RANGE.len[1], step: 1, unit: 'cm' }
    : { param: `${k}.d`, from: 6, to: 12, step: 1, unit: 'mm' };
  return { kind: 'curve', ...s, label: LABEL[sweep] || LABEL.diameter, lines: [`${k}Flow`, `${k}Bench`], oneScale: true, cuts: false, names: { [`${k}Flow`]: 'In the patient', [`${k}Bench`]: `Tube alone, ${BENCH_DP} mmHg` } };
}
/** Whether a setting changes anything for a stent as it stands: a waist length matters only to a stent with a waist (its reduction, st.red, above 0; the end narrowing is another setting). */
export const sweepMatters = (sweep, st) => sweep !== 'waist' || (st?.red ?? 0) > 0.0005;

/**
 * Returns { el, update(frame, which), stop(), setActive(on) }. update is called while the view is on screen; the sweep starts when the stent, the setting, the patient or the day changes.
 * The sweep is one piece of work with a life: idle, then WAITING (the change has to stop for SETTLE_MS), then LOADING (the live snapshot and fingerprint are asked for, the chart then works out
 * its points on the calculation worker), then DRAWN. Leaving the view (stop) cancels whatever has not finished and forgets that it was asked, so coming back asks again; a finished sweep is
 * kept, and only a changed patient, setting, stent or day makes another. The ring follows the live stent from every frame (the reference moment is the sweep's; the marker is now).
 * Injected for tests: request (the live engine's requests), calc (the calculator), chart (the deck's curve), delay.
 */
export function createIrCurves({ request = (type) => host.request(type), calc = sharedCalc, chart = createCurve, delay = SETTLE_MS } = {}) {
  let sweep = 'diameter', which = 'TIPS', timer = 0, token = 0, frame = null, shownMatters = true, active = true;
  let phase = 'idle', want = null, drawn = null, ringKey = '';   // (want: the key and parameters asked for; drawn: those the chart now shows)
  const curve = chart();
  const btns = SWEEPS.map((k) => h('button', { type: 'button', class: 'ps-btn', 'data-sweep': k, 'aria-pressed': String(k === sweep), onclick: () => setSweep(k) }, LABEL[k]));
  const sw = h('div', { class: 'pressure-switch ir-sweep', role: 'group', 'aria-label': 'Setting to vary' }, btns);
  const note = h('p', { class: 'ctl-sub ir-note' }, `Solid: the stent in this patient, each point settled. Dashed: the same shunt on a bench (the stent with its tract into the veins), with a fixed ${BENCH_DP} mmHg from its portal end to its hepatic end and no circulation to answer. The lines are worked out for the patient as they stand when this view opens, and again when the patient, the stent or the day changes; the ring follows the stent as it stands now.`);
  const warn = h('p', { class: 'ctl-sub ir-note ir-warn' }, NO_WAIST);   // (always laid out, faded in and out by its owner's data-flat: nothing pops, nothing shifts)
  const el = h('div', { class: 'ir-curves', 'data-flat': '' }, sw, h('div', { class: 'ir-chart' }, curve.el), warn, note);

  function setSweep(k) {
    if (k === sweep) return;
    sweep = k;
    for (const b of btns) attrSoon(b, 'aria-pressed', String(b.dataset.sweep === k));
    if (frame) update(frame, which);
  }
  // One sweep: the live snapshot and fingerprint, then the chart is told to work out its points from there.
  async function start(my, mine) {
    phase = 'loading';
    let got;
    try { got = await Promise.all([request('snapshot'), request('metrics')]); } catch { if (my === token) { phase = 'idle'; want = null; } return; }
    const snap = got[0]?.snap, fp = got[1]?.result;
    if (my !== token) return;   // (cancelled while asking: stop() has already put the work back to idle)
    if (!snap || !fp) { phase = 'idle'; want = null; return; }
    const c = calc(), params = store.get().params, deck = {};   // (a new deck object each time: the chart keeps its points per deck, so a changed patient is never answered from the one before)
    const ctx = {
      slide: { id: `ir-${my}` }, index: 0, deck, snap, params, fp, liveParams: () => store.get().params, fpOf: () => null, shown: () => true,
      run: (steps, from = snap) => { const out = []; return c.sequence(steps, from, (m) => { out[m.i] = { snap: m.snap, base: m.base, params: m.params, fp: m.fp, extra: m.extra, trail: m.trail }; }).then((end) => (end?.type === 'error' ? null : out)); },
    };
    drawn = mine; phase = 'drawn'; ringKey = '';
    curve.configure(curveToolOf(mine.which, mine.sweep), ctx);
  }
  // The ring: the stent as it stands now, on the lines worked out for the sweep's moment (the chart's own pin; the lines are not worked out again).
  const LIVE = {};   // alloc-rare: made once (the live reading handed to the chart)
  function ring(stent, w) {
    if (phase !== 'drawn' || !stent) return;
    const k = w === 'DIPS' ? 'dips' : 'tips', fl = stent.flow, bn = stent.bench, rk = `${w}|${fl?.toFixed(3)}|${bn?.toFixed(3)}`;
    if (rk === ringKey) return;
    ringKey = rk; LIVE[`${k}Flow`] = fl; LIVE[`${k}Bench`] = bn;
    curve.pin?.(LIVE);
  }
  function update(f, w = 'TIPS') {
    frame = f;
    if (!active) return;
    const st = store.get(), p = st.params, m = f?.metrics, stent = m ? (w === 'DIPS' ? m.dips : m.tips) : null;
    const matters = sweepMatters(sweep, stent);
    if (matters !== shownMatters) { shownMatters = matters; dataSoon(el, 'flat', matters ? '' : '1'); }
    if (!stent) return;
    // (The patient, the setting, the stent or the day changed: a new sweep, after the changes stop. The stent's own numbers move every beat, so the key is not the frame.)
    const day = f?.clock === 'disease' && Number.isFinite(f.day) ? Math.floor(f.day) : 0;
    const key = `${w}|${sweep}|${day}`;
    if (drawn && drawn.key === key && drawn.p === p) { ring(stent, w); return; }
    if (want && want.key === key && want.p === p && phase !== 'idle') return;   // (already asked for: waiting or loading)
    which = w;
    clearTimeout(timer);
    const my = ++token, mine = { key, p, which: w, sweep };
    want = mine; phase = 'waiting';
    timer = setTimeout(() => restPass(() => { if (my === token) start(my, mine); }), delay);
  }
  /** Leaving the view: work not finished is cancelled and forgotten (a sweep already drawn stays). */
  const stop = () => { clearTimeout(timer); token++; if (phase !== 'drawn') { phase = 'idle'; want = null; } };
  /** The card is shown or hidden (dock.js pane.shown): hidden, nothing is prepared and nothing is asked of the worker. */
  const setActive = (on) => { on = !!on; if (on === active) return; active = on; if (!on) stop(); else if (frame) update(frame, which); };
  return { el, update, stop, setActive, sweep: () => sweep, setSweep, chart: curve, phase: () => phase };
}
