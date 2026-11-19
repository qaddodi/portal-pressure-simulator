// The change from healthy (tool: { kind: 'shift' }, Mohammad's pick, 16 Nov 2026: "the circulation in cirrhosis slide deck could likely be better
// represented with a persistent instrument that's a graph chart that shows how things change as we go from healthy to whatever new state";
// recs: /mnt/project-files/recs/cirrhosis-circulation-chart-recs.md, rec 1 with 5, 6 and 7).
//
// One chart that holds across the talk's slides. The x axis is the talk's states in order, one slot each, fixed from the first slide: every
// slide of the deck whose tool is this kind and whose state is new adds one, and a time-lapse adds two, its first day (lapse.from) and its last
// (lapse.to); a state's name is its slide's `tick`, else the time-lapse's own words. A slot shows only once its slide is reached, so no state
// to come is named before its slide, and nothing is laid out again when it comes.
//   Upper panel: the cardiac output, the systemic vascular resistance, the MAP and the blood volume as % of the first state (healthy), on
//                one axis, with a dashed line at 100%: MAP = CO × SVR as three lines.
//   Lower panel: the portal pressure (mmHg, left axis) and the splanchnic arterial inflow (L/min, right axis), each fitted to its own line
//                (flow-time.js pairScales, so their end points stand apart). Not the portal vein flow: in the model it falls as cirrhosis
//                advances (1.09 to 0.75 L/min, two thirds of the splanchnic blood bypassing the liver), while the inflow the slides teach rises.
// Each line is smooth through its states and never overshoots one (a monotone cubic); a time-lapse's stretch is the model's own day-by-day trail,
// already calmed in the worker (engine/portal/trail-calm.js), drawn from its first day as the days play. The slide's `key` lights the lines it teaches
// (the others stay, faint); no key lights them all. The right column names every line with its value at the last state shown.
// A slide that brings a new state shows it only once the model has moved: a question slide holds the state before until its answer plays,
// and the chart's new stretch appears and follows the readings as they ease (pin). A what-if slider's change (the splanchnic tone) moves a ring
// off the last state's dot, the dot staying at the slide's own reading, and the right column follows the ring.
// Drawn on the GPU (svg-gl.js), the drawing gliding from one slide's to the next's (card-show.js).

import { createSvgGL, svgModel, setGeo, setPts, setWords } from './svg-gl.js';
import { fittedType, tokName } from './chart-ctx.js';
import { cardShow } from './card-show.js';
import { plotPanel } from './plot-look.js';
import { measure } from './glyph-measure.js';
import { pairScales } from './flow-time.js';
import { READING_COLOUR as RC } from './reading-colours.js';
import { frameFor, cancelFrame } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { headStep, HEAD_DT0 } from './display-state.js';
import { reduceMotionMQ } from './motion.js';
import { readMetric } from './layout-snap.js';
import { fix1, round1, printedKey, clamp } from './num.js';
const nextFrame = frameFor('tool-shift');
const sv = svgModel;

// The readings: [key, short name, unit, decimals]. The upper panel's read as % of the first state.
export const SHIFT_TOP = ['co', 'svr', 'map', 'bv'];
export const SHIFT_LOW = ['pv', 'spl'];
export const SHIFT_KEYS = [...SHIFT_TOP, ...SHIFT_LOW];
export const SHIFT_LINE = {
  co: ['CO', '%', 0], svr: ['SVR', '%', 0], map: ['MAP', '%', 0], bv: ['Volume', '%', 0],
  pv: ['Portal', 'mmHg', 1], spl: ['Inflow', 'L/min', 2],
};
/** A reading's colour token (reading-colours.js, the one table). */
export const shiftColour = (k) => RC[k];
const SHIFT_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
const SEG = 10;   // (points drawn between two states)
const LAPSE_PTS = 60;   // (points a time-lapse's stretch is drawn with, from its trail)
const MOVED = 0.004;   // (a share of a reading: the state has moved off the one before once any reading has moved by more)

