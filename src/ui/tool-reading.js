// The measurement card of a procedure slide (tool { kind: 'reading' }): the one pressure monitor (monitor.js), the same screen as the HVPG catheter
// tracing (Mohammad, 13 Nov 2026: "this specifically"; "standardize"), following the slide's measuring procedure step by step on Next:
//   procedure 'hvpgcath'                      the free pressure (FHVP), the balloon up and the pressure riding it to the wedge (WHVP), then the HVPG
//   procedure 'eus'                           the needle in the left portal vein, then in the left hepatic vein, then the EUS-PPG
//   procedure { kind: 'irivc', then: 'irpv' } the IVC from the neck, then the portal vein through the skin, then the PPG
//   procedure 'tipsgrad'                      the portal vein through the stent, the catheter drawn back to the IVC, then the PPG against its target of <12 mmHg
// The card follows the procedure's own clock (presenter.js procPlay hands every frame's time: tools.proc): before the tip is in, the monitor waits;
// each reading is a live trace with its beat and breath, its number the mean as the figure's callout prints it, and a marker drops where it is taken;
// a change of level that happens in the vein (the balloon filling, the catheter drawn back through the stent) is drawn as it happens and the number
// follows it, never a step. Back runs the clock backwards, so the trace goes back with it. The waves are drawn on the procedure's own clock
// (hvpg-clock.js waveAt), so a trace drawn once is drawn the same again: it never reshuffles. The readings are the ones the procedure's callouts
// print (proc-anim.js READS), the slide's numbers until each is taken.
// The same card stays up from one measurement slide to the next (card-keep.js) and starts the new measurement afresh.

import { h, fmt } from './util.js';
import { easeMove } from './motion.js';
import { k01, waveAt, WAVE_GAIN, WEDGE_DAMP } from './hvpg-clock.js';
import { createTraceGL } from './trace-gl.js';
import { drawMonitor, HVPG_TEXT, monitorTitle } from './monitor.js';
import { specOf, markAt, READS } from './proc-anim.js';
import { hvpgSev, ppgSev, PPG_CUTS } from '../engine/pressure-cuts.js';
import { NODES } from '../engine/topology.js';
import { store } from './store.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const or = (a, b) => (fin(a) ? a : fin(b) ? b : NaN);
const r1 = (v) => (fin(v) ? Math.round(v * 10) / 10 : NaN);
const ymaxOf = (v) => Math.max(15, Math.ceil((Math.max(fin(v.a) ? v.a : 0, fin(v.b) ? v.b : 0) + 5) / 5) * 5);
const SEV = { ok: 'ok', caution: 'caution', danger: 'danger' };

// A script's clock: its procedures' stretches laid end to end (a gap between two ways in), each kind's time mapped onto one line of ms.
function clockOf(parts, gap = 800) {
  const off = {}, end = {};
  let at = 0;
  for (const [kind, k0, k1] of parts) { off[kind] = at - k0; at += k1 - k0; end[kind] = at; at += gap; }
  const S = (kind, t) => off[kind] + t;
  const total = at - gap;
  /** The script's time for the kinds' times now (tk: { kind: t }), or NaN before the first has started. */
  // (A later kind never takes the clock back: while its tip is still on its way in, the clock holds where the earlier one ended.)
  const now = (tk) => {
    let t = NaN;
    for (const [kind] of parts) { const tt = tk[kind]; if (!fin(tt)) break; t = Math.min(end[kind], fin(t) ? Math.max(t, S(kind, tt)) : S(kind, tt)); }
    return t;
  };
  return { S, total, now };
}

