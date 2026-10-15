// Slide instruments for the Presenter: a slide's `tool` field (decks.js) puts one of the app's instruments in
// the data card, beside the figure, reading the live model while the slide is up.
//
//   tool: { kind: 'doppler', vessel: 'PV_TRUNK' }   spectral Doppler in one vessel (doppler.js PROBES ids); waves: true names
//                                                   a hepatic vein's a, S, v and D waves on the trace
//   tool: { kind: 'scope' }                         the esophagus at this slide's varix state (endoscopy)
//   tool: { kind: 'fibroscan' }                     liver stiffness, kPa (metrics.lsm)
//   tool: { kind: 'trace', range: 'talk' | 'beats' }
//                                                   'talk' (default): portal, wedged and free hepatic pressures and the
//                                                   HVPG at every slide so far, one point per state; 'beats': the live trace
//   tool: { kind: 'abdomen' }                       the belly with its ascites and collaterals
//   tool: { kind: 'wall' }                          the varix in cross-section, Laplace's T, r and w (the scope's Wall mechanics)
//   tool: { kind: 'flowtime' }                      portal pressure and portal flow around a meal, the slide's time-lapse on a
//                                                   teaching clock in minutes (flow-time.js), drawn as it plays
//   tool: { kind: 'flowtime', clock: 'days', lines: [lower, upper] }
//                                                   the same chart over a disease time-lapse: two fingerprint keys
//                                                   (flow-time.js LINE), one point a model day, drawn as it plays
//
// Optional on any kind: title (the card's heading, in place of the kind's own). A slide may carry both data and tool:
// the tool sits above the tiles. In quiz mode a tool with a reading (Doppler, FibroScan, the scope's grade) keeps it
// covered until the answer. Each instrument is made once per presentation and kept, so a trace that keeps recording
// (Doppler) carries on from slide to slide while the patient stays the same.

import { store } from './store.js?v=bb8c70114d';
import { h, fmt, clamp } from './util.js?v=abb277f29f';
import { traceLabel, traceLabelRoom } from './trace-labels.js?v=fc916a95c6';
import { EDGES } from '../engine/topology.js?v=1825cbda55';
import { createDoppler } from './doppler.js?v=bbcc8378cf';
import { createFibroScan } from './fibroscan.js?v=db718cea49';
import { createPressureTime } from './pressure-time.js?v=25f419d574';
import { createFlowTime } from './flow-time.js?v=109a17e443';
import { createEndoscopy, createAbdomen, createVarixWall } from './instruments.js?v=53b854d939';
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('presenter-tools');

const VESSEL = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', SV_MID: 'splenic vein', V_SPL: 'splenic vein, at the hilum',
  SMV_CONF: 'superior mesenteric vein', RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'inferior vena cava',
  A_HEP: 'hepatic artery', TIPS: 'the TIPS', C3: 'paraumbilical vein' };
const TITLE = {
  doppler: (t) => `Doppler, ${VESSEL[t.vessel || 'PV_TRUNK'] || EDGES.find((e) => e.id === t.vessel)?.label?.toLowerCase() || 'portal vein'}`,
  scope: () => 'Endoscopy, the lower esophagus',
  fibroscan: () => 'Liver stiffness, FibroScan',
  trace: (t) => (t.range === 'beats' ? 'Pressure, beat by beat' : 'Pressure over the talk'),
  abdomen: () => 'The abdomen',
  wall: () => 'The varix wall, in cross-section',
  flowtime: () => 'Portal pressure and flow over time',
};
const READS = new Set(['doppler', 'fibroscan', 'scope']);
const noop = () => {};

