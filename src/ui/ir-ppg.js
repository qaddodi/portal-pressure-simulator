// PPG by interventional radiology on the Measure card (Tests › HVPG): the portal pressure gradient read in two approaches, played on the anatomy
// the way the EUS-PPG is on the Scope card (eus-ppg.js) and the Gradients talk plays them (proc-anim.js MEASURES.irivc then MEASURES.irpv): the
// transjugular catheter that reads the IVC, then the needle through the skin and the liver and a catheter on into the portal trunk, which reads the
// portal vein. The gradient is the second reading minus the first. The pressure is drawn on the app's one monitor (monitor.js, through
// tool-reading.js: the same live number and trace as every other measurement; Mohammad, 13 Nov 2026: "standardize", "apply this for all"), in
// the place of the HVPG tracing while it runs and after it. It changes nothing in the model: a measurement.

import { h, icon, toast } from './util.js';
import { ppgWord, NOT_SHOWN } from '../engine/pressure-cuts.js';
import { store, logAction } from './store.js';
import { MEASURES, READS, playProcedure, procRunning, procBlocked } from './proc-anim.js';
import { createReading } from './tool-reading.js';

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setIrStage(stage) { stageRef = stage; }

const SLIDE = { procedure: { kind: 'irivc', then: 'irpv' } };   // (the monitor's measurement: the PPG by IR, as on a slide that plays both approaches)
const IDLE = 'PPG by interventional radiology: the IVC pressure through the neck, then the portal vein pressure through the skin and the liver.';
const word = (v) => (Number.isFinite(v) ? v.toFixed(1) : NOT_SHOWN);

/** `busy()`: the card's other measurement or treatment is playing (one catheter on the figure at a time). `onChange()`: the card repaints. */
export function createIrPpg({ busy = () => false, onChange = () => {} } = {}) {
  const btn = h('button', { type: 'button', class: 'btn sm hvpg-proc-btn', 'aria-label': 'Play the PPG by interventional radiology on the anatomy', title: IDLE,
    onclick: () => play(), onpointerup: (e) => { if (e.pointerType !== 'mouse' && !btn.disabled) play(); } }, icon('play'), h('span', {}, 'PPG by IR'));
  const mon = createReading();
  const panel = h('div', { class: 'hvpg-ir', hidden: true, 'data-state': 'idle' }, mon.el);
  const pinLive = () => { const m = store.get().frame?.metrics; if (m) mon.pin({ ivc: m.ivc, pv: m.pv, ppg: m.ppg }); };
  mon.configure({ kind: 'reading' }, { slide: SLIDE, fp: { ivc: NaN, pv: NaN, ppg: NaN } });

  let run = null, kind = '', step = -1, playT = 0, done = false, shown = false, focus0 = null;
  const stepWords = () => (kind && step >= 0 ? MEASURES[kind].steps[step][2] : '');
  function set(next) { if (shown !== next) { shown = next; panel.hidden = !next; onChange(); } }
  function begin(k) {
    kind = k; step = -1;
    run = playProcedure(stageRef, k, {
      read: () => store.get().frame,
      onFrame: (f, t) => mon.procAt(k, t),
      onStep: (i) => { step = i; onChange(); },
      // (Each reading's callout names its vessel on the figure, with the reading, as a slide's mark. Whatever was called out before comes back when the run ends.)
      onMark: (m, names, all) => { store.set({ focus: m ? { ...m, marks: all || [m] } : focus0 }); },
      onEnd: ({ done: d }) => {
        run = null;
        if (d && k === 'irivc') { begin('irpv'); return; }   // (the second approach goes on by itself, from its start)
        kind = ''; step = -1; done = d; onChange();
      },
    });
  }
  function play() {
    // (A touch plays it on the lift; the click that follows is ignored. One catheter or scope on the figure at a time.)
    if (performance.now() - playT < 600 || run || !stageRef) return;
    playT = performance.now();
    if (busy() || procRunning() || stageRef.cathBoxes?.().length) { toast('A procedure is in progress on the figure. Wait for it to finish.'); return; }
    const st = store.get(), why = procBlocked('irivc', st.params, st.frame?.metrics) || procBlocked('irpv', st.params, st.frame?.metrics);
    if (why) { toast(why); return; }
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    focus0 = store.get().focus; done = false;
    mon.configure({ kind: 'reading' }, { slide: { ...SLIDE }, fp: { ivc: NaN, pv: NaN, ppg: NaN } }); pinLive();   // (a new run: the monitor starts afresh, waiting for the catheter)
    set(true);
    begin('irivc');
    logAction('procedure', 'PPG by IR');
  }
  return {
    btn, panel,
    /** The card's own model frame: the monitor's live numbers follow the patient until a reading is taken. */
    update() { if (shown && !run) pinLive(); },
    /** Whether the monitor stands in the HVPG tracing's place (a run is on or its result is held). */
    shown: () => shown,
    running: () => !!run,
    /** What the caption says: the step playing, then the result; '' when it has nothing to say. */
    caption() {
      if (run) return stepWords();
      if (!done) return '';
      const rd = READS.irpv, ppg = rd.ppg;
      return Number.isFinite(ppg) ? `${ppgWord(ppg, true)}. PPG = PV − IVC = ${word(rd.pv)} − ${word(rd.iv)} = ${word(ppg)} mmHg.` : '';
    },
    /** The HVPG measurement takes the place back, or a new patient is loaded. */
    hide() { run?.stop(); run = null; kind = ''; step = -1; done = false; set(false); },
    dispose() { run?.stop(); run = null; mon.dispose(); },
  };
}
