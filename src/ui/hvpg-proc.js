// HVPG procedure (Measure › HVPG): a transjugular measurement, played on the anatomy. A balloon
// catheter comes in from the neck, down the SVC, through the right atrium and the IVC into the right
// hepatic vein (stage.js draws it on the real vessels). The view closes in on its tip: the open vein
// reads the free pressure (FHVP); the balloon inflates just behind the pressure-reading tip, flow
// stops, and the still column in front of it reads the sinusoids (WHVP). HVPG = WHVP − FHVP.
// This card keeps the catheter's pressure tracing, the three readings and the steps.
// The numbers are the model's own (metrics.fhvp, whvp, hvpg from engine.hvpgTrue), the same as the
// readout tile. In Explore the live HVPG readouts stay hidden until this has run for the patient
// (store.hvpgMeasured, hiddenNow); the tracing's small waves are illustrative.

import { h, fmt, fitCanvas, clamp, icon, cssVar } from './util.js?v=fea9cf1acd';
import { FONT } from './charts.js?v=1ac1f6452e';
import { pressureColor } from './colormap.js?v=b8a4088334';
import { store, logAction } from './store.js?v=3b659e1968';
import { T, ease, k01, balloonAt, timeOfBalloon, pressureAt as pAt } from './hvpg-clock.js?v=553551a92a';
import { frameFor, cancelFrame } from './frame.js?v=5efaa2bcc9';
import { traceRoom, TRACE_MIN } from './trace-room.js?v=b4c0aaa97f';
const nextFrame = frameFor('hvpg-proc');

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setHvpgStage(stage) { stageRef = stage; }

// A thrombosed hepatic vein (Budd–Chiari): the tip reaches the ostium, probes it a few times, then the
// procedure is aborted and the catheter withdrawn. No reading, so HVPG stays unmeasured.
const TB = { probe0: 4600, probe1: 8200, abort: 8200, back: 9600, end: 13000 };
const ABORT_MSG = 'Unable to cannulate hepatic vein — procedure aborted';
const STEPS = [
  ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC, through the right atrium and the IVC into the right hepatic vein.', 'Catheter'],
  ['free', 'Free pressure (FHVP)', 'The vein is open: the tip reads the pressure where the liver drains.', 'Free'],
  ['wedge', 'Wedged pressure (WHVP)', 'The balloon inflates just behind the tip and blocks the vein. Once the pressure settles, the still vein in front of it reads the sinusoids.', 'Wedged'],
  ['result', 'HVPG = WHVP − FHVP', 'The pressure drop across the sinusoids. Normal below 5 mmHg; 10 or more is clinically significant portal hypertension.', 'HVPG'],
];
// The tracing is a monitor, dark in both themes (the Over time chart's dark trace colours).
const C = Object.defineProperties({}, Object.fromEntries(Object.entries({ bg: '--mon-bg', grid: '--mon-grid', line: '--mon-line', text: '--mon-text', bright: '--mon-bright',
  free: '--mon-free', wedge: '--mon-wedge', ok: '--mon-ok', caution: '--mon-caution', danger: '--mon-alarm' }).map(([k, n]) => [k, { get: () => cssVar(n) }])));
const sevOf = (v) => (v >= 10 ? 'danger' : v >= 5 ? 'caution' : 'ok');
const sevWord = (v) => (v >= 10 ? 'Clinically significant portal hypertension (CSPH)' : v >= 5 ? 'Mild portal hypertension' : 'Normal');

