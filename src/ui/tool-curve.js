// Deck visuals V4: a parameter curve in the data card (package C, review/deck-visuals-recs.md §9).
//
//   tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }
//
// The x axis is one setting (a dotted params path) from `from` to `to`; the y axis one or two readings (fingerprint keys,
// named and scaled as their tiles are). Each point is the slide's own state with only that setting changed and settled,
// worked out once on the presenter's own calculation worker (ctx.run) and kept for the deck. The first line's cut-offs
// (its tile's bands) sit behind as dashed lines, and a ring on each line marks where the slide's case sits; with a what-if
// slider on the same setting, the rings glide along the lines as it is dragged. Until the points are ready, the axes and the
// rings show and the lines then fade in (never a spinner).
// Optional: label and unit (the x axis's words, for a setting PARAM does not know), and also (params every point carries).

import { TILE, SCALE, RATE } from './table-marks.js?v=810c0a1575';
import { frameFor } from './frame.js?v=67ca200c87';
const nextFrame = frameFor('tool-curve');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const CV_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
const MAX_PTS = 41;

// The settings a curve knows by name: the axis's words, its unit, its decimals and a scale on the model's value.
export const PARAM = {
  'tips.d': ['TIPS diameter', 'mm', 0], 'dips.d': ['DIPS diameter', 'mm', 0],
  cirrhosis: ['Cirrhosis', '%', 0, 100], gestation: ['Weeks pregnant', 'weeks', 0], albumin: ['Serum albumin', 'g/dL', 1],
  splanchnicTone: ['Splanchnic tone', '×', 2], systemicTone: ['Systemic tone', '×', 2], contractility: ['Right heart contractility', '×', 2],
  tr: ['Tricuspid regurgitation', '%', 0, 100], pericardial: ['Pericardial constraint', '%', 0, 100], apShunt: ['Arterioportal shunting', '%', 0, 100],
};
// A line's colour by reading (the app's trace colours); any other reading takes its place's.
const COLOR = { ppg: '--tr-pv', pv: '--tr-pv', hvpg: '--tr-wedge', whvp: '--tr-wedge', sin: '--tr-wedge', fhvp: '--tr-hv', ivc: '--tr-ivc', ra: '--tr-ra', varix: '--tr-var', liver: '--tr-hv', pvFlow: '--tr-hv', shunt: '--tr-cav' };
const PLACE = ['--tr-pv', '--tr-hv'];

export const pathOf = (p) => String(p || '').split('.').filter(Boolean);
/** The value at a dotted path of a params object. */
export const getAt = (o, path) => pathOf(path).reduce((x, k) => x?.[k], o);
/** The params patch that sets path to v (a TIPS or DIPS diameter switches its shunt on), merged over also. */
export function patchOf(path, v, also = null) {
  const keys = pathOf(path), out = also ? structuredClone(also) : {};
  let at = out;
  keys.slice(0, -1).forEach((k) => { at = at[k] = at[k] && typeof at[k] === 'object' ? at[k] : {}; });
  at[keys.at(-1)] = v;
  if (keys.length === 2 && (keys[0] === 'tips' || keys[0] === 'dips') && keys[1] === 'd') at.on = true;
  return out;
}
/** The setting's values along the axis, from `from` to `to` (both kept), at most 41 of them. */
export function curveXs(t) {
  const a = +t.from, b = +t.to;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [];
  const step = Math.max(Math.abs(+t.step || (b - a) / 10), Math.abs(b - a) / (MAX_PTS - 1)), n = Math.round(Math.abs(b - a) / step);
  return Array.from({ length: n + 1 }, (_, k) => +(a + (b - a) * (k / n)).toPrecision(10));
}
/** The steps for ctx.run: each point the slide's state with the setting changed (every step carries its full patch, so no
 *  point depends on the one before). */
