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
//   tool: { kind: 'abdomen' }                       the belly with its ascites and collaterals
//   tool: { kind: 'wall' }                          the varix in cross-section, Laplace's T, r and w (the scope's Wall mechanics)
//   tool: { kind: 'flowtime' }                      portal pressure and portal flow around a meal, the slide's time-lapse on a
//                                                   teaching clock in minutes (flow-time.js), drawn as it plays
//   tool: { kind: 'flowtime', clock: 'days', lines: [lower, upper] }
//                                                   the same chart over a disease time-lapse: two fingerprint keys
//                                                   (flow-time.js LINE), one point a model day, drawn as it plays
//
// A kind a deck visuals package registers (slide-ext.js tools) is made, titled and shown the same way; built-in kinds win.
//
// Optional on any kind: title (the card's heading, in place of the kind's own). A slide may carry both data and tool:
// the tool sits above the tiles. Each instrument is made once per presentation and kept, so a trace that keeps recording
// (Doppler) carries on from slide to slide while the patient stays the same.

import { store } from './store.js?v=31ee79b6ab';
import { h } from './util.js?v=8813192ea2';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { createDoppler } from './doppler.js?v=6414c4d2ff';
import { createFibroScan } from './fibroscan.js?v=81ca55ce21';
import { createPressureTime } from './pressure-time.js?v=2a0658ccaf';
import { createFlowTime } from './flow-time.js?v=2e3f89618c';
import { createEndoscopy, createAbdomen, createVarixWall } from './instruments.js?v=bc16074767';
import { frameFor } from './frame.js?v=67ca200c87';
import { talkTrace } from './talk-trace.js?v=00e86cfb36';
import { EXT, guard, safe } from './slide-ext.js?v=9daa8306d8';
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
};
const noop = () => {};

export function createTools({ host, stage }) {
  const ghostEl = h('div', { class: 'pz-ghost', 'aria-live': 'polite' });
  const box = h('div', { class: 'pz-tool' });
  // A chart drawn in its own units (a viewBox) shrinks its letters with the card: its smallest words (13 units) are kept
  // 12 px or more on the screen, the chart's letters all grown by the same factor (--svk), up to twice.
  const svk = () => { for (const sv of box.querySelectorAll('svg[viewBox]')) { const w = +sv.getAttribute('viewBox').split(/[\s,]+/)[2], r = sv.getBoundingClientRect().width;
    if (!w || !r) continue; const k = Math.min(2, Math.max(1, 12 / (13 * r / w))); if (Math.abs(k - (+sv.style.getPropertyValue('--svk') || 1)) > 0.02) sv.style.setProperty('--svk', k.toFixed(2)); } };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => nextFrame(svk)).observe(box);
  const made = {};
  let cur = null, kind = null, probe0, gate0, lastSt = null, lastSlide = null;
  function make(k) {
    if (made[k]) return made[k];
    const inst = k === 'doppler' ? createDoppler({ onProbe: noop, pickGate: false }) : k === 'fibroscan' ? createFibroScan() : k === 'scope' ? createEndoscopy({ onAction: noop })
      : k === 'abdomen' ? createAbdomen({ onAction: noop }) : k === 'wall' ? createVarixWall() : k === 'beats' ? createPressureTime() : k === 'talk' ? talkTrace() : k === 'flowtime' ? createFlowTime()
        : Object.hasOwn(EXT.tools, k) ? guard(safe(() => EXT.tools[k].make({ host, stage, store }), null, `tools.${k}.make`), `tools.${k}`) : null;
    if (inst && !inst.el?.classList) return null;   // (a registered instrument that made no element is left out)
    if (inst) { inst.el.classList.remove('dock-pane'); inst.el.classList.add('pz-inst'); }
    return (made[k] = inst);
  }
  const keyOf = (t) => (t.kind === 'trace' ? (t.range === 'beats' ? 'beats' : 'talk') : t.kind);
  const offFrame = store.on('frame', (f) => {
    if (!cur || !f || !box.isConnected) return;
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
     *  ctx: the slide's context for an instrument's configure(t, ctx) (the presenter's ctxOf; slide-ext.js). */
    show(t, { slide = null, stateKey = null, chain = [], trail = null, reveal = 1, ctx = null } = {}) {
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
      if (cur !== inst || slide !== lastSlide) inst.autoWindow?.();   // (a new slide chooses its Doppler window again from the width it is drawn at)
      lastSlide = slide;
      if (stateKey !== lastSt && (k === 'doppler' || k === 'beats')) inst.clear?.();
      lastSt = stateKey;
      if (cur !== inst) box.replaceChildren(inst.el, ghostEl);
      cur = inst; kind = k;
      box.dataset.kind = k;
      if (k === 'talk') inst.set(chain);
      else if (k === 'flowtime') inst.set(trail, reveal, { clock: t.clock, lines: t.lines });
      else { const f = store.get().frame; if (f) nextFrame(() => cur === inst && inst.update?.(f)); }
    },
    /** The flow-time chart drawn up to k (0 to 1) of its time-lapse, with its series (trail) once it is computed. */
    /** The numbers the slide's tiles and words show (a fingerprint): a reading instrument shows the same, not the beat-to-beat live value. */
    pin(fp) { for (const inst of Object.values(made)) inst?.pin?.(fp); },
    progress(k, trail) { if (kind === 'flowtime') cur.set(trail, k); },
    /** The earlier reading, faint beside the live one ({ label, value }), or null. Eases in and out. */
    ghost(g) {
      ghostEl.classList.toggle('on', !!g);
      if (g) ghostEl.replaceChildren(h('span', {}, g.label), h('b', {}, g.value));
    },
    hide() { stage?.pinDoppler?.(null); stage?.setScanProbe?.(false); cur = null; kind = null; lastSlide = null; delete box.dataset.kind; },
    /** The presentation is over: the Doppler goes back to the vessel it had. */
    dispose() {
      if (probe0 !== undefined) { host.send({ type: 'probe', id: probe0 }); store.set({ dopGate: gate0 || 'mid' }); } probe0 = undefined; lastSt = null; lastSlide = null; this.hide();
      // Each presentation builds its own tools: let go of this one's instruments (and the endoscopy's GL context).
      offFrame();
      for (const k of Object.keys(made)) { made[k]?.dispose?.(); delete made[k]; }
      box.replaceChildren();
    },
  };
}
