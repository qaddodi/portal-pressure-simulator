// Portal pressure and portal flow around a meal, on one chart (the presenter's flow-time tool). Flow sits in the upper
// band on its own tight scale (L/min, right) so its rise reads clearly; pressure sits in the lower band on a scale from
// zero (mmHg, left), so its small rise reads as small. The two never cross.
// Time is a teaching scale in minutes: a fasting baseline before the meal (a dashed line at 0), the slide's time-lapse
// spread over the rise, then the state it reaches held to the end. The values are the model's own: the off-screen chain
// keeps the portal pressure and flow on each day of the time-lapse (worker-core's trail), read here once a minute
// (straight between days). The lines draw from left to right as the time-lapse plays, easing after its clock.
// The same chart plots a disease time-lapse (clock 'days'): two of the slide's own readings, one point per model day from
// day 0 to its last, drawn as it plays (Ascites builds: ascites over sinusoidal pressure; varices: varix over HVPG).
import { frameFor } from './frame.js?v=3dd403a11f';
import { RX, bandKeys } from './rx-bands.js?v=51e83c7c59';
const nextFrame = frameFor('flow-time');

// (No imports: the series and scales load in Node for the unit tests. Every value here is positive.)
const fmt = (v, d) => v.toFixed(d), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const FT_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)

// Minutes on the teaching clock: fasting from `from` to 0, the rise over `rise`, the state reached held to `end`.
export const MINUTES = { from: -10, rise: 30, end: 40 };
// The lines a chart can plot (fingerprint keys): name, unit, decimals, colour and a scale on the model's value.
// A chart's lines are [lower, upper]: the lower a pressure on a scale from zero, the upper on its own tight scale.
export const LINE = {
  pv: ['Portal pressure', 'mmHg', 1, '--tr-pv'], ppg: ['PPG', 'mmHg', 1, '--tr-pv'], pvFlow: ['Portal flow', 'L/min', 1, '--tr-hv'],
  sin: ['Sinusoids', 'mmHg', 1, '--tr-wedge'], asc: ['Ascites', 'L', 1, '--tr-hv', 0.001],
  hvpg: ['HVPG', 'mmHg', 1, '--tr-wedge'], varix: ['Varix', 'mm', 1, '--tr-var'],
};
export const MEAL_LINES = ['pv', 'pvFlow'];
const NICE = [1, 2, 2.5, 5, 10];
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); return NICE.find((s) => s * p >= raw - 1e-9) * p; };
const ticksOf = (lo, hi, step) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => +(lo + k * step).toPrecision(6));
// Flow: a tight scale around its values (about four steps), so the rise fills most of its band.
function flowScale(v) {
  const a = Math.min(...v), b = Math.max(...v), step = niceStep(Math.max(1e-6, (b - a) / 4));
  const lo = Math.max(0, Math.floor(a / step + 1e-9) * step), hi = Math.ceil(b / step - 1e-9) * step;
  const ticks = ticksOf(lo, hi, step);
  return { min: ticks[0], max: ticks.at(-1), ticks };
}
// Pressure: from zero, so its rise keeps its true size.
function pressureScale(v) {
  const top = Math.max(...v), step = niceStep(top / 2), ticks = ticksOf(0, Math.ceil(top / step - 1e-9) * step, step);
  return { min: 0, max: ticks.at(-1), ticks };
}

/** trail: [[day, lower, upper], ...] → { min (the clock: minutes, or days), pv (the lower line), flow (the upper), one
 *  value a step from ax.from to ax.end, each one's scale, and ax }. On the meal clock the trail's first day is the meal
 *  (0 min), its last the end of the rise; on the 'days' clock each model day is its own step. lines: their scales. */