export const curveSteps = (t) => curveXs(t).map((x) => ({ params: patchOf(t.param, x, t.also) }));
/** The readings plotted (one or two fingerprint keys). */
export const curveLines = (t) => [].concat(t.lines || 'ppg').filter((k) => typeof k === 'string').slice(0, 2);
/** A reading's name, unit, decimals, scale and colour (from its tile). */
export function lineMeta(k, j = 0) {
  const tl = TILE[k] || {};
  return { k, name: (tl.t?.length <= 14 ? tl.t : tl.n || tl.t) || k, unit: tl.u || '', d: tl.d ?? 1, x: tl.x ?? 1, c: COLOR[k] || PLACE[j] || PLACE[0] };
}
/** The x axis's words, unit, decimals and scale. */
export function axisMeta(t) {
  const p = PARAM[t.param] || [];
  return { name: t.label || p[0] || pathOf(t.param).at(-1) || '', unit: t.unit ?? p[1] ?? '', d: p[2] ?? (curveXs(t).some((x) => x % 1) ? 1 : 0), x: p[3] ?? 1 };
}
/** The series: { xs, ys: [[…] per line] } in shown units, from the run's states (null where a point failed). */
export function curveSeries(t, states) {
  const xs = curveXs(t), ls = curveLines(t).map(lineMeta), ax = axisMeta(t);
  if (!Array.isArray(states) || states.length !== xs.length) return null;
  const ys = ls.map((l) => states.map((s) => (Number.isFinite(s?.fp?.[l.k]) ? s.fp[l.k] * l.x : null)));
  return { xs: xs.map((x) => x * ax.x), ys };
}

// ── Scales ──
const NICE = [1, 2, 2.5, 5, 10];
export const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw)))); return NICE.find((s) => s * p >= raw - 1e-9) * p; };
const ticksOf = (lo, step, n) => Array.from({ length: n }, (_, k) => +(lo + k * step).toPrecision(8));
/** A reading's cut-offs in shown units, each with its rating ('mid', 'hi'), from its tile's scale bar. */
export function cutsOf(k) {
  const s = SCALE[k], x = TILE[k]?.x ?? 1;
  if (!s || !RATE[k]) return [];
  // (A cut-off takes the worse of the two ratings either side of it: 12 mmHg starts the PPG's red, 55 % ends the liver flow's.)
  const rate = (v) => RATE[k](v / x, { asc: 1e9 })[0], worse = (a, b) => (a === 'hi' || b === 'hi' ? 'hi' : a === 'mid' || b === 'mid' ? 'mid' : null);
  return s[2].map((c) => ({ v: c, rate: worse(rate(c - 1e-6), rate(c + 1e-6)) })).filter((c) => c.rate);
}
const PRESSURE = new Set(['ppg', 'pv', 'hvpg', 'whvp', 'fhvp', 'sin', 'ivc', 'ra']);
/** The first line's scale: a pressure from zero (so a rise keeps its true size), up to a cut-off that lies close above its
 *  values (so its band shows); any other reading on a tight scale around its values. About four steps. */
