// The measurement tracing card (Gradients talk, Option A, 13 Nov 2026; /mnt/project-files/gradients-deck-recs): tool { kind: 'reading' } on a
// measurement's procedure slide puts one monitor in the data card, the same look for every way a gradient is read:
//   procedure 'hvpgcath'                     FHVP, then the balloon up and the climb to the WHVP, then the HVPG
//   procedure 'eus'                          the left portal vein, then the left hepatic vein, then the EUS-PPG
//   procedure { kind: 'irivc', then: 'irpv' } the IVC from the neck, then the portal vein through the skin, then the PPG
//   procedure 'tipsgrad' (or a TIPS that reads it after: then: 'tipsgrad')
//                                            the portal vein through the stent, then the IVC, then the PPG against its target of <12 mmHg
// The card follows the procedure's own clock (presenter.js procPlay hands every frame's time: tools.proc): before the first reading it is blank, each
// reading draws as a plateau while the tip or needle reads it and holds there when the step stops, and the last step joins the two plateaus with the
// gradient. Back runs the clock backwards, so the trace goes back with it. Nothing is drawn before the reading is taken (Mohammad, 12 Nov 2026), and
// the readings it prints are the ones the procedure's callouts print (proc-anim.js READS), the slide's numbers before they are taken.
// One fixed size: the drawing has one viewBox and the card's height follows its width only, so it never changes size between slides or steps.
// A model drawn on the GPU (svg-gl.js); each frame writes only the trace's points and the pieces' strengths, held on the pieces.

import { h } from './util.js';
import { createSvgGL, svgModel, setGeo, setPts, setWords, setHidden } from './svg-gl.js';
import { readMetric } from './layout-snap.js';
import { specOf, markAt, READS } from './proc-anim.js';
import { hvpgSev, ppgSev, PPG_CUTS } from '../engine/pressure-cuts.js';

const sv = svgModel;
export const VB_W = 360, VB_H = 220;
const X0 = 44, XW = 250, XB = 314, Y0 = 204, YH = 136;   // (the plot: trace from X0 over XW, the gradient's bracket at XB, 0 mmHg at Y0)
const RATE = { ok: 'ok', caution: 'mid', danger: 'hi' };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const or = (a, b) => (fin(a) ? a : fin(b) ? b : NaN);
const r1 = (v) => (fin(v) ? Math.round(v * 10) / 10 : NaN);

