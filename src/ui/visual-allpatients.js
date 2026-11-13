// All four patients on one chart (visual: 'allpatients'; Mohammad, 7 Nov 2026, mock E1): the HVPG over two years with the CSPH line, the 1 and 2 year values on the
// lines and a key of the HVPG, the stiffness and the platelets before treatment, at 1 year and at 2 years, worst first. On an iPhone the chart takes the card's
// full width and the key sits under it as a grid of two. Drawn on the GPU as the app's other time charts are (svg-gl.js, the over-time looks of
// chart-looks/time.js and allp.js), at the card's width; its numbers and layout are allpatients-model.js.
//
// The numbers are worked out once per deck on the presenter's calculation worker (ctx.run, a fresh model, every slide's days one at a time) and kept; the
// slide's own state is not used. Until they are there the frame shows (the scale, the CSPH line and its tint) and the lines fade in over it.

import { cohortSteps, seriesOf, layout, at, verdictOf, fmtOf, KEYS, CUT } from './allpatients-model.js';
import { smoothPath } from './tool-course.js';
import { plotPanel } from './plot-look.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { chartCtx, tokName } from './chart-ctx.js';
import { readBox } from './layout-snap.js';
import { restPass } from './rest-pass.js';

const sv = svgModel;
const FMT = Object.fromEntries(KEYS.map((k) => [k, fmtOf(k)]));
const OK = 'ok', BAD = 'danger';

// Each deck's runs, kept once worked out (by deck, then slide).
const kept = new WeakMap();
const keepOf = (deck) => { if (!deck) return new Map(); let m = kept.get(deck); if (!m) kept.set(deck, (m = new Map())); return m; };
const ready = new WeakMap();   // (a run already worked out, as its value: a promise's cannot be read at once)
const keyOf = (s) => JSON.stringify([s.id, s.cohort]);
/** The four patients' series for a slide, worked out once per deck on the worker (a promise of the series), or null until the deck's states are in. */
function seriesWork(s, ctx) {
  const store = keepOf(ctx?.deck), key = keyOf(s);
  let p = store.get(key);
  if (p) return p;
  const made = ctx?.snap && cohortSteps(s, ctx.deck);
  if (!made) return null;
  p = ctx.run(made.steps, null).then((outs) => seriesOf(s, ctx.deck, outs));
  store.set(key, p);
  p.then((ser) => { if (!ser) store.delete(key); else ready.set(p, ser); }, () => store.delete(key));
  return p;
}
const haveOf = (s, ctx) => { const p = ctx?.snap ? keepOf(ctx.deck).get(keyOf(s)) : null; return p ? ready.get(p) ?? null : null; };
/** Starts the slide's run once the deck's states are in, so the chart is whole when its slide comes up (slide-ext.js: a visual's warm). */
export const warmAllPatients = (s, ctx) => seriesWork(s, ctx)?.catch(() => null) ?? null;

