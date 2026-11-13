// Portal pressure and portal flow around a meal, on one chart (the presenter's flow-time tool). Two y-axes (Mohammad, 8 Nov 2026:
// "make it two y-axis, a primary on the left and a secondary on the right, each for a different line; it's ok if the lines overlap,
// that gives them a wider y range"): the lower line (a pressure, mmHg) reads on the LEFT axis, the upper line (flow, L/min) on the
// RIGHT, and each axis takes the plot's full height on a tight fit of its own line (see pairScales), so a small change is a visible
// one. The two scales share one count of steps, so the gridlines are one set and both axes' numbers sit on them; each axis's numbers
// and line are in the line's colour. The lines may cross.
// Time is a teaching scale in minutes: a fasting baseline before the meal (a dashed line at 0), the slide's time-lapse
// spread over the rise, then the state it reaches held to the end. The values are the model's own: the off-screen chain
// keeps the portal pressure and flow on each day of the time-lapse (worker-core's trail), read here once a minute
// (straight between days). The lines draw from left to right as the time-lapse plays, easing after its clock.
// The same chart plots a disease time-lapse (clock 'days'): two of the slide's own readings, one point per model day from
// day 0 to its last, drawn as it plays (Ascites builds: ascites over sinusoidal pressure; varices: varix over HVPG).
// A line the model does not compute (body weight, which the model has no body for) is given by the slide (tool.given: { wt: 12 }, the
// per cent lost): it runs from its base (100% of her starting weight) down to base minus that number (88%) in step with the
// time-lapse's ramp, and every other line is still the model's own.
import { frameFor, cancelFrame } from './frame.js';
import { classSoon, attrSoon, dataSoon } from './class-soon.js';
import { restPass } from './rest-pass.js';
import { plotPanel } from './plot-look.js';
import { RX, bandKeys } from './rx-bands.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts } from './svg-gl.js';
import { fix1, round1, printedKey, clamp } from './num.js';
import { D_SURFACE, EASE_ARRIVE } from './ease.js';
import { reduceMotionMQ } from './motion.js';
import { headStep, HEAD_DT0 } from './display-state.js';
import { fittedType, tokName } from './chart-ctx.js';
import { cw, placeStarts } from './flow-time-labels.js';
const nextFrame = frameFor('flow-time');

// (No imports: the series and scales load in Node for the unit tests. Every value here is positive.)
// alloc-rare: a printed number's text, made only when the printed number changes (paint) or a chart is built
const fmt = (v, d) => v.toFixed(d);
const FT_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)

