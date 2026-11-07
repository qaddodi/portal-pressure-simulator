// EUS-PPG on the Scope card (Tests › Scope, instruments.js createEndoscopy): the endoscopic ultrasound-guided portal pressure
// gradient, played step by step on the anatomy as the HVPG card plays TIPS (proc-anim.js MEASURES.eus; eus-scope.js draws the
// echoendoscope, its ultrasound sector and the 25-gauge needle). The card keeps its numbered steps, the step's words, and the two
// readings and their difference as the needle takes them. It changes nothing in the model: a measurement.

import { h, icon, toast } from './util.js';
import { glWords } from './gl-words.js';
import { hvpgSev } from '../engine/pressure-cuts.js';
import { store, logAction } from './store.js';
import { dataSoon, propSoon, attrSoon } from './class-soon.js';
import { MEASURES, READS, playProcedure, procRunning } from './proc-anim.js';

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setEusStage(stage) { stageRef = stage; }

const EUS = MEASURES.eus, NOT = '—';
const IDLE = 'Watch the echoendoscope measure the portal pressure gradient from the stomach, with one needle.';
const word = (v) => (Number.isFinite(v) ? v.toFixed(1) : NOT);
// (Read on the HVPG's cut-offs, as EUS-PPG series do: 5 and over portal hypertension, 10 and over clinically significant.)
const SEV_WORD = { ok: 'Normal', caution: 'Portal hypertension', danger: 'Clinically significant portal hypertension (CSPH)' };

export function createEusPpg() {
  const vals = {}, keys = [['pv', 'PV'], ['hv', 'HV'], ['ppg', 'EUS-PPG']];
  const kv = h('dl', { class: 'hvpg-kv' }, keys.map(([k, t]) => { vals[k] = h('dd', {}, NOT); return h('div', {}, h('dt', {}, t), vals[k]); }));
  const valW = Object.fromEntries(keys.map(([k]) => [k, glWords(vals[k], { keep: true })]));
  const stepEls = EUS.steps.map(([id, title, , short]) => h('li', { 'data-step': id, title }, h('span', {}, short)));
  const caption = h('p', { class: 'ctl-sub hvpg-caption', 'aria-live': 'polite' }, IDLE);
  let capT = IDLE;
  const btn = h('button', { type: 'button', class: 'btn sm hvpg-proc-btn', 'aria-label': 'Play EUS-PPG on the anatomy', onclick: () => play(),
    onpointerup: (e) => { if (e.pointerType !== 'mouse' && !btn.disabled) play(); } }, icon('play'), h('span', {}, 'EUS-PPG'));
  const row = h('div', { class: 'hvpg-procs', role: 'group', 'aria-label': 'EUS-guided portal pressure gradient' }, h('span', { class: 'hvpg-procs-k' }, 'Watch'), btn);
  const el = h('div', { class: 'eus-ppg', 'data-eus': '' }, row, kv, h('ol', { class: 'hvpg-steps' }, stepEls), caption);

  let run = null, step = -1, playT = 0, done = false;
  function play() {
    // (A touch plays it on the lift; the click that follows is ignored. One catheter or scope on the figure at a time.)
    if (performance.now() - playT < 600 || run || !stageRef) return;
    playT = performance.now();
    if (procRunning() || stageRef.cathBoxes?.().length) { toast('A procedure is on the figure. Wait for it to finish.'); return; }
    const st = store.get();
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    const focus0 = store.get().focus;
    step = 0; done = false;
    run = playProcedure(stageRef, 'eus', {
      read: () => store.get().frame,
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
    const cap = step >= 0 ? EUS.steps[step][2] : done && Number.isFinite(rd.ppg) ? `${SEV_WORD[hvpgSev(rd.ppg)]}. EUS-PPG = PV − HV = ${word(rd.pv)} − ${word(rd.hv)} = ${word(rd.ppg)} mmHg.` : IDLE;
    // (Written between frames: a step changes inside the procedure's frame.)
    if (cap !== capT) { capT = cap; propSoon(caption.firstChild, 'nodeValue', cap); }
    propSoon(btn, 'disabled', !!run); attrSoon(btn, 'aria-pressed', String(!!run));
  }
  return {
    el,
    /** The card's own model frame (nothing to read: the readings are taken as the needle reaches each vein). */
    update() {},
    /** Stop a run (the card is going away). */
    dispose() { run?.stop(); run = null; },
  };
}