export function createHvpgProcedure() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'HVPG measurement: catheter pressure tracing' });
  const box = h('div', { class: 'chart-box hvpg-box' }, cv);
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
  const bar = h('div', { class: 'hvpg-bar' }, startBtn, kv);
  const side = h('div', { class: 'chart-side' }, h('ol', { class: 'hvpg-steps' }, stepEls), caption, note);
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' }, bar, box, side);

  let t0 = null, t = 0, raf = 0, frame = null, result = null, sig = '', cam = '', blocked = false;
  const phase = () => (t0 == null && !result ? 'idle' : blocked ? (t < TB.abort ? 'enter' : 'abort') : t < T.free ? 'enter' : t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  // (The pane is fed frames only while it is on screen; the store always has the newest.)
  const now = () => store.get().frame || frame;
  // Live values while measuring, the captured ones once done.
  // Read once when the catheter starts, so FHVP, WHVP and their difference agree on screen throughout.
  let snap = null;
  const live = () => { const m = now()?.metrics; return { fhvp: m?.fhvp ?? 0, whvp: m?.whvp ?? 0, hvpg: m?.hvpg ?? 0 }; };
  const values = () => result || snap || live();

  function start() {
    if (t0 != null && t < tEnd()) return;
    const st = store.get();
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    result = null; t0 = performance.now(); t = 0; cam = ''; blocked = (st.params?.thrombus?.RHV_IVC || 0) >= 0.8; snap = now()?.metrics ? live() : null;
    loop();
  }
  function stopFigure() { stageRef?.setCatheter(null); if (cam && cam !== 'home') stageRef?.cathFocus('home'); cam = ''; }
  const tEnd = () => (blocked ? TB.end : T.end);
  function reset() { cancelFrame(raf); raf = 0; if (t0 != null && t < tEnd()) { stopFigure(); } t0 = null; t = 0; result = null; snap = null; sig = ''; blocked = false; paintSide(); draw(); }
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
    result = { ...(snap || { fhvp: m.fhvp, whvp: m.whvp, hvpg: m.hvpg }), t: f.t, day: f.day };
    store.set({ lastHVPG: result, hvpgMeasured: true });
  }

  // ── The figure: the catheter, its labels and the camera ──
  function figure() {
    const sg = stageRef;
    if (!sg) return;
    if (blocked) { figureBlocked(sg); return; }
    // The camera: the route while the catheter travels, the tip close up for the readings, then back.
    // (Each move waits until the anatomy is on screen: a switch from the circuit takes a moment.)
    const want = t < T.zoom ? 'route' : t < T.back ? 'tip' : 'home';
    if (want !== cam && (want !== 'route' || t > 250) && sg.cathFocus(want, want === 'tip' ? 1100 : 800)) cam = want;
    if (cam === 'route' && want === 'route') sg.cathFollow?.();
    const v = values(), ph = phase(), pulse = 0.5 + 0.5 * Math.sin(t / 170);
    const labels = [];
    // (A reading is the mean, as a monitor's number is: the trace wavers with the breath and the beat, the number holds.)
    if (ph === 'free') labels.push({ key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(v.fhvp, 1), unit: 'mmHg', cls: 'free' });
    if (ph === 'wedge') {
      labels.push({ key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(v.fhvp, 1), unit: 'mmHg', cls: 'free' });
      if (t >= T.callout) labels.push({ key: 'w', at: 'ahead', kicker: 'WHVP', text: fmt(v.whvp, 1), unit: 'mmHg', cls: 'wedge' });
    }
    // Both readings stay; a bracket joins them and gives the difference.
    if (ph === 'result' && t < T.back) {
      labels.push({ key: 's', at: 'sum',
        rows: [{ at: 'ahead', kicker: 'WHVP', text: fmt(v.whvp, 1), unit: 'mmHg', cls: 'wedge' }, { at: 'tip', kicker: 'FHVP', text: fmt(v.fhvp, 1), unit: 'mmHg', cls: 'free' }],
        calc: { kicker: 'HVPG', text: fmt(v.hvpg, 1), unit: 'mmHg', cls: 'result ' + sevOf(v.hvpg) } });
    }
    sg.setCatheter({
      u: ease(k01(t, T.travel0, T.travel1)),
      balloon: balloonAt(t) * (1 - k01(t, T.back, T.back + 500)),
      column: ease(k01(t, T.settle, T.settle + 1400)) * (1 - k01(t, T.back, T.back + 500)),
      columnColor: pressureColor(v.whvp),
      ring: ph === 'free' ? C.free : ph === 'wedge' && t > T.wedge ? C.wedge : null, pulse, clock: t,
      opacity: 1 - k01(t, T.back + 300, T.end),
      labels,
    });
  }

  function figureBlocked(sg) {
    const want = t < T.zoom ? 'route' : t < TB.back + 1500 ? 'tip' : 'home';
    if (want !== cam && (want !== 'route' || t > 250) && sg.cathFocus(want, want === 'tip' ? 1100 : 800)) cam = want;
    if (cam === 'route' && want === 'route') sg.cathFollow?.();
    // Three short pushes against the clot, each easing in and back out.
    const pk = k01(t, TB.probe0, TB.probe1), probe = t < TB.probe1 ? Math.pow(Math.sin(pk * 3 * Math.PI), 2) * 0.9 : 0;
    const labels = t >= TB.probe0 && t < TB.abort ? [{ key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' }]
      : t >= TB.abort && t < TB.end - 800 ? [{ key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'Aborted', unit: '', cls: 'result danger' }] : [];
    sg.setCatheter({
      ostium: true, probe,
      u: ease(k01(t, T.travel0, T.travel1)) * (1 - ease(k01(t, TB.back, TB.end - 500))),
      balloon: 0, column: 0, ring: t >= TB.abort ? C.danger : null, pulse: 0.5 + 0.5 * Math.sin(t / 170), clock: t,
      opacity: 1 - k01(t, TB.end - 900, TB.end), labels,
    });
  }

  function paintSide() {
    const ph = phase(), v = values(), st = store.get();
    const shown = { fhvp: ph !== 'idle' && ph !== 'enter' && ph !== 'abort', whvp: ph === 'result' || (ph === 'wedge' && t >= T.callout), hvpg: ph === 'result' && (t0 == null || t >= T.sum) };
    for (const k of ['fhvp', 'whvp', 'hvpg']) {
      const txt = shown[k] ? fmt(v[k], 1) : '—';
      if (vals[k].textContent !== txt) {
        vals[k].textContent = txt;
        // The difference arrives after the two readings have settled: it fades and rises in, never pops.
        if (k === 'hvpg' && shown.hvpg) { vals.hvpg.classList.remove('in'); void vals.hvpg.offsetWidth; vals.hvpg.classList.add('in'); }
      }
    }
    // This runs on every model frame: write only what changed. Rewriting the button's label each frame
    // replaced its text under the finger, and Safari then takes a tap for a hover and drops the click.
    const sev = shown.hvpg ? sevOf(v.hvpg) : '';
    if (vals.hvpg.dataset.sev !== sev) vals.hvpg.dataset.sev = sev;
    const cur = ph === 'abort' ? 1 : STEPS.findIndex((s) => s[0] === ph);
    stepEls.forEach((li, i) => { const v2 = ph === 'idle' ? '' : ph === 'abort' ? (i === 0 ? 'done' : '') : i < cur || ph === 'result' ? 'done' : i === cur ? 'now' : ''; if (li.dataset.state !== v2) li.dataset.state = v2; });
    const cap = ph === 'idle' ? 'A balloon catheter through the right internal jugular vein reads two pressures in the right hepatic vein: free, then wedged. Watch it on the anatomy.'
      : ph === 'abort' ? `${ABORT_MSG}. The hepatic vein is thrombosed (Budd–Chiari), so the catheter cannot enter it and no free or wedged pressure can be read. HVPG is not measurable.`
      : blocked && t >= TB.probe0 ? 'The tip is at the hepatic vein ostium, but the vein is thrombosed: it will not advance.'
      : ph === 'result' ? `${sevWord(v.hvpg)}. ${STEPS[3][2]}` : STEPS[cur][2];
    if (caption.textContent !== cap) caption.textContent = cap;
    const busy = t0 != null && t < tEnd();
    if (startBtn.disabled !== busy) startBtn.disabled = busy;
    const lbl = busy ? 'Measuring…' : result ? 'Measure again' : 'Measure HVPG';
    if (startBtn.lastChild.textContent !== lbl) startBtn.lastChild.textContent = lbl;
    const n = st.mode === 'explore' && !st.presenting
      ? (st.showHvpg ? 'The HVPG readouts are always shown (Settings).' : st.hvpgMeasured ? 'Measured: the HVPG readouts are live for this patient until a new one.' : 'The HVPG readouts stay hidden until it is measured here.')
      : 'The same numbers as the HVPG tile.';
    if (note.textContent !== n) note.textContent = n;
  }

  // ── The tracing ──────────────────────────────────
  const draw = () => drawTrace(cv, { ph: phase(), t, v: values(), blocked, running: t0 != null });

  function update(f) {
    frame = f;
    if (raf) return;   // the animation loop paints
    paintSide();
    const r = cv.getBoundingClientRect();
    const key = [Math.round(r.width), Math.round(r.height), phase(), result ? '' : fmt(f.metrics.fhvp, 1) + fmt(f.metrics.whvp, 1)].join('|');
    if (key !== sig) { sig = key; draw(); }
  }
  // A new patient (or a jump in time) starts with no measurement.
  store.on('hvpgMeasured', (v) => { if (!v && (result || t0 != null)) reset(); });
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
  const el = h('div', { class: 'pz-mon' }, h('div', { class: 'chart-box hvpg-box' }, cv));
  let mode = null, t = 0, t1 = 0, last = 0, raf = 0, fp = null, bal = 0;
  // The slide's own readings (the catheter's callouts and the tiles show the same), else the live model's.
  const live = () => { const m = fp || store.get().frame?.metrics; return { fhvp: m?.fhvp ?? 0, whvp: m?.whvp ?? 0, hvpg: m?.hvpg ?? 0 }; };
  const phase = () => (t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  const draw = () => drawTrace(cv, { ph: phase(), t, v: live(), blocked: false, running: true });
  // The balloon is the clock for the pressure's rise: the trace climbs exactly as far as the balloon is filled, so it
  // waits at the free level until the balloon starts to fill, holds its plateau once it is up, and comes back down
  // with it. Past the wedge (balloon up) the trace runs on its own clock again.
  const rising = () => mode !== 'free' && bal < 1 && t <= T.wedge;   // the balloon is still setting the trace
  const falling = () => mode === 'free' && bal > 0;                  // back from a wedge slide: held, then down with the balloon
  function step(now) {
    const dt = now - last; last = now;
    if (falling()) { if (bal < 1) t = Math.min(t, timeOfBalloon(bal)); }
    else if (mode === 'free' && t >= T.inflate) t = SPAN.free[0];   // the balloon is down: the free trace sweeps in afresh
    else if (rising()) t = bal > 0 ? timeOfBalloon(bal) : Math.min(t + dt, T.inflate);
    else t = Math.min(t1, t + dt);
    draw();
    raf = el.isConnected && (t < t1 || falling() || rising()) ? nextFrame(step) : 0;
  }
  const go = () => { cancelFrame(raf); raf = nextFrame((now) => { last = now; step(now); }); };
  function set(m, f = null, b = bal) {
    const span = SPAN[m];
    fp = f; bal = b;
    if (!span || (m === mode && (raf || t >= t1))) { if (!raf) draw(); return; }
    const fwd = mode && ORDER.indexOf(m) > ORDER.indexOf(mode);
    // (A free slide reached with the balloon still up keeps the trace as it is until the balloon is down.)
    if (!(m === 'free' && bal > 0) && !(fwd && t >= SPAN[mode][0] && t <= span[0])) t = span[0];
    // Already wedged (back from the result slide): the pressure is on its plateau, nothing climbs again.
    if (m !== 'free' && bal >= 1) t = Math.max(t, T.wedge);
    mode = m; t1 = span[1];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && !falling()) t = t1;
    // (Once the card is laid out: the canvas sizes itself to it.)
    go();
  }
  /** The catheter's balloon (0..1), every frame: the one value the pressure follows. */
  function balloon(b) {
    if (b === bal) return;
    bal = b;
    if (mode && !raf && el.isConnected) go();
  }
  // (A new size redraws it; the animation loop paints while it runs.)
  new ResizeObserver(() => { if (!raf && mode) draw(); }).observe(cv);
  return { el, set, balloon };
}

// ── The tracing: the monitor in the IR suite, dark in both themes ──
// st: { ph: the phase, t: ms on the procedure's clock (T), v: { fhvp, whvp, hvpg }, blocked, running: still sweeping }
function drawTrace(cv, { ph, t, v, blocked, running }) {
  const { ctx, w, h: hh } = fitCanvas(cv);
  if (w < 80 || hh < 60) return;
  ctx.clearRect(0, 0, w, hh);
  rrect(ctx, 0, 0, w, hh, 12); ctx.fillStyle = C.bg; ctx.fill();
  const x = 14, y = 10, W = w - 28, H = hh - 18;
  const narrow = W < 300;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // (Every word on the monitor at 12 px or more; the header takes the longest form that clears the big reading.)
  const { big } = traceRoom(W, H);
  ctx.font = FONT(700, big); const room = W - ctx.measureText('88.8').width - 12;
  ctx.fillStyle = C.text; ctx.font = FONT(600, 12);
  ctx.fillText(['CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg', 'CATHETER TIP PRESSURE · mmHg', 'CATHETER TIP · mmHg'].find((s, i, a) => i === a.length - 1 || ctx.measureText(s).width <= room), x, y + 13);
  let label, num = '', col = C.text;
  if (ph === 'abort') {
    ctx.font = FONT(600, 12); ctx.fillStyle = C.danger; ctx.fillText('Aborted', x, y + 32);
    ctx.textAlign = 'center'; ctx.font = FONT(600, 12); ctx.fillText(narrow ? 'Unable to cannulate hepatic vein' : 'Unable to cannulate hepatic vein: procedure aborted', w / 2, hh / 2 + 8);
    ctx.fillStyle = C.text; ctx.font = FONT(500, 12); ctx.fillText('HVPG not measurable', w / 2, hh / 2 + 28);
    return;
  }
  if (ph === 'idle') label = 'Ready';
  else if (ph === 'enter') label = 'Catheter advancing';
  // (The monitor's number is the mean, as the callout on the figure reads it; it follows the trace only while the balloon is still changing it.)
  else if (ph === 'free') { label = 'FHVP'; num = fmt(v.fhvp, 1); col = C.free; }
  else if (ph === 'wedge') { label = t < T.wedge ? 'Balloon inflating' : t < T.callout ? 'Settling' : 'WHVP'; num = fmt(t < T.callout ? pAt(t, v) : v.whvp, 1); col = C.wedge; }
  else if (running && t < T.sum) { label = 'WHVP'; num = fmt(v.whvp, 1); col = C.wedge; }
  else { label = 'HVPG'; num = fmt(v.hvpg, 1); col = C[sevOf(v.hvpg)]; }
  ctx.font = FONT(600, 12); ctx.fillStyle = col === C.text ? C.bright : col; ctx.fillText(label, x, y + 32);
  if (num) { ctx.font = FONT(700, big); ctx.textAlign = 'right'; ctx.fillText(num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
  const { top, bot } = traceRoom(W, H, y), L = x + 22, R = x + W - (narrow ? 2 : 50);
  if (bot - top < TRACE_MIN) return;
  const ymax = Math.max(15, Math.ceil((Math.max(v.whvp, v.fhvp) + 5) / 5) * 5);
  const Y = (p) => bot - (clamp(p, 0, ymax) / ymax) * (bot - top);
  const X = (tt) => L + k01(tt, T.free - 300, T.back) * (R - L);
  ctx.lineWidth = 1; ctx.font = FONT(500, 12); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let p = 0; p <= ymax; p += 5) {
    ctx.strokeStyle = p ? C.grid : C.line; ctx.beginPath(); ctx.moveTo(L, Math.round(Y(p)) + 0.5); ctx.lineTo(R, Math.round(Y(p)) + 0.5); ctx.stroke();
    if (p % 10 === 0 || ymax <= 20) ctx.fillText(String(p), L - 5, Y(p));
  }
  if (ph === 'idle' || ph === 'enter') {
    ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = FONT(500, 12);
    ctx.fillText(blocked && t >= TB.probe0 ? 'Probing the ostium: the vein will not take the catheter…' : ph === 'idle' ? 'The tracing starts once the tip is in the hepatic vein.' : 'Waiting for the hepatic vein…', (L + R) / 2, (top + bot) / 2);
    return;
  }
  // The trace, swept up to now: blue while free, orchid once the balloon is up.
  const tNow = Math.min(t, T.back);
  const seg = (a, b, colr) => {
    if (tNow <= a) return;
    ctx.strokeStyle = colr; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let tt = a; tt <= Math.min(b, tNow); tt += 30) { const X1 = X(tt), Y1 = Y(pAt(tt, v)); tt === a ? ctx.moveTo(X1, Y1) : ctx.lineTo(X1, Y1); }
    ctx.stroke();
  };
  seg(T.free - 300, T.inflate, C.free);
  seg(T.inflate, T.back, C.wedge);
  if (t < T.back) { ctx.fillStyle = C.bright; ctx.beginPath(); ctx.arc(X(tNow), Y(pAt(tNow, v)), 2.6, 0, Math.PI * 2); ctx.fill(); }
  // (Each level's name and number at the right, centred on its line; the two pairs kept 28 px apart so they never touch.)
  const both = ph === 'result', sep = both ? Math.max(0, 28 - (Y(v.fhvp) - Y(v.whvp))) / 2 : 0;
  const yf = Math.min(Y(v.fhvp) + sep, hh - 12), yw = Math.min(Y(v.whvp) - sep, yf - 28);   // (the lower pair kept off the monitor's foot)
  const level = (p, colr, txt, ly) => {
    ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha = 0.75; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(R, Y(p)); ctx.stroke(); ctx.restore();
    if (!narrow) { ctx.fillStyle = colr; ctx.font = FONT(600, 12); ctx.textAlign = 'left'; ctx.fillText(txt, R + 6, ly - 7); ctx.font = FONT(700, 12); ctx.fillText(fmt(p, 1), R + 6, ly + 7); }
  };
  if (t >= T.inflate) level(v.fhvp, C.free, 'FHVP', yf);
  if (ph === 'result') {
    level(v.whvp, C.wedge, 'WHVP', yw);
    const a = ease(k01(t, T.sum - 400, T.sum + 200)), xa = L + (R - L) * 0.9, y1 = Y(v.fhvp), y2 = Y(v.fhvp + (v.whvp - v.fhvp) * a), col2 = C[sevOf(v.hvpg)];
    ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(xa, y1); ctx.lineTo(xa, y2); ctx.stroke();
    if (Math.abs(y1 - y2) > 10) for (const [yy, d] of [[y1, 1], [y2, -1]]) { ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xa - 4, yy - 6 * d); ctx.lineTo(xa + 4, yy - 6 * d); ctx.closePath(); ctx.fill(); }
    if (a > 0.6) {
      ctx.save(); ctx.globalAlpha = ease(k01(t, T.sum, T.sum + 450));
      const txt = `HVPG ${fmt(v.hvpg, 1)}`; ctx.font = FONT(700, 12);
      const tw = ctx.measureText(txt).width + 12, lx = xa - tw - 6, ly = (y1 + y2) / 2;
      ctx.fillStyle = C.bg; rrect(ctx, lx, ly - 9, tw, 18, 9); ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 6, ly + 0.5);
      ctx.restore();
    }
  }
  ctx.fillStyle = C.text; ctx.font = FONT(500, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('balloon up', X(T.inflate), bot + 15);
  ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(X(T.inflate), bot); ctx.lineTo(X(T.inflate), bot + 4); ctx.stroke();
}

function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