/** The chart's drawing for a card W px wide: { svg, H }, the GPU model (svgModel) and the card's height. ser: the series or null (the frame alone). */
export function build(W, ser, small = []) {
  const G = layout(W, ser, small), { f, r, X, Y, B, T, L, R, plotW, py, foot } = G;
  const t = (x, y) => ({ x: +x.toFixed(1), y: +(y + 0.35 * f).toFixed(1) });   // (a word is placed by the middle of its line)
  const word = (look, text, x, y, o = {}) => sv('text', { 'data-look': look, class: o.cls || null, 'data-p-c': o.c ? tokName(o.c) : null, 'data-tc': o.tc || null, ...t(x, y), 'text-anchor': o.anchor || 'start' }, text);
  const panel = plotPanel(sv, 0, py, plotW, B + foot - py);
  const cutY = Y(CUT), line = (x1, y1, x2, y2, look, a = {}) => sv('line', { 'data-look': look, x1: +x1.toFixed(1), y1: +y1.toFixed(1), x2: +x2.toFixed(1), y2: +y2.toFixed(1), ...a });
  // (The CSPH side tinted from the line up, the rest of the plot plain; the scale's numbers in the strip at the left, the cut-off's in its colour.)
  const zones = sv('g', { 'clip-path': panel.url }, sv('rect', { class: 'pco-z', 'data-look': 'co.z', 'data-rate': 'hi', x: 0, y: py, width: plotW, height: +(cutY - py).toFixed(1) }));
  const grid = [...G.ticks.map((v) => sv('g', { class: 'ptk-grid' }, line(L, Y(v), R, Y(v), 'plot.grid.line'), sv('text', { 'data-look': 'time.grid.text', 'data-p-c': 'text-3', ...t(L - 0.5 * f, Y(v)), 'text-anchor': 'end' }, String(v)))),
    sv('g', { class: 'ptk-grid cut' }, line(L, cutY, R, cutY, 'plot.grid.line', { class: 'cut', 'data-rate': 'hi' }),
      sv('text', { class: 'pcv-tc', 'data-look': 'cv.tc', 'data-tc': 'hi', ...t(L - 0.5 * f, cutY), 'text-anchor': 'end' }, String(CUT)))];
  // (The zones named in the two corners no line reaches: CSPH over the lines at the top, No CSPH under them at the foot, both ending at the 2 year guide.)
  const names = [word('ap.zone', 'CSPH', X(24), T + 0.9 * f, { tc: 'hi', anchor: 'end' }), word('ap.zone', 'No CSPH', X(24), B - 0.9 * f, { tc: 'ok', anchor: 'end' })];
  const guides = [12, 24].filter((m) => m <= G.end).map((m) => sv('line', { class: 'pcv-at', 'data-look': 'cv.at', x1: +X(m).toFixed(1), x2: +X(m).toFixed(1), y1: +T.toFixed(1), y2: +B.toFixed(1) }));
  const axis = [sv('line', { class: 'pft-x', 'data-look': 'time.axis.line', x1: L, x2: R, y1: B, y2: B }),
    ...G.xt.map(([m, s]) => sv('text', { class: 'pft-tk', 'data-look': 'time.tk', ...t(X(m), B + 1.1 * f), 'text-anchor': 'middle' }, s))];
  const caption = sv('g', { class: 'pft-key' }, sv('text', { 'data-look': 'time.key.text', 'data-p-c': 'text-2', ...t(0, 0.8 * f) }, sv('tspan', { 'data-look': 'time.span' }, 'HVPG'), sv('tspan', { class: 'pft-u', 'data-look': 'time.key.unit' }, ', mmHg')));
  let data = null, label = 'HVPG over two years, four patients: calculating';
  if (ser) {
    const pxOf = (p, from, to) => p.pts.filter((q) => q.m >= from && q.m <= to).map((q) => [X(q.m), Y(q.hvpg)]);
    const lines = ser.flatMap((p) => {
      const yr = p.pace ? 12 : 24;   // (a patient with one year in the deck: the line, then the model's second year dotted)
      return [sv('path', { class: 'ptk-line pcv-line', 'data-look': 'cv.line', 'data-p-c': tokName(p.c), d: smoothPath(pxOf(p, 0, yr)) }),
        p.pace ? sv('path', { class: 'ptk-line pcv-line', 'data-look': 'ap.model', 'data-p-c': tokName(p.c), d: smoothPath(pxOf(p, 12, 24)) }) : null];
    });
    const marks = ser.flatMap((p) => [sv('circle', { class: 'pcv-ring', 'data-look': 'cv.ring', 'data-p-c': tokName(p.c), cx: +X(0).toFixed(1), cy: +Y(p.pts[0].hvpg).toFixed(1), r }),
      ...[12, 24].filter((m) => at(p, m, 'hvpg') != null).map((m) => sv('circle', { class: 'pcv-dot', 'data-look': 'cv.dot', 'data-p-c': tokName(p.c), cx: +X(m).toFixed(1), cy: +Y(at(p, m, 'hvpg')).toFixed(1), r: m === 24 ? r + 1 : r }))]);
    const vals = [['start', 'ft.v0'], ['year1', 'cv.v'], ['year2', 'cv.v']].flatMap(([k, look]) => G.words[k].map((w) => sv('text', { class: look === 'cv.v' ? 'pcv-v' : 'pft-v0', 'data-look': look, 'data-p-c': tokName(w.p.c), ...t(w.x, w.y), 'text-anchor': 'start' }, FMT.hvpg(w.v))));
    data = [...lines, ...marks, ...vals, key(G, ser)];
    label = `HVPG over two years: ${ser.map((p) => `${p.name} ${p.pts.filter((q) => [0, 12, 24].includes(q.m)).map((q) => FMT.hvpg(q.hvpg)).join(', ')}`).join('; ')} mmHg, before, at 1 year and at 2 years`;
  }
  const svg = sv('svg', { viewBox: `0 0 ${G.W} ${G.H}`, width: G.W, height: G.H, role: 'img', 'aria-label': label, style: `font-size: ${f.toFixed(2)}px` },
    sv('defs', {}, panel.clip), panel.back, zones, ...grid, ...names, ...guides, ...axis, caption, data,
    sv('g', { class: 'pft-key' }, G.note.lines.map((l, i) => sv('text', { 'data-look': 'time.tk', x: +G.note.x.toFixed(1), y: +(G.note.y + (i + 0.5) * G.note.lh + 0.35 * f).toFixed(1) }, l))));
  svg.dataset.points = ser ? String(ser.reduce((n, p) => n + p.pts.length, 0)) : '0';   // (the browser checks read it: 0 until the numbers are there)
  return { svg, H: G.H, G };
}

