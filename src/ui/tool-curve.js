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
//
// Relation charts (the slide before a deck's summary, 26 Oct; review/relation-chart-ideas/recommendations.md):
//   x: 'lsm'          the x axis is a reading (a fingerprint key, named and scaled as its tile), not the setting: the sweep
//                     still runs underneath (param, from, to) and each point is plotted reading against reading. The axis runs
//                     over nice numbers round the points (xFrom, xTo to set them).
//   days: 365         each point starts from the slide's own state, its setting changed, and runs that many model days, so the
//                     slow readings (spleen, platelets, varix, ascites) reach their level. Without days a point settles only.
//   points: [{ params?, action?, days? }, …]
//                     in place of param/from/to: each point its own change from the slide's state (an action such as a
//                     hemorrhage, for a curve over blood lost); needs x.
//   xCuts: [15, 25]   the x reading's cut-offs as upright dashes in their rating's colour, named at the top ("15 kPa");
//                     true for every cut-off of its tile.
//   readout: 'ring'  with a reading on x and two lines the case's values stand in the key row above the chart ("Varix 5.3 mm", "Wall
//                     stress 72 % of tear") and the rings carry no words beside them, which the dots and walks leave no clear spot for;
//                     'ring' puts them beside the rings as every other chart does.
//   ring: false      no ring for the slide's own case (no ring, tick or value for it, nothing in the key row but the names): for a chart whose
//                     slide has no state of its own to mark, where the dots are the story and a ring would float off the line.
//   cutTicks: true   with a list of cuts: [1.5, 5], hold them as coloured numbers on the left axis as cuts: 'ticks' does; where no even scale holds them
//                     the axis numbers are the baseline and the cut-offs themselves (0, 1.5, 5 for the ascites).
//   cutNames: { 1.5: 'Grade 2', 5: 'Grade 3' }
//                     names for the first line's cut-offs: "Grade 2 ≥1.5 L" over a dashed line in place of "Ascites 1.5", or just "Grade 2" over
//                     the gridline of a cut-off held as a number. (The HVPG 10 line is always "CSPH ≥10", and an HVPG axis is spelled
//                     "HVPG (wedged − free), mmHg": a plain reading of what the axis is.)
//   dot names         each beside its dot on the nearest clear spot, a thin leader joining one that stood off. When they cannot all sit
//                     close and clear (a crowd of visits), the dots carry the numbers 1, 2, 3 in order and a key under the chart names them.
//   cuts: [10] | false | 'ticks'
//                     the first line's cut-offs (its tile's by default), or none. 'ticks': each one is a coloured number on the left
//                     axis with a short stub, the scale chosen to hold it, in place of a dashed line and its name across the chart (a
//                     cut-off the scale cannot hold keeps its dashed line).
//   dots: [{ slide: 'a1', name: 'Case 1' } | { preset: 'rhf', name: 'Heart failure', params?, days? }, …]
//                     other states as small filled points on each line (on: [0] for the first line only), named beside the
//                     first; with walk: true joined in order by a faint line, a patient's visits along the curve, or, with a dot's own
//                     walk: 'first', each name's dots (in order) on a line of their own, for two patients on one chart. Needs x. A small
//                     arrowhead on the middle of each step of a walk points the way he went.
//   patient: { preset: 'healthy', params?, presetDays? }
//                     the curve is drawn on that patient (loaded afresh for each point) rather than on the slide's own; the
//                     ring stays the slide's case, which may sit off the line.
//   oneScale: true    both lines on the left scale (a flat line keeps its true size).
//   against: [{ label, params, pair?, of? }, …]
//                     up to two second sweeps. With x, each line's points are read against its own sweep's x reading, or
//                     with pair: true against the slide's own sweep's (the HVPG before a drug, the HVPG on it). When the own
//                     line is the x reading itself it is drawn as the dashed "no change" diagonal, named `own`, with no ring.
//                     With of: 'varix' that sweep draws another reading (the fundal varix with the shunt open, the esophageal
//                     varix with it closed), on the same scale as the first, so the two share a unit; reading: 'Varix' then
//                     names the card, the key row and the cut-offs, which would otherwise carry the first reading's name.
//   param: 'scope.air' (from 0, to 20), lines: ['seen', 'across']
//                     a curve over the scope's air in the esophagus, an instrument option, not a model setting: worked out from
//                     the slide's own varix as the scope works it (the size seen, the pressure across the wall), nothing run.
//   zone: { fall: 10, under: 12, label: 'Response' }
//                     a soft band in the ok colour under y = max(under, x less fall %), dashed along its top and named in it.

import { TILE, SCALE, RATE } from './table-marks.js?v=bca5ebb624';
import { frameFor } from './frame.js?v=7254a8a850';
import { plotPanel } from './plot-look.js?v=5037697da7';
import { airRatio } from './endo-size.js?v=e0a58bf20e';
import { NODES } from '../engine/topology.js?v=4044766e96';
const nextFrame = frameFor('tool-curve');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const CV_MIN = 12;   // (px on the screen: the smallest the chart's words are drawn)
const MAX_PTS = 41;

// The settings a curve knows by name: the axis's words, its unit, its decimals and a scale on the model's value.
export const PARAM = {
  'thrombus.PV_TRUNK': ['Portal vein clot', '%', 0, 100], 'stenosis.TIPS': ['Stent narrowing', '%', 0, 100], habrStrength: ['Arterial buffer', '%', 0, 100],
  'tips.d': ['TIPS diameter', 'mm', 0], 'dips.d': ['DIPS diameter', 'mm', 0],
  cirrhosis: ['Cirrhosis', '%', 0, 100], gestation: ['Weeks pregnant', 'weeks', 0], albumin: ['Serum albumin', 'g/dL', 1],
  splanchnicTone: ['Splanchnic tone', '×', 2], systemicTone: ['Systemic tone', '×', 2], contractility: ['Right heart contractility', '×', 2],
  'scope.air': ['Air in the esophagus', 'mmHg', 0],
  tr: ['Tricuspid regurgitation', '%', 0, 100], pericardial: ['Pericardial constraint', '%', 0, 100], apShunt: ['Arterioportal shunting', '%', 0, 100],
};
// Readings a chart can draw that have no tile: the varix wall's stress, as a share of the point where it tears; and on a curve
// over the scope's air (param 'scope.air'), the varix's diameter as the scope sees it and the pressure across its wall.
const LINE_ONLY = { wall: { t: 'Wall stress', u: '% of tear', x: 100, d: 0 }, seen: { t: 'Varix seen', u: 'mm', d: 1 }, across: { t: 'Across the wall', u: 'mmHg', d: 1 } };
// A line's colour by reading (the app's trace colours); any other reading takes its place's.
const COLOR = { ppg: '--tr-pv', pv: '--tr-pv', hvpg: '--tr-wedge', whvp: '--tr-wedge', sin: '--tr-wedge', fhvp: '--tr-hv', ivc: '--tr-ivc', ra: '--tr-ra', varix: '--tr-var', seen: '--tr-var', wall: '--tr-cav', across: '--tr-cav', liver: '--tr-hv', pvFlow: '--tr-hv', shunt: '--tr-cav' };
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
/** The x reading's key (x: a fingerprint key with a tile), or null for a curve across its setting. */
export const xKeyOf = (t) => (typeof t?.x === 'string' && (TILE[t.x] || LINE_ONLY[t.x]) ? t.x : null);
/** The changes along the curve: each point's { params?, action?, days? } (the setting's values, or the slide's own list). */
function pointSteps(t, also) {
  const days = +t.days > 0 ? Math.round(+t.days) : 0, pt = patientOf(t);
  // (On a patient of its own, each point loads that patient afresh: its preset, then its params under the point's own.)
  const on = (st) => (pt ? { preset: pt.preset, presetDays: pt.presetDays, ...st, params: mergeOf(pt.params, st.params), restart: true } : st);
  if (Array.isArray(t.points) && xKeyOf(t)) return t.points.slice(0, MAX_PTS).map((q) => on({ ...q, params: mergeOf(also, q?.params), restart: true }));
  return curveXs(t).map((x) => on({ params: patchOf(t.param, x, also), ...(days ? { days, restart: true } : {}) }));
}
/** The patient the curve is drawn on, when not the slide's own: { preset, params?, presetDays? }, or null. */
export const patientOf = (t) => (typeof t?.patient?.preset === 'string' ? t.patient : null);
/** Whether the curve runs over the scope's air (param 'scope.air'): an instrument option, the model untouched. */
export const overScope = (t) => pathOf(t?.param)[0] === 'scope';
const VAR = NODES.findIndex((n) => n.id === 'VAR');
/** A curve over the scope's air, worked out from the slide's own reading as the scope works it (instruments.js): at each air
 *  pressure the varix seen (its size at rest times the model's share for that air, endo-size.js airRatio) and the pressure
 *  across its wall (the pressure inside less the air's). States as a run gives them, or null without the slide's reading. */
export function scopeStates(t, fp) {
  const pIn = fp?.at?.P?.[VAR];
  if (!Number.isFinite(fp?.varix) || !Number.isFinite(pIn)) return null;
  return curveXs(t).map((a) => ({ fp: { seen: fp.varix * airRatio(fp.varixAir, a), across: pIn - a } }));
}
/** The steps for ctx.run: each point the slide's state with the setting changed (every step carries its full patch, so no
 *  point depends on the one before; with days or points each starts again from the slide's state). */
