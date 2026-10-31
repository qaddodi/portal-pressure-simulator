// Deck visuals: a course over days in the data card (his J pick on the Ascites relation slide, 27 Oct: "Ascites after the tap").
//
//   tool: { kind: 'course', reading: 'asc',
//           from: { preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] } },
//           event: { params: { albumin: 2.74 }, action: { kind: 'paracentesis', mL: 8000 } },
//           wait: 14, after: 28,
//           then: [{ name: 'Diuretics', params: { diuretics: true } }, { name: 'Diuretics + TIPS', params: { diuretics: true, tips: { on: true } } }],
//           words: { event: 'Tap', before: 'Tense belly', start: 'Treatment starts', rise: 'Refills', axis: 'Weeks after the tap', label: 'Ascites, liters',
//                    title: 'Ascites after the tap', short: 'After the tap' } }
//
// One reading (a fingerprint key, named and scaled as its tile) against the days after an event, on the patient the slide
// describes (a fresh model, so the chart does not depend on the slide's own state): `from` is the case before the event, `event`
// day 0 (a change of settings and/or an action, a tap), then `wait` days with nothing done, then each treatment of `then` (at most two,
// each from that same day) for `after` more days. The model's own number for every day is a point on the line; the line is drawn
// smoothly through them and never overshoots one. Before the event the case is one dot (words.before); the first stretch is
// grey, each treatment its own colour (c: a colour token, else pink and blue) with its name at the line's end and a dot there.
// The reading's rating bands (its tile's: ascites None, Grade 1, 2, 3) are the plot's zones, each named on its own band where the lines leave a clear spot
// (a name with none is left out) and the cut-offs are the coloured numbers at the left with their unit ("1.5 L", "5 L"), the strip no wider than they are. A dashed upright line marks the day the
// treatments start (words.start). The x axis is in weeks (a number every two, the event named at 0), its name words.axis.
// The days are worked out once per deck on the presenter's calculation worker (ctx.run: the head from a fresh model, then the
// treatments from its last state) and kept; until they are there the zones, numbers and axes show and the lines then fade in.
// These are the model's own speeds, not a patient's: a deck line that quotes them needs a source, or none.

import { TILE, RATE } from './table-marks.js?v=bca5ebb624';
import { lineMeta, cutsOf, fmtTick, placeWord } from './tool-curve.js?v=d02fd985d6';
import { plotPanel } from './plot-look.js?v=5037697da7';
import { frameFor } from './frame.js?v=9e0c25a14c';
const nextFrame = frameFor('tool-course');

const CO_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
const BRANCH_C = ['--tr-pv', '--tr-hv'];
const HEAD_C = '--text-2';
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v, d) => (typeof v === 'string' && v ? v : d);
const int = (v, d, lo, hi) => (v != null && v !== '' && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] != null).map((k) => [k, o[k]]));

/** The tool's options, checked: { reading, from, event, wait, after, then: [{ name, params, c }], words }. */
export function courseOf(t) {
  const reading = typeof t?.reading === 'string' && TILE[t.reading] ? t.reading : 'asc';
  const ev = obj(t?.event), wd = obj(t?.words), m = lineMeta(reading);
  return {
    reading,
    from: pick(obj(t?.from), ['preset', 'presetDays', 'params', 'days', 'ramp']),
    event: pick(ev, ['params', 'action']),
    wait: int(t?.wait, 14, 1, 60), after: int(t?.after, 28, 1, 90),
    then: [].concat(t?.then || []).filter((b) => b && typeof b.name === 'string' && b.name).slice(0, 2)
      .map((b, j) => ({ name: b.name, params: obj(b.params), c: str(b.c, BRANCH_C[j]) })),
    words: { event: str(wd.event, 'Event'), before: str(wd.before, ''), start: str(wd.start, ''), rise: str(wd.rise, ''), axis: str(wd.axis, 'Days'), label: str(wd.label, `${m.name}, ${m.unit}`),
      title: str(wd.title, `${m.name} over the days`), short: str(wd.short, 'Over the days') },
  };
}

