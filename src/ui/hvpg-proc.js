// HVPG procedure (Measure › HVPG): a transjugular measurement, animated as one clean sequence on a
// cath-lab monitor. A balloon catheter enters the right internal jugular vein, passes the right atrium
// and the IVC into the right hepatic vein and reads the free pressure (FHVP); a puff of contrast washes
// out toward the heart. The balloon inflates, flow stops, contrast stains the wedge of liver behind it,
// and the still column reads the sinusoids (WHVP). HVPG = WHVP − FHVP.
// The numbers are the model's own (metrics.fhvp, whvp, hvpg from engine.hvpgTrue), the same as the
// readout tile. In Explore the live HVPG readouts stay hidden until this has run for the patient
// (store.hvpgMeasured, hiddenNow); the anatomy and the tracing's wiggle are illustrative.

import { h, fmt, fitCanvas, clamp, icon, toast } from './util.js?v=86153645a3';
import { FONT } from './charts.js?v=eb7ff82b4c';
import { store } from './store.js?v=1d7cd9b00f';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// The sequence, in ms from the start.
const T = { free: 3300, inflate: 6400, wedge: 7000, result: 10000, end: 11000 };
const STEPS = [
  ['enter', 'Catheter in', 'Through the right internal jugular vein, the right atrium and the IVC into the right hepatic vein.'],
  ['free', 'Free pressure (FHVP)', 'The vein is open: the catheter reads the pressure where the liver drains. Contrast washes away toward the heart.'],
  ['wedge', 'Wedged pressure (WHVP)', 'The balloon blocks the vein. Flow stops, contrast stains the wedge of liver behind it, and the still column reads the sinusoids.'],
  ['result', 'HVPG = WHVP − FHVP', 'The pressure drop across the sinusoids. Normal below 5 mmHg; 10 or more is clinically significant portal hypertension.'],
];
// The monitor is dark in both themes; its colours are fixed (the Over time chart's dark trace colours).
const C = { bg: '#07090C', fluo: '#0B0E13', grid: '#1C2128', line: '#2A3038', text: '#9AA4B2', bright: '#E8EDF4',
  free: '#5CA4F2', wedge: '#A68CF2', ok: '#4FD18B', caution: '#F2B84B', danger: '#FF7A85' };
const sevCol = (v) => (v >= 10 ? C.danger : v >= 5 ? C.caution : C.ok);
const sevWord = (v) => (v >= 10 ? 'Clinically significant' : v >= 5 ? 'Subclinical' : 'Normal');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const k01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// Anatomy in a 100 × 130 design box, frontal view (the patient's right on the left).
// The catheter's route: neck → SVC → RA → IVC → hepatic vein confluence → right hepatic vein.
const ROUTE = smooth([[31, -4], [33, 10], [36, 24], [38.5, 36], [39.5, 46], [40, 54], [40.5, 62], [40.5, 68], [37, 71.5], [31.5, 75], [26, 79]]);
const RHV_DISTAL = smooth([[26, 79], [21, 83.5], [16.5, 89], [13, 95]]);
const VESSELS = [
  { pts: smooth([[31, -4], [33, 10], [36, 24], [38.5, 36]]), w: 4.2 },               // right internal jugular
  { pts: smooth([[38.5, 36], [39.5, 46], [40, 52]]), w: 5.4 },                         // SVC
  { pts: smooth([[40, 56], [40.5, 64], [41, 72], [41.5, 90], [42.5, 130]]), w: 6.2 },  // IVC
  { pts: smooth([[40.5, 68], [37, 71.5], [31.5, 75], [26, 79], [21, 83.5], [16.5, 89], [13, 95], [10.5, 101]]), w: 3.6, taper: 1.2 },   // right hepatic vein
  { pts: smooth([[41.5, 68.5], [44, 75], [47, 83], [49, 92]]), w: 3, taper: 1 },       // middle
  { pts: smooth([[42.5, 67.5], [49, 70], [56, 73], [63, 77]]), w: 2.8, taper: 1 },     // left
];
const RHV_TWIGS = [[[21, 83.5], [15, 81], [10, 80.5]], [[16.5, 89], [21, 95], [23, 101]], [[13, 95], [8, 97], [5, 101]], [[19, 86], [24, 90]]].map(smooth);

