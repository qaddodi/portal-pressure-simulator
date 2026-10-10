// Dock charts (blueprint §9.2): the pressure profile.

import { NODES } from '../engine/topology.js?v=706a39d50b';
import { PROFILE_PATHS, SHORT } from './anatomy.js?v=f43ab79a81';
import { pressureColor } from './colormap.js?v=7616551729';
import { store, hiddenNow } from './store.js?v=5edd069b32';
import { h, fmt, fitCanvas, cssVar, clamp, createEaser, axisTop } from './util.js?v=045e641b44';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const ARTERIAL = new Set(['AO', 'HA']);
export const theme = () => ({
  text: cssVar('--text'), muted: cssVar('--text-2'), faint: cssVar('--text-3'), border: cssVar('--grid'), axis: cssVar('--axis'),
  surface: cssVar('--surface'), surface2: cssVar('--surface-2'), accent: cssVar('--accent'), danger: cssVar('--danger'),
  rev: cssVar('--flow-reversed'), ok: cssVar('--flow-normal'), artery: cssVar('--artery'), caution: cssVar('--caution'),
  series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar('--s' + i)),
});
export const FONT = (w = 500, px = 11) => `${w} ${px}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;

// A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson),
// so a pressure that only falls is never drawn rising between two stations.
function smoothPath(ctx, pts) {
  const n = pts.length;
  if (!n) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (n < 3) { for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]); return; }
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    ctx.bezierCurveTo(pts[i][0] + d, pts[i][1] + t[i] * d, pts[i + 1][0] - d, pts[i + 1][1] - t[i + 1] * d, pts[i + 1][0], pts[i + 1][1]);
  }
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
  const note = h('div', { class: 'sub' }, 'Pressure from gut to heart. Where the line drops steeply, that is where the block is. The spans along the bottom show HVPG (wedged − free hepatic vein) and PPG (portal vein − IVC).');
  const side = h('div', { class: 'chart-side' }, legend, note, h('div', { class: 'ctl-sub', id: 'profileOffscale' }));
  el.append(box, side);
  let pathId = 'main';
  const curPath = () => PROFILE_PATHS.find((p) => p.id === pathId) || PROFILE_PATHS[0];
  const nm = (n) => curPath().names?.[n] || SHORT[n] || n;
  // F is what is drawn: the frame with its pressures eased toward the model's (breath- and
  // beat-filtered) values, so the line, dots and labels glide rather than jump when values change.
  let F = null, Fraw = null, axisMax = 15, easeRaf = 0;
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
    const moving = mP || mA;
    F = { ...Fraw, P: shown };
    draw();
    cancelAnimationFrame(easeRaf);
    // Model frames arrive about ten times a second; the glide runs every display frame between them.
    if (moving || pillMoving) easeRaf = requestAnimationFrame(() => { if (cv.isConnected && cv.offsetParent) ease(); });
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
    if (stagger) { const m = cv.getContext('2d'); m.font = FONT(500, 11); tilt = Math.max(...stations.map((n) => m.measureText(nm(n)).width)) * 0.5; }
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

  function draw() {
    if (!F) return;
    const c = theme();
    const { ctx } = fitCanvas(cv);
    const g = geometry();
    const { w, hh, stations, L, R, T, B, slot, maxP, x, y, stagger, hasArt, artY, roomy } = g;
    ctx.clearRect(0, 0, w, hh);
    ctx.font = FONT(500, 11);
    // grid (solid hairlines): absolute pressure has no clinical threshold, so none is drawn
    ctx.strokeStyle = c.border; ctx.fillStyle = c.faint; ctx.lineWidth = 1;
    const step = maxP > 40 ? 10 : 5;
    for (let p = 0; p <= maxP; p += step) {
      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(L, Math.round(y(p)) + 0.5); ctx.lineTo(w - R, Math.round(y(p)) + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(String(p), L - 8, y(p) + 4);
    }
    // The liver: a soft band behind its stations, named at the top.
    const lv = curPath().liver;
    if (lv) {
      const i0 = stations.indexOf(lv[0]), i1 = stations.indexOf(lv[1]);
      if (i0 >= 0 && i1 >= i0) {
        const bx = x(i0) - slot / 2, bw = slot * (i1 - i0 + 1);
        ctx.save(); ctx.fillStyle = c.liver || 'rgba(176, 96, 84, .09)'; ctx.fillRect(bx, T - 6, bw, y(0) - T + 6);
        ctx.fillStyle = c.muted; ctx.font = FONT(600, 10.5); ctx.textAlign = 'center'; ctx.fillText('LIVER', bx + bw / 2, T + 4); ctx.restore();
      }
    }
    ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(L, Math.round(y(0)) + 0.5); ctx.lineTo(w - R, Math.round(y(0)) + 0.5); ctx.stroke();
    if (roomy || !hasArt) { ctx.textAlign = 'left'; ctx.fillText('mmHg', 6, 12); } else { ctx.textAlign = 'right'; ctx.fillText('mmHg', w - R, artY + 4); }
    // station labels: horizontal, or turned 30° (ending under their point) when close together
    ctx.fillStyle = c.muted; ctx.font = FONT(500, 11);
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
      ctx.fillStyle = c.faint; ctx.textAlign = 'left'; ctx.font = FONT(500, 10.5); ctx.fillText('arterial', 4, artY + 4);
    }
    const Y = (v, i) => (ARTERIAL.has(stations[i]) ? artY : y(v));
    // The curve runs through the venous stations only; an arterial station sits in its band above
    // the break, joined to the first venous station by a faint dotted lead.
    const venousIdx = stations.map((n, i) => (ARTERIAL.has(n) ? -1 : i)).filter((i) => i >= 0);
    const pts = (vals) => venousIdx.map((i) => [x(i), y(vals[i])]);
    const st = store.get();
    const healthy = st.healthy;
    const now = stations.map((n) => F.P[NI[n]]);
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
      el.querySelector('.lg-compare').style.display = '';
    } else el.querySelector('.lg-compare').style.display = 'none';
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
    // arterial stations: a dot in the band, a dotted lead to the curve, and the true value
    stations.forEach((n, i) => {
      if (!ARTERIAL.has(n)) return;
      const j = venousIdx.find((k) => k > i) ?? venousIdx[venousIdx.length - 1];
      if (j != null) {
        ctx.strokeStyle = c.artery; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(x(i), artY); ctx.lineTo(x(j), y(now[j])); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = c.text; ctx.font = FONT(600, 10.5); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fmt(now[i], 0)} mmHg`, x(i) + 9, artY);
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
    ctx.font = FONT(600, 10.5);
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
    if (slot >= 26) {
      ctx.font = FONT(600, 11);
      for (const d of dots) {
        if (ARTERIAL.has(stations[d.i])) continue;
        const txt = fmt(now[d.i], 0);
        const tw = ctx.measureText(txt).width + 4, th = 13;
        const r = place(d.cx, [d.cy - 15, d.cy + 15], tw, th);
        if (!r) continue;
        ctx.fillStyle = c.text; ctx.fillText(txt, d.cx, (r.y0 + r.y1) / 2 + 0.5);
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
    const overlap = (r, o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0;
    const items = [], claimed = [];
    (dims || []).forEach((d, k) => {
      const a = stations.indexOf(d.hi), b = stations.indexOf(d.lo);
      if (a < 0 || b < 0 || (d.hide && hid?.has(d.hide))) { items.push(null); return; }
      const m = F.metrics || {};
      const hv = d.hiM && m[d.hiM] != null ? m[d.hiM] : now[a], lv = d.loM && m[d.loM] != null ? m[d.loM] : now[b];
      const v = d.m && m[d.m] != null ? m[d.m] : hv - lv;
      const col = v >= d.bad ? c.danger : v >= d.warn ? c.caution : c.muted;
      const txt = `${d.k} `, num = fmt(v, 1);
      ctx.font = FONT(600, 10.5); const tw1 = ctx.measureText(txt).width;
      ctx.font = FONT(700, 12.5); const tw2 = ctx.measureText(num).width;
      const tw = tw1 + tw2 + 12, x0 = x(a), x1 = x(b);
      const base = y(0) - 12 - (dimN - 1 - k) * 24;
      const lo = Math.max(L + 2, Math.min(x0, x1) + 2), hi = Math.min(w - R, Math.max(x0, x1) - 2) - tw;
      const cx = Math.max(L + 2, Math.min(w - R - tw, (x0 + x1) / 2 - tw / 2));
      const shifts = [0];
      if (hi > lo) for (let s = 12; s <= hi - lo + 12; s += 12) shifts.push(s, -s);
      const xs = shifts.map((s) => (hi > lo ? Math.max(lo, Math.min(hi, cx + s)) : cx)).filter((v2, q, arr) => arr.indexOf(v2) === q);
      const rows = []; for (let yy = base; yy >= T + 10; yy -= 8) rows.push(yy);
      const ok = (yy, lx, withHealthy) => {
        const r = { x0: lx, x1: lx + tw, y0: yy - 8, y1: yy + 8 };
        if (taken.some((o) => overlap(r, o)) || claimed.some((o) => overlap(r, o))) return false;
        // the whole bracket (bar and end caps) must clear every dot and value label too, not just the pill
        const bar = { x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: yy - 6, y1: yy + 6 };
        if (taken.some((o) => overlap(bar, o)) || claimed.some((o) => overlap(bar, o))) return false;
        return !lines.slice(0, withHealthy ? lines.length : 1).some((pp) => hitsLine(r, pp));
      };
      let best = null;
      for (const withHealthy of [true, false]) {
        for (const yy of rows) { for (const lx of xs) if (ok(yy, lx, withHealthy)) { best = { yy, lx }; break; } if (best) break; }
        if (best) break;
      }
      if (!best) best = { yy: base, lx: cx };
      claimed.push({ x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: best.yy - 9, y1: best.yy + 9 });
      items.push({ d, a, b, col, txt, num, tw1, tw, x0, x1, ty: best.yy, tx: best.lx, base });
    });
    // eased positions: [row, left edge] per span
    const { v: pos, moving: mPill } = easePill.step(items.flatMap((it) => (it ? [it.ty, it.tx] : [0, 0])));
    pillMoving = mPill;
    items.forEach((it, k) => {
      if (!it) return;
      const { d, a, b, col, txt, num, tw1, tw, x0, x1 } = it;
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
      ctx.fillStyle = c.muted; ctx.font = FONT(600, 10.5); ctx.fillText(txt, lx + 6, ly + 0.5);
      ctx.fillStyle = col === c.muted ? c.text : col; ctx.font = FONT(700, 12.5); ctx.fillText(num, lx + 6 + tw1, ly + 0.5);
      ctx.restore();
    });
    if (pillMoving) { cancelAnimationFrame(easeRaf); easeRaf = requestAnimationFrame(() => { if (cv.isConnected && cv.offsetParent) ease(); }); }
    ctx.textBaseline = 'alphabetic';
    el.querySelector('#profileOffscale').textContent = hasArt ? 'Arterial pressure is drawn above the break (//) at its true value.' : '';
    // prediction
    const lp = el.querySelector('.lg-pred');
    if (predict?.values?.size) {
      lp.style.display = '';
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      smoothPath(ctx, stations.map((n, i) => [n, i]).filter(([n]) => predict.values.get(n) != null && !ARTERIAL.has(n)).map(([n, i]) => [x(i), y(predict.values.get(n))]));
      ctx.stroke(); ctx.setLineDash([]);
      if (predict.reveal) {
        ctx.fillStyle = 'rgba(210,69,47,.14)';
        stations.forEach((n, i) => { const v = predict.values.get(n); if (v == null) return; ctx.fillRect(x(i) - 6, Math.min(y(v), y(now[i])), 12, Math.abs(y(v) - y(now[i]))); });
      }
    } else lp.style.display = 'none';
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