/** The steps for ctx.run from a fresh model: the case before the event, the event, then one model day a step for `wait` days. */
export const headSteps = (t) => { const c = courseOf(t); return [{ ...c.from }, { ...c.event }, ...Array.from({ length: c.wait }, () => ({ days: 1 }))]; };
/** The steps for ctx.run from the head's last state: each treatment's `after` days, one a step, the second starting again from that state. */
export const tailSteps = (t) => {
  const c = courseOf(t);
  return c.then.flatMap((b, j) => Array.from({ length: c.after }, (_, i) => (i ? { days: 1 } : { params: b.params, days: 1, ...(j ? { restart: true } : {}) })));
};

/** The series from the two runs' states (shown units), or null: { name, unit, before, head: [[day, value] …day 0 to wait], tails: [{ name, c, pts }] from day
 *  `wait` (the head's last point) to the last day }, wait and days (the last day). */
export function courseSeries(t, head, tail) {
  const c = courseOf(t), m = lineMeta(c.reading), total = c.wait + c.after;
  if (!Array.isArray(head) || !Array.isArray(tail) || head.length !== 2 + c.wait || tail.length !== c.then.length * c.after) return null;
  const v = (s) => (Number.isFinite(s?.fp?.[c.reading]) ? s.fp[c.reading] * m.x : null);
  const before = v(head[0]), days = head.slice(1).map((s, k) => [k, v(s)]);
  const tails = c.then.map((b, j) => ({ name: b.name, c: b.c, pts: [days.at(-1), ...tail.slice(j * c.after, (j + 1) * c.after).map((s, i) => [c.wait + 1 + i, v(s)])] }));
  if (before == null || days.some((p) => p[1] == null) || tails.some((q) => q.pts.some((p) => p[1] == null))) return null;
  return { name: m.name, unit: m.unit, d: m.d, before, head: days, tails, wait: c.wait, days: total };
}

/** A smooth path through points [x, y] (x rising): a cubic through each that never overshoots its neighbours (Fritsch–Carlson, so a flat
 *  stretch stays flat and a fall to zero does not dip under it). With join the path goes on from where one stands (L, not M). */