/** A Catmull-Rom pass through the points: a smooth polyline with the same ends. */
function smooth(p, n = 6) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(p[p.length - 1]);
  return out;
}
const lenOf = (pts) => pts.reduce((n, q, i) => n + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
/** The part of a polyline between length fractions a and b. */
function cut(pts, a, b) {
  const L = lenOf(pts), A = a * L, B = b * L, out = [];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], s = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const at = (d) => { const u = s ? (d - run) / s : 0; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]; };
    if (run + s >= A && run <= B) {
      if (!out.length) out.push(at(Math.max(A, run)));
      out.push(run + s <= B ? q : at(B));
    }
    run += s;
  }
  return out;
}

export function createHvpgProcedure() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'HVPG measurement: catheter and pressure tracing' });
  const box = h('div', { class: 'chart-box hvpg-box' }, cv);
  const vals = {};
  const kv = h('dl', { class: 'kv hvpg-kv' }, ['fhvp', 'whvp', 'hvpg'].flatMap((k) => {
    vals[k] = h('dd', {}, '—');
    return [h('dt', {}, { fhvp: 'Free (FHVP)', whvp: 'Wedged (WHVP)', hvpg: 'HVPG' }[k]), vals[k]];
  }));
  const stepEls = STEPS.map(([id, title]) => h('li', { 'data-step': id }, title));
  const caption = h('p', { class: 'ctl-sub hvpg-caption', 'aria-live': 'polite' });
  const startBtn = h('button', { class: 'btn primary', onclick: () => start() }, icon('catheter'), h('span', {}, 'Measure HVPG'));
  const note = h('p', { class: 'ctl-sub' });
  const side = h('div', { class: 'chart-side' }, kv, h('ol', { class: 'hvpg-steps' }, stepEls), caption, startBtn, note);
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' }, box, side);

  let t0 = null, t = 0, raf = 0, frame = null, result = null, sig = '';
  const phase = () => (t0 == null && !result ? 'idle' : t < T.free ? 'enter' : t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result');
  // Live values while measuring, the captured ones once done.
  // (The pane is fed frames only while it is on screen; the store always has the newest.)
  const now = () => store.get().frame || frame;
  const values = () => { const m = now()?.metrics; return result || { fhvp: m?.fhvp ?? 0, whvp: m?.whvp ?? 0, hvpg: m?.hvpg ?? 0 }; };

  function start() {
    if (t0 != null && !result) return;
    if (store.get().blind) { toast('Answer the question first.'); return; }
    result = null; t0 = performance.now(); t = REDUCED ? T.end : 0;
    loop();
  }
  function reset() { cancelAnimationFrame(raf); raf = 0; t0 = null; t = 0; result = null; sig = ''; paintSide(); draw(); }
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      t = REDUCED ? T.end : performance.now() - t0;
      if (!result && t >= T.result) finish();
      paintSide(); draw();
      raf = t < T.end ? requestAnimationFrame(step) : 0;
    };
    step();
  }
  function finish() {
    const f = now(), m = f?.metrics;
    if (!m) return;
    result = { fhvp: m.fhvp, whvp: m.whvp, hvpg: m.hvpg, t: f.t, day: f.day };
    store.set({ lastHVPG: result, hvpgMeasured: true });
  }

  function paintSide() {
    const ph = phase(), v = values(), st = store.get();
    const shown = { fhvp: ph !== 'idle' && ph !== 'enter', whvp: ph === 'result' || (ph === 'wedge' && t >= T.wedge), hvpg: ph === 'result' };
    for (const k of ['fhvp', 'whvp', 'hvpg']) {
      const txt = shown[k] ? `${fmt(v[k], 1)} mmHg` : '—';
      if (vals[k].textContent !== txt) vals[k].textContent = txt;
    }
    vals.hvpg.dataset.sev = shown.hvpg ? (v.hvpg >= 10 ? 'danger' : v.hvpg >= 5 ? 'caution' : 'ok') : '';
    const cur = STEPS.findIndex((s) => s[0] === ph);
    stepEls.forEach((li, i) => { li.dataset.state = ph === 'idle' ? '' : i < cur || ph === 'result' ? 'done' : i === cur ? 'now' : ''; });
    const cap = ph === 'idle' ? 'A balloon catheter through the right internal jugular vein reads two pressures in a hepatic vein: free, then wedged.'
      : ph === 'result' ? `${sevWord(v.hvpg)}. ${STEPS[3][2]}` : STEPS[cur][2];
    if (caption.textContent !== cap) caption.textContent = cap;
    const busy = ph !== 'idle' && ph !== 'result';
    startBtn.disabled = busy;
    startBtn.lastChild.textContent = busy ? 'Measuring…' : result ? 'Measure again' : 'Measure HVPG';
    const n = st.mode === 'explore' && !st.presenting
      ? (st.hvpgMeasured ? 'Measured: the HVPG readouts are live for this patient. A new patient hides them until it is measured again.' : 'The HVPG readouts stay hidden until it is measured here. The numbers are the model\'s own, the same as the HVPG tile.')
      : 'The numbers are the model\'s own, the same as the HVPG tile.';
    if (note.textContent !== n) note.textContent = n;
  }

  // ── Drawing ──────────────────────────────────────
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 60 || hh < 60) return;
    ctx.clearRect(0, 0, w, hh);
    rrect(ctx, 0, 0, w, hh, 12); ctx.fillStyle = C.bg; ctx.fill();
    const pad = 8, fw = Math.round(clamp(Math.min(w * 0.44, (hh - 2 * pad) * 0.8), 110, 340));
    fluoro(ctx, pad, pad, fw, hh - 2 * pad);
    tracing(ctx, pad + fw + 10, pad, w - fw - 2 * pad - 10, hh - 2 * pad);
  }

  function fluoro(ctx, x, y, w, hh) {
    ctx.save();
    rrect(ctx, x, y, w, hh, 9); ctx.clip();
    const g = ctx.createRadialGradient(x + w * 0.45, y + hh * 0.5, 4, x + w * 0.45, y + hh * 0.5, Math.max(w, hh) * 0.75);
    g.addColorStop(0, '#20252D'); g.addColorStop(0.65, '#12161C'); g.addColorStop(1, C.fluo);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
    const s = Math.min(w / 86, hh / 118), ox = x + w / 2 - 44 * s, oy = y + hh / 2 - 62 * s;
    const P = ([u, v]) => [ox + u * s, oy + v * s];
    const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); };
    const white = (a) => `rgba(232,237,244,${a})`;
    // Bone and soft tissue, faint: spine, ribs, heart, liver under the right dome of the diaphragm.
    ctx.fillStyle = white(0.07);
    for (let v = 6; v < 130; v += 8.6) { const [a, b] = P([45.5, v]); ctx.beginPath(); ctx.roundRect(a, b, 11 * s, 6.6 * s, 1.6 * s); ctx.fill(); }
    ctx.strokeStyle = white(0.045); ctx.lineWidth = 1.5 * s;
    for (let i = 0; i < 5; i++) for (const sgn of [-1, 1]) {
      const y0 = 26 + i * 9.5; path(smooth([[51 + sgn * 6, y0], [51 + sgn * 22, y0 + 1.5], [51 + sgn * 36, y0 + 8], [51 + sgn * 40, y0 + 17]])); ctx.stroke();
    }
    blob(ctx, P([57, 51]), 24 * s, 17 * s, white(0.15));
    const lv = ctx.createLinearGradient(0, P([0, 58])[1], 0, P([0, 112])[1]);
    lv.addColorStop(0, white(0.1)); lv.addColorStop(1, white(0.03));
    ctx.fillStyle = lv;
    path(smooth([[3, 72], [12, 61.5], [26, 58], [40, 60.5], [58, 63], [76, 68], [84, 75], [72, 86], [52, 99], [30, 110], [12, 108], [3, 96], [3, 72]]));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = white(0.13); ctx.lineWidth = 1.2 * s;
    path(smooth([[4, 70], [12, 61.5], [26, 58], [40, 60.5], [58, 63], [76, 68]])); ctx.stroke();
    // The venous roadmap, faint.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const v of VESSELS) vessel(ctx, v.pts, v.w * s, v.taper ? v.taper * s : v.w * s, white(0.13), P);
    for (const tw of RHV_TWIGS) vessel(ctx, tw, 1.4 * s, 0.6 * s, white(0.1), P);

    const ph = phase();
    const route = ph === 'idle' ? 0 : ease(k01(t, 0, T.free - 300));
    // Contrast while free: a puff from the tip washes back to the IVC and up into the atrium.
    if (t > T.free + 500 && t < T.free + 2600) {
      const u = k01(t, T.free + 500, T.free + 2300), back = ROUTE.slice().reverse();
      const head = clamp(u * 1.25, 0, 0.62), tail = clamp(u * 1.25 - 0.3, 0, 0.62), a = 0.75 * (1 - k01(t, T.free + 1700, T.free + 2600));
      if (head > tail) { ctx.strokeStyle = white(a); ctx.lineWidth = 3.4 * s; path(cut(back, tail, head)); ctx.stroke(); }
    }
    // Wedged: contrast fills the occluded vein and blushes the wedge of liver behind it.
    if (ph === 'wedge' || ph === 'result') {
      const a = ease(k01(t, T.wedge + 200, T.wedge + 1900));
      // The sinusoidal blush: soft clouds around the filled branches, densest at the periphery.
      for (const [q, r, k] of [[[19, 85], 8, 0.5], [[14, 92], 10, 0.8], [[9, 99], 11, 1], [[11, 82], 8, 0.8], [[22, 98], 8, 0.8], [[5, 102], 7, 0.9]]) {
        const [cx, cy] = P(q), gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * s);
        gr.addColorStop(0, white(0.2 * k * a)); gr.addColorStop(1, white(0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r * s, 0, Math.PI * 2); ctx.fill();
      }
      vessel(ctx, cut(RHV_DISTAL, 0, a), 2.8 * s, 1.6 * s, white(0.85), P);
      for (const tw of RHV_TWIGS) vessel(ctx, cut(tw, 0, clamp(a * 1.4 - 0.4, 0, 1)), 1.4 * s, 0.6 * s, white(0.6), P);
    }
    // The catheter: a fine radiopaque line and its tip marker.
    if (route > 0) {
      const pts = cut(ROUTE, 0, route), tip = pts[pts.length - 1], pre = pts[Math.max(0, pts.length - 3)];
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.4 * s; path(pts); ctx.stroke();
      ctx.strokeStyle = white(0.92); ctx.lineWidth = 1.05 * s; path(pts); ctx.stroke();
      const ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
      // The balloon, just behind the tip, inflates with diluted contrast.
      const inf = ph === 'idle' || ph === 'enter' || ph === 'free' ? 0 : ease(k01(t, T.inflate, T.wedge));
      if (inf > 0) {
        const [bx, by] = P([tip[0] - Math.cos(ang) * 2.2, tip[1] - Math.sin(ang) * 2.2]);
        ctx.save(); ctx.translate(bx, by); ctx.rotate(ang);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.1 * s, 2.05 * s * inf + 0.4 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = white(0.42); ctx.fill(); ctx.strokeStyle = white(0.95); ctx.lineWidth = 0.8 * s; ctx.stroke();
        ctx.restore();
      }
      const [px, py] = P(tip);
      ctx.fillStyle = C.bright; ctx.beginPath(); ctx.arc(px, py, 1.25 * s, 0, Math.PI * 2); ctx.fill();
      if (ph === 'free' || ph === 'wedge') {
        const pulse = 0.5 + 0.5 * Math.sin(t / 180);
        ctx.strokeStyle = (ph === 'free' ? C.free : C.wedge) + Math.round(80 + 120 * pulse).toString(16).padStart(2, '0');
        ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, (3.2 + pulse) * s, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Labels, when there is room.
    if (s > 1.45) {
      ctx.font = FONT(600, s > 2.4 ? 11 : 10); ctx.fillStyle = C.text; ctx.textBaseline = 'middle';
      const lab = (txt, q, align = 'left') => { const [a, b] = P(q); ctx.textAlign = align; ctx.fillText(txt, a, b); };
      lab('Right IJV', [36, 8]); lab('RA', [33, 53], 'right'); lab('IVC', [45, 92]); lab('Right HV', [4, 71]); lab('Liver', [60, 88]);
    }
    ctx.fillStyle = C.text; ctx.font = FONT(600, 9.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('FLUORO · AP', x + 8, y + hh - 8);
    ctx.restore();
    rrect(ctx, x + 0.5, y + 0.5, w - 1, hh - 1, 9); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
  }

  function tracing(ctx, x, y, w, hh) {
    if (w < 80) return;
    const ph = phase(), v = values();
    const narrow = w < 230;
    // Header: what is read now, large.
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = C.text; ctx.font = FONT(600, 10);
    ctx.fillText(narrow ? 'PRESSURE · mmHg' : 'HEPATIC VEIN PRESSURE · mmHg', x + 2, y + 13);
    const big = Math.round(clamp(Math.min(w * 0.14, hh * 0.13), 20, 38));
    let label, num = '', col = C.text;
    if (ph === 'idle') { label = 'Ready'; }
    else if (ph === 'enter') { label = 'Catheter advancing'; }
    else if (ph === 'free') { label = 'FHVP'; num = fmt(pAt(t, v), 1); col = C.free; }
    else if (ph === 'wedge') { label = t < T.wedge ? 'Balloon inflating' : 'WHVP'; num = fmt(pAt(t, v), 1); col = C.wedge; }
    else { label = 'HVPG'; num = fmt(v.hvpg, 1); col = sevCol(v.hvpg); }
    ctx.font = FONT(600, 12); ctx.fillStyle = col === C.text ? C.bright : col; ctx.fillText(label, x + 2, y + 32);
    if (num) { ctx.font = FONT(700, big); ctx.textAlign = 'right'; ctx.fillText(num, x + w - 4, y + 16 + big); ctx.textAlign = 'left'; }
    // The plot.
    const top = y + 30 + Math.max(big, 26) - 6, bot = y + hh - 18, L = x + 22, R = x + w - (narrow ? 4 : 50);
    if (bot - top < 40) return;
    const ymax = Math.max(15, Math.ceil((Math.max(v.whvp, v.fhvp) + 5) / 5) * 5);
    const Y = (p) => bot - (clamp(p, 0, ymax) / ymax) * (bot - top);
    const X = (tt) => L + k01(tt, T.free - 300, T.end) * (R - L);
    ctx.lineWidth = 1; ctx.font = FONT(500, 9.5); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let p = 0; p <= ymax; p += 5) {
      ctx.strokeStyle = p ? C.grid : C.line; ctx.beginPath(); ctx.moveTo(L, Math.round(Y(p)) + 0.5); ctx.lineTo(R, Math.round(Y(p)) + 0.5); ctx.stroke();
      if (p % 10 === 0 || ymax <= 20) ctx.fillText(String(p), L - 5, Y(p));
    }
    if (ph === 'idle' || ph === 'enter') {
      ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = FONT(500, 11);
      ctx.fillText(ph === 'idle' ? 'The tracing starts in the hepatic vein.' : 'Waiting for the hepatic vein…', (L + R) / 2, (top + bot) / 2);
      return;
    }
    // The trace, swept up to now: blue while free, violet once the balloon is up.
    const tNow = Math.min(t, T.end);
    const seg = (a, b, colr) => {
      if (tNow <= a) return;
      ctx.strokeStyle = colr; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let tt = a; tt <= Math.min(b, tNow); tt += 30) { const X1 = X(tt), Y1 = Y(pAt(tt, v)); tt === a ? ctx.moveTo(X1, Y1) : ctx.lineTo(X1, Y1); }
      ctx.stroke();
    };
    seg(T.free - 300, T.inflate, C.free);
    seg(T.inflate, T.end, C.wedge);
    // The sweep's leading dot.
    if (t < T.end) { ctx.fillStyle = C.bright; ctx.beginPath(); ctx.arc(X(tNow), Y(pAt(tNow, v)), 2.6, 0, Math.PI * 2); ctx.fill(); }
    // The two levels, once each is read, and the gradient between them.
    const level = (p, colr, txt) => {
      ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha = 0.75; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(R, Y(p)); ctx.stroke(); ctx.restore();
      if (!narrow) { ctx.fillStyle = colr; ctx.font = FONT(600, 10); ctx.textAlign = 'left'; ctx.fillText(txt, R + 5, Y(p) - 6); ctx.font = FONT(700, 11); ctx.fillText(fmt(p, 1), R + 5, Y(p) + 7); }
    };
    if (t >= T.inflate) level(v.fhvp, C.free, 'FHVP');
    if (ph === 'result') {
      level(v.whvp, C.wedge, 'WHVP');
      const a = ease(k01(t, T.result, T.result + 500)), xa = L + (R - L) * 0.86, y1 = Y(v.fhvp), y2 = Y(v.fhvp + (v.whvp - v.fhvp) * a), col2 = sevCol(v.hvpg);
      ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xa, y1); ctx.lineTo(xa, y2); ctx.stroke();
      if (Math.abs(y1 - y2) > 10) for (const [yy, d] of [[y1, 1], [y2, -1]]) { ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xa - 4, yy - 6 * d); ctx.lineTo(xa + 4, yy - 6 * d); ctx.closePath(); ctx.fill(); }
      if (a > 0.6) {
        const txt = `HVPG ${fmt(v.hvpg, 1)}`; ctx.font = FONT(700, 11.5);
        const tw = ctx.measureText(txt).width + 12, lx = xa - tw - 6, ly = (y1 + y2) / 2;
        ctx.fillStyle = C.bg; rrect(ctx, lx, ly - 9, tw, 18, 9); ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = col2; ctx.textAlign = 'left'; ctx.fillText(txt, lx + 6, ly + 0.5);
      }
    }
    // Time ticks: one a second.
    ctx.fillStyle = C.text; ctx.font = FONT(500, 9); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (!narrow) ctx.fillText('balloon up', X(T.inflate), bot + 13);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(X(T.inflate), bot); ctx.lineTo(X(T.inflate), bot + 4); ctx.stroke();
  }

  /** The catheter pressure at time tt: the free level with small cardiac and breathing waves, then an exponential climb
   *  to the wedged level once the balloon is up, the waves damped by the still column. */
  function pAt(tt, v) {
    const wave = Math.sin(tt / 850 * 2 * Math.PI) * 0.55 + Math.sin(tt / 850 * 4 * Math.PI + 1) * 0.25 + Math.sin(tt / 3600 * 2 * Math.PI) * 0.45;
    if (tt < T.inflate) return v.fhvp + wave;
    const k = 1 - Math.exp(-(tt - T.inflate) / 650);
    return v.fhvp + (v.whvp - v.fhvp) * k + wave * (0.15 + 0.85 * Math.exp(-(tt - T.inflate) / 500));
  }

  function update(f) {
    frame = f;
    if (raf) return;   // the animation loop paints
    paintSide();
    const r = cv.getBoundingClientRect();
    const key = [Math.round(r.width), Math.round(r.height), phase(), result ? '' : fmt(f.metrics.fhvp, 1) + fmt(f.metrics.whvp, 1)].join('|');
    if (key !== sig) { sig = key; draw(); }
  }
  // A new patient starts with no measurement.
  store.on('hvpgMeasured', (v) => { if (!v && result) reset(); });
  store.on('lastHVPG', (v) => { if (!v && result) reset(); });
  paintSide();
  return { id: 'hvpg', label: 'HVPG procedure', el, update, start };
}

function vessel(ctx, pts, w0, w1, col, P) {
  if (pts.length < 2) return;
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = P(pts[i - 1]), [c, d] = P(pts[i]);
    ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  }
}
function blob(ctx, [x, y], rx, ry, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(232,237,244,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