// The key: a block for each patient (a dot, the name and the verdict in its colour; a row each for the HVPG, the stiffness and the platelets at before, 1 year
// and 2 years), under one header on a wide card and under a header of its own in each block on a phone.
function key(G, ser) {
  const { f, key: K } = G, ty = (y) => +(y + 0.35 * f).toFixed(1), n = (v) => +v.toFixed(1);
  const heads = (h) => h.texts.map((s, i) => sv('text', { class: 'pft-tk', 'data-look': 'time.tk', x: n(h.colR[i]), y: ty(h.y), 'text-anchor': 'end' }, s));
  const out = [];
  if (K.head) out.push(sv('g', { class: 'pft-key' }, heads(K.head)));
  for (const b of K.blocks) {
    const v = verdictOf(b.p), star = b.p.pace ? '*' : '';
    out.push(sv('g', { class: 'pft-key' },
      sv('circle', { class: 'pcv-dot', 'data-look': 'cv.dot', 'data-p-c': tokName(b.p.c), cx: n(b.x + 0.4 * f), cy: n(b.nameY), r: 0.36 * f }),
      sv('text', { 'data-look': 'time.key.text', 'data-p-c': tokName(b.p.c), x: n(b.x + 1.15 * f), y: ty(b.nameY) }, b.p.name + star),
      sv('text', { 'data-look': 'time.key.text', 'data-p-c': v.ok ? OK : BAD, x: n(b.colR[2]), y: ty(b.nameY), 'text-anchor': 'end' }, v.text),
      b.head ? heads(b.head) : null,
      b.rows.map((row) => [sv('text', { class: 'pft-tk', 'data-look': 'time.tk', x: n(b.x + 1.15 * f), y: ty(row.y) }, row.label),
        [0, 12, 24].map((m, i) => { const val = at(b.p, m, row.k); return val == null ? null : sv('text', row.k === 'hvpg' ? { 'data-look': 'time.key.text', 'data-p-c': tokName(b.p.c), x: n(b.colR[i]), y: ty(row.y), 'text-anchor': 'end' }
          : { 'data-look': 'time.grid.text', 'data-p-c': i ? 'text-2' : 'text-3', x: n(b.colR[i]), y: ty(row.y), 'text-anchor': 'end' }, FMT[row.k](val)); })])));
  }
  return out;
}

/** The slide's panel: a box the chart is drawn in at its width (the height follows from the layout), and its drawing once the numbers are there. */
export function allPatientsVisual(s, ctx) {
  const box = document.createElement('div');
  box.className = 'pz-visual pzap-wrap';
  const el = document.createElement('div');
  el.className = 'pzap-plot';
  box.append(el);
  const gl = createSvgGL(el, { host: 'curve' });
  const foot = [s.chartFoot || []].flat().filter((t) => typeof t === 'string');
  let ser = haveOf(s, ctx), W = 0, drawn = '', parts = null;
  // (A panel the slide has left is not in the page: nothing is drawn for it, and the picture is already let go with the panel, presenter.js dropCharts.)
  const live = () => el.isConnected;
  function redraw(fade) {
    if (!W || !live()) return;
    const sig = `${Math.round(W)}|${ser ? 1 : 0}`;
    if (sig === drawn && !fade) return;
    drawn = sig;
    try { const cx = chartCtx(el); delete cx.svk; gl.setCtx(cx); } catch { /* (not in a card yet: the sizes as they stand) */ }
    const old = parts;
    parts = build(W, ser, foot);
    gl.setCtx({ px: parts.G.f });   // (the type the layout was made for, the base an `em` is in)
    el.style.height = `${parts.H}px`;
    gl.show(parts.svg, !!(fade && old));
  }
  // (The width is read once the box is laid out and again when it changes, in a rest pass, never in a frame.)
  const measure = () => { const w = Math.round(readBox(el)?.width || 0); if (w && w !== W) { W = w; redraw(false); } };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (live()) restPass(measure); }).observe(el);
  restPass(measure);
  const p = ser ? null : seriesWork(s, ctx);
  const arrive = (q) => q.then((r) => { if (r && live() && !ser) { ser = r; drawn = ''; redraw(true); } }, () => {});
  if (p) arrive(p);
  // (The first look at the card finds the numbers not yet in: asked again until they are, as a plane's rows are.)
  let tries = 0;
  const again = () => {
    if (ser || !live() || tries++ > 100) return;
    const q = seriesWork(s, ctx);
    if (q) arrive(q); else setTimeout(again, 300);
  };
  if (!p) setTimeout(again, 60);   // (the panel is put in the page just after this returns)
  return box;
}