// Minutes on the teaching clock: fasting from `from` to 0, the rise over `rise`, the state reached held to `end`.
export const MINUTES = { from: -10, rise: 30, end: 40 };
// The lines a chart can plot (fingerprint keys): name, unit, decimals, colour, a scale on the model's value and options:
// given (the slide gives the line's change, tool.given, in place of the model: it runs from base down by that number), base,
// scale (a lower line's fixed scale [min, max, step] in place of a fitted one) and pad (a share of a line's range kept clear above
// and below it, 8% by default). A chart's lines are [lower, upper]: the lower on the left axis, the upper on the right, both fitted.
export const LINE = {
  pv: ['Portal pressure', 'mmHg', 1, '--tr-pv'], ppg: ['PPG', 'mmHg', 1, '--tr-pv'], pvFlow: ['Portal flow', 'L/min', 1, '--tr-hv'],
  sin: ['Sinusoids', 'mmHg', 1, '--tr-wedge'], asc: ['Ascites', 'L', 1, '--tr-hv', 0.001],
  hvpg: ['HVPG', 'mmHg', 1, '--tr-wedge'], varix: ['Varix', 'mm', 1, '--tr-var'],
  wt: ['Body weight', '% of start', 0, '--tr-cav', 1, { given: true, base: 100, scale: [84, 100, 4] }], lsm: ['Stiffness', 'kPa', 1, '--tr-scler', 1, { pad: 0.15 }],
  // (The readings the teaching card's own time graph carries on a time-lapse slide, lapse-graph.js: each is one of the slide's tiles.)
  ssm: ['Spleen stiffness', 'kPa', 1, '--tr-scler', 1, { pad: 0.15 }], salb: ['Albumin', 'g/dL', 1, '--tr-ivc', 1, { pad: 0.2 }],
  rpp: ['Renal perfusion pressure', 'mmHg', 0, '--tr-cav'], he: ['Encephalopathy risk', 'index', 2, '--tr-var', 1, { pad: 0.2 }],
  gv: ['Fundal varix', 'mm', 1, '--tr-var'], liver: ['Sinusoidal flow', '%', 0, '--tr-hv', 1, { pad: 0.2 }], map: ['Mean arterial pressure', 'mmHg', 0, '--tr-pv'], co: ['Cardiac output', 'L/min', 1, '--tr-hv', 1, { pad: 0.2 }],
};
export const MEAL_LINES = ['pv', 'pvFlow'];
const opt = (k) => LINE[k]?.[5] || {};
/** The lines of a chart that the model computes: the fingerprint keys a slide's time-lapse keeps day by day (worker-core's trail). */
export const modelLines = (lines) => lines.filter((k) => !opt(k).given);
/** What the worker keeps of a slide's time-lapse for its chart: those keys (true: the portal pressure and flow, the meal's). */
export const trailKeys = (tool) => (tool?.lines ? modelLines(tool.lines) : true);
/** A value with its unit as the card prints it: "10.2 kPa", but "88%" (a unit that starts with % is the number's own sign). */
// alloc-rare: a printed value's text, made only when the printed number changes (paint) or a chart is built
export const withUnit = (v, d, unit) => `${fmt(v, d)}${unit[0] === '%' ? '%' : ` ${unit}`}`;
const NICE = [1, 2, 2.5, 5, 10];
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); return NICE.find((s) => s * p >= raw - 1e-9) * p; };
const ticksOf = (lo, hi, step) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => +(lo + k * step).toPrecision(6));
// A line's range as it is fitted: the values' own span with `pad` (a share of it) kept clear above and below, never under zero. A
// line that does not move at all (a span of nothing) gets a small span around its value, so it sits mid-axis and not on a rule.
const PAD = 0.08;
function rangeOf(v, pad = PAD) {
  const lo0 = Math.min(...v), hi0 = Math.max(...v), span = hi0 - lo0;
  if (span < 1e-6 * (Math.abs(hi0) + 1)) { const h = Math.max(Math.abs(hi0) * 0.05, 0.5); return [Math.max(0, lo0 - h), hi0 + h]; }
  return [Math.max(0, lo0 - span * pad), hi0 + span * pad];
}
// The nice step (and the first gridline under the range's start) that covers [a, b] in exactly n steps.
function fitSteps(a, b, n) {
  let step = niceStep(Math.max(1e-6, (b - a) / n));
  for (let i = 0; i < 12; i++, step = niceStep(step * 1.0001)) {
    const lo = Math.floor(a / step + 1e-9) * step;
    if (lo + n * step >= b - 1e-9 * step) return { lo, step };
  }
  return { lo: 0, step: niceStep(b / n) };
}
const scaleOf = ({ lo, step }, n) => { const ticks = ticksOf(lo, lo + n * step, step); return { min: ticks[0], max: ticks.at(-1), ticks }; };
// A line with a scale of its own, [min, max, step] (body weight: 84 to 100% in fours, its 88% on a gridline).
const fixedScale = ([lo, hi, step]) => scaleOf({ lo, step }, Math.round((hi - lo) / step));
/** The two axes of a chart, left (the lower line, vl) and right (the upper, vu), each fitted tight to its own line so each fills the
 *  plot's whole height, and cut in the same number of steps so the gridlines are one set and both axes' numbers sit on them. A line
 *  with a scale given (LINE option scale) keeps it and the other is fitted to its step count; else the count (2 to 5) that wastes the
 *  least of either axis, four preferred. → [left scale, right scale], each { min, max, ticks }. */
export function pairScales(vl, vu, optL = {}, optU = {}) {
  if (optL.scale) { const L = fixedScale(optL.scale), n = L.ticks.length - 1, [a, b] = rangeOf(vu, optU.pad); return [L, scaleOf(fitSteps(a, b, n), n)]; }
  if (optU.scale) { const U = fixedScale(optU.scale), n = U.ticks.length - 1, [a, b] = rangeOf(vl, optL.pad); return [scaleOf(fitSteps(a, b, n), n), U]; }
  const [la, lb] = rangeOf(vl, optL.pad), [ua, ub] = rangeOf(vu, optU.pad);
  let best = null;
  for (const n of [4, 3, 5, 2]) {
    const L = fitSteps(la, lb, n), U = fitSteps(ua, ub, n), waste = Math.max(n * L.step / (lb - la), n * U.step / (ub - ua));
    if (!best || waste < best.waste - 1e-9) best = { n, L, U, waste };
  }
  return [scaleOf(best.L, best.n), scaleOf(best.U, best.n)];
}

