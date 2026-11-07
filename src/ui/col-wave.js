// Deck visuals V16 (package E): a small Doppler trace in each summary row (cols: [..., 'wave']), so a Doppler summary reads as
// a sheet of patterns: pulsatile, flat, reversed, absent, a jet. Each row's trace is about two beats of its own velocity, drawn
// from the model at that row's state (the presenter's calculation worker, never the live model) and then held still.
//   wave: 'PV_TRUNK' on the slide names the vessel for every row; wave: 'RHV_IVC' on a row of `of` names its own.
// Drawn as the scanner shows it: flow toward the probe above the baseline in the Doppler's toward colour, away below it in its
// away colour; the hepatic veins and the IVC drain away from the probe, so their forward flow is below (doppler.js). No flow (an
// occlusive clot) is a flat line on the baseline. Every row shares one scale (waveMax, 50 cm/s unless the slide sets it), so a slow
// vein stays low and a stent's jet runs to the edge.

import { h, fmt, cssVar } from './util.js';
import { createTraceGL, fitPen } from './trace-gl.js';
import { cssColor } from './css-color.js';
import { onTheme } from './theme-epoch.js';

const AWAY = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA']);
const NAME = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SMV_CONF: 'superior mesenteric vein', SV_CONF: 'splenic vein',
  RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'IVC', A_HEP: 'hepatic artery', TIPS: 'stent' };
export const WAVE_SECS = 2, WAVE_MAX = 50;
const W = 120, H = 36, MID = H / 2, PAD = 3;

/** The trace's points in the cell's units and its range: { d: path, peak, min, max } from { t: [s], v: [cm/s] }; the sign as the
 *  scanner shows it (away vessels flipped). Every row is drawn on one scale, max cm/s from the line to the edge (50 by default,
 *  the slide's waveMax otherwise), so a slow vein stays low and a jet runs off the top (held at the edge). A missing trace is null. */
export function wavePath(w, vessel, max = WAVE_MAX) {
  if (!w?.t?.length || w.t.length !== w.v?.length) return null;
  const sign = AWAY.has(vessel) ? -1 : 1, t1 = w.t[w.t.length - 1] || 1, top = MID - 1;
  const k = (MID - PAD) / max;
  const d = w.v.map((v, i) => `${i ? 'L' : 'M'}${(w.t[i] / t1 * W).toFixed(1)} ${(MID - Math.max(-top, Math.min(top, sign * v * k))).toFixed(1)}`).join('');
  return { d, peak: Math.max(...w.v.map((v) => Math.abs(v))), min: Math.min(...w.v.map((v) => sign * v)), max: Math.max(...w.v.map((v) => sign * v)), over: Math.max(...w.v.map((v) => Math.abs(v))) * k > top };
}
/** The vessel a row's trace is of: the row's own, the slide's, or the main portal vein. */
export const waveVessel = (row, s) => (typeof row?.wave === 'string' ? row.wave : typeof s?.wave === 'string' ? s.wave : 'PV_TRUNK');
/** The `of` entry a table row came from (the slide's row objects carry their own fields): by its slide's state, else its name. */
export function entryOf(r, s, ctx) {
  for (const o of s?.of || []) {
    if (!o || typeof o !== 'object') continue;
    if (o.id ? ctx?.fpOf?.(o.id) === r.f && (o.name ? o.name === r.name : true) : (o.name || o.title || '') === r.name) return o;
  }
  return null;
}

