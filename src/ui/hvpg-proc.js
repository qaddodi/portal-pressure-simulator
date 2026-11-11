// HVPG procedure (Measure › HVPG): a transjugular measurement, played on the anatomy. A balloon
// catheter comes in from the neck, down the SVC, through the right atrium and the IVC into the right
// hepatic vein (stage.js draws it on the real vessels). The view closes in on its tip: the open vein
// reads the free pressure (FHVP); the balloon inflates just behind the pressure-reading tip, flow
// stops, and the still column in front of it reads the sinusoids (WHVP). HVPG = WHVP − FHVP.
// This card keeps the catheter's pressure tracing, the three readings and the steps.
// The numbers are the model's own (metrics.fhvp, whvp, hvpg from engine.hvpgTrue), the same as the
// readout tile. In Explore the live HVPG readouts stay hidden until this has run for the patient
// (store.hvpgMeasured, hiddenNow); the tracing's small waves are illustrative.

import { h, fmt, clamp, icon, cssVar, toast, swapText } from './util.js';
import { glWords } from './gl-words.js';
import { hvpgSev, hvBlocked } from '../engine/pressure-cuts.js';
import { FONT } from './charts.js';
import { pressureColor } from './colormap.js';
import { store, logAction, hiddenNow, updateParams } from './store.js';
import { shownOr } from './shown.js';
import { classSoon, restartSoon, attrSoon, dataSoon, propSoon } from './class-soon.js';
import { T, ease, cruise, k01, balloonAt, timeOfBalloon, pressureAt, newWave, syncWave } from './hvpg-clock.js';
import { frameFor, cancelFrame } from './frame.js';
import { createTraceGL, fitPen } from './trace-gl.js';
import { traceRoom, TRACE_MIN } from './trace-room.js';
import { rateOf } from './table-marks.js';
import { drawCallout, dropK, sideFor, calloutCell, calloutText, inkSeg } from './trace-callouts.js';
import { PROCS, PROC_KINDS, procBlocked, procOffered, playProcedure, procRunning } from './proc-anim.js';
import { reduceMotionMQ } from './motion.js';
const nextFrame = frameFor('hvpg-proc');

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setHvpgStage(stage) { stageRef = stage; }