// Each way of reading: its kinds (the procedures it follows, in order), the three header words, the two traces' tones, how the second reading
// is reached (climb: the wedge rising behind the balloon; pull: the catheter drawn back; gap: a needle or catheter out and in again), the phases of
// the trace (a kind's time from t0 to t1 laid from x0 to x1 of the plot), when each reading is taken (mark), and where each value comes from.
function scripts() {
  const H = specOf('hvpgcath').T, E = specOf('eus').T, I = specOf('irivc').T, P = specOf('irpv').T, G = specOf('tipsgrad').T;
  return {
    hvpg: {
      kinds: ['hvpgcath'], keys: ['FHVP', 'WHVP', 'HVPG'], tones: ['mon-free', 'mon-wedge'], join: 'climb', sev: hvpgSev, wait: 'Waiting for the tip to park',
      phases: [['hvpgcath', H.free0, H.inflate1, 0, 0.36, 'a'], ['hvpgcath', H.inflate1, H.col1, 0.36, 0.5, 'j'], ['hvpgcath', H.col1, H.sum0, 0.5, 0.86, 'b']],
      marks: [['hvpgcath', markAt('hvpgcath', 1)], ['hvpgcath', markAt('hvpgcath', 2)], ['hvpgcath', markAt('hvpgcath', 3)]],
      vals: (fp) => [or(READS.hvpgcath.fh, fp?.fhvp), or(READS.hvpgcath.wh, fp?.whvp), or(READS.hvpgcath.hv, fp?.hvpg)],
    },
    eus: {
      kinds: ['eus'], keys: ['PV', 'HV', 'EUS-PPG'], tones: ['mon-pv', 'mon-free'], join: 'gap', sev: hvpgSev, wait: 'Waiting for the needle',
      phases: [['eus', E.pvRead0, E.pvOut0, 0, 0.36, 'a'], ['eus', E.pvOut0, E.hvRead0, 0.36, 0.5, 'j'], ['eus', E.hvRead0, E.hvOut0, 0.5, 0.86, 'b']],
      marks: [['eus', markAt('eus', 1)], ['eus', markAt('eus', 2)], ['eus', markAt('eus', 3)]],
      vals: (fp) => [or(READS.eus.pv, fp?.lpv), or(READS.eus.hv, fp?.lhv), or(READS.eus.ppg, fp?.eus)],
    },
    ppg: {
      kinds: ['irivc', 'irpv'], keys: ['IVC', 'PV', 'PPG'], tones: ['mon-ivc', 'mon-pv'], join: 'gap', sev: ppgSev, wait: 'Waiting for the catheter',
      phases: [['irivc', I.read0, I.back, 0, 0.36, 'a'], ['irivc', I.back, I.end, 0.36, 0.43, 'j'], ['irpv', 0, P.read0, 0.43, 0.5, 'j'], ['irpv', P.read0, P.res0, 0.5, 0.86, 'b']],
      marks: [['irivc', markAt('irivc', 1)], ['irpv', markAt('irpv', 1)], ['irpv', markAt('irpv', 2)]],
      vals: (fp) => [or(READS.irivc.iv, fp?.ivc), or(READS.irpv.pv, fp?.pv), or(READS.irpv.ppg, fp?.ppg)],
    },
    tips: {
      kinds: ['tipsgrad'], keys: ['PV', 'IVC', 'PPG'], tones: ['mon-pv', 'mon-ivc'], join: 'pull', sev: ppgSev, wait: 'Waiting for the catheter', target: PPG_CUTS.red,
      phases: [['tipsgrad', G.pvRead0, G.pull0, 0, 0.36, 'a'], ['tipsgrad', G.pull0, G.ivRead0, 0.36, 0.5, 'j'], ['tipsgrad', G.ivRead0, G.res0, 0.5, 0.86, 'b']],
      marks: [['tipsgrad', G.pvRead1], ['tipsgrad', G.ivRead1], ['tipsgrad', markAt('tipsgrad', 0)]],
      vals: (fp) => [or(READS.tipsgrad.pv, fp?.pv), or(READS.tipsgrad.iv, fp?.ivc), or(READS.tipsgrad.ppg, fp?.ppg)],
    },
  };
}
let SCRIPTS = null;
/** The way of reading a slide's procedure is drawn with (null: none this card follows). */
export function scriptOf(proc) {
  SCRIPTS ||= scripts();
  const k = typeof proc === 'object' && proc ? proc.kind : proc, then = typeof proc === 'object' && proc ? proc.then : null;
  if (k === 'hvpgcath') return SCRIPTS.hvpg;
  if (k === 'eus') return SCRIPTS.eus;
  if (k === 'irivc' || k === 'irpv') return SCRIPTS.ppg;
  if (k === 'tipsgrad' || then === 'tipsgrad') return SCRIPTS.tips;
  return null;
}
export const SCRIPT_IDS = ['hvpg', 'eus', 'ppg', 'tips'];
/** A script by its id (tests). */
export const scriptById = (id) => { SCRIPTS ||= scripts(); return SCRIPTS[id] || null; };

/** How far along the plot the trace has come (0 to 0.86 of it) for the kinds' times now (tk: { kind: t }; a kind not run yet is left out). Pure. */
export function progressOf(S, tk) {
  let x = 0;
  for (const [kind, t0, t1, x0, x1] of S.phases) {
    const t = tk[kind];
    if (!(t > t0)) break;
    x = x0 + (x1 - x0) * Math.min(1, (t - t0) / (t1 - t0 || 1));
    if (t < t1) break;
  }
  return x;
}
/** How strongly each reading (A, B, the gradient) shows for the kinds' times now: 0 before it is taken, easing to 1 over 400 ms of the procedure. Pure. */
export function marksOf(S, tk, out = [0, 0, 0]) {
  for (let i = 0; i < 3; i++) { const [kind, at] = S.marks[i], t = tk[kind]; out[i] = fin(t) ? Math.max(0, Math.min(1, (t - at) / 400)) : 0; }
  return out;
}
/** The scale's top: 30 mmHg, or 40 when a reading rises past 28. */
export const yMaxOf = (a, b) => (Math.max(fin(a) ? a : 0, fin(b) ? b : 0) > 28 ? 40 : 30);
const yOf = (v, top) => Y0 - (Math.max(0, Math.min(top, v)) / top) * YH;

