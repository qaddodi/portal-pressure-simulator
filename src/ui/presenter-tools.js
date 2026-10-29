// Slide instruments for the Presenter: a slide's `tool` field (decks.js) puts one of the app's instruments in
// the data card, beside the figure, reading the live model while the slide is up.
//
//   tool: { kind: 'doppler', vessel: 'PV_TRUNK' }   spectral Doppler in one vessel (doppler.js PROBES ids); waves: true names
//                                                   a hepatic vein's a, S, v and D waves on the trace
//   tool: { kind: 'scope' }                         the esophagus at this slide's varix state (endoscopy)
//   tool: { kind: 'fibroscan' }                     liver stiffness, kPa (metrics.lsm)
//   tool: { kind: 'trace', range: 'talk' | 'beats' }
//                                                   'talk' (default): portal, wedged and free hepatic pressures and the
//                                                   HVPG at every slide so far, one point per state; 'beats': the live trace
//   tool: { kind: 'trace', range: 'talk', since: '<slide id>' }
//                                                   the talk trace from that slide on, its days counted from it (presenter.js chainTo)
//   tool: { kind: 'abdomen' }                       the belly with its ascites and collaterals
//   tool: { kind: 'wall' }                          the varix in cross-section, Laplace's σ, r and w (the scope's Wall mechanics)
//   tool: { kind: 'flowtime' }                      portal pressure and portal flow around a meal, the slide's time-lapse on a
//                                                   teaching clock in minutes (flow-time.js), drawn as it plays
//   tool: { kind: 'flowtime', clock: 'days', lines: [lower, upper] }
//                                                   the same chart over a disease time-lapse: two fingerprint keys
//                                                   (flow-time.js LINE), one point a model day, drawn as it plays
//   tool: { kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 } }
//                                                   a line the model has no number for (weight lost, %) is the slide's own: given is its
//                                                   end value, reached in step with the time-lapse's ramp from 0; the other line is the model's
//
//   tool: { kind: 'vitals', show?: ['hr', 'map', 'hb'] }
//                                                   a black bedside monitor: the EKG strip over up to three of hr, map, co, hb as large numbers
//   tool: { kind: 'hvpg' }                          the HVPG catheter's tracing on the card (no catheter on the figure): it plays free, wedge and
//                                                   result going forward onto the slide, then holds the result and eases with the model
//   tool: { kind: 'hvpg', catheter: true }          the same tracing following the figure's catheter (the slide's cath: 'free', 'wedge' or 'result'):
//                                                   the balloon sets the pressure's rise, and the card stays up from one such slide to the next
//
// A kind a deck visuals package registers (slide-ext.js tools) is made, titled and shown the same way; built-in kinds win.
//
// Optional on any kind: title (the card's heading, in place of the kind's own). A slide may carry both data and tool:
// the tool sits above the tiles. Each instrument is made once per presentation and kept, so a trace that keeps recording
// (Doppler) carries on from slide to slide while the patient stays the same.
//
// A recording instrument (doppler, beat by beat, vitals) opens with its window already full: when its card appears on a state, or the state
// has landed, the model sends the steady state's last seconds (worker-core.js, History) and the instrument takes them in front of what it
// has recorded (backfill.js), so the trace sweeps on live from there instead of in from empty.

import { store } from './store.js?v=926dabfaef';
import { h } from './util.js?v=58b547f8d4';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { createDoppler } from './doppler.js?v=2da811ff4d';
import { createFibroScan } from './fibroscan.js?v=b5042eabbc';
import { createPressureTime } from './pressure-time.js?v=2452a42601';
import { createVitalsMonitor } from './vitals-monitor.js?v=4742417bbe';
import { createHvpgCard } from './tool-hvpg.js?v=ab3d7c2fff';
import { createFlowTime } from './flow-time.js?v=026ab2f37c';
import { createEndoscopy, createAbdomen, createVarixWall } from './instruments.js?v=6f71415263';
import { frameFor, cancelFrame } from './frame.js?v=7254a8a850';
import { talkTrace } from './talk-trace.js?v=c9a1110930';
import { EXT, guard, safe } from './slide-ext.js?v=c68990636a';
const nextFrame = frameFor('presenter-tools');

