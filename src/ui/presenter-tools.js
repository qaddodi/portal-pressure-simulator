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

import { store } from './store.js?v=7c63421fac';
import { h, fmt, clamp } from './util.js?v=9279d972cf';
import { EDGES } from '../engine/topology.js?v=34e377149b';
import { createDoppler } from './doppler.js?v=a82d32cbea';
import { createFibroScan } from './fibroscan.js?v=129d419569';
import { createPressureTime } from './pressure-time.js?v=94f65f3e6e';
import { createFlowTime } from './flow-time.js?v=9327f117b5';
import { createEndoscopy, createAbdomen, createVarixWall } from './instruments.js?v=c44c2714c3';
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('presenter-tools');

const VESSEL = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', V_SPL: 'splenic vein, at the hilum',
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
  // 11.5 px or more on the screen, the chart's letters all grown by the same factor (--svk), up to half again.
  const svk = () => { for (const sv of box.querySelectorAll('svg[viewBox]')) { const w = +sv.getAttribute('viewBox').split(/[\s,]+/)[2], r = sv.getBoundingClientRect().width;
    if (!w || !r) continue; const k = Math.min(1.5, Math.max(1, 11.5 / (13 * r / w))); if (Math.abs(k - (+sv.style.getPropertyValue('--svk') || 1)) > 0.02) sv.style.setProperty('--svk', k.toFixed(2)); } };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => nextFrame(svk)).observe(box);
  const made = {};
  let cur = null, kind = null, probe0, lastSt = null;
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
    show(t, { quiz = false, stateKey = null, chain = [], trail = null, reveal = 1 } = {}) {
      const k = keyOf(t), inst = make(k);
      if (!inst) { this.hide(); return; }
      if (k !== 'doppler') stage?.pinDoppler?.(null);
      stage?.setScanProbe?.(k === 'fibroscan', { covered: quiz && READS.has(t.kind) });   // (the probe on the skin over the liver, where the reading comes from)
      if (k === 'doppler') {
        if (probe0 === undefined) probe0 = store.get().frame?.probe ?? null;
        host.send({ type: 'probe', id: t.vessel || 'PV_TRUNK' });
        stage?.pinDoppler?.(t.vessel || 'PV_TRUNK');
      }
      inst.setWaves?.(!!t.waves);
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
    progress(k, trail) { if (kind === 'flowtime') cur.set(trail, k); },
    /** The earlier reading, faint beside the live one ({ label, value }), or null. Eases in and out. */
    ghost(g) {
      ghostEl.classList.toggle('on', !!g);
      if (g) ghostEl.replaceChildren(h('span', {}, g.label), h('b', {}, g.value));
    },
    hide() { stage?.pinDoppler?.(null); stage?.setScanProbe?.(false); cur = null; kind = null; delete box.dataset.kind; },
    /** The presentation is over: the Doppler goes back to the vessel it had. */
    dispose() {
      if (probe0 !== undefined) host.send({ type: 'probe', id: probe0 }); probe0 = undefined; lastSt = null; this.hide();
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
  const W = 520, L = 46, R = W - 64, T = 34, B1 = 220, T2 = 270, B2 = 362, E = B2 + 42;
  const el = h('div', { class: 'pz-talk' });
  function set(chain) {
    const pts = chain.filter((c) => c.fp);
    // Under each line: its time point, then what happened there, written up the line (never crowding its neighbours).
    const H = E + 8 + Math.max(4, ...pts.map((p) => (p.tick || '').length)) * 9;
    const n = Math.max(pts.length, 2), X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : i / (n - 1));
    const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
    const pMax = Math.ceil(top / 10) * 10, Y = (v) => B1 - (B1 - T) * clamp(v, 0, pMax) / pMax;
    const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y2 = (v) => B2 - (B2 - T2) * clamp(v, 0, gMax) / gMax;
    const path = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${f(p).toFixed(1)}`).join('');
    const sev = (v) => (v >= 10 ? 'hi' : v >= 5 ? 'mid' : 'ok');
    const last = pts.length - 1;
    // The line names at the right end, top to bottom, at least 17 px apart.
    const ends = pts.length ? LINES.map(([k, a, c]) => [a, c, Y(pts[last].fp[k])]).sort((p, q) => p[2] - q[2]) : [];
    ends.forEach((e, k) => { if (k) e[2] = Math.max(e[2], ends[k - 1][2] + 17); });
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${fmt(p.fp.pv, 0)}, HVPG ${fmt(p.fp.hvpg, 1)}`).join('; ') },
      // Pressure lanes: gridlines every 10 mmHg.
      Array.from({ length: pMax / 10 + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(k * 10), y2: Y(k * 10) }), sv('text', { x: L - 8, y: Y(k * 10) + 4, 'text-anchor': 'end' }, String(k * 10)))),
      sv('text', { class: 'ptk-ax', x: L, y: T - 20 }, 'Pressure, mmHg'),
      // HVPG lane: the 5 and 10 mmHg cut-offs.
      sv('text', { class: 'ptk-ax', x: L, y: T2 - 20 }, 'HVPG, mmHg'),
      [0, 5, 10].map((v) => sv('g', { class: 'ptk-grid' + (v ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { x1: L, x2: R, y1: Y2(v), y2: Y2(v) }), sv('text', { x: L - 8, y: Y2(v) + 4, 'text-anchor': 'end' }, String(v)))),
      // A line at each time point, with when and what happened.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('title', {}, `${p.when || `Slide ${p.n}`}: ${p.title}`),
        sv('line', { x1: X(i), x2: X(i), y1: T, y2: B2 + 6 }), sv('text', { x: X(i), y: B2 + 26, 'text-anchor': 'middle' }, p.when || String(p.n)),
        p.tick ? sv('text', { class: 'ptk-ev', x: X(i) + 5, y: E, 'text-anchor': 'end', transform: `rotate(-90 ${X(i) + 5} ${E})` }, p.tick) : null)),
      LINES.map(([k, , c]) => sv('path', { class: 'ptk-line', style: `stroke: var(${c})`, d: path((p) => Y(p.fp[k])) })),
      ends.map(([a, c, y]) => sv('text', { class: 'ptk-lbl', x: R + 8, y: y + 5, style: `fill: var(${c})` }, a)),
      sv('path', { class: 'ptk-line hv', d: path((p) => Y2(p.fp.hvpg)) }),
      pts.map((p, i) => sv('circle', { class: 'ptk-pt', 'data-rate': sev(p.fp.hvpg), cx: X(i), cy: Y2(p.fp.hvpg), r: i === last ? 7 : 4.5 })),
      pts.length ? sv('text', { class: 'ptk-v', 'data-rate': sev(pts[last].fp.hvpg), x: R + 8, y: Y2(pts[last].fp.hvpg) + 6 }, fmt(pts[last].fp.hvpg, 1)) : null);
    // The new chart fades in over the old one, which then goes (never a jump).
    const old = [...el.children];
    svg.classList.add('in');
    el.append(svg);
    nextFrame(() => nextFrame(() => svg.classList.remove('in')));
    setTimeout(() => old.forEach((o) => o.remove()), 480);
  }
  return { el, set, update() {}, clear() {} };
}
