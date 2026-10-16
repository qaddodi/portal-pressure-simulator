// Dock charts (blueprint §9.2): the pressure profile.

import { NODES } from '../engine/topology.js?v=4044766e96';
import { PROFILE_PATHS, SHORT } from './anatomy.js?v=0b72305f30';
import { pressureColor } from './colormap.js?v=1cefa5f7d8';
import { store, hiddenNow } from './store.js?v=65ec443c0e';
import { h, fmt, fitCanvas, cssVar, cssAlpha, clamp, createEaser, axisTop } from './util.js?v=4c3d80678b';
import { frameFor, cancelFrame, paceMs } from './frame.js?v=5efaa2bcc9';
import { tenthGap } from '../engine/gap.js?v=3a5947c552';
import { shownOr } from './shown.js?v=82ef5e29ec';
import { monotoneSegs, curveTester } from './curve-near.js?v=9ff15157e9';
import { glideMoving } from './idle-keys.js?v=27f599b5bc';
const nextFrame = frameFor('charts');

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const ARTERIAL = new Set(['AO', 'HA']);
export const theme = () => ({
  text: cssVar('--text'), muted: cssVar('--text-2'), faint: cssVar('--text-3'), border: cssVar('--grid'), axis: cssVar('--axis'),
  surface: cssVar('--surface'), surface2: cssVar('--surface-2'), accent: cssVar('--accent'), danger: cssVar('--danger'),
  rev: cssVar('--flow-reversed'), ok: cssVar('--flow-normal'), artery: cssVar('--artery'), caution: cssVar('--caution'),
  series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar('--s' + i)),
});
export const FONT = (w = 500, px = 11) => `${w} ${px}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
// DOM writes only when something changed: a write on every frame, even of the same text, marks the page for a fresh
// style and layout pass.
const setText = (node, t) => { if (node && node.textContent !== t) node.textContent = t; };
const setDisplay = (node, d) => { if (node && node.style.display !== d) node.style.display = d; };

// A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson),
// so a pressure that only falls is never drawn rising between two stations.
function smoothPath(ctx, pts) {
  const n = pts.length;
  if (!n) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  const segs = monotoneSegs(pts);
  if (!segs) { for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]); return; }
  for (const [, , ax, ay, bx, by, x1, y1] of segs) ctx.bezierCurveTo(ax, ay, bx, by, x1, y1);
}

// ── Pressure profile ("hydraulic grade line") ────────
export function createProfile() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'profile' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure profile along the selected path' });
  box.append(cv);
  const legend = h('div', { class: 'legend-inline' },
    h('span', {}, h('i', { style: { borderColor: 'var(--text)' } }), 'Now'),
    h('span', {}, h('i', { style: { borderColor: 'var(--text-3)', borderTopStyle: 'dashed' } }), 'Healthy'),
    h('span', { class: 'lg-compare', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--s1)', borderTopStyle: 'dotted' } }), 'Snapshot A'),
    h('span', { class: 'lg-pred', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--accent)', borderTopStyle: 'dashed' } }), 'Your prediction'));
  const note = h('div', { class: 'sub' }, 'Pressure from gut to heart. Where the line drops steeply, that is where the resistance is highest. The spans along the bottom show HVPG (wedged − free hepatic vein) and PPG (portal vein − IVC).');
  const side = h('div', { class: 'chart-side' }, legend, note, h('div', { class: 'ctl-sub', id: 'profileOffscale' }));
  el.append(box, side);
  let pathId = 'main';
  const curPath = () => PROFILE_PATHS.find((p) => p.id === pathId) || PROFILE_PATHS[0];
  const nm = (n) => curPath().names?.[n] || SHORT[n] || n;
  // F is what is drawn: the frame with its pressures eased toward the model's (breath- and
  // beat-filtered) values, so the line, dots and labels glide rather than jump when values change.
  let F = null, Fraw = null, axisMax = 15, easeRaf = 0;
  // On screen: kept by an observer rather than read from cv.offsetParent on every glide frame, which forced a style and
  // layout pass each time (as the Over time trace does). Back on screen, the glide picks up again.
  let seen = null;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    const was = seen; seen = es[es.length - 1].isIntersecting;
    if (seen && !was && Fraw) { cancelFrame(easeRaf); easeRaf = nextFrame(() => { if (cv.isConnected && shown()) ease(); }); }
  }) : null;
  io?.observe(cv);
  const shown = () => (seen == null ? !!cv.offsetParent : seen);
  const easeP = createEaser(), easeAxis = createEaser(), easePill = createEaser(0.18);
  let pillMoving = false;
  function ease() {
    if (!Fraw) return;
    const src = Fraw.Pf || Fraw.P;
    const { v: shown, moving: mP } = easeP.step(src);
    const path = curPath();
    const st = store.get();
    let top = 0;
    for (const n of path.nodes) {
      if (ARTERIAL.has(n)) continue;
      top = Math.max(top, src[NI[n]], st.healthy?.P?.[NI[n]] ?? 0, st.compareSnap?.P?.[NI[n]] ?? 0);
    }
    const { v: ax, moving: mA } = easeAxis.step([axisTop(top)]);
    axisMax = ax[0];
    // (The chart draws the model's own beat-filtered pressures, F.Pf, where the frame carries them, as every frame after the
    // first does: those are already smooth, and the eased copy is drawn only before them. Its easing never settled while the
    // model ran, so it repainted the same picture on every display frame; only what the picture shows keeps the glide going.)
    const moving = glideMoving(!!Fraw.Pf, mP, mA);
    F = { ...Fraw, P: shown };
    draw();
    cancelFrame(easeRaf);
    // Model frames arrive about ten times a second; the glide runs between them on every frame the screen offers
    // (15 a second in Battery saver) while the axis or a pill is still on its way, and stops once they have arrived.
    const at = performance.now();
    const next = (t) => { if (t - at < paceMs()) { easeRaf = nextFrame(next); return; } if (cv.isConnected && shown()) ease(); };
    if (moving || pillMoving) easeRaf = nextFrame(next);
  }
  let predict = null; // { on, values: Map(station → P), done }
  let dragging = false;

  function geometry() {
    const { w, h: hh } = fitCanvas(cv);
    const path = curPath();
    // Venous stations only: the arterial pressure sits far off the portal scale and says little here.
    const stations = path.nodes.filter((n) => !ARTERIAL.has(n));
    const slot0 = (w - 56) / stations.length;
    // Close together, the station names turn 30° on one row (each ending under its point).
    const stagger = slot0 < 74;
    let tilt = 0;
    if (stagger) { const m = cv.getContext('2d'); m.font = FONT(500, 12); tilt = Math.max(...stations.map((n) => m.measureText(nm(n)).width)) * 0.5; }
    // Arterial stations sit far above the venous scale: they are drawn in a band above a broken
    // axis (//) with their true value, never clipped.
    const hasArt = stations.some((n) => ARTERIAL.has(n));
    const roomy = hh > 230;
    const L = 40, R = 16, T = hasArt ? (roomy ? 58 : 34) : 28, B = stagger ? Math.ceil(tilt) + 20 : 26;
    const slot = (w - L - R) / stations.length;
    // The axis follows the highest point (now, healthy or the compared moment), eased, not fixed at 30.
    const maxP = axisMax;
    const y = (p) => T + (hh - T - B) * (1 - clamp(p, -2, maxP) / maxP);
    const x = (i) => L + slot * (i + 0.5);
    const artY = roomy ? T - 24 : T - 20;
    return { w, hh, stations, L, R, T, B, slot, maxP, x, y, stagger, hasArt, artY, roomy };
  }

  // The compact strip (as a ladder card picks its full plot or its strip by size, a667e9f): where the plot would be too short
  // for its axis numbers, the LIVER caption and both pills to stand clear (a 320 px phone's half sheet, about 40 px), five
  // stations in a row, their names over their readings, with the HVPG and PPG as brackets under them. The full chart returns
  // as soon as the plot has its room (the sheet pulled up). Never while a prediction is being drawn on the plot.
  const STRIP = ['CONF', 'SIN_R', 'RHV', 'IVCS', 'RA'], STRIP_NAME = { CONF: 'Portal v.', SIN_R: 'Sinusoid', RHV: 'RHV', IVCS: 'IVC', RA: 'RA' };
  const PLOT_MIN = 130;   // (two pill rows of 24, the LIVER caption, and the stations' own spread)
  // A station's reading: the bar's own (shown.js) where a gradient ends, so a bracket's label is the difference of the two
  // readings written at its ends, after rounding, and the bar's number too (sweep 2 review item 13).
  const AT_SHOWN = { CONF: 'pv', IVCS: 'ivc', RHV: 'fhvp' };
  const reading = (n, PM) => (AT_SHOWN[n] ? shownOr(AT_SHOWN[n], PM[NI[n]]) : PM[NI[n]]);
  // (A gradient measured elsewhere, the HVPG's wedged pressure, takes that reading for its upper end.)
  const gapOf = (d, m, hv, lv) => tenthGap(d.hiM && m[d.hiM] != null ? shownOr(d.hiM, m[d.hiM]) : hv, d.loM && m[d.loM] != null ? shownOr(d.loM, m[d.loM]) : lv, hv - lv);
  let wasStrip = null, formLock = null;
  const stripNow = (g) => !predict?.on && g.hh - g.T - g.B < PLOT_MIN;
  // (Which form shows: a fade when it changes; the strip's own key. A full chart whose labels cannot all stand clear switches
  // to the strip for that size and stays there, so a beat's wobble never flips it back and forth.)
  const setForm = (strip) => {
    if (wasStrip !== null && strip !== wasStrip) cv.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });   // (a short fade as it changes form)
    wasStrip = strip;
    setDisplay(legend, strip ? 'none' : '');   // (the strip draws no lines to key)
  };
  function drawStrip(ctx, c, w, hh) {
    const PM = F.Pf || F.P, m = F.metrics || {}, hid = hiddenNow();
    // Each column as wide as its name (6 px apart) or its reading with room for a connector (12 px or more) between,
    // whichever is wider, the rest of the row shared out evenly; the block centred top to bottom in the box. (By the names
    // alone, the IVC and RA readings left no room for their connector, sweep 2 review item 11.)
    const x0 = 12, x1 = w - 12;
    const vals = STRIP.map((n) => reading(n, PM)), txt = vals.map((v) => fmt(v, 1));
    ctx.font = FONT(600, 12);
    const nw = STRIP.map((n) => ctx.measureText(STRIP_NAME[n]).width);
    let vf = 15, tw;
    for (; vf >= 13; vf--) { ctx.font = FONT(700, vf); tw = txt.map((t) => ctx.measureText(t).width); if (STRIP.reduce((a, _, i) => a + Math.max(nw[i] + 6, tw[i] + 24), 0) <= x1 - x0) break; }
    const cw = STRIP.map((_, i) => Math.max(nw[i] + 6, tw[i] + 24)), gap = Math.max(0, (x1 - x0 - cw.reduce((a, b) => a + b, 0)) / STRIP.length);
    const cx = []; let at = x0 + gap / 2; cw.forEach((q) => { cx.push(at + q / 2); at += q + gap; });
    const X = (i) => cx[i];
    const sc = Math.min(1, Math.max(0.8, hh / 112)), rows = { k: 18 * sc, v: 44 * sc, hvpg: 72 * sc, ppg: 98 * sc };   // (rows close up a little in a shorter box)
    const top = rows.k - 12, bot = rows.ppg + 8, dy = Math.max(0, (hh - (bot - top)) / 2 - top);
    for (const r in rows) rows[r] = Math.round(rows[r] + dy);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // The names, then the readings joined by a line in the pressure's colour that stops short of each number.
    ctx.fillStyle = c.muted; ctx.font = FONT(600, 12);
    STRIP.forEach((n, i) => ctx.fillText(STRIP_NAME[n], X(i), rows.k));
    ctx.font = FONT(700, vf);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < STRIP.length - 1; i++) {
      const a = X(i) + tw[i] / 2 + 6, b = X(i + 1) - tw[i + 1] / 2 - 6;
      const gr = ctx.createLinearGradient(a, 0, b, 0); gr.addColorStop(0, pressureColor(vals[i])); gr.addColorStop(1, pressureColor(vals[i + 1]));
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(a, rows.v - 5); ctx.lineTo(Math.max(a, b), rows.v - 5); ctx.stroke();
    }
    ctx.fillStyle = c.text;
    txt.forEach((t, i) => ctx.fillText(t, X(i), rows.v));
    // The brackets: the name and reading in the line's gap when the bracket has room, else just past its right end.
    const dims = curPath().dims || [];
    for (const d of dims) {
      if (d.hide && hid?.has(d.hide)) continue;
      const a = STRIP.indexOf(d.hi), b = STRIP.indexOf(d.lo);
      if (a < 0 || b < 0) continue;
      const v = gapOf(d, m, reading(d.hi, PM), reading(d.lo, PM));
      const col = v >= d.bad ? c.danger : v >= d.warn ? c.caution : c.muted;
      const yy = d.k === 'HVPG' ? rows.hvpg : rows.ppg, bx0 = X(a), bx1 = X(b), name = `${d.k} `, num = fmt(v, 1);
      ctx.font = FONT(600, 12); const w1 = ctx.measureText(name).width; ctx.font = FONT(700, 12.5); const w2 = ctx.measureText(num).width;
      const lw = w1 + w2, inl = bx1 - bx0 - lw - 16 >= 8, lx = inl ? (bx0 + bx1) / 2 - lw / 2 : bx1 + 8;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'; ctx.beginPath();
      ctx.moveTo(bx0, yy - 4); ctx.lineTo(bx0, yy + 4); ctx.moveTo(bx1, yy - 4); ctx.lineTo(bx1, yy + 4); ctx.moveTo(bx0, yy);
      if (inl) { ctx.lineTo(lx - 6, yy); ctx.moveTo(lx + lw + 6, yy); }
      ctx.lineTo(bx1, yy); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.muted; ctx.font = FONT(600, 12); ctx.fillText(name, lx, yy + 0.5);
      ctx.fillStyle = col === c.muted ? c.text : col; ctx.font = FONT(700, 12.5); ctx.fillText(num, lx + w1, yy + 0.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }
    // The unit under the last station, on the PPG row (whose bracket ends at the IVC).
    ctx.fillStyle = c.faint; ctx.font = FONT(500, 12); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('mmHg', x1, rows.ppg + 0.5); ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    if (!F) return;
    const c = theme();
    const { ctx } = fitCanvas(cv);
    const g = geometry();
    const { w, hh, stations, L, R, T, B, slot, maxP, x, y, stagger, hasArt, artY, roomy } = g;
    ctx.clearRect(0, 0, w, hh);
    const formKey = `${w}x${hh}|${pathId}|${[...(hiddenNow() || [])].join()}|${!!predict?.on}`;
    if (formLock?.key !== formKey) formLock = { key: formKey, strip: false };
    const toStrip = () => { formLock.strip = true; ctx.clearRect(0, 0, w, hh); setForm(true); drawStrip(ctx, c, w, hh); };
    if (stripNow(g) || (formLock.strip && !predict?.on)) { toStrip(); return; }
    ctx.font = FONT(500, 12);
    // grid (solid hairlines): absolute pressure has no clinical threshold, so none is drawn
    ctx.strokeStyle = c.border; ctx.fillStyle = c.faint; ctx.lineWidth = 1;
    // (A short chart, a 320 px phone's half sheet, numbers only every so many lines so no two touch: their 30, 25, 20 had
    // stacked into one smudge. 16 px apart at least, the lines 6 px.)
    const step0 = maxP > 40 ? 10 : 5, per = Math.abs(y(0) - y(step0)) || 1;
    const step = step0 * Math.max(1, Math.ceil(6 / per)), lstep = step0 * Math.max(1, Math.ceil(16 / per));
    for (let p = 0; p <= maxP; p += step) {
      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(L, Math.round(y(p)) + 0.5); ctx.lineTo(w - R, Math.round(y(p)) + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
      if (p % lstep === 0) { ctx.textAlign = 'right'; ctx.fillText(String(p), L - 8, y(p) + 4); }
    }
    // The liver: a soft band behind its stations, named at the top.
    const lv = curPath().liver;
    let liverCap = null;   // (the liver band, where its caption may go: the value labels and the HVPG and PPG pills keep 2 px clear of it)
    if (lv) {
      const i0 = stations.indexOf(lv[0]), i1 = stations.indexOf(lv[1]);
      if (i0 >= 0 && i1 >= i0) {
        const bx = x(i0) - slot / 2, bw = slot * (i1 - i0 + 1);
        ctx.save(); ctx.fillStyle = cssVar('--chart-liver-band'); ctx.fillRect(bx, T - 6, bw, y(0) - T + 6);
        // (Named only where the plot is tall enough to keep the name clear of the pills; the band alone says it on a short one.)
        if (y(0) - T >= 90) liverCap = { bx, bw };   // (placed once the values have theirs, sweep 2 review item 22)
        ctx.restore();
      }
    }
    ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(L, Math.round(y(0)) + 0.5); ctx.lineTo(w - R, Math.round(y(0)) + 0.5); ctx.stroke();
    if (roomy || !hasArt) { ctx.textAlign = 'left'; ctx.fillText('mmHg', 6, 12); } else { ctx.textAlign = 'right'; ctx.fillText('mmHg', w - R, artY + 4); }
    // station labels: horizontal, or turned 30° (ending under their point) when close together
    ctx.fillStyle = c.muted; ctx.font = FONT(500, 12);
    stations.forEach((n, i) => {
      if (!stagger) { ctx.textAlign = 'center'; ctx.fillText(nm(n), x(i), hh - B + 16); return; }
      ctx.save(); ctx.translate(x(i) + 3, hh - B + 10); ctx.rotate(-Math.PI / 6);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(nm(n), 0, 0);
      ctx.restore();
    });
    ctx.textBaseline = 'alphabetic';
    // broken axis for arterial stations
    if (hasArt) {
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1.2;
      for (const dy of [-3, 3]) { ctx.beginPath(); ctx.moveTo(L - 6, T - 10 + dy + 3); ctx.lineTo(L + 6, T - 10 + dy - 3); ctx.stroke(); }
      ctx.fillStyle = c.faint; ctx.textAlign = 'left'; ctx.font = FONT(500, 12); ctx.fillText('arterial', 4, artY + 4);
    }
    const Y = (v, i) => (ARTERIAL.has(stations[i]) ? artY : y(v));
    // The curve runs through the venous stations only; an arterial station sits in its band above
    // the break, joined to the first venous station by a faint dotted lead.
    const venousIdx = stations.map((n, i) => (ARTERIAL.has(n) ? -1 : i)).filter((i) => i >= 0);
    const pts = (vals) => venousIdx.map((i) => [x(i), y(vals[i])]);
    const st = store.get();
    const healthy = st.healthy;
    // (The display-filtered pressures, as the figure's labels read them: the beat-by-beat ones put 22 here beside 22.6 there.)
    const now = stations.map((n) => reading(n, F.Pf || F.P));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Horizontal gradient in pressure colour, so the line and the fill read the colour of each station.
    const grad = () => {
      const gr = ctx.createLinearGradient(x(venousIdx[0]), 0, x(venousIdx[venousIdx.length - 1]), 0);
      const span = Math.max(1, x(venousIdx[venousIdx.length - 1]) - x(venousIdx[0]));
      venousIdx.forEach((i) => gr.addColorStop(clamp((x(i) - x(venousIdx[0])) / span, 0, 1), pressureColor(now[i])));
      return gr;
    };
    if (healthy) {
      ctx.strokeStyle = c.faint; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
      ctx.beginPath(); smoothPath(ctx, pts(stations.map((n) => healthy.P[NI[n]]))); ctx.stroke(); ctx.setLineDash([]);
    }
    if (st.compareSnap?.P) {
      ctx.strokeStyle = c.series[0]; ctx.lineWidth = 2; ctx.setLineDash([1.5, 4]);
      ctx.beginPath(); smoothPath(ctx, pts(stations.map((n) => st.compareSnap.P[NI[n]]))); ctx.stroke(); ctx.setLineDash([]);
      setDisplay(el.querySelector('.lg-compare'), '');
    } else setDisplay(el.querySelector('.lg-compare'), 'none');
    const P0 = pts(now);
    // soft area under the curve, fading towards the baseline
    if (P0.length > 1) {
      ctx.save();
      ctx.beginPath(); smoothPath(ctx, P0);
      ctx.lineTo(P0[P0.length - 1][0], y(0)); ctx.lineTo(P0[0][0], y(0)); ctx.closePath();
      ctx.globalAlpha = 0.16; ctx.fillStyle = grad(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = grad(); ctx.lineWidth = 3;
    ctx.beginPath(); smoothPath(ctx, P0); ctx.stroke();
    // (Whether a box comes within pad px of the curve as drawn: its points tested against the stroke widened by pad.)
    const curve = new Path2D(); smoothPath(curve, P0);
    const hCurve = healthy ? new Path2D() : null;
    if (hCurve) smoothPath(hCurve, pts(stations.map((n) => healthy.P[NI[n]])));
    // (Each point is settled by its distance from the curve where that is clear-cut, and asked of the browser only on the
    // stroke's very edge: the same answers as asking it every time, without stroking the path thousands of times a frame.)
    const testers = new Map([[curve, curveTester(P0)]]);
    if (hCurve) testers.set(hCurve, curveTester(pts(stations.map((n) => healthy.P[NI[n]]))));
    const nearCurve = (r, pad, path = curve) => {
      ctx.save(); ctx.lineWidth = 3 + 2 * pad; const M = ctx.getTransform();
      const hit = testers.get(path)(r, 3 + 2 * pad, (px, py) => ctx.isPointInStroke(path, M.a * px + M.e, M.d * py + M.f));
      ctx.restore(); return hit;
    };
    let fail = false;   // (a label with no clear spot: the strip instead)
    // arterial stations: a dot in the band, a dotted lead to the curve, and the true value
    stations.forEach((n, i) => {
      if (!ARTERIAL.has(n)) return;
      const j = venousIdx.find((k) => k > i) ?? venousIdx[venousIdx.length - 1];
      if (j != null) {
        ctx.strokeStyle = c.artery; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(x(i), artY); ctx.lineTo(x(j), y(now[j])); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = c.text; ctx.font = FONT(600, 12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fmt(now[i], 1)} mmHg`, x(i) + 9, artY);
      ctx.textBaseline = 'alphabetic';
    });
    // station dots, ringed in the surface colour so they sit cleanly on the line
    const dots = stations.map((n, i) => ({ i, cx: x(i), cy: Y(now[i], i), col: ARTERIAL.has(n) ? c.artery : pressureColor(now[i]) }));
    for (const d of dots) {
      ctx.fillStyle = c.surface; ctx.beginPath(); ctx.arc(d.cx, d.cy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(d.cx, d.cy, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // Labels: the value at each station when there is room, and ΔP between stations that matter
    // (≥ 1 mmHg). The largest fall is where the resistance sits, and is marked as such.
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const taken = dots.map((d) => ({ x0: d.cx - 8, x1: d.cx + 8, y0: d.cy - 8, y1: d.cy + 8 }));
    const clash = (r) => taken.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
    const place = (cx, cands, tw, th) => {
      for (const cy of cands) {
        const yy = Math.max(T + th / 2, Math.min(hh - B - th / 2, cy));
        const r = { x0: cx - tw / 2, x1: cx + tw / 2, y0: yy - th / 2, y1: yy + th / 2 };
        if (r.x0 >= L - 4 && r.x1 <= w - R + 4 && !clash(r)) { taken.push(r); return r; }
      }
      return null;
    };
    let big = -1, bigDp = 3;
    for (let k = 0; k < venousIdx.length - 1; k++) { const i = venousIdx[k], j = venousIdx[k + 1]; const d = now[i] - now[j]; if (d > bigDp) { bigDp = d; big = i; } }
    ctx.font = FONT(600, 12);
    const dims = curPath().dims;
    // With HVPG and PPG drawn at the right, the per-segment drop pills are left out.
    for (let k = 0; !dims && k < venousIdx.length - 1; k++) {
      const i = venousIdx[k], j = venousIdx[k + 1];
      const dp = now[i] - now[j];
      if (Math.abs(dp) < 1) continue;
      const main = i === big;
      const txt = (dp > 0 ? '−' : '+') + Math.abs(dp).toFixed(1);
      const tw = ctx.measureText(txt).width + 12, th = 17;
      const xm = (x(i) + x(j)) / 2, ym = (y(now[i]) + y(now[j])) / 2;
      // below-left of a falling segment reads naturally (the fill side); above as a fallback
      const r = place(xm, [ym + 16, ym - 16, ym + 30, ym - 30], tw, th);
      if (!r) continue;
      // An opaque plate first, so no line shows through the number.
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x0, r.y0, tw, th, 8.5) : ctx.rect(r.x0, r.y0, tw, th);
      ctx.fillStyle = c.surface; ctx.fill();
      ctx.fillStyle = main ? c.danger : c.surface2;
      ctx.globalAlpha = main ? 0.14 : 1; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dp < 0 ? c.rev : main ? c.danger : c.muted;
      ctx.fillText(txt, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + 0.5);
    }
    const vals = [];   // (the station values, drawn once the HVPG and PPG pills have their places: one a pill must cover is left out)
    if (slot >= 26) {
      ctx.font = FONT(600, 12);
      for (const d of dots) {
        if (ARTERIAL.has(stations[d.i])) continue;
        const txt = fmt(now[d.i], 1);
        const tw = ctx.measureText(txt).width, th = 12;
        // (Above or below its dot, a row further out, or beside it: 4 px clear of the curve, the dots and the other values.)
        // (Above first and beside before below: the brackets run along the bottom.)
        const sx = tw / 2 + 12, cands = [[0, -18], [sx, -10], [-sx, -10], [0, -32], [sx, -24], [-sx, -24], [sx, 0], [-sx, 0], [0, 18], [sx, 10], [-sx, 10], [0, 32], [sx, 24], [-sx, 24]];
        let r = null;
        // (Clear of the bracket rows along the axis first; into them only when there is no other spot.)
        const band = dims ? y(0) - 12 - (dims.length - 1) * 24 - 11 : hh;
        // (Clear of the healthy line too where there is room: it is a faint reference, so a value may cross it if it must. In the
        // bracket rows, beside a bracket before over one.)
        const spans = (dims || []).map((dd) => [stations.indexOf(dd.hi), stations.indexOf(dd.lo)]).filter(([a, b2]) => a >= 0 && b2 >= 0).map(([a, b2]) => [Math.min(x(a), x(b2)) - 5, Math.max(x(a), x(b2)) + 5]);
        for (let ci = 0; ci < 6 * cands.length; ci++) {
          const [dx, dy] = cands[ci % cands.length], pass = Math.floor(ci / cands.length);
          const cx = d.cx + dx, yy = d.cy + dy, q = { x0: cx - tw / 2, x1: cx + tw / 2, y0: yy - th / 2, y1: yy + th / 2 };
          if (q.y0 < 2 || q.y1 > hh - B - 2 || q.x0 < L - 4 || q.x1 > w - R + 4 || (q.y1 > band && (pass < 2 || (pass < 4 && spans.some(([s0, s1]) => q.x1 > s0 && q.x0 < s1))))) continue;
          if (taken.some((o, j) => { const g = j < dots.length ? 4 : 2; return q.x0 < o.x1 + g && q.x1 > o.x0 - g && q.y0 < o.y1 + g && q.y1 > o.y0 - g; }) || nearCurve(q, 4) || (hCurve && pass % 2 === 0 && nearCurve(q, 2, hCurve))) continue;   // (4 px from the dots and the curve, 2 from another value)
          r = q; break;
        }
        if (!r) { fail = true; continue; }
        taken.push(r); vals.push({ txt, x: (r.x0 + r.x1) / 2, r });
      }
    }
    const overlap = (r, o) => r.x0 < o.x1 + 2 && r.x1 > o.x0 - 2 && r.y0 < o.y1 + 2 && r.y1 > o.y0 - 2;   // (2 px clear, at least)
    // The LIVER caption over its band: centred, or slid along the band, where it stands clear of the dots, the values and the
    // curve (it was left out where the station values needed its spot; now a value keeps its place and the name moves).
    if (liverCap) {
      ctx.font = FONT(600, 12); const lw = ctx.measureText('LIVER').width, { bx, bw } = liverCap;
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        const mx = Math.max(bx + lw / 2 + 2, Math.min(bx + bw - lw / 2 - 2, bx + bw * f));
        const q = { x0: mx - lw / 2 - 2, x1: mx + lw / 2 + 2, y0: T + 4 - 11, y1: T + 4 + 7 };
        if (q.x0 < L || q.x1 > w - R || taken.some((o) => overlap(q, o)) || nearCurve(q, 2)) continue;
        ctx.save(); ctx.fillStyle = c.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('LIVER', mx, T + 4); ctx.restore();
        taken.push(q); break;
      }
    }
    // HVPG and PPG: a bracket inside the chart from where each is measured to where it ends, with a
    // pill giving its value (same numbers and cut-offs as the tiles). HVPG is left out until it has
    // been measured (hiddenNow); the PPG span keeps its row. Each pill starts on its own row near the
    // axis and is lifted (and slid along its bracket) to the nearest spot that covers no station dot,
    // no value label and no pressure line; the move is eased so it never jumps.
    const hid = hiddenNow();
    const nLbl = dots.length, dimN = (dims || []).length;
    const lineY = (pp, px) => {
      for (let q = 0; q < pp.length - 1; q++) if (px >= pp[q][0] && px <= pp[q + 1][0]) return pp[q][1] + (pp[q + 1][1] - pp[q][1]) * (px - pp[q][0]) / (pp[q + 1][0] - pp[q][0] || 1);
      return null;
    };
    const lines = [P0];
    if (healthy) lines.push(pts(stations.map((n) => healthy.P[NI[n]])));
    const hitsLine = (r, pp) => { for (let px = r.x0; px <= r.x1 + 3; px += 4) { const ly = lineY(pp, Math.min(px, r.x1)); if (ly != null && ly > r.y0 - 5 && ly < r.y1 + 5) return true; } return false; };
    const overlap4 = (r, o) => r.x0 < o.x1 + 4 && r.x1 > o.x0 - 4 && r.y0 < o.y1 + 4 && r.y1 > o.y0 - 4;
    const items = [], claimed = [];
    (dims || []).forEach((d, k) => {
      const a = stations.indexOf(d.hi), b = stations.indexOf(d.lo);
      if (a < 0 || b < 0 || (d.hide && hid?.has(d.hide))) { items.push(null); return; }
      const m = F.metrics || {};
      const v = gapOf(d, m, now[a], now[b]);
      const col = v >= d.bad ? c.danger : v >= d.warn ? c.caution : c.muted;
      const txt = `${d.k} `, num = fmt(v, 1);
      ctx.font = FONT(600, 12); const tw1 = ctx.measureText(txt).width;
      ctx.font = FONT(700, 12.5); const tw2 = ctx.measureText(num).width;
      const tw = tw1 + tw2 + 12, x0 = x(a), x1 = x(b);
      const base = y(0) - 12 - (dimN - 1 - k) * 24;
      // (Inside its bracket with 8 px of bar showing at each end, or just past either end when the bracket is too short.)
      const lo = Math.max(L + 2, Math.min(x0, x1) + 8), hi = Math.min(w - R, Math.max(x0, x1) - 8) - tw;
      const cx = Math.max(L + 2, Math.min(w - R - tw, (x0 + x1) / 2 - tw / 2));
      const shifts = [0];
      if (hi > lo) for (let s = 12; s <= hi - lo + 12; s += 12) shifts.push(s, -s);
      const xs = (hi >= lo ? shifts.map((s) => Math.max(lo, Math.min(hi, cx + s))) : [])
        .concat([Math.max(x0, x1) + 8, Math.min(x0, x1) - 8 - tw].filter((v2) => v2 >= L + 2 && v2 + tw <= w - R))
        .filter((v2, q, arr) => arr.indexOf(v2) === q);
      const rows = []; for (let yy = base; yy >= T + 10; yy -= 8) rows.push(yy);
      const ok = (yy, lx, withHealthy) => {
        const r = { x0: lx, x1: lx + tw, y0: yy - 8, y1: yy + 8 };
        // (4 px clear of every dot, value, caption, the other bracket and the curve)
        if (taken.some((o) => overlap4(r, o)) || claimed.some((o) => overlap4(r, o)) || nearCurve(r, 4)) return false;
        // the whole bracket (bar and end caps) must clear every dot and value label too, not just the pill
        const bar = { x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: yy - 6, y1: yy + 6 };
        if (taken.some((o) => overlap(bar, o)) || claimed.some((o) => overlap(bar, o))) return false;
        return !withHealthy || !lines.slice(1).some((pp) => hitsLine(r, pp));
      };
      let best = null;
      for (const withHealthy of [true, false]) {
        for (const yy of rows) { for (const lx of xs) if (ok(yy, lx, withHealthy)) { best = { yy, lx }; break; } if (best) break; }
        if (best) break;
      }
      // (No spot clear of everything: the chart is too small for its labels, and the strip shows instead. Before, the pill
      // kept a spot on the curve, sweep 2 review item 1.)
      if (!best) { fail = true; best = { yy: base, lx: cx }; }
      claimed.push({ x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: best.yy - 9, y1: best.yy + 9 });
      items.push({ d, a, b, col, txt, num, tw1, tw, x0, x1, ty: best.yy, tx: best.lx, base });
    });
    if (fail && !predict?.on) { toStrip(); return; }
    setForm(false);
    // eased positions: [row, left edge] per span
    const { v: pos, moving: mPill } = easePill.step(items.flatMap((it) => (it ? [it.ty, it.tx] : [0, 0])));
    pillMoving = mPill;
    items.forEach((it, k) => {
      if (!it) return;
      const { a, b, col, txt, num, tw1, tw, x0, x1 } = it;
      const yy = pos[2 * k], lx = pos[2 * k + 1], ly = yy;
      ctx.save();
      // Faint leaders from the bracket ends to the two station dots, broken around any value label.
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      for (const [px, st2] of [[x0, a], [x1, b]]) {
        const dy = Y(now[st2], st2), from = yy + (dy > yy ? 4 : -4), to = dy + (dy > yy ? -7 : 7);
        const gaps = taken.slice(nLbl).filter((o) => px > o.x0 - 2 && px < o.x1 + 2 && o.y1 > Math.min(from, to) && o.y0 < Math.max(from, to)).sort((p1, p2) => p1.y0 - p2.y0);
        const dir = to > from ? 1 : -1; let cur = from;
        const segs = [];
        for (const o of dir > 0 ? gaps : gaps.reverse()) { const e = dir > 0 ? o.y0 - 1 : o.y1 + 1; if ((e - cur) * dir > 0) segs.push([cur, e]); cur = dir > 0 ? o.y1 + 1 : o.y0 - 1; }
        if ((to - cur) * dir > 0) segs.push([cur, to]);
        ctx.beginPath(); for (const [s0, s1] of segs) { ctx.moveTo(px, s0); ctx.lineTo(px, s1); } ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, yy - 4); ctx.lineTo(x0, yy + 4); ctx.moveTo(x1, yy - 4); ctx.lineTo(x1, yy + 4); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly - 8, tw, 16, 8) : ctx.rect(lx, ly - 8, tw, 16);
      ctx.fillStyle = c.surface; ctx.fill(); ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.muted; ctx.font = FONT(600, 12); ctx.fillText(txt, lx + 6, ly + 0.5);
      ctx.fillStyle = col === c.muted ? c.text : col; ctx.font = FONT(700, 12.5); ctx.fillText(num, lx + 6 + tw1, ly + 0.5);
      ctx.restore();
    });
    // The station values, where they were placed (the pills keep 4 px clear of them).
    ctx.font = FONT(600, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.text;
    for (const v of vals) ctx.fillText(v.txt, v.x, (v.r.y0 + v.r.y1) / 2 + 0.5);
    if (pillMoving) { cancelFrame(easeRaf); easeRaf = nextFrame(() => { if (cv.isConnected && shown()) ease(); }); }
    ctx.textBaseline = 'alphabetic';
    setText(el.querySelector('#profileOffscale'), hasArt ? 'Arterial pressure is drawn above the break (//) at its true value.' : '');
    // prediction
    const lp = el.querySelector('.lg-pred');
    if (predict?.values?.size) {
      setDisplay(lp, '');
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      smoothPath(ctx, stations.map((n, i) => [n, i]).filter(([n]) => predict.values.get(n) != null && !ARTERIAL.has(n)).map(([n, i]) => [x(i), y(predict.values.get(n))]));
      ctx.stroke(); ctx.setLineDash([]);
      if (predict.reveal) {
        ctx.fillStyle = cssAlpha('--danger', 0.14);
        stations.forEach((n, i) => { const v = predict.values.get(n); if (v == null) return; ctx.fillRect(x(i) - 6, Math.min(y(v), y(now[i])), 12, Math.abs(y(v) - y(now[i]))); });
      }
    } else setDisplay(lp, 'none');
    if (predict?.on) {
      ctx.fillStyle = c.accent; ctx.font = FONT(600, 12.5); ctx.textAlign = 'right';
      ctx.fillText('Drag across the chart to draw your prediction', w - R - 6, T + 14);
    }
  }

  function predictAt(ev) {
    const r = cv.getBoundingClientRect();
    const g = geometry();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const i = clamp(Math.round((px - g.L) / g.slot - 0.5), 0, g.stations.length - 1);
    const v = clamp((1 - (py - g.T) / (g.hh - g.T - g.B)) * g.maxP, 0, g.maxP);
    predict.values.set(g.stations[i], v);
    draw();
  }
  cv.addEventListener('pointerdown', (ev) => { if (!predict?.on) return; dragging = true; cv.setPointerCapture(ev.pointerId); predictAt(ev); });
  cv.addEventListener('pointermove', (ev) => { if (dragging && predict?.on) predictAt(ev); });
  cv.addEventListener('pointerup', () => { dragging = false; if (predict?.on && predict.values.size >= Math.min(4, geometry().stations.length)) predict.onChange?.(predict.values.size); });

  return {
    id: 'profile', label: 'Pressure profile', el,
    update(f) { Fraw = f; ease(); },
    redraw: draw,
    setPath(id) { pathId = id; draw(); },
    startPredict(onChange) { predict = { on: true, values: new Map(), onChange }; draw(); },
    endPredict(reveal = true) { if (predict) { predict.on = false; predict.reveal = reveal; } draw(); return predict; },
    clearPredict() { predict = null; draw(); },
    predictionError() {
      if (!predict || !Fraw) return null;
      let s = 0, n = 0;
      for (const [k, v] of predict.values) { s += Math.abs(v - Fraw.P[NI[k]]); n++; }
      return n ? s / n : null;
    },
  };
}