export const curveSteps = (t) => {
  const ags = againstsOf(t), own = pointSteps(t, t.also);
  // (Each second sweep starts again from the slide's state, so one sweep's params never carry into the next.)
  return [...own, ...ags.flatMap((a) => pointSteps(t, mergeOf(t.also, a.params)).map((st, i) => (i ? st : { ...st, restart: true })))];
};
/** The second sweeps: [{ label, params, pair }] (one or two, each with a label and a params object). */
export function againstsOf(t) {
  return [].concat(t?.against || []).filter((a) => a && typeof a.label === 'string' && a.label && a.params && typeof a.params === 'object' && !Array.isArray(a.params))
    .slice(0, 2).map((a) => ({ label: a.label, params: a.params, pair: !!a.pair, of: typeof a.of === 'string' && (TILE[a.of] || LINE_ONLY[a.of]) ? a.of : null }));
}
/** The second sweep's { label, params, own }, or null: needs a label and a params object. */
export function againstOf(t) {
  const a = againstsOf(t)[0];
  if (!a) return null;
  const own = [].concat(t.against).find((x) => typeof x?.own === 'string' && x.own)?.own;
  return { label: a.label, params: a.params, own: own || 'This case' };
}
/** b merged over a (objects key by key, anything else replaced), a fresh copy. */
export function mergeOf(a, b) {
  const out = a && typeof a === 'object' ? structuredClone(a) : {};
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? mergeOf(out[k], v) : structuredClone(v);
  return out;
}
/** The readings plotted (one or two fingerprint keys; one, drawn once per sweep, with against). */
export const curveLines = (t) => [].concat(t.lines || 'ppg').filter((k) => typeof k === 'string').slice(0, againstOf(t) ? 1 : 2);
/** Whether the own line is the x reading itself (the diagonal where nothing changed). */
export const ownIsRef = (t) => !!againstOf(t) && !!xKeyOf(t) && curveLines(t)[0] === xKeyOf(t);
const AG_C = ['--tr-pv', '--tr-hv'];
/** The lines drawn: each reading's meta, or with against the one reading once per sweep, named and coloured by its sweep. */
export function drawnLines(t) {
  const ls = curveLines(t).map(lineMeta), ag = againstOf(t);
  if (!ag) return ls;
  const l = ls[0], ags = againstsOf(t), of = (a) => (a.of ? lineMeta(a.of) : l);   // (a sweep may draw another reading, of)
  if (ownIsRef(t)) return [{ ...l, name: ag.own, c: '--text-3', ref: true }, ...ags.map((a, j) => ({ ...of(a), name: a.label, c: AG_C[j] }))];
  if (ags.length > 1) return [{ ...l, name: ag.own }, ...ags.map((a, j) => ({ ...of(a), name: a.label, c: [l.c === '--tr-hv' ? '--tr-pv' : '--tr-hv', '--tr-cav'][j] }))];
  return [{ ...l, name: ag.own }, { ...of(ags[0]), name: ag.label, c: l.c === '--tr-hv' ? '--tr-pv' : '--tr-hv' }];
}
/** The name the key row and the cut-offs carry when sweeps draw different readings: the slide's `reading`, else the first's own. */
export const readingName = (t) => (typeof t?.reading === 'string' && t.reading ? t.reading : lineMeta(curveLines(t)[0]).name);
/** A reading's name, unit, decimals, scale and colour (from its tile). */
export function lineMeta(k, j = 0) {
  const tl = TILE[k] || LINE_ONLY[k] || {};
  return { k, name: (tl.t?.length <= 14 ? tl.t : tl.n || tl.t) || k, unit: tl.u || '', d: tl.d ?? 1, x: tl.x ?? 1, c: COLOR[k] || PLACE[j] || PLACE[0] };
}
/** The x axis's words, unit, decimals and scale. */
export function axisMeta(t) {
  const xk = xKeyOf(t);
  if (xk) { const m = lineMeta(xk); return { name: t.label || TILE[xk]?.t || m.name, unit: t.unit ?? m.unit, d: m.d, x: m.x, k: xk }; }
  const p = PARAM[t.param] || [];
  return { name: t.label || p[0] || pathOf(t.param).at(-1) || '', unit: t.unit ?? p[1] ?? '', d: p[2] ?? (curveXs(t).some((x) => x % 1) ? 1 : 0), x: p[3] ?? 1 };
}
const valOf = (s, l) => (Number.isFinite(s?.fp?.[l.k]) ? s.fp[l.k] * l.x : null);
/** The series: { xs, ys: [[…] per line] } in shown units, from the run's states (null where a point failed). With x, also lx: each
 *  line's own xs, every line in order of x (a point with no reading left out). */
export function curveSeries(t, states) {
  const ls = curveLines(t).map(lineMeta), ax = axisMeta(t), ags = againstsOf(t), xk = xKeyOf(t);
  const n = xk && Array.isArray(t.points) ? Math.min(MAX_PTS, t.points.length) : curveXs(t).length, sweeps = 1 + ags.length;
  if (!n || !Array.isArray(states) || states.length !== n * sweeps) return null;
  const part = (h) => states.slice(h * n, (h + 1) * n);
  const yss = ags.length ? Array.from({ length: sweeps }, (_, h) => { const l = h && ags[h - 1].of ? lineMeta(ags[h - 1].of) : ls[0]; return part(h).map((s) => valOf(s, l)); }) : ls.map((l) => states.map((s) => valOf(s, l)));
  if (!xk) return { xs: curveXs(t).map((x) => x * ax.x), ys: yss };
  const xm = lineMeta(xk), own = part(0).map((s) => valOf(s, xm));
  const lxs = yss.map((_, j) => (ags.length ? (j && !ags[j - 1].pair ? part(j).map((s) => valOf(s, xm)) : own) : own));
  const lx = [], ys = [];
  yss.forEach((yv, j) => {
    const pts = yv.map((y, i) => [lxs[j][i], y]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0]);
    lx.push(pts.map((p) => p[0])); ys.push(pts.map((p) => p[1]));
  });
  return { xs: lx[0], ys, lx };
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
export function leftScale(k, vals, most = 7, must = [], loose = false) {
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
  // (With must, the cut-offs inside the values that a chart wants as numbers on the axis: a scale holding every one of them wins, halves
  // allowed when one of them is a half.)
  const want = must.filter((c) => c >= a - 1e-9 && c <= b + 1e-9), half = want.some((c) => Math.abs(c - Math.round(c)) > 1e-9);
  let best = null;
  for (const gaps of [3, 4, 5, 6]) {
    const bh = b + 0.06 * (b - a), step = niceStep((b - a) / gaps), lo = Math.floor(a / step + 1e-9) * step, n = Math.max(2, Math.ceil((bh - lo) / step - 1e-9) + 1);
    const top = lo + step * (n - 1), waste = (top - b) / (b - a);
    if (n > most) continue;
    const held = want.filter((c) => Math.abs((c - lo) / step - Math.round((c - lo) / step)) < 1e-6).length;
    const score = waste + (b - a >= 4 && step % 1 && !half ? 0.5 : 0) + 0.6 * (want.length - held);
    if (!best || score < best.score + 1e-9) best = { score, ticks: ticksOf(lo, step, n) };   // (a tie goes to more numbers)
  }
  // (loose: cut-offs no even scale can hold (ascites 1.5 and 5) are the numbers themselves, the baseline and then each cut-off, uneven, the top a
  // half over the values: 0, 1.5, 5 on a scale to 6.)
  if (loose && want.length && want.some((c) => !best?.ticks.some((v) => Math.abs(v - c) < 1e-6))) {
    const st = niceStep((b - a) / 4), lo = a >= 0 && a <= (b - a) / 3 ? 0 : +(Math.floor(a / st + 1e-9) * st).toPrecision(8), top = Math.max(+want.at(-1), Math.ceil((b + 0.05 * (b - a)) * 2 - 1e-9) / 2);
    if (lo < want[0] - 1e-9) return { min: lo, max: top, ticks: [lo, ...want] };
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
/** An axis number: a whole number stays whole whatever the axis's decimals (0, 5, 10, not 0.0, 5.0, 10.0). */
export const fmtTick = (v, d) => fmt(v, Math.abs(v - Math.round(v)) < 1e-6 ? 0 : d);
const cw = (t, f, b) => String(t).length * f * (b ? 0.6 : 0.56);   // (a text's width, near enough: laid out before it is drawn)
/** The x axis's name as written under the numbers: the unit after it unless the name already holds it. */
export const xAxisName = (ax) => (ax.unit && ax.unit !== '×' && !ax.name.toLowerCase().includes(ax.unit.toLowerCase()) ? `${ax.name}, ${ax.unit}` : ax.name);
/** An axis named by an abbreviation is written out as the app defines it ("HVPG (wedged − free), mmHg"), so the axis reads plainly to
 *  anyone: the x axis's meta with its words spelled out (the same object when there is nothing to add). */
const X_SPELT = { hvpg: 'HVPG (wedged − free)', ppg: 'PPG (portal − IVC)' };
export const spellAxis = (ax) => (X_SPELT[ax.k] ? { ...ax, name: X_SPELT[ax.k] } : ax);
/** The name a cut-off on the x reading goes by on the chart, or '': the HVPG 10 line is the CSPH line ("CSPH ≥10"). */
export const xCutName = (k, v) => (k === 'hvpg' && Math.abs(v - 10) < 1e-6 ? 'CSPH' : '');
/** The x axis's numbers and where its name stands (his G2 look, 27 Oct: the name on the numbers' row, as the planes' x name is, so the plot gains
 *  the row it had of its own). The name takes the widest stretch between the numbers (each 6 px clear, and 8 px in from the panel's edges) when it
 *  fits there with at least three numbers kept: the most numbers that leave it room, `most` at the most. { xt, nameAt }: nameAt the name's centre
 *  in px, null where it fits nowhere (it then stands on a row of its own under the numbers, centred, with the numbers `most` at the most). */
export function xAxisRow(x0, x1, L, R, w, f, ax, most) {
  const nameW = cw(xAxisName(ax), f, 1), at = (v) => L + (R - L) * (v - x0) / ((x1 - x0) || 1);
  for (let m = most; m >= 3; m--) {
    const ts = xTicks(x0, x1, m);
    if (ts.length < 3) continue;
    const boxes = ts.map((v) => { const x = at(v), tw = cw(fmtTick(v, ax.d), f); return x <= L + 1 ? [x, x + tw] : x >= R - 1 ? [x - tw, x] : [x - tw / 2, x + tw / 2]; });
    let best = null;
    for (const [a, b] of [...boxes.map((q, i) => [i ? boxes[i - 1][1] + 6 : 8, q[0] - 6]), [boxes.at(-1)[1] + 6, w - 8]]) {
      if (b - a >= nameW && (!best || b - a > best[1] - best[0])) best = [a, b];
    }
    if (best) return { xt: ts, nameAt: (best[0] + best[1]) / 2 };
  }
  return { xt: xTicks(x0, x1, most), nameAt: null };
}

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
    // (near.hard: a spot that lands on anything loses to any that lands on nothing, however far that one is.)
    const cost = (near?.hard && n ? 1e3 : 0) + n + (near ? near.k * Math.hypot(Math.max(0, box[0] - near.x, near.x - box[2]), Math.max(0, box[1] - near.y, near.y - box[3])) : 0);
    if (!best || cost < best.cost) best = { ...c, box, n, cost };
    if (!near && n === 0) break;
  }
  return best;
}