/** The trace's two lines up to x (0..0.86 of the plot), into bufA (the first plateau) and bufB (the move to the second and its plateau): the number of points in each. Pure. */
export function traceInto(S, a, b, x, top, bufA, bufB) {
  const ya = yOf(a, top), yb = yOf(b, top), X = (f) => X0 + f * XW;
  const [, , , ax0, ax1] = S.phases[0], bx0 = S.phases[S.phases.length - 1][3];
  let na = 0, nb = 0;
  if (x > ax0) {
    // (The first plateau settles in from a little off its level over its first eighth, as a reading does.)
    const end = Math.min(x, ax1), set = ax0 + (ax1 - ax0) * 0.12, off = (b > a ? -1 : 1) * Math.min(6, Math.abs(ya - yb) * 0.15 + 2);
    bufA[na++] = X(ax0); bufA[na++] = ya + off;
    const steps = 6;
    for (let i = 1; i <= steps; i++) { const f = ax0 + ((Math.min(end, set) - ax0) * i) / steps, k = (f - ax0) / (set - ax0 || 1); bufA[na++] = X(f); bufA[na++] = ya + off * (1 - k) * (1 - k); }
    if (end > set) { bufA[na++] = X(end); bufA[na++] = ya; }
  }
  if (x > ax1 && S.join !== 'gap') {
    // (climb: the still column behind the balloon rises to the wedge, fast then slowing; pull: the catheter drawn back, the reading falling with it)
    const end = Math.min(x, bx0), n = 10;
    for (let i = 0; i <= n; i++) {
      const f = ax1 + ((end - ax1) * i) / n, k = (f - ax1) / (bx0 - ax1 || 1), e = S.join === 'climb' ? 1 - (1 - k) ** 3 : k * k * (3 - 2 * k);
      bufB[nb++] = X(f); bufB[nb++] = ya + (yb - ya) * e;
    }
  }
  if (x > bx0) {
    if (S.join === 'gap') { const set = bx0 + 0.04; bufB[nb++] = X(bx0); bufB[nb++] = yb + (b > a ? 4 : -4); bufB[nb++] = X(Math.min(x, set)); bufB[nb++] = yb; }
    else { bufB[nb++] = X(bx0); bufB[nb++] = yb; }
    bufB[nb++] = X(x); bufB[nb++] = yb;
  }
  return [na / 2, nb / 2];
}

/** The card's spoken summary for its readings now. */
export function readingWords(S, v, m) {
  const say = (i) => (m[i] > 0.5 && fin(v[i]) ? `${S.keys[i]} ${v[i].toFixed(1)} mmHg` : `${S.keys[i]} not read yet`);
  return `${say(0)}, ${say(1)}, ${say(2)}.`;
}