export function leftScale(k, vals) {
  const v = vals.filter(Number.isFinite);
  if (!v.length) return { min: 0, max: 1, ticks: [0, 1] };
  let a = Math.min(...v), b = Math.max(...v);
  if (PRESSURE.has(k)) {
    a = 0;
    for (const c of cutsOf(k)) if (c.v > b && c.v <= b * 1.6) b = c.v;
  }
  if (b - a < 1e-6) { b = a + Math.max(1, Math.abs(a) * 0.2); }
  // (Of the nice steps giving three to six gaps and at most seven numbers, the one whose top wastes least above the values
  // while leaving a little room over them for a cut-off's name: 0 to 25 for an HVPG of 22, not 0 to 30. Whole numbers win
  // over halves when the range is wide.)
  let best = null;
  for (const gaps of [3, 4, 5, 6]) {
    const bh = b + 0.06 * (b - a), step = niceStep((b - a) / gaps), lo = Math.floor(a / step + 1e-9) * step, n = Math.max(2, Math.ceil((bh - lo) / step - 1e-9) + 1);
    const top = lo + step * (n - 1), waste = (top - b) / (b - a);
    if (n > 7) continue;
    const score = waste + (b - a >= 4 && step % 1 ? 0.5 : 0);
    if (!best || score < best.score + 1e-9) best = { score, ticks: ticksOf(lo, step, n) };   // (a tie goes to more numbers)
  }
  return { min: best.ticks[0], max: best.ticks.at(-1), ticks: best.ticks };
}
/** The second line's scale, with as many ticks as the first (so they share its gridlines), around its own values. */
export function rightScale(vals, n) {
  const v = vals.filter(Number.isFinite);
  let a = v.length ? Math.min(...v) : 0, b = v.length ? Math.max(...v) : 1;
  if (b - a < 1e-6) { a -= 1; b += 1; }
  for (let step = niceStep((b - a) / Math.max(1, n - 1)); ; step = niceStep(step * 1.01)) {
    const lo = Math.max(a >= 0 ? 0 : -Infinity, Math.floor(a / step + 1e-9) * step);
    if (lo + step * (n - 1) >= b - 1e-9) return { min: lo, max: +(lo + step * (n - 1)).toPrecision(8), ticks: ticksOf(lo, step, n) };
  }
}
/** The x axis's ticks: its two ends and nice steps between, at most `most` of them. */
export function xTicks(a, b, most = 6) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (let step = niceStep((hi - lo) / Math.max(1, most - 1)); ; step = niceStep(step * 1.01)) {
    const t = []; for (let x = Math.ceil(lo / step - 1e-9) * step; x <= hi + 1e-9; x += step) t.push(+x.toPrecision(8));
    if (t.length <= most) return t;
  }
}
const dec = (sc) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);
const fmt = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const cw = (t, f, b) => String(t).length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)

// ── Where words go: clear of the lines, the cut-offs, the axes and each other ──
const hitBox = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Whether the segment p–q crosses or touches the box [x0, y0, x1, y1] (Liang–Barsky). */
export function segHits([x1, y1, x2, y2], [bx0, by0, bx1, by1]) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - bx0], [dx, bx1 - x1], [-dy, y1 - by0], [dy, by1 - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
/** How many things a box [x0, y0, x1, y1] lands on: horizontal lines ({ y, x0, x1 }), segments, other boxes; outside the
 *  bounds counts most. */
export function boxScore(b, { lines = [], segs = [], boxes = [], bounds = null }) {
  let n = 0;
  if (bounds && (b[0] < bounds[0] || b[1] < bounds[1] || b[2] > bounds[2] || b[3] > bounds[3])) n += 10;
  for (const l of lines) if (l.y > b[1] && l.y < b[3] && l.x0 < b[2] && b[0] < l.x1) n++;
  for (const sg of segs) if (segHits(sg, b)) n++;
  for (const o of boxes) if (hitBox(b, o)) n++;
  return n;
}
/** A word's place: of the candidates ({ x, y, anchor }, in order of liking), the first that lands on the fewest things.
 *  w: its width, fs: its type size. Returns the candidate with its box. */
export function placeWord(cands, w, fs, obstacles) {
  let best = null;
  for (const c of cands) {
    const x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
    const box = [x0 - 2, c.y - 0.82 * fs, x0 + w + 2, c.y + 0.22 * fs];
    const n = boxScore(box, obstacles);
    if (!best || n < best.n) best = { ...c, box, n };
    if (n === 0) break;
  }
  return best;
}

/** The x the slide's case sits at, and each line's value there (shown units): from the live params and fingerprint while a
 *  what-if slider or compare button drives the model, else the slide's own. */
export function ringAt(t, params, fp) {
  const ax = axisMeta(t), x = getAt(params, t.param);
  return { x: Number.isFinite(+x) ? +x * ax.x : null, ys: curveLines(t).map((k) => (Number.isFinite(fp?.[k]) ? fp[k] * lineMeta(k).x : null)) };
}

/** Whether params are the slide's own (base) with only the curve's setting moved: then the case sits on the curve. */
export function onCurve(t, params, base) {
  if (!params || !base) return false;
  const a = structuredClone(params), keys = pathOf(t.param);
  let at = a;
  for (const k of keys.slice(0, -1)) { if (!at[k] || typeof at[k] !== 'object') return false; at = at[k]; }
  at[keys.at(-1)] = getAt(base, t.param);
  if (keys.length === 2 && (keys[0] === 'tips' || keys[0] === 'dips') && keys[1] === 'd') at.on = getAt(base, `${keys[0]}.on`);
  return JSON.stringify(a) === JSON.stringify(base);
}
/** Each line's value on the curve at x (shown units), read between its two nearest points. */
export function curveAt(ser, x) {
  const xs = ser.xs;
  if (!(x >= xs[0] && x <= xs.at(-1))) return null;
  let i = 1; while (i < xs.length - 1 && xs[i] < x) i++;
  const u = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
  return ser.ys.map((ys) => (Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i]) ? ys[i - 1] + (ys[i] - ys[i - 1]) * u : null));
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat(2).filter((k) => k != null));
  return el;
};