/** trail: [[day, ...the model's lines], ...] → { min (the clock: minutes, or days), pv (the lower line), flow (the upper), one
 *  value a step from ax.from to ax.end, each one's scale, and ax }. On the meal clock the trail's first day is the meal
 *  (0 min), its last the end of the rise; on the 'days' clock each model day is its own step. lines: their keys, their scales;
 *  given: the end value of a line the slide gives (LINE option given), which climbs from 0 to it as the time-lapse runs. */
export function flowTimeSeries(trail, clock = 'meal', lines = MEAL_LINES, given = null) {
  const model = modelLines(lines), col = (k) => 1 + model.indexOf(k);
  const pts = (trail || []).filter((r) => r && model.every((k) => Number.isFinite(r[col(k)])));
  if (pts.length < 2 || lines.some((k) => opt(k).given && !Number.isFinite(given?.[k]))) return null;
  const d0 = pts[0][0], span = Math.max(1e-6, pts.at(-1)[0] - d0);
  const ax = clock === 'days' ? { from: 0, rise: Math.max(1, Math.round(span)), end: Math.max(1, Math.round(span)) } : MINUTES;
  const x = lines.map((k) => LINE[k]?.[4] ?? 1);
  const at = (j, m) => {
    const p = clamp(m / ax.rise, 0, 1), k = lines[j];
    if (opt(k).given) return ((opt(k).base || 0) - (opt(k).base ? 1 : -1) * given[k] * p) * x[j];
    const d = d0 + span * p, i = clamp(pts.findIndex((r) => r[0] >= d), 1, pts.length - 1);
    const f = clamp((d - pts[i - 1][0]) / Math.max(1e-9, pts[i][0] - pts[i - 1][0]), 0, 1);
    return (pts[i - 1][col(k)] + (pts[i][col(k)] - pts[i - 1][col(k)]) * f) * x[j];
  };
  const min = Array.from({ length: ax.end - ax.from + 1 }, (_, k) => ax.from + k);
  const pv = min.map((m) => at(0, m)), flow = min.map((m) => at(1, m));
  const [pScale, fScale] = pairScales(pv, flow, opt(lines[0]), opt(lines[1]));
  return { min, pv, flow, pScale, fScale, ax };
}

// (2 Nov 2026: the chart is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = svgModel;
// The plot, drawn at the chart's own size in pixels with the card's small type (f): both lines over the plot's full height, the
// clock under it. Each axis's numbers sit on its own side (the lower line's left, the upper's right), in its line's colour; the
// legend names the two lines (with their units) over the plot, on one row when it fits, else two.
let legendKeys = null, legendF = 0, legendOut = null;
// (The legend's entries for these lines in this type size, kept: asked again for the same lines and size, the same list is handed back.)
function legendOf(keys, f) {
  if (legendOut && keys === legendKeys && f === legendF) return legendOut;
  // alloc-rare: only when the lines or the type size change from the last asked
  legendOut = keys.map((key) => { const [name, unit, , c] = LINE[key]; return { c, name, unit, w: 22 + cw(name, f, 1) + 6 + cw(unit, f) }; });
  legendKeys = keys; legendF = f;
  return legendOut;
}
const FT_H = { min: 0, preferred: 0, height: null };   // (the fit's answer: one record, written again by the next call; read at once)
// A full-width chart needs room for both plots as well as its legend, clock and treatment bars. Below this
// minimum the presenter keeps its existing fit, rather than protecting a chart whose labels would collide.
export function flowTimeHeight(w, f, room, keys = MEAL_LINES, bandEm = 0) {
  const legend = legendOf(keys, f), rows = legend[0].w + legend[1].w + 2 * f <= w ? 1 : 2;
  const bands = bandEm * f, min = (rows * 1.5 + 1.9 + 1.7 + 6) * f + bands;
  const preferred = Math.max(0.6 * w, 15 * f) + bands;
  const r = FT_H;
  r.min = min; r.preferred = preferred; r.height = room >= min ? Math.min(preferred, room) : null;
  return r;
}
const linesOf = (keys) => keys.map((key, j) => { const [name, unit, d, c] = LINE[key]; return j ? ['flow', 'fScale', null, c, name, unit, d] : ['pv', 'pScale', null, c, name, unit, d]; });
const dec = (sc) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);
const NO_BOXES = [];
const YV = [0, 0], CY = [0, 0];
/** Whether a line's value goes left of its head: when, drawn right of it (its baseline 0.7 f over the head, in type 1.1 f),
 *  it would run off the chart (width w) or onto one of the numbers in the right margin (boxes: [x0, x1, y0, y1], the upper
 *  band's gridline numbers), as the ascites ending at 1.2 L ran onto the "1.5" of its own scale. */