export function flowTimeSeries(trail, clock = 'meal', lines = MEAL_LINES) {
  const pts = (trail || []).filter((r) => r && Number.isFinite(r[1]) && Number.isFinite(r[2]));
  if (pts.length < 2) return null;
  const d0 = pts[0][0], span = Math.max(1e-6, pts.at(-1)[0] - d0);
  const ax = clock === 'days' ? { from: 0, rise: Math.max(1, Math.round(span)), end: Math.max(1, Math.round(span)) } : MINUTES;
  const x = lines.map((k) => LINE[k]?.[4] ?? 1);
  const at = (j, m) => {
    const d = d0 + span * clamp(m / ax.rise, 0, 1), k = clamp(pts.findIndex((r) => r[0] >= d), 1, pts.length - 1);
    const f = clamp((d - pts[k - 1][0]) / Math.max(1e-9, pts[k][0] - pts[k - 1][0]), 0, 1);
    return (pts[k - 1][j] + (pts[k][j] - pts[k - 1][j]) * f) * x[j - 1];
  };
  const min = Array.from({ length: ax.end - ax.from + 1 }, (_, k) => ax.from + k);
  const pv = min.map((m) => at(1, m)), flow = min.map((m) => at(2, m));
  return { min, pv, flow, pScale: pressureScale(pv), fScale: flowScale(flow), ax };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
// The plot, drawn at the chart's own size in pixels with the card's small type (f): the upper line's band at the top, the
// lower's under it, the clock under both. Each band's numbers sit on its own side, in its line's colour; the legend names
// the two lines (with their units) over the plot, on one row when it fits, else two.
const cw = (t, f, b) => t.length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: the chart is laid out before it is drawn)
const legendOf = (keys, f) => keys.map((key) => { const [name, unit, , c] = LINE[key]; return { c, name, unit, w: 22 + cw(name, f, 1) + 6 + cw(unit, f) }; });
// A full-width chart needs room for both plots as well as its legend, clock and treatment bars. Below this
// minimum the presenter keeps its existing fit, rather than protecting a chart whose labels would collide.
export function flowTimeHeight(w, f, room, keys = MEAL_LINES, bandEm = 0) {
  const legend = legendOf(keys, f), rows = legend[0].w + legend[1].w + 2 * f <= w ? 1 : 2;
  const bands = bandEm * f, min = (rows * 1.5 + 1.9 + 1.7 + 6) * f + bands;
  const preferred = Math.max(0.6 * w, 15 * f) + bands;
  return { min, preferred, height: room >= min ? Math.min(preferred, room) : null };
}
const linesOf = (keys) => keys.map((key, j) => { const [name, unit, d, c] = LINE[key]; return j ? ['flow', 'fScale', null, c, name, unit, d] : ['pv', 'pScale', null, c, name, unit, d]; });
const dec = (sc) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);
/** Whether a line's value goes left of its head: when, drawn right of it (its baseline 0.7 f over the head, in type 1.1 f),
 *  it would run off the chart (width w) or onto one of the numbers in the right margin (boxes: [x0, x1, y0, y1], the upper
 *  band's gridline numbers), as the ascites ending at 1.2 L ran onto the "1.5" of its own scale. */
export function headLeft(hx, hy, tw, f, w, boxes = []) {
  const x0 = hx + 0.6 * f, x1 = x0 + tw, y1 = hy - 0.7 * f + 0.25 * f, y0 = y1 - 1.1 * f;
  return x1 > w || boxes.some(([a, b, c, d]) => x0 < b && a < x1 && y0 < d && c < y1);
}

