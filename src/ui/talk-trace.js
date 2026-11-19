// The talk so far, for a slide's tool { kind: 'trace' } (presenter-tools.js): the portal, wedged and free hepatic pressures at
// every state up to the slide, one point each. (Moved here unchanged from presenter-tools.js, so the deck visuals' chart package
// can extend it without touching the instruments' file.)
//
// The full chart is Mohammad's "Two gaps" pick (6 Nov 2026, mocks: /mnt/project-files/course-chart-mocks/): one panel, PV and WHVP
// with the band between them shaded (the resistance before the sinusoids, a clot on the PVT deck: tool.gap names it) and the band
// between WHVP and FHVP shaded too (the HVPG), so "HVPG stayed flat" is a band that keeps its width. The stage names stand level over
// the plot, the treatments are thin neutral bars under them (never a tint over the lines), the states of one visit share a bracket on
// the time row and a break marks the time between visits, and two rows of readings under the plot (PV − WHVP, HVPG) replace the old
// HVPG lane. WHVP is violet (--s7), not --tr-wedge, the HVPG's own colour on this chart and the curves; its FHVP stays a dashed neutral reference because the chart stands still (the dashes are on a line that does not scroll). On the strips that scroll the three are solid: portal pink, wedged amber, free blue.

import { h, fmt, clamp } from './util.js';
import { hvpgRate } from '../engine/pressure-cuts.js';
import { plotPanel } from './plot-look.js';
import { bandKeys, bandRuns } from './rx-bands.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { measure } from './glyph-measure.js';
import { chartCtx } from './chart-ctx.js';

// (2 Nov 2026: the chart is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = svgModel;
/** The wedged pressure's colour on the charts that draw it against the portal pressure (here and tool-curve.js). */
export const WEDGE_C = '--s7';
export const LINES = [['pv', 'PV', '--tr-pv'], ['whvp', 'WHVP', WEDGE_C], ['fhvp', 'FHVP', '--text-3']];
const tokName = (v) => v.replace(/^--/, '');   // (a colour token's CSS name → its name in theme-tokens.js: what a piece's data-p-* holds)
const sev = hvpgRate;
// (a word's width as Inter sets it, from the GPU atlas's own metrics: no canvas)
const textW = (t, f, wt = 600) => measure(t, `${wt} ${f}px Inter`);
const f1 = (v) => fmt(v, 1);

/** Where the milestones' names go, level over their lines: each centred on its x (moved in to stay inside [0, W]), on the
 *  first row from the plot up where it keeps gap px from the name before it; as many rows as that takes, never cut short.
 *  xs: each milestone's x, widths: its name's width. → { at: [{ x, row, anchor, ax }] (x: the name's middle; ax, anchor: where to draw it, the plot's right limit or the left margin for a name near an edge), rows } */
export function milePlaces(xs, widths, W, gap = 10) {
  const ends = [], at = xs.map((x, i) => {
    const w = widths[i], mid = Math.min(Math.max(x, w / 2 + 4), W - w / 2 - 4);
    // (A name whose centre is near an edge is aligned to it, not centred over a line it would overhang: ending at W on the right, starting at 4 on the left.)
    const anchor = x + w / 2 > W ? 'end' : x - w / 2 < 4 ? 'start' : 'middle', ax = anchor === 'end' ? W : anchor === 'start' ? 4 : x;
    let row = ends.findIndex((e) => mid - w / 2 >= e + gap);
    if (row < 0) row = ends.length;
    ends[row] = mid + w / 2;
    return { x: mid, row, anchor, ax };
  });
  return { at, rows: ends.length };
}

/** A stage's name set in its column: never cut short and never run past it, so a long name takes as many lines as its words need ("The bleeding has stopped" was
 *  "The bleeding has stoppe…", Next bleed 2, play-test 16 Nov 2026). A word wider than the column stands alone on its line. */
export function wrapName(text, colW, width) {
  const lines = [];
  for (const w of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const t = lines.length ? `${lines.at(-1)} ${w}` : w;
    if (!lines.length) lines.push(w); else if (width(t) <= colW) lines[lines.length - 1] = t; else lines.push(w);
  }
  return lines;
}

/** The visits: each state's visit number, a state on the same day as the one before it (its time point, p.day, the deck's days so
 *  far; p.when for a chain without it) joining that one's. */