export function smoothPath(pts, join = false) {
  const n = pts.length, r = (v) => +v.toFixed(1);
  if (n < 2) return n ? `${join ? 'L' : 'M'}${r(pts[0][0])} ${r(pts[0][1])}` : '';
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0; }
  const s = [m[0]];
  for (let i = 1; i < n - 1; i++) s[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  s[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { s[i] = 0; s[i + 1] = 0; continue; }
    const a = s[i] / m[i], b = s[i + 1] / m[i], k = Math.hypot(a, b);
    if (k > 3) { s[i] = (3 * a / k) * m[i]; s[i + 1] = (3 * b / k) * m[i]; }
  }
  let d = `${join ? 'L' : 'M'}${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3, [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    d += `C${r(x0 + h)} ${r(y0 + s[i] * h)} ${r(x1 - h)} ${r(y1 - s[i + 1] * h)} ${r(x1)} ${r(y1)}`;
  }
  return d;
}

// (A bold word's width, letter by letter in em, a little over what the app's face draws, so a word placed clear stays clear: laid out before it is drawn.)
const EM = { ' ': 0.28, i: 0.27, l: 0.27, j: 0.27, '.': 0.27, ',': 0.27, ':': 0.27, ';': 0.27, '!': 0.27, '|': 0.27, I: 0.3, t: 0.38, f: 0.38, r: 0.42, '+': 0.62, '(': 0.36, ')': 0.36, '-': 0.4, '−': 0.6, m: 0.88, w: 0.8, M: 0.86, W: 0.98 };
export const cw = (t, f) => 1.06 * f * [...String(t)].reduce((a, ch) => a + (EM[ch] ?? (/[A-Z]/.test(ch) ? 0.7 : /[0-9]/.test(ch) ? 0.62 : 0.58)), 0);
const xStep = (total) => { let s = 14; while (total / s > 5) s *= 2; return s; };

/** The chart's geometry for a card w × h px in type f px, on the series ser (null until it is there): the scale (the same with or without the
 *  series, so the zones stay put as the lines arrive), the zones, the numbers on the axes, and the plot's edges L, R, T, B. */
export function layout(w, h, f, c, ser, keyRow = false) {
  const m = lineMeta(c.reading), cuts = cutsOf(c.reading), total = c.wait + c.after, lastCut = cuts.at(-1)?.v ?? 1;
  // (The caption's row, then the panel; the x numbers on the row under the plot and the axis's name on a row of its own under them.)
  const keyH = (keyRow ? 3 : 1.5) * f, py = keyH + 0.2 * f, foot = 3.1 * f, T = py, B = Math.max(py + 3 * f, h - foot - 0.2 * f), H = B - T;
  // (The top of the scale: a little over the last cut-off and the values, and high enough that the first dot's name stands over it.)
  const vmax = ser ? Math.max(ser.before, ...ser.head.map((p) => p[1]), ...ser.tails.flatMap((q) => q.pts.map((p) => p[1]))) : 0;
  const top = Math.max(lastCut * 1.28, vmax * 1.2, ser ? ser.before / (1 - Math.min(0.5, 2.1 * f / H)) : 0);
  const Y = (v) => B - H * Math.min(v, top) / top;
  const zones = [{ from: 0, to: cuts[0]?.v ?? top, rate: 'ok', name: '', deep: false },
    ...cuts.map((q, i) => {
      const to = cuts[i + 1]?.v ?? top;
      return { from: q.v, to, rate: q.rate, name: RATE[c.reading]?.((q.v + to) / 2 / m.x, {})?.[1] ?? '', deep: i > 0 && i === cuts.length - 1 && q.rate === cuts[i - 1].rate };
    })];
  // (A number at the baseline and at each cut-off that stands clear of the one under it: not the 0.15 L that starts Grade 1, a hair above zero.)
  const ticks = [];
  for (const v of [0, ...cuts.map((q) => q.v)]) {
    if (v >= top) continue;
    const last = ticks.at(-1);
    if (!last || Y(last.v) - Y(v) >= 1.4 * f) ticks.push({ v, rate: v ? cuts.find((q) => q.v === v).rate : null, text: v ? `${fmtTick(v, m.d)} ${m.unit}` : '0' });
  }
  // (The strip at the left is the numbers and no more: the zones' names stand on the plot, placeLabels.)
  const Tw = Math.max(...ticks.map((q) => cw(q.text, f)));
  const L = Math.ceil(8 + Tw + 8), R = Math.floor(w - 10);
  const lead = Math.max(2, 0.075 * total), x0 = -lead * 1.6, x1 = total * 1.025, X = (d) => L + (R - L) * (d - x0) / (x1 - x0);
  const step = xStep(total), xt = [];
  for (let d = 0; d <= total + 1e-9; d += step) xt.push({ d, text: d ? fmtTick(d / 7, 1) : c.words.event });
  // (With keyRow the lines' names stand in a row of their own under the caption, a swatch of the line's colour before each: for a card too short or too
  // narrow to put them by the lines' ends, where they would land on the lines.)
  let kx = 0;
  const keys = keyRow && ser ? ser.tails.map((q) => { const k = { x: kx, name: q.name, c: q.c, w: 22 + cw(q.name, f) }; kx += k.w + 14; return k; }) : [];
  return { w, h, f, c, m, top, zones, ticks, Tw, L, R, T, B, H, py, foot, keyH, keyRow, keys, lead, x0, x1, total, xt, X, Y, tickX: L - 6 };
}

/** Where each zone's name stands, on its own band: of the spots tried (the right end level with the band's middle first, then up and down it, then
 *  further in along it, then the left of the plot) the first that lands on nothing. Returns [{ zone, p }] with p null where no spot is clear: that
 *  name is left out. obs is what the words keep clear of ({ segs, boxes, lines }); the names added to its boxes as they are placed. */
export function placeZoneNames(G, obs, wait = null) {
  const { f, L, R, X, Y } = G, out = [];
  for (const z of G.zones.filter((q) => q.name)) {
    const top = Y(z.to), bot = Y(z.from), mid = (top + bot) / 2 + 0.35 * f, inside = [L + 2, top + 1, R - 2, bot - 1];
    const ys = [0, -0.9, 0.9, -1.8, 1.8].map((k) => mid + k * f).filter((y) => y - 0.85 * f - 1 >= top && y + 0.3 * f + 1 <= bot);
    const xs = [{ x: R - 0.5 * f, anchor: 'end' }, { x: R - 0.5 * f - 0.3 * (R - L), anchor: 'end' }, ...(wait == null ? [] : [{ x: X(wait) - 0.5 * f, anchor: 'end' }]), { x: L + 0.5 * f, anchor: 'start' }, { x: X(1.5), anchor: 'start' }];
    const p = placeWord(ys.flatMap((y) => xs.map((q) => ({ ...q, y }))), cw(z.name, f), f, { ...obs, inside });
    out.push({ zone: z, p: p && !p.n ? p : null });
    if (p && !p.n) obs.boxes.push(p.box);
  }
  return out;
}

/** Where the words that name the drawing stand, clear of the lines, the dots, the cut-offs and each other: { before, start, rise, tails: [..], zoneNames, vTop } with
 *  each { x, y, anchor, n, box } (n: what it lands on, 0 when it is clear; start and rise, the optional ones, are null when they have no clear spot: the
 *  upright line and its name are then both left out, the lines parting on that day say it). With the
 *  lines' names in a key row (G.keyRow) the tails are left out. */
export function placeLabels(G, ser) {
  const { f, c, X, Y, L, R, T, B } = G, r = Math.max(3.5, 0.3 * f);
  const xd = X(-G.lead), yd = Y(ser.before), xw = X(ser.wait), lastCut = G.zones.at(-1)?.from ?? G.top;
  const vTop = Math.min(B - 2 * f, Y(lastCut) + 0.3 * f);   // (the upright line stands up to just under the last cut-off, so the words over it keep the room)
  const headPx = [[xd, yd], [X(0), yd], [X(0), Y(ser.head[0][1])], ...ser.head.slice(1).map(([d, v]) => [X(d), Y(v)])];
  const tailPx = ser.tails.map((q) => q.pts.map(([d, v]) => [X(d), Y(v)]));
  const segs = [];
  for (const pts of [headPx, ...tailPx]) for (let i = 1; i < pts.length; i++) segs.push(Object.assign([...pts[i - 1], ...pts[i]], { w: 2 }));
  const vline = Object.assign([xw, vTop, xw, B], { w: 5 });
  if (c.words.start) segs.push(vline);   // (taken out again if the name finds no clear spot)
  const boxes = [[xd, yd], ...tailPx.map((p) => p.at(-1))].map(([x, y]) => [x - r - 2, y - r - 2, x + r + 2, y + r + 2]);
  const lines = [...G.ticks.filter((q) => q.v > 0).map((q) => ({ y: Y(q.v), x0: L, x1: R, w: 2 })), { y: B, x0: L, x1: R, w: 3 }];
  const obs = { segs, boxes, lines, inside: [L + 2, T + 1, R - 2, B - 1] };
  const put = (text, cands, opt = false) => {
    const p = placeWord(cands, cw(text, f), f, obs);
    if (!p || (opt && p.n)) return null;
    obs.boxes.push(p.box);
    return p;
  };
  const tails = G.keyRow ? [] : ser.tails.map((q, j) => {
    const [ex, ey] = tailPx[j].at(-1), x = ex - 0.9 * f;
    return put(q.name, [...[-1.0, -1.5, -2.0, 1.7, 2.2].map((k) => ({ x, y: ey + k * f, anchor: 'end' })), ...[-1.0, 1.7, -1.5].map((k) => ({ x: ex - 4 * f, y: ey + k * f, anchor: 'end' }))]);
  });
  const before = c.words.before ? put(c.words.before, [-1.0, -1.3, -1.6, -0.8].map((k) => ({ x: xd + 0.5 * f, y: yd + k * f, anchor: 'start' }))) : null;
  const start = c.words.start ? put(c.words.start, [1.35, 1.7, 2.1, 2.6].map((k) => ({ x: xw + 0.5 * f, y: Y(lastCut) + k * f, anchor: 'start' })), true) : null;
  const zoneNames = placeZoneNames(G, obs, ser.wait);
  const rise = c.words.rise ? put(c.words.rise, [4.55, 4.3, 4.8, 4.1].flatMap((v) => [1.2, 2.4].map((d) => ({ x: X(d), y: Y(v), anchor: 'start' }))), true) : null;
  return { before, start, rise, tails, zoneNames, vTop };
}

/** The geometry and the words' places for a card w × h px in type f px: the lines named at their ends, or, where a name has no clear spot there, in a key
 *  row under the caption (the plot a row shorter). { G, labels, zoneNames }; labels is null until the series is there. */
export function compose(w, h, f, c, ser) {
  let G = layout(w, h, f, c, ser), labels = ser ? placeLabels(G, ser) : null;
  if (labels?.tails.some((p) => p.n)) { G = layout(w, h, f, c, ser, true); labels = placeLabels(G, ser); }
  // (Until the series is there the zones' names stand alone, with only the gridlines to keep clear of.)
  const zoneNames = labels ? labels.zoneNames : placeZoneNames(G, { segs: [], boxes: [], lines: G.ticks.filter((q) => q.v > 0).map((q) => ({ y: G.Y(q.v), x0: G.L, x1: G.R, w: 2 })) });
  return { G, labels, zoneNames };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat(2).filter((k) => k != null));
  return el;
};

// Each deck's courses, kept once worked out (by deck, then slide and tool).
const kept = new WeakMap();
const keepOf = (deck) => { if (!deck) return new Map(); let m = kept.get(deck); if (!m) kept.set(deck, (m = new Map())); return m; };
const courseKey = (tool, c) => JSON.stringify([c?.slide?.id ?? c?.index, tool]);
/** The course for a slide, worked out once per deck on the presenter's worker (a promise of the series), or null while the slide's state is not ready. */
function courseWork(t, c, myKey = courseKey(t, c)) {
  const store = keepOf(c.deck);
  let p = store.get(myKey);
  if (p) return p;
  if (!c.snap) return null;
  p = c.run(headSteps(t), null).then((head) => {
    const snap = head?.at(-1)?.snap;
    return snap ? c.run(tailSteps(t), snap).then((tail) => courseSeries(t, head, tail)) : null;
  });
  store.set(myKey, p);
  p.then((s) => { if (!s) store.delete(myKey); }, () => store.delete(myKey));
  return p;
}
/** Starts a slide's course once the deck's states are in, so it is ready when its slide comes up (presenter.js, after the deck's states). */
export function warmCourse(t, c) { if (t && c) courseWork(t, c)?.catch(() => null); }

export function createCourse() {
  const el = document.createElement('div');
  el.className = 'pz-curve pz-course';   // (the curve's card: its height, type and number styles)
  let t = null, c = null, ctx = null, ser = null, parts = null, G = null, labels = null, zoneNames = [], key = '', lastSz = '';

  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? CO_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  const fmt = (v) => `${v < 0.05 ? '0' : v.toFixed(1)} ${ser.unit === 'L' ? 'liters' : ser.unit}`;
  function build() {
    const { f, L, R, B, X, Y } = G, r = Math.max(3.5, 0.3 * f);
    const panel = plotPanel(sv, 0, G.py, G.w, B + G.foot - G.py);
    // (The zones from the top of the scale to the baseline, the panel's corners on them, each named where the lines leave room; the numbers on the cut-offs in the strip at the left.)
    const zones = sv('g', { 'clip-path': panel.url }, G.zones.map((z) => sv('rect', { class: 'pco-z', 'data-rate': z.rate, 'data-deep': z.deep ? '1' : null, x: 0, width: G.w, y: Y(z.to).toFixed(1), height: (Y(z.from) - Y(z.to)).toFixed(1) })));
    const names = sv('g', { class: 'ptk-grid' }, zoneNames.filter((q) => q.p).map(({ zone: z, p }) => sv('text', { class: 'pcv-tc', 'data-tc': z.rate, x: p.x.toFixed(1), y: p.y.toFixed(1), 'text-anchor': p.anchor }, z.name)));
    const grid = G.ticks.map((q) => sv('g', { class: 'ptk-grid' },
      q.v ? sv('line', { x1: L, x2: R, y1: Y(q.v).toFixed(1), y2: Y(q.v).toFixed(1) }) : null,
      q.v ? sv('line', { class: 'pcv-stub', 'data-tc': q.rate, x1: L, x2: L + 0.9 * f, y1: Y(q.v).toFixed(1), y2: Y(q.v).toFixed(1) }) : null,
      sv('text', { class: q.v ? 'pcv-tc' : null, 'data-tc': q.rate, x: G.tickX, y: (Y(q.v) + 0.35 * f).toFixed(1), 'text-anchor': 'end' }, q.text)));
    const axis = [sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      G.xt.map((q) => sv('text', { class: 'pft-tk', x: X(q.d).toFixed(1), y: (B + 1.25 * f).toFixed(1), 'text-anchor': 'middle' }, q.text)),
      sv('text', { class: 'pcv-ax', x: ((L + R) / 2).toFixed(1), y: (B + 2.6 * f).toFixed(1), 'text-anchor': 'middle' }, c.words.axis)];
    const caption = sv('g', { class: 'pft-key', transform: `translate(0 ${0.75 * f})` },
      sv('text', { x: 0, y: 0.36 * f, style: 'fill: var(--text-2)' }, sv('tspan', {}, c.words.label.split(',')[0]), c.words.label.includes(',') ? sv('tspan', { class: 'pft-u' }, `,${c.words.label.split(',').slice(1).join(',')}`) : null));
    // (The key row, when the lines' names would not stand clear at their ends: a swatch and the name, each in its line's colour.)
    const keys = G.keyRow ? sv('g', { class: 'pft-key', transform: `translate(0 ${2.25 * f})` }, G.keys.map((k) => sv('g', { transform: `translate(${k.x.toFixed(1)} 0)` },
      sv('line', { x1: 0, x2: 16, y1: 0, y2: 0, style: `stroke: var(${k.c})` }), sv('text', { x: 22, y: 0.36 * f, style: `fill: var(${k.c})` }, k.name)))) : null;
    const word = (cls, text, p, style) => (p ? sv('text', { class: cls, x: p.x.toFixed(1), y: p.y.toFixed(1), 'text-anchor': p.anchor, style }, text) : null);
    let data = null, label = `${c.words.label}: being worked out`;
    if (ser) {
      const xd = X(-G.lead), yd = Y(ser.before), headPx = ser.head.map(([d, v]) => [X(d), Y(v)]);
      const dot = (x, y, col) => sv('circle', { class: 'pcv-dot', cx: x.toFixed(1), cy: y.toFixed(1), r, style: `fill: var(${col})` });
      const line = (d, col) => sv('path', { class: 'ptk-line pcv-line', d, style: `stroke: var(${col})` });
      const tailPx = ser.tails.map((q) => q.pts.map(([d, v]) => [X(d), Y(v)]));
      data = [labels.start ? sv('line', { class: 'pcv-at', x1: X(ser.wait).toFixed(1), x2: X(ser.wait).toFixed(1), y1: labels.vTop.toFixed(1), y2: B }) : null,
        word('pcv-dname', c.words.start, labels.start), word('pcv-dname', c.words.before, labels.before), word('pcv-dname', c.words.rise, labels.rise),
        line(`M${xd.toFixed(1)} ${yd.toFixed(1)}L${headPx[0][0].toFixed(1)} ${yd.toFixed(1)}L${headPx[0][0].toFixed(1)} ${headPx[0][1].toFixed(1)}${smoothPath(headPx, true).replace(/^L[^C]*/, '')}`, HEAD_C),
        ...ser.tails.map((q, j) => line(smoothPath(tailPx[j]), q.c)),
        dot(xd, yd, HEAD_C), ...ser.tails.map((q, j) => dot(...tailPx[j].at(-1), q.c)),
        ...ser.tails.map((q, j) => word('pcv-name', q.name, labels.tails[j], `fill: var(${q.c})`))];
      label = `${c.words.label}: ${c.words.before ? `${c.words.before.toLowerCase()}, ` : ''}${fmt(ser.before)}; after the ${c.words.event.toLowerCase()} ${fmt(ser.head[0][1])}, `
        + `${fmt(ser.head.at(-1)[1])} at ${ser.wait} days; ${ser.tails.map((q) => `${q.name} ${fmt(q.pts.at(-1)[1])} at ${ser.days} days`).join('; ')}`;
    }
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', 'aria-label': label, style: `font-size: ${f.toFixed(2)}px` },
      sv('defs', {}, panel.clip), panel.back, zones, grid, names, axis, caption, keys, data);
    svg.dataset.points = ser ? String(ser.head.length + ser.tails.reduce((n, q) => n + q.pts.length - 1, 1)) : '0';   // (the browser checks read it: 0 until the course is ready)
    return { svg };
  }
  function redraw(fade) {
    if (!t) return;
    const [w, hh, f] = size(); lastSz = [w, hh, f].map(Math.round).join('x');
    const old = parts?.svg;
    ({ G, labels, zoneNames } = compose(w, hh, f, c, ser));
    parts = build();
    if (fade && old) {
      parts.svg.classList.add('in'); el.append(parts.svg);
      nextFrame(() => nextFrame(() => parts?.svg.classList.remove('in')));
      setTimeout(() => old.remove(), 480);
    } else el.replaceChildren(parts.svg);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (!t || !parts || !el.isConnected) return;
    const sz = size().map(Math.round).join('x'); if (sz === lastSz) return;
    redraw(false);
  }).observe(el);

  async function fetchCourse(myKey, cx) {
    const p = courseWork(t, cx, myKey);
    if (!p) return;   // (the slide's state is not ready: shown again, it asks again)
    const r = await p.catch(() => null);
    // (Still this slide's instrument: configured with this context and no other since. Not cx.shown(), which turns true only
    // once the slide has finished coming in, after a course worked out quickly has already arrived.)
    if (!r || key !== myKey || ctx !== cx) return;
    ser = r; redraw(true);
  }
  return {
    el,
    configure(tool, cx) {
      const k2 = courseKey(tool, cx);
      t = tool; ctx = cx || null; c = courseOf(tool);
      if (k2 !== key) {
        key = k2; ser = null;
        redraw(!!parts);
        if (ctx) fetchCourse(key, ctx);
      } else if (!ser && ctx) fetchCourse(key, ctx);
    },
    pin() {}, update() {}, clear() {},
    dispose() { t = null; ctx = null; parts = null; el.replaceChildren(); },
  };
}