/** Whether the segments a–b and c–d cross (end to end of each, not just touching). */
const segsCross = ([ax, ay, bx, by], [cx, cy, dx, dy]) => {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
};
/** Whether the dots' names, as placeDotNames put them, are a crowd: one with no clear spot, or a leader longer than two and a half
 *  lines of type, or a leader that crosses a line. Then the dots carry numbers and a key names them. */
export const namesCrowded = (spots, f) => spots.some((q) => !q.ok || (q.lead && (Math.hypot(q.lead[2] - q.lead[0], q.lead[3] - q.lead[1]) > 2.5 * f || q.cross > 0)));
/** The arrowhead on a walk's step from p to q (points [x, y] in px): a small triangle on the middle of the step, pointing the way he went.
 *  { d, seg }: the path, and a short segment through it for the words to keep off; null when the step is too short to hold it clear of
 *  both dots (dr, a dot's radius). f is the type size, which the head grows with. */
export function walkArrow(p, q, dr, f) {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), k = Math.max(1, f / 12), hl = 9 * k, hw = 4.2 * k;
  if (len < 2 * dr + 2 * hl + 6) return null;
  const ux = dx / len, uy = dy / len, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, n = (v) => v.toFixed(1);
  const tip = [mx + ux * hl / 2, my + uy * hl / 2], bx = mx - ux * hl / 2, by = my - uy * hl / 2;
  return { d: `M${n(tip[0])} ${n(tip[1])}L${n(bx - uy * hw)} ${n(by + ux * hw)}L${n(bx + uy * hw)} ${n(by - ux * hw)}Z`, seg: [bx, by, tip[0], tip[1]] };
}
const DOT_ANGLES = [0, 180, 270, 90, 315, 225, 45, 135, 340, 200, 20, 160, 295, 245, 65, 115];   // (degrees from the right, clockwise on the screen)
/** The names of the dots, each beside its dot: items [{ x, y, w }] (the dot's centre and its name's width), f the type size, half the
 *  dot's clear box (a dot is a box 2 × half wide to every word). Each name takes the nearest spot, round the dot at a few distances and
 *  sixteen angles, that lands on nothing (no word, data line, walk, dot, ring, cut-off, or the chart's edge), and past a short way from
 *  its dot a thin leader joins them; the leader keeps off every other word too. The most hemmed-in dots choose first. A name with no
 *  clear spot is left out (ok: false), never drawn over something. Returns, in item order, { x, y, anchor, box, lead, ok, cross } (cross:
 *  how many lines its leader crosses, weighted). */
export function placeDotNames(items, f, half, ob) {
  const boxes = [...(ob.boxes || [])], segs = [...(ob.segs || [])], lim = ob.inside, out = new Array(items.length);
  const o = half + 3, gap = half + 4;   // (the word's padded box starts at the dot's box; a leader past a short way)
  const spotsOf = (it) => {
    const cs = [];
    for (const r of [o, o + 0.7 * f, o + 1.5 * f, o + 2.5 * f, o + 3.6 * f, o + 5 * f, o + 7 * f, o + 9.5 * f, o + 12.5 * f]) for (const a of DOT_ANGLES) {
      const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180), px = it.x + r * c, py = it.y + r * s;
      const anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
      cs.push({ x: px, y: s > 0.35 ? py + 0.9 * f : s < -0.35 ? py - 0.2 * f : py + 0.35 * f, anchor });
    }
    return cs;
  };
  const trial = (it, c, bx, sg) => {
    let x0 = c.anchor === 'end' ? c.x - it.w : c.anchor === 'middle' ? c.x - it.w / 2 : c.x, y = c.y;
    if (lim) {
      const dx = clamp(x0 - 3, lim[0], Math.max(lim[0], lim[2] - it.w - 6)) - (x0 - 3), dy = clamp(y - 0.85 * f - 1, lim[1], Math.max(lim[1], lim[3] - 1.15 * f - 2)) - (y - 0.85 * f - 1);
      x0 += dx; y += dy;
    }
    const box = [x0 - 3, y - 0.85 * f - 1, x0 + it.w + 3, y + 0.3 * f + 1], rect = [x0, y - 0.8 * f, x0 + it.w, y + 0.25 * f];
    const qx = clamp(it.x, rect[0], rect[2]), qy = clamp(it.y, rect[1], rect[3]), d = Math.hypot(qx - it.x, qy - it.y);
    const lead = d > gap ? [it.x + (qx - it.x) / d * (half - 1), it.y + (qy - it.y) / d * (half - 1), qx, qy] : null;
    let n = boxScore(box, { ...ob, boxes: bx, segs: sg });
    // (A leader may not run across another word, and each line it crosses costs a little: a data line or another leader a bit more
    // than the upright cut-off line.)
    let cross = 0;
    if (lead) {
      for (const b of bx) if (segHits(lead, b) && !hitBox(b, [it.x - half, it.y - half, it.x + half, it.y + half])) n += 3;
      for (const q of sg) if (q.w !== 3 && segsCross(lead, q)) cross += q.w === 5 ? 0.4 : 0.8;
    }
    return { x: x0, y, anchor: 'start', box, lead, n, d, cross };
  };
  const hemmed = items.map((it) => spotsOf(it).filter((c) => trial(it, c, boxes, segs).n === 0).length);
  items.map((_, i) => i).sort((a, b) => hemmed[a] - hemmed[b] || a - b).forEach((i) => {
    const it = items[i];
    let best = null;
    for (const c of spotsOf(it)) {
      const t = trial(it, c, boxes, segs), cost = (t.n ? 1e3 + t.n : 0) + t.d + (t.lead ? 0.6 * f : 0) + t.cross * f;
      if (!best || cost < best.cost) best = { ...t, cost, anchor: c.anchor, at: c };
    }
    const ok = !!best && best.n === 0;
    // (Drawn from its left edge, middle or right edge as its spot says; x is the text's anchor point.)
    const ax = best.anchor === 'end' ? best.box[2] - 3 : best.anchor === 'middle' ? (best.box[0] + best.box[2]) / 2 : best.box[0] + 3;
    out[i] = { x: ax, y: best.y, anchor: best.anchor, box: best.box, lead: ok ? best.lead : null, ok, cross: best.cross };
    if (ok) { boxes.push(best.box); if (best.lead) segs.push(Object.assign([...best.lead], { w: 2 })); }
  });
  return out;
}

/** The x the slide's case sits at, and each line's value there (shown units): from the live params and fingerprint while a
 *  what-if slider or compare button drives the model, else the slide's own. */