export function visitsOf(pts) {
  const dayOf = (p) => p?.day ?? p?.when;
  const g = [];
  pts.forEach((p, i) => g.push(i && dayOf(p) != null && dayOf(p) === dayOf(pts[i - 1]) ? g[i - 1] : (i ? g[i - 1] + 1 : 0)));
  return g;
}
/** A state's x in units: one between the states of a visit, `apart` between visits (so the time between them reads as time). */
export function visitUnits(g, apart = 1.55) { let a = 0; return g.map((v, i) => (i ? (a += v === g[i - 1] ? 1 : apart) : 0)); }
/** The days a time point names ("Day 30", "Month 4", "Year 2"), or null. */
export function daysOf(s) {
  const m = /^(Day|Month|Year)\s+(\d+(?:\.\d+)?)$/.exec(String(s || '').trim());
  return m ? +m[2] * (m[1] === 'Day' ? 1 : m[1] === 'Month' ? 30.4 : 365) : null;
}
/** The time between two visits in words: "180 d", "9 mo", "2 y". */
export const spanWords = (d) => (d % 365 === 0 ? `${d / 365} y` : d <= 200 ? `${Math.round(d)} d` : `${Math.round(d / 30.4)} mo`);

/** The treatment bars: each run of a treatment (rx-bands.js bandRuns) a thin bar from the state it started at to its last, named at
 *  its start, an arrow at its end where it is still on at the last state. A run whose first state comes after time has passed (a
 *  time-lapse on the treatment) started at the visit before. Packed on as few rows as keep the names and bars clear of each other.
 *  → [{ run, a, b, more, row, nameX, anchor }] and rows. */
export function rxBars(runs, X, g, last, W, nameW, gap = 10) {
  const ends = [];
  const bars = runs.map((r) => {
    const s = r.i0 > 0 && g[r.i0] !== g[r.i0 - 1] ? r.i0 - 1 : r.i0, a = X(s), b = X(r.i1), more = r.i1 === last;
    const w = nameW(r.name), anchor = a + w > W - 2 ? 'end' : 'start', nameX = anchor === 'end' ? W - 2 : a;
    const x0 = Math.min(a, anchor === 'end' ? W - 2 - w : a), x1 = Math.max(b + (more ? 8 : 0), anchor === 'end' ? W - 2 : a + w);
    let row = ends.findIndex((e) => x0 >= e + gap);
    if (row < 0) row = ends.length;
    ends[row] = x1;
    return { run: r, a, b, more, row, nameX, anchor };
  });
  return { bars, rows: ends.length };
}
/** The names to keep on one row, right to left, the last always: each clear of the one after it by gap px and inside [0, W].
 *  xs: centres, ws: widths. → a Set of the kept indexes. */
export function keepClear(xs, ws, W, gap = 8) {
  const kept = new Set();
  for (let i = xs.length - 1, edge = Infinity; i >= 0; i--) {
    const half = ws[i] / 2;
    if (i === xs.length - 1 || (xs[i] + half + gap <= edge && xs[i] - half >= 0 && xs[i] + half <= W)) { kept.add(i); edge = xs[i] - half; }
  }
  return kept;
}
/** A step's ring on the steps header (its number inside, in the host's size: 12 px at least): its radius, 10 px at 12. */
export const stepR = (fs) => Math.round(0.8 * fs);
/** The least height of the plot (three lines' names stacked at a line and a quarter each, with room above and below). */
export const plotMinOf = (fs) => 4.2 * fs;

/**
 * The full chart's layout, from the states and the box: where every piece stands. Pure (the unit test of tests/talk-fit.test.js builds it for every deck's
 * chain at every card size). W, HT: the box; fs: the host's type size (every word of the chart is that size, 12 px at least: Mohammad, 17 Nov 2026);
 * runs: the treatments' runs (rx-bands.js bandRuns); tw(text, px, weight): a word's width.
 *
 * The card's height is its CSS's, never the chart's (the card fit sets it), so the chart budgets what it is given instead of asking for more. Its parts, in the
 * order they give way:
 *  1. The stage names stand level over the plot while they fit in the room the plot can spare ('names'). A phone's column is too narrow for four sentences
 *     (Next bleed 6, iPhone, 18 Nov 2026: five lines of caption, the plot 50 px, the legend and the time row cut off), so then
 *  2. the steps ('steps'): each state a numbered ring on its line at the top of the plot, and the caption of the latest only, in two lines or so across the card.
 *  3. The two readings rows under the plot go one at a time (the gap row, then the HVPG row) when the plot would be under plotMinOf.
 * The legend (the lines' names at the right end) is held between the plot's top and its foot, whatever the values.
 * → { mode, rows: the readings rows shown, plot: its height, bottom: the lowest word's foot, and every number draw() places }.
 */