export function headLeft(hx, hy, tw, f, w, boxes = NO_BOXES) {
  const x0 = hx + 0.6 * f, x1 = x0 + tw, y1 = hy - 0.7 * f + 0.25 * f, y0 = y1 - 1.1 * f;
  if (x1 > w) return true;
  for (let i = 0; i < boxes.length; i++) { const q = boxes[i]; if (x0 < q[1] && q[0] < x1 && y0 < q[3] && q[2] < y1) return true; }
  return false;
}

const yOf = (band, sc) => (v) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
// (The treatments under the clock: their names on one row, then a thin bar each. The chart is that much taller
// (styles/app.css .pz-flowtime.has-bands sets the same room, in em), so the plot keeps the height it has without them.)
const bandRoom = (rxN, f) => (rxN ? (1.4 + 0.32 * rxN) * f : 0);
const rxGap = (rxN, f) => (rxN ? Math.max(3, f * 0.3) + 2 : 0);   // (the left numbers stand clear of the treatment bars' start too)
/** The geometry for a chart w × h px in type f px. The plot has an inner padding all round (11 Nov 2026: the numbers stood on the rings, the
 *  clock's numbers on the lines, the lowest value under the box's edge): the lines run ix px inside the plot's two sides, so the axis
 *  numbers in the margins stand clear of every start ring and head dot, and iy px above its foot, so the clock's own band under the plot
 *  keeps its numbers off the lines. The gridlines and the axis still run the plot's whole width. */
export function flowGeo(ser, clock, keys, rxN, w, h, f) {
  const meal = clock !== 'days', keysL = legendOf(keys, f), ax = ser.ax;
  const oneRow = keysL[0].w + keysL[1].w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow ? 1 : 2) * rowH;
  const tw = (sc) => Math.max(...sc.ticks.map((v) => cw(fmt(v, dec(sc)), f)));
  // (Right of the plot: the upper line's numbers, and the clock's unit in capitals after half its last number.)
  // (The plot is one rounded panel the chart's full width, his G2 look, plot-look.js: the numbers stand inside its edge, 8 px in from it.)
  const half = cw(`+${ax.end}`, f) / 2 + 6, L = Math.ceil(tw(ser.pScale) + 14 + rxGap(rxN, f)), R = Math.floor(w - Math.max(tw(ser.fScale) + 14, half + (meal ? 3 : 4) * f * 0.78 + 10));
  // (Room over the plot for the "Fasting" and "Meal" row, else for the upper line's value over its head.)
  const T = legH + 1.9 * f, B = h - 1.7 * f - bandRoom(rxN, f), ph = Math.max(2 * f, B - T), ix = Math.max(4, f * 0.42) + 5, iy = 0.55 * f;
  return { w, h, f, half, meal, keysL, oneRow, rowH, keyH: legH, L, R, T, B, ix, iy, FB: [T, T + ph - iy], PB: [T, T + ph - iy] };   // (both axes the plot's full height: the lines may overlap)
}
/** Minute m's x on the plot (inside its sides by ix). */
export const xAt = (G, ax, m) => G.L + G.ix + (G.R - G.L - 2 * G.ix) * (m - ax.from) / (ax.end - ax.from);
// Each band's gridlines, numbered on its own side in its line's colour: every line when they are 1.3 lines of type
// apart or more, else the ends only (else the top alone).
const showsOf = (sc, Y, f) => {
  const gap = Math.abs(Y(sc.ticks[0]) - Y(sc.ticks.at(-1))) / Math.max(1, sc.ticks.length - 1);
  return (j) => gap >= 1.3 * f || j === sc.ticks.length - 1 || (j === 0 && gap * (sc.ticks.length - 1) >= 1.3 * f);
};
/** The boxes [x0, x1, y0, y1] of a band's shown gridline numbers: on the left of the plot (side 0) or the right (side 1). */
function numberBoxes(G, sc, Y, side, rxN) {
  const show = showsOf(sc, Y, G.f), x = side ? G.R + 6 : G.L - 6 - rxGap(rxN, G.f);
  return sc.ticks.flatMap((v, j) => { if (!show(j)) return []; const t = cw(fmt(v, dec(sc)), G.f), y = Y(v); return [[side ? x : x - t, side ? x + t : x, y - 0.45 * G.f, y + 0.55 * G.f]]; });
}
/** Everything the chart's first values and head labels keep clear of, and where the first values stand: { lines (each: Y, first y), starts
 *  ([{ x, y, txt }] per line, wholly inside the panel above the clock's band), rings, right (the upper band's numbers, for headLeft) }.
 *  LINES: linesOf(keys). One call per chart made. */