const VESSEL = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', SV_MID: 'splenic vein', V_SPL: 'splenic vein, at the hilum',
  SMV_CONF: 'superior mesenteric vein', RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'inferior vena cava',
  A_HEP: 'hepatic artery', TIPS: 'the TIPS', C3: 'paraumbilical vein' };
const TITLE = {
  doppler: (t) => `Doppler, ${VESSEL[t.vessel || 'PV_TRUNK'] || EDGES.find((e) => e.id === t.vessel)?.label?.toLowerCase() || 'portal vein'}`,
  scope: () => 'Endoscopy, the lower esophagus',
  fibroscan: () => 'Liver stiffness, FibroScan',
  trace: (t) => (t.range === 'beats' ? 'Pressure, beat by beat' : 'Pressure over the talk'),
  abdomen: () => 'The abdomen',
  wall: () => 'The varix wall, in cross-section',
  flowtime: () => 'Portal pressure and flow over time',
  vitals: () => 'Vital signs',
  hvpg: () => 'HVPG, catheter tracing',
};
const noop = () => {};
const RECORDS = ['doppler', 'beats', 'vitals'];   // (the instruments that record the patient's flow as it passes)

export function createTools({ host, stage }) {
  const ghostEl = h('div', { class: 'pz-ghost', 'aria-live': 'polite' });
  const box = h('div', { class: 'pz-tool' });
  // A chart drawn in its own units (a viewBox) shrinks its letters with the card: its smallest words (13 units) are kept
  // 12 px or more on the screen, the chart's letters all grown by the same factor (--svk), up to twice.
  const svk = () => { for (const sv of box.querySelectorAll('svg[viewBox]')) { const w = +sv.getAttribute('viewBox').split(/[\s,]+/)[2], r = sv.getBoundingClientRect().width;
    if (!w || !r) continue; const k = Math.min(2, Math.max(1, 12 / (13 * r / w))); if (Math.abs(k - (+sv.style.getPropertyValue('--svk') || 1)) > 0.02) sv.style.setProperty('--svk', k.toFixed(2)); } };
  // (One frame asked for at a time, however many sizes the card goes through in it; the observer is let go with the tools.)
  let svkRaf = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!svkRaf) svkRaf = nextFrame(() => { svkRaf = 0; svk(); }); }) : null;
  ro?.observe(box);
  const made = {};
  let cur = null, kind = null, probe0, gate0, lastSt = null, lastSlide = null, held = false, lastTool = null, lastCtx = null;
  let primeTok = 0, primeWait = false, primeP = null;   // (primeTok: the history asked for last; primeWait: the card is up while the state is still landing, its history asked for at the landing; primeP: that ask)
  /** Ask the model for the steady state's last seconds and give them to inst, in front of what it has recorded. An answer for an instrument
   *  that has been cleared or held since (a newer ask, a state changing again) is let go. */
  function prime(inst, k) {
    const tok = ++primeTok;
    primeP = host.request('history', { secs: inst.historySecs?.() ?? 10 })
      .then((m) => { if (tok === primeTok && !held && made[k] === inst && m?.samples) inst.backfill?.({ ...m.samples, probe: m.probe }); })
      .catch(noop);   // (an engine that cannot answer: the trace fills as it records)
  }
  function make(k) {
    if (made[k]) return made[k];
    const inst = k === 'doppler' ? createDoppler({ onProbe: noop, pickGate: false }) : k === 'fibroscan' ? createFibroScan() : k === 'scope' ? createEndoscopy({ onAction: noop })
      : k === 'abdomen' ? createAbdomen({ onAction: noop }) : k === 'wall' ? createVarixWall() : k === 'beats' ? createPressureTime() : k === 'talk' ? talkTrace() : k === 'flowtime' ? createFlowTime()
        : k === 'vitals' ? createVitalsMonitor() : k === 'hvpg' ? createHvpgCard()
        : Object.hasOwn(EXT.tools, k) ? guard(safe(() => EXT.tools[k].make({ host, stage, store }), null, `tools.${k}.make`), `tools.${k}`) : null;
    if (inst && !inst.el?.classList) return null;   // (a registered instrument that made no element is left out)
    if (inst) { inst.el.classList.remove('dock-pane'); inst.el.classList.add('pz-inst'); }
    return (made[k] = inst);
  }
  const keyOf = (t) => (t.kind === 'trace' ? (t.range === 'beats' ? 'beats' : 'talk') : t.kind);
  const offFrame = store.on('frame', (f) => {
    if (!cur || !f || !box.isConnected) return;
    // (Held while the slide's own state eases in: a recording trace would catch the leaving state, the old flow before it reverses.)
    if (held && (kind === 'doppler' || kind === 'beats' || kind === 'vitals')) return;
    if (kind === 'doppler' && cur.ingest) { cur.update(f); return; }
    if (kind !== 'talk' && kind !== 'flowtime') cur.update?.(f);
  });
  return {
    el: box,
    title: (t) => t.title || TITLE[t.kind]?.(t) || (Object.hasOwn(EXT.tools, t.kind) && safe(() => EXT.tools[t.kind].title?.(t), null, 'tools.title')) || '',
    /** A registered instrument's short title for a phone's card, when the card shows its own title (full); the built-in ones are
     *  in the presenter's SHORT_TITLE. */
    short: (t, full) => (t && !TITLE[t.kind] && Object.hasOwn(EXT.tools, t.kind) && safe(() => (full === EXT.tools[t.kind].title?.(t) ? EXT.tools[t.kind].short?.(t) : null), null, 'tools.short')) || null,
    sig: (t) => (t ? `${keyOf(t)}:${t.vessel || ''}` : ''),
    /** Put the slide's tool in the box. stateKey: the slide's model state (a new one clears a recording trace);
     *  chain: for the talk trace, [{ n, title, fp }] of every state up to this slide.
     *  trail, reveal: for the flow-time chart, its series and how far along to draw it (see progress).
     *  ctx: the slide's context for an instrument's configure(t, ctx) (the presenter's ctxOf; slide-ext.js).
     *  forward: the slide is stepped onto from the one before it (an instrument that plays on arrival, arrive()).
     *  balloon: the catheter's balloon on the figure now, for a tracing that follows it (balloon()). */
    show(t, { slide = null, stateKey = null, chain = [], trail = null, reveal = 1, ctx = null, forward = false, balloon = null } = {}) {
      const k = keyOf(t), inst = make(k);
      if (!inst) { this.hide(); return; }
      if (k !== 'doppler') stage?.pinDoppler?.(null);
      stage?.setScanProbe?.(k === 'fibroscan');   // (the probe on the skin over the liver, where the reading comes from)
      if (k === 'doppler') {
        if (probe0 === undefined) { probe0 = store.get().frame?.probe ?? null; gate0 = store.get().dopGate; }
        host.send({ type: 'probe', id: t.vessel || 'PV_TRUNK' });
        // (On a stent, the slide's gate: proximal, mid, distal, or 'site', the third that holds its narrowing.)
        if (store.get().dopGate !== (t.gate || 'mid')) store.set({ dopGate: t.gate || 'mid' });
        stage?.pinDoppler?.(t.vessel || 'PV_TRUNK', { points: !!t.points });   // (points: the figure calls out all three of a stent's points)
      }
      inst.setWaves?.(!!t.waves);
      inst.configure?.(t, ctx);   // (an instrument's own options on this slide: a deck visuals package's, slide-ext.js)
      lastTool = t; lastCtx = ctx;
      if (balloon != null) inst.balloon?.(balloon);   // (a tracing that follows the catheter starts from the balloon as it stands)
      inst.arrive?.({ forward, again: cur === inst });   // (the HVPG tracing plays going forward onto its slide, once, and is finished otherwise)
      if (cur !== inst || slide !== lastSlide) inst.autoWindow?.();   // (a new slide chooses its Doppler window again from the width it is drawn at)
      lastSlide = slide;
      // A new patient clears a recording trace; so does an instrument coming back after another one showed (it missed the frames between).
      const startOver = RECORDS.includes(k) && (stateKey !== lastSt || cur !== inst);
      if (startOver) { inst.clear?.(); primeTok++; }
      lastSt = stateKey;
      if (cur && cur !== inst) cur.park?.();
      if (cur !== inst) box.replaceChildren(inst.el, ghostEl);
      cur = inst; kind = k;
      box.dataset.kind = k;
      if (k === 'talk') inst.set(chain);
      else if (k === 'flowtime') inst.set(trail, reveal, { clock: t.clock, lines: t.lines, given: t.given });
      else { const f = store.get().frame; if (f) nextFrame(() => cur === inst && inst.update?.(f)); }
      if (startOver) { if (held) primeWait = true; else prime(inst, k); }
    },
    /** The flow-time chart drawn up to k (0 to 1) of its time-lapse, with its series (trail) once it is computed. */
    /** Change the instrument's options on the slide in place, the model untouched (a compare button { tool }, a what-if slider { tool }):
     *  the slide's own options with patch over them, or the slide's own alone when patch is null. */
    option(patch) { if (cur && lastTool) cur.configure?.(patch ? { ...lastTool, ...patch } : lastTool, lastCtx); },
    /** The numbers the slide's tiles and words show (a fingerprint): a reading instrument shows the same, not the beat-to-beat live value. */
    pin(fp) { for (const inst of Object.values(made)) inst?.pin?.(fp); },
    progress(k, trail) { if (kind === 'flowtime') cur.set(trail, k); },
    /** The earlier reading, faint beside the live one ({ label, value }), or null. Eases in and out. */
    ghost(g) {
      ghostEl.classList.toggle('on', !!g);
      if (g) ghostEl.replaceChildren(h('span', {}, g.label), h('b', {}, g.value));
    },
    /** Resolves once the window of the instrument showing has been filled, or after ms at the longest: a card is not brought in
     *  before its trace is there, unless the model is slow to make it. */
    ready(ms) { const p = primeP; return p ? Promise.race([p, new Promise((r) => setTimeout(r, ms))]) : Promise.resolve(); },
    /** Hold the recording instruments (Doppler, beat by beat, vitals) while the slide's state changes: they draw nothing new, and on
     *  release start over with their window filled by the new state's own steady beats (prime), then record on. */
    hold(on) {
      on = !!on; if (on === held) return; held = on;
      primeTok++;
      for (const k of RECORDS) made[k]?.restart?.() ?? made[k]?.clear?.();
      // Released: the state has landed. A card already up for it (held meanwhile) has its window filled now.
      if (!on && primeWait && cur && RECORDS.includes(kind)) prime(cur, kind);
      primeWait = false;
    },
    /** A question slide's answer held back (slide hold: true): the instrument showing leaves out the
     *  parts that name the answer (the Gut to heart chart's red blocks and brackets; the Doppler's words are held by the card's CSS). */
    holdAnswer(on, instant = false) { cur?.hold?.(!!on, instant); },
    /** The catheter's balloon on the figure (0 down … 1 wedged), every frame it moves: the tracing on the card, if it follows the catheter, rides it. */
    balloon(b) { cur?.balloon?.(b); },
    hide() { stage?.pinDoppler?.(null); stage?.setScanProbe?.(false); cur?.park?.(); cur = null; kind = null; lastSlide = null; lastTool = null; lastCtx = null; delete box.dataset.kind; },
    /** The presentation is over: the Doppler goes back to the vessel it had. */
    dispose() {
      if (probe0 !== undefined) { host.send({ type: 'probe', id: probe0 }); store.set({ dopGate: gate0 || 'mid' }); } probe0 = undefined; lastSt = null; lastSlide = null; this.hide();
      // Each presentation builds its own tools: let go of this one's instruments (and the endoscopy's GL context).
      offFrame(); ro?.disconnect(); cancelFrame(svkRaf); svkRaf = 0;
      for (const k of Object.keys(made)) { made[k]?.dispose?.(); delete made[k]; }
      box.replaceChildren();
    },
  };
}