export function layoutTalk({ pts, W, HT, fs, runs = [], gapName = 'PV − WHVP', tw = textW }) {
  const n = pts.length, last = n - 1, narrow = W < 420, lineH = fs + 3;
  const g = visitsOf(pts), u = visitUnits(g), uMax = Math.max(u[last] ?? 0, 1e-9);
  // The scale: 0 to the next 5 over the highest reading (20 at least), the numbers 8 px inside the panel's left edge.
  const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
  const pMax = Math.ceil(top / 5) * 5, unitW = Math.ceil(tw('mmHg', fs, 500)) + 2, L = Math.max(Math.ceil(tw(String(pMax), fs, 500)) + 16, unitW + 8);   // (the unit stands over its numbers inside the card's left edge: "mHg" was cut)
  // The right column: each line's name (and, with room, its last value), and the readings rows' names, each after a swatch.
  const vals = n ? LINES.map(([k, a]) => [a, f1(pts[last].fp[k])]) : [];
  const endW = Math.max(0, ...vals.map(([a, v]) => tw(a, fs, 700) + (narrow ? 0 : 4 + tw(v, fs, 500))));
  const rowName = narrow ? gapName.replace(/ − /g, '−') : gapName, rowW = Math.max(tw(rowName, fs, 500), tw('HVPG', fs, 500));
  const R = Math.floor(W - 8 - 12 - Math.max(endW, rowW) - 12);
  const pad = Math.max(10, 0.9 * fs), X = (i) => (n < 2 ? (L + R) / 2 : L + pad + (R - L - 2 * pad) * u[i] / uMax);
  // The treatments, as bars under the names.
  const { bars, rows: rxRows } = rxBars(runs, X, g, last, W, (t) => tw(t, fs, 500));
  const room = rxRows * (fs + 10);
  // (From the plot's top to the box's foot: the time row, then the readings rows k of them: the baseline of the last is 12 px up from the foot.)
  const footer = (k) => fs + 22 + (k >= 1 ? fs + 10 : 0) + (k >= 2 ? fs + 7 : 0);
  const unitRoom = fs + 14, plotMin = plotMinOf(fs);

  // 1. The stage names, level over the plot: wrapped to two lines where a column is narrow, on as many rows as keep them clear.
  const colW = n < 2 ? R - L : Math.max(tw('Carvedilol', fs), Math.min(...pts.slice(1).map((p, i) => X(i + 1) - X(i))) - 8);
  const blocks = pts.map((p) => {
    let lines = wrapName(p.tick, colW, (t) => tw(t, fs));
    if (lines.length > 3) lines = wrapName(p.tick, 1.8 * colW, (t) => tw(t, fs));   // (a long name takes a wider column rather than a tall one)
    return { lines, w: Math.max(0, ...lines.map((t) => tw(t, fs))) };
  });
  // (Names stand on one row, each clear of the next. One that would crowd another is left to its point's hover title, and the latest always shows, on a second row if it must.)
  const mp = milePlaces(pts.map((p, i) => X(i)), blocks.map((b) => b.w), W - 2, 8);
  mp.at.forEach((a, i) => { a.show = a.row === 0 || i === last; if (i === last && a.row > 0) a.row = 1; });
  const rowsUsed = mp.at.some((a) => a.show && a.row > 0) ? 2 : 1;
  const rowLines = Array.from({ length: rowsUsed }, (_, r) => Math.max(1, ...blocks.filter((b, i) => mp.at[i].show && mp.at[i].row === r).map((b) => b.lines.length)));
  const rowTop = (r) => rowLines.slice(0, r).reduce((a, k) => a + k * lineH + 4, 0);
  const namesH = rowTop(rowsUsed);

  // 2. The steps: the latest state's name across the card after its ring, the ring of each state on the plot's top.
  const sr = stepR(fs), capX = 2 * sr + 8, cap = n && pts[last].tick ? wrapName(pts[last].tick, W - capX - 4, (t) => tw(t, fs)) : [];
  const stepsH = cap.length ? cap.length * lineH + 6 : 0;

  const plotFor = (head, k) => { const pTop = head + 4 + room + 4, T = pTop + unitRoom; return { pTop, T, B: HT - footer(k), k }; };
  // (The names stay only while every one is shown, none over three lines, and the plot keeps its room: else the steps. A name left to a hover title says nothing on a phone.)
  const namesWhole = mp.at.every((a) => a.show) && blocks.every((b) => b.lines.length <= 3);
  let mode = 'names', rows = 2, P = plotFor(namesH, 2);
  if (!namesWhole || P.B - P.T < plotMin) {
    mode = 'steps';
    for (const k of [2, 1, 0]) { rows = k; P = plotFor(stepsH, k); if (P.B - P.T >= plotMin) break; }
  }
  const { pTop, T } = P; let { B } = P;
  if (B - T < 2.4 * fs) B = T + 2.4 * fs;   // (a box too short for even the plot: it keeps a plot, and the words under it run past the foot, which the unit test names)
  const ty = B + fs + 10, r1 = ty + fs + 10, r2 = r1 + fs + 7;
  const rowDefs = rows === 2 ? [['gap', r1], ['hv', r2]] : rows === 1 ? [['hv', r1]] : [];
  const Y = (v) => B - (B - T) * clamp(v, 0, pMax) / pMax;
  const gStep = (B - T) / (pMax / 5) >= 1.5 * fs ? 5 : 10;
  // The lines' names at the right end, top to bottom, never touching, held inside the plot whatever the values.
  const ends = n ? LINES.map(([k, a, c]) => ({ a, c, v: f1(pts[last].fp[k]), y: Y(pts[last].fp[k] || 0) })).sort((p, q) => p.y - q.y) : [];
  ends.forEach((e, k) => { if (k) e.y = Math.max(e.y, ends[k - 1].y + 1.25 * fs); });
  if (ends.length) {
    const over = ends[ends.length - 1].y - (B - 0.2 * fs);
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    const under = T + 0.2 * fs - ends[0].y;
    if (under > 0) ends.forEach((e) => { e.y += under; });
  }
  // Each step's ring on its line (one that would crowd its neighbour is left out, the latest always shown).
  const ringW = (i) => 2 * sr + 2 + (i >= 9 ? 4 : 0);
  const stepKept = mode === 'steps' ? keepClear(pts.map((p, i) => X(i)), pts.map((p, i) => ringW(i)), W, 2) : new Set();
  const bottom = (rowDefs.length ? rowDefs.at(-1)[1] : ty) + 0.25 * fs;
  return {
    mode, rows, rowDefs, n, last, narrow, lineH, g, u, X, Y, L, R, pMax, unitW, gStep, pTop, T, B, ty, r1, r2, rowName, room, bars, rxRows,
    blocks, mp, rowsUsed, rowTop, namesH, cap, capX, stepsH, stepKept, ends, sx: R + 12, tx: R + 24, plot: B - T, bottom,
    headH: mode === 'names' ? namesH : stepsH, stripY: (mode === 'names' ? namesH : stepsH) + 4, stepY: pTop + 4 + sr, sr,
  };
}

