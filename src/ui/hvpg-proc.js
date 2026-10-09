// HVPG procedure (Measure › HVPG): a transjugular measurement, played on the anatomy. A balloon
// catheter comes in from the neck, down the SVC, through the right atrium and the IVC into the right
// hepatic vein (stage.js draws it on the real vessels). The view closes in on its tip: the open vein
// reads the free pressure (FHVP); the balloon inflates just behind the pressure-reading tip, flow
// stops, and the still column in front of it reads the sinusoids (WHVP). HVPG = WHVP − FHVP.
// This card keeps the catheter's pressure tracing, the three readings and the steps.
// The numbers are the model's own (metrics.fhvp, whvp, hvpg from engine.hvpgTrue), the same as the
// readout tile. In Explore the live HVPG readouts stay hidden until this has run for the patient
// (store.hvpgMeasured, hiddenNow); the tracing's small waves are illustrative.

import { h, fmt, fitCanvas, clamp, icon, toast } from './util.js?v=e803df99cd';
import { FONT } from './charts.js?v=8004a4ab4c';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { store } from './store.js?v=1d7cd9b00f';

let stageRef = null;
/** main.js hands over the figure once it exists. */
export function setHvpgStage(stage) { stageRef = stage; }

// The sequence, in ms from the start.
const T = { travel0: 300, travel1: 4300, zoom: 4300, free: 5100, inflate: 8200, wedge: 8900, result: 11800, back: 16000, end: 16800 };
const STEPS = [
  ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC, through the right atrium and the IVC into the right hepatic vein.', 'Catheter'],
  ['free', 'Free pressure (FHVP)', 'The vein is open: the tip reads the pressure where the liver drains.', 'Free'],
  ['wedge', 'Wedged pressure (WHVP)', 'The balloon inflates just behind the tip and blocks the vein. Flow stops, and the still vein in front of it reads the sinusoids.', 'Wedged'],
  ['result', 'HVPG = WHVP − FHVP', 'The pressure drop across the sinusoids. Normal below 5 mmHg; 10 or more is clinically significant portal hypertension.', 'HVPG'],
];
// The tracing is a monitor, dark in both themes (the Over time chart's dark trace colours).
const C = { bg: '#07090C', grid: '#1C2128', line: '#2A3038', text: '#9AA4B2', bright: '#E8EDF4',
  free: '#5CA4F2', wedge: '#A68CF2', ok: '#4FD18B', caution: '#F2B84B', danger: '#FF7A85' };
const sevOf = (v) => (v >= 10 ? 'danger' : v >= 5 ? 'caution' : 'ok');
const sevWord = (v) => (v >= 10 ? 'Clinically significant' : v >= 5 ? 'Subclinical' : 'Normal');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const k01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

/** The catheter pressure at time tt: the free level with small cardiac and breathing waves, then an exponential climb
 *  to the wedged level once the balloon is up, the waves damped by the still column. */
function pAt(tt, v) {
  const wave = Math.sin(tt / 850 * 2 * Math.PI) * 0.55 + Math.sin(tt / 850 * 4 * Math.PI + 1) * 0.25 + Math.sin(tt / 3600 * 2 * Math.PI) * 0.45;
  if (tt < T.inflate) return v.fhvp + wave;
  const k = 1 - Math.exp(-(tt - T.inflate) / 650);
  return v.fhvp + (v.whvp - v.fhvp) * k + wave * (0.15 + 0.85 * Math.exp(-(tt - T.inflate) / 500));
}