export function createFlowTime() {
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');   // (one query, read each frame: a new one was made every frame)
  const el = document.createElement('div');
  el.className = 'pz-flowtime';
  el.dataset.lines = MEAL_LINES.join(',');
  let ser = null, parts = null, shown = 0, goal = 0, raf = 0, sig = '', clock = 'meal', keys = MEAL_LINES, LINES = linesOf(keys);
  let rx = [];   // (the treatments on through the slide's time-lapse that its tool shades, rx-bands.js; none on a built-in deck)
  const ax = () => ser?.ax || MINUTES;
  const Yof = (band, sc) => (v) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
  const val = (arr, m) => { const j = clamp(Math.floor(m - ax().from), 0, arr.length - 2); return arr[j] + (arr[j + 1] - arr[j]) * clamp(m - ax().from - j, 0, 1); };
  let G = null;
  // (The treatments under the clock: their names on one row, then a thin bar each. The chart is that much taller
  // (styles/app.css .pz-flowtime.has-bands sets the same room, in em), so the plot keeps the height it has without them.)
  const bandRoom = (f) => (rx.length ? (0.95 + 0.32 * rx.length) * f : 0);
  // The geometry for a chart w × h px in type f px.
  function geo(w, h, f) {
    const meal = clock !== 'days', keysL = legendOf(keys, f);
    const oneRow = keysL[0].w + keysL[1].w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow ? 1 : 2) * rowH;
    const tw = (sc) => Math.max(...sc.ticks.map((v) => cw(fmt(v, dec(sc)), f)));
    // (Right of the plot: the upper line's numbers, and the clock's unit in capitals after half its last number.)
    // (On a slide with treatment bars the left numbers stand clear of the start ring too.)
    const half = cw(`+${ax().end}`, f) / 2 + 6, L = Math.ceil(tw(ser.pScale) + 8 + (rx.length ? Math.max(3, f * 0.3) + 2 : 0)), R = Math.floor(w - Math.max(tw(ser.fScale) + 8, half + (meal ? 3 : 4) * f * 0.78 + 4));
    // (Room over the plot for the "Fasting" and "Meal" row, else for the upper line's value over its head.)
    const T = legH + (meal ? 1.9 * f : 1.9 * f), B = h - 1.7 * f - bandRoom(f), ph = Math.max(4 * f, B - T);
    return { w, h, f, half, meal, keysL, oneRow, rowH, L, R, T, B, FB: [T, T + 0.36 * ph], PB: [T + 0.62 * ph, T + ph] };
  }
  const X = (m) => G.L + (G.R - G.L) * (m - ax().from) / (ax().end - ax().from);
  function build() {
    const { f, L, R, T, B, FB, PB, meal } = G;
    const lines = LINES.map(([k, s, , c, , unit, d]) => ({ k, unit, d, c, Y: Yof(k === 'flow' ? FB : PB, ser[s]),
      path: sv('path', { class: 'ptk-line', style: `stroke: var(${c})` }),
      dot: sv('circle', { class: 'pft-dot', r: Math.max(4, f * 0.42), style: `fill: var(${c})` }),
      val: sv('text', { class: 'pft-v', style: `fill: var(${c})` }) }));
    // The first values at the start, each under its line (a line that rises runs away from it, never through it).
    const start = lines.map((l) => { const v = ser[l.k][0], y = l.Y(v);
      return [sv('circle', { class: 'pft-start', cx: X(ax().from), cy: y, r: Math.max(3, f * 0.3), style: `stroke: var(${l.c})` }),
        sv('text', { class: 'pft-v0', x: X(ax().from) + 4, y: y + 1.35 * f, style: `fill: var(${l.c})` }, `${fmt(v, l.d)} ${l.unit}`)]; });
    const [lp, lf] = lines;
    // Each band's gridlines, numbered on its own side in its line's colour: every line when they are 1.3 lines of type
    // apart or more, else the ends only (else the top alone).
    const shows = (sc, Y) => {
      const gap = Math.abs(Y(sc.ticks[0]) - Y(sc.ticks.at(-1))) / Math.max(1, sc.ticks.length - 1);
      return (j) => gap >= 1.3 * f || j === sc.ticks.length - 1 || (j === 0 && gap * (sc.ticks.length - 1) >= 1.3 * f);
    };
    const grid = (sc, Y, x, anchor, c) => {
      const show = shows(sc, Y);
      return sc.ticks.map((v, j) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(v), y2: Y(v) }),
        show(j) ? sv('text', { x, y: Y(v) + 0.35 * f, 'text-anchor': anchor, style: `fill: var(${c})` }, fmt(v, dec(sc))) : null));
    };
    // The legend: each line's swatch, name and unit; the lower line's on the left, the upper's on the right (or under it).
    const legend = G.keysL.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        sv('line', { x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0, style: `stroke: var(${k.c})` }),
        sv('text', { x: right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start', style: `fill: var(${k.c})` },
          right ? [sv('tspan', { class: 'pft-u' }, `${k.unit} `), sv('tspan', {}, k.name)] : [sv('tspan', {}, k.name), sv('tspan', { class: 'pft-u' }, ` ${k.unit}`)])); });
    const mins = [], step = meal ? 10 : niceStep(ax().end / Math.max(2, Math.min(4, Math.floor((R - L) / (4 * f)))));
    for (let m = ax().from; m <= ax().end + 1e-9; m += step) mins.push(m);
    // (The upper band's numbers shown in the right margin, as boxes a line's value keeps clear of.)
    const showF = shows(ser.fScale, lf.Y);
    const boxes = ser.fScale.ticks.flatMap((v, j) => (showF(j) ? [[R + 6, R + 6 + cw(fmt(v, dec(ser.fScale)), f), lf.Y(v) - 0.45 * f, lf.Y(v) + 0.55 * f]] : []));
    // Each treatment on through the whole time-lapse (it runs on the slide's own params): its name in its colour on one row
    // under the clock, then a thin bar each in the same order and colour, over the plot's whole time, so every bar starts
    // where the treatment does and no line, value or number can run into them.
    const bandEls = rx.length ? sv('g', { class: 'pft-bands' },
      sv('text', { class: 'pft-band-n', x: L, y: B + 2.3 * f }, rx.map((k, j) => sv('tspan', { style: `--rx: var(${RX[k][2]})` }, (j ? '  ·  ' : '') + RX[k][0]))),
      rx.map((k, j) => sv('rect', { class: 'pft-band', 'data-rx': k, style: `--rx: var(${RX[k][2]})`, x: L, width: Math.max(2, R - L), y: B + 2.55 * f + j * 0.32 * f, height: 0.2 * f, rx: 0.1 * f }))) : null;
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${G.f.toFixed(2)}px` },
      bandEls, grid(ser.fScale, lf.Y, R + 6, 'start', lf.c), grid(ser.pScale, lp.Y, L - 6 - (rx.length ? Math.max(3, f * 0.3) + 2 : 0), 'end', lp.c), legend,
      sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      mins.map((m) => sv('text', { class: 'pft-tk', x: X(m), y: B + 1.25 * f, 'text-anchor': 'middle' }, m > 0 ? `+${m}` : m < 0 ? `−${-m}` : '0')),
      sv('text', { class: 'ptk-ax', x: R + G.half, y: B + 1.25 * f }, meal ? 'min' : 'days'),
      // Fasting, then the meal: a dashed line at 0 min.
      meal ? [sv('text', { class: 'pft-t', x: (X(MINUTES.from) + X(0)) / 2, y: T - 0.6 * f, 'text-anchor': 'middle' }, 'Fasting'),
        sv('line', { class: 'pft-meal', x1: X(0), x2: X(0), y1: T - 1.5 * f, y2: B }),
        sv('text', { class: 'pft-t meal', x: X(0) + 6, y: T - 0.6 * f }, 'Meal')] : null,
      lines.map((l) => l.path), start, lines.map((l) => [l.dot, l.val]));
    return { svg, lines, boxes };
  }
  // Draw the lines up to minute m, each line's value over its head (flipped left near the right edge).
  function paint(m) {
    if (!parts) return;
    const heads = parts.lines.map((l) => {
      const arr = ser[l.k], p = ser.min.filter((x) => x < m).map((x, j) => [X(x), l.Y(arr[j])]);
      p.push([X(m), l.Y(val(arr, m))]);
      l.path.setAttribute('d', p.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
      const [hx, hy] = p.at(-1), v = val(arr, m), txt = `${fmt(v, l.d)} ${l.unit}`, left = headLeft(hx, hy, cw(txt, G.f * 1.1, 1), G.f, G.w, parts.boxes);
      l.dot.setAttribute('cx', hx.toFixed(1)); l.dot.setAttribute('cy', hy.toFixed(1));
      l.val.setAttribute('x', (hx + (left ? -0.6 : 0.6) * G.f).toFixed(1)); l.val.setAttribute('y', (hy - 0.7 * G.f).toFixed(1));
      l.val.setAttribute('text-anchor', left ? 'end' : 'start');
      if (l.val.textContent !== txt) l.val.textContent = txt;   // (a glide's frames mostly keep the shown value: rewritten, the text was laid out again)
      l.val.classList.toggle('off', m - ax().from < 0.36 * (ax().end - ax().from));   // (near the start the first value is already there)
      return v;
    });
    // (Two heads close together, the bands short on a phone: the lower band's value goes under its head, clear of the other.)
    const [a, b] = parts.lines.map((l) => +l.val.getAttribute('y'));
    if (Math.abs(a - b) < 1.4 * G.f) { const lo = parts.lines[a > b ? 0 : 1]; lo.val.setAttribute('y', (+lo.dot.getAttribute('cy') + 1.5 * G.f).toFixed(1)); }
    parts.svg.setAttribute('aria-label', `${LINES[0][4]} and ${LINES[1][4].toLowerCase()} ${clock === 'days' ? `over ${ax().end} days` : 'around a meal'}: `
      + LINES.map(([k, , , , name, unit, d], j) => `${name.toLowerCase()} ${fmt(ser[k][0], d)} to ${fmt(heads[j], d)} ${unit}`).join(', '));
    parts.svg.dataset.points = String(ser.min.filter((x) => x < m).length + 1);   // (the points drawn so far, of data-of: the browser checks read them)
    parts.svg.dataset.of = String(ser.min.length);
  }
  // The heads glide after the goal (never a jump).
  function tick() {
    raf = 0;
    shown += (goal - shown) * (reduceMQ.matches ? 1 : 0.16);
    if (Math.abs(goal - shown) < 0.001 * (ax().end - ax().from)) shown = goal;
    paint(shown);
    if (shown !== goal) raf = nextFrame(tick);
  }
  // The chart's size: the box the card gives it (its height is set in CSS, shorter as the card fits), in its small type.
  // (The card zooms its contents to its own scale, a Mac's data card to 0.8 and an iPad's lower: the chart's type is set larger
  // by as much, so its words are never under 12 px on the screen; they were 9.6 px on a Mac and 8 px on an iPad held sideways.)
  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? FT_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 260), f];
  };
  const make = () => { const [w, hh, f] = size(); G = geo(w, hh, f); return build(); };
  // Redrawn at once when the box changes size (a new card width, the card fitting itself): the same lines, the new geometry.
  let lastSz = '';
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (!ser || !parts || !el.isConnected) return;
    const sz = size().map((x) => Math.round(x)).join('x'); if (sz === lastSz) return; lastSz = sz;
    const prev = parts.svg; parts = make(); prev.replaceWith(parts.svg); paint(shown);
  }).observe(el);
  // k: how far along the time-lapse (0 to 1): its minutes on the rise; once it has ended, the held state to the end.
  const minuteOf = (k) => (k >= 1 ? ax().end : ax().rise * clamp(k, 0, 1));
  return {
    el,
    /** trail: the time-lapse's [[day, lower, upper]] (null: not computed yet; undefined: keep the one drawn);
     *  k: how far along it to draw (0 to 1); spec: { clock: 'meal' | 'days', lines: [lower, upper] } (undefined: keep
     *  the one drawn). A new trail fades in over the old chart. */
    set(trail, k = 1, spec) {
      if (spec) { clock = spec.clock || 'meal'; keys = spec.lines || MEAL_LINES; el.dataset.lines = keys.join(','); el.classList.toggle('days', clock === 'days'); }
      const s2 = trail === undefined ? sig : trail ? JSON.stringify([clock, keys, trail[0], trail.at(-1), ...(rx.length ? [rx] : [])]) : '';
      if (s2 !== sig) {
        sig = s2; LINES = linesOf(keys); ser = flowTimeSeries(trail, clock, keys);
        const old = [...el.children];
        parts = ser ? make() : null;
        if (parts) {
          parts.svg.classList.add('in'); el.append(parts.svg);
          nextFrame(() => nextFrame(() => parts?.svg.classList.remove('in')));
        }
        setTimeout(() => old.forEach((o) => o.remove()), 480);
        shown = goal = minuteOf(k); paint(shown);
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
      el.style.setProperty('--band-room', `${rx.length ? 0.95 + 0.32 * rx.length : 0}em`);
    },
    update() {}, clear() {},
  };
}
