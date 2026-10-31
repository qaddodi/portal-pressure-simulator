// The talk so far, for a slide's tool { kind: 'trace' } (presenter-tools.js): the portal, wedged and free hepatic pressures at
// every state up to the slide, one point each, and the HVPG in its own lane with its cut-offs. (Moved here unchanged from
// presenter-tools.js, so the deck visuals' chart package can extend it without touching the instruments' file.)

import { h, fmt, clamp } from './util.js?v=731ee3a0c7';
import { traceLabel, traceLabelRoom } from './trace-labels.js?v=fc916a95c6';
import { frameFor } from './frame.js?v=9e0c25a14c';
import { plotPanel } from './plot-look.js?v=5037697da7';
import { bandKeys, bandRuns, bandSpan, namePlaces } from './rx-bands.js?v=51e83c7c59';
const nextFrame = frameFor('presenter-tools');

// ── The talk so far: PV, WHVP and FHVP at each state, the HVPG in its own lane with its cut-offs ──
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const LINES = [['pv', 'PV', '--tr-pv'], ['whvp', 'WHVP', '--tr-wedge'], ['fhvp', 'FHVP', '--tr-hv']];
const sev = (v) => (v >= 10 ? 'hi' : v >= 5 ? 'mid' : 'ok');
let mctx = null;
const textW = (t, f, wt = 600) => {
  if (mctx === null) mctx = (typeof document !== 'undefined' && document.createElement?.('canvas')?.getContext?.('2d')) || false;
  if (!mctx?.measureText) return t.length * f * 0.62;
  mctx.font = `${wt} ${f}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  return mctx.measureText(t).width;
};

/** Where the milestones' names go, level over their lines: each centred on its x (moved in to stay inside [0, W]), on the
 *  first row from the plot up where it keeps gap px from the name before it; as many rows as that takes, never cut short.
 *  xs: each milestone's x, widths: its name's width. → { at: [{ x, row }] (x: the name's middle), rows } */
export function milePlaces(xs, widths, W, gap = 10) {
  const ends = [], at = xs.map((x, i) => {
    const w = widths[i], mid = Math.min(Math.max(x, w / 2 + 2), W - w / 2 - 2);
    let row = ends.findIndex((e) => mid - w / 2 >= e + gap);
    if (row < 0) row = ends.length;
    ends[row] = mid + w / 2;
    return { x: mid, row };
  });
  return { at, rows: ends.length };
}
export function talkTrace() {
  // Drawn at the card's own pixels (one unit a CSS pixel) and its one small size, so the words never scale with the card:
  // the card's fit sets the chart's height (styles/app.css .pz-talk) and only the plot gets shorter.
  const el = h('div', { class: 'pz-talk' });
  let chain0 = null, size = '', bands = [], miles = false;   // (bands: the treatments the slide shades, rx-bands.js; none on a built-in deck)
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (chain0 && `${el.clientWidth}x${el.clientHeight}` !== size) draw(chain0, false); }) : null;
  ro?.observe(el);
  function set(chain) { chain0 = chain; draw(chain, true); }
  // (style: 'milestones' draws the milestones style, drawMiles; any other, the full chart.)
  function configure(t) { bands = bandKeys(t); miles = t?.style === 'milestones'; el.classList.toggle('miles', miles); }
  function draw(chain, fade) {
    if (miles) { show(drawMiles(chain), fade); return; }
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = parseFloat(getComputedStyle(el).fontSize) || 12, L = Math.ceil(3.3 * fs) + 8;
    size = `${W}x${HT}`;
    const pts = chain.filter((c) => c.fp);
    // Over each line: what happened there, at 45° along the top (the chart makes room); under it, its time point.
    const vfs = 1.5 * fs, right = Math.ceil(Math.max(4 * 0.68 * fs, 4 * 0.6 * vfs)) + 14;
    const { R, pad } = traceLabelRoom(pts.map((p) => p.tick), { W, L, right, cw: 0.6 * fs });
    // (Treatment bands name themselves between the two lanes, a row or two over the HVPG lane's name: the chart is that much
    // taller (styles/app.css .pz-talk.has-bands) and the upper lane ends that much higher.)
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [], room = runs.length ? (runs.length > 1 ? 2 : 1) * (fs + 4) : 0;
    el.classList.toggle('has-bands', !!room);
    if (room) el.style.setProperty('--band-room', `${room}px`); else el.style.removeProperty('--band-room');
    const T = pad + fs + 18, B2 = HT - fs - 16, T2 = B2 - Math.max(28, 0.2 * (B2 - T)), B1 = Math.max(T + 30, T2 - fs - 26 - Math.max(0, room - fs - 4));
    const n = Math.max(pts.length, 2), X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : i / (n - 1));
    const top = Math.max(20, ...pts.flatMap((p) => LINES.map(([k]) => p.fp[k] || 0)));
    const pMax = Math.ceil(top / 10) * 10, Y = (v) => B1 - (B1 - T) * clamp(v, 0, pMax) / pMax;
    const gMax = Math.max(15, Math.ceil(Math.max(0, ...pts.map((p) => p.fp.hvpg || 0)) / 5) * 5), Y2 = (v) => B2 - (B2 - T2) * clamp(v, 0, gMax) / gMax;
    const path = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${f(p).toFixed(1)}`).join('');
    const last = pts.length - 1;
    // (Gridlines every 10 mmHg, or every 20 when the plot is short; the HVPG lane names 0 and its 10 mmHg cut-off only when short.)
    const gStep = (B1 - T) / (pMax / 10) < 1.4 * fs ? 20 : 10, hTicks = (B2 - T2) / gMax * 5 < 1.2 * fs ? [0, 10] : [0, 5, 10];
    // The line names at the right end, top to bottom, never touching.
    const ends = pts.length ? LINES.map(([k, a, c]) => [a, c, Y(pts[last].fp[k])]).sort((p, q) => p[2] - q[2]) : [];
    ends.forEach((e, k) => { if (k) e[2] = Math.max(e[2], ends[k - 1][2] + 1.25 * fs); });
    // A time point is named under its line where it has room: the last always, an earlier one only clear of its neighbours.
    const whenW = (p) => (p.when || String(p.n)).length * 0.6 * fs, named = new Set();
    for (let i = last, edge = Infinity; i >= 0; i--) {
      const half = whenW(pts[i]) / 2;
      if (X(i) + half + 8 <= edge && X(i) - half >= 0 && !(i < last && pts[i].when && pts[i].when === pts[i + 1]?.when)) { named.add(i); edge = X(i) - half; }
    }
    // Behind everything, a soft band over the time points while each treatment was on, named once at its start between the
    // two lanes (clear of the 45° event words over the top and of the HVPG lane's own name), over the lines with a halo. A
    // name may run on into the line names' margin where none of them sits on its row.
    const spans = runs.map((r) => bandSpan(r, pts.length, X, L, R)), rowY = (r) => T2 - 8 - r * (fs + 4);
    const endBoxes = ends.map(([, , y]) => [y - 0.4 * fs, y + 0.55 * fs]);   // (each drawn at y + 0.35 em: its caps over, a tail under)
    if (pts.length) endBoxes.push([Y2(pts[last].fp.hvpg) - 0.4 * vfs, Y2(pts[last].fp.hvpg) + 0.55 * vfs]);
    const rowFree = (r) => endBoxes.every(([a, b]) => b < rowY(r) - 0.8 * fs - 2 || a > rowY(r) + 0.25 * fs + 2);
    const at = namePlaces(spans, runs.map((r) => r.name), (t) => t.length * 0.58 * fs, { ends0: [L + 4 * 0.75 * fs], maxX: [0, 1].map((r) => (rowFree(r) ? W - 4 : R)) });
    const bandEls = runs.map((r, k) => sv('g', { class: 'ptk-band', 'data-rx': r.key, style: `--rx: var(${r.tone})` },
      sv('rect', { x: spans[k][0], width: Math.max(2, spans[k][1] - spans[k][0]), y: T - fs - 8, height: B2 + 4 - (T - fs - 8) })));
    const bandNames = runs.map((r, k) => sv('text', { class: 'ptk-band-n', style: `--rx: var(${r.tone})`, x: at[k].x, y: rowY(at[k].row) }, r.name));
    // (The plot is one rounded panel the chart's full width, his G2 look, plot-look.js: from where the marks start to under the times, the numbers and the line names inside its edge.)
    const panel = plotPanel(sv, 0, T - fs - 12, W, HT - 1.5 - (T - fs - 12));
    const svg = sv('svg', { viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Pressures over the talk so far: ' + pts.map((p) => `${p.when || `slide ${p.n}`}${p.tick ? `, ${p.tick}` : ''}, PV ${fmt(p.fp.pv, 0)}, HVPG ${fmt(p.fp.hvpg, 1)}`).join('; ')
      + runs.map((r) => `. ${r.name} from ${pts[r.i0].when || `slide ${pts[r.i0].n}`}`).join('') },
      sv('defs', {}, panel.clip), panel.back, bandEls,
      Array.from({ length: pMax / gStep + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(k * gStep), y2: Y(k * gStep) }), sv('text', { x: L - 8, y: Y(k * gStep) + 0.35 * fs, 'text-anchor': 'end' }, String(k * gStep)))),
      // The unit sits once at the top of each axis, above its numbers; the top lane needs no name, the HVPG lane keeps its own (nothing wedged under the event labels).
      sv('text', { class: 'ptk-unit', x: L - 8, y: T - 8, 'text-anchor': 'end' }, 'mmHg'),
      sv('text', { class: 'ptk-ax', x: L, y: T2 - 8 }, 'HVPG'), sv('text', { class: 'ptk-unit', x: L - 8, y: T2 - 8, 'text-anchor': 'end' }, 'mmHg'),
      hTicks.map((v) => sv('g', { class: 'ptk-grid' + (v ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { x1: L, x2: R, y1: Y2(v), y2: Y2(v) }), sv('text', { x: L - 8, y: Y2(v) + 0.35 * fs, 'text-anchor': 'end' }, String(v)))),
      // A line at each time point, with when and what happened.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('title', {}, `${p.when || `Slide ${p.n}`}: ${p.title}`),
        sv('line', { x1: X(i), x2: X(i), y1: T - fs - 8, y2: B2 + 4 }), named.has(i) ? sv('text', { x: X(i), y: B2 + fs + 6, 'text-anchor': 'middle' }, p.when || String(p.n)) : null,
        p.tick ? sv('text', { class: 'ptk-ev', x: X(i) + 3, y: T - fs - 12, 'text-anchor': 'start', transform: `rotate(-45 ${X(i) + 3} ${T - fs - 12})` }, traceLabel(p.tick)) : null)),
      LINES.map(([k, , c]) => sv('path', { class: 'ptk-line', style: `stroke: var(${c})`, d: path((p) => Y(p.fp[k])) })),
      ends.map(([a, c, y]) => sv('text', { class: 'ptk-lbl', x: R + 8, y: y + 0.35 * fs, style: `fill: var(${c})` }, a)),
      sv('path', { class: 'ptk-line hv', d: path((p) => Y2(p.fp.hvpg)) }),
      pts.map((p, i) => sv('circle', { class: 'ptk-pt', 'data-rate': sev(p.fp.hvpg), cx: X(i), cy: Y2(p.fp.hvpg), r: i === last ? 6 : 4 })),
      bandNames,
      pts.length ? sv('text', { class: 'ptk-v', 'data-rate': sev(pts[last].fp.hvpg), x: R + 8, y: Y2(pts[last].fp.hvpg) + 0.35 * vfs }, fmt(pts[last].fp.hvpg, 1)) : null);
    show(svg, fade);
  }
  // The milestones style (tool: { kind: 'trace', range: 'talk', style: 'milestones' }, Mohammad's pick, 19 Oct: "Milestones only"):
  // the HVPG alone, its line and points in their cut-off colours over the 5 and 10 mmHg cut-offs; a short level name over each
  // slide the deck marks as a milestone (slide.milestone: 'Dx', 'Carvedilol', 'TIPS'), on as many rows as they need, never cut
  // short or slanted; every other time point a plain dot; the treatment bands underneath, named between the names and the plot.
  function drawMiles(chain) {
    const W = el.clientWidth || 520, HT = el.clientHeight || 420, fs = parseFloat(getComputedStyle(el).fontSize) || 12, L = Math.ceil(3.3 * fs) + 8;
    size = `${W}x${HT}`;
    const pts = chain.filter((c) => c.fp), last = pts.length - 1, vfs = 1.5 * fs;
    const R = W - Math.ceil(4 * 0.6 * vfs) - 14, n = Math.max(pts.length, 2), X = (i) => L + (R - L) * (pts.length < 2 ? 0.5 : i / (n - 1));
    const mi = pts.map((p, i) => (p.mile ? i : -1)).filter((i) => i >= 0);
    const { at, rows } = milePlaces(mi.map(X), mi.map((i) => textW(pts[i].mile, fs)), W);
    // (A band that starts at a milestone of its own name is named once, by the milestone; the rest are named on as many rows
    // as keep them inside the chart and clear of each other and of the HVPG lane's name at the left of the lowest row.)
    const runs = bands.length ? bandRuns(pts.map((p) => p.params), bands) : [], spans = runs.map((r) => bandSpan(r, pts.length, X, L, R));
    const nameK = runs.map((r, k) => k).filter((k) => pts[runs[k].i0]?.mile !== runs[k].name);
    const bat0 = namePlaces(nameK.map((k) => spans[k]), nameK.map((k) => runs[k].name), (t) => textW(t, fs), { rows: nameK.length > 1 ? 2 : 1, maxX: W - 4, grow: true, ends0: [L + textW('HVPG', fs) + 0.2 * fs] });
    const bRows = nameK.length ? Math.max(...bat0.map((a) => a.row)) + 1 : 0;
    const rowH = fs + 6, nameY = (r) => 4 + fs + (rows - 1 - r) * rowH, T0 = 4 + rows * rowH, bandY = (r) => T0 + fs + (bRows - 1 - r) * (fs + 4);
    const T = T0 + bRows * (fs + 4) + 0.6 * fs + 6, B = HT - fs - 16;
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
      runs.map((r, k) => sv('g', { class: 'ptk-band', 'data-rx': r.key, style: `--rx: var(${r.tone})` },
        sv('rect', { x: spans[k][0], width: Math.max(2, spans[k][1] - spans[k][0]), y: T0 - 2, height: B + 4 - (T0 - 2) }))),
      ticks.map((v) => sv('g', { class: 'ptk-grid' + (v === 5 || v === 10 ? ' cut' : ''), 'data-rate': v === 10 ? 'hi' : v === 5 ? 'mid' : null },
        sv('line', { x1: L, x2: R, y1: Y(v), y2: Y(v) }), sv('text', { x: L - 8, y: Y(v) + 0.35 * fs, 'text-anchor': 'end' }, String(v)))),
      sv('text', { class: 'ptk-unit', x: L - 8, y: T - 0.6 * fs - 2, 'text-anchor': 'end' }, 'mmHg'), sv('text', { class: 'ptk-ax', x: L, y: T - 0.6 * fs - 2 }, 'HVPG'),
      // A line under each milestone's name down to the axis, and the times under the axis.
      pts.map((p, i) => sv('g', { class: 'ptk-mark' + (i === last ? ' now' : '') }, sv('title', {}, `${p.when || `Slide ${p.n}`}: ${p.title}`),
        p.mile ? sv('line', { x1: X(i), x2: X(i), y1: T0 - 2, y2: B + 4 }) : null,
        named.has(i) ? sv('text', { x: X(i), y: B + fs + 6, 'text-anchor': 'middle' }, p.when || String(p.n)) : null)),
      mi.map((i, k) => sv('text', { class: 'ptk-ms' + (i === last ? ' now' : ''), x: at[k].x, y: nameY(at[k].row), 'text-anchor': 'middle' }, pts[i].mile)),
      nameK.map((k, j) => sv('text', { class: 'ptk-band-n', style: `--rx: var(${runs[k].tone})`, x: bat0[j].x, y: bandY(bat0[j].row) }, runs[k].name)),
      // (Each stretch of the line in the colour of where it ends, the cut-offs' own.)
      pts.slice(1).map((p, k) => sv('path', { class: 'ptk-line hv', 'data-rate': sev(p.fp.hvpg), d: `M${X(k).toFixed(1)} ${Y(pts[k].fp.hvpg).toFixed(1)}L${X(k + 1).toFixed(1)} ${Y(p.fp.hvpg).toFixed(1)}` })),
      pts.map((p, i) => sv('circle', { class: 'ptk-pt', 'data-rate': sev(p.fp.hvpg), cx: X(i), cy: Y(p.fp.hvpg), r: i === last ? 6 : 4 })),
      pts.length ? sv('text', { class: 'ptk-v', 'data-rate': sev(pts[last].fp.hvpg), x: R + 10, y: Y(pts[last].fp.hvpg) + 0.35 * vfs }, fmt(pts[last].fp.hvpg, 1)) : null);
  }
  // The new chart fades in over the old one, which then goes (never a jump); a new size just redraws.
  function show(svg, fade) {
    const old = [...el.children];
    if (!fade) { el.replaceChildren(svg); return; }
    svg.classList.add('in');
    el.append(svg);
    nextFrame(() => nextFrame(() => svg.classList.remove('in')));
    setTimeout(() => old.forEach((o) => o.remove()), 480);
  }
  return { el, set, configure, update() {}, clear() {}, dispose() { ro?.disconnect(); } };
}