export function talkTrace() {
  // Drawn at the card's own pixels (one unit a CSS pixel) and its one small size, so the words never scale with the card:
  // the card's fit sets the chart's height (styles/app.css .pz-talk) and only the plot gets shorter.
  const el = h('div', { class: 'pz-talk' });
  const gl = createSvgGL(el, { host: 'talk' });
  let chain0 = null, size = '', bands = [], miles = false, gapName = 'PV − WHVP';   // (bands: the treatments the slide shows, rx-bands.js; none on a built-in deck)
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (chain0 && `${el.clientWidth}x${el.clientHeight}` !== size) draw(chain0, false); }) : null;
  ro?.observe(el);
  function set(chain) { chain0 = chain; draw(chain, true); }
  // (style: 'milestones' draws the milestones style, drawMiles; any other, the full chart. gap: the name of the band between PV and WHVP.)
  function configure(t) {
    bands = bandKeys(t); miles = t?.style === 'milestones'; el.classList.toggle('miles', miles);
    gapName = typeof t?.gap === 'string' && t.gap.trim() ? t.gap.trim() : 'PV − WHVP';
  }
  // (The host's type size, from the chart's looks table: the card's own sizes handed over, never read off the page. The letter scale svk is the tools' to give.)
  function hostFs() { try { const cx = chartCtx(el); delete cx.svk; gl.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ } return gl.hostSize(); }
  // (The chart grows by the treatment rows: styles/app.css .pz-talk.has-bands adds --band-room to its height.)
  function bandRoom(px) {
    el.classList.toggle('has-bands', px > 0);
    if (px > 0) el.style.setProperty('--band-room', `${Math.round(px)}px`); else el.style.removeProperty('--band-room');
  }
  // The steps header (a card whose names do not fit over the plot): each state a numbered ring on its line at the top of the plot, and the
  // latest one's name across the card after its ring, in as many lines as its words need (never cut short).
  function stepEls(Lo, fs) {
    const ring = (cx, cy, i) => [
      sv('circle', { class: 'ptk-step' + (i === Lo.last ? ' now' : ''), 'data-look': 'talk.step.ring', cx, cy, r: Lo.sr }),
      sv('text', { class: 'ptk-step-n' + (i === Lo.last ? ' now' : ''), 'data-look': 'talk.step.n', x: cx, y: cy + 0.35 * fs, 'text-anchor': 'middle' }, String(i + 1))];
    const y0 = fs + 3;
    return sv('g', { class: 'ptk-steps' },
      Lo.n ? Lo.cap.map((t, k) => sv('text', { 'data-look': 'talk.stage', class: 'ptk-stage now', x: Lo.capX, y: y0 + k * Lo.lineH, 'text-anchor': 'start' }, t)) : null,
      Lo.n ? ring(Lo.sr + 2, y0 - 0.35 * fs, Lo.last) : null,
      Lo.n ? Array.from({ length: Lo.n }, (_, i) => Lo.stepKept.has(i) ? sv('g', { class: 'ptk-stepmark' }, ring(Lo.X(i), Lo.stepY, i)) : null) : null);
  }
  // The treatment bars over the plot, from y: a name over each bar, the bar thin and neutral, a dot where it starts.
  function barEls(bars, y, fs) {
    const rowH = fs + 10;
    return bars.map((q) => {
      const by = y + q.row * rowH + fs + 4;
      return sv('g', { class: 'ptk-rx', 'data-rx': q.run.key },
        sv('text', { class: 'ptk-rx-n', 'data-look': 'talk.rx.name', x: q.nameX, y: by - 5, 'text-anchor': q.anchor }, q.run.name),
        sv('rect', { 'data-look': 'talk.rx.bar', x: q.a, y: by - 1.5, width: Math.max(0, q.b - q.a), height: 3.5, rx: 1.75 }),
        q.more ? sv('path', { 'data-look': 'talk.rx.bar', d: `M${(q.b + 1).toFixed(1)} ${(by - 4).toFixed(1)}l6 4.25l-6 4.25z` }) : null,
        sv('circle', { 'data-look': 'talk.rx.dot', cx: q.a, cy: by + 0.25, r: 3.5 }));
    });
  }
  function draw(chain, fade) {
    if (miles) { show(drawMiles(chain), fade); return; }
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = hostFs();
    size = `${W}x${el.clientHeight}`;
    const pts = chain.filter((c) => c.fp);
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [];
    const Lo = layoutTalk({ pts, W, HT, fs, runs, gapName });
    const { n, last, narrow, g, X, Y, L, R, pMax, unitW, gStep, pTop, T, B, ty, rowName, room, bars, blocks, mp, rowsUsed, rowTop, lineH, ends, sx, tx, mode } = Lo;
    bandRoom(room);
    const stripY = Lo.stripY;
    const ys = (k) => pts.map((p, i) => [X(i), Y(p.fp[k] || 0)]);
    const pv = ys('pv'), wh = ys('whvp'), fh = ys('fhvp');
    const path = (a) => a.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const band = (upper, lower) => (n < 2 ? '' : `${path(upper)}${path([...lower].reverse()).replace(/^M/, 'L')}Z`);
    // Each band named once, inside it, where it is tallest between two states and the name fits.
    const bandName = (upper, lower, text) => {
      let best = null;
      for (let i = 0; i < n - 1; i++) {
        const h0 = Math.min(lower[i][1] - upper[i][1], lower[i + 1][1] - upper[i + 1][1]), wd = upper[i + 1][0] - upper[i][0];
        if (h0 >= 1.3 * fs && wd >= textW(text, fs) + 10 && (!best || h0 > best.h0)) best = { h0, x: (upper[i][0] + upper[i + 1][0]) / 2, y: (upper[i][1] + upper[i + 1][1] + lower[i][1] + lower[i + 1][1]) / 4 };
      }
      return best;
    };
    const gapAt = bandName(pv, wh, gapName), hvAt = bandName(wh, fh, 'HVPG');
    // The time row: a visit of several states shares a bracket and its day; a break on the axis between visits, the time between them over it where it fits.
    const visits = [];
    pts.forEach((p, i) => { if (!i || g[i] !== g[i - 1]) visits.push({ i0: i, i1: i, when: p.when || String(p.n), day: p.day ?? p.when }); else visits.at(-1).i1 = i; });
    const vX = (v) => (X(v.i0) + X(v.i1)) / 2, vText = (v) => (v.i1 > v.i0 && !narrow && textW(`${v.when} · one visit`, fs, 500) + 12 <= X(v.i1) - X(v.i0) + 12 ? `${v.when} · one visit` : v.when);
    const vKept = keepClear(visits.map(vX), visits.map((v) => textW(vText(v), fs, 600)), W);
    const timeEls = visits.map((v, k) => {
      const now = v.i1 === last, xs = [X(v.i0) - 6, X(v.i1) + 6];
      return sv('g', { class: 'ptk-when' + (now ? ' now' : '') },
        v.i1 > v.i0 ? sv('path', { 'data-look': 'talk.axis.mark', d: `M${xs[0].toFixed(1)} ${(B + 5).toFixed(1)}v4H${xs[1].toFixed(1)}v-4` }) : null,
        vKept.has(k) ? sv('text', { 'data-look': 'talk.when', x: vX(v), y: ty, 'text-anchor': 'middle' }, vText(v)) : null);
    });
    const breaks = visits.slice(1).map((v, k) => {
      const a = X(visits[k].i1), b = X(v.i0), mx = (a + b) / 2, d0 = daysOf(visits[k].day), d1 = daysOf(v.day), span = d0 != null && d1 != null && d1 > d0 ? spanWords(d1 - d0) : '';
      if (b - a < 16) return null;
      return sv('g', { class: 'ptk-break' },
        sv('path', { 'data-look': 'talk.axis.mark', d: `M${(mx - 5).toFixed(1)} ${(B + 4).toFixed(1)}l4 -8M${(mx + 1).toFixed(1)} ${(B + 4).toFixed(1)}l4 -8` }),
        span && b - a >= textW(span, fs, 500) + 16 ? sv('text', { 'data-look': 'talk.span', x: mx, y: ty, 'text-anchor': 'middle' }, span) : null);
    });
    // The readings rows under the plot (those the box has room for), each value under its state (where it stands clear), named in the right column.
    const gapV = pts.map((p) => f1((p.fp.pv || 0) - (p.fp.whvp || 0))), hvV = pts.map((p) => f1(p.fp.hvpg || 0));
    const keepOf = (vs) => keepClear(pts.map((p, i) => X(i)), vs.map((t) => textW(t, fs, 600)), R + 6);
    const keep1 = keepOf(gapV), keep2 = keepOf(hvV), rowAt = (key) => Lo.rowDefs.find((d) => d[0] === key)?.[1];
    const gapY = rowAt('gap'), hvY = rowAt('hv');
    const panel = plotPanel(sv, 0, pTop, W, HT - 1.5 - pTop);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${fmt(p.fp.pv, 0)}, WHVP ${fmt(p.fp.whvp, 0)}, ${gapName} ${f1((p.fp.pv || 0) - (p.fp.whvp || 0))}, HVPG ${fmt(p.fp.hvpg, 1)}`).join('; ')
      + runs.map((r) => `. ${r.name} from ${pts[r.i0].when || `slide ${pts[r.i0].n}`}`).join('') },
      sv('defs', {}, panel.clip), panel.back,
      Array.from({ length: pMax / gStep + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: Y(k * gStep), y2: Y(k * gStep) }), sv('text', { 'data-look': 'plot.grid.text', x: L - 8, y: Y(k * gStep) + 0.35 * fs, 'text-anchor': 'end' }, String(k * gStep)))),
      // The unit sits once at the top of the axis, above its numbers.
      sv('text', { class: 'ptk-unit', 'data-look': 'plot.unit', x: Math.max(L - 8, unitW), y: T - 8, 'text-anchor': 'end' }, 'mmHg'),
      // A faint upright line at each state, from the top of the plot to its axis.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, p.tick ? sv('title', {}, p.tick) : null, sv('line', { 'data-look': 'talk.mark.line', x1: X(i), x2: X(i), y1: T - 4, y2: B }))),
      // The two bands: the HVPG under, the gap before the sinusoids over it, each named once inside.
      n > 1 ? sv('path', { class: 'ptk-gap hv', 'data-look': 'talk.gap.hv', 'data-p-c': tokName(WEDGE_C), d: band(wh, fh) }) : null,
      n > 1 ? sv('path', { class: 'ptk-gap', 'data-look': 'talk.gap', 'data-p-c': 'tr-pv', d: band(pv, wh) }) : null,
      hvAt ? sv('text', { class: 'ptk-gap-n hv', 'data-look': 'talk.gap.name', 'data-hv': '1', x: hvAt.x, y: hvAt.y + 0.33 * fs, 'text-anchor': 'middle' }, 'HVPG') : null,
      gapAt ? sv('text', { class: 'ptk-gap-n', 'data-look': 'talk.gap.name', x: gapAt.x, y: gapAt.y + 0.33 * fs, 'text-anchor': 'middle' }, gapName) : null,
      // The lines: FHVP a neutral reference, then WHVP and PV with a point at each state (the PV a ring where the WHVP's dot would cover it).
      sv('path', { class: 'ptk-line free', 'data-look': 'talk.line.free', d: path(fh) }),
      sv('path', { class: 'ptk-line', 'data-look': 'talk.line', 'data-p-c': tokName(WEDGE_C), d: path(wh) }),
      sv('path', { class: 'ptk-line', 'data-look': 'talk.line', 'data-p-c': 'tr-pv', d: path(pv) }),
      [[wh, WEDGE_C], [pv, '--tr-pv']].map(([a, c], k) => a.map(([x, y], i) => {
        const r = i === last ? 4.5 : 3.5, near = k === 1 && Math.abs(pv[i][1] - wh[i][1]) < 2 * r + 1;
        return near ? sv('circle', { class: 'ptk-pt', 'data-look': 'talk.dot.ring', 'data-p-c': tokName(c), cx: x, cy: y, r: r + 2.5 }) : sv('circle', { class: 'ptk-pt', 'data-look': 'talk.dot', 'data-p-c': tokName(c), cx: x, cy: y, r });
      })),
      ends.map((e) => sv('g', { class: 'ptk-lbl' },
        sv('rect', { 'data-look': 'talk.swatch', 'data-p-c': tokName(e.c), x: sx, y: e.y - 1.5, width: 8, height: 3, rx: 1.5 }),
        sv('text', { 'data-look': 'talk.lbl.n', x: tx, y: e.y + 0.35 * fs }, e.a),
        narrow ? null : sv('text', { 'data-look': 'talk.lbl.v', x: tx + textW(e.a, fs, 700) + 4, y: e.y + 0.35 * fs }, e.v))),
      sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
      timeEls, breaks,
      // The readings rows (those the box has room for).
      Lo.rowDefs.length ? sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: W - 8, y1: Lo.r1 - fs - 3, y2: Lo.r1 - fs - 3 }) : null,
      pts.map((p, i) => sv('g', { class: 'ptk-read' + (i === last ? ' now' : '') },
        gapY != null && keep1.has(i) ? sv('text', { 'data-look': 'talk.read', x: X(i), y: gapY, 'text-anchor': 'middle' }, gapV[i]) : null,
        hvY != null && keep2.has(i) ? sv('text', { 'data-look': 'talk.read', 'data-rate': sev(p.fp.hvpg), 'data-hv': '1', x: X(i), y: hvY, 'text-anchor': 'middle' }, hvV[i]) : null)),
      gapY != null ? sv('rect', { 'data-look': 'talk.swatch.gap', 'data-p-c': 'tr-pv', x: sx, y: gapY - 0.7 * fs, width: 8, height: 8, rx: 2 }) : null,
      gapY != null ? sv('text', { 'data-look': 'talk.read.name', x: tx, y: gapY }, rowName) : null,
      hvY != null ? sv('rect', { 'data-look': 'talk.swatch.gap', 'data-p-c': tokName(WEDGE_C), x: sx, y: hvY - 0.7 * fs, width: 8, height: 8, rx: 2 }) : null,
      hvY != null ? sv('text', { 'data-look': 'talk.read.name', x: tx, y: hvY }, 'HVPG') : null,
      // The stage names, then the treatments.
      mode === 'names' ? pts.map((p, i) => {
        const at = mp.at[i];
        if (!at.show) return null;
        // (rows counted from the plot up, as milePlaces gives them: row 0 is the lowest)
        const r = rowsUsed - 1 - at.row, y0 = rowTop(r) + fs;
        return sv('g', { class: 'ptk-stage' + (i === last ? ' now' : '') },
          blocks[i].lines.map((t, k) => sv('text', { 'data-look': 'talk.stage', x: at.ax, y: y0 + k * lineH, 'text-anchor': at.anchor }, t)));
      }) : stepEls(Lo, fs),
      barEls(bars, stripY, fs));
    show(svg, fade);
  }
  // The milestones style (tool: { kind: 'trace', range: 'talk', style: 'milestones' }, Mohammad's pick, 19 Oct: "Milestones only"):
  // the HVPG alone, its line and points in their cut-off colours over the 5 and 10 mmHg cut-offs; a short level name over each
  // slide the deck marks as a milestone (slide.milestone: 'Dx', 'Carvedilol', 'TIPS'), on as many rows as they need, never cut
  // short or slanted; every other time point a plain dot; the treatments as thin bars between the names and the plot (as the full chart's,
  // Mohammad's "Two gaps" pick, 6 Nov 2026: no tint over the line).
  function drawMiles(chain) {
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = hostFs(), unitW = Math.ceil(textW('mmHg', fs, 500)) + 2, L = Math.max(Math.ceil(3.3 * fs) + 8, unitW + 8);
    size = `${W}x${HT}`;
    const pts = chain.filter((c) => c.fp), last = pts.length - 1, vfs = 1.5 * fs;
    const vw = Math.ceil(textW(fmt(pts[last]?.fp.hvpg ?? 0, 1), vfs, 700)), R = W - Math.max(Math.ceil(4 * 0.6 * vfs), vw + 4) - 14;   // (the end value's own width, so it stands inside the card with room to spare)
    // (Time between visits reads as distance, as on the full chart: the states of one visit stand close, a later visit further on.)
    const vis = visitsOf(pts), un = visitUnits(vis), uMax = un.at(-1) || 1, X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : un[i] / uMax);
    const mi = pts.map((p, i) => (p.mile ? i : -1)).filter((i) => i >= 0);
    const { at, rows } = milePlaces(mi.map(X), mi.map((i) => textW(pts[i].mile, fs)), R);
    // (The treatments: a bar each, packed on as few rows as keep them clear, between the names and the plot. The card does not grow for them.)
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [];
    const { bars, rows: bRows } = rxBars(runs, X, vis, last, W, (t) => textW(t, fs, 500));
    const rowH = fs + 8, nameY = (r) => 4 + fs + (rows - 1 - r) * rowH, T0 = 4 + rows * rowH + Math.ceil(0.6 * fs);
    const T = T0 + bRows * (fs + 10) + 0.6 * fs + 6, B = HT - fs - 16;
    const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y = (v) => B - (B - T) * clamp(v, 0, gMax) / gMax;
    const ticks = Array.from({ length: gMax / 5 + 1 }, (_, k) => k * 5).filter((v, k, a) => (B - T) / a.length >= 1.2 * fs || v % 10 === 0 || v === 5);
    // (The time under the line: at each milestone and the last point, where it keeps clear of its neighbour.)
    const whenW = (p) => textW(p.when || String(p.n), fs, 500), named = new Set();
    const list = [...new Set([...mi, last])].filter((i) => i >= 0).sort((a, b) => a - b);
    // (One name for a visit: two points of the same day never carry "Day 0" twice.)
    const visitNamed = new Set();
    for (let k = list.length - 1, edge = Infinity; k >= 0; k--) {
      const i = list[k], half = whenW(pts[i]) / 2;
      if (visitNamed.has(vis[i])) continue;
      if (X(i) + half + 8 <= edge && X(i) - half >= 0) { named.add(i); visitNamed.add(vis[i]); edge = X(i) - half; }
    }
    const panel = plotPanel(sv, 0, T0 - 6, W, HT - 1.5 - (T0 - 6));
    return sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'HVPG over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.mile ? `, ${p.mile}` : ''}, ${fmt(p.fp.hvpg, 1)}`).join('; ')
      + runs.map((r) => `. ${r.name} from ${pts[r.i0].when || `slide ${pts[r.i0].n}`}`).join('') },
      sv('defs', {}, panel.clip), panel.back,
      ticks.map((v) => sv('g', { class: 'ptk-grid' + (v === 5 || v === 10 ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: Y(v), y2: Y(v) }), sv('text', { 'data-look': 'plot.grid.text', x: L - 8, y: Y(v) + 0.35 * fs, 'text-anchor': 'end' }, String(v)))),
      sv('text', { class: 'ptk-unit', 'data-look': 'plot.unit', x: Math.max(L - 8, unitW), y: T - 0.6 * fs - 2, 'text-anchor': 'end' }, 'mmHg'), sv('text', { class: 'ptk-ax', 'data-look': 'plot.ax', x: L, y: T - 0.6 * fs - 2 }, 'HVPG'),
      // A line under each milestone's name down to the axis, and the times under the axis.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('title', {}, `${p.when || `Slide ${p.n}`}: ${p.title}`),
        p.mile ? sv('line', { 'data-look': 'talk.mark.line', x1: X(i), x2: X(i), y1: bRows ? T - 4 : T0 - 2, y2: B + 4 }) : null,
        named.has(i) ? sv('text', { 'data-look': 'talk.mark.text', x: X(i), y: B + fs + 6, 'text-anchor': 'middle' }, p.when || String(p.n)) : null)),
      mi.map((i, k) => sv('text', { class: 'ptk-ms' + (i === last ? ' now' : ''), 'data-look': 'talk.ms', x: at[k].ax, y: nameY(at[k].row), 'text-anchor': at[k].anchor }, pts[i].mile)),
      barEls(bars, T0 - 4, fs),
      // (Each stretch of the line in the colour of where it ends, the cut-offs' own.)
      pts.slice(1).map((p, k) => sv('path', { class: 'ptk-line hv', 'data-look': 'talk.line.hv', 'data-rate': sev(p.fp.hvpg), d: `M${X(k).toFixed(1)} ${Y(pts[k].fp.hvpg).toFixed(1)}L${X(k + 1).toFixed(1)} ${Y(p.fp.hvpg).toFixed(1)}` })),
      pts.map((p, i) => sv('circle', { class: 'ptk-pt', 'data-look': 'talk.pt', 'data-rate': sev(p.fp.hvpg), cx: X(i), cy: Y(p.fp.hvpg), r: i === last ? 6 : 4 })),
      pts.length ? sv('text', { class: 'ptk-v', 'data-look': 'talk.value', 'data-rate': sev(pts[last].fp.hvpg), x: R + 10, y: Y(pts[last].fp.hvpg) + 0.35 * vfs }, fmt(pts[last].fp.hvpg, 1)) : null);
  }
  // The new chart takes over the old one: each line, point, gridline and word in both glides to its new place, the rest fades (svg-morph.js).
  // Where that cannot be (Reduce Motion, another size) the new chart fades in over the old one, which then goes (never a
  // jump); a new size just redraws.
  // (On the GPU: the old and new models stand in the box, hidden, and the picture draws them; the fade in is the picture's, on the
  // stylesheet's old ease, --d-surface on --ease.)
  function show(svg, fade) { gl.show(svg, fade); }
  return { el, set, configure, update() {}, clear() {}, dispose() { ro?.disconnect(); gl.dispose(); } };
}
