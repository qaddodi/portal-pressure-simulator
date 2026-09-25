// Dock charts (blueprint §9.2): pressure profile, scope, Sankey, perfusion + operating point.

import { NODES, EDGES } from '../engine/topology.js';
import { PROFILE_PATHS, SHORT } from './anatomy.js';
import { pressureColor } from './colormap.js';
import { store } from './store.js';
import { h, fmt, fitCanvas, cssVar, clamp } from './util.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const ARTERIAL = new Set(['AO', 'HA']);
const theme = () => ({
  text: cssVar('--text'), muted: cssVar('--text-muted'), faint: cssVar('--text-faint'), border: cssVar('--border'),
  surface: cssVar('--surface'), surface2: cssVar('--surface-2'), accent: cssVar('--accent'), danger: cssVar('--danger'),
  rev: cssVar('--flow-reversed'), ok: cssVar('--flow-normal'), artery: cssVar('--artery'), caution: cssVar('--caution'),
});

// ── Pressure profile ("hydraulic grade line") ────────
export function createProfile() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'profile' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure profile along the selected path' });
  box.append(cv);
  const sel = h('select', { class: 'select', 'aria-label': 'Path' }, PROFILE_PATHS.map((p) => h('option', { value: p.id }, p.label)));
  const legend = h('div', { class: 'legend-inline' },
    h('span', {}, h('i', { style: { background: 'var(--text)' } }), 'Now'),
    h('span', {}, h('i', { style: { background: 'var(--text-faint)' } }), 'Healthy'),
    h('span', { class: 'lg-compare', style: { display: 'none' } }, h('i', { style: { background: 'var(--info)' } }), 'Snapshot A'),
    h('span', { class: 'lg-pred', style: { display: 'none' } }, h('i', { style: { background: 'var(--accent)' } }), 'Your prediction'));
  const note = h('div', { class: 'ctl-sub' }, 'Each step down is a resistance: ΔP = Q × R. Plateaus are compartments.');
  const side = h('div', { class: 'chart-side' }, h('label', {}, 'Path'), sel, legend, note, h('div', { class: 'ctl-sub', id: 'profileOffscale' }));
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
    const L = 44, R = 12, T = 14, B = 40;
    const slot = (w - L - R) / stations.length;
    const vals = F ? stations.map((n) => F.P[NI[n]]) : [];
    const venous = vals.filter((_, i) => !ARTERIAL.has(stations[i]));
    const maxP = Math.max(30, ...venous.map((v) => v + 4));
    const y = (p) => T + (hh - T - B) * (1 - clamp(p, -2, maxP) / maxP);
    const x = (i) => L + slot * (i + 0.5);
    return { w, hh, stations, L, R, T, B, slot, maxP, x, y };
  }

  function draw() {
    if (!F) return;
    const c = theme();
    const { ctx } = fitCanvas(cv);
    const g = geometry();
    const { w, hh, stations, L, B, slot, maxP, x, y } = g;
    ctx.clearRect(0, 0, w, hh);
    ctx.font = '11px Inter, system-ui, sans-serif';
    // grid & thresholds
    ctx.strokeStyle = c.border; ctx.fillStyle = c.muted; ctx.lineWidth = 1;
    for (let p = 0; p <= maxP; p += 5) {
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(L, y(p)); ctx.lineTo(w - 12, y(p)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(String(p), L - 6, y(p) + 4);
    }
    ctx.save(); ctx.translate(12, (hh - B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('mmHg', 0, 0); ctx.restore();
    for (const [p, lab, dy] of [[10, 'CSPH 10', 11], [12, 'bleeding 12', -3], [20, '20', -3]]) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = p === 12 ? c.danger : c.faint; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(L, y(p)); ctx.lineTo(w - 12, y(p)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = p === 12 ? c.danger : c.faint; ctx.textAlign = 'right'; ctx.fillText(lab, w - 14, y(p) + dy);
    }
    // station labels
    ctx.fillStyle = c.muted; ctx.textAlign = 'center';
    stations.forEach((n, i) => {
      const lbl = SHORT[n] || n;
      ctx.save(); ctx.translate(x(i), hh - B + 14);
      if (slot < 70) { ctx.rotate(-0.35); ctx.textAlign = 'right'; ctx.translate(12, 0); }
      ctx.fillText(lbl, 0, 0); ctx.restore();
    });
    const series = (vals, color, width, dash, markers) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x0 = x(i) - slot * 0.32, x1 = x(i) + slot * 0.32;
        if (i === 0) ctx.moveTo(x0, y(v)); else ctx.lineTo(x0, y(v));
        ctx.lineTo(x1, y(v));
      });
      ctx.stroke(); ctx.setLineDash([]);
      if (markers) vals.forEach((v, i) => { ctx.fillStyle = pressureColor(v); ctx.fillRect(x(i) - slot * 0.32, y(v) - 3, slot * 0.64, 6); });
    };
    const st = store.get();
    const healthy = st.healthy;
    if (healthy) series(stations.map((n) => healthy.P[NI[n]]), c.faint, 1.5, [5, 4]);
    if (st.compareSnap?.P) { series(stations.map((n) => st.compareSnap.P[NI[n]]), cssVar('--info'), 1.8, [2, 3]); el.querySelector('.lg-compare').style.display = ''; }
    else el.querySelector('.lg-compare').style.display = 'none';
    const now = stations.map((n) => F.P[NI[n]]);
    series(now, c.text, 2.2, null, true);
    // ΔP labels on risers
    ctx.font = '600 10.5px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    for (let i = 0; i < now.length - 1; i++) {
      const dp = now[i] - now[i + 1];
      if (Math.abs(dp) < 0.5) continue;
      const xm = (x(i) + x(i + 1)) / 2;
      const ym = (y(now[i]) + y(now[i + 1])) / 2;
      ctx.fillStyle = dp < 0 ? c.rev : c.muted;
      ctx.fillText((dp > 0 ? '−' : '+') + Math.abs(dp).toFixed(1), xm + 3, ym + 4);
    }
    // off-scale arterial
    const off = stations.filter((n) => ARTERIAL.has(n)).map((n) => `${SHORT[n]} ${fmt(F.P[NI[n]], 0)} mmHg`);
    el.querySelector('#profileOffscale').textContent = off.length ? `Off scale: ${off.join(', ')}` : '';
    // prediction
    const lp = el.querySelector('.lg-pred');
    if (predict?.values?.size) {
      lp.style.display = '';
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; ctx.setLineDash([7, 4]);
      ctx.beginPath();
      let first = true;
      stations.forEach((n, i) => { const v = predict.values.get(n); if (v == null) return; if (first) { ctx.moveTo(x(i), y(v)); first = false; } else ctx.lineTo(x(i), y(v)); });
      ctx.stroke(); ctx.setLineDash([]);
      if (predict.reveal) {
        ctx.fillStyle = 'rgba(210,59,59,.18)';
        stations.forEach((n, i) => { const v = predict.values.get(n); if (v == null) return; ctx.fillRect(x(i) - 6, Math.min(y(v), y(now[i])), 12, Math.abs(y(v) - y(now[i]))); });
      }
    } else lp.style.display = 'none';
    if (predict?.on) {
      ctx.fillStyle = c.accent; ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Drag across the chart to draw your predicted pressures', L + 8, 26);
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
const TRACES = {
  CONF: { label: 'Portal vein', unit: 'mmHg', color: '#8E4FC4' },
  SIN_R: { label: 'Sinusoids (WHVP≈)', unit: 'mmHg', color: '#C0307A' },
  RHV: { label: 'Hepatic vein (FHVP)', unit: 'mmHg', color: '#2D6CDF' },
  RA: { label: 'Right atrium', unit: 'mmHg', color: '#1F9D74' },
  IVCS: { label: 'IVC', unit: 'mmHg', color: '#6A7FD8' },
  VAR: { label: 'Esophageal varix', unit: 'mmHg', color: '#D23B3B' },
  SV: { label: 'Splenic vein', unit: 'mmHg', color: '#9C6B8E' },
  SMV: { label: 'SMV', unit: 'mmHg', color: '#D99A1E' },
  AO: { label: 'Aorta', unit: 'mmHg', color: '#C2414B', scale: 'art' },
  pvVel: { label: 'PV velocity', unit: 'cm/s', color: '#19A7A0', scale: 'vel' },
  hvVel: { label: 'RHV velocity', unit: 'cm/s', color: '#F0782B', scale: 'vel' },
};
const TRENDS = {
  hvpg: { label: 'HVPG', unit: 'mmHg', color: '#C0307A', get: (m) => m.hvpg },
  pv: { label: 'Portal pressure', unit: 'mmHg', color: '#8E4FC4', get: (m) => m.pv },
  varix: { label: 'Varix diameter', unit: 'mm', color: '#D23B3B', get: (m) => m.varix.d },
  shunt: { label: 'Shunt fraction', unit: '%', color: '#F0782B', get: (m) => m.shuntFraction * 100 },
  ascites: { label: 'Ascites', unit: 'L', color: '#3E8FC0', get: (m) => m.ascites.volume / 1000 },
  spleen: { label: 'Spleen', unit: 'cm', color: '#9C6B8E', get: (m) => m.spleen.length },
  co: { label: 'Cardiac output', unit: 'L/min', color: '#1F9D74', get: (m) => m.co },
};

export function createScope() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'scope' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Time-series scope' });
  box.append(cv);
  const chosen = new Set(['CONF', 'SIN_R', 'RHV', 'RA']);
  const chosenTrend = new Set(['hvpg', 'varix', 'shunt', 'ascites']);
  let windowS = 20;
  const winSel = h('select', { class: 'select', 'aria-label': 'Window' }, [6, 20, 60].map((s) => h('option', { value: s, selected: s === 20 }, `${s} s window`)));
  winSel.addEventListener('change', () => { windowS = +winSel.value; });
  const boxes = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
  const side = h('div', { class: 'chart-side' }, h('label', {}, 'Traces'), winSel, boxes, h('div', { class: 'ctl-sub', id: 'scopeHint' }));
  el.append(box, side);
  const buf = { t: [] };
  const trend = { day: [] };
  let mode = 'hemo';

  function renderBoxes() {
    const src = mode === 'hemo' ? TRACES : TRENDS;
    const set = mode === 'hemo' ? chosen : chosenTrend;
    boxes.replaceChildren(...Object.entries(src).map(([k, t]) => {
      const cb = h('input', { type: 'checkbox', checked: set.has(k) });
      cb.addEventListener('change', () => { if (cb.checked) set.add(k); else set.delete(k); });
      return h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: '12.5px', color: 'var(--text)' } }, cb, h('i', { style: { width: '10px', height: '3px', background: t.color, display: 'inline-block' } }), `${t.label}`);
    }));
    winSel.style.display = mode === 'hemo' ? '' : 'none';
    el.querySelector('#scopeHint').textContent = mode === 'hemo' ? 'Enable Pulsatile mode (inspector) to see a, v waves and PV pulsatility.' : 'Disease clock: one point per simulated day.';
  }
  renderBoxes();

  function ingest(f) {
    const m = f.clock === 'disease' ? 'disease' : 'hemo';
    if (m !== mode) { mode = m; renderBoxes(); }
    if (f.samples) {
      const s = f.samples;
      for (let i = 0; i < s.t.length; i++) {
        buf.t.push(s.t[i]);
        for (const k of Object.keys(TRACES)) (buf[k] ||= []).push(s[k][i]);
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

  function draw() {
    const c = theme();
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const L = 44, R = 44, T = 10, B = 24;
    ctx.font = '11px Inter, system-ui, sans-serif';
    const isH = mode === 'hemo';
    const xs = isH ? buf.t : trend.day;
    if (xs.length < 2) { ctx.fillStyle = c.muted; ctx.fillText('Collecting…', L, 30); return; }
    const x1 = xs[xs.length - 1], x0 = isH ? x1 - windowS : Math.max(xs[0], x1 - 730);
    const keys = [...(isH ? chosen : chosenTrend)];
    const src = isH ? TRACES : TRENDS;
    const groups = {};
    for (const k of keys) {
      const g = src[k].scale || src[k].unit;
      const arr = isH ? buf[k] : trend[k];
      if (!arr) continue;
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < xs.length; i++) if (xs[i] >= x0) { mn = Math.min(mn, arr[i]); mx = Math.max(mx, arr[i]); }
      const G = (groups[g] ||= { mn: Infinity, mx: -Infinity, unit: src[k].unit });
      G.mn = Math.min(G.mn, mn); G.mx = Math.max(G.mx, mx);
    }
    const gKeys = Object.keys(groups);
    for (const g of gKeys) { const G = groups[g]; const pad = Math.max(1, (G.mx - G.mn) * 0.12); G.mn = Math.floor(G.mn - pad); G.mx = Math.ceil(G.mx + pad); if (G.unit === 'mmHg' && G.mn > 0 && g !== 'art') G.mn = 0; }
    const X = (t) => L + ((t - x0) / Math.max(1e-6, x1 - x0)) * (w - L - R);
    const Y = (v, G) => T + (hh - T - B) * (1 - (v - G.mn) / Math.max(1e-6, G.mx - G.mn));
    // axes
    ctx.strokeStyle = c.border; ctx.fillStyle = c.muted;
    const G0 = groups[gKeys[0]], G1 = groups[gKeys[1]];
    if (G0) for (let i = 0; i <= 4; i++) {
      const v = G0.mn + ((G0.mx - G0.mn) * i) / 4, yy = Y(v, G0);
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(fmt(v, 0), L - 6, yy + 4);
      if (G1) { const v1 = G1.mn + ((G1.mx - G1.mn) * i) / 4; ctx.textAlign = 'left'; ctx.fillText(fmt(v1, 0), w - R + 6, yy + 4); }
    }
    ctx.textAlign = 'left'; ctx.fillText(G0 ? G0.unit : '', 4, 12); if (G1) { ctx.textAlign = 'right'; ctx.fillText(G1.unit, w - 4, 12); }
    ctx.textAlign = 'center';
    const span = x1 - x0;
    const step = isH ? (span > 30 ? 10 : span > 10 ? 2 : 1) : span > 360 ? 90 : span > 120 ? 30 : 7;
    for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) { ctx.fillText(isH ? `${Math.round(t)} s` : `d${Math.round(t)}`, X(t), hh - 6); }
    for (const k of keys) {
      const arr = isH ? buf[k] : trend[k];
      if (!arr) continue;
      const G = groups[src[k].scale || src[k].unit];
      ctx.strokeStyle = src[k].color; ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < xs.length; i++) {
        if (xs[i] < x0) continue;
        const px = X(xs[i]), py = Y(arr[i], G);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  return { id: 'scope', label: 'Scope', el, update(f) { ingest(f); draw(); }, ingest, redraw: draw };
}

// ── Flow Sankey ─────────────────────────────────────
export function createSankey() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'flow' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Flow distribution' });
  box.append(cv);
  const side = h('div', { class: 'chart-side' }, h('label', {}, 'Where does gut blood go?'),
    h('div', { class: 'ctl-sub' }, 'Ribbon width ∝ flow. Orange = reversed (hepatofugal) flow. Portosystemic routes bypass the liver: that fraction is the shunt fraction.'),
    h('div', { id: 'sankeyStats', class: 'kv' }));
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
      ctx.fillStyle = color; ctx.fillRect(x - 6, y, 12, hb);
      ctx.fillStyle = c.text; ctx.font = '600 11.5px Inter, sans-serif'; ctx.textAlign = x > w / 2 ? 'right' : 'left';
      ctx.fillText(`${label}  ${fmt(v, 2)}`, x + (x > w / 2 ? -10 : 10), y + Math.min(hb / 2 + 4, hb + 12));
      blocks.push({ x, y, hb });
      return { x, y, hb, used: 0, usedIn: 0 };
    };
    const ribbon = (a, b, v, color) => {
      if (v <= 0.003) return;
      const t = v * scale;
      const y0 = a.y + a.used, y1 = b.y + b.usedIn;
      a.used += t; b.usedIn += t;
      ctx.fillStyle = color; ctx.globalAlpha = 0.38;
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
  const side = h('div', { class: 'chart-side' }, h('label', {}, 'Hepatic arterial buffer'), h('div', { class: 'ctl-sub' }, 'When portal inflow falls, adenosine accumulates and the hepatic artery dilates: liver perfusion falls less than portal flow.'), h('dl', { class: 'kv', id: 'perfStats' }));
  el.append(b1, b2, side);
  function draw(f) {
    const c = theme();
    const m = f.metrics;
    // donut
    {
      const { ctx, w, h: hh } = fitCanvas(c1);
      ctx.clearRect(0, 0, w, hh);
      const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 16, r = R * 0.62;
      const portal = m.portalIn, art = m.arterialIn, lost = Math.max(0, m.splanchnicIn - portal);
      const total = portal + art + lost || 1;
      let a = -Math.PI / 2;
      for (const [v, col] of [[portal, c.ok], [art, c.artery], [lost, c.rev]]) {
        const da = (v / total) * Math.PI * 2;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, R, a, a + da); ctx.arc(cx, cy, r, a + da, a, true); ctx.closePath(); ctx.fill();
        a += da;
      }
      ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.font = '800 24px JetBrains Mono, monospace';
      ctx.fillText(`${Math.round(m.liverPerfPct)}%`, cx, cy + 6);
      ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = c.muted; ctx.fillText('liver perfusion', cx, cy + 22);
      ctx.textAlign = 'left'; ctx.font = '11px Inter, sans-serif';
      [['Portal', c.ok], ['Hepatic artery', c.artery], ['Diverted to collaterals', c.rev]].forEach(([t, col], i) => { ctx.fillStyle = col; ctx.fillRect(8, 8 + i * 15, 9, 9); ctx.fillStyle = c.muted; ctx.fillText(t, 22, 16 + i * 15); });
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
      ctx.strokeStyle = c.border; ctx.fillStyle = c.muted; ctx.font = '11px Inter, sans-serif';
      ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, hh - B); ctx.lineTo(w - R, hh - B); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText('Liver blood flow (L/min)', (L + w) / 2, hh - 6);
      ctx.save(); ctx.translate(12, (hh - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('ΔP portal → hepatic vein (mmHg)', 0, 0); ctx.restore();
      for (let p = 0; p <= pMax; p += 10) { ctx.textAlign = 'right'; ctx.fillText(String(p), L - 5, Y(p) + 4); }
      for (let q = 0; q <= qMax; q += 0.5) { ctx.textAlign = 'center'; ctx.fillText(q.toFixed(1), X(q), hh - B + 13); }
      const line = (slope, col, dash) => { ctx.strokeStyle = col; ctx.setLineDash(dash || []); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); const qe = Math.min(qMax, pMax / Math.max(slope, 1e-6)); ctx.lineTo(X(qe), Y(qe * slope)); ctx.stroke(); ctx.setLineDash([]); };
      line(dp0 / q0, c.faint, [5, 4]);
      if (qL > 0.01) line(dpL / qL, c.accent);
      ctx.fillStyle = c.faint; ctx.beginPath(); ctx.arc(X(q0), Y(dp0), 5, 0, 7); ctx.fill();
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(X(qL), Y(dpL), 6, 0, 7); ctx.fill();
      ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.font = '600 11.5px Inter, sans-serif';
      ctx.fillText(`R liver = ${fmt(dpL / Math.max(0.01, qL), 1)} WU (healthy ${fmt(dp0 / q0, 1)})`, L + 10, T + 14);
    }
    el.querySelector('#perfStats').replaceChildren(
      h('dt', {}, 'Portal inflow'), h('dd', {}, `${fmt(m.portalIn, 2)} L/min`),
      h('dt', {}, 'Arterial inflow'), h('dd', {}, `${fmt(m.arterialIn, 2)} L/min`),
      h('dt', {}, 'HABR gain'), h('dd', {}, `×${fmt(m.habr, 2)}`),
      h('dt', {}, 'Splanchnic tone'), h('dd', {}, `×${fmt(m.splTone, 2)}`));
  }
  return { id: 'perfusion', label: 'Liver perfusion', el, update: draw };
}