export function startPlan(G, ser, LINES, rxN) {
  const f = G.f, ax = ser.ax, rs = Math.max(3, f * 0.3) + 2, rd = Math.max(4, f * 0.42) + 2;
  const ls = LINES.map(([k, s, , , , unit, d]) => ({ k, unit, d, Y: yOf(k === 'flow' ? G.FB : G.PB, ser[s]) }));
  const left = numberBoxes(G, ser.pScale, ls[0].Y, 0, rxN), right = numberBoxes(G, ser.fScale, ls[1].Y, 1, rxN);
  const x0 = xAt(G, ax, ax.from), x1 = xAt(G, ax, ax.end), xm = xAt(G, ax, 0), rects = [...left, ...right], soft = [];
  const lines = ls.map((l) => ser.min.map((m, j) => [xAt(G, ax, m), l.Y(ser[l.k][j])]));
  if (G.meal) {
    const fw = cw('Fasting', f, 1), mw = cw('Meal', f, 1), ty = G.T - 0.6 * f;
    rects.push([(x0 + xm) / 2 - fw / 2, (x0 + xm) / 2 + fw / 2, ty - 0.78 * f, ty + 0.25 * f], [xm + 6, xm + 6 + mw, ty - 0.78 * f, ty + 0.25 * f]);
    soft.push([xm - 1, xm + 1, G.T - 1.5 * f, G.B]);
  }
  const own = ls.map((l) => [x0, l.Y(ser[l.k][0]), rs]), circles = [...own, ...ls.map((l) => [x1, l.Y(ser[l.k].at(-1)), rd])];
  const txt = ls.map((l) => withUnit(ser[l.k][0], l.d, l.unit));
  const at = placeStarts({ f, area: [3, G.w - 3, G.keyH + 0.1 * f + 3, G.B - 1], texts: txt, own, circles, lines, rects, soft });
  return { ls, own, circles, right, pts: lines, starts: at.map((a, i) => ({ x: a.x, y: a.y, box: a.box, txt: txt[i], r: rs })), left, rects };
}