export function createReading() {
  const el = h('div', { class: 'pz-reading', role: 'group' });
  const gl = createSvgGL(el, { host: 'reading' });
  let S = null, fp = null, tk = {}, drawnKey = '', P = null, shownW = 0;
  const bufA = new Float32Array(64), bufB = new Float32Array(64), M = [0, 0, 0];
  // The drawing for this script and scale (built again only when either changes, or the gradient's rating): the pieces each frame moves are kept.
  function build(vals) {
    const top = yMaxOf(vals[0], vals[1]), rate = fin(vals[2]) ? RATE[S.sev(vals[2])] : 'none', key = `${S.keys.join()}|${top}|${rate}`;
    if (key === drawnKey && P) return;
    drawnKey = key;
    const word = (x, y, t, look, size, anchor = 'start', extra = {}) => sv('text', { x, y, 'font-size': size, 'text-anchor': anchor, 'data-look': look, ...extra }, t);
    const faded = (n) => { setGeo(n, 'opacity', 0); return n; };
    const grid = [];
    for (let v = 0; v <= top; v += 10) grid.push(sv('line', { x1: X0 - 4, x2: VB_W - 10, y1: yOf(v, top), y2: yOf(v, top), 'data-look': 'rd.grid' }), word(X0 - 8, yOf(v, top) + 4, String(v), 'rd.ax', 11, 'end'));
    const hv = [0, 1, 2].map((i) => {
      const x = 14 + i * 84, val = word(x, 44, '—', i === 2 ? 'rd.res' : 'rd.val', 18, 'start', i === 2 ? { 'data-rate': rate } : { 'data-p-c': S.tones[i] });
      return { k: word(x, 22, S.keys[i], 'rd.key', 12), val };
    });
    const lineA = sv('path', { d: 'M0 0', 'data-look': 'rd.line', 'data-p-c': S.tones[0], 'data-nomorph': '' });
    const lineB = sv('path', { d: 'M0 0', 'data-look': 'rd.line', 'data-p-c': S.tones[1], 'data-nomorph': '' });
    const head = sv('circle', { cx: X0, cy: Y0, r: 3.2, 'data-look': 'rd.head', 'data-p-c': S.tones[0] });
    const tagA = faded(word(X0 + 26, Y0, '', 'rd.tag', 12, 'start', { 'data-p-c': S.tones[0] }));
    const tagB = faded(word(X0 + 0.5 * XW + 22, Y0, '', 'rd.tag', 12, 'start', { 'data-p-c': S.tones[1] }));
    const brk = { line: sv('line', { x1: XB, x2: XB, y1: 0, y2: 0, 'data-look': 'rd.brk', 'data-rate': rate }), t1: sv('line', { x1: XB - 5, x2: XB + 5, y1: 0, y2: 0, 'data-look': 'rd.brk', 'data-rate': rate }),
      t2: sv('line', { x1: XB - 5, x2: XB + 5, y1: 0, y2: 0, 'data-look': 'rd.brk', 'data-rate': rate }), pill: sv('rect', { x: XB + 8, y: 0, width: 36, height: 20, rx: 10, 'data-look': 'rd.pill', 'data-rate': rate }),
      txt: word(XB + 26, 0, '', 'rd.pillw', 12, 'middle') };
    const brkG = faded(sv('g', { 'data-look': 'rd.g' }, brk.line, brk.t1, brk.t2, brk.pill, brk.txt));
    const wait = word(X0 + XW / 2, Y0 - YH / 2 + 4, S.wait, 'rd.wait', 13, 'middle');
    const target = S.target ? [sv('line', { x1: X0 - 4, x2: VB_W - 10, y1: yOf(S.target, top), y2: yOf(S.target, top), 'data-look': 'rd.target' }), word(VB_W - 12, yOf(S.target, top) - 5, `target <${S.target} mmHg`, 'rd.tword', 11, 'end')] : [];
    P = { top, rate, hv, lineA, lineB, head, tagA, tagB, brk, brkG, wait };
    gl.show(sv('svg', { width: VB_W, height: VB_H, viewBox: `0 0 ${VB_W} ${VB_H}`, role: 'img', 'aria-label': '' },
      sv('rect', { x: 0, y: 0, width: VB_W, height: VB_H, rx: 9, 'data-look': 'rd.panel' }),
      ...hv.flatMap((x) => [x.k, x.val]), ...grid, ...target, lineA, lineB, head, tagA, tagB, brkG, wait), false);
  }
  // The picture for the kinds' times now: the trace's points, the head, the readings as each is taken and the gradient's bracket.
  function paint() {
    if (!S || !el.isConnected) return;
    const v = S.vals(fp).map(r1);
    build(v);
    const x = progressOf(S, tk), m = marksOf(S, tk, M), top = P.top;
    const [na, nb] = traceInto(S, fin(v[0]) ? v[0] : 0, fin(v[1]) ? v[1] : 0, x, top, bufA, bufB);
    setPts(P.lineA, bufA, na); setPts(P.lineB, bufB, nb);
    setHidden(P.lineA, na < 2); setHidden(P.lineB, nb < 2);
    const end = S.phases[S.phases.length - 1][4], inGap = S.join === 'gap' && x > S.phases[0][4] && x <= S.phases[S.phases.length - 1][3];
    const moving = x > 0 && x < end - 1e-3 && !inGap;
    setHidden(P.head, !moving);
    if (moving) {
      const n = nb >= 2 ? nb : na, buf = nb >= 2 ? bufB : bufA;
      setGeo(P.head, 'cx', buf[2 * n - 2]); setGeo(P.head, 'cy', buf[2 * n - 1]);
    }
    setGeo(P.wait, 'opacity', x > 0 ? 0 : 1);
    for (let i = 0; i < 3; i++) setWords(P.hv[i].val, m[i] > 0 && fin(v[i]) ? v[i].toFixed(1) : '—');
    const ya = yOf(v[0], top), yb = yOf(v[1], top), up = v[0] > v[1];
    setWords(P.tagA, fin(v[0]) ? `${S.keys[0]} ${v[0].toFixed(1)}` : ''); setGeo(P.tagA, 'y', ya + (up ? -8 : 17)); setGeo(P.tagA, 'opacity', m[0]);
    setWords(P.tagB, fin(v[1]) ? `${S.keys[1]} ${v[1].toFixed(1)}` : ''); setGeo(P.tagB, 'y', yb + (up ? 17 : -8)); setGeo(P.tagB, 'opacity', m[1]);
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb), small = hi - lo < 16, py = small ? lo - 26 : (lo + hi) / 2 - 10;
    setGeo(P.brk.line, 'y1', lo); setGeo(P.brk.line, 'y2', hi); setGeo(P.brk.t1, 'y1', lo); setGeo(P.brk.t1, 'y2', lo); setGeo(P.brk.t2, 'y1', hi); setGeo(P.brk.t2, 'y2', hi);
    setGeo(P.brk.pill, 'y', py); setGeo(P.brk.txt, 'y', py + 14); setWords(P.brk.txt, fin(v[2]) ? v[2].toFixed(1) : '');
    setGeo(P.brkG, 'opacity', m[2]);
    gl.paint();
    const words = readingWords(S, v, m);
    if (el.getAttribute('aria-label') !== words && (m[0] === 0 || m[0] === 1) && (m[1] === 0 || m[1] === 1) && (m[2] === 0 || m[2] === 1)) el.setAttribute('aria-label', words);   // (only once a reading has fully come, not on each frame of its fade)
  }
  function size() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!W || W === shownW) return;
    shownW = W;
    el.style.height = `${Math.round((W * VB_H) / VB_W)}px`;   // (its height follows its width only: the card never changes size between slides)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { size(); paint(); }) : null;
  ro?.observe(el);
  return {
    el,
    /** The slide's options and context: the way of reading is the slide's procedure's. A new slide starts blank, before its first reading. */
    configure(t, ctx) {
      const next = scriptOf(ctx?.slide?.procedure ?? t?.of);
      if (next !== S || ctx?.slide !== this._slide) { tk = {}; this._slide = ctx?.slide; }
      if (next !== S) { S = next; drawnKey = ''; P = null; }
      if (ctx?.fp) fp = ctx.fp;
      if (!S) { gl.clear?.(); return; }
      size(); paint();
    },
    /** The procedure's clock (presenter.js procPlay, every frame it runs): kind and t in ms of its sequence. A first kind starting again sets the later ones back. */
    procAt(kind, t) {
      if (!S || !S.kinds.includes(kind)) return;
      if (kind === S.kinds[0]) for (let i = 1; i < S.kinds.length; i++) delete tk[S.kinds[i]];
      if (tk[kind] === t) return;
      tk[kind] = t;
      paint();
    },
    /** The slide's readings (the tiles' numbers): the levels before the procedure has taken its own. */
    pin(f) { if (f) { fp = f; paint(); } },
    park() {},
    clear() {},
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