export function ringAt(t, params, fp) {
  // (ring: false: the slide marks no case of its own, so no ring on any line.)
  if (t?.ring === false) return { x: null, ys: drawnLines(t).map(() => null) };
  const ax = axisMeta(t), xk = xKeyOf(t), x = xk ? fp?.[xk] : getAt(params, t.param);
  const ys = curveLines(t).map((k) => (Number.isFinite(fp?.[k]) ? fp[k] * lineMeta(k).x : null));
  // (With against the other lines' rings are read from their curves; the diagonal has none.)
  const n = drawnLines(t).length;
  return { x: Number.isFinite(+x) && x !== null ? +x * ax.x : null, ys: againstOf(t) ? [ownIsRef(t) ? null : ys[0], ...Array(n - 1).fill(null)] : ys };
}

/** Whether params are the slide's own (base) with only the curve's setting moved: then the case sits on the curve. */
export function onCurve(t, params, base) {
  if (!params || !base || !t.param || Array.isArray(t.points) || +t.days > 0 || patientOf(t) || overScope(t)) return false;
  const a = structuredClone(params), keys = pathOf(t.param);
  let at = a;
  for (const k of keys.slice(0, -1)) { if (!at[k] || typeof at[k] !== 'object') return false; at = at[k]; }
  at[keys.at(-1)] = getAt(base, t.param);
  if (keys.length === 2 && (keys[0] === 'tips' || keys[0] === 'dips') && keys[1] === 'd') at.on = getAt(base, `${keys[0]}.on`);
  return JSON.stringify(a) === JSON.stringify(base);
}
const lerpAt = (xs, ys, x) => {
  if (!(x >= xs[0] && x <= xs.at(-1))) return null;
  let i = 1; while (i < xs.length - 1 && xs[i] < x) i++;
  const u = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
  return Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i]) ? ys[i - 1] + (ys[i] - ys[i - 1]) * u : null;
};
/** Each line's value on the curve at x (shown units), read between its two nearest points (with lx, each on its own xs). */
export function curveAt(ser, x) {
  if (ser.lx) return ser.ys.map((ys, j) => lerpAt(ser.lx[j], ys, x));
  const xs = ser.xs;
  if (!(x >= xs[0] && x <= xs.at(-1))) return null;
  return ser.ys.map((ys) => lerpAt(xs, ys, x));
}

/** An x axis round a reading's values: nice numbers just outside them, about five steps (from zero for a reading that is never
 *  below it, when zero lies within a third of the range again). from/to (shown units) set either end. */
export function xDomain(vals, from = null, to = null) {
  const v = vals.filter(Number.isFinite);
  let a = v.length ? Math.min(...v) : 0, b = v.length ? Math.max(...v) : 1;
  if (b - a < 1e-6) { a -= 1; b += 1; }
  const step = niceStep((b - a) / 5);
  let lo = Math.floor(a / step + 1e-9) * step, hi = Math.ceil(b / step - 1e-9) * step;
  if (a >= 0 && lo > 0 && lo <= (hi - lo) / 3 + 1e-9) lo = 0;
  return [Number.isFinite(+from) && from !== null ? +from : +lo.toPrecision(8), Number.isFinite(+to) && to !== null ? +to : +hi.toPrecision(8)];
}
/** The first line's cut-offs: its tile's (cutsOf), or the slide's list (each with its rating from the tile), or none. */
export function yCutsOf(t, k) {
  if (t.cuts === false) return [];
  const all = cutsOf(k);
  if (!Array.isArray(t.cuts)) return all;
  return t.cuts.filter(Number.isFinite).map((v) => all.find((c) => Math.abs(c.v - v) < 1e-6) || { v, rate: 'mid' });
}
/** The x reading's cut-offs (xCuts: a list, or true for its tile's), each with its rating. */
export function xCutsOf(t) {
  const k = xKeyOf(t);
  if (!k || !t.xCuts) return [];
  const all = cutsOf(k);
  return t.xCuts === true ? all : [].concat(t.xCuts).filter(Number.isFinite).map((v) => all.find((c) => Math.abs(c.v - v) < 1e-6) || { v, rate: 'mid' });
}
/** The zone's top edge from x0 to x1 (shown units): y = max(under, x less fall %), its corner where the two meet. */
export function zoneEdge(z, x0, x1) {
  if (!z || !(+z.fall >= 0) || !Number.isFinite(+z.under)) return null;
  const k = 1 - +z.fall / 100, yAt = (x) => Math.max(+z.under, x * k), xs = [x0];
  const xc = k > 0 ? +z.under / k : Infinity;
  if (xc > x0 && xc < x1) xs.push(xc);
  xs.push(x1);
  return xs.map((x) => [x, yAt(x)]);
}
/** The other states shown as points: each { slide } or { preset, params?, presetDays?, days? } with its name. */
export const dotsOf = (t) => (xKeyOf(t) ? [].concat(t.dots || []).filter((d) => d && (typeof d.slide === 'string' || typeof d.preset === 'string')).slice(0, 8) : []);
/** The dots joined by a faint line, as lists of indices into dotsOf(t), in order: every dot with `walk: true` on the chart, else
 *  the dots that share a `walk` name (each name its own patient's visits). A walk of one dot draws nothing. */
