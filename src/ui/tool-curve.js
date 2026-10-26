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
// against: { label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' } draws the first reading twice on one
// scale: the slide's own line (named `own`) and the same sweep with those params too (named `label`), each name on its line, no
// key (a key at the top only when the card is too small for them), and the case has a ring on both lines (the second read from
// its curve). No marks where the lines cross a cut-off (Mohammad, 19 Oct: the dotted drop lines taken out).

import { TILE, SCALE, RATE } from './table-marks.js?v=b717587a61';
import { frameFor } from './frame.js?v=3dd403a11f';
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
export const curveSteps = (t) => {
  const xs = curveXs(t), ag = againstOf(t), own = xs.map((x) => ({ params: patchOf(t.param, x, t.also) }));
  return ag ? [...own, ...xs.map((x) => ({ params: patchOf(t.param, x, mergeOf(t.also, ag.params)) }))] : own;
};
/** The second sweep's { label, params, own }, or null: needs a label and a params object. */
export function againstOf(t) {
  const a = t?.against;
  if (!a || typeof a.label !== 'string' || !a.label || !a.params || typeof a.params !== 'object' || Array.isArray(a.params)) return null;
  return { label: a.label, params: a.params, own: typeof a.own === 'string' && a.own ? a.own : 'This case' };
}
/** b merged over a (objects key by key, anything else replaced), a fresh copy. */
export function mergeOf(a, b) {
  const out = a && typeof a === 'object' ? structuredClone(a) : {};
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? mergeOf(out[k], v) : structuredClone(v);
  return out;
}
/** The readings plotted (one or two fingerprint keys; one, drawn twice, with against). */
export const curveLines = (t) => [].concat(t.lines || 'ppg').filter((k) => typeof k === 'string').slice(0, againstOf(t) ? 1 : 2);
/** The lines drawn: each reading's meta, or with against the one reading twice, named and coloured by its sweep. */
export function drawnLines(t) {
  const ls = curveLines(t).map(lineMeta), ag = againstOf(t);
  if (!ag) return ls;
  const l = ls[0];
  return [{ ...l, name: ag.own }, { ...l, name: ag.label, c: l.c === '--tr-hv' ? '--tr-pv' : '--tr-hv' }];
}
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
  const xs = curveXs(t), ls = curveLines(t).map(lineMeta), ax = axisMeta(t), ag = againstOf(t);
  if (!Array.isArray(states) || states.length !== xs.length * (ag ? 2 : 1)) return null;
  const val = (s, l) => (Number.isFinite(s?.fp?.[l.k]) ? s.fp[l.k] * l.x : null);
  const ys = ag ? [0, 1].map((h) => states.slice(h * xs.length, (h + 1) * xs.length).map((s) => val(s, ls[0]))) : ls.map((l) => states.map((s) => val(s, l)));
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
export function leftScale(k, vals, most = 7) {
  const v = vals.filter(Number.isFinite);
  if (!v.length) return { min: 0, max: 1, ticks: [0, 1] };
  let a = Math.min(...v), b = Math.max(...v);
  if (PRESSURE.has(k)) {
    a = 0;
    for (const c of cutsOf(k)) if (c.v > b && c.v <= b * 1.6) b = c.v;
  }
  if (b - a < 1e-6) { b = a + Math.max(1, Math.abs(a) * 0.2); }
  // (Of the nice steps giving three to six gaps and at most `most` numbers (seven, fewer on a short chart), the one whose top wastes least above the values
  // while leaving a little room over them for a cut-off's name: 0 to 25 for an HVPG of 22, not 0 to 30. Whole numbers win
  // over halves when the range is wide.)
  let best = null;
  for (const gaps of [3, 4, 5, 6]) {
    const bh = b + 0.06 * (b - a), step = niceStep((b - a) / gaps), lo = Math.floor(a / step + 1e-9) * step, n = Math.max(2, Math.ceil((bh - lo) / step - 1e-9) + 1);
    const top = lo + step * (n - 1), waste = (top - b) / (b - a);
    if (n > most) continue;
    const score = waste + (b - a >= 4 && step % 1 ? 0.5 : 0);
    if (!best || score < best.score + 1e-9) best = { score, ticks: ticksOf(lo, step, n) };   // (a tie goes to more numbers)
  }
  // (A chart too short for any of them: the next nice steps up, until the numbers fit.)
  for (let step = niceStep((b - a) / 2); !best; step = niceStep(step * 1.01)) {
    const lo = Math.floor(a / step + 1e-9) * step, n = Math.max(2, Math.ceil((b + 0.06 * (b - a) - lo) / step - 1e-9) + 1);
    if (n <= Math.max(2, most)) best = { ticks: ticksOf(lo, step, n) };
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
/** How badly a box [x0, y0, x1, y1] lands: on a horizontal line ({ y, x0, x1, w }) its weight w (1 if unset), on a data
 *  line's segment its weight w (2 if unset), on other words 3, outside the bounds 10. A line with side (the y of the ring
 *  the word names) also costs 20 when the word's middle is across it from that ring: a value over a cut-off it is under
 *  reads as the wrong side of it. */
export function boxScore(b, { lines = [], segs = [], boxes = [], bounds = null }) {
  let n = 0;
  if (bounds && (b[0] < bounds[0] || b[1] < bounds[1] || b[2] > bounds[2] || b[3] > bounds[3])) n += 10;
  for (const l of lines) {
    if (l.y > b[1] - 3 && l.y < b[3] + 3 && l.x0 < b[2] && b[0] < l.x1) n += l.w ?? 1;   // (and 3 px clear of a line)
    if (l.side != null && ((b[1] + b[3]) / 2 - l.y) * (l.side - l.y) < 0) n += 20;
  }
  for (const sg of segs) if (segHits(sg, b)) n += sg.w ?? 2;
  for (const o of boxes) if (hitBox(b, o)) n += 3;
  return n;
}
/** A word's place: of the candidates ({ x, y, anchor }, in order of liking), the first that lands on the fewest things.
 *  w: its width, fs: its type size. With near ({ x, y, k }) a spot also costs k for each unit of its box's distance from
 *  that point, so a word strays from what it names only to get clear of something that counts more. With obstacles.inside
 *  ([x0, y0, x1, y1], the drawing's own edges) no word ever leaves it: a spot that would is slid back in before it is
 *  weighed, so it lands on what is there instead. Returns the candidate with its box and n, what it lands on. */
export function placeWord(cands, w, fs, obstacles, near = null) {
  let best = null;
  const lim = obstacles.inside;
  for (let c of cands) {
    let x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
    if (lim) {
      const dx = clamp(x0 - 3, lim[0], Math.max(lim[0], lim[2] - w - 6)) - (x0 - 3);
      const dy = clamp(c.y - 0.85 * fs - 1, lim[1], Math.max(lim[1], lim[3] - 1.15 * fs - 2)) - (c.y - 0.85 * fs - 1);
      if (dx || dy) { c = { ...c, x: c.x + dx, y: c.y + dy }; x0 += dx; }
    }
    const box = [x0 - 3, c.y - 0.85 * fs - 1, x0 + w + 3, c.y + 0.3 * fs + 1];   // (with room for a line's stroke and a g's tail)
    const n = boxScore(box, obstacles);
    const cost = n + (near ? near.k * Math.hypot(Math.max(0, box[0] - near.x, near.x - box[2]), Math.max(0, box[1] - near.y, near.y - box[3])) : 0);
    if (!best || cost < best.cost) best = { ...c, box, n, cost };
    if (!near && n === 0) break;
  }
  return best;
}

/** The x the slide's case sits at, and each line's value there (shown units): from the live params and fingerprint while a
 *  what-if slider or compare button drives the model, else the slide's own. */
export function ringAt(t, params, fp) {
  const ax = axisMeta(t), x = getAt(params, t.param);
  const ys = curveLines(t).map((k) => (Number.isFinite(fp?.[k]) ? fp[k] * lineMeta(k).x : null));
  return { x: Number.isFinite(+x) ? +x * ax.x : null, ys: againstOf(t) ? [ys[0], null] : ys };   // (the second line's from its curve)
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
    const ls = drawnLines(t), ax = axisMeta(t), xs = curveXs(t).map((x) => x * ax.x), ag = !!againstOf(t);
    const vals0 = ls.map((l, j) => (ser ? ser.ys[j] : [(ring || goal)?.ys[j]]).filter(Number.isFinite));
    // (With against both lines are one reading on one scale, named on the lines; the key is only the reading and its unit.)
    const vals = ag ? [vals0.flat()] : vals0, keyLs = ag ? [{ ...lineMeta(curveLines(t)[0]), c: '--text-2', bare: true }] : ls;
    const keys0 = keyLs.length < 2 || keyLs.reduce((a, l) => a + 22 + cw(l.name, f, 1) + 6 + cw(l.unit, f), 0) + 2 * f <= w;
    // (With against, the two lines' key that stands in when their names don't fit on the drawing takes a row of its own when
    // it would run into the reading's name and unit at the left.)
    const altW = ag ? ls.reduce((a, l) => a + 22 + 1.05 * cw(l.name, f, 1), 0) + f * (ls.length - 1) : 0;
    const altBelow = ag && cw(keyLs[0].name, f, 1) + 6 + cw(keyLs[0].unit, f) + altW + 2 * f > w;
    // (No more numbers up the side than fit a line and a half of type apart.)
    const plotH = h - 2.9 * f - ((keys0 && !altBelow ? 1 : 2) * 1.5 * f + 1.6 * f), most = clamp(Math.floor(plotH / (1.6 * f)) + 1, 3, 7);
    const sL = leftScale(ls[0].k, vals[0], most), sR = ls[1] && !ag ? rightScale(vals[1], sL.ticks.length) : null;
    const keys = keyLs.map((l) => ({ ...l, w: (l.bare ? 0 : 22) + cw(l.name, f, 1) + 6 + cw(l.unit, f) }));
    const oneRow = keys.length < 2 || keys[0].w + keys[1].w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow && !altBelow ? 1 : 2) * rowH;
    const tw = (sc) => Math.max(...sc.ticks.map((v) => cw(fmt(v, dec(sc)), f)));
    const xt = xTicks(xs[0], xs.at(-1), Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f)))));
    const L = Math.ceil(tw(sL) + 8), R = Math.floor(w - (sR ? tw(sR) + 8 : Math.max(8, cw(fmt(xs.at(-1), ax.d), f) / 2 + 2)));
    const T = legH + 1.6 * f, B = h - 2.9 * f;
    return { w, h, f, ls, ag, ax, xs, xt, sL, sR, keys, oneRow, altBelow, rowH, L, R, T, B: Math.max(T + 3 * f, B) };
  }
  const X = (x) => G.L + (G.R - G.L) * (x - G.xs[0]) / ((G.xs.at(-1) - G.xs[0]) || 1);
  const Yof = (sc) => (v) => G.B - (G.B - G.T) * clamp((v - sc.min) / ((sc.max - sc.min) || 1), 0, 1);
  // The data lines' segments on the screen.
  function lineSegs(YL, YR) {
    if (!ser) return [];
    return ser.ys.flatMap((ys, j) => { const Y = j ? YR || YL : YL, out = [];
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
      const y = YL(c.v), txt = `${G.ag ? lineMeta(curveLines(t)[0]).name : ls[0].name} ${fmt(c.v, Number.isInteger(c.v) ? 0 : 1)}`;
      const el = sv('text', { class: 'pcv-cut' }, txt);
      cutLabs.push({ el, tw: 1.12 * cw(txt, f, true), lines: cutVs.filter((o) => o !== c).map((o) => ({ y: YL(o.v), x0: L, x1: R })),
        // (Over the line; else on it, the dashes stopping round the words (a short chart's cut-offs stand close); else under.)
        cands: [{ x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y - 0.35 * f, anchor: 'start' },
          { x: R - 3, y: y + 0.35 * f, anchor: 'end', on: true }, { x: L + 3, y: y + 0.35 * f, anchor: 'start', on: true },
          { x: R - 3, y: y + 1.05 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' }] });
      return sv('g', { class: 'ptk-grid cut', 'data-rate': c.rate }, sv('line', { x1: L, x2: R, y1: y, y2: y }), el);
    });
    const legend = G.keys.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        k.bare ? null : sv('line', { x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0, style: `stroke: var(${k.c})` }),
        sv('text', { x: k.bare ? 0 : right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start', style: `fill: var(${k.c})` },
          right ? [sv('tspan', { class: 'pft-u' }, `${k.unit} `), sv('tspan', {}, k.name)] : [sv('tspan', {}, k.name), sv('tspan', { class: 'pft-u' }, ` ${k.unit}`)])); });
    // (With against, a key of the two lines kept hidden at the right of the key row: shown only when a chart is too cramped
    // for the lines' names on the drawing, a phone held sideways.)
    let alt = null;
    if (G.ag) {
      let x = 0;
      const ks = [...ls].reverse().map((l) => { const kw = 22 + 1.05 * cw(l.name, f, 1); x -= kw; const at = x; x -= f;
        return sv('g', { transform: `translate(${at.toFixed(1)} 0)` }, sv('line', { x1: 0, x2: 16, y1: 0, y2: 0, style: `stroke: var(${l.c})` }),
          sv('text', { x: 22, y: 0.36 * f, style: `fill: var(${l.c})` }, l.name)); });
      alt = sv('g', { class: 'pft-key pcv-alt off', transform: `translate(${G.w} ${(G.altBelow ? G.rowH : 0) + 0.75 * f})` }, ks);
    }
    const axis = [sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      // (The two end numbers stand inside the plot's ends, clear of the corner numbers of the y axes.)
      xt.map((x, i) => sv('text', { class: 'pft-tk', x: X(x), y: B + 1.25 * f, 'text-anchor': X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }, fmt(x, ax.d))),
      sv('text', { class: 'pcv-ax', x: (L + R) / 2, y: B + 2.6 * f, 'text-anchor': 'middle' }, ax.unit && ax.unit !== '×' && !ax.name.toLowerCase().includes(ax.unit.toLowerCase()) ? `${ax.name}, ${ax.unit}` : ax.name)];
    const lines = ls.map((l, j) => {
      const Y = j ? YR || YL : YL, ys = ser?.ys[j];
      const d = ys ? ys.map((y, i) => (Number.isFinite(y) ? [X(ser.xs[i]), Y(y)] : null)).filter(Boolean).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') : '';
      return { l, Y, path: sv('path', { class: 'ptk-line pcv-line', d, style: `stroke: var(${l.c})` }),
        ring: sv('circle', { class: 'pcv-ring', r: Math.max(5, f * 0.45), style: `stroke: var(${l.c})` }),
        val: sv('text', { class: 'pcv-v', style: `fill: var(${l.c})` }),
        // (With against each line is named on the drawing, placed on every paint clear of the rings and the values.)
        name: G.ag ? sv('text', { class: 'pcv-name', style: `fill: var(${l.c})` }, l.name) : null };
    });
    const at = sv('line', { class: 'pcv-at', y1: T - 0.4 * f, y2: B });
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${f.toFixed(2)}px` },
      grid, cuts, legend, alt, axis, at, lines.map((x) => x.path), lines.map((x) => [x.ring, x.val, x.name]));
    svg.dataset.points = ser ? String(ser.xs.length) : '0';   // (the browser checks read it: 0 until the curve is ready)
    // (What a ring's value keeps clear of: the cut-offs and their names, the x axis, the data lines. A value on a cut-off
    // line reads as that line's name, so it would sooner cross a data line or another word.)
    const obstacles = { segs, cutLabs, cutBounds: [L, T - 1.2 * f, R, B - 0.1 * f], boxes: [], lines: [...cutVs.map((c) => ({ y: YL(c.v), x0: L, x1: R, w: 5 })), { y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], inside: [0, 0, G.w, G.h] };
    return { svg, lines, at, obstacles, alt };
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
    // (Each value takes the first spot beside its ring that lands on nothing: the data lines, the cut-off lines, the x axis,
    // the dashed line through the rings, both rings and the other value; the side away from the nearer edge first.)
    const ob = parts.obstacles, boxes = [...cys.filter((y) => y != null).map((y) => [cx - rr, y - rr, cx + rr, y + rr]), ...(ok ? [[cx - 1.5, G.T - 0.4 * f, cx + 1.5, G.B]] : [])];
    // (With against the upper ring's value is placed first, level with its ring or over it, and the lower one's under the
    // first value, so the two read in the same order as their rings.)
    let upperY = null;
    const order = G.ag ? [0, 1].sort((a, b) => (cys[a] ?? Infinity) - (cys[b] ?? Infinity)) : parts.lines.map((_, j) => j);
    order.forEach((j, n) => {
      const p = parts.lines[j];
      const v = r.ys[j], on = cys[j] != null, cy = on ? cys[j] : G.B;
      p.ring.setAttribute('cx', cx.toFixed(1)); p.ring.setAttribute('cy', cy.toFixed(1));
      p.ring.classList.toggle('off', !on); p.val.classList.toggle('off', !on);
      const txt = on ? (G.ag ? fmt(v, p.l.d) : `${fmt(v, p.l.d)} ${p.l.unit}`) : '';   // (with against the key carries the unit)
      if (p.val.textContent !== txt) p.val.textContent = txt;
      if (!on) return;
      const cands = [];
      // (Near the ring first: beside it, then further along, then above and below.)
      for (const d of [rr + 4, 2.6 * f]) {   // (clear of the ring itself, its box padded 3 px)
        const sides = left ? [['end', -d], ['start', d]] : [['start', d], ['end', -d]];
        // (The usual rows first, then every fifth of a line between, for a gap that only just holds the word.)
        const dys = [-0.6, 1.45, -1.7, 2.55, -2.8, 3.65, ...Array.from({ length: 34 }, (_, i) => -2.9 + 0.2 * i)];
        for (const dy of dys) for (const [anchor, dx] of sides) cands.push({ x: cx + dx, y: cy + dy * f, anchor });
      }
      for (const dy of [-1.2 * f, 2.1 * f]) cands.push({ x: cx, y: cy + dy, anchor: 'middle' });
      if (G.ag && order.length > 1 && cys[order[1 - n]] != null) {
        const keep = n === 0 ? (c) => c.y <= cy + 0.2 * f : (c) => upperY == null || c.y >= upperY + 1.1 * fs;
        const kept = cands.filter(keep);
        if (kept.length) cands.splice(0, cands.length, ...kept);
      }
      // (Each f of distance from its ring costs half a crossing; it stays on its ring's side of every cut-off.)
      const lines = ob.lines.map((l) => (l.w ? { ...l, side: cy } : l));
      const pl = placeWord(cands, 1.12 * cw(txt, fs, true), fs, { ...ob, lines, boxes }, { x: cx, y: cy, k: 0.5 / f });   // (measured wide, as the cut-offs' names)
      boxes.push(pl.box);
      if (G.ag) { boxes.push(pl.box); if (n === 0) upperY = pl.y; }   // (two values side by side read as one: landing on the other costs double)
      p.val.setAttribute('x', pl.x.toFixed(1)); p.val.setAttribute('y', pl.y.toFixed(1)); p.val.setAttribute('text-anchor', pl.anchor);
      p.val.classList.toggle('on', pl.n > 0);   // (no clear spot on a cramped chart: the lines stop round the words)
    });
    // (With against, each line's name on the drawing beside its own line, after the values: the first clear spot along it,
    // over the line, then under it.)
    const named = [];
    if (ser) parts.lines.forEach((p, j) => {
      if (!p.name) return;
      const ys = ser.ys[j], tw = 1.12 * cw(p.l.name, f, true), cands = [];
      // (Over a rising line the words sit up and to the left of a point, under it down and to the right, where the line is
      // away from them; over a falling line the other way round.)
      // (Every point of the line, nearest the middle first.)
      const mid = 0.45 * (ser.xs.length - 1), at = ser.xs.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
      for (const i of at) {
        const y = ys[i], x = X(ser.xs[i]);
        if (!Number.isFinite(y)) continue;
        const rise = (ys[Math.min(ys.length - 1, i + 1)] ?? y) - (ys[Math.max(0, i - 1)] ?? y) >= 0, py = p.Y(y);
        for (const k of [0, 0.7, 1.4]) cands.push({ x: x + (rise ? -0.3 : 0.3) * f, y: py - (0.5 + k) * f, anchor: rise ? 'end' : 'start' }, { x: x + (rise ? 0.3 : -0.3) * f, y: py + (1.3 + k) * f, anchor: rise ? 'start' : 'end' });
        cands.push({ x, y: py - 0.55 * f, anchor: 'middle' }, { x, y: py + 1.35 * f, anchor: 'middle' });
      }
      // (Never with the other line between the words and their own: it would read as naming that one.)
      const yAt = (k, px) => { const ys2 = ser.ys[k]; for (let i = 1; i < ys2.length; i++) { const a = X(ser.xs[i - 1]), b = X(ser.xs[i]);
        if (px >= Math.min(a, b) && px <= Math.max(a, b) && Number.isFinite(ys2[i - 1]) && Number.isFinite(ys2[i])) return p.Y(ys2[i - 1] + (ys2[i] - ys2[i - 1]) * ((px - a) / ((b - a) || 1))); } return null; };
      const own = (c) => { const x0 = c.anchor === 'end' ? c.x - tw : c.anchor === 'middle' ? c.x - tw / 2 : c.x, mx = x0 + tw / 2, my = c.y - 0.3 * f, a = yAt(j, mx), o = yAt(1 - j, mx);
        return a == null || o == null || !((o - my) * (o - a) < 0); };
      const pl = cands.length ? placeWord(cands.filter(own), tw, f, { ...ob, boxes, lines: ob.lines.map((l) => ({ ...l, w: 3 })) }) : null;
      named.push(!!pl && pl.n === 0);
      if (!pl) return;
      boxes.push(pl.box);
      p.name.setAttribute('x', pl.x.toFixed(1)); p.name.setAttribute('y', pl.y.toFixed(1)); p.name.setAttribute('text-anchor', pl.anchor);
    });
    // (Both names clear of everything, or neither on the drawing: then the key at the top names the lines.)
    if (parts.alt) {
      const fits = !ser || (named.length > 0 && named.every(Boolean));
      parts.lines.forEach((p) => p.name?.classList.toggle('off', !ser || !fits));
      parts.alt.classList.toggle('off', fits);
    }
    // (The cut-offs' names after the values: a value belongs by its ring, a name can go to either end or onto its line.)
    for (const c of ob.cutLabs) {
      // (If both ends are taken, beside the dashed line: just left of it, or just right.)
      const near = ok ? c.cands.filter((q) => q.anchor === 'end').flatMap((q) => [{ ...q, x: cx - 0.5 * f, anchor: 'end' }, { ...q, x: cx + 0.5 * f, anchor: 'start' }]) : [];
      const p = placeWord([...c.cands, ...near], c.tw, f, { segs: ob.segs, boxes, bounds: ob.cutBounds, lines: c.lines, inside: ob.inside });
      boxes.push(p.box);
      c.el.setAttribute('x', p.x.toFixed(1)); c.el.setAttribute('y', p.y.toFixed(1)); c.el.setAttribute('text-anchor', p.anchor);
      c.el.classList.toggle('on', !!p.on);
    }
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
    // (With against, the second line's ring is read from its curve at the case's setting.)
    else if (ser && againstOf(t)) goal = { x: goal.x, ys: [goal.ys[0], curveAt(ser, goal.x)?.[1] ?? null] };
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
    else if (againstOf(t)) aim(ctx.params, ctx.fp);   // (the second line's ring, from its curve now it is here)
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