// A thrombosed hepatic vein (Budd–Chiari): the tip reaches the ostium, probes it a few times, then the
// procedure is aborted and the catheter withdrawn. No reading, so HVPG stays unmeasured.
const TB = { probe0: T.zoom + 300, probe1: T.zoom + 3900, abort: T.zoom + 3900, back: T.zoom + 5300, end: T.zoom + 8700 };   // (from the end of the catheter's way in, as it was: 4600, 8200, 8200, 9600, 13000)
const ABORT_MSG = 'Unable to cannulate hepatic vein — procedure aborted';
const STEPS = [
  ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC, through the right atrium and the IVC into the right hepatic vein.', 'Catheter'],
  ['free', 'Free pressure (FHVP)', 'The vein is open: the tip reads the pressure where the liver drains.', 'Free'],
  ['wedge', 'Wedged pressure (WHVP)', 'The balloon inflates just behind the tip and blocks the vein. Once the pressure settles, the still vein in front of it reads the sinusoids.', 'Wedged'],
  ['result', 'HVPG = WHVP − FHVP', 'The pressure drop across the sinusoids. Normal <5 mmHg; ≥10 is clinically significant portal hypertension.', 'HVPG'],
];
// The tracing is a monitor, dark in both themes (the Over time chart's dark trace colours).
const C = Object.defineProperties({}, Object.fromEntries(Object.entries({ bg: '--mon-bg', grid: '--mon-grid', line: '--mon-line', text: '--mon-text', bright: '--mon-bright',
  free: '--mon-free', wedge: '--mon-wedge', ok: '--mon-ok', caution: '--mon-caution', danger: '--mon-alarm' }).map(([k, n]) => [k, { get: () => cssVar(n) }])));
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
// A number's text, rebuilt only when the number is not the one it was built from (a cell is { v, s }, one for each place that prints).
const cell = () => ({ v: undefined, s: '' });
function fm1(c, v) {
  if (!Object.is(c.v, v)) { c.v = v; c.s = fmt(v, 1); }   // alloc-rare: only when the number differs from the one its text was built from
  return c.s;
}
const mkF = calloutCell(), mkW = calloutCell();   // (the two trace markers' words)
const cF = cell(), cW = cell(), cH = cell(), cHT = cell(), cLvF = cell(), cLvW = cell();
// The tracing's axes, set by traceOn for the frame it draws (the draw is synchronous and does not call itself).
let axTop = 0, axBot = 0, axMax = 15, axL = 0, axR = 0;
let waveNow = null;   // the model's clock for the frame being drawn (syncWave), or null: the trace's own beat and breath
const pAt = (tt, v) => pressureAt(tt, v, waveNow);
const Y = (p) => axBot - (clamp(p, 0, axMax) / axMax) * (axBot - axTop);
const X = (tt) => axL + k01(tt, T.free - 300, T.back) * (axR - axL);
const SHOT_NEAR = { near: true }, SHOT_FAR = { near: false };   // (cathFocus's options, made once: only the route shot keeps the view near the tip)
const HEADS = ['CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg', 'CATHETER TIP PRESSURE · mmHg', 'CATHETER TIP · mmHg'];
const NOTE_PROBE = ['Probing the ostium: the vein will not take the catheter.', 'The vein will not take the catheter.'];
const NOTE_IDLE = ['The tracing starts once the tip is in the hepatic vein.', 'Starts once the tip is in the hepatic vein.', 'Starts in the hepatic vein.'];
const NOTE_WAIT = ['Waiting for the hepatic vein.'];
/** The first of the lines whose width fits, else the last (the shortest form). */
function fitLine(ctx, list, room) {
  let q = list[0];
  for (let i = 0; i < list.length; i++) { q = list[i]; if (i === list.length - 1 || ctx.measureText(q).width <= room) break; }
  return q;
}
const tickText = [];   // (an axis number's text, by the number: made the first time it is drawn)
const tick = (p) => tickText[p] ?? (tickText[p] = String(p));   // alloc-rare: only the first time that number is drawn

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
  const procRow = h('div', { class: 'hvpg-procs', role: 'group', 'aria-label': 'Play a procedure on the anatomy' }, h('span', { class: 'hvpg-procs-k' }, 'Watch'), ...Object.values(procBtns));
  const side = h('div', { class: 'chart-side' }, h('ol', { class: 'hvpg-steps' }, stepEls), caption, procRow, note);
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' }, bar, box, side);

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
  function reset() { proc?.stop(); cancelFrame(raf); raf = 0; if (t0 != null && t < tEnd()) { stopFigure(); } t0 = null; t = 0; result = null; snap = null; sig = ''; blocked = false; paintSide(); draw(); }
  function loop() {
    cancelFrame(raf);
    const step = () => {
      t = performance.now() - t0;
      if (!result && !blocked && t >= T.result) finish();
      figure();
      paintSide(); draw();
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
    const cap = ph === 'idle' ? 'A balloon catheter via the right internal jugular vein reads the free, then the wedged, hepatic vein pressure.'
      : ph === 'abort' ? ABORT_CAP
      : blocked && t >= TB.probe0 ? 'The tip is at the hepatic vein ostium, but the vein is thrombosed: it will not advance.'
      : ph === 'result' ? RESULT_CAP[hvpgSev(v.hvpg)] : STEPS[cur][2];
    // (A treatment playing tells its own step instead.)
    const say = proc ? PROCS[procKind].steps[Math.max(0, procStep)][2] : cap;
    swapText(caption, say);   // (a new step's words crossfade in)
    const busy = (t0 != null && t < tEnd()) || !!proc;
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
      ? (st.showHvpg ? 'The HVPG readouts are always shown.' : st.hvpgMeasured ? 'Measured: the HVPG readouts are live for this patient until a new one.' : 'The HVPG readouts stay hidden until it is measured here.')
      : 'The same numbers as the HVPG tile.';
    swapText(note, n);
  }

  // ── The tracing ──────────────────────────────────
  const drawSt = { ph: '', t: 0, v: null, blocked: false, running: false, wave: null };   // (what the tracing is handed: kept, written in place, read at once)
  const wave = newWave();   // (the model's beat and breath, which the trace's waves follow: hvpg-clock.js syncWave)
  const draw = () => { drawSt.ph = phase(); drawSt.t = t; drawSt.v = values(); drawSt.blocked = blocked; drawSt.running = t0 != null; drawSt.wave = syncWave(wave, now(), t, performance.now()); drawTrace(cv, drawSt, gpu); };

  function update(f) {
    frame = f;
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
  const gpu = createTraceGL(cv, { redraw: () => { if (mode) draw(); } });   // (the tracing drawn by the GPU, trace-gl.js)
  let mode = null, t = 0, t1 = 0, last = 0, raf = 0, fp = null, bal = 0, sayT = 0;
  // The slide's own readings (the catheter's callouts and the tiles show the same), else the live model's.
  // (Written into one object that its caller reads at once: a frame makes none.)
  const liveV = { fhvp: 0, whvp: 0, hvpg: 0 };
  const live = () => { const m = fp || store.get().frame?.metrics; liveV.fhvp = m?.fhvp ?? 0; liveV.whvp = m?.whvp ?? 0; liveV.hvpg = m?.hvpg ?? 0; return liveV; };
  const sayNow = () => {
    sayT = 0;
    const m = fp || store.get().frame?.metrics, v = live(), mm = (x) => `${fmt(x, 1)} mmHg`;
    const say = !mode ? ''
      : !(Number.isFinite(m?.fhvp) && Number.isFinite(m?.whvp)) ? 'No pressure can be read. HVPG is not measurable.'
      : mode === 'free' ? `Free hepatic venous pressure (FHVP) ${mm(v.fhvp)}. The tracing runs level at the free pressure. ${STEPS[1][2]}`
      : mode === 'wedge' ? `Balloon up. Wedged hepatic venous pressure (WHVP) ${mm(v.whvp)}; free pressure (FHVP) ${mm(v.fhvp)}. The tracing rises with the balloon and holds a steady plateau. ${STEPS[2][2]}`
      : `HVPG ${mm(v.hvpg)}: the wedged pressure (WHVP) ${mm(v.whvp)} minus the free pressure (FHVP) ${mm(v.fhvp)}. ${sevWord(v.hvpg)}.`;
    if (said.textContent !== say) said.textContent = say;
  };
  const saySoon = () => { clearTimeout(sayT); sayT = setTimeout(sayNow, 400); };
  const phase = () => (t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  const drawSt = { ph: '', t: 0, v: null, blocked: false, running: true, wave: null };   // (what the tracing is handed: kept, written in place, read at once)
  const wave = newWave();   // (the model's beat and breath, which the trace's waves follow: hvpg-clock.js syncWave)
  const draw = () => { drawSt.ph = phase(); drawSt.t = t; drawSt.v = live(); drawSt.wave = syncWave(wave, store.get().frame, t, performance.now()); drawTrace(cv, drawSt, gpu); };
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
    draw();
    // (The sweep runs to its end even while its card is off the page a moment (zoomed open, moved as a slide settles): it is drawn there
    // once the card is back. Only the balloon's rise and fall wait for the card.)
    raf = t < t1 || (el.isConnected && (falling() || rising())) ? nextFrame(step) : 0;
  }
  const goStep = (now) => { last = now; step(now); };   // (made once: go asks for it on every balloon frame)
  const go = () => { cancelFrame(raf); raf = nextFrame(goStep); };
  // (instant: the finished tracing at once, a slide jumped to or gone back to; a card with no catheter on the figure.)
  function set(m, f = null, b = bal, instant = false) {
    const span = SPAN[m];
    fp = f; bal = b;
    saySoon();
    if (!span || (m === mode && (raf || t >= t1))) { if (!raf) draw(); return; }
    const fwd = mode && ORDER.indexOf(m) > ORDER.indexOf(mode);
    // (A free slide reached with the balloon still up keeps the trace as it is until the balloon is down.)
    if (!(m === 'free' && bal > 0) && !(fwd && t >= SPAN[mode][0] && t <= span[0])) t = span[0];
    // Already wedged (back from the result slide): the pressure is on its plateau, nothing climbs again.
    if (m !== 'free' && bal >= 1) t = Math.max(t, T.wedge);
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
  new ResizeObserver(() => { if (!raf && mode) draw(); }).observe(cv);
  return { el, set, balloon };
}

// ── The tracing: the monitor in the IR suite, dark in both themes ──
// st: { ph: the phase, t: ms on the procedure's clock (T), v: { fhvp, whvp, hvpg }, blocked, running: still sweeping, wave: the model's beat and
// breath for the waves (hvpg-clock.js syncWave; null: the trace's own) }
// g: the GPU drawer (trace-gl.js): the whole monitor drawn by the GPU through its 2D context, every word, line and fill, with this
// canvas left blank; null, or where the GPU cannot draw now, on this canvas as before.
function drawTrace(cv, st, g = null) {
  const p = fitPen(cv, g);
  try { traceOn(p, st); } finally { p.ctx.end?.(); }
}
let FS = 12;   // the monitor's word size this frame (traceRoom's fs: 12 on a small monitor, up to 15 on a wide one)
function traceOn({ ctx, w, h: hh }, { ph, t, v, blocked, running, wave }) {
  if (w < 80 || hh < 60) return;
  waveNow = wave;
  ctx.clearRect(0, 0, w, hh);
  rrect(ctx, 0, 0, w, hh, 12); ctx.fillStyle = C.bg; ctx.fill();
  const x = 14, y = 10, W = w - 28, H = hh - 18;
  const narrow = W < 300;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // (Every word on the monitor at 12 px or more; the header takes the longest form that clears the big reading.)
  const { big, fs, k: HK } = traceRoom(W, H, 10); FS = fs;
  ctx.font = FONT(700, big); const room = W - ctx.measureText('88.8').width - 12;
  ctx.fillStyle = C.text; ctx.font = FONT(600, FS);
  ctx.fillText(fitLine(ctx, HEADS, room), x, y + 13 * HK);
  let label, num = '', col = C.text;
  if (ph === 'abort') {
    ctx.font = FONT(600, FS); ctx.fillStyle = C.danger; ctx.fillText('Aborted', x, y + 32 * HK);
    ctx.textAlign = 'center'; ctx.font = FONT(600, FS); ctx.fillText(narrow ? 'Unable to cannulate hepatic vein' : 'Unable to cannulate hepatic vein: procedure aborted', w / 2, hh / 2 + 8);
    ctx.fillStyle = C.text; ctx.font = FONT(500, FS); ctx.fillText('HVPG not measurable', w / 2, hh / 2 + 28);
    return;
  }
  if (ph === 'idle') label = 'Ready';
  else if (ph === 'enter') label = 'Catheter advancing';
  // (The monitor's number is the mean, as the callout on the figure reads it; it follows the trace only while the balloon is still changing it.)
  else if (ph === 'free') { label = 'FHVP'; num = fmt(v.fhvp, 1); col = C.free; }
  else if (ph === 'wedge') { label = t < T.wedge ? 'Balloon inflating' : t < T.callout ? 'Settling' : 'WHVP'; num = fmt(t < T.callout ? pAt(t, v) : v.whvp, 1); col = C.wedge; }
  else if (running && t < T.sum) { label = 'WHVP'; num = fmt(v.whvp, 1); col = C.wedge; }
  else { label = 'HVPG'; num = fmt(v.hvpg, 1); col = C[sevOf(v.hvpg)]; }
  ctx.font = FONT(600, FS); ctx.fillStyle = col === C.text ? C.bright : col; ctx.fillText(label, x, y + 32 * HK);
  if (num) { ctx.font = FONT(700, big); ctx.textAlign = 'right'; ctx.fillText(num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
  const { top, bot } = traceRoom(W, H, y), L = x + Math.round(FS * 1.8), R = x + W - (narrow ? 2 : Math.round(FS * 4.2));
  if (bot - top < TRACE_MIN) {
    // (Too short for the tracing, a phone held sideways: its note alone, in the longest form that fits, so the box is never
    // blank under "Ready". Sweep batch 03, shot 03.)
    if (ph !== 'idle' && ph !== 'enter') return;
    ctx.font = FONT(500, FS);
    const say = blocked && t >= TB.probe0 ? NOTE_PROBE : ph === 'idle' ? NOTE_IDLE : NOTE_WAIT;
    const ty = Math.min(hh - 12, Math.max(y + 54, (y + 40 + hh) / 2));
    monitorNote(ctx, fitLine(ctx, say, W - 16), x + 8, x + W - 8, ty - 4);
    return;
  }
  const ymax = Math.max(15, Math.ceil((Math.max(v.whvp, v.fhvp) + 5) / 5) * 5);
  axTop = top; axBot = bot; axMax = ymax; axL = L; axR = R;   // (Y and X, above, read these)
  ctx.lineWidth = 1; ctx.font = FONT(500, FS); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let p = 0; p <= ymax; p += 5) {
    ctx.fillStyle = p ? C.grid : C.line; ctx.fillRect(L, Math.round(Y(p)), R - L, 1);   // (boxes, not stroked lines: see inkSeg)
    if (p % 10 === 0 || ymax <= 20) { ctx.fillStyle = C.text; ctx.fillText(tick(p), L - 5, Y(p)); }
  }
  if (ph === 'idle' || ph === 'enter') {
    // (Wrapped inside the grid, 8 px clear of the axis numbers and the monitor's right edge, on a solid patch of the monitor
    // so no gridline runs through it: at 320 px it ran past the edge over "20" and "10", on a Mac and an iPad the 15 line
    // struck through it, sweep 2 review items 14 and 15.)
    ctx.font = FONT(500, FS);
    monitorNote(ctx, blocked && t >= TB.probe0 ? NOTE_PROBE[0] : ph === 'idle' ? NOTE_IDLE[0] : NOTE_WAIT[0],
      L + 8, Math.min(R, x + W) - 8, (top + bot) / 2);
    return;
  }
  // The trace, swept up to now: blue while free, orchid once the balloon is up.
  const tNow = Math.min(t, T.back);
  seg(ctx, T.free - 300, T.inflate, C.free, tNow, v);
  seg(ctx, T.inflate, T.back, C.wedge, tNow, v);   // (the wedged trace solid, its hue kept: C4; it was dashed from cd2f92db to 10 Nov 2026, owner: solid)
  if (t < T.back) { ctx.fillStyle = C.bright; ctx.beginPath(); ctx.arc(X(tNow), Y(pAt(tNow, v)), 2.6, 0, Math.PI * 2); ctx.fill(); }
  // (Each level's name and number at the right, centred on its line; the two pairs kept 28 px apart so they never touch.)
  const both = ph === 'result', sep = both ? Math.max(0, 28 * HK - (Y(v.fhvp) - Y(v.whvp))) / 2 : 0;
  const yf = Math.min(Y(v.fhvp) + sep, hh - 12), yw = Math.min(Y(v.whvp) - sep, yf - 28 * HK);   // (the lower pair kept off the monitor's foot)
  if (t >= T.inflate) level(ctx, v.fhvp, C.free, 'FHVP', yf, narrow, R, L, cLvF);
  if (ph === 'result') {
    level(ctx, v.whvp, C.wedge, 'WHVP', yw, narrow, R, L, cLvW);
    const a = ease(k01(t, T.sum - 400, T.sum + 200)), xa = L + (R - L) * 0.9, y1 = Y(v.fhvp), y2 = Y(v.fhvp + (v.whvp - v.fhvp) * a), col2 = C[sevOf(v.hvpg)];
    ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1.6;
    ctx.fillRect(xa - 0.8, Math.min(y1, y2), 1.6, Math.abs(y2 - y1));
    if (Math.abs(y1 - y2) > 10) { arrowHead(ctx, xa, y1, 1); arrowHead(ctx, xa, y2, -1); }
    if (a > 0.6) {
      ctx.save(); ctx.globalAlpha = ease(k01(t, T.sum, T.sum + 450));
      if (!Object.is(cHT.v, v.hvpg)) { cHT.v = v.hvpg; cHT.s = `HVPG ${fmt(v.hvpg, 1)}`; }   // alloc-rare: only when the HVPG differs from the one this text was built from
      const txt = cHT.s; ctx.font = FONT(700, FS);
      const tw = ctx.measureText(txt).width + 12, lx = xa - tw - 6, ly = (y1 + y2) / 2;
      ctx.fillStyle = C.bg; rrect(ctx, lx, ly - FS * 0.75, tw, FS * 1.5, FS * 0.75); ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 6, ly + 0.5);
      ctx.restore();
    }
  }
  // (N6, trace callouts: a marker drops onto the trace where each reading is taken, the free as the free sweep ends, the wedge once the
  // plateau has held, which is when the figure's callout prints it. Both stand on the trace itself, so they move with it.)
  const tFree = T.inflate - 80;
  if (ph !== 'abort' && t >= tFree) {
    const yp = Y(pAt(tFree, v));
    drawCallout(ctx, calloutText(mkF, 'Free', v.fhvp), X(tFree), yp, sideFor(yp, 1, top, bot), C.free, C.bg, dropK(t - tFree), 1, L, R, top, bot, FS);
  }
  if (ph !== 'abort' && t >= T.callout) {
    const yp = Y(pAt(T.callout, v));
    drawCallout(ctx, calloutText(mkW, 'Wedge', v.whvp), X(T.callout), yp, sideFor(yp, -1, top, bot), C.wedge, C.bg, dropK(t - T.callout), 1, L, R, top, bot, FS);
  }
  ctx.fillStyle = C.text; ctx.font = FONT(500, FS); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('balloon up', X(T.inflate), bot + FS + 3);
  ctx.fillStyle = C.line; ctx.fillRect(X(T.inflate) - 0.5, bot, 1, 4);
}

// The trace from a to b (ms on the procedure's clock), swept as far as tNow. (Drawn with the axes traceOn set: Y, X.)
function seg(ctx, a, b, colr, tNow, v) {
  if (tNow <= a) return;
  // (Laid as small round boxes along the trace, not one stroked line: a stroke is drawn through the GPU's coverage target and the tracing came
  // up with no line on a phone while its dot, words and axes drew. A box draws wherever the dot does.)
  ctx.fillStyle = colr; ctx.beginPath();
  let px = 0, py = 0, have = false;
  const end = Math.min(b, tNow);
  for (let tt = a; tt <= end + 15; tt += 30) {
    const t2 = Math.min(tt, end), X1 = X(t2), Y1 = Y(pAt(t2, v));
    if (have) inkSeg(ctx, px, py, X1, Y1, 2); else inkSeg(ctx, X1, Y1, X1, Y1, 2);
    px = X1; py = Y1; have = true;
    if (t2 >= end) break;
  }
  ctx.fill();
}
// A level's solid line across the grid and, when there is room, its name and number at the right (c: the number's text cell).
function level(ctx, p, colr, txt, ly, narrow, R, L, c) {
  ctx.save(); ctx.fillStyle = colr; ctx.globalAlpha = 0.75;
  const dy = Math.round(Y(p));
  ctx.fillRect(L, dy, R - L, 1);   // (solid, as the trace is: owner, 10 Nov 2026; one box, drawn wherever the dot does: see seg)
  ctx.restore();
  if (!narrow) { ctx.fillStyle = colr; ctx.font = FONT(600, FS); ctx.textAlign = 'left'; ctx.fillText(txt, R + 6, ly - FS * 0.6); ctx.font = FONT(700, FS); ctx.fillText(fm1(c, p), R + 6, ly + FS * 0.6); }
}
// One end of the difference's bracket: a small arrowhead at yy, pointing d (1 down the page's way, -1 the other).
function arrowHead(ctx, xa, yy, d) {
  ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xa - 4, yy - 6 * d); ctx.lineTo(xa + 4, yy - 6 * d); ctx.closePath(); ctx.fill();
}

// What monitorNote keeps for each note it has drawn: its words wrapped for one width and font, so a frame measures once and wraps never.
const noteWrap = new Map();   // text → { maxW, probe, tw, lines }
const NOTE_BOX = { x: 0, y: 0, w: 0, h: 0, lines: null };
/** A note on the monitor, centred between x0 and x1 about cy, wrapped at word breaks to that width (the current font, 16 px
 *  lines), on a patch of the monitor's own background 8 px wider and 4 px taller than the words each side. Returns its box (a kept
 *  object, valid until the next note). The wrap is redone only when the width, or the width the font gives the whole text, changes. */
export function monitorNote(ctx, text, x0, x1, cy) {
  const pad = 8, padY = 4, lh = FS + 4, maxW = Math.max(40, x1 - x0 - 2 * pad);
  let e = noteWrap.get(text);
  if (!e) noteWrap.set(text, e = { maxW: -1, probe: -1, tw: 0, lines: [] });   // alloc-rare: only the first time this note's words are drawn
  const probe = ctx.measureText(text).width;
  if (e.maxW !== maxW || e.probe !== probe) {
    e.maxW = maxW; e.probe = probe;
    const measure = (q) => ctx.measureText(q).width;   // alloc-rare: only when the note's width or font changed (the wrap is kept in e)
    const lines = wrapWords(text, maxW, measure, e.lines);
    let widest = -Infinity;
    for (let i = 0; i < lines.length; i++) widest = Math.max(widest, measure(lines[i]));
    e.tw = Math.min(maxW, widest);
  }
  const lines = e.lines;
  const tw = e.tw;
  const bw = tw + 2 * pad, bh = lines.length * lh + 2 * padY, bx = (x0 + x1) / 2 - bw / 2, by = cy - bh / 2;
  ctx.fillStyle = C.bg; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], (x0 + x1) / 2, by + padY + lh * (i + 0.5));
  ctx.textBaseline = 'alphabetic';
  NOTE_BOX.x = bx; NOTE_BOX.y = by; NOTE_BOX.w = bw; NOTE_BOX.h = bh; NOTE_BOX.lines = lines;
  return NOTE_BOX;
}
/** Words into lines no wider than maxW (measure: a line's width); a single word longer than that keeps a line to itself.
 *  out: the list to fill (emptied first) and return; without one, a new list. */
export function wrapWords(text, maxW, measure, out = []) {   // alloc-rare: the default list only for a caller with none; monitorNote hands its own
  out.length = 0;
  let cur = '';
  // alloc-rare: wrapping runs only when monitorNote sees a new text, width or font (its wrap is kept)
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + word : word;   // alloc-rare: the same, a changed note
    if (cur && measure(next) > maxW) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function rrect(ctx, x, y, w, h2, r) {
  // (The same rounded outline as the arcs below, as one rounded box: the GPU draws it with a smooth edge.)
  if (ctx.onGPU === true && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h2, r); return; }
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