export function createFlowTime() {
  const reduceMQ = reduceMotionMQ;   // (one query, read each frame: a new one was made every frame)
  const el = document.createElement('div');
  el.className = 'pz-flowtime';
  const gl = createSvgGL(el, { host: 'flowtime' });
  el.dataset.lines = MEAL_LINES.join(',');
  let ser = null, parts = null, shown = 0, goal = 0, raf = 0, lastT = 0, sig = '', clock = 'meal', keys = MEAL_LINES, given = null, LINES = linesOf(keys);
  let rx = [];   // (the treatments on through the slide's time-lapse that its tool shades, rx-bands.js; none on a built-in deck)
  const ax = () => ser?.ax || MINUTES;
  const Yof = yOf;
  const val = (arr, m) => { const j = clamp(Math.floor(m - ax().from), 0, arr.length - 2); return arr[j] + (arr[j + 1] - arr[j]) * clamp(m - ax().from - j, 0, 1); };
  let G = null;
  const geo = (w, h, f) => flowGeo(ser, clock, keys, rx.length, w, h, f);
  const X = (m) => xAt(G, ax(), m);
  function build() {
    const { f, L, R, T, B, FB, PB, meal } = G;
    const lines = LINES.map(([k, s, , c, , unit, d]) => ({ k, unit, d, c, Y: Yof(k === 'flow' ? FB : PB, ser[s]),
      path: sv('path', { class: 'ptk-line', 'data-look': 'plot.line', 'data-p-c': tokName(c) }),
      dot: sv('circle', { class: 'pft-dot', 'data-look': 'ft.dot', 'data-p-c': tokName(c), r: Math.max(4, f * 0.42) }),
      val: sv('text', { class: 'pft-v', 'data-look': 'ft.v', 'data-p-c': tokName(c) }) }));
    // The first values at the start, each placed clear of both rings, both lines, the axis numbers and each other, wholly inside the
    // panel (flow-time-labels.js: over its ring, under it, or beside it, whichever is nearest and clear).
    const plan = startPlan(G, ser, LINES, rx.length);
    const start = plan.starts.map(({ x, y, txt }, i) => [sv('circle', { class: 'pft-start', 'data-look': 'ft.start', 'data-p-c': tokName(lines[i].c), cx: plan.own[i][0], cy: plan.own[i][1], r: Math.max(3, f * 0.3) }),
      sv('text', { class: 'pft-v0', 'data-look': 'ft.v0', 'data-p-c': tokName(lines[i].c), x, y }, txt)]);
    const [lp, lf] = lines;
    // (The two axes share their steps, so one set of gridlines serves both: the left axis draws them, the right one only its numbers.)
    const grid = (sc, Y, x, anchor, c, rules = true) => {
      const show = showsOf(sc, Y, f);
      return sc.ticks.map((v, j) => sv('g', { class: 'ptk-grid' }, rules ? sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: Y(v), y2: Y(v) }) : null,
        show(j) ? sv('text', { 'data-look': 'time.grid.text', 'data-p-c': tokName(c), x, y: Y(v) + 0.35 * f, 'text-anchor': anchor }, fmt(v, dec(sc))) : null));
    };
    // The legend: each line's swatch, name and unit; the lower line's on the left, the upper's on the right (or under it).
    const legend = G.keysL.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        sv('line', { 'data-look': 'time.key.line', 'data-p-c': tokName(k.c), x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0 }),
        sv('text', { 'data-look': 'time.key.text', 'data-p-c': tokName(k.c), x: right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start' },
          right ? [sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, `${k.unit} `), sv('tspan', { 'data-look': 'time.span' }, k.name)] : [sv('tspan', { 'data-look': 'time.span' }, k.name), sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, ` ${k.unit}`)])); });
    const mins = [], step = meal ? 10 : niceStep(ax().end / Math.max(2, Math.min(4, Math.floor((R - L) / (4 * f)))));
    for (let m = ax().from; m <= ax().end + 1e-9; m += step) mins.push(m);
    const boxes = plan.right;   // (the upper band's numbers shown in the right margin: boxes a line's value keeps clear of)
    // Each treatment on through the whole time-lapse (it runs on the slide's own params): its name in its colour on one row
    // under the clock, then a thin bar each in the same order and colour, over the plot's whole time, so every bar starts
    // where the treatment does and no line, value or number can run into them.
    const bandEls = rx.length ? sv('g', { class: 'pft-bands' },
      sv('text', { class: 'pft-band-n', 'data-look': 'time.span', x: L, y: B + 2.55 * f }, rx.map((k, j) => sv('tspan', { 'data-look': 'ft.band.name', 'data-p-rx': tokName(RX[k][2]) }, (j ? '  ·  ' : '') + RX[k][0]))),
      rx.map((k, j) => sv('rect', { class: 'pft-band', 'data-look': 'ft.band.bar', 'data-p-rx': tokName(RX[k][2]), 'data-rx': k, x: L, width: Math.max(2, R - L), y: B + 2.8 * f + j * 0.32 * f, height: 0.2 * f, rx: 0.1 * f }))) : null;
    // (The panel under everything: from just under the legend to the chart's foot, its full width, so the treatments' names and bars under the
    // clock stand inside it; with none, the foot is 1.7 em under the axis, under the clock's numbers.)
    const panel = plotPanel(sv, 0, G.keyH + 0.1 * f, G.w, G.h - (G.keyH + 0.1 * f));
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${G.f.toFixed(2)}px` },
      sv('defs', {}, panel.clip), panel.back, bandEls, grid(ser.fScale, lf.Y, R + 6, 'start', lf.c, false), grid(ser.pScale, lp.Y, L - 6 - rxGap(rx.length, f), 'end', lp.c), legend,
      sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
      mins.map((m) => sv('text', { class: 'pft-tk', 'data-look': 'time.tk', x: X(m), y: B + 1.25 * f, 'text-anchor': 'middle' }, m > 0 ? `+${m}` : m < 0 ? `−${-m}` : '0')),
      sv('text', { class: 'ptk-ax', 'data-look': 'plot.ax', x: X(ax().end) + G.half, y: B + 1.25 * f }, meal ? 'min' : 'days'),
      // Fasting, then the meal: a dashed line at 0 min.
      meal ? [sv('text', { class: 'pft-t', 'data-look': 'ft.t', x: (X(MINUTES.from) + X(0)) / 2, y: T - 0.6 * f, 'text-anchor': 'middle' }, 'Fasting'),
        sv('line', { class: 'pft-meal', 'data-look': 'ft.meal', x1: X(0), x2: X(0), y1: T - 1.5 * f, y2: B }),
        sv('text', { class: 'pft-t meal', 'data-look': 'ft.t', x: X(0) + 6, y: T - 0.6 * f }, 'Meal')] : null,
      lines.map((l) => l.path), start, lines.map((l) => [l.dot, l.val]));
    return { svg, lines, boxes };
  }
  // Draw the lines up to minute m, each line's value over its head (flipped left near the right edge).
  // (Written every frame of a glide, so nothing here makes a list or a string for the lines: each line is held as points in a typed array
  // kept on the line, grown as points are passed; a printed value, its width and the chart's label are made again only when the printed
  // number changes.)
  function paint(m) {
    if (!parts) return;
    const ls = parts.lines, mins = ser.min, nm = mins.length;
    let n = 0, printed = false;
    while (n < nm && mins[n] < m) n++;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], arr = ser[l.k], hx = X(m), v = val(arr, m), hy = l.Y(v);
      // (The line is held on its piece as points (setPts): the passed points written once, as they are passed, then the head at index n,
      // written in place each frame. Every coordinate is taken to the tenth, as the path text was, so the picture is the same.)
      let P = l.pts;
      // alloc-rare: the line's kept points, made once per line of a chart (a chart is made again when its size or trail changes)
      if (!P) { P = l.pts = new Float64Array(2 * (nm + 1)); l.nf = 0; }
      for (let c = l.nf; c < n; c++) { P[2 * c] = round1(X(mins[c])); P[2 * c + 1] = round1(l.Y(arr[c])); }
      if (n > l.nf) l.nf = n;
      P[2 * n] = round1(hx); P[2 * n + 1] = round1(hy);
      setPts(l.path, P, n + 1, false);
      const key = printedKey(v, l.d);
      if (key !== l.pk) {
        l.pk = key; printed = true;
        // alloc-rare: only when the printed number changes
        l.txt = withUnit(v, l.d, l.unit);
        l.tw = cw(l.txt, G.f * 1.1, 1);
      }
      const left = headLeft(hx, hy, l.tw, G.f, G.w, parts.boxes);
      setGeo(l.dot, 'cx', fix1(hx)); setGeo(l.dot, 'cy', fix1(hy));
      setGeo(l.val, 'x', fix1(hx + (left ? -0.6 : 0.6) * G.f)); setGeo(l.val, 'y', fix1(hy - 0.7 * G.f));
      setGeo(l.val, 'text-anchor', left ? 'end' : 'start');
      setWords(l.val, l.txt);   // (kept on the piece and drawn by the picture: no text node, no mutation, nothing read again)
      classSoon(l.val, 'off', m - ax().from < 0.36 * (ax().end - ax().from));   // (near the start the first value is already there)
      YV[i] = round1(hy - 0.7 * G.f); CY[i] = round1(hy);
    }
    // (Two heads close together, the bands short on a phone: the lower band's value goes under its head, clear of the other.)
    const a = YV[0], b = YV[1];
    if (Math.abs(a - b) < 1.4 * G.f) { const j = a > b ? 0 : 1; setGeo(ls[j].val, 'y', fix1(Math.min(CY[j] + 1.5 * G.f, G.B - 0.25 * G.f))); }   // (never under the plot, onto the clock's numbers)
    if (printed) {
      // alloc-rare: only when a printed number changed
      let label = `${LINES[0][4]} and ${LINES[1][4].toLowerCase()} ${clock === 'days' ? `over ${ax().end} days` : 'around a meal'}: `;
      // alloc-rare: only when a printed number changed
      for (let j = 0; j < LINES.length; j++) { const [k, , , , name, unit, d] = LINES[j]; label += `${j ? ', ' : ''}${name.toLowerCase()} ${withUnit(ser[k][0], d, unit)} to ${ls[j].txt}`; }
      attrSoon(parts.svg, 'aria-label', label);
    }
    // (The points drawn so far, of data-of: the browser checks read them.)
    if (parts.pn !== n + 1) {
      parts.pn = n + 1;
      // alloc-rare: only when a point is passed
      dataSoon(parts.svg, 'points', String(n + 1));
    }
    if (!parts.of) {
      parts.of = true;
      // alloc-rare: once per chart
      dataSoon(parts.svg, 'of', String(nm));
    }
  }
  // The heads glide after the goal (never a jump).
  // (By time, not by frame: 1 - exp(-dt / tau) of the way each frame, the same curve at any refresh rate; headStep, display-state.js.)
  function tick(t) {
    raf = 0;
    const dt = lastT ? (t - lastT) / 1000 : HEAD_DT0;
    shown = reduceMQ.matches ? goal : headStep(shown, goal, dt);
    if (Math.abs(goal - shown) < 0.001 * (ax().end - ax().from)) shown = goal;
    paint(shown);
    gl.paint();   // (the picture draws the moved heads in this same frame)
    if (shown !== goal) { lastT = t; raf = nextFrame(tick); } else lastT = 0;
  }
  // The chart's size: the box the card gives it (its height is set in CSS, shorter as the card fits), in its small type.
  // (The card zooms its contents to its own scale, a Mac's data card to 0.8 and an iPad's lower: the chart's type is set larger
  // by as much, so its words are never under 12 px on the screen; they were 9.6 px on a Mac and 8 px on an iPad held sideways.)
  const size = () => {
    const w = el.clientWidth;
    const f = fittedType(el, gl, FT_MIN);   // (the card's small type from the chart's looks table, never under the least)
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 260), f];
  };
  let lastSz = '';
  const make = () => { const [w, hh, f] = size(); lastSz = [w, hh, f].map((x) => Math.round(x)).join('x'); G = geo(w, hh, f); return build(); };
  // Redrawn at once when the box changes size (a new card width, the card fitting itself): the same lines, the new geometry.
  // (And when the card's zoom changes with the box the same size: the observer does not see a zoom, so the card tells the chart when it
  // has fitted, refit. A chart first drawn while the fit tried the card at half size kept its type at 24 px for good, Varices 3 on an iPad.)
  const remake = () => {
    if (!ser || !parts || !el.isConnected) return;
    const sz = size().map((x) => Math.round(x)).join('x'); if (sz === lastSz) return;
    const prev = parts.svg; parts = make(); prev.replaceWith(parts.svg); paint(shown); gl.place(parts.svg);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(remake) : null;
  ro?.observe(el);
  // k: how far along the time-lapse (0 to 1): its minutes on the rise; once it has ended, the held state to the end.
  const minuteOf = (k) => (k >= 1 ? ax().end : ax().rise * clamp(k, 0, 1));
  return {
    el,
    /** The chart is done with (a presentation's own instruments go with it): its glide and its size observer are let go. */
    dispose() { cancelFrame(raf); raf = 0; lastT = 0; ro?.disconnect(); gl.dispose(); },
    /** trail: the time-lapse's [[day, ...the model's lines]] (null: not computed yet; undefined: keep the one drawn);
     *  k: how far along it to draw (0 to 1); spec: { clock: 'meal' | 'days', lines: [lower, upper], given? } (undefined: keep
     *  the one drawn). A new trail fades in over the old chart. */
    set(trail, k = 1, spec) {
      if (spec) { clock = spec.clock || 'meal'; keys = spec.lines || MEAL_LINES; given = spec.given || null; el.dataset.lines = keys.join(','); el.classList.toggle('days', clock === 'days'); }
      const s2 = trail === undefined ? sig : trail ? JSON.stringify([clock, keys, given, trail[0], trail.at(-1), ...(rx.length ? [rx] : [])]) : '';
      if (s2 !== sig) {
        sig = s2; LINES = linesOf(keys); ser = flowTimeSeries(trail, clock, keys, given);
        const old = [...el.children].filter((c) => c.hasAttribute('data-svg-model'));
        parts = ser ? make() : null;
        shown = goal = minuteOf(k);
        // (The new chart fades in over the old, in the GPU's picture, on the stylesheet's old ease, --d-surface on --ease.)
        if (parts) { el.append(parts.svg); paint(shown); gl.place(parts.svg); gl.fadeIn(parts.svg, D_SURFACE, EASE_ARRIVE); }
        // alloc-rare: only when a new trail is set (a new chart fades in over the old), never per frame
        setTimeout(() => restPass(() => { old.forEach((o) => o.remove()); gl.paint(); }), 480);
        return;
      }
      goal = minuteOf(k);
      if (!raf) raf = nextFrame(tick);
    },
    /** The slide's tool and context (presenter-tools.js show): bands names the treatments to draw, each shown when the
     *  slide's state has it on (its time-lapse runs on the slide's own params). */
    configure(t, ctx) {
      rx = bandKeys(t).filter((k) => RX[k][1](ctx?.params));
      el.classList.toggle('has-bands', rx.length > 0);
      el.style.setProperty('--band-room', `${rx.length ? 1.4 + 0.32 * rx.length : 0}em`);
    },
    update() {}, clear() {},
    /** The card has fitted: drawn again if its zoom, and so the chart's type, is not what it was drawn at. */
    refit: remake,
  };
}