// Each deck's curves, kept once worked out (by deck, then slide and tool).
const kept = new WeakMap();
const keepOf = (deck) => { if (!deck) return new Map(); let m = kept.get(deck); if (!m) kept.set(deck, (m = new Map())); return m; };

export function createCurve() {
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const el = document.createElement('div');
  el.className = 'pz-curve';
  let t = null, ctx = null, ser = null, parts = null, G = null, key = '', lastSz = '', raf = 0;
  let ring = null, goal = null;   // ({ x, ys } in shown units: where the rings are drawn, and where they glide to)

  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? CV_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  // The geometry for a chart w × h px in type f px, its scales from the series (or, until it is ready, from the slide's own
  // values and the axis's ends).
  function geo(w, h, f) {
    const ls = curveLines(t).map(lineMeta), ax = axisMeta(t), xs = curveXs(t).map((x) => x * ax.x);
    const vals = ls.map((l, j) => (ser ? ser.ys[j] : [(ring || goal)?.ys[j]]).filter(Number.isFinite));
    const sL = leftScale(ls[0].k, vals[0]), sR = ls[1] ? rightScale(vals[1], sL.ticks.length) : null;
    const keys = ls.map((l) => ({ ...l, w: 22 + cw(l.name, f, 1) + 6 + cw(l.unit, f) }));
    const oneRow = keys.length < 2 || keys[0].w + keys[1].w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow ? 1 : 2) * rowH;
    const tw = (sc) => Math.max(...sc.ticks.map((v) => cw(fmt(v, dec(sc)), f)));
    const xt = xTicks(xs[0], xs.at(-1), Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f)))));
    const L = Math.ceil(tw(sL) + 8), R = Math.floor(w - (sR ? tw(sR) + 8 : Math.max(8, cw(fmt(xs.at(-1), ax.d), f) / 2 + 2)));
    const T = legH + 1.6 * f, B = h - 2.9 * f;
    return { w, h, f, ls, ax, xs, xt, sL, sR, keys, oneRow, rowH, L, R, T, B: Math.max(T + 3 * f, B) };
  }
  const X = (x) => G.L + (G.R - G.L) * (x - G.xs[0]) / ((G.xs.at(-1) - G.xs[0]) || 1);
  const Yof = (sc) => (v) => G.B - (G.B - G.T) * clamp((v - sc.min) / ((sc.max - sc.min) || 1), 0, 1);
  // The data lines' segments on the screen.
  function lineSegs(YL, YR) {
    if (!ser) return [];
    return ser.ys.flatMap((ys, j) => { const Y = j ? YR : YL, out = [];
      for (let i = 1; i < ys.length; i++) if (Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i])) out.push([X(ser.xs[i - 1]), Y(ys[i - 1]), X(ser.xs[i]), Y(ys[i])]);
      return out; });
  }
  function build() {
    const { f, L, R, T, B, sL, sR, ls, ax, xt } = G, YL = Yof(sL), YR = sR ? Yof(sR) : null;
    const grid = sL.ticks.map((v, j) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: YL(v), y2: YL(v) }),
      sv('text', { x: L - 6, y: YL(v) + 0.35 * f, 'text-anchor': 'end', style: `fill: var(${ls[0].c})` }, fmt(v, dec(sL))),
      sR ? sv('text', { x: R + 6, y: YL(v) + 0.35 * f, 'text-anchor': 'start', style: `fill: var(${ls[1].c})` }, fmt(sR.ticks[j], dec(sR))) : null));
    // (The first line's cut-offs, dashed in their rating's colour, where they fall inside its scale.)
    const cutVs = cutsOf(ls[0].k).filter((c) => c.v > sL.min && c.v < sL.max);
    // (Each named, "PPG 12", in its rating's colour: over its line at the right end, else at the left, else under it, clear
    // of the data lines and of the other's name.)
    // (Placed again on every paint, so a name also keeps clear of the rings and the dashed line through them. Measured wide:
    // capitals and figures run wider than the average letter.)
    const segs = lineSegs(YL, YR), cutLabs = [];
    const cuts = cutVs.map((c) => {
      const y = YL(c.v), txt = `${ls[0].name} ${fmt(c.v, Number.isInteger(c.v) ? 0 : 1)}`;
      const el = sv('text', { class: 'pcv-cut' }, txt);
      cutLabs.push({ el, tw: 1.12 * cw(txt, f, true), lines: cutVs.filter((o) => o !== c).map((o) => ({ y: YL(o.v), x0: L, x1: R })),
        cands: [{ x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y - 0.35 * f, anchor: 'start' },
          { x: R - 3, y: y + 1.05 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' }] });
      return sv('g', { class: 'ptk-grid cut', 'data-rate': c.rate }, sv('line', { x1: L, x2: R, y1: y, y2: y }), el);
    });
    const legend = G.keys.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        sv('line', { x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0, style: `stroke: var(${k.c})` }),
        sv('text', { x: right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start', style: `fill: var(${k.c})` },
          right ? [sv('tspan', { class: 'pft-u' }, `${k.unit} `), sv('tspan', {}, k.name)] : [sv('tspan', {}, k.name), sv('tspan', { class: 'pft-u' }, ` ${k.unit}`)])); });
    const axis = [sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      // (The two end numbers stand inside the plot's ends, clear of the corner numbers of the y axes.)
      xt.map((x, i) => sv('text', { class: 'pft-tk', x: X(x), y: B + 1.25 * f, 'text-anchor': X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }, fmt(x, ax.d))),
      sv('text', { class: 'pcv-ax', x: (L + R) / 2, y: B + 2.6 * f, 'text-anchor': 'middle' }, ax.unit && ax.unit !== '×' && !ax.name.toLowerCase().includes(ax.unit.toLowerCase()) ? `${ax.name}, ${ax.unit}` : ax.name)];
    const lines = ls.map((l, j) => {
      const Y = j ? YR : YL, ys = ser?.ys[j];
      const d = ys ? ys.map((y, i) => (Number.isFinite(y) ? [X(ser.xs[i]), Y(y)] : null)).filter(Boolean).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') : '';
      return { l, Y, path: sv('path', { class: 'ptk-line pcv-line', d, style: `stroke: var(${l.c})` }),
        ring: sv('circle', { class: 'pcv-ring', r: Math.max(5, f * 0.45), style: `stroke: var(${l.c})` }),
        val: sv('text', { class: 'pcv-v', style: `fill: var(${l.c})` }) };
    });
    const at = sv('line', { class: 'pcv-at', y1: T - 0.4 * f, y2: B });
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${f.toFixed(2)}px` },
      grid, cuts, legend, axis, at, lines.map((x) => x.path), lines.map((x) => [x.ring, x.val]));
    svg.dataset.points = ser ? String(ser.xs.length) : '0';   // (the browser checks read it: 0 until the curve is ready)
    // (What a ring's value keeps clear of: the cut-offs and their names, the x axis, the data lines.)
    const obstacles = { segs, cutLabs, cutBounds: [L, T - 1.2 * f, R, B - 0.1 * f], boxes: [], lines: [...cutVs.map((c) => ({ y: YL(c.v), x0: L, x1: R })), { y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f] };
    return { svg, lines, at, obstacles };
  }
  // The rings at r: each on its line at the case's setting, its value beside it (left of it near the right edge, and the
  // lower of two close values under its ring).
  function paint(r) {
    if (!parts || !r) return;
    const ok = Number.isFinite(r.x), cx = ok ? X(clamp(r.x, Math.min(G.xs[0], G.xs.at(-1)), Math.max(G.xs[0], G.xs.at(-1)))) : 0, f = G.f;
    parts.at.setAttribute('x1', cx.toFixed(1)); parts.at.setAttribute('x2', cx.toFixed(1));
    parts.at.classList.toggle('off', !ok);
    parts.svg.dataset.ring = ok ? [r.x, ...r.ys.map((v) => (Number.isFinite(v) ? v.toFixed(2) : ''))].join(' ') + (goal?.on ? ' curve' : ' live') : '';   // (the browser checks read it)
    const left = cx > (G.L + G.R) / 2, fs = 1.1 * f, rr = Math.max(5, f * 0.45) + 2;
    const cys = parts.lines.map((p, j) => (ok && Number.isFinite(r.ys[j]) ? p.Y(r.ys[j]) : null));
    // (Each value takes the first spot beside its ring that lands on nothing: the data lines, the cut-offs and their names, the
    // x axis, the dashed line through the rings, both rings and the other value; the side away from the nearer edge first.)
    const ob = parts.obstacles, boxes = [...cys.filter((y) => y != null).map((y) => [cx - rr, y - rr, cx + rr, y + rr]), ...(ok ? [[cx - 1.5, G.T - 0.4 * f, cx + 1.5, G.B]] : [])];
    for (const c of ob.cutLabs) {
      const p = placeWord(c.cands, c.tw, f, { segs: ob.segs, boxes, bounds: ob.cutBounds, lines: c.lines });
      boxes.push(p.box);
      c.el.setAttribute('x', p.x.toFixed(1)); c.el.setAttribute('y', p.y.toFixed(1)); c.el.setAttribute('text-anchor', p.anchor);
    }
    parts.lines.forEach((p, j) => {
      const v = r.ys[j], on = cys[j] != null, cy = on ? cys[j] : G.B;
      p.ring.setAttribute('cx', cx.toFixed(1)); p.ring.setAttribute('cy', cy.toFixed(1));
      p.ring.classList.toggle('off', !on); p.val.classList.toggle('off', !on);
      const txt = on ? `${fmt(v, p.l.d)} ${p.l.unit}` : '';
      if (p.val.textContent !== txt) p.val.textContent = txt;
      if (!on) return;
      const d = 0.8 * f, sides = left ? [['end', -d], ['start', d]] : [['start', d], ['end', -d]], cands = [];
      for (const dy of [-0.6 * f, 1.45 * f, -1.7 * f, 2.55 * f, -2.8 * f, 3.65 * f]) for (const [anchor, dx] of sides) cands.push({ x: cx + dx, y: cy + dy, anchor });
      const pl = placeWord(cands, cw(txt, fs, true), fs, { ...ob, boxes });
      boxes.push(pl.box);
      p.val.setAttribute('x', pl.x.toFixed(1)); p.val.setAttribute('y', pl.y.toFixed(1)); p.val.setAttribute('text-anchor', pl.anchor);
    });
    const ax = G.ax;
    parts.svg.setAttribute('aria-label', `${parts.lines.map((p) => p.l.name).join(' and ')} against ${ax.name.toLowerCase()}, ${fmt(G.xs[0], ax.d)} to ${fmt(G.xs.at(-1), ax.d)} ${ax.unit}`
      + (ok ? `; this case at ${fmt(r.x, ax.d)} ${ax.unit}: ${parts.lines.map((p, j) => (Number.isFinite(r.ys[j]) ? `${p.l.name} ${fmt(r.ys[j], p.l.d)} ${p.l.unit}` : '')).filter(Boolean).join(', ')}` : ''));
  }
  // The rings glide after their goal (never a jump).
  function tick() {
    raf = 0;
    if (!goal) return;
    const k = reduceMQ.matches || !ring ? 1 : 0.18, mix = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * k : b);
    ring = { x: mix(ring?.x, goal.x), ys: goal.ys.map((y, j) => mix(ring?.ys[j], y)) };
    const near = Math.abs((ring.x ?? 0) - (goal.x ?? 0)) < 1e-3 * Math.abs((G?.xs.at(-1) ?? 1) - (G?.xs[0] ?? 0)) && ring.ys.every((y, j) => !Number.isFinite(y) || Math.abs(y - goal.ys[j]) < 0.005);
    if (near) ring = goal;
    paint(ring);
    if (ring !== goal) raf = nextFrame(tick);
  }
  // A new chart (a new curve, or its points arriving) fades in over the old one.
  function redraw(fade) {
    if (!t) return;
    const [w, hh, f] = size(); lastSz = [w, hh, f].map(Math.round).join('x');
    G = geo(w, hh, f);
    const old = parts?.svg;
    parts = build();
    if (fade && old) {
      parts.svg.classList.add('in'); el.append(parts.svg);
      nextFrame(() => nextFrame(() => parts?.svg.classList.remove('in')));
      setTimeout(() => old.remove(), 480);
    } else { el.replaceChildren(parts.svg); }
    paint(ring || goal);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (!t || !parts || !el.isConnected) return;
    const sz = size().map(Math.round).join('x'); if (sz === lastSz) return;
    redraw(false);
  }).observe(el);

  let aimed = null;
  function aim(params, fp) {
    if (!t) return;
    aimed = [params, fp];
    goal = ringAt(t, params, fp);
    // (A what-if slider on the curve's own setting: the case is a point of the curve, so the rings sit on the lines at the
    // slider's value, the same numbers on every screen, while the live model behind the tiles keeps running.)
    const ys = ser && params !== ctx?.params && onCurve(t, params, ctx?.params) ? curveAt(ser, goal.x) : null;
    if (ys) goal = { x: goal.x, ys, on: true };
    if (!raf) raf = nextFrame(tick);
  }
  async function fetchCurve(myKey, c) {
    const store = keepOf(c.deck);
    let p = store.get(myKey);
    if (!p) {
      if (!c.snap) return;   // (the slide's state is not ready: shown again, it asks again)
      p = c.run(curveSteps(t)).then((states) => curveSeries(t, states));
      store.set(myKey, p);
      p.then((s) => { if (!s) store.delete(myKey); }, () => store.delete(myKey));
    }
    const s = await p.catch(() => null);
    // (Still this slide's instrument: configured with this context and no other since. Not c.shown(), which turns true only
    // once the slide has finished coming in, after a curve worked out quickly has already arrived.)
    if (!s || key !== myKey || ctx !== c) return;
    ser = s; redraw(true);
    if (aimed) aim(...aimed);
  }
  return {
    el,
    configure(tool, c) {
      const k2 = JSON.stringify([c?.slide?.id ?? c?.index, tool]);
      t = tool; ctx = c || null;
      if (k2 !== key) {
        key = k2; ser = null; ring = null; aimed = null;
        goal = ringAt(t, ctx?.params, ctx?.fp);
        redraw(!!parts);
        if (ctx) fetchCurve(key, ctx);
      } else {
        aim(ctx?.params, ctx?.fp);
        if (!ser && ctx) fetchCurve(key, ctx);
      }
    },
    /** The numbers the slide's tiles show: the slide's own state, or the live model's while a what-if slider or compare
     *  button drives it (then the setting is read from the live params). */
    pin(fp) {
      if (!t || !ctx || !fp) return;
      aim(fp === ctx.fp ? ctx.params : ctx.liveParams?.() || ctx.params, fp);
    },
    update() {}, clear() {},
    dispose() { t = null; ctx = null; parts = null; el.replaceChildren(); },
  };
}