function scripts() {
  const H = specOf('hvpgcath').T, E = specOf('eus').T, I = specOf('irivc').T, P = specOf('irpv').T, G = specOf('tipsgrad').T;
  // (The trace's height: the script's level with the beat and breath on it, the pulse softened where damp says.)
  const at = (lv, damp) => (t, v, w) => { const p = lv(t, v); return fin(p) ? p + waveAt(t, w) * WAVE_GAIN * (1 - damp(t)) : NaN; };

  // HVPG: the free sweep, the balloon up and the pressure riding it to the wedge, the wedge read once the column has held, then the HVPG.
  const hc = clockOf([['hvpgcath', H.travel1 + 300, H.deflate0]]), hs = (x) => hc.S('hvpgcath', x);
  const hI0 = hs(H.inflate0), hI1 = hs(H.inflate1), hB = (t) => easeMove(k01(t, hI0, hI1));
  const hLv = (t, v) => (t < 0 ? NaN : v.a + (v.b - v.a) * hB(t)), hDamp = (t) => WEDGE_DAMP * hB(t);
  const hF = hs(markAt('hvpgcath', 1)), hW = hs(markAt('hvpgcath', 2)), hH = hs(markAt('hvpgcath', 3));
  const hvpg = {
    id: 'hvpg', kinds: ['hvpgcath'], clock: hc, start: 0, win: [0, hc.total],
    heads: HVPG_TEXT.heads, notes: HVPG_TEXT.notes,   // (the words Measure › HVPG shows: one table, monitor.js)
    lv: hLv, keys: ['FHVP', 'WHVP', 'HVPG'], sev: hvpgSev,
    segs: [[0, hI0, 'free'], [hI0, hc.total, 'wedge']],   // (blue while free, orchid once the balloon is up)
    status(t, v, st, o) {
      if (t < hI0) { o.label = 'FHVP'; o.num = fmt(v.a, 1); o.col = 'free'; }
      else if (t < hW) { o.label = t < hI1 ? 'Balloon inflating' : 'Settling'; o.num = fmt(this.at(t, v, st.wave), 1); o.col = 'wedge'; }
      else if (t < hH) { o.label = 'WHVP'; o.num = fmt(v.b, 1); o.col = 'wedge'; }
      else { o.label = 'HVPG'; o.num = fmt(v.g, 1); o.col = SEV[hvpgSev(v.g)]; }
    },
    drops: [[hF, 'Free', 'a', 'free', 1], [hW, 'Wedge', 'b', 'wedge', -1]],
    levels: [[hI0, 'a', 'free', 'FHVP'], [hH, 'b', 'wedge', 'WHVP']],
    result: { show: hH - 400, at: hH, lo: 'a', hi: 'b', key: 'g', word: 'HVPG', sev: hvpgSev },
    ticks: [[hI0, 'balloon up']],
    marks: [hF, hW, hH],
  };
  hvpg.at = at(hLv, hDamp);

  // EUS-PPG: the needle in the left portal vein, out, in the left hepatic vein (each reading a trace of its own: between them the needle is in neither), then the gradient
  // (taken once the needle is out of the hepatic vein: the clock runs on to the scope's way back, so it is reached).
  const ec = clockOf([['eus', E.pvFlash0, E.back]]), es = (x) => ec.S('eus', x);
  const ePv1 = es(E.pvOut0), eHv0 = es(E.hvFlash0), eHv1 = es(E.hvOut0);
  const eLv = (t, v) => (t >= 0 && t < ePv1 ? v.a : t >= eHv0 && t <= eHv1 ? v.b : NaN);
  const eDamp = (t) => (t < ePv1 ? 0.5 : 0);   // (the portal vein's pulse is soft beside a hepatic vein's)
  const eA = es(markAt('eus', 1)), eB = es(markAt('eus', 2)), eG = es(markAt('eus', 3));
  const eus = {
    id: 'eus', kinds: ['eus'], clock: ec, start: 0, win: [0, ec.total], enterWord: 'Needle advancing',
    heads: ['NEEDLE PRESSURE · LEFT PORTAL VEIN, THEN LEFT HEPATIC VEIN · mmHg', 'NEEDLE PRESSURE · mmHg', 'NEEDLE · mmHg'],
    notes: { idle: ['The tracing starts once the needle is in the portal vein.', 'Starts in the portal vein.'], wait: ['Waiting for the portal vein.'], probe: [''] },
    lv: eLv, keys: ['PV', 'HV', 'EUS-PPG'], sev: hvpgSev,
    segs: [[0, ePv1, 'pv'], [eHv0, eHv1, 'free']],
    status(t, v, st, o) {
      if (t < ePv1) { o.label = 'PV'; o.num = fmt(v.a, 1); o.col = 'pv'; }
      else if (t < eHv0) { o.label = 'Needle to the hepatic vein'; o.num = fmt(v.a, 1); o.col = 'pv'; }
      else if (t < eG) { o.label = 'HV'; o.num = fmt(v.b, 1); o.col = 'free'; }
      else { o.label = 'EUS-PPG'; o.num = fmt(v.g, 1); o.col = SEV[hvpgSev(v.g)]; }
    },
    drops: [[eA, 'PV', 'a', 'pv', -1], [eB, 'HV', 'b', 'free', 1]],
    levels: [[ePv1, 'a', 'pv', 'PV'], [eG, 'b', 'free', 'HV']],
    result: { show: eG - 400, at: eG, lo: 'b', hi: 'a', key: 'g', word: 'EUS-PPG', sev: hvpgSev },
    ticks: [[eHv0, 'needle in HV']],
    marks: [eA, eB, eG],
  };
  eus.at = at(eLv, eDamp);

  // PPG by IR: the catheter from the neck reads the IVC; then, another way in, the portal vein through the skin and the liver; then the gradient.
  const pc = clockOf([['irivc', I.travel1 + 300, I.back], ['irpv', P.travel1 + 300, P.back]]), pi = (x) => pc.S('irivc', x), pp = (x) => pc.S('irpv', x);
  const pI1 = pi(I.back), pP0 = pp(P.travel1 + 300);
  const pLv = (t, v) => (t >= 0 && t <= pI1 ? v.a : t >= pP0 ? v.b : NaN);
  const pDamp = (t) => (t >= pP0 ? 0.5 : 0);
  const pA = pi(markAt('irivc', 1)), pB = pp(markAt('irpv', 1)), pG = pp(markAt('irpv', 2));
  const ppg = {
    id: 'ppg', kinds: ['irivc', 'irpv'], clock: pc, start: 0, win: [0, pc.total],
    heads: ['CATHETER PRESSURE · IVC, THEN PORTAL VEIN · mmHg', 'CATHETER PRESSURE · mmHg', 'CATHETER · mmHg'],
    notes: { idle: ['The tracing starts once the tip is in the IVC.', 'Starts in the IVC.'], wait: ['Waiting for the IVC.'], probe: [''] },
    lv: pLv, keys: ['IVC', 'PV', 'PPG'], sev: ppgSev,
    segs: [[0, pI1, 'ivc'], [pP0, pc.total, 'pv']],
    status(t, v, st, o) {
      if (t < pP0) { o.label = t <= pI1 ? 'IVC' : 'Portal vein access'; o.num = fmt(v.a, 1); o.col = 'ivc'; }
      else if (t < pG) { o.label = 'PV'; o.num = fmt(v.b, 1); o.col = 'pv'; }
      else { o.label = 'PPG'; o.num = fmt(v.g, 1); o.col = SEV[ppgSev(v.g)]; }
    },
    drops: [[pA, 'IVC', 'a', 'ivc', 1], [pB, 'PV', 'b', 'pv', -1]],
    levels: [[pI1, 'a', 'ivc', 'IVC'], [pG, 'b', 'pv', 'PV']],
    result: { show: pG - 400, at: pG, lo: 'a', hi: 'b', key: 'g', word: 'PPG', sev: ppgSev },
    ticks: [[pP0, 'portal vein']],
    marks: [pA, pB, pG],
  };
  ppg.at = at(pLv, pDamp);

  // PPG through a TIPS: the catheter through the stent reads the portal vein, is drawn back (the reading falls with it) and reads the IVC; then the gradient.
  const gc = clockOf([['tipsgrad', G.travel1 + 300, G.back]]), gs = (x) => gc.S('tipsgrad', x);
  const gP0 = gs(G.pull0), gP1 = gs(G.pull1), gK = (t) => easeMove(k01(t, gP0, gP1));
  const gLv = (t, v) => (t < 0 ? NaN : v.a + (v.b - v.a) * gK(t)), gDamp = (t) => 0.5 * (1 - gK(t));
  const gA = gs(G.pvRead1), gB = gs(G.ivRead1), gG = gs(markAt('tipsgrad', 0));
  const tips = {
    id: 'tips', kinds: ['tipsgrad'], clock: gc, start: 0, win: [0, gc.total], target: PPG_CUTS.red, targetWord: `target <${PPG_CUTS.red}`,
    heads: ['CATHETER PRESSURE · THROUGH THE STENT · mmHg', 'CATHETER PRESSURE · mmHg', 'CATHETER · mmHg'],
    notes: { idle: ['The tracing starts once the tip is through the stent.', 'Starts in the portal vein.'], wait: ['Waiting for the portal vein.'], probe: [''] },
    lv: gLv, keys: ['PV', 'IVC', 'PPG'], sev: ppgSev,
    segs: [[0, gP0, 'pv'], [gP0, gc.total, 'ivc']],
    status(t, v, st, o) {
      if (t < gP0) { o.label = 'PV'; o.num = fmt(v.a, 1); o.col = 'pv'; }
      else if (t < gP1) { o.label = 'Drawing back'; o.num = fmt(this.at(t, v, st.wave), 1); o.col = 'ivc'; }
      else if (t < gG) { o.label = 'IVC'; o.num = fmt(v.b, 1); o.col = 'ivc'; }
      else { o.label = 'PPG'; o.num = fmt(v.g, 1); o.col = SEV[ppgSev(v.g)]; }
    },
    drops: [[gA, 'PV', 'a', 'pv', -1], [gB, 'IVC', 'b', 'ivc', 1]],
    levels: [[gP0, 'a', 'pv', 'PV'], [gG, 'b', 'ivc', 'IVC']],
    result: { show: gG - 400, at: gG, lo: 'b', hi: 'a', key: 'g', word: 'PPG', sev: ppgSev },
    ticks: [[gP0, 'drawn back']],
    marks: [gA, gB, gG],
  };
  tips.at = at(gLv, gDamp);

  // (The readings, as the procedure's callouts print them once each is taken, the slide's numbers until then.)
  // (Until a reading is taken, the number is the live vein's, as the figure's callout beside the tip prints it (the model's frame, else the slide's
  // numbers), so it never jumps when the reading lands; the gradient until taken is the difference of the two as printed.)
  const live = (fp) => store.get().frame?.metrics || fp, nodes = (fp) => store.get().frame?.P || null;
  hvpg.vals = (fp, o) => { const m = live(fp), R = READS.hvpgcath; o.a = r1(or(R.fh, m?.fhvp)); o.b = r1(or(R.wh, m?.whvp)); o.g = r1(or(R.hv, o.b - o.a)); return o; };
  eus.vals = (fp, o) => { const P = nodes(fp), R = READS.eus; o.a = r1(or(R.pv, P ? P[NI.LPV] : fp?.lpv)); o.b = r1(or(R.hv, P ? P[NI.LHV] : fp?.lhv)); o.g = r1(or(R.ppg, o.a - o.b)); return o; };
  ppg.vals = (fp, o) => { const m = live(fp); o.a = r1(or(READS.irivc.iv, m?.ivc)); o.b = r1(or(READS.irpv.pv, m?.pv)); o.g = r1(or(READS.irpv.ppg, o.b - o.a)); return o; };
  tips.vals = (fp, o) => { const m = live(fp), R = READS.tipsgrad; o.a = r1(or(R.pv, m?.pv)); o.b = r1(or(R.iv, m?.ivc)); o.g = r1(or(R.ppg, o.a - o.b)); return o; };
  for (const S of [hvpg, eus, ppg, tips]) S.ymax = ymaxOf;
  return { hvpg, eus, ppg, tips };
}
let SCRIPTS = null;
/** The script a slide's procedure is drawn with (null: none this card follows). */
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
/** The card's title for a slide's procedure: one rule for every gradient card (monitor.js monitorTitle), "HVPG, catheter tracing" for the HVPG, else "Pressure tracing". */
export const readingTitle = (proc) => monitorTitle(scriptOf(proc)?.id);
/** A script by its id (tests). */
export const scriptById = (id) => { SCRIPTS ||= scripts(); return SCRIPTS[id] || null; };
/** What the monitor shows for the kinds' times now: 'idle' before the procedure has started (or while the tip is still on its way in), else 'run' at
 *  script time t. Pure. */
