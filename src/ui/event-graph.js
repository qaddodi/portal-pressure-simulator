// The graph of what a procedure does, drawn live as it happens (Mohammad, 7 Nov 2026: "after deploying the TIPS we see a graph of HVPG and
// sinusoidal flow changing in real time after the TIPS gets placed; think about it make sure it's perfect"). A slide that plays a procedure
// which changes the model (a TIPS, BRTO, BATO, a Meso-Rex bypass) carries it on its teaching card over its steps: the same chart as the
// time-lapse graph (flow-time.js, option A: the same plot, legend, lines, heads and looks), on a clock of its own.
//
// What it shows, and why:
//  • Its two lines are the slide's first two tiles (graph: [..] names others; graph: false turns it off), so the graph and the numbers beside it
//    are one reading: each point is the live model's own frame, the one the tiles are given in the same poll (presenter.js liveSet). A pressure
//    takes the left axis, on a scale from zero so a fall keeps its true size; the other line the right axis (8 Nov 2026: two y-axes, each the
//    plot's full height, the lines may overlap; the left axis keeps the tints, the right its cut-offs as dashed lines).
//  • Time is seconds of the model's own clock around the moment the procedure changes the patient (0: the stent opens, the shunt is closed):
//    PRE_S seconds before it, held flat at the state the slide opened on, then EVENT_S seconds after. Played that way the model is let run
//    on its own physics (no settling): the portal pressure falls over about ten seconds as the splanchnic blood drains through the stent and
//    the reflexes answer, then holds (shunts deck, an 8 mm TIPS on her decompensated cirrhosis: PPG 19.3 to about 11, sinusoidal flow 61% to
//    about 32%, the curve the model itself gives).
//  • Each scale is fixed before anything is drawn, from the state it starts at and the state it ends at, so nothing moves while the line runs:
//    a pressure from zero to the next 5 over its highest value; the other from the tile's own scale start. The tiles' own cut-offs are drawn
//    as tints on the side that is worse (table-marks SCALE and RATE: the sinusoidal flow's 55% and 75%, red and amber, as its tile's bar), a
//    pressure with its red cut-off only; after a TIPS the PPG's goal, below 12 mmHg (pressure-cuts.js), is a green band named "Target <12".
//  • BRTO and BATO (Gastric varices): the fundal varix closes at once as the shunt does, and the PPG creeps up over the seconds after (16.9 to
//    about 18 mmHg), the price the slide names.
//  • It draws nothing until the change: before it the line stops at 0 with its value, the word for the event over a dashed line ("Stent
//    open"), the seconds after it empty. Going back before the step clears what was drawn; coming back to the slide played through shows it
//    whole again.
// Drawn on the GPU (svg-gl.js), never painted by the browser; no list or string is made in a frame (the points live in one typed array).
import { frameFor, cancelFrame } from './frame.js';
import { attrSoon, dataSoon } from './class-soon.js';
import { plotPanel } from './plot-look.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts } from './svg-gl.js';
import { fix1, round1, printedKey } from './fix-text.js';
import { D_SURFACE, EASE_ARRIVE } from './ease.js';
import { procKindOf } from './proc-anim.js';
import { reduceMotionMQ } from './motion.js';
import { headStep, HEAD_DT0 } from './display-state.js';
import { fittedType, tokName } from './chart-ctx.js';
import { readMetric } from './layout-snap.js';
import { LINE, withUnit, headLeft } from './flow-time.js';
import { SCALE, RATE, PRESS } from './table-marks.js';
import { PPG_CUTS } from '../engine/pressure-cuts.js';
const nextFrame = frameFor('event-graph');