export function walksOf(t) {
  const groups = new Map();
  dotsOf(t).forEach((d, i) => {
    const k = t.walk === true ? '' : typeof d.walk === 'string' && d.walk ? d.walk : null;
    if (k !== null) groups.set(k, [...(groups.get(k) || []), i]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
/** The steps that work out the dots made from a preset, each from a fresh model. */
export const dotSteps = (t) => dotsOf(t).filter((d) => !d.slide).map((d) => ({ preset: d.preset, params: d.params, presetDays: d.presetDays, days: d.days, restart: true }));

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

const curveKey = (tool, c) => JSON.stringify([c?.slide?.id ?? c?.index, tool]);
/** The curve's points and dots for a slide, worked out once per deck on the presenter's worker (a promise of { s, dd }), or null
 *  while the slide's state is not ready. */
function curveWork(t, c, myKey = curveKey(t, c)) {
  const store = keepOf(c.deck);
  let p = store.get(myKey);
  if (p) return p;
  if (!c.snap) return null;
  if (overScope(t)) {
    // (Nothing to run: the slide's own reading holds it all.)
    const st = scopeStates(t, c.fp);
    if (!st) return null;
    p = Promise.resolve({ s: curveSeries(t, st), dd: [] });
    store.set(myKey, p);
    return p;
  }
  const ds = dotsOf(t), dSteps = dotSteps(t);
  // (The dots from slides are their own states; those from a preset are worked out on a fresh model, after the curve.)
  p = Promise.all([c.run(curveSteps(t), patientOf(t) ? null : undefined).then((states) => curveSeries(t, states)), dSteps.length ? c.run(dSteps, null) : Promise.resolve([])]).then(([s, made]) => {
    if (!s) return null;
    let k = 0;
    const dd = ds.map((d) => ({ ...d, fp: d.slide ? c.fpOf?.(d.slide) ?? null : made?.[k++]?.fp ?? null }));
    return { s, dd };
  });
  store.set(myKey, p);
  p.then((s) => { if (!s) store.delete(myKey); }, () => store.delete(myKey));
  return p;
}
/** Starts a slide's curve once the deck's states are in, so a curve that runs model days (seconds of work) is ready when its
 *  slide comes up (presenter.js, after the deck's states). */
export function warmCurve(t, c) { if (t && c) curveWork(t, c)?.catch(() => null); }

export function createCurve() {
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const el = document.createElement('div');
  el.className = 'pz-curve';
  let t = null, ctx = null, ser = null, dots = [], parts = null, G = null, key = '', lastSz = '', raf = 0;
  let ring = null, goal = null;   // ({ x, ys } in shown units: where the rings are drawn, and where they glide to)

  const size = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? CV_MIN / z : 0);
    return [Math.max(160, w || 420), Math.max(8 * f, el.clientHeight || 240), f];
  };
  // A dot's place on line j (shown units), or null: with against every line is the one reading, so a dot sits once, on the first.
  const dotXY = (d, j, ls) => {
    const xk = xKeyOf(t), xm = lineMeta(xk), l = ls[j];
    if (!d.fp || (againstOf(t) && j) || (Array.isArray(d.on) && !d.on.includes(j))) return null;
    const x = d.fp[xk], y = d.fp[l.k];
    return Number.isFinite(x) && Number.isFinite(y) ? [x * xm.x, y * l.x] : null;
  };
  // The geometry for a chart w × h px in type f px, its scales from the series (or, until it is ready, from the slide's own
  // values and the axis's ends).
  // The dots that carry a name, in order, and the key that names them when they carry numbers: each "1 After the bleed", left to right
  // and wrapped to rows of the chart's width.
  const namedDots = () => { const ls = drawnLines(t); return dots.filter((d) => d.name && ls.some((_, j) => dotXY(d, j, ls))); };
  function stepKeyOf(w, f) {
    let x = 0, row = 0;
    const items = namedDots().map((d, k) => ({ n: k + 1, name: d.name, w: cw(String(k + 1), f, 1) + 0.45 * f + cw(d.name, f, 1) })).map((it) => {
      if (x > 0 && x + it.w > w) { row++; x = 0; }
      const at = { ...it, x, row }; x += it.w + 1.4 * f; return at;
    });
    return { items, rows: items.length ? row + 1 : 0 };
  }
  function geo(w, h, f, steps = false) {
    const ls = drawnLines(t), ax = spellAxis(axisMeta(t)), ag = !!againstOf(t), xk = xKeyOf(t);
    const vals0 = ls.map((l, j) => [...(ser ? ser.ys[j] : [(ring || goal)?.ys[j]]), ...dots.map((d) => dotXY(d, j, ls)?.[1])].filter(Number.isFinite));
    // (With against all lines are one reading on one scale, named on the lines; the key is only the reading and its unit. With
    // oneScale both readings share the left scale.)
    const one = ag || (!!t.oneScale && ls.length > 1);
    const vals = one ? [vals0.flat()] : vals0, keyLs = ag ? [{ ...lineMeta(curveLines(t)[0]), name: readingName(t), c: '--text-2', bare: true }] : ls;
    let x0, x1;
    if (xk) {
      const xv = [...(ser ? ser.lx.flat() : []), (ring || goal)?.x, ...dots.flatMap((d) => ls.map((_, j) => dotXY(d, j, ls)?.[0]))];
      [x0, x1] = xDomain(xv, t.xFrom, t.xTo);
    } else { const xs = curveXs(t).map((x) => x * ax.x); x0 = xs[0]; x1 = xs.at(-1); }
    // (A reading on x and two lines: the case's values stand in the key row, a value's room in each key.)
    const keyRead = false, kvW = 0;   // (no current-state readings in the key row: his 29 Oct, no more circles)
    const keys0 = keyLs.length < 2 || keyLs.reduce((a, l) => a + 22 + cw(l.name, f, 1) + 6 + cw(l.unit, f) + kvW, 0) + 2 * f <= w;
    // (With against, the lines' key that stands in when their names don't fit on the drawing takes a row of its own when
    // it would run into the reading's name and unit at the left.)
    const altW = ag ? ls.reduce((a, l) => a + 22 + 1.05 * cw(l.name, f, 1), 0) + f * (ls.length - 1) : 0;
    const altBelow = ag && cw(keyLs[0].name, f, 1) + 6 + cw(keyLs[0].unit, f) + altW + 2 * f > w;
    // (No more numbers up the side than fit a line and a half of type apart.)
    const stepKey = steps ? stepKeyOf(w, f) : null, stepH = stepKey?.rows ? stepKey.rows * 1.5 * f + 0.3 * f : 0;
    const plotH = h - 3.3 * f - stepH - ((keys0 && !altBelow ? 1 : 2) * 1.5 * f + 2 * f), most = clamp(Math.floor(plotH / (1.6 * f)) + 1, 3, 7);
    // (cuts: 'ticks': the first line's cut-offs ask the scale to hold them, to stand as coloured numbers on the axis.)
    // (cutTicks: with a list of cut-offs, as 'ticks' does for the tile's own; and the numbers are the cut-offs themselves where no even scale holds them.)
    const ticksOn = (t.cuts === 'ticks' || !!t.cutTicks) && !ag, sL = leftScale(ls[0].k, vals[0], most, ticksOn ? yCutsOf(t, ls[0].k).map((c) => c.v) : [], !!t.cutTicks), sR = ls[1] && !one ? rightScale(vals[1], sL.ticks.length) : null;
    const tickCuts = ticksOn ? yCutsOf(t, ls[0].k).filter((c) => sL.ticks.some((v) => Math.abs(v - c.v) < 1e-6)) : [];
    const keys = keyLs.map((l) => ({ ...l, w: (l.bare ? 0 : 22) + cw(l.name, f, 1) + 6 + cw(l.unit, f) + kvW }));
    const oneRow = keys.length < 2 || keys[0].w + keys[1].w + 2 * f <= w, rowH = 1.5 * f, legH = (oneRow && !altBelow ? 1 : 2) * rowH;
    const tw = (sc) => Math.max(...sc.ticks.map((v) => cw(fmtTick(v, dec(sc)), f)));
    const most0 = Math.max(2, Math.min(7, Math.floor((w - 4 * f) / (3.2 * f))));
    // (The plot is one rounded panel the chart's full width, his G2 look, plot-look.js: its numbers stand in the strips inside its edge, 8 px in from it, where no line runs.)
    const L = Math.ceil(tw(sL) + 14), R = Math.floor(w - (sR ? tw(sR) + 14 : 10));
    const { xt, nameAt } = xAxisRow(x0, x1, L, R, w, f, ax, most0);
    // (The panel's foot: 1.7 em under the axis when the x axis's name stands on the numbers' row, else 3.1 em with the name on a row of its own.)
    const foot = (nameAt == null ? 3.1 : 1.7) * f, T = legH + 2 * f, B = h - foot - 0.2 * f - stepH;
    return { w, h, f, ls, ag, one, ax, x0, x1, xt, nameAt, foot, sL, sR, tickCuts, keyRead, stepKey, keys, oneRow, altBelow, rowH, keyH: legH, L, R, T, B: Math.max(T + 3 * f, B) };
  }
  const X = (x) => G.L + (G.R - G.L) * (x - G.x0) / ((G.x1 - G.x0) || 1);
  const Yof = (sc) => (v) => G.B - (G.B - G.T) * clamp((v - sc.min) / ((sc.max - sc.min) || 1), 0, 1);
  const lineX = (j) => ser?.lx?.[j] || ser?.xs;
  // The data lines' segments on the screen (the diagonal's too: words keep off it).
  function lineSegs(YL, YR) {
    if (!ser) return [];
    return ser.ys.flatMap((ys, j) => { const Y = j && !G.one ? YR || YL : YL, xs = lineX(j), out = [];
      for (let i = 1; i < ys.length; i++) if (Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i])) out.push([X(xs[i - 1]), Y(ys[i - 1]), X(xs[i]), Y(ys[i])]);
      return out; });
  }
  function build() {
    const { f, L, R, T, B, sL, sR, ls, ax, xt } = G, YL = Yof(sL), YR = sR ? Yof(sR) : null;
    const tickC = G.one && !G.ag ? '--text-2' : ls[0].c;
    // (A cut-off held as a tick: its number in its rating's colour and bold, with a short stub of the colour inside the plot's edge;
    // the gridline stays the plain one.)
    const grid = sL.ticks.map((v, j) => { const tc = G.tickCuts.find((c) => Math.abs(c.v - v) < 1e-6);
      return sv('g', { class: 'ptk-grid' },
        sv('line', { x1: L, x2: R, y1: YL(v), y2: YL(v) }),
        tc ? sv('line', { class: 'pcv-stub', 'data-tc': tc.rate, x1: L, x2: L + 0.9 * f, y1: YL(v), y2: YL(v) }) : null,
        sv('text', { class: tc ? 'pcv-tc' : null, 'data-tc': tc?.rate, x: L - 6, y: YL(v) + 0.35 * f, 'text-anchor': 'end', style: tc ? null : `fill: var(${G.ag ? '--text-2' : tickC})` }, fmtTick(v, dec(sL))),
        sR ? sv('text', { x: R + 6, y: YL(v) + 0.35 * f, 'text-anchor': 'start', style: `fill: var(${ls[1].c})` }, fmtTick(sR.ticks[j], dec(sR))) : null); });
    // (A zone: the band under its edge in the ok colour, dashed along the top, its name placed on every paint.)
    let zone = null, zoneLab = null;
    const edge = zoneEdge(t.zone, G.x0, G.x1);
    if (edge) {
      const pts = edge.map(([x, y]) => [X(x), YL(clamp(y, sL.min, sL.max))]);
      const top = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
      zoneLab = typeof t.zone.label === 'string' && t.zone.label ? sv('text', { class: 'pcv-zone-t' }, t.zone.label) : null;
      zone = sv('g', { class: 'pcv-zone' }, sv('path', { class: 'pcv-zone-fill', d: `${top}L${pts.at(-1)[0].toFixed(1)} ${B}L${pts[0][0].toFixed(1)} ${B}Z` }),
        sv('path', { class: 'pcv-zone-edge', d: top }), zoneLab);
    }
    // (The first line's cut-offs, dashed in their rating's colour, where they fall inside its scale.)
    // (A cut-off held as a tick draws no dashed line, but a named one still writes its name, "Grade 2", over its gridline.)
    const held = (c) => G.tickCuts.some((q) => q.v === c.v);
    const cutVs = yCutsOf(t, ls[0].k).filter((c) => c.v > sL.min && c.v < sL.max && (!held(c) || t.cutNames?.[c.v]));
    // (Each named, "PPG 12", in its rating's colour: over its line at the right end, else at the left, else under it, clear
    // of the data lines and of the other's name.)
    // (Placed again on every paint, so a name also keeps clear of the rings and the dashed line through them. Measured wide:
    // capitals and figures run wider than the average letter.)
    const segs = lineSegs(YL, YR), cutLabs = [];
    const cuts = cutVs.map((c) => {
      const nm = t.cutNames?.[c.v], vtxt = fmt(c.v, Number.isInteger(c.v) ? 0 : 1), isHeld = held(c);
      // (A named cut-off reads "Grade 2 ≥1.5 L", or just "Grade 2" where its number already stands on the axis; an unnamed one "Ascites 1.5".)
      const y = YL(c.v), txt = nm ? (isHeld ? nm : `${nm} ≥${vtxt} ${ls[0].unit}`.trim()) : `${G.ag ? readingName(t) : ls[0].name} ${vtxt}`;
      const el = sv('text', { class: 'pcv-cut' }, txt);
      cutLabs.push({ el, tw: 1.12 * cw(txt, f, true), lines: cutVs.filter((o) => o !== c && !held(o)).map((o) => ({ y: YL(o.v), x0: L, x1: R })),
        // (Over the line; else on it, the dashes stopping round the words (a short chart's cut-offs stand close); else under.)
        cands: [{ x: R - 3, y: y - 0.35 * f, anchor: 'end' }, { x: L + 3, y: y - 0.35 * f, anchor: 'start' },
          { x: R - 3, y: y + 0.35 * f, anchor: 'end', on: true }, { x: L + 3, y: y + 0.35 * f, anchor: 'start', on: true },
          { x: R - 3, y: y + 1.05 * f, anchor: 'end' }, { x: L + 3, y: y + 1.05 * f, anchor: 'start' },
          // (A grade's name, which stands over a gridline with no dashes of its own, may also stand part of the way along when both ends are taken.)
          ...(isHeld ? [{ x: L + 0.3 * (R - L), y: y - 0.35 * f, anchor: 'start' }, { x: L + 0.55 * (R - L), y: y - 0.35 * f, anchor: 'start' }, { x: L + 0.3 * (R - L), y: y + 1.05 * f, anchor: 'start' }] : [])] });
      return sv('g', { class: 'ptk-grid cut', 'data-rate': c.rate }, isHeld ? null : sv('line', { x1: L, x2: R, y1: y, y2: y }), el);
    });
    // (The x reading's cut-offs, upright and dashed the same way, each named over the plot, "15 kPa".)
    const xCutLabs = [];
    const xCuts = xCutsOf(t).filter((c) => c.v > G.x0 && c.v < G.x1).map((c) => {
      // (The HVPG 10 line is named for what it marks, "CSPH ≥10"; any other reads as its number and unit.)
      const x = X(c.v), vtxt = fmt(c.v, Number.isInteger(c.v) ? 0 : 1), nm = xCutName(G.ax.k, c.v), txt = nm ? `${nm} ≥${vtxt}` : `${vtxt} ${ax.unit}`.trim(), el = sv('text', { class: 'pcv-cut' }, txt);
      xCutLabs.push({ el, x, tw: 1.12 * cw(txt, f, true) });
      segs.push(Object.assign([x, T, x, B], { w: 5 }));
      return sv('g', { class: 'ptk-grid cut', 'data-rate': c.rate }, sv('line', { x1: x, x2: x, y1: T - 0.2 * f, y2: B }), el);
    });
    // (With the values in the key row each key reads "Varix 5.3 mm": its name, the case's value in bold, its unit, the same order on both sides.)
    const kv = [];
    const legend = G.keys.map((k, j) => { const right = j && G.oneRow, y = (j && !G.oneRow ? G.rowH : 0) + 0.75 * f, x0 = right ? G.w : 0;
      const val = G.keyRead ? sv('tspan', { class: 'pcv-kv' }, ' ') : null;
      if (val) kv[j] = val;
      return sv('g', { class: 'pft-key', transform: `translate(${x0} ${y})` },
        k.bare ? null : sv('line', { x1: right ? -16 : 0, x2: right ? 0 : 16, y1: 0, y2: 0, style: `stroke: var(${k.c})` }),
        sv('text', { x: k.bare ? 0 : right ? -22 : 22, y: 0.36 * f, 'text-anchor': right ? 'end' : 'start', style: `fill: var(${k.c})` },
          val ? [sv('tspan', {}, k.name), val, sv('tspan', { class: 'pft-u' }, k.unit)]
            : right ? [sv('tspan', { class: 'pft-u' }, `${k.unit} `), sv('tspan', {}, k.name)] : [sv('tspan', {}, k.name), sv('tspan', { class: 'pft-u' }, ` ${k.unit}`)])); });
    // (With against, a key of the lines kept hidden at the right of the key row: shown only when a chart is too cramped
    // for the lines' names on the drawing, a phone held sideways.)
    let alt = null;
    if (G.ag) {
      let x = 0;
      const ks = [...ls].reverse().map((l) => { const kw = 22 + 1.05 * cw(l.name, f, 1); x -= kw; const at = x; x -= f;
        return sv('g', { transform: `translate(${at.toFixed(1)} 0)` }, sv('line', { x1: 0, x2: 16, y1: 0, y2: 0, class: l.ref ? 'pcv-ref' : null, style: `stroke: var(${l.c})` }),
          sv('text', { x: 22, y: 0.36 * f, style: `fill: var(${l.c})` }, l.name)); });
      alt = sv('g', { class: 'pft-key pcv-alt off', transform: `translate(${G.w} ${(G.altBelow ? G.rowH : 0) + 0.75 * f})` }, ks);
    }
    const axis = [sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      // (The two end numbers stand inside the plot's ends, clear of the corner numbers of the y axes.)
      xt.map((x) => sv('text', { class: 'pft-tk', x: X(x), y: B + 1.25 * f, 'text-anchor': X(x) <= L + 1 ? 'start' : X(x) >= R - 1 ? 'end' : 'middle' }, fmtTick(x, ax.d))),
      // (The name on the numbers' row where it fits between them, else on a row of its own under them, xAxisRow.)
      sv('text', { class: 'pcv-ax', x: G.nameAt ?? (L + R) / 2, y: B + (G.nameAt == null ? 2.6 : 1.25) * f, 'text-anchor': 'middle' }, xAxisName(ax))];
    const lines = ls.map((l, j) => {
      const Y = j && !G.one ? YR || YL : YL, ys = ser?.ys[j], xs = lineX(j);
      const d = ys ? ys.map((y, i) => (Number.isFinite(y) ? [X(xs[i]), Y(y)] : null)).filter(Boolean).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') : '';
      return { l, Y, path: sv('path', { class: `ptk-line pcv-line${l.ref ? ' pcv-ref' : ''}`, d, style: `stroke: var(${l.c})` }),
        ring: sv('circle', { class: 'pcv-ring', r: Math.max(5, f * 0.45), style: `stroke: var(${l.c})` }),
        val: sv('text', { class: 'pcv-v', style: `fill: var(${l.c})` }),
        // (With against each line is named on the drawing, placed on every paint clear of the rings and the values.)
        name: G.ag ? sv('text', { class: 'pcv-name', style: `fill: var(${l.c})` }, l.name) : null };
    });
    // (The other states as small filled points in their line's colour, named beside the first; a walk joins them in order.)
    const dr = Math.max(3.5, 0.3 * f), dotEls = [], walks = [];
    let nth = 0;
    const dotPts = dots.map((d) => {
      const at = ls.map((l, j) => { const p = dotXY(d, j, ls); return p ? [X(p[0]), (j && !G.one ? YR || YL : YL)(p[1])] : null; });
      at.forEach((p, j) => { if (p) dotEls.push(sv('circle', { class: 'pcv-dot', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: dr, style: `fill: var(${ls[j].c})` })); });
      const first = at.find(Boolean), num = d.name && first ? String(++nth) : '';
      // (With a key of steps the dot carries its number, and the name stands in the key.)
      const txt = G.stepKey && num ? num : d.name || '';
      return { name: d.name ? sv('text', { class: `pcv-dname off${G.stepKey ? ' pcv-dnum' : ''}` }, txt) : null, lead: d.name ? sv('line', { class: 'pcv-lead off' }) : null, txt, full: d.name || '', at, first };
    });
    const stepsKey = G.stepKey?.rows ? sv('g', { class: 'pcv-steps' }, G.stepKey.items.map((it) => sv('text', { class: 'pcv-sk', x: it.x, y: B + G.foot + 1.3 * f + it.row * 1.5 * f },
      sv('tspan', { class: 'pcv-sn' }, String(it.n)), ` ${it.name}`))) : null;
    const walkSets = walksOf(t), arrows = [];
    ls.forEach((l, j) => walkSets.forEach((g) => {
      const pts = g.map((i) => dotPts[i]?.at[j]).filter(Boolean);
      if (pts.length > 1) walks.push(sv('path', { class: 'pcv-walk', d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''), style: `stroke: var(${l.c})` }));
      for (let i = 1; i < pts.length; i++) {
        // (The words keep off a walk's dotted line too, and off the arrowhead that shows which way it runs.)
        segs.push(Object.assign([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]], { w: 2 }));
        const ar = walkArrow(pts[i - 1], pts[i], dr, f);
        if (ar) { arrows.push(sv('path', { class: 'pcv-arrow', d: ar.d, style: `fill: var(${l.c})` })); segs.push(Object.assign(ar.seg, { w: 3 })); }
      }
    }));
    for (const d of dotPts) for (const p of d.at) if (p) segs.push(Object.assign([p[0] - dr, p[1], p[0] + dr, p[1]], { w: 3 }));
    // (With a reading on x the case stands out by its rings: its mark is only a short tick on the x axis, not a second upright dashed line.)
    const xk = xKeyOf(t), at = sv('line', { class: xk ? 'pcv-at pcv-atx' : 'pcv-at', y1: xk ? B - 0.8 * f : T - 0.4 * f, y2: B });
    // (The panel under everything: from just under the key row to under the axis's name, the chart's full width.)
    const panel = plotPanel(sv, 0, G.keyH + 0.2 * f, G.w, B + G.foot - (G.keyH + 0.2 * f));
    const svg = sv('svg', { viewBox: `0 0 ${G.w} ${G.h}`, width: G.w, height: G.h, role: 'img', style: `font-size: ${f.toFixed(2)}px` },
      sv('defs', {}, panel.clip), panel.back, zone, grid, cuts, xCuts, legend, alt, axis, stepsKey, at, walks, arrows, lines.map((x) => x.path), dotPts.map((d) => d.lead), dotEls, dotPts.map((d) => d.name), lines.map((x) => [x.ring, x.val, x.name]));
    svg.dataset.points = ser ? String(ser.xs.length) : '0';   // (the browser checks read it: 0 until the curve is ready)
    // (What a ring's value keeps clear of: the cut-offs and their names, the x axis, the data lines. A value on a cut-off
    // line reads as that line's name, so it would sooner cross a data line or another word.)
    const obstacles = { segs, cutLabs, xCutLabs, dotPts, zoneLab, cutBounds: [L, T - 1.2 * f, R, B - 0.1 * f], boxes: [], lines: [...cutVs.filter((c) => !held(c)).map((c) => ({ y: YL(c.v), x0: L, x1: R, w: 5 })), { y: B, x0: L, x1: R }], bounds: [L + 1, T - 1.3 * f, R - 1, B - 0.15 * f], inside: [0, 0, G.w, G.h] };
    return { svg, lines, at, xk: !!xk, kv, obstacles, alt };
  }
  // The rings at r: each on its line at the case's setting, its value beside it (left of it near the right edge, and the
  // lower of two close values under its ring).
  function paint(r) {
    if (!parts || !r) return;
    const ok = Number.isFinite(r.x), cx = ok ? X(clamp(r.x, Math.min(G.x0, G.x1), Math.max(G.x0, G.x1))) : 0, f = G.f;
    parts.at.setAttribute('x1', cx.toFixed(1)); parts.at.setAttribute('x2', cx.toFixed(1));
    parts.at.classList.toggle('off', !ok);
    parts.svg.dataset.ring = ok ? [r.x, ...r.ys.map((v) => (Number.isFinite(v) ? v.toFixed(2) : ''))].join(' ') + (goal?.on ? ' curve' : ' live') : '';   // (the browser checks read it)
    const left = cx > (G.L + G.R) / 2, fs = 1.1 * f, rr = Math.max(5, f * 0.45) + 2;
    const cys = parts.lines.map(() => null);   // (no ring or value for the current state on any chart: his 29 Oct; the case is still read into data-ring)
    // (Each value takes the first spot beside its ring that lands on nothing: the data lines, the cut-off lines, the x axis,
    // the dashed line through the rings, both rings and the other value; the side away from the nearer edge first.)
    const ob = parts.obstacles, dr = Math.max(3.5, 0.3 * f) + 2;
    const boxes = [...cys.filter((y) => y != null).map((y) => [cx - rr, y - rr, cx + rr, y + rr]), ...(ok && !parts.xk ? [[cx - 1.5, G.T - 0.4 * f, cx + 1.5, G.B]] : []),
      ...ob.dotPts.flatMap((d) => d.at.filter(Boolean).map(([x, y]) => [x - dr, y - dr, x + dr, y + dr]))];
    // (With against the upper ring's value is placed first, level with its ring or over it, and the lower one's under the
    // first value, so the two read in the same order as their rings.)
    let upperY = null;
    const ringed = parts.lines.map((_, j) => j).filter((j) => cys[j] != null);
    const order = G.ag ? ringed.sort((a, b) => cys[a] - cys[b]) : parts.lines.map((_, j) => j);
    // (Two readings at the one case whose rings stand close: one readout, "5.3 mm · 72 %", each part in its line's colour (the unit's
    // first word, the key above has the rest), in place of two values that crowd each other and the names about them.)
    const merge = !G.ag && !G.keyRead && ringed.length === 2 && Math.abs(cys[ringed[0]] - cys[ringed[1]]) < 2.6 * fs;
    const shortUnit = (u) => String(u).split(' ')[0];
    order.forEach((j, n) => {
      const p = parts.lines[j];
      const v = r.ys[j], on = cys[j] != null, cy = on ? cys[j] : G.B;
      const lead = merge && j === ringed[0], gone = merge && on && !lead;   // (the first line's value carries both)
      const cyP = lead ? (cys[ringed[0]] + cys[ringed[1]]) / 2 : cy;
      p.ring.setAttribute('cx', cx.toFixed(1)); p.ring.setAttribute('cy', cy.toFixed(1));
      p.ring.classList.toggle('off', !on); p.val.classList.toggle('off', !on || gone || G.keyRead);
      // (The value goes into its key, the ring alone on the chart.)
      if (G.keyRead) { const kt = on ? ` ${fmt(v, p.l.d)} ` : ' '; if (parts.kv[j] && parts.kv[j].textContent !== kt) parts.kv[j].textContent = kt; return; }
      const pieces = lead ? ringed.map((jj) => ({ c: parts.lines[jj].l.c, t: `${fmt(r.ys[jj], parts.lines[jj].l.d)} ${shortUnit(parts.lines[jj].l.unit)}` })) : null;
      const txt = lead ? pieces.map((q) => q.t).join(' · ') : on && !gone ? (G.ag ? fmt(v, p.l.d) : `${fmt(v, p.l.d)} ${p.l.unit}`) : '';   // (with against the key carries the unit)
      if (p.val.dataset.k !== txt) {
        p.val.dataset.k = txt;
        if (pieces) p.val.replaceChildren(...pieces.flatMap((q, i) => [i ? sv('tspan', { class: 'pcv-sep' }, ' · ') : null, sv('tspan', { style: `fill: var(${q.c})` }, q.t)]).filter(Boolean));
        else p.val.textContent = txt;
      }
      if (!on || gone) return;
      const cands = [];
      // (Near the ring first: beside it, then further along, then above and below.)
      for (const d of [rr + 4, 2.6 * f]) {   // (clear of the ring itself, its box padded 3 px)
        const sides = left ? [['end', -d], ['start', d]] : [['start', d], ['end', -d]];
        // (The usual rows first, then every fifth of a line between, for a gap that only just holds the word.)
        const dys = [-0.6, 1.45, -1.7, 2.55, -2.8, 3.65, ...Array.from({ length: 34 }, (_, i) => -2.9 + 0.2 * i)];
        for (const dy of dys) for (const [anchor, dx] of sides) cands.push({ x: cx + dx, y: cyP + dy * f, anchor });
      }
      for (const dy of [-1.2 * f, 2.1 * f]) cands.push({ x: cx, y: cyP + dy, anchor: 'middle' });
      if (G.ag && order.length > 1) {
        const keep = n === 0 ? (c) => c.y <= cy + 0.2 * f : (c) => upperY == null || c.y >= upperY + 1.1 * fs;
        const kept = cands.filter(keep);
        if (kept.length) cands.splice(0, cands.length, ...kept);
      }
      // (Each f of distance from its ring costs half a crossing; it stays on its ring's side of every cut-off.)
      const lines = ob.lines.map((l) => (l.w ? { ...l, side: cyP } : l));
      const pl = placeWord(cands, 1.12 * cw(txt, fs, true), fs, { ...ob, lines, boxes }, { x: cx, y: cyP, k: 0.5 / f });   // (measured wide, as the cut-offs' names)
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
      const ys = ser.ys[j], xs = lineX(j), tw = 1.12 * cw(p.l.name, f, true), cands = [];
      // (Over a rising line the words sit up and to the left of a point, under it down and to the right, where the line is
      // away from them; over a falling line the other way round.)
      // (Every point of the line, nearest the middle first.)
      const mid = 0.45 * (xs.length - 1), at = xs.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
      for (const i of at) {
        const y = ys[i], x = X(xs[i]);
        if (!Number.isFinite(y)) continue;
        const rise = (ys[Math.min(ys.length - 1, i + 1)] ?? y) - (ys[Math.max(0, i - 1)] ?? y) >= 0, py = p.Y(y);
        for (const k of [0, 0.7, 1.4]) cands.push({ x: x + (rise ? -0.3 : 0.3) * f, y: py - (0.5 + k) * f, anchor: rise ? 'end' : 'start' }, { x: x + (rise ? 0.3 : -0.3) * f, y: py + (1.3 + k) * f, anchor: rise ? 'start' : 'end' });
        cands.push({ x, y: py - 0.55 * f, anchor: 'middle' }, { x, y: py + 1.35 * f, anchor: 'middle' });
      }
      // (Never with another line between the words and their own: it would read as naming that one.)
      const yAt = (k, px) => { const ys2 = ser.ys[k], xs2 = lineX(k); for (let i = 1; i < ys2.length; i++) { const a = X(xs2[i - 1]), b = X(xs2[i]);
        if (px >= Math.min(a, b) && px <= Math.max(a, b) && Number.isFinite(ys2[i - 1]) && Number.isFinite(ys2[i])) return p.Y(ys2[i - 1] + (ys2[i] - ys2[i - 1]) * ((px - a) / ((b - a) || 1))); } return null; };
      const own = (c) => { const x0 = c.anchor === 'end' ? c.x - tw : c.anchor === 'middle' ? c.x - tw / 2 : c.x, mx = x0 + tw / 2, my = c.y - 0.3 * f, a = yAt(j, mx);
        return a == null || parts.lines.every((_, k) => { if (k === j) return true; const o = yAt(k, mx); return o == null || !((o - my) * (o - a) < 0); }); };
      const pl = cands.length ? placeWord(cands.filter(own), tw, f, { ...ob, boxes, lines: ob.lines.map((l) => ({ ...l, w: 3 })) }) : null;
      named.push(!!pl && pl.n === 0);
      if (!pl) return;
      boxes.push(pl.box);
      p.name.setAttribute('x', pl.x.toFixed(1)); p.name.setAttribute('y', pl.y.toFixed(1)); p.name.setAttribute('text-anchor', pl.anchor);
    });
    // (Every name clear of everything, or none on the drawing: then the key at the top names the lines.)
    if (parts.alt) {
      const fits = !ser || (named.length > 0 && named.every(Boolean));
      parts.lines.forEach((p) => p.name?.classList.toggle('off', !ser || !fits));
      parts.alt.classList.toggle('off', fits);
    }
    // (The x cut-offs' names over the plot, on their line's top: centred, else to its right or left, clear of each other and of
    // the dashed line through the rings. Before the dots' names, which have sixteen ways round their dots to keep clear of one.)
    for (const c of ob.xCutLabs) {
      const y = G.T - 0.45 * f;
      const p = placeWord([{ x: c.x, y, anchor: 'middle' }, { x: c.x + 0.3 * f, y, anchor: 'start' }, { x: c.x - 0.3 * f, y, anchor: 'end' }], c.tw, f, { boxes, inside: ob.inside });
      boxes.push(p.box);
      c.el.setAttribute('x', p.x.toFixed(1)); c.el.setAttribute('y', p.y.toFixed(1)); c.el.setAttribute('text-anchor', p.anchor);
    }
    // (Each dot's name beside its first point on the nearest spot that lands on nothing, a thin leader joining a name that had to
    // stand off; a name with no clear spot is left out, never drawn over something. The values are placed first, so the dots' names
    // keep clear of them.)
    const nd = ob.dotPts.filter((d) => d.name && d.first), leads = [];
    const spots = placeDotNames(nd.map((d) => ({ x: d.first[0], y: d.first[1], w: 1.08 * cw(d.txt, f, true) })), f, dr, { ...ob, boxes, lines: ob.lines.map((l) => ({ ...l, w: 3 })) });
    nd.forEach((d, i) => {
      const pl = spots[i];
      d.name.setAttribute('x', pl.x.toFixed(1)); d.name.setAttribute('y', pl.y.toFixed(1)); d.name.setAttribute('text-anchor', pl.anchor);
      d.name.classList.toggle('off', !pl.ok);
      if (pl.lead && d.lead) for (const [k, v] of [['x1', pl.lead[0]], ['y1', pl.lead[1]], ['x2', pl.lead[2]], ['y2', pl.lead[3]]]) d.lead.setAttribute(k, v.toFixed(1));
      d.lead?.classList.toggle('off', !pl.lead);
      if (pl.ok) { boxes.push(pl.box); if (pl.lead) leads.push(Object.assign([...pl.lead], { w: 2 })); }
    });
    // (The zone's name inside it, low and away from the lines: the right corner, else the left.)
    if (ob.zoneLab) {
      const tw = 1.1 * cw(ob.zoneLab.textContent, f, true), cands = [];
      for (const dy of [0.7, 1.9, 3.1]) cands.push({ x: G.R - 0.6 * f, y: G.B - dy * f, anchor: 'end' }, { x: G.L + 0.6 * f, y: G.B - dy * f, anchor: 'start' }, { x: (G.L + G.R) / 2, y: G.B - dy * f, anchor: 'middle' });
      const pl = placeWord(cands, tw, f, { ...ob, boxes });
      boxes.push(pl.box);
      ob.zoneLab.setAttribute('x', pl.x.toFixed(1)); ob.zoneLab.setAttribute('y', pl.y.toFixed(1)); ob.zoneLab.setAttribute('text-anchor', pl.anchor);
    }
    // (The cut-offs' names after the values: a value belongs by its ring, a name can go to either end or onto its line.)
    for (const c of ob.cutLabs) {
      // (If both ends are taken, beside the dashed line: just left of it, or just right.)
      const near = ok ? c.cands.filter((q) => q.anchor === 'end').flatMap((q) => [{ ...q, x: cx - 0.5 * f, anchor: 'end' }, { ...q, x: cx + 0.5 * f, anchor: 'start' }]) : [];
      const p = placeWord([...c.cands, ...near], c.tw, f, { segs: [...ob.segs, ...leads], boxes, bounds: ob.cutBounds, lines: c.lines, inside: ob.inside });
      boxes.push(p.box);
      c.el.setAttribute('x', p.x.toFixed(1)); c.el.setAttribute('y', p.y.toFixed(1)); c.el.setAttribute('text-anchor', p.anchor);
      c.el.classList.toggle('on', !!p.on);
    }
    const ax = G.ax;
    parts.svg.setAttribute('aria-label', `${parts.lines.map((p) => p.l.name).join(' and ')} against ${ax.name.toLowerCase()}, ${fmt(G.x0, ax.d)} to ${fmt(G.x1, ax.d)} ${ax.unit}`
      + (ok ? `; this case at ${fmt(r.x, ax.d)} ${ax.unit}: ${parts.lines.map((p, j) => (Number.isFinite(r.ys[j]) ? `${p.l.name} ${fmt(r.ys[j], p.l.d)} ${p.l.unit}` : '')).filter(Boolean).join(', ')}` : '')
      + (ob.dotPts.length ? `; also ${ob.dotPts.map((d) => d.full).filter(Boolean).join(', ')}` : ''));
  }
  // Whether the dots' names cannot all stand close and clear (as placeDotNames would put them with the rings where they are now):
  // then the dots carry numbers.
  function needSteps() {
    if (!parts || !G) return false;
    const nd = parts.obstacles.dotPts.filter((d) => d.name && d.first);
    if (!nd.length) return false;
    const r = ring || goal, f = G.f, ob = parts.obstacles, half = Math.max(3.5, 0.3 * f) + 2, rr = Math.max(5, f * 0.45) + 2;
    const cx = r && Number.isFinite(r.x) ? X(clamp(r.x, Math.min(G.x0, G.x1), Math.max(G.x0, G.x1))) : null;
    const boxes = [...(cx == null ? [] : parts.lines.flatMap((p, j) => (Number.isFinite(r.ys[j]) ? [[cx - rr, p.Y(r.ys[j]) - rr, cx + rr, p.Y(r.ys[j]) + rr]] : []))),
      ...ob.dotPts.flatMap((d) => d.at.filter(Boolean).map(([x, y]) => [x - half, y - half, x + half, y + half]))];
    const sp = placeDotNames(nd.map((d) => ({ x: d.first[0], y: d.first[1], w: 1.08 * cw(d.full, f, true) })), f, half, { ...ob, boxes, lines: ob.lines.map((l) => ({ ...l, w: 3 })) });
    return namesCrowded(sp, f);
  }
  // The rings glide after their goal (never a jump).
  function tick() {
    raf = 0;
    if (!goal) return;
    const k = reduceMQ.matches || !ring ? 1 : 0.18, mix = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * k : b);
    ring = { x: mix(ring?.x, goal.x), ys: goal.ys.map((y, j) => mix(ring?.ys[j], y)) };
    const near = Math.abs((ring.x ?? 0) - (goal.x ?? 0)) < 1e-3 * Math.abs((G?.x1 ?? 1) - (G?.x0 ?? 0)) && ring.ys.every((y, j) => !Number.isFinite(y) || Math.abs(y - goal.ys[j]) < 0.005);
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
    // (A crowd of names: numbers on the dots and a key under the chart, if the plot keeps its height; on a card too short for that the
    // names stay, and any with no clear spot is left out.)
    if (needSteps()) { const g2 = geo(w, hh, f, true); if (g2.B - g2.T >= 5 * f) { G = g2; parts = build(); } }
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
    // (With against, the other lines' rings are read from their curves at the case's x.)
    else if (ser && againstOf(t)) { const at = curveAt(ser, goal.x); goal = { x: goal.x, ys: goal.ys.map((y, j) => (j ? at?.[j] ?? null : y)) }; }
    if (!raf) raf = nextFrame(tick);
  }
  async function fetchCurve(myKey, c) {
    const p = curveWork(t, c, myKey);
    if (!p) return;   // (the slide's state is not ready: shown again, it asks again)
    const r = await p.catch(() => null);
    // (Still this slide's instrument: configured with this context and no other since. Not c.shown(), which turns true only
    // once the slide has finished coming in, after a curve worked out quickly has already arrived.)
    if (!r || key !== myKey || ctx !== c) return;
    ser = r.s; dots = r.dd; redraw(true);
    if (aimed) aim(...aimed);
    else if (againstOf(t)) aim(ctx.params, ctx.fp);   // (the other lines' rings, from their curves now they are here)
  }
  return {
    el,
    configure(tool, c) {
      const k2 = curveKey(tool, c);
      t = tool; ctx = c || null;
      if (k2 !== key) {
        key = k2; ser = null; dots = []; ring = null; aimed = null;
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