// Each state's traces, worked out once: snapshot → vessel → promise of the trace.
const made = new WeakMap();
let queue = Promise.resolve();
function traceOf(snap, vessel, ctx) {
  let m = made.get(snap);
  if (!m) made.set(snap, (m = new Map()));
  if (!m.has(vessel)) {
    // (One at a time, after the slides themselves: the worker runs each request in turn anyway.)
    const p = queue.then(() => ctx.run([{ wave: { vessel, secs: WAVE_SECS } }], snap)).then((out) => out?.[0]?.extra?.wave?.[vessel] ?? null, () => null);
    queue = p.then(() => {}, () => {});
    m.set(vessel, p);
    p.then((w) => { if (!w) m.delete(vessel); });   // (a failed run is tried again the next time the table is drawn)
  }
  return m.get(vessel);
}
// (2 Nov 2026: drawn on the GPU, in the charts' one shared context (trace-gl.js), not as an SVG the browser paints: the line in the
// Doppler's colours, toward above the baseline and away below it, 2 px with round joins, the baseline 1 px, as the SVG drew them.
// It is drawn again when the cell has its size, when the theme changes and when the GPU can draw again.)
/** The trace's points in the cell's px, from its samples (as wavePath, at w x h). */
export function wavePts(w, vessel, max, cw, ch) {
  const sign = AWAY.has(vessel) ? -1 : 1, t1 = w.t[w.t.length - 1] || 1, top = MID - 1, k = (MID - PAD) / max;
  return w.v.map((v, i) => [(w.t[i] / t1) * cw, ((MID - Math.max(-top, Math.min(top, sign * v * k))) / H) * ch]);
}
const live = new Set();   // (the cells drawn now: drawn again on a theme change, let go once off the page)
const rgba = (c) => { const [r, g, b, a] = cssColor(c); return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`; };   // alloc-rare: a pen colour, made only when the tokens it comes from read differently (a theme change; the guards in paintWave), not on a repaint
const mixChan = (x, y, p, q, al, i) => (al > 0 ? (x[i] * x[3] * p + y[i] * y[3] * q) / al : 0);
function mixed(a, b, p) {   // (color-mix in srgb: p of a, the rest b)
  const x = cssColor(a), y = cssColor(b), q = 1 - p, al = x[3] * p + y[3] * q;
  return `rgba(${Math.round(mixChan(x, y, p, q, al, 0) * 255)}, ${Math.round(mixChan(x, y, p, q, al, 1) * 255)}, ${Math.round(mixChan(x, y, p, q, al, 2) * 255)}, ${al})`;   // alloc-rare: a pen colour, made only when the tokens it comes from read differently (a theme change; the guards in paintWave), not on a repaint
}
// The pen colours, each made again only when the tokens it comes from read differently (a theme change), not on every repaint.
let tokBase = null, tokToward = null, tokAway = null, tokText = null;   // (null: not made yet, even for a token still reading '')
let penBase = '', penToward = '', penAway = '';
// The trace in one colour over the half of the cell from y0 to y1: the points as wavePts gives them, drawn without making the list.
function strokeHalf(ctx, c, y0, y1, w, hh, col) {
  const sign = AWAY.has(c.vessel) ? -1 : 1, tv = c.w.t, vv = c.w.v, t1 = tv[tv.length - 1] || 1, top = MID - 1, k = (MID - PAD) / c.max;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y0, w, y1 - y0); ctx.clip(); ctx.strokeStyle = col;
  ctx.beginPath();
  for (let i = 0; i < vv.length; i++) {
    const x = (tv[i] / t1) * w, y = ((MID - Math.max(-top, Math.min(top, sign * vv[i] * k))) / H) * hh;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}
function paintWave(c) {
  if (!c.cv.isConnected) return;
  const pen = fitPen(c.cv, c.gpu), { ctx, w, h: hh } = pen;
  try {
    ctx.clearRect(0, 0, w, hh);
    if (!(w > 0 && hh > 0)) return;
    const mid = (MID / H) * hh;
    const base = cssVar('--text-3'), toward = cssVar('--dop-toward'), away = cssVar('--dop-away'), text = cssVar('--text');
    if (base !== tokBase) { tokBase = base; penBase = rgba(base); }
    if (toward !== tokToward) { tokToward = toward; penToward = rgba(toward); }
    if (away !== tokAway || text !== tokText) { tokAway = away; tokText = text; penAway = mixed(away, text, 0.6); }   // (the away blue lifted toward the text colour, 60 %, so it reads on a dark card too)
    ctx.lineWidth = 1; ctx.strokeStyle = penBase;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    strokeHalf(ctx, c, 0, mid, w, hh, penToward);
    strokeHalf(ctx, c, mid, hh, w, hh, penAway);
  } finally { ctx.end?.(); }
}
function repaintAll() { for (const c of live) { if (c.cv.isConnected) paintWave(c); else { c.gpu?.dispose(); live.delete(c); } } }
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  onTheme(() => { if (live.size) repaintAll(); });   // (the theme epoch, theme-epoch.js: the same frame as every other surface)
}
function draw(box, w, vessel, max) {
  const p = wavePath(w, vessel, max);
  if (!p) { box.replaceChildren(h('span', { class: 'pze-wn' }, '—')); return; }
  for (const c of live) if (!c.cv.isConnected) { c.gpu?.dispose(); live.delete(c); }   // (cells of a table no longer shown)
  const cv = h('canvas', { class: 'pze-wave', 'aria-hidden': 'true' });
  const none = Math.max(Math.abs(p.min), Math.abs(p.max)) < 1;
  box.replaceChildren(cv, h('span', { class: 'sr-only' }, none ? `No flow in the ${NAME[vessel] || vessel}` : `Doppler of the ${NAME[vessel] || vessel}: ${fmt(p.min, 0)} to ${fmt(p.max, 0)} cm/s, toward the probe positive`));
  const c = { cv, w, vessel, max, gpu: null };
  c.gpu = createTraceGL(cv, { redraw: () => paintWave(c) });
  live.add(c);
  paintWave(c);
  box.title = none ? 'No flow' : `${fmt(p.min, 0)} to ${fmt(p.max, 0)} cm/s` + (p.over ? `, past the ${max} cm/s scale` : '');
  box.classList.add('pze-in');
}

export const waveColumn = {
  heading: 'Doppler',
  // A row whose patient is not computed yet: the cell as tall as the trace will be, so the table does not grow when it is drawn.
  pend: () => h('td', { class: 'num pend pze-wcell', 'aria-busy': 'true' }, h('span', { class: 'pze-wbox' }), h('span', { class: 'sr-only' }, 'calculating')),
  cut: 'About two beats of each row\'s own trace: flow toward the probe above the line, away below it; every row on one scale, 50 cm/s from the line to the edge unless the slide says otherwise',
  cell(r, ctx) {
    const s = ctx?.slide, vessel = waveVessel(entryOf(r, s, ctx), s), box = h('span', { class: 'pze-wbox' }), max = s?.waveMax > 0 ? s.waveMax : WAVE_MAX;
    const own = r.state?.extra?.wave?.[vessel];
    if (own) { draw(box, own, vessel, max); return h('td', { class: 'pze-wcell' }, box); }
    const snap = r.state?.snap;
    if (!snap || !ctx?.run) return h('td', { class: 'num' }, '—');
    box.append(h('span', { class: 'sr-only' }, 'drawing the trace'));   // (empty until it is drawn, never "…": the trace fades in)
    // (A run that failed is tried again a few times; the cell may still be waiting to go up, so it is drawn either way.)
    let n = 0;
    const get = () => traceOf(snap, vessel, ctx).then((w) => {
      if (!w && n++ < 20) { setTimeout(get, 500); return; }
      draw(box, w, vessel, max);
    });
    get();
    return h('td', { class: 'pze-wcell' }, box);
  },
};
