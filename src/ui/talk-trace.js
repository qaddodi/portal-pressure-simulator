// The talk so far, for a slide's tool { kind: 'trace' } (presenter-tools.js): the portal, wedged and free hepatic pressures at
// every state up to the slide, one point each. (Moved here unchanged from presenter-tools.js, so the deck visuals' chart package
// can extend it without touching the instruments' file.)
//
// The full chart is Mohammad's "Two gaps" pick (6 Nov 2026, mocks: /mnt/project-files/course-chart-mocks/): one panel, PV and WHVP
// with the band between them shaded (the resistance before the sinusoids, a clot on the PVT deck: tool.gap names it) and the band
// between WHVP and FHVP shaded too (the HVPG), so "HVPG stayed flat" is a band that keeps its width. The stage names stand level over
// the plot, the treatments are thin neutral bars under them (never a tint over the lines), the states of one visit share a bracket on
// the time row and a break marks the time between visits, and two rows of readings under the plot (PV − WHVP, HVPG) replace the old
// HVPG lane. WHVP is violet (--s7), not --tr-wedge: pink against orchid failed the palette check (normal-vision ΔE 9.9, the floor 15).

import { h, fmt, clamp } from './util.js';
import { hvpgRate } from '../engine/pressure-cuts.js';
import { traceLabel } from './trace-labels.js';
import { plotPanel } from './plot-look.js';
import { bandKeys, bandRuns } from './rx-bands.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { measure } from './glyph-measure.js';
import { chartCtx } from './chart-ctx.js';

