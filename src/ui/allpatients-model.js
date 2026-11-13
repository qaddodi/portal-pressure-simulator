// The all-patients chart's numbers and its layout (Mohammad, 7 Nov 2026, mock E1: "one large HVPG-over-time chart for all four patients ... a key shows HVPG,
// stiffness and platelets at before, 1 year and 2 years"). Pure: it loads in node for the unit tests; the drawing is visual-allpatients.js.
//
//   cohort: [{ name, c, slides: ['before', 'year1', 'year2'], pace?: true, clear?: 'Resolved' }]     (a slide field, `visual: 'allpatients'`)
//
// Each patient is the deck's own slides run again from a fresh model with a reading on every day of every time-lapse (the same steps the presenter takes,
// slide by slide, so the chart's 1 and 2 year numbers are the slides' numbers); the chart samples them every three months. A patient with one year in
// the deck gets a second: pace: true runs a year more on the last slide's ramp, carried on at the pace of that slide (a ramp from 0.45 to 0.35 goes on
// from 0.35 to 0.25). That year is the model's, not a slide's, and the chart draws it dotted.
import { clamp } from './num.js';
import { TILE } from './table-marks.js';

export const KEYS = ['hvpg', 'lsm', 'plt'];
const FIELDS = ['preset', 'presetDays', 'params', 'action', 'days', 'relax', 'ramp'];
export const MONTHS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
export const dayOf = (m) => Math.round(m * 365 / 12);
export const CUT = 10;   // (mmHg: the CSPH line)
const str = (v, d) => (typeof v === 'string' && v ? v : d);

/** The slide's patients, checked: [{ name, c, slides, pace, clear }]. */
export function cohortOf(s) {
  return (Array.isArray(s?.cohort) ? s.cohort : []).slice(0, 6)
    .filter((p) => p && typeof p.name === 'string' && p.name && Array.isArray(p.slides) && p.slides.length && p.slides.every((x) => typeof x === 'string'))
    .map((p) => ({ name: p.name, c: str(p.c, 's1'), slides: p.slides, pace: !!p.pace, clear: str(p.clear, 'Resolved') }));
}

const stepOf = (sl) => {
  const o = {};
  for (const k of FIELDS) if (sl[k] !== undefined) o[k] = sl[k];
  o.fine = !!sl.lapse;
  if (sl.ramp && sl.days) o.trail = KEYS;   // (the days that move: a reading on each, [day, hvpg, lsm, plt])
  return o;
};
/** The steps for ctx.run from a fresh model, every patient's slides in turn (each patient but the first starts again from a fresh model), or null when a
 *  slide the cohort names is not in the deck. spans: where each patient's steps are, [from, to). */
export function cohortSteps(s, deck) {
  const steps = [], spans = [];
  for (const p of cohortOf(s)) {
    const list = p.slides.map((id) => deck?.slides?.find((x) => x.id === id));
    if (list.some((x) => !x)) return null;
    const from = steps.length, mine = list.map(stepOf);
    if (p.pace) {
      const last = list.at(-1);
      if (!last.ramp || !last.days) return null;
      mine.push({ days: last.days, ramp: Object.fromEntries(Object.entries(last.ramp).map(([k, [a, b]]) => [k, [b, b + (b - a)]])), fine: true, trail: KEYS });
    }
    if (from) mine[0] = { ...mine[0], restart: true };
    steps.push(...mine);
    spans.push([from, steps.length]);
  }
  return steps.length ? { steps, spans } : null;
}

/** The series in shown units from the run's states (outs, in the order cohortSteps made its steps): [{ name, c, clear, pace, pts: [{ m, hvpg, lsm, plt }] }], a point
 *  every three months from before to one year, or to two where the model adds a year; null when a state is missing or not a number. */