export function phaseOf(S, tk) {
  const t = S.clock.now(tk);
  return !Number.isFinite(t) ? 'idle' : t < S.start ? 'enter' : 'run';
}
/** Which readings have been taken at the kinds' times now (the first, the second, the gradient), as the figure's callouts print them. Pure. */
export function takenOf(S, tk, out = [false, false, false]) {
  const t = S.clock.now(tk);
  for (let i = 0; i < 3; i++) out[i] = Number.isFinite(t) && t >= S.marks[i];
  return out;
}
const KEY3 = ['a', 'b', 'g'];
/** The card's spoken summary of the readings taken. */
export function readingWords(S, v, taken) {
  const say = (i) => (taken[i] && fin(v[KEY3[i]]) ? `${S.keys[i]} ${fmt(v[KEY3[i]], 1)} mmHg` : `${S.keys[i]} not read yet`);
  return `${say(0)}, ${say(1)}, ${say(2)}.`;
}

export function createReading() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure tracing, as on the monitor in the procedure room' });
  const said = h('p', { class: 'sr-only' });
  const el = h('div', { class: 'pz-mon pz-reading' }, h('div', { class: 'chart-box hvpg-box' }, cv), h('div', { class: 'sr-only', role: 'group', 'aria-label': 'Pressure readings' }, said));
  const gpu = createTraceGL(cv, { redraw: () => draw() });   // (the monitor drawn by the GPU, trace-gl.js)
  let S = null, fp = null, tk = {}, slide = null, saidKey = '';
  const v = { a: NaN, b: NaN, g: NaN }, taken = [false, false, false];
  const st = { ph: 'idle', t: 0, v, running: true, wave: null, probing: false };   // (what the monitor is handed: kept, written in place)
  function draw() {
    if (!S) return;
    S.vals(fp, v);
    st.ph = phaseOf(S, tk);
    const t = S.clock.now(tk);
    st.t = Number.isFinite(t) ? t : 0;
    drawMonitor(cv, gpu, S, st);
    takenOf(S, tk, taken);
    const key = `${S.id}${+taken[0]}${+taken[1]}${+taken[2]}`;
    if (key !== saidKey) { saidKey = key; said.textContent = readingWords(S, v, taken); }   // (only when a reading is taken, never each frame)
  }
  return {
    el,
    /** The slide's options and context: the measurement is the slide's procedure. A new slide starts its measurement afresh, the monitor waiting for the tip. */
    configure(t, ctx) {
      const next = scriptOf(ctx?.slide?.procedure ?? t?.of);
      if (next !== S || ctx?.slide !== slide) { tk = {}; slide = ctx?.slide; saidKey = ''; }
      S = next;
      if (ctx?.fp) fp = ctx.fp;
      draw();
    },
    /** The procedure's clock (presenter.js procPlay, every frame it runs): kind and t in ms of its sequence. A first kind starting again sets the later ones back. */
    procAt(kind, t) {
      if (!S || !S.kinds.includes(kind)) return;
      if (kind === S.kinds[0]) for (let i = 1; i < S.kinds.length; i++) delete tk[S.kinds[i]];
      if (tk[kind] === t) return;
      tk[kind] = t;
      draw();
    },
    /** The slide's readings (the tiles' numbers): the levels before the procedure has taken its own. */
    pin(f) { if (f) { fp = f; draw(); } },
    park() {},
    clear() {},
    dispose() { gpu?.dispose?.(); },
  };
}
