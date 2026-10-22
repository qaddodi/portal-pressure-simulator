// Deck visuals V16 (package E): a small Doppler trace in each summary row (cols: [..., 'wave']), so a Doppler summary reads as
// a sheet of patterns: pulsatile, flat, reversed, absent, a jet. Each row's trace is about two beats of its own velocity, drawn
// from the model at that row's state (the presenter's calculation worker, never the live model) and then held still.
//   wave: 'PV_TRUNK' on the slide names the vessel for every row; wave: 'RHV_IVC' on a row of `of` names its own.
// Drawn as the scanner shows it: flow toward the probe above the baseline in the Doppler's toward colour, away below it in its
// away colour; the hepatic veins and the IVC drain away from the probe, so their forward flow is below (doppler.js). No flow (an
// occlusive clot) is a flat line on the baseline. Every row shares one scale (waveMax, 50 cm/s unless the slide sets it), so a slow
// vein stays low and a stent's jet runs to the edge.

import { h, fmt } from './util.js?v=54c2d6673a';

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
let uid = 0;
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); el.append(...kids); return el; };
function draw(box, w, vessel, max) {
  const p = wavePath(w, vessel, max), id = 'pzeW' + ++uid;
  if (!p) { box.replaceChildren(h('span', { class: 'pze-wn' }, '—')); return; }
  const svg = sv('svg', { class: 'pze-wave', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    sv('defs', {}, sv('clipPath', { id: id + 'u' }, sv('rect', { x: 0, y: 0, width: W, height: MID })), sv('clipPath', { id: id + 'd' }, sv('rect', { x: 0, y: MID, width: W, height: MID }))),
    sv('line', { class: 'pze-wb', x1: 0, x2: W, y1: MID, y2: MID }),
    sv('path', { class: 'pze-wt', d: p.d, 'clip-path': `url(#${id}u)` }),
    sv('path', { class: 'pze-wa', d: p.d, 'clip-path': `url(#${id}d)` }));
  const none = Math.max(Math.abs(p.min), Math.abs(p.max)) < 1;
  box.replaceChildren(svg, h('span', { class: 'sr-only' }, none ? `No flow in the ${NAME[vessel] || vessel}` : `Doppler of the ${NAME[vessel] || vessel}: ${fmt(p.min, 0)} to ${fmt(p.max, 0)} cm/s, toward the probe positive`));
  box.title = none ? 'No flow' : `${fmt(p.min, 0)} to ${fmt(p.max, 0)} cm/s` + (p.over ? `, past the ${max} cm/s scale` : '');
  box.classList.add('pze-in');
}

export const waveColumn = {
  heading: 'Doppler',
  cut: 'About two beats of each row\'s own trace: flow toward the probe above the line, away below it; every row on one scale, 50 cm/s from the line to the edge unless the slide says otherwise',
  cell(r, ctx) {
    const s = ctx?.slide, vessel = waveVessel(entryOf(r, s, ctx), s), box = h('span', { class: 'pze-wbox' }), max = s?.waveMax > 0 ? s.waveMax : WAVE_MAX;
    const own = r.state?.extra?.wave?.[vessel];
    if (own) { draw(box, own, vessel, max); return h('td', { class: 'pze-wcell' }, box); }
    const snap = r.state?.snap;
    if (!snap || !ctx?.run) return h('td', { class: 'num' }, '—');
    box.append(h('span', { class: 'pze-wn' }, '…'));
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