export function createTools({ host, stage }) {
  const ghostEl = h('div', { class: 'pz-ghost', 'aria-live': 'polite' });
  const box = h('div', { class: 'pz-tool' });
  // A chart drawn in its own units (a viewBox) shrinks its letters with the card: its smallest words (13 units) are kept
  // 12 px or more on the screen, the chart's letters all grown by the same factor (--svk), up to twice.
  const svk = () => { for (const sv of box.querySelectorAll('svg[viewBox]')) { const w = +sv.getAttribute('viewBox').split(/[\s,]+/)[2], r = sv.getBoundingClientRect().width;
    if (!w || !r) continue; const k = Math.min(2, Math.max(1, 12 / (13 * r / w))); if (Math.abs(k - (+sv.style.getPropertyValue('--svk') || 1)) > 0.02) sv.style.setProperty('--svk', k.toFixed(2)); } };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => nextFrame(svk)).observe(box);
  const made = {};
  let cur = null, kind = null, probe0, gate0, lastSt = null, lastSlide = null;
  function make(k) {
    if (made[k]) return made[k];
    const inst = k === 'doppler' ? createDoppler({ onProbe: noop }) : k === 'fibroscan' ? createFibroScan() : k === 'scope' ? createEndoscopy({ onAction: noop })
      : k === 'abdomen' ? createAbdomen({ onAction: noop }) : k === 'wall' ? createVarixWall() : k === 'beats' ? createPressureTime() : k === 'talk' ? talkTrace() : k === 'flowtime' ? createFlowTime() : null;
    if (inst) { inst.el.classList.remove('dock-pane'); inst.el.classList.add('pz-inst'); }
    return (made[k] = inst);
  }
  const keyOf = (t) => (t.kind === 'trace' ? (t.range === 'beats' ? 'beats' : 'talk') : t.kind);
  const offFrame = store.on('frame', (f) => {
    if (!cur || !f || !box.isConnected) return;
    if (kind === 'doppler' && cur.ingest) { cur.update(f); return; }
    if (kind !== 'talk' && kind !== 'flowtime') cur.update(f);
  });
  return {
    el: box,
    title: (t) => t.title || TITLE[t.kind]?.(t) || '',
    sig: (t) => (t ? `${keyOf(t)}:${t.vessel || ''}` : ''),
    /** Put the slide's tool in the box. stateKey: the slide's model state (a new one clears a recording trace);
     *  chain: for the talk trace, [{ n, title, fp }] of every state up to this slide.
     *  trail, reveal: for the flow-time chart, its series and how far along to draw it (see progress). */
    show(t, { slide = null, quiz = false, stateKey = null, chain = [], trail = null, reveal = 1 } = {}) {
      const k = keyOf(t), inst = make(k);
      if (!inst) { this.hide(); return; }
      if (k !== 'doppler') stage?.pinDoppler?.(null);
      stage?.setScanProbe?.(k === 'fibroscan', { covered: quiz && READS.has(t.kind) });   // (the probe on the skin over the liver, where the reading comes from)
      if (k === 'doppler') {
        if (probe0 === undefined) { probe0 = store.get().frame?.probe ?? null; gate0 = store.get().dopGate; }
        host.send({ type: 'probe', id: t.vessel || 'PV_TRUNK' });
        // (On a stent, the slide's gate: proximal, mid, distal, or 'site', the third that holds its narrowing.)
        if (store.get().dopGate !== (t.gate || 'mid')) store.set({ dopGate: t.gate || 'mid' });
        stage?.pinDoppler?.(t.vessel || 'PV_TRUNK');
      }
      inst.setWaves?.(!!t.waves);
      if (cur !== inst || slide !== lastSlide) inst.autoWindow?.();   // (a new slide chooses its Doppler window again from the width it is drawn at)
      lastSlide = slide;
      if (stateKey !== lastSt && (k === 'doppler' || k === 'beats')) inst.clear?.();
      lastSt = stateKey;
      if (cur !== inst) box.replaceChildren(inst.el, ghostEl);
      cur = inst; kind = k;
      box.dataset.kind = k;
      box.classList.toggle('ask', quiz && READS.has(t.kind));
      if (k === 'talk') inst.set(chain);
      else if (k === 'flowtime') inst.set(trail, reveal, { clock: t.clock, lines: t.lines });
      else { const f = store.get().frame; if (f) nextFrame(() => cur === inst && inst.update(f)); }
    },
    /** The flow-time chart drawn up to k (0 to 1) of its time-lapse, with its series (trail) once it is computed. */
    /** The numbers the slide's tiles and words show (a fingerprint): a reading instrument shows the same, not the beat-to-beat live value. */
    pin(fp) { for (const inst of Object.values(made)) inst?.pin?.(fp); },
    progress(k, trail) { if (kind === 'flowtime') cur.set(trail, k); },
    /** The earlier reading, faint beside the live one ({ label, value }), or null. Eases in and out. */
    ghost(g) {
      ghostEl.classList.toggle('on', !!g);
      if (g) ghostEl.replaceChildren(h('span', {}, g.label), h('b', {}, g.value));
    },
    hide() { stage?.pinDoppler?.(null); stage?.setScanProbe?.(false); cur = null; kind = null; lastSlide = null; delete box.dataset.kind; },
    /** The presentation is over: the Doppler goes back to the vessel it had. */
    dispose() {
      if (probe0 !== undefined) { host.send({ type: 'probe', id: probe0 }); store.set({ dopGate: gate0 || 'mid' }); } probe0 = undefined; lastSt = null; lastSlide = null; this.hide();
      // Each presentation builds its own tools: let go of this one's instruments (and the endoscopy's GL context).
      offFrame();
      for (const k of Object.keys(made)) { made[k]?.dispose?.(); delete made[k]; }
      box.replaceChildren();
    },
  };
}