export function seriesOf(s, deck, outs) {
  const made = cohortSteps(s, deck);
  if (!made || !Array.isArray(outs) || outs.length !== made.steps.length) return null;
  const mx = Object.fromEntries(KEYS.map((k) => [k, TILE[k]?.x ?? 1]));
  const out = [];
  for (const [pi, p] of cohortOf(s).entries()) {
    const [from, to] = made.spans[pi], got = new Map();
    let t0 = 0;
    for (let i = from; i < to; i++) {
      const st = made.steps[i], o = outs[i];
      if (!o?.fp) return null;
      if (!st.trail) { if (!got.has(0) && t0 === 0) got.set(0, { fp: o.fp }); continue; }   // (a state with no time-lapse of its own: the patient's start, when nothing has run yet)
      if (!Array.isArray(o.trail)) return null;
      for (const m of MONTHS) {
        const local = dayOf(m) - t0;
        if (local < 0 || local > st.days || got.has(m)) continue;
        const row = o.trail[local];
        if (row) got.set(m, { row });
      }
      t0 += st.days;
    }
    const pts = [];
    for (const m of MONTHS) {
      const g = got.get(m);
      if (!g) break;
      const pt = { m };
      KEYS.forEach((k, j) => { const v = g.row ? g.row[j + 1] : g.fp[k]; pt[k] = Number.isFinite(v) ? v * mx[k] : NaN; });
      if (KEYS.some((k) => !Number.isFinite(pt[k]))) return null;
      pts.push(pt);
    }
    if (pts.length < 2 || pts[0].m !== 0 || pts.length !== MONTHS.indexOf(pts.at(-1).m) + 1) return null;
    out.push({ name: p.name, c: p.c, clear: p.clear, pace: p.pace, pts });
  }
  return out;
}

/** A patient's value at a month (null where the series stops before it). */
export const at = (p, m, k) => p.pts.find((q) => q.m === m)?.[k] ?? null;
/** The verdict printed in the key: CSPH is over at an HVPG under 10 at the series' end. */
export const verdictOf = (p) => (p.pts.at(-1).hvpg < CUT ? { text: p.clear, ok: true } : { text: 'Persists', ok: false });
/** The key's order: worst first, by the HVPG at the end. */
export const worstFirst = (ser) => ser.slice().sort((a, b) => b.pts.at(-1).hvpg - a.pts.at(-1).hvpg);
export const fmtOf = (k) => { const d = TILE[k]?.d ?? 1; return (v) => v.toFixed(d); };

/** Labels moved apart along y until none is closer than gap: items { y }; each gets .ly. */
export function dodge(items, gap, lo = -1e9, hi = 1e9) {
  const s = items.slice().sort((a, b) => a.y - b.y);
  for (const it of s) it.ly = it.y;
  for (let k = 0; k < 60; k++) {
    let moved = false;
    for (let i = 1; i < s.length; i++) {
      const d = s[i].ly - s[i - 1].ly;
      if (d < gap - 1e-6) { const m = (gap - d) / 2; s[i - 1].ly -= m; s[i].ly += m; moved = true; }
    }
    for (const it of s) it.ly = Math.max(lo, Math.min(hi, it.ly));
    if (!moved) break;
  }
  return items;
}

/** Words broken into lines of at most px px at type f (a letter averaging 0.54 em, a little over what the app's face draws, so a line fits). */
export function wrap(text, px, f) {
  const max = Math.max(8, Math.floor(px / (0.54 * f))), out = [];
  let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}
export const PHONE_W = 560;   // (px: a card narrower than this is the phone's layout, the chart on the full width and the key under it)
const LO = 2, HI = 16;

/** The geometry for a card W px wide (the height follows from it): the chart's frame and scales, the words on it, and the key. Units are px; f is the type size.
 *  ser: the series, or null (the frame alone). foot: the small print, a list of sentences, under the chart (a phone: under the key). */
