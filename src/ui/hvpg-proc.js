// HVPG procedure (Measure › HVPG): a transjugular measurement, played on the anatomy. A balloon
// catheter comes in from the neck, down the SVC, through the right atrium and the IVC into the right
// hepatic vein (stage.js draws it on the real vessels). The view closes in on its tip: the open vein
// reads the free pressure (FHVP); the balloon inflates just behind the pressure-reading tip, flow
// stops, and the still column in front of it reads the sinusoids (WHVP). HVPG = WHVP − FHVP.
// This card keeps the catheter's pressure tracing, the three readings and the steps.
// The numbers are the model's own (metrics.fhvp, whvp, hvpg from engine.hvpgTrue), the same as the
// readout tile. In Explore the live HVPG readouts stay hidden until this has run for the patient
// (store.hvpgMeasured, hiddenNow); the tracing's small waves are illustrative.

import { h, fmt, icon, toast, swapText } from './util.js';
import { glWords } from './gl-words.js';
import { hvpgSev, hvBlocked } from '../engine/pressure-cuts.js';
import { pressureColor } from './colormap.js';
import { store, logAction, hiddenNow, updateParams } from './store.js';
import { shownOr } from './shown.js';
import { classSoon, restartSoon, attrSoon, dataSoon, propSoon } from './class-soon.js';
import { T, ease, cruise, k01, balloonAt, timeOfBalloon, pressureAt, newWave, syncWave } from './hvpg-clock.js';
import { frameFor, cancelFrame } from './frame.js';
import { createTraceGL } from './trace-gl.js';
import { drawMonitor, C, SEV_C, cell, fm1 } from './monitor.js';
import { rateOf } from './table-marks.js';
import { PROCS, PROC_KINDS, procBlocked, procOffered, playProcedure, procRunning } from './proc-anim.js';
import { reduceMotionMQ } from './motion.js';
import { createIrPpg } from './ir-ppg.js';
const nextFrame = frameFor('hvpg-proc');

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setHvpgStage(stage) { stageRef = stage; }

// A thrombosed hepatic vein (Budd–Chiari): the tip reaches the ostium, probes it a few times, then the
// procedure is aborted and the catheter withdrawn. No reading, so HVPG stays unmeasured.
const TB = { probe0: T.zoom + 300, probe1: T.zoom + 3900, abort: T.zoom + 3900, back: T.zoom + 5300, end: T.zoom + 8700 };   // (from the end of the catheter's way in, as it was: 4600, 8200, 8200, 9600, 13000)
const ABORT_MSG = 'Unable to cannulate the hepatic vein: procedure aborted';
const STEPS = [
  ['enter', 'Catheter in', 'Right internal jugular access: the balloon catheter passes through the SVC, the right atrium and the IVC into the right hepatic vein.', 'Catheter'],
  ['free', 'Free pressure (FHVP)', 'With the balloon deflated, the tip records the hepatic venous outflow pressure.', 'Free'],
  ['wedge', 'Wedged pressure (WHVP)', 'The balloon is inflated just proximal to the tip and occludes the vein. Once the pressure is stable, the static column beyond it reflects the sinusoidal pressure.', 'Wedged'],
  ['result', 'HVPG = WHVP − FHVP', 'The pressure drop across the sinusoids. Normal <5 mmHg; ≥10 mmHg is clinically significant portal hypertension.', 'HVPG'],
];
// The tracing is the one monitor (monitor.js), dark in both themes; its colours are the figure's rings' too.
const sevOf = hvpgSev;
// The two readings carry the colour their tiles give them (the wedged as the portal pressure, the free as the IVC's).
const SEV = { ok: 'ok', mid: 'caution', hi: 'danger' };
const readOf = {};   // (the one reading rateOf is handed, {[k]: v}, rewritten in place: rateOf reads only that key and keeps nothing)
const sevOfRead = (k, v) => { readOf[k] = v; return SEV[rateOf(k, readOf)[0]] || ''; };
const SEV_WORD = { danger: 'Clinically significant portal hypertension (CSPH)', caution: 'Mild portal hypertension', ok: 'Normal' };
const sevWord = (v) => SEV_WORD[hvpgSev(v)];
// (The words a phase says, made once: a frame picks one by the band instead of building it.)
const ABORT_CAP = `${ABORT_MSG}. The hepatic vein is thrombosed (Budd–Chiari), so the catheter cannot enter it and no free or wedged pressure can be read. HVPG is not measurable.`;
const RESULT_CAP = { danger: `${SEV_WORD.danger}. ${STEPS[3][2]}`, caution: `${SEV_WORD.caution}. ${STEPS[3][2]}`, ok: `${SEV_WORD.ok}. ${STEPS[3][2]}` };
const RESULT_CLS = { danger: 'result danger', caution: 'result caution', ok: 'result ok' };
const KEYS3 = ['fhvp', 'whvp', 'hvpg'], KEYS2 = ['fhvp', 'whvp'];
const cF = cell(), cW = cell(), cH = cell();   // (the figure's callouts' numbers: fm1, monitor.js)
const SHOT_NEAR = { near: true }, SHOT_FAR = { near: false };   // (cathFocus's options, made once: only the route shot keeps the view near the tip)
const HEADS = ['CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg', 'CATHETER TIP PRESSURE · mmHg', 'CATHETER TIP · mmHg'];
const NOTE_PROBE = ['Probing the ostium: the vein cannot be cannulated.', 'The vein cannot be cannulated.'];
const NOTE_IDLE = ['The tracing starts once the tip is in the hepatic vein.', 'Starts once the tip is in the hepatic vein.', 'Starts in the hepatic vein.'];
const NOTE_WAIT = ['Waiting for the hepatic vein.'];