/** The deck's states on the chart, in order: [{ j (the slide that brings it), k (its state), start (a time-lapse's first day), name }]. */
export function shiftStages(slides, stateOf) {
  const out = [], seen = new Set();
  (slides || []).forEach((s, j) => {
    if (s?.tool?.kind !== 'shift') return;
    const k = stateOf ? stateOf[j] : j;
    if (seen.has(k)) return;
    seen.add(k);
    if (s.lapse) out.push({ j, k, start: true, name: s.lapse.from || 'Before' });
    out.push({ j, k, start: false, name: s.tick || s.lapse?.to || s.title || `Slide ${j + 1}` });
  });
  return out;
}
/** A trail row ([day, ...SHIFT_KEYS]) as readings. */
export const rowVals = (r) => (r ? Object.fromEntries(SHIFT_KEYS.map((k, i) => [k, r[i + 1]])) : null);
/** A stage's readings from its slide's state ({ fp, trail, start }): a time-lapse's first day is its trail's first row (else its start state). */
export function stageVals(stage, st) {
  if (!st) return null;
  const v = stage.start ? (st.trail?.length ? rowVals(st.trail[0]) : st.start?.fp) : st.fp;
  return v && SHIFT_KEYS.every((k) => Number.isFinite(v[k])) ? v : null;
}
/** Whether readings b have moved off readings a (any by more than MOVED of a's). */
export const movedFrom = (a, b) => !!a && !!b && SHIFT_KEYS.some((k) => Math.abs(b[k] - a[k]) > MOVED * Math.max(Math.abs(a[k]), 1e-6));
/** The upper panel's axis over the % values vs (100 always a tick): steps of 20, 25 or 50, as the span needs. → { min, max, step, ticks } */
export function topScale(vs) {
  const lo0 = Math.min(100, ...vs), hi0 = Math.max(100, ...vs), span = hi0 - lo0;
  const step = span > 130 ? 50 : span > 100 ? 25 : 20;   // (steps that 100 is a multiple of, so the healthy line is always a gridline)
  const min = 100 - Math.ceil((100 - (lo0 - 0.06 * span)) / step) * step, max = 100 + Math.ceil((hi0 + 0.06 * span - 100) / step) * step;
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  return { min, max, step, ticks };
}
/** Points along a monotone cubic through (xs, ys) (Fritsch–Carlson: smooth, and never past a state's own value), seg points between
 *  each two; → [[[x, y], ...] for each stretch] (each stretch starts at its first state). */
export function monotone(xs, ys, seg = SEG) {
  const n = xs.length;
  if (n < 2) return [];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1e-9));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i], pts = [[xs[i], ys[i]]];
    for (let q = 1; q <= seg; q++) {
      const t = q / seg, t2 = t * t, t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
      pts.push([xs[i] + t * h, y]);
    }
    out.push(pts);
  }
  return out;
}
/** A trail cut down to about n rows, its first and last kept. */
export function thin(trail, n = LAPSE_PTS) {
  if (!trail || trail.length <= n) return trail || [];
  const out = [], step = (trail.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(trail[Math.round(i * step)]);
  return out;
}
/** The right column's labels, top to bottom, never closer than gap, inside [lo, hi]: ys in, placed ys out (same order). */
export function spread(ys, gap, lo, hi) {
  const ord = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]), at = new Array(ys.length);
  let prev = -Infinity;
  for (const [y, i] of ord) { const p = Math.max(y, prev + gap, lo); at[i] = p; prev = p; }
  // (pushed past the bottom: the run is moved up as a whole, never under the panel)
  const over = Math.max(0, prev - hi);
  if (over) for (let i = 0; i < at.length; i++) at[i] -= over;
  return at;
}
/** The names under the lower panel to keep, right to left, the last always: each clear of the one after it (talk-trace.js keepClear). */
function keepClear(xs, ws, W, gap = 8) {
  const kept = new Set();
  for (let i = xs.length - 1, edge = Infinity; i >= 0; i--) {
    const half = ws[i] / 2;
    if (i === xs.length - 1 || (xs[i] + half + gap <= edge && xs[i] - half >= 0 && xs[i] + half <= W)) { kept.add(i); edge = xs[i] - half; }
  }
  return kept;
}
const fmtV = (k, v) => (SHIFT_LINE[k][1] === '%' ? `${Math.round(v)}%` : v.toFixed(SHIFT_LINE[k][2]));