export function layout(W, ser, foot = []) {
  const phone = W < PHONE_W;
  const f = phone ? 12 : clamp(Math.round(W / 66 * 2) / 2, 12, 15.5), lh = 1.34 * f;
  const cap = 1.7 * f, foot_h = 2.1 * f, r = Math.max(3.5, 0.3 * f);
  const blockH = (phone ? 3.05 : 1.75) * f + 3 * lh;
  let plotW, chartH, H, note;
  const noteLines = (px) => foot.flatMap((t) => wrap(t, px, f)), nlh = 1.3 * f;
  if (phone) {
    plotW = W; chartH = clamp(Math.round(0.74 * W), 230, 310);
    const lines = noteLines(W - 0.4 * f), y0 = chartH + 1.0 * f + 2 * blockH + 0.9 * f + 0.5 * f;
    note = { x: 0.2 * f, y: y0, lines, lh: nlh };
    H = Math.round(y0 + lines.length * nlh + 0.3 * f);
  } else {
    const KW = 17.4 * f, gap = 1.6 * f;
    plotW = W - KW - gap;
    const lines = noteLines(plotW - 0.4 * f), noteH = lines.length ? lines.length * nlh + 0.8 * f : 0;
    H = Math.round(Math.max(W / 2.05, cap + 4 * blockH + 3 * 0.5 * f + foot_h + 0.4 * f, 14 * f + noteH));
    chartH = H - noteH;
    note = { x: 0.2 * f, y: chartH + 0.5 * f, lines, lh: nlh };
  }
  const lo = ser ? Math.min(LO, Math.floor(Math.min(...ser.flatMap((p) => p.pts.map((q) => q.hvpg))) - 0.5)) : LO;
  const hi = ser ? Math.max(HI, Math.ceil(Math.max(...ser.flatMap((p) => p.pts.map((q) => q.hvpg))) + 1)) : HI;
  const py = cap, B = chartH - foot_h - 0.2 * f, T = py + 0.8 * f, L = 2.5 * f, R = plotW - 0.8 * f;
  const end = ser ? Math.max(...ser.map((p) => p.pts.at(-1).m)) : 24;
  const lead = 1.1 * f, right = 3.4 * f, span = R - L - lead - right;
  const X = (m) => L + lead + (m / 24) * span, Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
  const ticks = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) if (v !== CUT && Y(v) > T - 1 && B - Y(v) > 0.6 * f) ticks.push(v);
  const xt = [[0, 'Before'], [6, '6 mo'], [12, '1 year'], [18, '18 mo'], [24, '2 years']].filter(([m]) => m <= end);
  const G = { phone, W, H, f, lh, r, cap, foot: foot_h, note, py, B, T, L, R, plotW, chartH, lo, hi, X, Y, ticks, xt, end, blockH, lead, span };
  if (!ser) return G;
  // The words on the chart: the start values over the rings, the 1 and 2 year values beside their dots, each column moved apart along y.
  const gap = 1.22 * f, col = (m, up, dx) => dodge(ser.filter((p) => at(p, m, 'hvpg') != null).map((p) => ({ p, v: at(p, m, 'hvpg'), y: Y(at(p, m, 'hvpg')) - up })), gap, T + 0.5 * f, B - 0.5 * f)
    .map((it) => ({ p: it.p, v: it.v, x: X(m) + dx, y: it.ly }));
  G.words = { start: col(0, 0.95 * f, 0.9 * f), year1: col(12, 0.95 * f, 0.8 * f), year2: col(24, 0, 0.95 * f) };
  // The key, worst first: a block for each patient (name and verdict, then a row for each reading at before, 1 year and 2 years). Wide: one column to the
  // right of the chart under one header; a phone: a grid of two under the chart, a header of its own in each block.
  const order = worstFirst(ser), bh = blockH;
  const head = (colR, y) => ({ y, colR, texts: phone ? ['Before', '1 yr', '2 yr'] : ['Before', '1 year', '2 years'] });
  const mk = (p, x, y, w, colR) => ({ p, x, y, w, colR, nameY: y + 0.8 * f, headY: y + 2.3 * f, rows: KEYS.map((k, j) => ({ k, label: LABEL[k], y: y + (phone ? 3.05 : 1.75) * f + (j + 0.5) * lh })) });
  if (phone) {
    const bw = (W - 1.0 * f) / 2, y0 = chartH + 1.0 * f, colR = (x) => [x + bw - 8.2 * f, x + bw - 4.1 * f, x + bw];
    G.key = { head: null, blocks: order.map((p, i) => { const x = (i % 2) * (bw + 1.0 * f), y = y0 + Math.floor(i / 2) * (bh + 0.9 * f); return { ...mk(p, x, y, bw, colR(x)), head: head(colR(x), y + 2.3 * f) }; }) };
  } else {
    const x0 = plotW + 1.6 * f, bw = 17.4 * f, colR = [x0 + 9.2 * f, x0 + 13.3 * f, x0 + 17.4 * f];
    const bgap = Math.max(0.4 * f, (H - 0.4 * f - py - 4 * bh) / 3);
    G.key = { head: head(colR, 0.85 * f), blocks: order.map((p, i) => mk(p, x0, py + i * (bh + bgap), bw, colR)) };
  }
  return G;
}
const LABEL = { hvpg: 'HVPG', lsm: 'LSM', plt: 'Plt' };