// (2 Nov 2026: the chart is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = svgModel;
/** The wedged pressure's colour on the charts that draw it against the portal pressure (here and tool-curve.js). */
export const WEDGE_C = '--s7';
const LINES = [['pv', 'PV', '--tr-pv'], ['whvp', 'WHVP', WEDGE_C], ['fhvp', 'FHVP', '--text-3']];
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
    const W = el.clientWidth || 520, HT0 = el.clientHeight || 420, fs = hostFs(), narrow = W < 420;
    size = `${W}x${HT0}`;
    const pts = chain.filter((c) => c.fp), n = pts.length, last = n - 1;
    const g = visitsOf(pts), u = visitUnits(g), uMax = Math.max(u[last] ?? 0, 1e-9);
    // The scale: 0 to the next 5 over the highest reading (20 at least), the numbers 8 px inside the panel's left edge.
    const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
    const pMax = Math.ceil(top / 5) * 5, L = Math.ceil(textW(String(pMax), fs, 500)) + 16;
    // The right column: each line's name (and, with room, its last value), and the readings rows' names, each after a swatch.
    const vals = pts.length ? LINES.map(([k, a]) => [a, f1(pts[last].fp[k])]) : [];
    const endW = Math.max(0, ...vals.map(([a, v]) => textW(a, fs, 700) + (narrow ? 0 : 4 + textW(v, fs, 500))));
    const rowName = narrow ? gapName.replace(/ − /g, '−') : gapName, rowW = Math.max(textW(rowName, 0.92 * fs, 500), textW('HVPG', 0.92 * fs, 500));
    const R = Math.floor(W - 8 - 12 - Math.max(endW, rowW) - 12);
    const pad = Math.max(10, 0.9 * fs), X = (i) => (n < 2 ? (L + R) / 2 : L + pad + (R - L - 2 * pad) * u[i] / uMax);
    // The stage names, level over the plot: wrapped to two lines where a column is narrow, on as many rows as keep them clear.
    const colW = n < 2 ? R - L : Math.max(textW('Carvedilol', fs), Math.min(...pts.slice(1).map((p, i) => X(i + 1) - X(i))) - 8);
    const blocks = pts.map((p) => {
      const words = traceLabel(p.tick).split(' '), lines = [];
      for (const w of words) {
        const t = lines.length ? `${lines.at(-1)} ${w}` : w;
        if (!lines.length) lines.push(w); else if (lines.length >= 2 || textW(t, fs) <= colW) lines[lines.length - 1] = t; else lines.push(w);
      }
      return { lines, w: Math.max(...lines.map((t) => textW(t, fs))) };
    });
    const mp = milePlaces(pts.map((p, i) => X(i)), blocks.map((b) => b.w), W - 2, 8);
    const rowsUsed = Math.min(mp.rows, 3), lineH = fs + 3;
    const rowLines = Array.from({ length: rowsUsed }, (_, r) => Math.max(1, ...blocks.filter((b, i) => mp.at[i].row === r).map((b) => b.lines.length)));
    const rowTop = (r) => rowLines.slice(0, r).reduce((a, k) => a + k * lineH + 4, 0);
    const headH = rowTop(rowsUsed);
    // The treatments, as bars under the names.
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [];
    const { bars, rows: rxRows } = rxBars(runs, X, g, last, W, (t) => textW(t, 0.9 * fs, 500));
    const stripY = headH + 4, room = rxRows * (fs + 10);
    bandRoom(room);
    const HT = Math.max(HT0, 0);
    // The panel from under the bars to the chart's foot: the plot, the time row, the two readings rows.
    const pTop = stripY + room + 4, T = pTop + fs + 14;
    const B = Math.max(T + 3 * fs, HT - 3 * fs - 39), ty = B + fs + 10, r1 = ty + fs + 10, r2 = r1 + fs + 7;
    const Y = (v) => B - (B - T) * clamp(v, 0, pMax) / pMax;
    const gStep = (B - T) / (pMax / 5) >= 1.5 * fs ? 5 : 10;
    const ys = (k) => pts.map((p, i) => [X(i), Y(p.fp[k] || 0)]);
    const pv = ys('pv'), wh = ys('whvp'), fh = ys('fhvp');
    const path = (a) => a.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const band = (upper, lower) => (n < 2 ? '' : `${path(upper)}${path([...lower].reverse()).replace(/^M/, 'L')}Z`);
    // Each band named once, inside it, where it is tallest between two states and the name fits.
    const bandName = (upper, lower, text) => {
      let best = null;
      for (let i = 0; i < n - 1; i++) {
        const h0 = Math.min(lower[i][1] - upper[i][1], lower[i + 1][1] - upper[i + 1][1]), wd = upper[i + 1][0] - upper[i][0];
        if (h0 >= 1.3 * fs && wd >= textW(text, 0.92 * fs) + 10 && (!best || h0 > best.h0)) best = { h0, x: (upper[i][0] + upper[i + 1][0]) / 2, y: (upper[i][1] + upper[i + 1][1] + lower[i][1] + lower[i + 1][1]) / 4 };
      }
      return best;
    };
    const gapAt = bandName(pv, wh, gapName), hvAt = bandName(wh, fh, 'HVPG');
    // The lines' names at the right end, top to bottom, never touching.
    const ends = pts.length ? LINES.map(([k, a, c]) => ({ a, c, v: f1(pts[last].fp[k]), y: Y(pts[last].fp[k] || 0) })).sort((p, q) => p.y - q.y) : [];
    ends.forEach((e, k) => { if (k) e.y = Math.max(e.y, ends[k - 1].y + 1.25 * fs); });
    const sx = R + 12, tx = sx + 12;
    // The time row: a visit of several states shares a bracket and its day; a break on the axis between visits, the time between them over it where it fits.
    const visits = [];
    pts.forEach((p, i) => { if (!i || g[i] !== g[i - 1]) visits.push({ i0: i, i1: i, when: p.when || String(p.n), day: p.day ?? p.when }); else visits.at(-1).i1 = i; });
    const vX = (v) => (X(v.i0) + X(v.i1)) / 2, vText = (v) => (v.i1 > v.i0 && !narrow && textW(`${v.when} · one visit`, 0.92 * fs, 500) + 12 <= X(v.i1) - X(v.i0) + 12 ? `${v.when} · one visit` : v.when);
    const vKept = keepClear(visits.map(vX), visits.map((v) => textW(vText(v), 0.92 * fs, 600)), W);
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
        span && b - a >= textW(span, 0.85 * fs, 500) + 16 ? sv('text', { 'data-look': 'talk.span', x: mx, y: ty, 'text-anchor': 'middle' }, span) : null);
    });
    // The two rows of readings under the plot, each value under its state (where it stands clear), named in the right column.
    const gapV = pts.map((p) => f1((p.fp.pv || 0) - (p.fp.whvp || 0))), hvV = pts.map((p) => f1(p.fp.hvpg || 0));
    const keep1 = keepClear(pts.map((p, i) => X(i)), gapV.map((t) => textW(t, fs, 600)), R + 6), keep2 = keepClear(pts.map((p, i) => X(i)), hvV.map((t) => textW(t, fs, 600)), R + 6);
    const panel = plotPanel(sv, 0, pTop, W, HT - 1.5 - pTop);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${fmt(p.fp.pv, 0)}, WHVP ${fmt(p.fp.whvp, 0)}, ${gapName} ${f1((p.fp.pv || 0) - (p.fp.whvp || 0))}, HVPG ${fmt(p.fp.hvpg, 1)}`).join('; ')
      + runs.map((r) => `. ${r.name} from ${pts[r.i0].when || `slide ${pts[r.i0].n}`}`).join('') },
      sv('defs', {}, panel.clip), panel.back,
      Array.from({ length: pMax / gStep + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: Y(k * gStep), y2: Y(k * gStep) }), sv('text', { 'data-look': 'plot.grid.text', x: L - 8, y: Y(k * gStep) + 0.35 * fs, 'text-anchor': 'end' }, String(k * gStep)))),
      // The unit sits once at the top of the axis, above its numbers.
      sv('text', { class: 'ptk-unit', 'data-look': 'plot.unit', x: L - 8, y: T - 8, 'text-anchor': 'end' }, 'mmHg'),
      // A faint upright line at each state, from the top of the plot to its axis.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('line', { 'data-look': 'talk.mark.line', x1: X(i), x2: X(i), y1: T - 4, y2: B }))),
      // The two bands: the HVPG under, the gap before the sinusoids over it, each named once inside.
      n > 1 ? sv('path', { class: 'ptk-gap hv', 'data-look': 'talk.gap.hv', 'data-p-c': tokName(WEDGE_C), d: band(wh, fh) }) : null,
      n > 1 ? sv('path', { class: 'ptk-gap', 'data-look': 'talk.gap', 'data-p-c': 'tr-pv', d: band(pv, wh) }) : null,
      hvAt ? sv('text', { class: 'ptk-gap-n hv', 'data-look': 'talk.gap.name', 'data-hv': '1', x: hvAt.x, y: hvAt.y + 0.33 * fs, 'text-anchor': 'middle' }, 'HVPG') : null,
      gapAt ? sv('text', { class: 'ptk-gap-n', 'data-look': 'talk.gap.name', x: gapAt.x, y: gapAt.y + 0.33 * fs, 'text-anchor': 'middle' }, gapName) : null,
      // The lines: FHVP a dashed reference, then WHVP and PV with a point at each state.
      sv('path', { class: 'ptk-line free', 'data-look': 'talk.line.free', d: path(fh) }),
      sv('path', { class: 'ptk-line', 'data-look': 'talk.line', 'data-p-c': tokName(WEDGE_C), d: path(wh) }),
      sv('path', { class: 'ptk-line', 'data-look': 'talk.line', 'data-p-c': 'tr-pv', d: path(pv) }),
      [[wh, WEDGE_C], [pv, '--tr-pv']].map(([a, c]) => a.map(([x, y], i) => sv('circle', { class: 'ptk-pt', 'data-look': 'talk.dot', 'data-p-c': tokName(c), cx: x, cy: y, r: i === last ? 4.5 : 3.5 }))),
      ends.map((e) => sv('g', { class: 'ptk-lbl' },
        sv('rect', { 'data-look': 'talk.swatch', 'data-p-c': tokName(e.c), x: sx, y: e.y - 1.5, width: 8, height: 3, rx: 1.5 }),
        sv('text', { 'data-look': 'talk.lbl.n', x: tx, y: e.y + 0.35 * fs }, e.a),
        narrow ? null : sv('text', { 'data-look': 'talk.lbl.v', x: tx + textW(e.a, fs, 700) + 4, y: e.y + 0.35 * fs }, e.v))),
      sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
      timeEls, breaks,
      // The readings rows.
      sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: W - 8, y1: r1 - fs - 3, y2: r1 - fs - 3 }),
      pts.map((p, i) => sv('g', { class: 'ptk-read' + (i === last ? ' now' : '') },
        keep1.has(i) ? sv('text', { 'data-look': 'talk.read', x: X(i), y: r1, 'text-anchor': 'middle' }, gapV[i]) : null,
        keep2.has(i) ? sv('text', { 'data-look': 'talk.read', 'data-rate': sev(p.fp.hvpg), 'data-hv': '1', x: X(i), y: r2, 'text-anchor': 'middle' }, hvV[i]) : null)),
      sv('rect', { 'data-look': 'talk.swatch.gap', 'data-p-c': 'tr-pv', x: sx, y: r1 - 0.7 * fs, width: 8, height: 8, rx: 2 }),
      sv('text', { 'data-look': 'talk.read.name', x: tx, y: r1 }, rowName),
      sv('rect', { 'data-look': 'talk.swatch.gap', 'data-p-c': tokName(WEDGE_C), x: sx, y: r2 - 0.7 * fs, width: 8, height: 8, rx: 2 }),
      sv('text', { 'data-look': 'talk.read.name', x: tx, y: r2 }, 'HVPG'),
      // The stage names, then the treatments.
      pts.map((p, i) => {
        const at = mp.at[i];
        if (at.row >= rowsUsed) return null;
        // (rows counted from the plot up, as milePlaces gives them: row 0 is the lowest)
        const r = rowsUsed - 1 - at.row, y0 = rowTop(r) + fs;
        return sv('g', { class: 'ptk-stage' + (i === last ? ' now' : '') },
          blocks[i].lines.map((t, k) => sv('text', { 'data-look': 'talk.stage', x: at.ax, y: y0 + k * lineH, 'text-anchor': at.anchor }, t)));
      }),
      barEls(bars, stripY, fs));
    show(svg, fade);
  }
  // The milestones style (tool: { kind: 'trace', range: 'talk', style: 'milestones' }, Mohammad's pick, 19 Oct: "Milestones only"):
  // the HVPG alone, its line and points in their cut-off colours over the 5 and 10 mmHg cut-offs; a short level name over each
  // slide the deck marks as a milestone (slide.milestone: 'Dx', 'Carvedilol', 'TIPS'), on as many rows as they need, never cut
  // short or slanted; every other time point a plain dot; the treatments as thin bars between the names and the plot (as the full chart's,
  // Mohammad's "Two gaps" pick, 6 Nov 2026: no tint over the line).
  function drawMiles(chain) {
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = hostFs(), L = Math.ceil(3.3 * fs) + 8;
    size = `${W}x${HT}`;
    const pts = chain.filter((c) => c.fp), last = pts.length - 1, vfs = 1.5 * fs;
    const vw = Math.ceil(textW(fmt(pts[last]?.fp.hvpg ?? 0, 1), vfs, 700)), R = W - Math.max(Math.ceil(4 * 0.6 * vfs), vw + 4) - 14,   // (the end value's own width, so it stands inside the card with room to spare)
       n = Math.max(pts.length, 2), X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : i / (n - 1));
    const mi = pts.map((p, i) => (p.mile ? i : -1)).filter((i) => i >= 0);
    const { at, rows } = milePlaces(mi.map(X), mi.map((i) => textW(pts[i].mile, fs)), R);
    // (The treatments: a bar each, packed on as few rows as keep them clear, between the names and the plot. The card does not grow for them.)
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [];
    const { bars, rows: bRows } = rxBars(runs, X, visitsOf(pts), last, W, (t) => textW(t, 0.9 * fs, 500));
    const rowH = fs + 8, nameY = (r) => 4 + fs + (rows - 1 - r) * rowH, T0 = 4 + rows * rowH + Math.ceil(0.6 * fs);
    const T = T0 + bRows * (fs + 10) + 0.6 * fs + 6, B = HT - fs - 16;
    const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y = (v) => B - (B - T) * clamp(v, 0, gMax) / gMax;
    const ticks = Array.from({ length: gMax / 5 + 1 }, (_, k) => k * 5).filter((v, k, a) => (B - T) / a.length >= 1.2 * fs || v % 10 === 0 || v === 5);
    // (The time under the line: at each milestone and the last point, where it keeps clear of its neighbour.)
    const whenW = (p) => textW(p.when || String(p.n), fs, 500), named = new Set();
    const list = [...new Set([...mi, last])].filter((i) => i >= 0).sort((a, b) => a - b);
    for (let k = list.length - 1, edge = Infinity; k >= 0; k--) {
      const i = list[k], half = whenW(pts[i]) / 2;
      if (X(i) + half + 8 <= edge && X(i) - half >= 0) { named.add(i); edge = X(i) - half; }
    }
    const panel = plotPanel(sv, 0, T0 - 6, W, HT - 1.5 - (T0 - 6));
    return sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'HVPG over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.mile ? `, ${p.mile}` : ''}, ${fmt(p.fp.hvpg, 1)}`).join('; ')
      + runs.map((r) => `. ${r.name} from ${pts[r.i0].when || `slide ${pts[r.i0].n}`}`).join('') },
      sv('defs', {}, panel.clip), panel.back,
      ticks.map((v) => sv('g', { class: 'ptk-grid' + (v === 5 || v === 10 ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { 'data-look': 'plot.grid.line', x1: L, x2: R, y1: Y(v), y2: Y(v) }), sv('text', { 'data-look': 'plot.grid.text', x: L - 8, y: Y(v) + 0.35 * fs, 'text-anchor': 'end' }, String(v)))),
      sv('text', { class: 'ptk-unit', 'data-look': 'plot.unit', x: L - 8, y: T - 0.6 * fs - 2, 'text-anchor': 'end' }, 'mmHg'), sv('text', { class: 'ptk-ax', 'data-look': 'plot.ax', x: L, y: T - 0.6 * fs - 2 }, 'HVPG'),
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