export function createShiftTool() {
  const el = document.createElement('div');
  el.className = 'pz-shift';
  const gl = createSvgGL(el, { host: 'shift' });
  const put = cardShow(gl);
  let ctx0 = null, stages = [], vals = [], lit = null, live = null, liveAt = -1, ringOn = false, waitDays = false, soon = false;
  let lapse = null;   // ({ i: the stage the days end at, trail, shown, goal, parts }) while a time-lapse plays
  let raf = 0, lastT = 0, rest = 0, size = '';
  const tw = (t, f, wt = 600) => measure(t, `${wt} ${f}px Inter`);
  const ready = (i) => !!vals[i];
  // Which stages show now: those whose slide has been reached; a stage brought by this very slide only once the model has moved off the one before.
  // (the days' last state: a stage that ends a time-lapse, the one before it its first day)
  const endsLapse = (q) => q > 0 && !stages[q].start && stages[q - 1].start && stages[q - 1].k === stages[q].k;
  /** The last stage the slide has reached, -1 for none. */
  function reached() {
    const at = ctx0?.index ?? 0;
    let q = 0;
    while (q < stages.length && stages[q].j <= at && ready(q)) q++;
    return q - 1;
  }
  function shownCount() {
    const at = ctx0?.index ?? 0, top = reached();
    let n = 0;
    while (n <= top) {
      const s = stages[n];
      if (lapse && n === lapse.i) break;   // (the days' last state: drawn as they play)
      if (s.j === at && endsLapse(n) && waitDays) break;   // (the time-lapse waits for its days to play)
      // (the state this slide brings: shown once the readings have left the one before; a question holds them there until its answer plays)
      if (s.j === at && !s.start && n > 0 && live && liveAt === n && !movedFrom(vals[n - 1], live)) break;
      n++;
    }
    return n;
  }
  function readAll() {
    const c = ctx0;
    stages = shiftStages(c?.slides, c?.stateKeys?.());
    vals = stages.map((s) => stageVals(s, c?.stateAt?.(s.j)));
  }
  // The geometry for a box w × h in type f.
  function geo(w, h, f) {
    const labels = SHIFT_KEYS.map((k) => tw(SHIFT_LINE[k][0], f, 700) + 5 + tw(k === 'pv' ? '88.8' : k === 'spl' ? '8.88' : '188%', f, 500));
    const colW = 12 + Math.max(...labels), colX = w - colW - 2;
    const numL = Math.max(tw('140', f, 500), tw('30', f, 500)) + 12, numR = tw('1.50', f, 500) + 10;
    const L = numL, R = colX - numR - 8;
    const nameH = f + 8, B2 = h - nameH - 4, T1 = f + 10, gap = 2 * f + 6;
    const avail = Math.max(4 * f, B2 - T1 - gap), B1 = T1 + 0.58 * avail, T2 = B1 + gap;
    const pad = Math.max(8, 0.8 * f), N = Math.max(stages.length, 2);
    const X = (i) => L + pad + (R - L - 2 * pad) * i / (N - 1);
    return { w, h, f, L, R, colX, T1, B1, T2, B2, X, nameY: h - 6, numR };
  }
  // The scales from every stage the deck has (the shown and those to come), so they never change from slide to slide.
  function scales() {
    const ref = vals[0];
    const pct = (i, k) => 100 * vals[i][k] / ref[k];
    const top = [], pv = [], spl = [];
    for (let i = 0; i < stages.length; i++) if (vals[i]) { for (const k of SHIFT_TOP) top.push(pct(i, k)); pv.push(vals[i].pv); spl.push(vals[i].spl); }
    for (const s of stages) { const tr = s.start ? null : ctx0?.stateAt?.(s.j)?.trail; if (tr) for (const r of tr) { const v = rowVals(r); for (const k of SHIFT_TOP) top.push(100 * v[k] / ref[k]); pv.push(v.pv); spl.push(v.spl); } }
    const [Lsc, Usc] = pairScales(pv, spl, { pad: 0.12 }, { pad: 0.15 });
    return { top: topScale(top), pvs: Lsc, spls: Usc };
  }
  // A reading's y in its panel.
  function yOf(G, S, k, v) {
    if (SHIFT_TOP.includes(k)) { const p = 100 * v / vals[0][k]; return G.B1 - (G.B1 - G.T1) * (p - S.top.min) / (S.top.max - S.top.min); }
    const sc = k === 'pv' ? S.pvs : S.spls;
    return G.B2 - (G.B2 - G.T2) * (v - sc.min) / (sc.max - sc.min);
  }
  const litOf = (k) => !lit || !lit.length || lit.includes(k);
  const cls = (base, k) => base + (litOf(k) ? '' : ' dim');
  const dStr = (pts) => pts.map(([x, y], q) => `${q ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  // The points of a stretch that ends at a time-lapse's last day: the model's own days, from the trail.
  function lapsePts(G, S, k, i, trail, upTo = 1) {
    const rows = thin(trail), x0 = G.X(i - 1), x1 = G.X(i), d1 = rows.at(-1)?.[0] || 1, col = SHIFT_KEYS.indexOf(k) + 1, out = [];
    for (const r of rows) { const t = r[0] / d1; if (t > upTo + 1e-9) break; out.push([x0 + (x1 - x0) * t, yOf(G, S, k, r[col])]); }
    return out;
  }
  // The chart as it stands: the n stages shown (the last's readings `last` when they follow the model), and, while a time-lapse plays, its
  // stretch as pieces the frames move.
  function build(G, S, n, last) {
    const f = G.f, at = (i) => (i === n - 1 && last ? last : vals[i]);
    const p1 = plotPanel(sv, 0, G.T1 - 6, G.w, G.B1 - G.T1 + 12), p2 = plotPanel(sv, 0, G.T2 - 6, G.w, G.B2 - G.T2 + 12, { fill: true });
    const yTop = (v) => G.B1 - (G.B1 - G.T1) * (v - S.top.min) / (S.top.max - S.top.min);
    const showTick = (sc, Y, j) => j === 0 || j === sc.ticks.length - 1 || (Y(sc.ticks[0]) - Y(sc.ticks[1])) >= 1.15 * f;
    const lowY = (sc) => (v) => G.B2 - (G.B2 - G.T2) * (v - sc.min) / (sc.max - sc.min);
    const pvY = lowY(S.pvs), splY = lowY(S.spls);
    const kids = [sv('defs', {}, p1.clip, p2.clip), p1.back, p2.back];
    // The upper panel's grid, its numbers on the left, the 100% line dashed, the panel's name over its numbers.
    kids.push(S.top.ticks.map((v, j) => sv('g', { class: 'ptk-grid' },
      v === 100 ? sv('line', { 'data-look': 'shift.ref', x1: G.L, x2: G.R, y1: yTop(v), y2: yTop(v) }) : sv('line', { 'data-look': 'plot.grid.line', x1: G.L, x2: G.R, y1: yTop(v), y2: yTop(v) }),
      showTick(S.top, yTop, j) || v === 100 ? sv('text', { 'data-look': 'plot.grid.text', x: G.L - 6, y: yTop(v) + 0.35 * f, 'text-anchor': 'end' }, String(v)) : null)));
    kids.push(sv('text', { 'data-look': 'shift.panel', x: 4, y: G.T1 - 10 }, '% of healthy'));
    // The lower panel: the gridlines of the portal pressure's axis, its numbers on the left in its colour, the inflow's on the right in its own.
    kids.push(S.pvs.ticks.map((v, j) => sv('g', { class: 'ptk-grid' },
      sv('line', { 'data-look': 'plot.grid.line', x1: G.L, x2: G.R, y1: pvY(v), y2: pvY(v) }),
      showTick(S.pvs, pvY, j) ? sv('text', { 'data-look': 'time.grid.text', 'data-p-c': tokName(shiftColour('pv')), x: G.L - 6, y: pvY(v) + 0.35 * f, 'text-anchor': 'end' }, String(+v.toFixed(1))) : null,
      showTick(S.spls, splY, j) && S.spls.ticks[j] != null ? sv('text', { 'data-look': 'time.grid.text', 'data-p-c': tokName(shiftColour('spl')), x: G.R + 6, y: pvY(v) + 0.35 * f }, S.spls.ticks[j].toFixed(S.spls.ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) ? 2 : 1)) : null)));
    kids.push(sv('text', { 'data-look': 'shift.panel', x: 4, y: G.T2 - 10 }, 'mmHg'),
      sv('text', { 'data-look': 'shift.panel', x: G.R + G.numR, y: G.T2 - 10, 'text-anchor': 'end' }, 'L/min'));
    // A faint upright line at each state shown, through both panels.
    for (let i = 0; i < n; i++) kids.push(sv('g', { class: 'ptk-mark' + (i === n - 1 ? ' now' : '') }, sv('line', { 'data-look': 'talk.mark.line', x1: G.X(i), x2: G.X(i), y1: G.T1 - 2, y2: G.B2 + 2 })));
    // The lines: one piece a stretch, so a slide's new stretch is a new piece (it fades in) and the old ones stay paired (they hold still).
    const heads = [];
    for (const k of SHIFT_KEYS) {
      const c = tokName(shiftColour(k));
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) { xs.push(G.X(i)); ys.push(yOf(G, S, k, at(i)[k])); }
      const segs = monotone(xs, ys);
      for (let i = 1; i < n; i++) {
        const tr = endsLapse(i) ? ctx0?.stateAt?.(stages[i].j)?.trail : null;
        const pts = tr?.length ? lapsePts(G, S, k, i, tr) : segs[i - 1];
        kids.push(sv('path', { class: cls('psh-line', k), 'data-look': 'shift.line', 'data-p-c': c, 'data-seg': `${k}${i}`, d: dStr(pts) }));
      }
      if (lapse) {
        const path = sv('path', { class: cls('psh-line', k), 'data-look': 'shift.line', 'data-p-c': c, 'data-nomorph': '' });
        const dot = sv('circle', { class: cls('psh-dot', k), 'data-look': 'shift.dot', 'data-p-c': c, 'data-nomorph': '', r: 4.5, cx: G.X(lapse.i - 1), cy: ys[n - 1] ?? 0 });
        // alloc-rare: a head's points, made once with the drawing (written in place every frame of the days)
        kids.push(path); heads.push({ k, path, dot, col: SHIFT_KEYS.indexOf(k) + 1, top: SHIFT_TOP.includes(k), pk: '', P: new Float64Array(2 * (lapse.rows.length + 1)) });
      }
      for (let i = 0; i < n; i++) kids.push(sv('circle', { class: cls('psh-dot', k), 'data-look': 'shift.dot', 'data-p-c': c, cx: xs[i], cy: ys[i], r: i === n - 1 && !lapse ? 4.5 : 3.25 }));
      if (ringOn && n && live && !lapse) kids.push(sv('circle', { class: cls('psh-ring', k), 'data-look': 'shift.ring', 'data-p-c': c, cx: xs[n - 1], cy: yOf(G, S, k, live[k]), r: 4.5 }));
      for (const hd of heads) if (hd.k === k) kids.push(hd.dot);
    }
    // The right column: every line's short name and its value at the last state (the ring's, the head's), spread so none touch.
    const endVals = (k) => (lapse ? null : ringOn && live ? live[k] : n ? at(n - 1)[k] : null);
    const endY = (k) => { const v = lapse ? rowVals(lapse.trail.at(-1))[k] : endVals(k); return v == null ? null : yOf(G, S, k, v); };
    const words = {}, col = [];
    for (const [keys, lo, hi] of [[SHIFT_TOP, G.T1 + 0.4 * f, G.B1 - 0.2 * f], [SHIFT_LOW, G.T2 + 0.4 * f, G.B2 - 0.2 * f]]) {
      const ys = keys.map((k) => endY(k) ?? (lo + hi) / 2), at2 = spread(ys, 1.2 * f, lo, hi);
      keys.forEach((k, q) => {
        const c = tokName(shiftColour(k)), y = at2[q], v = endVals(k), name = SHIFT_LINE[k][0], x = G.colX + 12;
        const vt = sv('text', { class: cls('psh-v', k), 'data-look': 'shift.lbl.v', 'data-nomorph': lapse ? '' : null, x: x + tw(name, f, 700) + 5, y: y + 0.35 * f }, v == null ? '' : fmtV(k, SHIFT_TOP.includes(k) ? 100 * v / vals[0][k] : v));
        words[k] = vt;
        col.push(sv('g', { class: 'psh-lbl' },
          sv('rect', { class: cls('psh-sw', k), 'data-look': 'shift.swatch', 'data-p-c': c, x: G.colX, y: y - 1.5, width: 8, height: 3, rx: 1.5 }),
          sv('text', { class: cls('psh-n', k), 'data-look': 'shift.lbl.n', x, y: y + 0.35 * f }, name), vt));
      });
    }
    kids.push(col);
    // The states' names under the lower panel: the last shown always, the others where they stand clear.
    const m = lapse ? lapse.i + 1 : n, xs = Array.from({ length: m }, (_, i) => G.X(i)), names = stages.slice(0, m).map((s) => s.name);
    const keep = keepClear(xs, names.map((t, i) => tw(t, 0.92 * f, i === m - 1 ? 700 : 500)), G.R + G.numR);
    names.forEach((t, i) => { if (keep.has(i)) kids.push(sv('text', { class: 'psh-stage' + (i === m - 1 ? ' now' : ''), 'data-look': 'shift.stage', x: xs[i], y: G.nameY, 'text-anchor': i === 0 && xs[i] - tw(t, 0.92 * f) / 2 < 2 ? 'start' : 'middle' }, t)); });
    const label = 'Change from healthy: ' + stages.slice(0, n).map((s, i) => `${s.name}, ${SHIFT_KEYS.map((k) => `${SHIFT_LINE[k][0]} ${fmtV(k, SHIFT_TOP.includes(k) ? 100 * at(i)[k] / vals[0][k] : at(i)[k])}${SHIFT_LINE[k][1] === '%' ? '' : ` ${SHIFT_LINE[k][1]}`}`).join(', ')}`).join('; ');
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, role: 'img', 'aria-label': label }, kids);
    return { svg, heads, words };
  }
  let G = null, S = null, parts = null;
  // (The box, read when a drawing is made: a slide's change, a pin that moved the readings, a resize; never in a frame.)
  function measureBox() {
    const f = fittedType(el, gl, SHIFT_MIN);
    return [Math.max(200, readMetric(el, 'clientWidth') || 420), Math.max(9 * f, readMetric(el, 'clientHeight') || 220), f];
  }
  // Draw the chart as the slide has it (glides from the drawing before when the box is the same).
  function draw() {
    if (!ctx0 || !vals[0]) { gl.clear(); parts = null; return; }
    const [w, h, f] = measureBox();
    size = `${Math.round(w)}x${Math.round(h)}x${f}`;
    G = geo(w, h, f); S = scales();
    const n = shownCount(), last = live && liveAt === n - 1 && !ringOn ? live : null;
    parts = build(G, S, n, last);
    put(parts.svg, size);
    if (lapse) paintLapse(lapse.shown);
  }
  // (Drawn once the slide's own calls are in: the card is told of the slide, then at once of its readings, pin, and the first drawing
  // must already hold them, never the answer of a question that is still being asked.)
  function drawSoon() { if (soon) return; soon = true; queueMicrotask(() => { soon = false; draw(); }); }
  // A time-lapse's stretch drawn to k (0 to 1) of its days: the lines' points written in place, each head on its line's last point.
  function paintLapse(k) {
    if (!lapse || !parts) return;
    const rows = lapse.rows, nr = rows.length, d1 = lapse.d1, day = k * d1, x0 = G.X(lapse.i - 1), x1 = G.X(lapse.i);
    // (the rows passed, and the two either side of the head, so it moves smoothly between the trail's points)
    let r = 0;
    while (r < nr - 1 && rows[r + 1][0] < day) r++;
    const a = rows[r], b = rows[r + 1 < nr ? r + 1 : r], t = b[0] > a[0] ? clamp((day - a[0]) / (b[0] - a[0]), 0, 1) : 0, hx = x0 + (x1 - x0) * Math.min(1, day / d1);
    for (let q = 0; q < parts.heads.length; q++) {
      const hd = parts.heads[q], col = hd.col, P = hd.P;
      // (written in place: the points passed, then the head; nothing made in a frame)
      let n = 0;
      for (let j = 0; j <= r && j < nr; j++) { P[2 * n] = round1(x0 + (x1 - x0) * rows[j][0] / d1); P[2 * n + 1] = round1(yOf(G, S, hd.k, rows[j][col])); n++; }
      const v = a[col] + (b[col] - a[col]) * t, hy = yOf(G, S, hd.k, v);
      P[2 * n] = round1(hx); P[2 * n + 1] = round1(hy); n++;
      setPts(hd.path, P, n, false);
      setGeo(hd.dot, 'cx', fix1(hx)); setGeo(hd.dot, 'cy', fix1(hy));
      const shown = hd.top ? 100 * v / vals[0][hd.k] : v, key = printedKey(shown, hd.top ? 0 : SHIFT_LINE[hd.k][2]);
      if (key !== hd.pk) {
        hd.pk = key;
        // alloc-rare: only when the printed number changes
        setWords(parts.words[hd.k], fmtV(hd.k, shown));
      }
    }
  }
  function tick(t) {
    raf = 0;
    if (!lapse) { lastT = 0; return; }
    const dt = lastT ? (t - lastT) / 1000 : HEAD_DT0;
    lapse.shown = reduceMotionMQ.matches ? lapse.goal : headStep(lapse.shown, lapse.goal, dt);
    if (Math.abs(lapse.goal - lapse.shown) < 0.002) lapse.shown = lapse.goal;
    paintLapse(lapse.shown);
    gl.paint();
    if (lapse.shown !== lapse.goal) { lastT = t; raf = nextFrame(tick); } else lastT = 0;
  }
  // (A new size, or the card's zoom changing the type: drawn again between frames.)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!rest && parts) rest = restPass(() => { rest = 0; if (el.isConnected) { const [w, h, f] = measureBox(); if (`${Math.round(w)}x${Math.round(h)}x${f}` !== size) draw(); } }); }) : null;
  ro?.observe(el);
  return {
    el,
    /** The slide's tool and context: its states (ctx.stateAt, ctx.stateKeys), its index, its key (the lines it lights). */
    configure(t, ctx) {
      ctx0 = ctx || null;
      lit = [].concat(ctx?.slide?.key || []).filter((k) => SHIFT_KEYS.includes(k));
      ringOn = !!ctx?.slide?.whatIf;
      live = null; liveAt = -1;
      readAll();
      // (Its days still to play: the time-lapse's last state waits for them, progress. A slide reached any other way ends one drawn here.)
      waitDays = ctx?.reveal === 0 && !!ctx?.slide?.lapse;
      if (lapse && !(waitDays && stages[lapse.i]?.j === ctx?.index)) { cancelFrame(raf); raf = 0; lapse = null; }
      drawSoon();
    },
    /** The slide's readings as the model eases or a slider moves it (the tiles' own numbers). */
    pin(fp) {
      if (!ctx0 || !fp || lapse || !SHIFT_KEYS.every((k) => Number.isFinite(fp[k]))) return;
      const i = reached(), s = stages[i];
      // (only the state this slide brings follows the model, or the last one under a what-if slider)
      // (never the first, the healthy reference every other is read against; nor a card's last slide's while the presenter rides it to the next)
      if (!s || i < 1 || !(ringOn || (s.j === ctx0.index && !s.start))) return;
      const next = movedFrom(vals[i], fp) ? { ...fp } : null;
      if (!next === !live && (!next || !movedFrom(live, next))) return;   // (nothing a drawing would show has moved)
      live = next; liveAt = next ? i : -1;
      drawSoon();
    },
    /** A time-lapse on the slide's state, k (0 to 1) of its days, with its trail when it starts (the presenter's playLapse). */
    progress(k, trail) {
      if (!ctx0) return;
      if (trail !== undefined) {
        readAll();
        // (the days' last state: the next stage that is a time-lapse's end, at or after the slide this card was last told of)
        const i = stages.findIndex((s, q) => endsLapse(q) && s.j >= (ctx0.index ?? 0));
        if (i < 0 || !trail?.length) { lapse = null; return; }
        // (the card may still hold the slide before: the days' own slide is its context from here)
        ctx0 = { ...ctx0, index: stages[i].j };
        cancelFrame(raf); raf = 0; lastT = 0; waitDays = false; live = null; liveAt = -1;
        const rows = thin(trail);
        lapse = { i, trail, rows, d1: rows.at(-1)?.[0] || 1, shown: k, goal: k };
        vals[i - 1] = rowVals(trail[0]);
        draw();
        return;
      }
      if (!lapse) return;
      lapse.goal = Math.max(0, Math.min(1, k));
      if (k >= 1) {
        // (the days have ended: the last state is drawn whole, the stretch from the trail, and the head becomes its dot)
        const end = () => { if (!lapse) return; cancelFrame(raf); raf = 0; lapse = null; readAll(); draw(); };
        if (reduceMotionMQ.matches) { end(); return; }
        if (!raf) raf = nextFrame(tick);
        setTimeout(() => restPass(end), 500);
        return;
      }
      if (!raf) raf = nextFrame(tick);
    },
    update() {}, clear() {},
    refit() { if (parts) draw(); },
    dispose() { cancelFrame(raf); raf = 0; cancelRest(rest); rest = 0; ro?.disconnect(); gl.dispose(); },
  };
}

/** The keys a time-lapse slide under this chart keeps day by day (worker-core.js trail): every reading the chart draws. */
export const shiftTrail = (s) => (s?.lapse ? SHIFT_KEYS : false);