// (The clock: seconds before the change, seconds after it, the step between the clock's numbers.)
export const PRE_S = 5, EVENT_S = 20, TICK_S = 5;
// What the change is called over its line, for each procedure that makes one (a measurement, EUS-PPG, changes nothing and has no graph).
// (BRTO and BATO: the word of their last step, the moment the model closes the shunt. Banding and a meal have time charts of their own: the
// beat or talk trace on a banding slide, the time-lapse graph on a meal slide, so they get no second one here.)
export const EVENT_WORD = { tips: 'Stent open', tipscoil: 'Stent open', tipscoilin: 'Coils in', brto: 'Shunt closed', brtoC6: 'Shunt closed', bato: 'Varices closed' };
const kindOf = (s) => procKindOf(s?.procedure);
const isP = (k) => LINE[k]?.[1] === 'mmHg';
const NO_F = Object.freeze({});
const ORDER = { ok: 0, mid: 1, hi: 2 };
const rateAt = (k, v) => { const r = RATE[k]?.(v, NO_F)?.[0]; return r in ORDER ? r : null; };

/** The two lines a procedure slide's graph plots, [lower, upper] (a pressure takes the lower place), or null when it has none. */
export function eventLines(s) {
  if (!s || s.visual || s.lapse || s.graph === false || !EVENT_WORD[kindOf(s)]) return null;
  const want = Array.isArray(s.graph) ? s.graph : s.tiles || [];
  const keys = want.filter((k, j) => LINE[k] && !LINE[k][5]?.given && SCALE[k] && want.indexOf(k) === j).slice(0, 2);
  if (keys.length < 2) return null;
  return isP(keys[1]) && !isP(keys[0]) ? [keys[1], keys[0]] : keys;
}

/** The slide's graph: { kind, word, lines, target } (target: the PPG's goal after a TIPS, mmHg, on the line that has it), or null. */
export function eventGraphOf(s) {
  const lines = eventLines(s), kind = kindOf(s);
  return lines ? { kind, word: EVENT_WORD[kind], lines, target: (kind === 'tips' || kind === 'tipscoil' || kind === 'tipscoilin') && lines[0] === 'ppg' ? PPG_CUTS.red : null } : null;
}

const NICE = [1, 2, 2.5, 5, 10];
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))); return NICE.find((s) => s * p >= raw - 1e-9) * p; };
/**
 * A line's scale, fixed before it is drawn: { min, max, cuts: [{ v, rate }], zones: [{ a, b, rate }] } in the units the chart prints. vals:
 * the values it will show (where it starts, where it ends, in the model's units). Both axes take the plot's full height (8 Nov 2026), the lines may overlap. A pressure runs from zero; the rest from its tile's scale
 * start. The top is the first round number (a fifth of the way steps: 5 mmHg, 20%) over the highest value with room for its head, and over
 * the cut-off it is judged by. Cuts: the tile's own (a pressure's red one only), each named by its worse side; zones: the stretches between
 * them that rate amber or red, tinted. target: a goal below which the line should land (the PPG after a TIPS): one green zone in place of the rest.
 */
export function eventScale(k, vals, target = null) {
  const sc = SCALE[k], x = LINE[k]?.[4] ?? 1, pr = isP(k) || PRESS.has(k);
  const min = pr ? 0 : sc[0];
  const shown = vals.filter(Number.isFinite).map((v) => v * x);
  const cutsAll = sc[2].filter((c) => c > min);
  const cutsIn = pr ? cutsAll.slice(-1) : cutsAll;
  const need = Math.max(min + 1e-6, ...shown.map((v) => v * 1.12), ...(target ? [target * 1.25] : cutsIn.map((c) => c * 1.15)));
  const step = niceStep((need - min) / 5), max = Math.ceil((need - min) / step - 1e-9) * step + min;
  if (target) return { min, max, cuts: [{ v: target, rate: 'ok' }], zones: [{ a: min, b: target, rate: 'ok', target: true }] };
  const eps = (max - min) * 1e-4;
  const cuts = cutsIn.filter((c) => c < max).map((c) => {
    const a = rateAt(k, (c - eps) / x), b = rateAt(k, (c + eps) / x);
    return { v: c, rate: ORDER[a] >= ORDER[b] ? a : b };
  }).filter((c) => c.rate && c.rate !== 'ok');
  const edges = [min, ...cuts.map((c) => c.v), max];
  const zones = edges.slice(0, -1).map((a, j) => ({ a, b: edges[j + 1], rate: rateAt(k, (a + edges[j + 1]) / 2 / x) })).filter((z) => z.rate === 'mid' || z.rate === 'hi');
  return { min, max, cuts, zones };
}