export function createHvpgProcedure({ sheet } = {}) {
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
  const startBtn = h('button', { class: 'btn primary', onclick: () => start() }, icon('catheter'), h('span', {}, 'Measure HVPG'));
  const note = h('p', { class: 'ctl-sub hvpg-note' });
  const bar = h('div', { class: 'hvpg-bar' }, startBtn, kv);
  const side = h('div', { class: 'chart-side' }, h('ol', { class: 'hvpg-steps' }, stepEls), caption, note);
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' }, bar, box, side);

  let t0 = null, t = 0, raf = 0, frame = null, result = null, sig = '', cam = '';
  const phase = () => (t0 == null && !result ? 'idle' : t < T.free ? 'enter' : t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  // (The pane is fed frames only while it is on screen; the store always has the newest.)
  const now = () => store.get().frame || frame;
  // Live values while measuring, the captured ones once done.
  const values = () => { const m = now()?.metrics; return result || { fhvp: m?.fhvp ?? 0, whvp: m?.whvp ?? 0, hvpg: m?.hvpg ?? 0 }; };

  function start() {
    if (t0 != null && t < T.end) return;
    if (store.get().blind) { toast('Answer the question first.'); return; }
    const st = store.get();
    if (st.lobule) store.set({ lobule: false });
    if (st.view !== 'anatomic') store.set({ view: 'anatomic' });
    result = null; t0 = performance.now(); t = 0; cam = '';
    sheet?.(true);
    loop();
  }
  function stopFigure() { stageRef?.setCatheter(null); if (cam && cam !== 'home') stageRef?.cathFocus('home'); cam = ''; }
  function reset() { cancelAnimationFrame(raf); raf = 0; if (t0 != null && t < T.end) { stopFigure(); sheet?.(false); } t0 = null; t = 0; result = null; sig = ''; paintSide(); draw(); }
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      t = performance.now() - t0;
      if (!result && t >= T.result) finish();
      figure();
      paintSide(); draw();
      if (t < T.end) raf = requestAnimationFrame(step);
      else { raf = 0; stageRef?.setCatheter(null); }
    };
    step();
  }
  function finish() {
    const f = now(), m = f?.metrics;
    if (!m) return;
    result = { fhvp: m.fhvp, whvp: m.whvp, hvpg: m.hvpg, t: f.t, day: f.day };
    store.set({ lastHVPG: result, hvpgMeasured: true });
  }

  // ── The figure: the catheter, its labels and the camera ──
  function figure() {
    const sg = stageRef;
    if (!sg) return;
    // The camera: the route while the catheter travels, the tip close up for the readings, then back.
    // (Each move waits until the anatomy is on screen: a switch from the circuit takes a moment.)
    const want = t < T.zoom ? 'route' : t < T.back ? 'tip' : 'home';
    if (want !== cam && (want !== 'route' || t > 250) && sg.cathFocus(want, want === 'tip' ? 1100 : 800)) cam = want;
    if (want === 'home' && t > T.back + 200) sheet?.(false);
    const v = values(), ph = phase(), pulse = 0.5 + 0.5 * Math.sin(t / 170);
    const labels = [];
    if (ph === 'free') labels.push({ key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(pAt(t, v), 1), unit: 'mmHg', cls: 'free' });
    if (ph === 'wedge') {
      labels.push({ key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(v.fhvp, 1), unit: 'mmHg', cls: 'free ghost' });
      if (t > T.inflate + 300) labels.push({ key: 'w', at: 'ahead', kicker: 'WHVP', text: fmt(pAt(t, v), 1), unit: 'mmHg', cls: 'wedge' });
    }
    if (ph === 'result' && t < T.back) {
      labels.push({ key: 'r', at: 'tip', kicker: `HVPG = ${fmt(v.whvp, 1)} − ${fmt(v.fhvp, 1)}`, text: fmt(v.hvpg, 1), unit: 'mmHg', cls: 'result ' + sevOf(v.hvpg) });
      labels.push({ key: 'w', at: 'ahead', kicker: 'WHVP', text: fmt(v.whvp, 1), unit: 'mmHg', cls: 'wedge' });
    }
    sg.setCatheter({
      u: ease(k01(t, T.travel0, T.travel1)),
      balloon: ease(k01(t, T.inflate, T.wedge)) * (1 - k01(t, T.back, T.back + 500)),
      column: ease(k01(t, T.wedge - 300, T.wedge + 1700)) * (1 - k01(t, T.back, T.back + 500)),
      columnColor: pressureColor(v.whvp),
      ring: ph === 'free' ? C.free : ph === 'wedge' && t > T.wedge ? C.wedge : null, pulse, clock: t,
      opacity: 1 - k01(t, T.back + 300, T.end),
      labels,
    });
  }

  function paintSide() {
    const ph = phase(), v = values(), st = store.get();
    const shown = { fhvp: ph !== 'idle' && ph !== 'enter', whvp: ph === 'result' || (ph === 'wedge' && t >= T.wedge), hvpg: ph === 'result' };
    for (const k of ['fhvp', 'whvp', 'hvpg']) {
      const txt = shown[k] ? fmt(v[k], 1) : '—';
      if (vals[k].textContent !== txt) vals[k].textContent = txt;
    }
    vals.hvpg.dataset.sev = shown.hvpg ? sevOf(v.hvpg) : '';
    const cur = STEPS.findIndex((s) => s[0] === ph);
    stepEls.forEach((li, i) => { li.dataset.state = ph === 'idle' ? '' : i < cur || ph === 'result' ? 'done' : i === cur ? 'now' : ''; });
    const cap = ph === 'idle' ? 'A balloon catheter through the right internal jugular vein reads two pressures in the right hepatic vein: free, then wedged. Watch it on the anatomy.'
      : ph === 'result' ? `${sevWord(v.hvpg)}. ${STEPS[3][2]}` : STEPS[cur][2];
    if (caption.textContent !== cap) caption.textContent = cap;
    const busy = t0 != null && t < T.end;
    startBtn.disabled = busy;
    startBtn.lastChild.textContent = busy ? 'Measuring…' : result ? 'Measure again' : 'Measure HVPG';
    const n = st.mode === 'explore' && !st.presenting
      ? (st.hvpgMeasured ? 'Measured: the HVPG readouts are live for this patient until a new one.' : 'The HVPG readouts stay hidden until it is measured here.')
      : 'The same numbers as the HVPG tile.';
    if (note.textContent !== n) note.textContent = n;
  }

  // ── The tracing ──────────────────────────────────
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 80 || hh < 60) return;
    ctx.clearRect(0, 0, w, hh);
    rrect(ctx, 0, 0, w, hh, 12); ctx.fillStyle = C.bg; ctx.fill();
    const x = 14, y = 10, W = w - 28, H = hh - 18;
    const ph = phase(), v = values(), narrow = W < 300;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = C.text; ctx.font = FONT(600, 10);
    ctx.fillText(narrow ? 'CATHETER TIP · mmHg' : 'CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg', x, y + 13);
    const big = Math.round(clamp(Math.min(W * 0.1, H * 0.14), 22, 40));
    let label, num = '', col = C.text;
    if (ph === 'idle') label = 'Ready';
    else if (ph === 'enter') label = 'Catheter advancing';
    else if (ph === 'free') { label = 'FHVP'; num = fmt(pAt(t, v), 1); col = C.free; }
    else if (ph === 'wedge') { label = t < T.wedge ? 'Balloon inflating' : 'WHVP'; num = fmt(pAt(t, v), 1); col = C.wedge; }
    else { label = 'HVPG'; num = fmt(v.hvpg, 1); col = C[sevOf(v.hvpg)]; }
    ctx.font = FONT(600, 12); ctx.fillStyle = col === C.text ? C.bright : col; ctx.fillText(label, x, y + 32);
    if (num) { ctx.font = FONT(700, big); ctx.textAlign = 'right'; ctx.fillText(num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
    const top = y + 30 + Math.max(big, 26) - 4, bot = y + H - 16, L = x + 22, R = x + W - (narrow ? 2 : 50);
    if (bot - top < 40) return;
    const ymax = Math.max(15, Math.ceil((Math.max(v.whvp, v.fhvp) + 5) / 5) * 5);
    const Y = (p) => bot - (clamp(p, 0, ymax) / ymax) * (bot - top);
    const X = (tt) => L + k01(tt, T.free - 300, T.back) * (R - L);
    ctx.lineWidth = 1; ctx.font = FONT(500, 9.5); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let p = 0; p <= ymax; p += 5) {
      ctx.strokeStyle = p ? C.grid : C.line; ctx.beginPath(); ctx.moveTo(L, Math.round(Y(p)) + 0.5); ctx.lineTo(R, Math.round(Y(p)) + 0.5); ctx.stroke();
      if (p % 10 === 0 || ymax <= 20) ctx.fillText(String(p), L - 5, Y(p));
    }
    if (ph === 'idle' || ph === 'enter') {
      ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = FONT(500, 11);
      ctx.fillText(ph === 'idle' ? 'The tracing starts once the tip is in the hepatic vein.' : 'Waiting for the hepatic vein…', (L + R) / 2, (top + bot) / 2);
      return;
    }
    // The trace, swept up to now: blue while free, violet once the balloon is up.
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
    const level = (p, colr, txt) => {
      ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha = 0.75; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(R, Y(p)); ctx.stroke(); ctx.restore();
      if (!narrow) { ctx.fillStyle = colr; ctx.font = FONT(600, 10); ctx.textAlign = 'left'; ctx.fillText(txt, R + 6, Y(p) - 6); ctx.font = FONT(700, 11); ctx.fillText(fmt(p, 1), R + 6, Y(p) + 7); }
    };
    if (t >= T.inflate) level(v.fhvp, C.free, 'FHVP');
    if (ph === 'result') {
      level(v.whvp, C.wedge, 'WHVP');
      const a = ease(k01(t, T.result, T.result + 500)), xa = L + (R - L) * 0.9, y1 = Y(v.fhvp), y2 = Y(v.fhvp + (v.whvp - v.fhvp) * a), col2 = C[sevOf(v.hvpg)];
      ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xa, y1); ctx.lineTo(xa, y2); ctx.stroke();
      if (Math.abs(y1 - y2) > 10) for (const [yy, d] of [[y1, 1], [y2, -1]]) { ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xa - 4, yy - 6 * d); ctx.lineTo(xa + 4, yy - 6 * d); ctx.closePath(); ctx.fill(); }
      if (a > 0.6) {
        const txt = `HVPG ${fmt(v.hvpg, 1)}`; ctx.font = FONT(700, 11.5);
        const tw = ctx.measureText(txt).width + 12, lx = xa - tw - 6, ly = (y1 + y2) / 2;
        ctx.fillStyle = C.bg; rrect(ctx, lx, ly - 9, tw, 18, 9); ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = col2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 6, ly + 0.5);
      }
    }
    ctx.fillStyle = C.text; ctx.font = FONT(500, 9); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('balloon up', X(T.inflate), bot + 13);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(X(T.inflate), bot); ctx.lineTo(X(T.inflate), bot + 4); ctx.stroke();
  }

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

function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
