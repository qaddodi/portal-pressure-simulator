// EUS-PPG on the Scope card (Tests › Scope, instruments.js createEndoscopy): the endoscopic ultrasound-guided portal pressure
// gradient, played step by step on the anatomy as the HVPG card plays TIPS (proc-anim.js MEASURES.eus; eus-scope.js draws the
// echoendoscope, its ultrasound sector and the 25-gauge needle). The card keeps its numbered steps, the step's words, and the two
// readings and their difference as the needle takes them, drawn on the app's one pressure monitor (monitor.js, through tool-reading.js:
// the same live number and trace as every other measurement; Mohammad, 13 Nov 2026: "standardize", "apply this for all"). It changes
// nothing in the model: a measurement.

import { h, icon, toast } from './util.js';
import { glWords } from './gl-words.js';
import { hvpgSev, hvpgWord, NOT_SHOWN } from '../engine/pressure-cuts.js';
import { store, logAction } from './store.js';
import { dataSoon, propSoon, attrSoon } from './class-soon.js';
import { MEASURES, READS, playProcedure, procRunning } from './proc-anim.js';
import { createReading } from './tool-reading.js';
import { NODES } from '../engine/topology.js';

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setEusStage(stage) { stageRef = stage; }

const EUS = MEASURES.eus, NOT = NOT_SHOWN;
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const SLIDE = { procedure: 'eus' };   // (the monitor's measurement: the EUS-PPG, as on a slide that plays it)
const r1 = (v) => Math.round(v * 10) / 10;
const IDLE = 'EUS-guided portal pressure gradient: portal and hepatic vein pressures measured transgastrically with one needle.';
const word = (v) => (Number.isFinite(v) ? v.toFixed(1) : NOT);
// (Read on the HVPG's cut-offs, as EUS-PPG series do: 5 and over portal hypertension, 10 and over clinically significant.)

export function createEusPpg() {
  const vals = {}, keys = [['pv', 'PV'], ['hv', 'HV'], ['ppg', 'EUS-PPG']];
  const kv = h('dl', { class: 'hvpg-kv' }, keys.map(([k, t]) => { vals[k] = h('dd', {}, NOT); return h('div', {}, h('dt', {}, t), vals[k]); }));
  const valW = Object.fromEntries(keys.map(([k]) => [k, glWords(vals[k], { keep: true })]));
  const stepEls = EUS.steps.map(([id, title, , short]) => h('li', { 'data-step': id, title }, h('span', {}, short)));
  const caption = h('p', { class: 'ctl-sub hvpg-caption', 'aria-live': 'polite' }, IDLE);
  let capT = IDLE;
  // (A measurement, started as Measure › HVPG starts the HVPG: "Measure", with the procedure's own icon, the needle; the treatments beside the HVPG are what one
  // watches. Unification audit, finding 5. The button keeps its size and words: the Scope card's grid places it.)
  const btn = h('button', { type: 'button', class: 'btn sm hvpg-proc-btn', 'aria-label': 'Measure EUS-PPG on the anatomy', title: IDLE, onclick: () => play(),
    onpointerup: (e) => { if (e.pointerType !== 'mouse' && !btn.disabled) play(); } }, icon('needle'), h('span', {}, 'EUS-PPG'));
  const row = h('div', { class: 'hvpg-procs', role: 'group', 'aria-label': 'EUS-guided portal pressure gradient' }, h('span', { class: 'hvpg-procs-k' }, 'Measure'), btn);
  // (The readings, the steps and the words are one panel, .eus-panel: styles/scope-card.css lays it over the foot of the scope's picture on the side card while a run is on
  // or done, so the picture keeps all the room; elsewhere it adds no box. Its state, idle, run or done, is data-state.)
  // (The monitor: the needle's pressure live as it is taken, on the procedure's own clock. Its readings before each is taken are the live veins'.)
  const mon = createReading();
  const fp = { lpv: NaN, lhv: NaN, eus: NaN };
  const pinLive = () => { const P = store.get().frame?.P; fp.lpv = P ? r1(P[NI.LPV]) : NaN; fp.lhv = P ? r1(P[NI.LHV]) : NaN; fp.eus = r1(fp.lpv - fp.lhv); mon.pin(fp); };
  mon.configure({ kind: 'reading' }, { slide: SLIDE, fp });
  const panel = h('div', { class: 'eus-panel' }, mon.el, kv, h('ol', { class: 'hvpg-steps' }, stepEls), caption);
  const el = h('div', { class: 'eus-ppg', 'data-eus': '', 'data-state': 'idle' }, row, panel);

  let run = null, step = -1, playT = 0, done = false;
  function play() {
    // (A touch plays it on the lift; the click that follows is ignored. One catheter or scope on the figure at a time.)
    if (performance.now() - playT < 600 || run || !stageRef) return;
    playT = performance.now();
    if (procRunning() || stageRef.cathBoxes?.().length) { toast('A procedure is in progress on the figure. Wait for it to finish.'); return; }
    const st = store.get();
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    const focus0 = store.get().focus;
    step = 0; done = false;
    mon.configure({ kind: 'reading' }, { slide: { ...SLIDE }, fp }); pinLive();   // (a new run: the monitor starts afresh, waiting for the needle)
    run = playProcedure(stageRef, 'eus', {
      read: () => store.get().frame,
      onFrame: (f, t) => mon.procAt('eus', t),
      onStep: (k) => { step = k; paint(); },
      // (Each reading's callout names its vessel on the figure, with the reading, as a slide's mark; the result stands on the portal
      // vein with the hepatic vein's reading beside it. Whatever was called out before comes back when it ends.)
      onMark: (m, names, all) => { store.set({ focus: m ? { ...m, marks: all || [m] } : focus0 }); paint(); },
      onEnd: ({ done: d }) => { run = null; step = -1; done = d; paint(); },
    });
    logAction('procedure', EUS.name);
    paint();
  }
  function paint() {
    const rd = READS.eus;
    for (const [k] of keys) { const t = word(rd[k]); if (valW[k].text !== t) valW[k].set(t); }
    dataSoon(vals.ppg, 'sev', Number.isFinite(rd.ppg) ? hvpgSev(rd.ppg) : '');
    for (let i = 0; i < stepEls.length; i++) dataSoon(stepEls[i], 'state', step < 0 ? (done ? 'done' : null) : i < step ? 'done' : i === step ? 'now' : null);
    const cap = step >= 0 ? EUS.steps[step][2] : done && Number.isFinite(rd.ppg) ? `${hvpgWord(rd.ppg, true)}. EUS-PPG = PV − HV = ${word(rd.pv)} − ${word(rd.hv)} = ${word(rd.ppg)} mmHg.` : IDLE;
    // (Written between frames: a step changes inside the procedure's frame.)
    if (cap !== capT) { capT = cap; propSoon(caption.firstChild, 'nodeValue', cap); }
    dataSoon(el, 'state', run ? 'run' : done ? 'done' : 'idle');
    propSoon(btn, 'disabled', !!run); attrSoon(btn, 'aria-pressed', String(!!run));
  }
  return {
    el,
    /** The card's own model frame (nothing to read: the readings are taken as the needle reaches each vein). */
    update() {},
    /** Stop a run (the card is going away). */
    dispose() { run?.stop(); run = null; mon.dispose(); },
  };
}