export function createHvpgProcedure() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'HVPG measurement: catheter pressure tracing' });
  const box = h('div', { class: 'chart-box hvpg-box' }, cv);
  // (The tracing drawn by the GPU, trace-gl.js: its canvas over this one, which is left blank; null: drawn on this canvas.)
  const gpu = createTraceGL(cv, { redraw: () => draw() });
  const vals = {};
  // On top: the button and the three readings; then the tracing; then the steps and what is happening.
  const kv = h('dl', { class: 'hvpg-kv' }, ['fhvp', 'whvp', 'hvpg'].map((k) => {
    vals[k] = h('dd', {}, '—');
    return h('div', {}, h('dt', {}, { fhvp: 'FHVP', whvp: 'WHVP', hvpg: 'HVPG' }[k]), vals[k]);
  }));
  const stepEls = STEPS.map(([id, title, , short]) => h('li', { 'data-step': id, title }, h('span', {}, short)));
  const caption = h('p', { class: 'ctl-sub hvpg-caption', 'aria-live': 'polite' });
  // A touch starts it on the lift itself, so a tap never depends on the browser turning it into a click
  // (start() ignores the click that follows).
  const startBtn = h('button', { class: 'btn primary', onclick: () => start(), onpointerup: (e) => { if (e.pointerType !== 'mouse' && !startBtn.disabled) start(); } }, icon('catheter'), h('span', {}, 'Measure HVPG'));
  const note = h('p', { class: 'ctl-sub hvpg-note' });
  // (The three readings and the button's words change as the catheter runs: drawn on the GPU while they change, gl-words.js.)
  const valW = Object.fromEntries(Object.entries(vals).map(([k, e]) => [k, glWords(e, { keep: true })])), btnW = glWords(startBtn.lastChild);
  const bar = h('div', { class: 'hvpg-bar' }, startBtn, kv);
  // The treatments played on the same anatomy (proc-anim.js): each catheter on its own route, the model changed when it ends.
  // One the patient cannot have (a TIPS already in, a shunt already closed) stays dimmed, and a tap says why; BRTO and BATO
  // are only there while the patient has gastric varices to treat.
  const procBtns = Object.fromEntries(PROC_KINDS.map((k) => [k, h('button', { type: 'button', class: 'btn sm hvpg-proc-btn', 'aria-label': `Play ${PROCS[k].name}`,
    onclick: () => play(k), onpointerup: (e) => { if (e.pointerType !== 'mouse' && !procBtns[k].disabled) play(k); } }, icon('play'), h('span', {}, PROCS[k].name))]));
  // The PPG by interventional radiology, a measurement played the same way (ir-ppg.js): its monitor stands in the HVPG tracing's place while it runs and after it.
  const ir = createIrPpg({ busy: () => (t0 != null && t < tEnd()) || !!proc, onChange: () => paintSide() });
  const procRow = h('div', { class: 'hvpg-procs', role: 'group', 'aria-label': 'Play a procedure on the anatomy' }, h('span', { class: 'hvpg-procs-k' }, 'Watch'), ...Object.values(procBtns), ir.btn);
  const stepsEl = h('ol', { class: 'hvpg-steps' }, stepEls);
  const side = h('div', { class: 'chart-side' }, stepsEl, caption, procRow, note);
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' }, bar, box, ir.panel, side);

  let t0 = null, t = 0, raf = 0, frame = null, result = null, sig = '', cam = '', blocked = false;
  const phase = () => (t0 == null && !result ? 'idle' : blocked ? (t < TB.abort ? 'enter' : 'abort') : t < T.free ? 'enter' : t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  // (The pane is fed frames only while it is on screen; the store always has the newest.)
  const now = () => store.get().frame || frame;
  // Live values while measuring, the captured ones once done.
  // Read once when the catheter starts, so FHVP, WHVP and their difference agree on screen throughout.
  let snap = null;
  // (The live readings are written into one object, read at once by whoever asked: a frame makes none. A copy is taken where one is kept: snap.)
  const liveV = { fhvp: 0, whvp: 0, hvpg: 0 }, openV = { fhvp: 0, whvp: 0, hvpg: 0 }, shown = { fhvp: false, whvp: false, hvpg: false };
  const live = () => { const m = now()?.metrics; liveV.fhvp = m?.fhvp ?? 0; liveV.whvp = m?.whvp ?? 0; liveV.hvpg = m?.hvpg ?? 0; return liveV; };
  const values = () => result || snap || live();

  function start() {
    if ((t0 != null && t < tEnd()) || proc || procRunning()) return;
    const st = store.get();
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    ir.hide();
    result = null; t0 = performance.now(); t = 0; cam = ''; blocked = hvBlocked(st.params); snap = now()?.metrics ? { ...live() } : null;   // alloc-rare: once as a measurement starts (a copy, kept for the run)
    loop();
  }
  function stopFigure() { stageRef?.setCatheter(null); if (cam && cam !== 'home') stageRef?.cathFocus('home'); cam = ''; }
  const tEnd = () => (blocked ? TB.end : T.end);
  // ── A treatment played on the anatomy (one at a time, never with the measurement) ──
  let proc = null, procKind = '', procStep = -1, playT = 0;
  function play(kind) {
    // (A touch plays it on the lift; the click that follows is ignored.)
    if (performance.now() - playT < 600 || proc || procRunning() || (t0 != null && t < tEnd()) || !stageRef) return;
    playT = performance.now();
    const st = store.get(), why = procBlocked(kind, st.params, now()?.metrics);
    if (why) { toast(why); return; }
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    procKind = kind; procStep = 0;
    // (Each step names the vessel it works on with the figure's own callout, as a slide's mark; whatever was called out before
    // comes back when it ends. Here it plays through by itself, holding a moment at each step.)
    const focus0 = store.get().focus;
    let applied = false;
    proc = playProcedure(stageRef, kind, {
      apply: () => { if (!applied) { applied = true; updateParams((p) => PROCS[kind].apply(p), { label: PROCS[kind].label }); } },
      onStep: (k) => { procStep = k; paintSide(); },
      onMark: (m) => store.set({ focus: m ? { ...m, marks: [m] } : focus0 }),
      onEnd: () => { proc = null; procKind = ''; procStep = -1; paintSide(); },
    });
    logAction('procedure', PROCS[kind].name);
    paintSide();
  }
  function reset() { ir.hide(); proc?.stop(); cancelFrame(raf); raf = 0; if (t0 != null && t < tEnd()) { stopFigure(); } t0 = null; t = 0; result = null; snap = null; sig = ''; blocked = false; paintSide(); draw(); }
  function loop() {
    cancelFrame(raf);
    const step = () => {
      t = performance.now() - t0;
      if (!result && !blocked && t >= T.result) finish();
      figure();
      paintSide(); sweeping = true; draw(); sweeping = false;
      if (t < tEnd()) raf = nextFrame(step);
      else { raf = 0; stageRef?.setCatheter(null); logAction('hvpg', blocked ? 'aborted' : 'measured'); }
    };
    step();
  }
  function finish() {
    const f = now(), m = f?.metrics;
    if (!m) return;
    // alloc-rare: once per measurement, as the catheter reaches the result (step calls finish only while result is unset)
    result = { ...(snap || { fhvp: m.fhvp, whvp: m.whvp, hvpg: m.hvpg }), t: f.t, day: f.day };
    store.setSoon({ lastHVPG: result, hvpgMeasured: true });   // (from the procedure's frame: the dock and charts hear it after it)   // alloc-rare: the same once
  }

  // ── The figure: the catheter, its labels and the camera ──
  // What setCatheter is handed each frame is kept and rewritten in place (the figure reads the newest, as it did the newest new one):
  // the catheter's state, its list of readings, and each reading. A measurement's readings and a blocked vein's have their own.
  const lblF = { key: 'f', at: 'tip', kicker: 'FHVP', text: '', unit: 'mmHg', cls: 'free' };
  const lblW = { key: 'w', at: 'ahead', kicker: 'WHVP', text: '', unit: 'mmHg', cls: 'wedge' };
  const rowW = { at: 'ahead', kicker: 'WHVP', text: '', unit: 'mmHg', cls: 'wedge' }, rowF = { at: 'tip', kicker: 'FHVP', text: '', unit: 'mmHg', cls: 'free' };
  const lblCalc = { kicker: 'HVPG', text: '', unit: 'mmHg', cls: '' };
  const lblSum = { key: 's', at: 'sum', rows: [rowW, rowF], calc: lblCalc };
  const lblP = { key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' };
  const lblA = { key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'Aborted', unit: '', cls: 'result danger' };
  const cathA = { u: 0, balloon: 0, column: 0, columnColor: '', ring: null, pulse: 0, clock: 0, opacity: 1, labels: [], follow: false };
  const cathB = { ostium: true, probe: 0, u: 0, balloon: 0, column: 0, ring: null, pulse: 0, clock: 0, opacity: 1, labels: [], follow: false };
  function figure() {
    const sg = stageRef;
    if (!sg) return;
    if (blocked) { figureBlocked(sg); return; }
    // The camera: the route while the catheter travels, the tip close up for the readings, then back.
    // (Each move waits until the anatomy is on screen: a switch from the circuit takes a moment.)
    const want = t < T.zoom ? 'route' : t < T.back ? 'tip' : 'home';
    if (want !== cam && (want !== 'route' || t > 250) && sg.cathFocus(want, want === 'tip' ? 1100 : 800, want === 'route' ? SHOT_NEAR : SHOT_FAR)) cam = want;
    // (While it travels the view drifts after the tip: setCatheter's follow, after the catheter's own step.)
    const follow = cam === 'route' && want === 'route';
    const v = values(), ph = phase(), pulse = 0.5 + 0.5 * Math.sin(t / 170);
    const labels = cathA.labels;
    labels.length = 0;
    // (A reading is the mean, as a monitor's number is: the trace wavers with the breath and the beat, the number holds.)
    // (The readings are kept objects, their words set in place; a number's text is rebuilt only when the number changes, fm1.)
    if (ph === 'free') { lblF.text = fm1(cF, v.fhvp); labels.push(lblF); }
    if (ph === 'wedge') {
      lblF.text = fm1(cF, v.fhvp); labels.push(lblF);
      if (t >= T.callout) { lblW.text = fm1(cW, v.whvp); labels.push(lblW); }
    }
    // Both readings stay; a bracket joins them and gives the difference.
    if (ph === 'result' && t < T.back) {
      rowW.text = fm1(cW, v.whvp); rowF.text = fm1(cF, v.fhvp);
      lblCalc.text = fm1(cH, v.hvpg); lblCalc.cls = RESULT_CLS[sevOf(v.hvpg)];
      labels.push(lblSum);
    }
    cathA.u = cruise(k01(t, T.travel0, T.travel1));
    cathA.balloon = balloonAt(t) * (1 - k01(t, T.back, T.back + 500));
    cathA.column = ease(k01(t, T.settle, T.settle + 1400)) * (1 - k01(t, T.back, T.back + 500));
    cathA.columnColor = pressureColor(v.whvp);
    cathA.ring = ph === 'free' ? C.free : ph === 'wedge' && t > T.wedge ? C.wedge : null;
    cathA.pulse = pulse; cathA.clock = t;
    cathA.opacity = 1 - k01(t, T.back + 300, T.end);
    cathA.follow = follow;
    sg.setCatheter(cathA);
  }

  function figureBlocked(sg) {
    const want = t < T.zoom ? 'route' : t < TB.back + 1500 ? 'tip' : 'home';
    if (want !== cam && (want !== 'route' || t > 250) && sg.cathFocus(want, want === 'tip' ? 1100 : 800, want === 'route' ? SHOT_NEAR : SHOT_FAR)) cam = want;
    const follow = cam === 'route' && want === 'route';
    // Three short pushes against the clot, each easing in and back out.
    const pk = k01(t, TB.probe0, TB.probe1), probe = t < TB.probe1 ? Math.pow(Math.sin(pk * 3 * Math.PI), 2) * 0.9 : 0;
    const labels = cathB.labels;
    labels.length = 0;
    if (t >= TB.probe0 && t < TB.abort) labels.push(lblP);
    else if (t >= TB.abort && t < TB.end - 800) labels.push(lblA);
    cathB.probe = probe;
    cathB.u = cruise(k01(t, T.travel0, T.travel1)) * (1 - ease(k01(t, TB.back, TB.end - 500)));
    cathB.ring = t >= TB.abort ? C.danger : null; cathB.pulse = 0.5 + 0.5 * Math.sin(t / 170); cathB.clock = t;
    cathB.opacity = 1 - k01(t, TB.end - 900, TB.end); cathB.follow = follow;
    sg.setCatheter(cathB);
  }

  function paintSide() {
    const ph = phase(), st = store.get();
    // Before any measurement, with the readouts on show (Settings, or measured once for this patient), the three read live,
    // the free and wedged pressures as the bar reads them and the HVPG as their difference, so the row and the bar agree (sweep
    // batch 03, shots 05 and 30: dashes here beside HVPG 0.9 on the bar).
    const open = ph === 'idle' && !!st.frame?.metrics && !hiddenNow(st)?.has('trueHVPG') && !hvBlocked(st.params);   // (a blocked vein: dashes, as after the abort)
    let v = values();
    if (open) { const f1 = Math.round(shownOr('fhvp', v.fhvp) * 10) / 10, w1 = Math.round(shownOr('whvp', v.whvp) * 10) / 10; openV.fhvp = f1; openV.whvp = w1; openV.hvpg = Math.round((w1 - f1) * 10) / 10; v = openV; }
    // (Which readings are shown: three flags written in place.)
    if (open) { shown.fhvp = true; shown.whvp = true; shown.hvpg = true; }
    else { shown.fhvp = ph !== 'idle' && ph !== 'enter' && ph !== 'abort'; shown.whvp = ph === 'result' || (ph === 'wedge' && t >= T.callout); shown.hvpg = ph === 'result' && (t0 == null || t >= T.sum); }
    for (let ki = 0; ki < 3; ki++) {
      const k = KEYS3[ki];
      const txt = shown[k] ? fmt(v[k], 1) : '—';
      if (valW[k].text !== txt) {
        valW[k].set(txt);
        // The difference arrives after the two readings have settled: it fades and rises in, never pops. (Not a live reading:
        // restarted with every new tenth, its fade held it blank on Mac, iPad and sideways, sweep 2 review item 5.)
        if (k === 'hvpg' && shown.hvpg && !open) { restartSoon(vals.hvpg, 'in'); }   // (the next frame starts the fade again: no layout forced to restart it)
      }
    }
    // This runs on every model frame: write only what changed. Rewriting the button's label each frame
    // replaced its text under the finger, and Safari then takes a tap for a hover and drops the click.
    const sev = shown.hvpg ? sevOf(v.hvpg) : '';
    dataSoon(vals.hvpg, 'sev', sev);
    for (let ki = 0; ki < 2; ki++) {
      const k = KEYS2[ki];
      const sk = shown[k] ? sevOfRead(k, v[k]) : '';
      dataSoon(vals[k], 'sev', sk);
    }
    let cur = 1;
    if (ph !== 'abort') { cur = -1; for (let i = 0; i < STEPS.length; i++) if (STEPS[i][0] === ph) { cur = i; break; } }
    for (let i = 0; i < stepEls.length; i++) { const v2 = ph === 'idle' ? '' : ph === 'abort' ? (i === 0 ? 'done' : '') : i < cur || ph === 'result' ? 'done' : i === cur ? 'now' : ''; dataSoon(stepEls[i], 'state', v2); }
    const cap = ph === 'idle' ? 'Via the right internal jugular vein, a balloon catheter records free, then wedged, hepatic venous pressure.'
      : ph === 'abort' ? ABORT_CAP
      : blocked && t >= TB.probe0 ? 'The tip is at the hepatic vein ostium, but the vein is thrombosed: the catheter cannot be advanced.'
      : ph === 'result' ? RESULT_CAP[hvpgSev(v.hvpg)] : STEPS[cur][2];
    // (A treatment playing tells its own step instead.)
    const say = proc ? PROCS[procKind].steps[Math.max(0, procStep)][2] : ir.caption() || cap;
    swapText(caption, say);   // (a new step's words crossfade in)
    const busy = (t0 != null && t < tEnd()) || !!proc || ir.running();
    propSoon(box, 'hidden', ir.shown()); propSoon(stepsEl, 'hidden', ir.shown());   // (the PPG by IR's monitor stands in the HVPG tracing's place, and the HVPG's four steps give way to its caption)
    propSoon(ir.btn, 'disabled', busy);
    propSoon(startBtn, 'disabled', busy);
    for (let pi = 0; pi < PROC_KINDS.length; pi++) {
      const k = PROC_KINDS[pi], b = procBtns[k];
      propSoon(b, 'disabled', busy);
      // (BRTO and BATO are offered only while the patient has gastric varices: with none they are not shown at all.)
      const m = now()?.metrics, hide = !procOffered(k, st.params, m) && procKind !== k;
      propSoon(b, 'hidden', hide);
      const off = !!procBlocked(k, st.params, m), on = procKind === k;
      classSoon(b, 'off', off);
      attrSoon(b, 'aria-pressed', on ? 'true' : 'false');
    }
    const lbl = t0 != null && t < tEnd() ? 'Measuring…' : result ? 'Measure again' : 'Measure HVPG';
    btnW.set(lbl);
    const n = st.mode === 'explore' && !st.presenting
      ? (st.showHvpg ? 'The HVPG readouts are always shown.' : st.hvpgMeasured ? 'Measured: the HVPG readouts stay live until a new patient is loaded.' : 'The HVPG readouts stay hidden until the HVPG is measured here.')
      : 'The same numbers as the HVPG tile.';
    swapText(note, n);
  }

  // ── The tracing ──────────────────────────────────
  const drawSt = { ph: '', t: 0, v: null, blocked: false, running: false, wave: null };   // (what the tracing is handed: kept, written in place, read at once)
  const wave = newWave();   // (the model's beat and breath, which the trace's waves follow: hvpg-clock.js syncWave)
  let sweeping = false;   // (a sweep frame is being drawn: the one draw that moves the waves on)
  const draw = () => { drawSt.ph = phase(); drawSt.t = t; drawSt.v = values(); drawSt.blocked = blocked; drawSt.running = t0 != null; if (sweeping || !wave.on) syncWave(wave, now(), t, performance.now()); drawSt.wave = wave; drawTrace(cv, drawSt, gpu); };   // (the waves follow the model's clock only while the sweep runs; at rest, a resize or a context restore redraws the trace with the waves it was last drawn with)

  function update(f) {
    frame = f;
    ir.update();
    if (raf) return;   // the animation loop paints
    paintSide();
    const r = cv.getBoundingClientRect();
    const key = [Math.round(r.width), Math.round(r.height), phase(), result ? '' : fmt(f.metrics.fhvp, 1) + fmt(f.metrics.whvp, 1)].join('|');
    if (key !== sig) { sig = key; draw(); }
  }
  // A new patient (or a jump in time) starts with no measurement.
  store.on('hvpgMeasured', (v) => { if (!v && (result || t0 != null || proc)) reset(); });
  store.on('lastHVPG', (v) => { if (!v && result) reset(); });
  paintSide();
  return { id: 'hvpg', label: 'HVPG procedure', el, update, start };
}

// The same monitor for a Presenter slide (decks.js monitor, under the slide's words), following the slide's
// catheter: set('free') sweeps the free pressure in, set('wedge') inflates the balloon and climbs to the wedge,
// set('result') holds the wedge and gives the HVPG. Forward, it carries on from where the last slide left the trace.
const SPAN = { free: [T.free - 300, T.inflate - 80], wedge: [T.inflate, T.result - 1], result: [T.result, T.sum + 700] };
const ORDER = ['free', 'wedge', 'result'];
export function createHvpgMonitor() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Catheter pressure tracing, as on the monitor in the procedure room' });
  // The readings the tracing draws, in words (a screen reader gets no canvas): the phase, the free and wedged pressures, the HVPG and
  // its band, in mmHg. Written when the phase changes and once the numbers have held still, never with every frame of the sweep.
  const said = h('p', { class: 'sr-only' });
  const el = h('div', { class: 'pz-mon' }, h('div', { class: 'chart-box hvpg-box' }, cv), h('div', { class: 'sr-only', role: 'group', 'aria-label': 'Catheter pressure readings' }, said));
  const gpu = createTraceGL(cv, { redraw: () => { if (mode || waiting) draw(); } });   // (the tracing drawn by the GPU, trace-gl.js)
  let mode = null, t = 0, t1 = 0, last = 0, raf = 0, fp = null, bal = 0, sayT = 0;
  let waiting = false;   // (the catheter is not in the hepatic vein yet: the axes and a note, no trace, nothing recorded: Mohammad, 12 Nov 2026)
  // The slide's own readings (the catheter's callouts and the tiles show the same), else the live model's.
  // (Written into one object that its caller reads at once: a frame makes none.)
  const liveV = { fhvp: 0, whvp: 0, hvpg: 0 };
  const live = () => { const m = fp || store.get().frame?.metrics; liveV.fhvp = m?.fhvp ?? 0; liveV.whvp = m?.whvp ?? 0; liveV.hvpg = m?.hvpg ?? 0; return liveV; };
  const sayNow = () => {
    sayT = 0;
    const m = fp || store.get().frame?.metrics, v = live(), mm = (x) => `${fmt(x, 1)} mmHg`;
    const say = !mode ? ''
      : !(Number.isFinite(m?.fhvp) && Number.isFinite(m?.whvp)) ? 'No pressure can be read. HVPG is not measurable.'
      : mode === 'free' ? `Free hepatic venous pressure (FHVP) ${mm(v.fhvp)}. The tracing is flat at the FHVP. ${STEPS[1][2]}`
      : mode === 'wedge' ? `Balloon inflated. Wedged hepatic venous pressure (WHVP) ${mm(v.whvp)}; FHVP ${mm(v.fhvp)}. The tracing rises with balloon occlusion and holds a stable plateau. ${STEPS[2][2]}`
      : `HVPG ${mm(v.hvpg)}: WHVP ${mm(v.whvp)} minus FHVP ${mm(v.fhvp)}. ${sevWord(v.hvpg)}.`;
    if (said.textContent !== say) said.textContent = say;
  };
  const saySoon = () => { clearTimeout(sayT); sayT = setTimeout(sayNow, 400); };
  const phase = () => (t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  const drawSt = { ph: '', t: 0, v: null, blocked: false, running: true, wave: null };   // (what the tracing is handed: kept, written in place, read at once)
  const wave = newWave();   // (the model's beat and breath, which the trace's waves follow: hvpg-clock.js syncWave)
  let sweeping = false;   // (a sweep frame is being drawn: the one draw that moves the waves on)
  const draw = () => { drawSt.ph = waiting && !mode ? 'idle' : phase(); drawSt.t = t; drawSt.v = live(); if (sweeping || !wave.on) syncWave(wave, store.get().frame, t, performance.now()); drawSt.wave = wave; drawTrace(cv, drawSt, gpu); };   // (as the procedure's: the waves move on only in a sweep frame, so the card zoomed open or shut redraws the very trace it had)
  // The balloon is the clock for the pressure's rise: the trace climbs exactly as far as the balloon is filled, so it
  // waits at the free level until the balloon starts to fill, holds its plateau once it is up, and comes back down
  // with it. Past the wedge (balloon up) the trace runs on its own clock again.
  const rising = () => mode !== 'free' && bal < 1 && t <= T.wedge;   // the balloon is still setting the trace
  const falling = () => mode === 'free' && bal > 0;                  // back from a wedge slide: held, then down with the balloon
  function step(now) {
    const dt = Math.max(0, Math.min(64, now - last)); last = now;   // (a long frame or a hidden tab moves the sweep 64 ms, as the procedures' own clock does, never to its end)
    if (falling()) { if (bal < 1) t = Math.min(t, timeOfBalloon(bal)); }
    else if (mode === 'free' && t >= T.inflate) t = SPAN.free[0];   // the balloon is down: the free trace sweeps in afresh
    else if (rising()) t = bal > 0 ? timeOfBalloon(bal) : Math.min(t + dt, T.inflate);
    else t = Math.min(t1, t + dt);
    sweeping = true; draw(); sweeping = false;
    // (The sweep runs to its end even while its card is off the page a moment (zoomed open, moved as a slide settles): it is drawn there
    // once the card is back. Only the balloon's rise and fall wait for the card.)
    raf = t < t1 || (el.isConnected && (falling() || rising())) ? nextFrame(step) : 0;
  }
  const goStep = (now) => { last = now; step(now); };   // (made once: go asks for it on every balloon frame)
  const go = () => { cancelFrame(raf); raf = nextFrame(goStep); };
  // (instant: the finished tracing at once, a slide jumped to or gone back to; a card with no catheter on the figure.)
  function set(m, f = null, b = bal, instant = false) {
    const span = SPAN[m];
    fp = f; bal = b; waiting = false;
    saySoon();
    if (!span || (m === mode && (raf || t >= t1))) { if (!raf) draw(); return; }
    const fwd = mode && ORDER.indexOf(m) > ORDER.indexOf(mode);
    // (A free slide reached with the balloon still up keeps the trace as it is until the balloon is down.)
    if (!(m === 'free' && bal > 0) && !(fwd && t >= SPAN[mode][0] && t <= span[0])) t = span[0];
    // Already wedged (back from the result slide): the pressure is on its plateau, nothing climbs again.
    if (m !== 'free' && bal >= 1) t = Math.max(t, T.wedge);
    // (Next onto the result while the wedge still holds its plateau: the HVPG comes at once, never after the rest of the plateau has played out. Seen in
    // headless shots, 13 Nov 2026: a Next pressed on WHVP waited for the clock to reach the result.)
    if (fwd && m === 'result') t = Math.max(t, span[0]);
    mode = m; t1 = span[1];
    if ((instant || reduceMotionMQ.matches) && !falling()) t = t1;
    // (Once the card is laid out: the canvas sizes itself to it.)
    go();
  }
  /** The catheter's balloon (0..1), every frame: the one value the pressure follows. */
  function balloon(b) {
    if (b === bal) return;
    bal = b;
    // (V-CHART-5: drawn in the frame the figure moved the balloon in, not asked for the next one, so the step in the trace and the balloon land together.)
    if (mode && el.isConnected) { const now = performance.now(); if (!raf) last = now; cancelFrame(raf); raf = 0; step(now); }
  }
  // (A new size redraws it; the animation loop paints while it runs.)
  new ResizeObserver(() => { if (!raf && (mode || waiting)) draw(); }).observe(cv);
  /** The catheter has not reached the hepatic vein: the monitor stands empty (a trace already begun is left alone). Returns whether it is empty now. */
  function hold() { if (mode) return false; waiting = true; if (!raf) draw(); return true; }
  return { el, set, balloon, hold, started: () => !!mode };
}

// ── The tracing: the one monitor (monitor.js), dark in both themes, on the HVPG catheter's script ──
// st: { ph: the phase, t: ms on the procedure's clock (T), v: { fhvp, whvp, hvpg }, blocked, running: still sweeping, wave: the model's beat and
// breath for the waves (hvpg-clock.js syncWave; null: the trace's own) }
// g: the GPU drawer (trace-gl.js): the whole monitor drawn by the GPU through its 2D context, every word, line and fill, with this
// canvas left blank; null, or where the GPU cannot draw now, on this canvas as before.
// The HVPG catheter's script: the free sweep, the balloon up and the pressure riding it to the wedge, the wedge read once it has held, then the HVPG.
// (The monitor's number is the mean, as the callout on the figure reads it; it follows the trace only while the balloon is still changing it.)
export const HVPG_SCRIPT = {
  heads: HEADS, win: [T.free - 300, T.back], enterWord: 'Catheter advancing',
  abort: ['Unable to cannulate hepatic vein', 'Unable to cannulate hepatic vein: procedure aborted', 'HVPG not measurable'],
  notes: { idle: NOTE_IDLE, wait: NOTE_WAIT, probe: NOTE_PROBE },
  at: (tt, v, w) => pressureAt(tt, v, w),
  segs: [[T.free - 300, T.inflate, 'free'], [T.inflate, T.back, 'wedge']],   // (blue while free, orchid once the balloon is up; the wedged trace solid: owner, 10 Nov 2026)
  status(t, v, st, o) {
    if (t < T.inflate) { o.label = 'FHVP'; o.num = fmt(v.fhvp, 1); o.col = 'free'; }
    else if (t < T.result) { o.label = t < T.wedge ? 'Balloon inflating' : t < T.callout ? 'Settling' : 'WHVP'; o.num = fmt(t < T.callout ? pressureAt(t, v, st.wave) : v.whvp, 1); o.col = 'wedge'; }
    else if (st.running && t < T.sum) { o.label = 'WHVP'; o.num = fmt(v.whvp, 1); o.col = 'wedge'; }
    else { o.label = 'HVPG'; o.num = fmt(v.hvpg, 1); o.col = SEV_C[sevOf(v.hvpg)]; }
  },
  // (N6, trace callouts: a marker drops onto the trace where each reading is taken, the free as the free sweep ends, the wedge once the plateau has held.)
  drops: [[T.inflate - 80, 'Free', 'fhvp', 'free', 1], [T.callout, 'Wedge', 'whvp', 'wedge', -1]],
  levels: [[T.inflate, 'fhvp', 'free', 'FHVP'], [T.result, 'whvp', 'wedge', 'WHVP']],
  result: { show: T.result, at: T.sum, lo: 'fhvp', hi: 'whvp', key: 'hvpg', word: 'HVPG', sev: hvpgSev },
  ticks: [[T.inflate, 'balloon up']],   // (the balloon's tick and its words come with the balloon, not before: Mohammad, 12 Nov 2026)
  ymax: (v) => Math.max(15, Math.ceil((Math.max(v.whvp, v.fhvp) + 5) / 5) * 5),
};
const MST = { ph: 'idle', t: 0, v: null, running: false, wave: null, probing: false };   // (what the monitor is handed: kept, written in place)
function drawTrace(cv, st, g = null) {
  MST.ph = st.ph === 'idle' || st.ph === 'enter' || st.ph === 'abort' ? st.ph : 'run';
  MST.t = st.t; MST.v = st.v; MST.running = st.running; MST.wave = st.wave; MST.probing = !!st.blocked && st.t >= TB.probe0;
  drawMonitor(cv, g, HVPG_SCRIPT, MST);
}
