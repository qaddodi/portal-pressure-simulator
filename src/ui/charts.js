// Dock charts (blueprint §9.2): pressure profile, scope, Sankey, perfusion + operating point.

import { NODES, EDGES } from '../engine/topology.js?v=44e0aca402';
import { PROFILE_PATHS, SHORT } from './anatomy.js?v=2aa57b853f';
import { pressureColor } from './colormap.js?v=fa78a29bc0';
import { store } from './store.js?v=e9304c5ee2';
import { h, fmt, fitCanvas, cssVar, clamp } from './util.js?v=13768f12bf';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const ARTERIAL = new Set(['AO', 'HA']);
export const theme = () => ({
  text: cssVar('--text'), muted: cssVar('--text-2'), faint: cssVar('--text-3'), border: cssVar('--grid'), axis: cssVar('--axis'),
  surface: cssVar('--surface'), surface2: cssVar('--surface-2'), accent: cssVar('--accent'), danger: cssVar('--danger'),
  rev: cssVar('--flow-reversed'), ok: cssVar('--flow-normal'), artery: cssVar('--artery'), caution: cssVar('--caution'),
  series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar('--s' + i)),
});
export const FONT = (w = 500, px = 11) => `${w} ${px}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;

// ── Pressure profile ("hydraulic grade line") ────────
export function createProfile() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'profile' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure profile along the selected path' });
  box.append(cv);
  const sel = h('select', { class: 'select', 'aria-label': 'Path' }, PROFILE_PATHS.map((p) => h('option', { value: p.id }, p.label)));
  const legend = h('div', { class: 'legend-inline' },
    h('span', {}, h('i', { style: { borderColor: 'var(--text)' } }), 'Now'),
    h('span', {}, h('i', { style: { borderColor: 'var(--text-3)', borderTopStyle: 'dashed' } }), 'Healthy'),
    h('span', { class: 'lg-compare', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--s1)', borderTopStyle: 'dotted' } }), 'Snapshot A'),
    h('span', { class: 'lg-pred', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--accent)', borderTopStyle: 'dashed' } }), 'Your prediction'));
  const note = h('div', { class: 'sub' }, 'Pressure at each station along the path. Every step down is a resistance (ΔP = Q × R); plateaus are compartments. Bar color is the pressure scale.');
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Pressure profile'), sel, legend, note, h('div', { class: 'ctl-sub', id: 'profileOffscale' }));
  el.append(box, side);
  let pathId = 'main';
  sel.addEventListener('change', () => { pathId = sel.value; draw(); });
  let F = null;
  let predict = null; // { on, values: Map(station → P), done }
  let dragging = false;

  function geometry() {
    const { w, h: hh } = fitCanvas(cv);
    const path = PROFILE_PATHS.find((p) => p.id === pathId);
    const stations = path.nodes;
    const slot0 = (w - 56) / stations.length;
    const stagger = slot0 < 74;
    // Arterial stations sit far above the venous scale: they are drawn in a band above a broken
    // axis (//) with their true value, never clipped.
    const hasArt = stations.some((n) => ARTERIAL.has(n));
    const roomy = hh > 230;
    const L = 40, R = 16, T = hasArt ? (roomy ? 58 : 34) : 16, B = stagger ? (roomy ? 44 : 38) : 26;
    const slot = (w - L - R) / stations.length;
    const vals = F ? stations.map((n) => F.P[NI[n]]) : [];
    const venous = vals.filter((_, i) => !ARTERIAL.has(stations[i]));
    const maxP = Math.max(30, ...venous.map((v) => v + 4));
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
    // grid (solid hairlines) & clinical thresholds (dashed reference lines)
    ctx.strokeStyle = c.border; ctx.fillStyle = c.faint; ctx.lineWidth = 1;
    const step = maxP > 40 ? 10 : 5;
    for (let p = 0; p <= maxP; p += step) {
      ctx.beginPath(); ctx.moveTo(L, Math.round(y(p)) + 0.5); ctx.lineTo(w - R, Math.round(y(p)) + 0.5); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(String(p), L - 8, y(p) + 4);
    }
    ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(L, Math.round(y(0)) + 0.5); ctx.lineTo(w - R, Math.round(y(0)) + 0.5); ctx.stroke();
    if (roomy || !hasArt) { ctx.textAlign = 'left'; ctx.fillText('mmHg', 6, 12); } else { ctx.textAlign = 'right'; ctx.fillText('mmHg', w - R, artY + 4); }
    for (const p of [10, 12, 20]) {
      if (p > maxP) continue;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = p === 12 ? c.danger : c.axis; ctx.globalAlpha = p === 12 ? 0.6 : 1;
      ctx.beginPath(); ctx.moveTo(L, y(p)); ctx.lineTo(w - R, y(p)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'right'; ctx.fillStyle = c.faint;
    ctx.fillText('CSPH 10 · bleeding 12', w - R, y(12) - 5);
    // station labels: horizontal, staggered over two rows when the stations are close together
    ctx.fillStyle = c.muted; ctx.textAlign = 'center'; ctx.font = FONT(500, 11);
    stations.forEach((n, i) => {
      const row = stagger && i % 2 ? 1 : 0;
      if (row) { ctx.strokeStyle = c.border; ctx.beginPath(); ctx.moveTo(x(i) + 0.5, hh - B + 4); ctx.lineTo(x(i) + 0.5, hh - B + 18); ctx.stroke(); }
      ctx.fillText(SHORT[n] || n, x(i), hh - B + 16 + row * 15);
    });
    // broken axis for arterial stations
    if (hasArt) {
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1.2;
      for (const dy of [-3, 3]) { ctx.beginPath(); ctx.moveTo(L - 6, T - 10 + dy + 3); ctx.lineTo(L + 6, T - 10 + dy - 3); ctx.stroke(); }
      ctx.fillStyle = c.faint; ctx.textAlign = 'left'; ctx.font = FONT(500, 10.5); ctx.fillText('arterial', 4, artY + 4);
    }
    const Y = (v, i) => (ARTERIAL.has(stations[i]) ? artY : y(v));
    const series = (vals, color, width, dash, markers) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x0 = x(i) - slot * 0.32, x1 = x(i) + slot * 0.32;
        if (i === 0) ctx.moveTo(x0, Y(v, i)); else ctx.lineTo(x0, Y(v, i));
        ctx.lineTo(x1, Y(v, i));
      });
      ctx.stroke(); ctx.setLineDash([]);
      if (markers) vals.forEach((v, i) => {
        const art = ARTERIAL.has(stations[i]);
        ctx.fillStyle = art ? c.artery : pressureColor(v);
        const bx = x(i) - slot * 0.32, bw = slot * 0.64;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, Y(v, i) - 3.5, bw, 7, 3.5) : ctx.rect(bx, Y(v, i) - 3.5, bw, 7); ctx.fill();
        if (art) { ctx.fillStyle = c.text; ctx.font = FONT(600, 10.5); ctx.textAlign = 'left'; ctx.fillText(`${fmt(v, 0)} mmHg`, bx + bw + 6, Y(v, i) + 4); }
      });
    };
    const st = store.get();
    const healthy = st.healthy;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (healthy) series(stations.map((n) => healthy.P[NI[n]]), c.faint, 1.5, [4, 4]);
    if (st.compareSnap?.P) { series(stations.map((n) => st.compareSnap.P[NI[n]]), c.series[0], 2, [1.5, 4]); el.querySelector('.lg-compare').style.display = ''; }
    else el.querySelector('.lg-compare').style.display = 'none';
    const now = stations.map((n) => F.P[NI[n]]);
    series(now, c.text, 2, null, true);
    // ΔP labels on the risers that matter (≥ 1 mmHg): small pills that never sit on a bar or on
    // each other. The largest fall is where the resistance sits, and is marked as such.
    ctx.font = FONT(600, 10.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let big = -1, bigDp = 3;
    for (let i = 0; i < now.length - 1; i++) { const d = now[i] - now[i + 1]; if (!ARTERIAL.has(stations[i]) && d > bigDp) { bigDp = d; big = i; } }
    const taken = [];
    const bars = now.map((v, i) => ({ x0: x(i) - slot * 0.32 - 2, x1: x(i) + slot * 0.32 + 2, y0: Y(v, i) - 6, y1: Y(v, i) + 6 }));
    const clash = (r) => [...taken, ...bars].some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
    for (let i = 0; i < now.length - 1; i++) {
      const dp = now[i] - now[i + 1];
      if (Math.abs(dp) < 1 || ARTERIAL.has(stations[i])) continue;
      const txt = (dp > 0 ? 'Δ ' : 'Δ +') + Math.abs(dp).toFixed(1);
      const tw = ctx.measureText(txt).width + 10, th = 16;
      const xm = (x(i) + x(i + 1)) / 2;
      const ya = y(now[i]), yb = y(now[i + 1]);
      // Beside a tall riser; above the higher step (then below the lower) for a short one.
      const tall = Math.abs(ya - yb) > th + 8;
      const cands = tall ? [[(ya + yb) / 2, tw / 2 + 8], [(ya + yb) / 2, -tw / 2 - 8]] : [[Math.min(ya, yb) - 14, 0], [Math.max(ya, yb) + 14, 0], [Math.min(ya, yb) - 30, 0]];
      let r = null;
      for (const [cy, dx] of cands) {
        const yy = Math.max(T + th / 2, Math.min(hh - B - th / 2, cy));
        const cand = { x0: xm + dx - tw / 2, x1: xm + dx + tw / 2, y0: yy - th / 2, y1: yy + th / 2 };
        if (!clash(cand)) { r = cand; break; }
      }
      if (!r) continue;
      taken.push(r);
      const main = i === big;
      ctx.fillStyle = main ? c.danger : c.surface;
      ctx.globalAlpha = main ? 0.12 : 0.92;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x0, r.y0, tw, th, 8) : ctx.rect(r.x0, r.y0, tw, th); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dp < 0 ? c.rev : main ? c.danger : c.muted;
      ctx.fillText(txt, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + 0.5);
    }
    ctx.textBaseline = 'alphabetic';
    el.querySelector('#profileOffscale').textContent = hasArt ? 'Arterial pressure is drawn above the break (//) at its true value.' : '';
    // prediction
    const lp = el.querySelector('.lg-pred');
    if (predict?.values?.size) {
      lp.style.display = '';
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let first = true;
      stations.forEach((n, i) => { const v = predict.values.get(n); if (v == null || ARTERIAL.has(n)) return; if (first) { ctx.moveTo(x(i), y(v)); first = false; } else ctx.lineTo(x(i), y(v)); });
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
    update(f) { F = f; draw(); },
    redraw: draw,
    setPath(id) { pathId = id; sel.value = id; draw(); },
    startPredict(onChange) { predict = { on: true, values: new Map(), onChange }; draw(); },
    endPredict(reveal = true) { if (predict) { predict.on = false; predict.reveal = reveal; } draw(); return predict; },
    clearPredict() { predict = null; draw(); },
    predictionError() {
      if (!predict || !F) return null;
      let s = 0, n = 0;
      for (const [k, v] of predict.values) { s += Math.abs(v - F.P[NI[k]]); n++; }
      return n ? s / n : null;
    },
  };
}

// ── Scope (time series) ─────────────────────────────
// Series colors come from the validated categorical order (--s1…--s8), fixed per trace so a
// trace keeps its color whatever else is switched on. One y-axis per panel: traces with
// different units are drawn as stacked small multiples instead of a dual axis.
const TRACES = {
  CONF: { label: 'Portal vein', unit: 'mmHg', s: 0 },
  SIN_R: { label: 'Sinusoids (≈ WHVP)', short: 'Sinusoids', unit: 'mmHg', s: 4 },
  RHV: { label: 'Hepatic vein (FHVP)', short: 'Hepatic v.', unit: 'mmHg', s: 2 },
  RA: { label: 'Right atrium', unit: 'mmHg', s: 1 },
  IVCS: { label: 'IVC', unit: 'mmHg', s: 6 },
  VAR: { label: 'Esophageal varix', short: 'Varix', unit: 'mmHg', s: 7 },
  SV: { label: 'Splenic vein', unit: 'mmHg', s: 3 },
  SMV: { label: 'SMV', unit: 'mmHg', s: 5 },
  AO: { label: 'Aorta', unit: 'mmHg (arterial)', s: 7 },
  pvVel: { label: 'Portal velocity', unit: 'cm/s', s: 0 },
  hvVel: { label: 'Hepatic vein velocity', short: 'Hepatic v.', unit: 'cm/s', s: 1 },
};
const TRENDS = {
  hvpg: { label: 'HVPG', unit: 'mmHg', s: 4, get: (m) => m.hvpg },
  pv: { label: 'Portal pressure', unit: 'mmHg', s: 0, get: (m) => m.pv },
  varix: { label: 'Varix diameter', unit: 'mm', s: 7, get: (m) => m.varix.d },
  shunt: { label: 'Shunt fraction', unit: '%', s: 1, get: (m) => m.shuntFraction * 100 },
  ascites: { label: 'Ascites', unit: 'L', s: 2, get: (m) => m.ascites.volume / 1000 },
  spleen: { label: 'Spleen length', unit: 'cm', s: 6, get: (m) => m.spleen.length },
  co: { label: 'Cardiac output', unit: 'L/min', s: 3, get: (m) => m.co },
};

export function createScope() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'scope' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Time-series scope' });
  box.append(cv);
  const chosen = new Set(['CONF', 'SIN_R', 'RHV', 'RA']);
  const chosenTrend = new Set(['hvpg', 'varix', 'ascites']);
  let windowS = 20;
  const winSeg = h('div', { class: 'seg full' }, [6, 20, 60].map((sec) => {
    const b = h('button', { 'aria-pressed': String(sec === windowS) }, `${sec} s`);
    b.addEventListener('click', () => { windowS = sec; winSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    return b;
  }));
  const boxes = h('div', { class: 'check-list' });
  const title = h('div', { class: 'side-title' });
  const hint = h('div', { class: 'ctl-sub' });
  const side = h('div', { class: 'chart-side' }, title, winSeg, boxes, hint);
  el.append(box, side);
  const buf = { t: [] };
  const trend = { day: [] };
  let mode = 'hemo';

  function renderBoxes() {
    const src = mode === 'hemo' ? TRACES : TRENDS;
    const set = mode === 'hemo' ? chosen : chosenTrend;
    const series = theme().series;
    title.textContent = mode === 'hemo' ? 'Scope · seconds' : 'Trends · days';
    boxes.replaceChildren(...Object.entries(src).map(([k, t]) => {
      const cb = h('input', { type: 'checkbox', checked: set.has(k) });
      cb.addEventListener('change', () => { if (cb.checked) set.add(k); else set.delete(k); draw(); });
      return h('label', { class: 'check-row' }, cb, h('i', { style: { borderColor: series[t.s] } }), t.label, h('span', { class: 'unit', style: { marginLeft: 'auto' } }, t.unit));
    }));
    winSeg.hidden = mode !== 'hemo';
    hint.textContent = mode === 'hemo' ? 'Turn on Pulsatile mode (Physiology tab) to see a- and v-waves and portal pulsatility.' : 'Disease clock: one point per simulated day.';
  }
  renderBoxes();

  function ingest(f) {
    const m = f.clock === 'disease' ? 'disease' : 'hemo';
    if (m !== mode) { mode = m; renderBoxes(); }
    if (f.samples) {
      const smp = f.samples;
      // A new scenario restarts the engine clock: start a fresh trace instead of plotting across the jump.
      if (smp.t.length && buf.t.length && smp.t[0] < buf.t[buf.t.length - 1]) for (const k of Object.keys(buf)) buf[k].length = 0;
      for (let i = 0; i < smp.t.length; i++) {
        buf.t.push(smp.t[i]);
        for (const k of Object.keys(TRACES)) (buf[k] ||= []).push(smp[k][i]);
      }
      const tMin = (buf.t[buf.t.length - 1] ?? 0) - 65;
      let cut = 0; while (cut < buf.t.length && buf.t[cut] < tMin) cut++;
      if (cut > 0) for (const k of Object.keys(buf)) buf[k].splice(0, cut);
    }
    if (trend.day[trend.day.length - 1] !== f.day) {
      if (f.day < (trend.day[trend.day.length - 1] ?? -1)) for (const k of Object.keys(trend)) trend[k].length = 0;
      trend.day.push(f.day);
      for (const [k, t] of Object.entries(TRENDS)) (trend[k] ||= []).push(t.get(f.metrics));
      if (trend.day.length > 1500) for (const k of Object.keys(trend)) trend[k].shift();
    }
  }

  const nice = (span) => { const raw = span / 4; const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; };

  function draw() {
    const c = theme();
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const L = 40, R = 118, T = 8, B = 24, GAP = 16;
    ctx.font = FONT(500, 11);
    const isH = mode === 'hemo';
    const xs = isH ? buf.t : trend.day;
    if (xs.length < 2) { ctx.fillStyle = c.faint; ctx.fillText(isH ? 'Collecting samples…' : 'Advance the disease clock to build a trend.', L, 30); return; }
    const x1 = xs[xs.length - 1], x0 = isH ? Math.max(xs[0], x1 - windowS) : Math.max(xs[0], x1 - 730);
    const src = isH ? TRACES : TRENDS;
    const keys = [...(isH ? chosen : chosenTrend)].filter((k) => (isH ? buf[k] : trend[k]));
    if (!keys.length) { ctx.fillStyle = c.faint; ctx.fillText('Choose at least one trace.', L, 30); return; }
    const groups = [];
    for (const k of keys) {
      const u = src[k].unit;
      let g = groups.find((x) => x.unit === u);
      if (!g) groups.push(g = { unit: u, keys: [], mn: Infinity, mx: -Infinity });
      g.keys.push(k);
      const arr = isH ? buf[k] : trend[k];
      for (let i = 0; i < xs.length; i++) if (xs[i] >= x0) { g.mn = Math.min(g.mn, arr[i]); g.mx = Math.max(g.mx, arr[i]); }
    }
    const ph = (hh - T - B - GAP * (groups.length - 1)) / groups.length;
    const X = (t) => L + ((t - x0) / Math.max(1e-6, x1 - x0)) * (w - L - R);
    groups.forEach((g, gi) => {
      const top = T + gi * (ph + GAP), bot = top + ph;
      const pad = Math.max(1, (g.mx - g.mn) * 0.12);
      let mn = g.mn - pad, mx = g.mx + pad;
      if (g.unit === 'mmHg' && mn > 0) mn = 0;
      const tick = nice(mx - mn);
      mn = Math.floor(mn / tick) * tick; mx = Math.ceil(mx / tick) * tick;
      if (g.mn >= 0 && mn < 0) mn = 0;
      const Y = (v) => bot - ((v - mn) / Math.max(1e-6, mx - mn)) * (bot - top);
      ctx.lineWidth = 1; ctx.strokeStyle = c.border; ctx.fillStyle = c.faint; ctx.textAlign = 'right';
      for (let v = mn; v <= mx + 1e-9; v += tick) {
        const yy = Math.round(Y(v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke();
        if (ph > 40 || v === mn || v >= mx - 1e-9) ctx.fillText(fmt(v, tick < 1 ? 1 : 0), L - 7, yy + 4);
      }
      ctx.textAlign = 'left'; ctx.fillStyle = c.muted; ctx.font = FONT(600, 10.5);
      ctx.fillText(g.unit, L + 4, top + 11); ctx.font = FONT(500, 11);
      // traces + direct end labels (ink text beside a colored key), nudged apart only when they collide
      const ends = [];
      ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, w - L - R, bot - top + 4); ctx.clip();
      for (const k of g.keys) {
        const arr = isH ? buf[k] : trend[k];
        ctx.strokeStyle = c.series[src[k].s]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        let started = false, last = null;
        for (let i = 0; i < xs.length; i++) {
          if (xs[i] < x0) continue;
          const px = X(xs[i]), py = Y(arr[i]);
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          last = arr[i];
        }
        ctx.stroke();
        if (last != null) ends.push({ k, y: Y(last), v: last });
      }
      ctx.restore();
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
      for (const e of ends) {
        const yy = Math.min(bot, Math.max(top + 4, e.y));
        ctx.fillStyle = c.series[src[e.k].s]; ctx.beginPath(); ctx.arc(w - R + 8, yy, 3, 0, 7); ctx.fill();
        ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.font = FONT(600, 11);
        ctx.fillText(fmt(e.v, 1), w - R + 15, yy + 4);
        const vw = ctx.measureText(fmt(e.v, 1)).width;
        ctx.fillStyle = c.muted; ctx.font = FONT(500, 11);
        const full = src[e.k].short || src[e.k].label;
        const lab = full.length > 14 ? full.slice(0, 13) + '…' : full;
        ctx.fillText(lab, w - R + 19 + vw, yy + 4);
      }
      ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(L, Math.round(bot) + 0.5); ctx.lineTo(w - R, Math.round(bot) + 0.5); ctx.stroke();
    });
    ctx.fillStyle = c.faint; ctx.textAlign = 'center'; ctx.font = FONT(500, 11);
    const span = x1 - x0;
    const step = isH ? (span > 30 ? 10 : span > 10 ? 2 : 1) : span > 360 ? 90 : span > 120 ? 30 : 7;
    for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) ctx.fillText(isH ? `${Math.round(t)} s` : `day ${Math.round(t)}`, X(t), hh - 6);
  }
  return { id: 'scope', label: 'Scope', el, update(f) { ingest(f); draw(); }, ingest, redraw: draw };
}

// ── Flow Sankey ─────────────────────────────────────
export function createSankey() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'flow' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Flow distribution' });
  box.append(cv);
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Where does gut blood go?'),
    h('div', { class: 'sub' }, 'Ribbon width is proportional to flow (L/min). Teal passes through the liver; orange bypasses it through portosystemic routes. That bypassed share is the shunt fraction.'),
    h('dl', { id: 'sankeyStats', class: 'kv' }));
  el.append(box, side);
  function draw(f) {
    const c = theme();
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const q = (id) => f.Qf[EI[id]] * 0.06;
    const m = f.metrics;
    const colls = [
      ['Esophageal varices → azygos', q('C1b')], ['Paraumbilical → abdominal wall', q('C3')], ['Rectal → iliac', q('C4')],
      ['Gastrorenal shunt', q('C5')], ['Splenorenal shunt', q('C6')], ['Retroperitoneal', q('C7')],
      ['TIPS', q('TIPS')], ['Surgical shunts', q('S_PC') + q('S_DSR') + q('S_MC')],
    ].filter(([, v]) => v > 0.005);
    const portalToLiver = Math.max(0, q('PRE_R')) + Math.max(0, q('PRE_L'));
    const liverToPortal = Math.max(0, -q('PRE_R')) + Math.max(0, -q('PRE_L'));
    const ha = q('A_HR') + q('A_HL');
    const ap = Math.max(0, q('AP_R')) + Math.max(0, q('AP_L'));
    const spl = m.splanchnicIn;
    const bleed = (m.bleeding?.rate || 0) / 1000;
    const sinus = q('SIN_RR') + q('SIN_LL');
    const scale = (hh - 60) / Math.max(1.2, spl + ha + 0.2);
    const col = [70, w * 0.38, w * 0.66, w - 80];
    const blocks = [];
    const drawBlock = (x, y, v, label, color) => {
      const hb = Math.max(2, v * scale);
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 5, y, 10, hb, 2) : ctx.rect(x - 5, y, 10, hb); ctx.fill();
      const right = x > w / 2, tx = x + (right ? -12 : 12), ty = y + Math.min(hb / 2 + 4, hb + 12);
      ctx.textAlign = right ? 'right' : 'left';
      ctx.font = FONT(500, 11.5); ctx.fillStyle = c.muted;
      const lw = ctx.measureText(label + '  ').width;
      ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = c.surface;
      const lx = tx - (right ? (ctx.font = FONT(600, 11.5), ctx.measureText(fmt(v, 2)).width) + 2 : 0);
      ctx.font = FONT(500, 11.5);
      ctx.strokeText(label + '  ', lx, ty); ctx.fillText(label + '  ', lx, ty);
      ctx.font = FONT(600, 11.5); ctx.fillStyle = c.text;
      ctx.strokeText(fmt(v, 2), right ? tx : tx + lw, ty); ctx.fillText(fmt(v, 2), right ? tx : tx + lw, ty);
      blocks.push({ x, y, hb });
      return { x, y, hb, used: 0, usedIn: 0 };
    };
    const ribbon = (a, b, v, color) => {
      if (v <= 0.003) return;
      const t = v * scale;
      const y0 = a.y + a.used, y1 = b.y + b.usedIn;
      a.used += t; b.usedIn += t;
      ctx.fillStyle = color; ctx.globalAlpha = 0.3;
      ctx.beginPath();
      const xm = (a.x + b.x) / 2;
      ctx.moveTo(a.x + 6, y0); ctx.bezierCurveTo(xm, y0, xm, y1, b.x - 6, y1);
      ctx.lineTo(b.x - 6, y1 + t); ctx.bezierCurveTo(xm, y1 + t, xm, y0 + t, a.x + 6, y0 + t); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    const top = 20;
    const A = drawBlock(col[0], top, spl, 'Gut & spleen', c.artery);
    const H = drawBlock(col[0], top + spl * scale + 24, ha + ap, 'Hepatic artery', c.artery);
    const PV = drawBlock(col[1], top, spl + ap + liverToPortal, 'Portal system', pressureColor(f.P[NI.CONF]));
    let y = top;
    const LV = drawBlock(col[2], y, Math.max(sinus, portalToLiver + ha), 'Liver sinusoids', pressureColor(f.P[NI.SIN_R]));
    y += Math.max(sinus, portalToLiver + ha) * scale + 18;
    const C = colls.map(([lab, v]) => { const b = drawBlock(col[2], y, v, lab, cssVar('--flow-reversed')); y += v * scale + 14; return [b, v]; });
    const BL = bleed > 0 ? drawBlock(col[2], y, bleed, 'GI lumen (bleeding)', c.danger) : null;
    const IVC = drawBlock(col[3], top, sinus + colls.reduce((s, [, v]) => s + v, 0), 'Systemic veins → heart', pressureColor(f.P[NI.RA]));
    ribbon(A, PV, spl, c.artery);
    ribbon(H, PV, ap, c.artery);
    ribbon(PV, LV, portalToLiver, c.ok);
    ribbon(H, LV, ha, c.artery);
    if (liverToPortal > 0.003) ribbon({ ...LV, x: LV.x, used: LV.hb - liverToPortal * scale }, PV, liverToPortal, c.rev);
    for (const [b, v] of C) ribbon(PV, b, v, c.rev);
    if (BL) ribbon(PV, BL, bleed, c.danger);
    ribbon(LV, IVC, sinus, c.ok);
    for (const [b, v] of C) ribbon(b, IVC, v, c.rev);
    el.querySelector('#sankeyStats').replaceChildren(
      h('dt', {}, 'Shunt fraction'), h('dd', {}, `${Math.round(m.shuntFraction * 100)} %`),
      h('dt', {}, 'Portal → liver'), h('dd', {}, `${fmt(portalToLiver, 2)} L/min`),
      h('dt', {}, 'Hepatic artery'), h('dd', {}, `${fmt(ha, 2)} L/min`),
      h('dt', {}, 'Liver perfusion'), h('dd', {}, `${Math.round(m.liverPerfPct)} %`));
  }
  return { id: 'flow', label: 'Flow', el, update: draw };
}

// ── Liver perfusion donut + P–Q operating point ─────
export function createPerfusion() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'perfusion' });
  const b1 = h('div', { class: 'chart-box', style: { maxWidth: '300px' } }), c1 = h('canvas', { role: 'img', 'aria-label': 'Liver perfusion composition' }); b1.append(c1);
  const b2 = h('div', { class: 'chart-box' }), c2 = h('canvas', { role: 'img', 'aria-label': 'Pressure–flow operating point' }); b2.append(c2);
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Hepatic arterial buffer'), h('div', { class: 'sub' }, 'When portal inflow falls, adenosine accumulates and the hepatic artery dilates, so liver perfusion falls less than portal flow. Right: the liver’s pressure–flow operating point; the slope is its resistance.'), h('dl', { class: 'kv', id: 'perfStats' }));
  el.append(b1, b2, side);
  function draw(f) {
    const c = theme();
    const m = f.metrics;
    // donut
    {
      const { ctx, w, h: hh } = fitCanvas(c1);
      ctx.clearRect(0, 0, w, hh);
      const top = 58, R = Math.max(20, Math.min(w / 2, (hh - top) / 2) - 8), cx = w / 2, cy = top + (hh - top) / 2, r = R * 0.72;
      const portal = m.portalIn, art = m.arterialIn, lost = Math.max(0, m.splanchnicIn - portal);
      const total = portal + art + lost || 1;
      let a = -Math.PI / 2;
      for (const [v, col] of [[portal, c.ok], [art, c.artery], [lost, c.rev]]) {
        const da = (v / total) * Math.PI * 2;
        const gap = da > 0.05 ? 0.02 : 0;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, R, a + gap, a + da - gap); ctx.arc(cx, cy, r, a + da - gap, a + gap, true); ctx.closePath(); ctx.fill();
        a += da;
      }
      ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.font = FONT(600, Math.max(14, Math.min(24, r * 0.5)));
      ctx.fillText(`${Math.round(m.liverPerfPct)}%`, cx, cy + 4);
      ctx.font = FONT(500, 10.5); ctx.fillStyle = c.muted; ctx.fillText('perfused', cx, cy + 19);
      ctx.textAlign = 'left'; ctx.font = FONT(500, 11);
      [['Portal', c.ok], ['Hepatic artery', c.artery], ['Bypassing the liver', c.rev]].forEach(([t, col], i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(10, 12 + i * 16, 4, 0, 7); ctx.fill(); ctx.fillStyle = c.muted; ctx.fillText(t, 20, 16 + i * 16); });
    }
    // operating point
    {
      const { ctx, w, h: hh } = fitCanvas(c2);
      ctx.clearRect(0, 0, w, hh);
      const L = 46, B = 30, T = 12, R = 14;
      const qL = m.hepaticFlow, dpL = f.P[NI.CONF] - f.P[NI.RHV];
      const healthy = store.get().healthy;
      const q0 = healthy ? healthy.metrics.hepaticFlow : 1.5, dp0 = healthy ? healthy.P[NI.CONF] - healthy.P[NI.RHV] : 3.7;
      const qMax = Math.max(2.2, qL * 1.3), pMax = Math.max(30, dpL * 1.3);
      const X = (q) => L + (q / qMax) * (w - L - R), Y = (p) => T + (1 - p / pMax) * (hh - T - B);
      ctx.fillStyle = c.faint; ctx.font = FONT(500, 11); ctx.lineWidth = 1;
      ctx.strokeStyle = c.border;
      for (let p = 10; p <= pMax; p += 10) { ctx.beginPath(); ctx.moveTo(L, Math.round(Y(p)) + 0.5); ctx.lineTo(w - R, Math.round(Y(p)) + 0.5); ctx.stroke(); }
      ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(L, Math.round(hh - B) + 0.5); ctx.lineTo(w - R, Math.round(hh - B) + 0.5); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText('Liver blood flow (L/min)', (L + w) / 2, hh - 6);
      ctx.save(); ctx.translate(12, (hh - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('ΔP portal → hepatic vein (mmHg)', 0, 0); ctx.restore();
      for (let p = 0; p <= pMax; p += 10) { ctx.textAlign = 'right'; ctx.fillText(String(p), L - 5, Y(p) + 4); }
      for (let q = 0; q <= qMax; q += 0.5) { ctx.textAlign = 'center'; ctx.fillText(q.toFixed(1), X(q), hh - B + 13); }
      const line = (slope, col, dash) => { ctx.strokeStyle = col; ctx.setLineDash(dash || []); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); const qe = Math.min(qMax, pMax / Math.max(slope, 1e-6)); ctx.lineTo(X(qe), Y(qe * slope)); ctx.stroke(); ctx.setLineDash([]); };
      line(dp0 / q0, c.faint, [5, 4]);
      if (qL > 0.01) line(dpL / qL, c.accent);
      ctx.fillStyle = c.faint; ctx.beginPath(); ctx.arc(X(q0), Y(dp0), 5, 0, 7); ctx.fill();
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(X(qL), Y(dpL), 6, 0, 7); ctx.fill();
      ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.font = FONT(600, 12);
      ctx.fillText(`Liver resistance ${fmt(dpL / Math.max(0.01, qL), 1)} WU`, L + 10, T + 14);
      ctx.fillStyle = c.muted; ctx.font = FONT(500, 11.5); ctx.fillText(`healthy ${fmt(dp0 / q0, 1)} WU (dashed)`, L + 10, T + 30);
    }
    el.querySelector('#perfStats').replaceChildren(
      h('dt', {}, 'Portal inflow'), h('dd', {}, `${fmt(m.portalIn, 2)} L/min`),
      h('dt', {}, 'Arterial inflow'), h('dd', {}, `${fmt(m.arterialIn, 2)} L/min`),
      h('dt', {}, 'HABR gain'), h('dd', {}, `×${fmt(m.habr, 2)}`),
      h('dt', {}, 'Splanchnic tone'), h('dd', {}, `×${fmt(m.splTone, 2)}`));
  }
  return { id: 'perfusion', label: 'Liver perfusion', el, update: draw };
}