// ── The chart ──
const sv = svgModel;
const FT_MIN = 12;   // (px on the screen: the smallest its words are drawn, as flow-time's)
const CAP = 600;   // (points kept after the change: a poll every 100 ms for EVENT_S, with room to spare; past it the newest overwrite the last)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cw = (t, f, b) => t.length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: the chart is laid out before it is drawn)
const fmtN = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));
const NO_BOXES = [];

export function createEventGraph() {
  const reduceMQ = reduceMotionMQ;
  const el = document.createElement('div');
  el.className = 'pz-flowtime pz-evgraph days';   // (the time-lapse graph's box and looks: styles/app.css .pz-timegraph .pz-flowtime)
  const gl = createSvgGL(el, { host: 'flowtime' });
  let spec = null, before = null, scales = null, G = null, parts = null, raf = 0, lastT = 0, shown = 0, goal = 0, lastSz = '';
  // (The points after the change: [t, lower, upper] in the printed units, n of them; on: the change has happened.)
  const pts = new Float64Array(3 * CAP);
  let n = 0, on = false;
  const T0 = -PRE_S, T1 = EVENT_S;
  const X = (t) => G.L + (G.R - G.L) * (clamp(t, T0, T1) - T0) / (T1 - T0);
  const Yof = (band, sc) => (v) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
  // The value of line j at t (before the change, or with no point yet: where it started; between two points, straight between them).
  function valAt(j, t) {
    if (!on || n === 0 || t <= 0) return before[j];
    if (t <= pts[0]) { const k = t / Math.max(1e-9, pts[0]); return before[j] + (pts[1 + j] - before[j]) * k; }
    let i = 0;
    while (i < n - 1 && pts[3 * (i + 1)] <= t) i++;
    if (i >= n - 1) return pts[3 * (n - 1) + 1 + j];
    const a = 3 * i, b = a + 3, k = (t - pts[a]) / Math.max(1e-9, pts[b] - pts[a]);
    return pts[a + 1 + j] + (pts[b + 1 + j] - pts[a + 1 + j]) * k;
  }
  // The geometry for a chart w × h px in type f px: the legend, the plot (both axes its full height), the clock under it.
  function geo(w, h, f) {
    const keysL = spec.lines.map((key) => { const [name, unit, , c] = LINE[key]; return { c, name, unit, w: 22 + cw(name, f, 1) + 6 + cw(unit, f) }; });
    const oneRow = keysL[0].w + keysL[1].w + 2 * f <= w, rowH = 1.5 * f, keyH = (oneRow ? 1 : 2) * rowH;
    const numW = (sc) => Math.max(cw(fmtN(sc.min), f), cw(fmtN(sc.max), f), ...sc.cuts.map((c) => cw(fmtN(c.v), f, 1)));
    const half = cw(`+${T1}`, f) / 2 + 6, L = Math.ceil(numW(scales[0]) + 14), R = Math.floor(w - Math.max(numW(scales[1]) + 14, half + f * 0.78 + 10));
    const T = keyH + 1.9 * f, B = h - 1.7 * f, ph = Math.max(4 * f, B - T);
    return { w, h, f, half, keysL, oneRow, rowH, keyH, L, R, T, B, FB: [T, T + ph], PB: [T, T + ph] };   // (both axes the plot's full height: the lines may overlap)
  }
  function build() {
    const { f, L, R, T, B, FB, PB } = G;
    const bands = [PB, FB];
    const lines = spec.lines.map((k, j) => {
      const c = LINE[k][3], Y = Yof(bands[j], scales[j]);
      return { k, j, c, unit: LINE[k][1], d: LINE[k][2], Y,
        path: sv('path', { class: 'ptk-line', 'data-look': 'plot.line', 'data-p-c': tokName(c) }),
        dot: sv('circle', { class: 'pft-dot', 'data-look': 'ft.dot', 'data-p-c': tokName(c), r: Math.max(4, f * 0.42) }),
        val: sv('text', { class: 'pft-v', 'data-look': 'ft.v', 'data-p-c': tokName(c) }),
        P: new Float64Array(2 * (CAP + 4)), pk: NaN, txt: '', tw: 0 };
    });
    // Each axis: the left (the lower line) draws its tints first (the worse side of each cut-off, or the goal's green) and its two gridlines;
    // the right (the upper line) shares the gridlines and keeps its cut-offs as dashed lines only, no tint (two tints over one plot would
    // mix). Both draw their cut-offs' lines and numbers on their own side (left, right), a number dropped where it would touch another.
    const marks = [], boxes = [];
    lines.forEach((l) => {
      const sc = scales[l.j], left = l.j === 0, x = left ? L - 6 : R + 6, anchor = left ? 'end' : 'start', taken = [];
      const room = (y) => taken.every((t) => Math.abs(t - y) >= 1.15 * f);
      for (const z of left ? sc.zones : []) {
        const y0 = l.Y(z.b), y1 = l.Y(z.a);
        marks.push(z.target ? sv('rect', { class: 'pev-zone', 'data-look': 'cv.zone.fill', x: L, y: y0, width: Math.max(1, R - L), height: Math.max(0, y1 - y0) })
          : sv('rect', { class: 'pev-zone', 'data-look': 'co.z', 'data-rate': z.rate, x: L, y: y0, width: Math.max(1, R - L), height: Math.max(0, y1 - y0) }));
      }
      for (const c of sc.cuts) {
        const y = l.Y(c.v), tgt = sc.zones.some((z) => z.target);
        marks.push(tgt ? sv('line', { 'data-look': 'cv.zone.edge', x1: L, x2: R, y1: y, y2: y })
          : sv('line', { class: 'cut', 'data-look': 'plot.grid.line', 'data-rate': c.rate, x1: L, x2: R, y1: y, y2: y }));
        // (The goal's name inside its band, under its edge, where the band is tall enough; else its number in the margin, green.)
        const zoneH = l.Y(sc.min) - y;
        if (tgt && zoneH >= 1.25 * f) marks.push(sv('text', { class: 'pev-goal', 'data-look': 'cv.zone.t', x: L + 0.5 * f, y: y + 1.0 * f }, `Target <${fmtN(c.v)}`));
        else if (room(y)) { taken.push(y); marks.push(sv('text', { 'data-look': 'cv.tc', 'data-tc': c.rate === 'ok' ? '' : c.rate, x, y: y + 0.35 * f, 'text-anchor': anchor }, fmtN(c.v))); }
      }
      for (const v of [sc.max, sc.min]) {
        const y = l.Y(v);
        marks.push(sv('g', { class: 'ptk-grid' }, left ? sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: y, y2: y }) : null,
          room(y) ? sv('text', { 'data-look': 'time.grid.text', 'data-p-c': tokName(l.c), x, y: y + 0.35 * f, 'text-anchor': anchor }, fmtN(v)) : null));
        if (room(y)) taken.push(y);
        if (!left) boxes.push([R + 6, R + 6 + cw(fmtN(v), f), y - 0.45 * f, y + 0.55 * f]);
      }
    });
    // The legend: each line's swatch, name and unit; the lower line's on the left, the upper's on the right (or under it).
    const legend = G.keysL.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        sv('line', { 'data-look': 'time.key.line', 'data-p-c': tokName(k.c), x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0 }),
        sv('text', { 'data-look': 'time.key.text', 'data-p-c': tokName(k.c), x: right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start' },
          right ? [sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, `${k.unit} `), sv('tspan', { 'data-look': 'time.span' }, k.name)] : [sv('tspan', { 'data-look': 'time.span' }, k.name), sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, ` ${k.unit}`)])); });
    const ticks = [];
    for (let t = T0; t <= T1 + 1e-9; t += TICK_S) ticks.push(t);
    // (Before, and the change: a dashed line at 0 with its word, as the meal's on the meal chart. "Before" only where it fits over its seconds.)
    const x0 = X(0), preW = x0 - X(T0), word = spec.word;
    const panel = plotPanel(sv, 0, G.keyH + 0.1 * f, G.w, G.h - (G.keyH + 0.1 * f));
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${f.toFixed(2)}px` },
      sv('defs', {}, panel.clip), panel.back, marks, legend,
      sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
      ticks.map((t) => sv('text', { class: 'pft-tk', 'data-look': 'time.tk', x: X(t), y: B + 1.25 * f, 'text-anchor': 'middle' }, t > 0 ? `+${t}` : t < 0 ? `−${-t}` : '0')),
      sv('text', { class: 'ptk-ax', 'data-look': 'plot.ax', x: R + G.half, y: B + 1.25 * f }, 's'),
      cw('Before', f, 1) + 8 <= preW ? sv('text', { class: 'pft-t', 'data-look': 'ft.t', x: (X(T0) + x0) / 2, y: T - 0.6 * f, 'text-anchor': 'middle' }, 'Before') : null,
      sv('line', { class: 'pft-meal', 'data-look': 'ft.meal', x1: x0, x2: x0, y1: T - 1.5 * f, y2: B }),
      sv('text', { class: 'pft-t meal', 'data-look': 'ft.t', x: x0 + 6, y: T - 0.6 * f }, word),
      lines.map((l) => l.path), lines.map((l) => [l.dot, l.val]));
    return { svg, lines, boxes: boxes.length ? boxes : NO_BOXES, pn: -1 };
  }
  // Draw the lines up to t s: the flat stretch before the change, each point passed, then the head, its value over it.
  function paint(t) {
    if (!parts) return;
    const ls = parts.lines;
    let m = 0;
    while (m < n && pts[3 * m] < t) m++;
    let printed = false;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], P = l.P, b = l.Y(before[i]);
      P[0] = round1(X(T0)); P[1] = round1(b); P[2] = round1(X(0)); P[3] = round1(b);
      let c = 2;
      if (on) for (let q = 0; q < m && c < CAP + 2; q++) { P[2 * c] = round1(X(pts[3 * q])); P[2 * c + 1] = round1(l.Y(pts[3 * q + 1 + i])); c++; }
      const v = valAt(i, t), hx = X(on ? t : 0), hy = l.Y(v);
      if (on && t > 0) { P[2 * c] = round1(hx); P[2 * c + 1] = round1(hy); c++; }
      setPts(l.path, P, c, false);
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
      setWords(l.val, l.txt);
      l.hy = hy;
    }
    // (Two heads close together: the lower band's value goes under its head, clear of the other.)
    if (Math.abs(ls[0].hy - ls[1].hy) < 1.4 * G.f) setGeo(ls[0].val, 'y', fix1(ls[0].hy + 1.5 * G.f));
    if (printed) {
      // alloc-rare: only when a printed number changed
      let label = `${LINE[spec.lines[0]][0]} and ${LINE[spec.lines[1]][0].toLowerCase()}, ${on ? `${fmtN(Math.round(t))} s after` : 'before'} ${spec.word.toLowerCase()}: `;
      for (let j = 0; j < ls.length; j++) label += `${j ? ', ' : ''}${LINE[spec.lines[j]][0]} ${on ? `${withUnit(before[j], ls[j].d, ls[j].unit)} to ` : ''}${ls[j].txt}`;
      attrSoon(parts.svg, 'aria-label', label);
    }
    if (parts.pn !== m) {
      parts.pn = m;
      // alloc-rare: only when a point is passed
      dataSoon(parts.svg, 'points', String(m));
    }
  }
  // The heads glide after the newest point (never a jump); held, nothing is drawn.
  // (By time, not by frame: headStep, display-state.js, the same curve at any refresh rate.)
  function tick(t) {
    raf = 0;
    const dt = lastT ? (t - lastT) / 1000 : HEAD_DT0;
    shown = reduceMQ.matches ? goal : headStep(shown, goal, dt);
    if (Math.abs(goal - shown) < 0.002) shown = goal;
    paint(shown);
    gl.paint();
    if (shown !== goal) { lastT = t; raf = nextFrame(tick); } else lastT = 0;
  }
  const size = () => {
    const w = readMetric(el, 'clientWidth'), hh = readMetric(el, 'clientHeight');
    const f = fittedType(el, gl, FT_MIN);
    return [Math.max(160, w || 420), Math.max(8 * f, hh || 260), f];
  };
  const make = () => { const [w, hh, f] = size(); lastSz = `${Math.round(w)}x${Math.round(hh)}x${Math.round(f)}`; G = geo(w, hh, f); return build(); };
  function draw(fade) {
    const old = [...el.children].filter((c) => c.hasAttribute('data-svg-model'));
    parts = make();
    el.append(parts.svg); paint(shown); gl.place(parts.svg);
    if (fade) gl.fadeIn(parts.svg, D_SURFACE, EASE_ARRIVE);
    old.forEach((o) => o.remove());
  }
  const remake = () => {
    if (!spec || !parts || !el.isConnected) return;
    const [w, hh, f] = size(); if (`${Math.round(w)}x${Math.round(hh)}x${Math.round(f)}` === lastSz) return;
    const prev = parts.svg; parts = make(); prev.replaceWith(parts.svg); paint(shown); gl.place(parts.svg);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(remake) : null;
  ro?.observe(el);
  return {
    el,
    /** The graph for a slide: spec (eventGraphOf), b: where its lines start ([lower, upper], the model's units), end: where they are expected
     *  to end (the same, or null: its scale is then set from the start alone, and still holds a fall). kept: a run played through before. */
    set(s, b, end = null, kept = null) {
      spec = s;
      const x = spec.lines.map((k) => LINE[k][4] ?? 1);
      before = [b[0] * x[0], b[1] * x[1]];
      scales = spec.lines.map((k, j) => eventScale(k, [b[j], end?.[j]], j === 0 ? spec.target : null));
      el.dataset.lines = spec.lines.join(',');
      n = 0; on = false; shown = goal = 0;
      if (kept) { pts.set(kept.pts.subarray(0, 3 * kept.n)); n = kept.n; on = true; shown = goal = pts[3 * (n - 1)]; }
      draw(true);
    },
    /** The change has happened: the seconds after it start from here (the model's clock, presenter.js liveSet). */
    start() { if (!spec) return; n = 0; on = true; shown = goal = 0; paint(0); gl.paint(); },
    /** A live reading t s after the change: v, the model's values of the two lines. */
    push(t, v0, v1) {
      if (!spec || !on || !(t > 0) || !Number.isFinite(v0) || !Number.isFinite(v1)) return;
      if (n && t <= pts[3 * (n - 1)]) return;
      const i = Math.min(n, CAP - 1) * 3;
      pts[i] = Math.min(t, T1); pts[i + 1] = v0 * (LINE[spec.lines[0]][4] ?? 1); pts[i + 2] = v1 * (LINE[spec.lines[1]][4] ?? 1);
      if (n < CAP) n++;
      goal = pts[3 * (n - 1)];
      if (!raf) raf = nextFrame(tick);
    },
    /** Back before the change: what was drawn after it goes. */
    reset() { if (!spec) return; cancelFrame(raf); raf = 0; lastT = 0; n = 0; on = false; shown = goal = 0; paint(0); gl.paint(); },
    /** The run as drawn, to show again whole (null before the change). */
    kept() { return on && n ? { pts: pts.slice(0, 3 * n), n } : null; },   // alloc-rare: once, as a run ends
    /** Seconds the clock runs after the change. */
    get secs() { return T1; },
    dispose() { cancelFrame(raf); raf = 0; lastT = 0; ro?.disconnect(); gl.dispose(); },
    refit: remake,
  };
}