// ── The talk so far: PV, WHVP and FHVP at each state, the HVPG in its own lane with its cut-offs ──
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const LINES = [['pv', 'PV', '--tr-pv'], ['whvp', 'WHVP', '--tr-wedge'], ['fhvp', 'FHVP', '--tr-hv']];
function talkTrace() {
  // Drawn at the card's own pixels (one unit a CSS pixel) and its one small size, so the words never scale with the card:
  // the card's fit sets the chart's height (styles/app.css .pz-talk) and only the plot gets shorter.
  const el = h('div', { class: 'pz-talk' });
  let chain0 = null, size = '';
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (chain0 && `${el.clientWidth}x${el.clientHeight}` !== size) draw(chain0, false); }) : null;
  ro?.observe(el);
  function set(chain) { chain0 = chain; draw(chain, true); }
  function draw(chain, fade) {
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = parseFloat(getComputedStyle(el).fontSize) || 12, L = Math.ceil(3.3 * fs) + 8;
    size = `${W}x${HT}`;
    const pts = chain.filter((c) => c.fp);
    // Over each line: what happened there, at 45° along the top (the chart makes room); under it, its time point.
    const vfs = 1.5 * fs, right = Math.ceil(Math.max(4 * 0.68 * fs, 4 * 0.6 * vfs)) + 14;
    const { R, pad } = traceLabelRoom(pts.map((p) => p.tick), { W, L, right, cw: 0.6 * fs });
    const T = pad + fs + 18, B2 = HT - fs - 12, T2 = B2 - Math.max(28, 0.2 * (B2 - T)), B1 = Math.max(T + 30, T2 - fs - 26);
    const n = Math.max(pts.length, 2), X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : i / (n - 1));
    const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
    const pMax = Math.ceil(top / 10) * 10, Y = (v) => B1 - (B1 - T) * clamp(v, 0, pMax) / pMax;
    const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y2 = (v) => B2 - (B2 - T2) * clamp(v, 0, gMax) / gMax;
    const path = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${f(p).toFixed(1)}`).join('');
    const sev = (v) => (v >= 10 ? 'hi' : v >= 5 ? 'mid' : 'ok');
    const last = pts.length - 1;
    // (Gridlines every 10 mmHg, or every 20 when the plot is short; the HVPG lane names 0 and its 10 mmHg cut-off only when short.)
    const gStep = (B1 - T) / (pMax / 10) < 1.4 * fs ? 20 : 10, hTicks = (B2 - T2) / gMax * 5 < 1.2 * fs ? [0, 10] : [0, 5, 10];
    // The line names at the right end, top to bottom, never touching.
    const ends = pts.length ? LINES.map(([k, a, c]) => [a, c, Y(pts[last].fp[k])]).sort((p, q) => p[2] - q[2]) : [];
    ends.forEach((e, k) => { if (k) e[2] = Math.max(e[2], ends[k - 1][2] + 1.25 * fs); });
    // A time point is named under its line where it has room: the last always, an earlier one only clear of its neighbours.
    const whenW = (p) => (p.when || String(p.n)).length * 0.6 * fs, named = new Set();
    for (let i = last, edge = Infinity; i >= 0; i--) {
      const half = whenW(pts[i]) / 2;
      if (X(i) + half + 8 <= edge && X(i) - half >= 0 && !(i < last && pts[i].when && pts[i].when === pts[i + 1]?.when)) { named.add(i); edge = X(i) - half; }
    }
    const svg = sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${fmt(p.fp.pv, 0)}, HVPG ${fmt(p.fp.hvpg, 1)}`).join('; ') },
      Array.from({ length: pMax / gStep + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(k * gStep), y2: Y(k * gStep) }), sv('text', { x: L - 8, y: Y(k * gStep) + 0.35 * fs, 'text-anchor': 'end' }, String(k * gStep)))),
      // The unit sits once at the top of each axis, above its numbers; the top lane needs no name, the HVPG lane keeps its own (nothing wedged under the event labels).
      sv('text', { class: 'ptk-unit', x: L - 8, y: T - 8, 'text-anchor': 'end' }, 'mmHg'),
      sv('text', { class: 'ptk-ax', x: L, y: T2 - 8 }, 'HVPG'), sv('text', { class: 'ptk-unit', x: L - 8, y: T2 - 8, 'text-anchor': 'end' }, 'mmHg'),
      hTicks.map((v) => sv('g', { class: 'ptk-grid' + (v ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { x1: L, x2: R, y1: Y2(v), y2: Y2(v) }), sv('text', { x: L - 8, y: Y2(v) + 0.35 * fs, 'text-anchor': 'end' }, String(v)))),
      // A line at each time point, with when and what happened.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('title', {}, `${p.when || `Slide ${p.n}`}: ${p.title}`),
        sv('line', { x1: X(i), x2: X(i), y1: T - fs - 8, y2: B2 + 4 }), named.has(i) ? sv('text', { x: X(i), y: B2 + fs + 6, 'text-anchor': 'middle' }, p.when || String(p.n)) : null,
        p.tick ? sv('text', { class: 'ptk-ev', x: X(i) + 3, y: T - fs - 12, 'text-anchor': 'start', transform: `rotate(-45 ${X(i) + 3} ${T - fs - 12})` }, traceLabel(p.tick)) : null)),
      LINES.map(([k, , c]) => sv('path', { class: 'ptk-line', style: `stroke: var(${c})`, d: path((p) => Y(p.fp[k])) })),
      ends.map(([a, c, y]) => sv('text', { class: 'ptk-lbl', x: R + 8, y: y + 0.35 * fs, style: `fill: var(${c})` }, a)),
      sv('path', { class: 'ptk-line hv', d: path((p) => Y2(p.fp.hvpg)) }),
      pts.map((p, i) => sv('circle', { class: 'ptk-pt', 'data-rate': sev(p.fp.hvpg), cx: X(i), cy: Y2(p.fp.hvpg), r: i === last ? 6 : 4 })),
      pts.length ? sv('text', { class: 'ptk-v', 'data-rate': sev(pts[last].fp.hvpg), x: R + 8, y: Y2(pts[last].fp.hvpg) + 0.35 * vfs }, fmt(pts[last].fp.hvpg, 1)) : null);
    // The new chart fades in over the old one, which then goes (never a jump); a new size just redraws.
    const old = [...el.children];
    if (!fade) { el.replaceChildren(svg); return; }
    svg.classList.add('in');
    el.append(svg);
    nextFrame(() => nextFrame(() => svg.classList.remove('in')));
    setTimeout(() => old.forEach((o) => o.remove()), 480);
  }
  return { el, set, update() {}, clear() {} };
}
