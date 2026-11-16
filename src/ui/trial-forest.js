// The landmark trials' effect sizes on one scale (a forest plot), and one trial's arms as bars: drawn on the GPU (svg-gl.js), the way the trial
// card is (tool-trial.js). Read by the Trials tab of the Tests card (trials-pane.js) and by a deck's summary slide, so it knows nothing of the
// card it sits in.
//
// A trial's ratios are its own, as its abstract reports them: [{ kind: 'HR' | 'OR' | 'RR', est, lo, hi, of, vs? }] (trials.js). Hazard ratios,
// odds ratios and relative risks are different measures and are never pooled or shown as one: the rows are grouped by kind (HR, then OR, then
// RR), each group under its own name, and every value carries its kind. All share one log scale with a line at 1; a ratio is of an outcome the
// trial counted against the treatment (death, a bleed, decompensation), so a value under 1 favors the treatment. A trial with no ratio and
// interval reported is listed under the plot with its two rates and no marker.
//
// forestLayout and armsLayout are pure: the same trials at the same width and type size always give the same drawing. meas(text, font) → px
// (glyph-measure.js). createForest draws forestLayout's pieces, again only when its width or what it shows changes.

import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { trialOf } from './trials.js';
import { wrapWords } from './tool-trial.js';

export const KINDS = Object.freeze(['HR', 'OR', 'RR']);
export const KIND_NAME = Object.freeze({ HR: 'Hazard ratio (HR)', OR: 'Odds ratio (OR)', RR: 'Relative risk (RR)' });
export const NO_RATIO = 'No ratio with a confidence interval reported';
export const FAVORS = Object.freeze(['Favors treatment', 'Favors control']);
// (The scale's ends are the nearest of these that take every interval in: 0.1 to 2 holds every trial in the list today.)
const ENDS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10, 20, 50];
const TICKS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
const SM = 0.92;   // (the quieter words: a step under the host's size, as the looks' em(0.92))

const fin = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** A ratio as the card prints it: two decimals ("0.51"). */
// (Two decimals, or three where the paper gave three (CAVARLY's 0.192–0.716): a reported bound is never rounded.)
export const fmtRatio = (v) => v.toFixed(Math.max(2, Math.min(3, (String(v).split('.')[1] || '').length)));
/** "HR 0.51 (0.26–0.97)". */
export const ratioText = (r) => `${r.kind} ${fmtRatio(r.est)} (${fmtRatio(r.lo)}–${fmtRatio(r.hi)})`;
const tickText = (v) => String(v);

// (Before every trial carries `ratios`, a ratio is read from the abstract's effect line when it is written "HR 0.51 (0.26–0.97)" or
// "HR for death 0.55 (0.33–0.92)". A trial that has `ratios`, even an empty list, is taken at its word.)
const EFFECT_RATIO = /^(HR|OR|RR)(?: for ([^0-9(]+?))? (\d*\.?\d+) \((\d*\.?\d+)\s*[–-]\s*(\d*\.?\d+)\)/;
/** A trial's ratios that can be drawn: of a known kind, with a positive estimate inside a positive interval. */
export function ratiosOf(t) {
  let list = t?.ratios;
  if (!Array.isArray(list)) {
    const m = typeof t?.effect === 'string' ? t.effect.match(EFFECT_RATIO) : null;
    list = m ? [{ kind: m[1], est: +m[3], lo: +m[4], hi: +m[5], of: m[2] || t.endpoint || '' }] : [];
  }
  return list.filter((r) => r && KINDS.includes(r.kind) && fin(r.est) && fin(r.lo) && fin(r.hi) && r.lo <= r.est && r.est <= r.hi);
}
const armOf = (t, side) => (t?.arms || []).find((a) => a.side === side) || null;
/** The treated arm's and the control's rates, "16% vs 27%" (a third arm after a slash), or ''. */
export function ratesText(t) {
  const arms = t?.arms || [], tr = armOf(t, 'treat') || arms[0];
  if (!tr) return '';
  const rest = arms.filter((a) => a !== tr).map((a) => `${a.rate}%`);
  return rest.length ? `${tr.rate}% vs ${rest.join(' / ')}` : `${tr.rate}%`;
}

/** The scale the plot is drawn on, as a journal's forest has one: fixed at 0.1 to 2, so the same value sits in the same place on every card; an
 *  interval that runs past an end is cut there and ends in an arrowhead (forestLayout). */
export const FOREST_SCALE = Object.freeze([0.1, 2]);
/** Under each group: its trials counted different endpoints, so no summary diamond is drawn and none is implied. */
export const NOT_POOLED = 'Not pooled: different endpoints';

/** The scale's ends that would take every one of these ratios in: [lo, hi], 0.1 to 2 or wider (the plot itself uses FOREST_SCALE and
 *  arrowheads). */
export function forestRange(rows) {
  let lo = 0.1, hi = 2;
  for (const r of rows) { lo = Math.min(lo, r.lo); hi = Math.max(hi, r.hi); }
  const a = ENDS.filter((e) => e <= lo).pop() ?? ENDS[0], b = ENDS.find((e) => e >= hi) ?? ENDS[ENDS.length - 1];
  return [a, b];
}

// The longest start of `s` that fits w, with an ellipsis when cut ('' when not even one letter and the ellipsis do).
export function clip(s, w, font, meas) {
  if (!s || w <= 0) return '';
  if (meas(s, font) <= w) return s;
  let t = s;
  while (t.length > 1 && meas(`${t}…`, font) > w) t = t.slice(0, -1);
  return t.length > 1 ? `${t.trimEnd()}…` : '';
}

/**
 * The plot of these trials (records from trials.js) at width W, type size f: { texts: [{ x, y, t, look, anchor }], rects: [{ x, y, w, h, r, look }],
 * lines: [{ x1, y1, x2, y2, look }], hits: [{ id, y, h }] (each row's band, for a tap), H }. opts.highlight: the ids drawn in full ink, a Set or a
 * list (the trials that fit the patient; every trial when null or left out), the others quieter and after them in their group. opts.selected: the id with its row marked and
 * its detail line under the axis. opts.notes: { id: words } added to that detail line.
 */
export function forestLayout(trials, W, f, meas, opts = {}) {
  const { highlight = null, selected = null, notes = null, why = null } = opts || {};
  const texts = [], rects = [], lines = [], hits = [];
  const say = (x, y, t, look, anchor = 'start') => { if (t) texts.push({ x, y, t, look, anchor }); };
  const fs = f * SM, ip = Math.round(f * 0.5), lh = f * 1.35;
  const font = (wt, s = f) => `${wt} ${s}px Inter`;
  // (highlight as a Set (the Trials tab) or a list of ids (a deck slide's tool): a list was read as a Set, threw, and left a slide's card empty.)
  const hl = highlight == null ? null : highlight instanceof Set ? highlight : new Set(highlight);
  const lit = (t) => !hl || hl.has(t.id);
  const list = (trials || []).filter(Boolean);
  // Every ratio, by kind; in each kind the trials that fit first, then the order given.
  const order = (a, b) => (lit(b.t) - lit(a.t)) || (a.i - b.i);
  const rows = [];
  // (TC-V3: one row per trial, its primary ratio, the first trials.js lists; secondary endpoints and subgroups stay in the open trial, so a
  // subgroup never sits beside a primary result as an equal finding. opts.all: every ratio, for a caller that wants them.)
  list.forEach((t, i) => { for (const r of opts.all ? ratiosOf(t) : ratiosOf(t).slice(0, 1)) rows.push({ t, r, i, kind: r.kind, lo: r.lo, hi: r.hi }); });
  const [a, b] = opts.scale ?? FOREST_SCALE;
  const tk = TICKS.filter((v) => v >= a - 1e-9 && v <= b + 1e-9);
  const padL = meas(tickText(tk[0] ?? a), font(500, fs)) / 2 + 1, padR = meas(tickText(tk[tk.length - 1] ?? b), font(500, fs)) / 2 + 1;
  const x0 = ip + padL, x1 = Math.max(x0 + 40, W - ip - padR), la = Math.log(a), span = Math.log(b) - la;
  const X = (v) => x0 + ((Math.log(Math.min(b, Math.max(a, v))) - la) / span) * (x1 - x0);
  let y = 0;
  for (const kind of KINDS) {
    const group = rows.filter((q) => q.kind === kind).sort(order);
    if (!group.length) continue;
    say(ip, y + fs, KIND_NAME[kind], 'forest.grp');
    y += lh + f * 0.2;
    const shownWhy = new Set();
    for (const { t, r } of group) {
      // (The picked trial's first row here carries a second line: the one rule the patient fails, or how many rules were checked.)
      const line = t.id === selected && !shownWhy.has(t.id) ? why?.[t.id] : null;
      if (line) shownWhy.add(t.id);
      // (B23, play-test 16 Nov 2026: "Death or liver tran…". What a row counts is never cut: beside the name when it fits, else in full on its own lines under the interval.)
      const ofText = r.vs || r.of || '', ofRoom = W - 2 * ip - meas(t.short ?? t.name, font(lit(t) ? 600 : 500)) - meas(ratioText(r), font(500, fs)) - f * 1.2;
      const ofLines = ofText && meas(ofText, font(500, fs)) > ofRoom ? wrapWords(ofText, W - 2 * ip, fs, 500, meas, Infinity) : null;
      const on = lit(t), rowH = Math.round(lh + f * 1.25) + (ofLines ? Math.round(ofLines.length * fs * 1.3 + f * 0.4) : 0) + (line ? Math.round(f * 0.95) : 0);
      if (t.id === selected) rects.push({ x: 0, y, w: W, h: rowH, r: Math.round(f * 0.6), look: 'forest.sel' });
      const name = t.short ?? t.name, val = ratioText(r), nw = meas(name, font(on ? 600 : 500)), vw = meas(val, font(500, fs));
      say(ip, y + f, name, on ? 'forest.nm' : 'forest.nm.dim');
      say(W - ip, y + f, val, on ? 'forest.val' : 'forest.val.dim', 'end');
      // (A three-arm trial's row names its comparison, which tells its rows apart; another names what it counted.)
      if (!ofLines) say(ip + nw + f * 0.45, y + f, ofText, 'forest.of');
      else ofLines.forEach((ln, k) => say(ip, y + lh + f * 1.3 + fs * 1.1 + k * fs * 1.3, ln, 'forest.of'));
      const ty = Math.round(y + lh + f * 0.55), s = Math.round(f * 0.7);
      lines.push({ x1: X(r.lo), y1: ty, x2: X(r.hi), y2: ty, look: on ? 'forest.ci' : 'forest.ci.dim' });
      rects.push({ x: X(r.est) - s / 2, y: ty - s / 2, w: s, h: s, r: 1.5, look: on ? 'forest.mk' : 'forest.mk.dim' });
      // An interval past either end of the scale ends in an arrowhead at that end (two strokes back from the tip), not a cut line.
      const ah = f * 0.45, look = on ? 'forest.ci' : 'forest.ci.dim';
      if (r.hi > b + 1e-9) { const x = X(b); lines.push({ x1: x - ah, y1: ty - ah * 0.8, x2: x, y2: ty, look }, { x1: x - ah, y1: ty + ah * 0.8, x2: x, y2: ty, look }); }
      if (r.lo < a - 1e-9) { const x = X(a); lines.push({ x1: x + ah, y1: ty - ah * 0.8, x2: x, y2: ty, look }, { x1: x + ah, y1: ty + ah * 0.8, x2: x, y2: ty, look }); }
      // (TC-V2: the line at 1 runs through the interval's band only, never through the words above it: one short stroke per row.)
      lines.push({ x1: X(1), y1: ty - s, x2: X(1), y2: ty + s, look: 'forest.ref' });
      if (line) say(ip, y + lh + f * 0.9 + fs * 1.1 + (ofLines ? Math.round(ofLines.length * fs * 1.3 + f * 0.4) : 0), line, 'forest.why');
      hits.push({ id: t.id, y, h: rowH });
      y += rowH;
    }
    say(ip, y + fs * 0.9, NOT_POOLED, 'forest.k');
    y += fs * 0.9 + f * 0.7;
  }
  if (rows.length) {
    // The axis: its ticks and numbers, then which side favors which arm (beside the line at 1 when there is room, else at the ends).
    lines.push({ x1: x0, y1: y, x2: x1, y2: y, look: 'forest.axis' });
    for (const v of tk) { lines.push({ x1: X(v), y1: y, x2: X(v), y2: y + f * 0.35, look: 'forest.axis' }); say(X(v), y + f * 0.4 + fs, tickText(v), 'forest.tick', 'middle'); }
    y += f * 0.4 + fs + f * 0.45;
    const one = X(1), lw = meas(FAVORS[0], font(500, fs)), rw = meas(FAVORS[1], font(500, fs)), gap = f * 0.5;
    const right = one + gap + rw <= W - ip, left = right && one - gap - lw >= ip;   // (both beside the line, or both at the ends: never one over the other)
    // (Both at the ends and too wide to stand on one line: one over the other, so neither is cut or runs into the other.)
    const stacked = !left && lw + rw + gap > W - 2 * ip;
    say(left ? one - gap : ip, y + fs, FAVORS[0], 'forest.ends', left ? 'end' : 'start');
    say(right ? one + gap : W - ip, y + fs + (stacked ? lh : 0), FAVORS[1], 'forest.ends', right ? 'start' : 'end');
    y += stacked ? 2 * lh : lh;
  }
  // The detail of the trial picked: its two rates over what they count and for how long, and the caller's note.
  const sel = list.find((t) => t.id === selected);
  if (sel) {
    y += f * 0.5;
    lines.push({ x1: 0, y1: y, x2: W, y2: y, look: 'forest.rule' });
    y += f * 0.45;
    const rt = ratesText(sel);
    for (const dl of wrapWords(`${sel.short ?? sel.name}${rt ? `: ${rt}` : ''}`, W - 2 * ip, f, 600, meas, Infinity)) { say(ip, y + f, dl, 'forest.dt'); y += lh; }
    const fu = sel.followUp ? `, ${sel.followUp.charAt(0).toLowerCase()}${sel.followUp.slice(1)}` : '';
    const note = notes?.[sel.id];
    for (const s of wrapWords(`${sel.endpoint || ''}${fu}.${note ? ` ${note}` : ''}`, W - 2 * ip, fs, 500, meas, Infinity)) { say(ip, y + fs, s, 'forest.dx'); y += fs * 1.4; }
  }
  // The trials with no ratio: their rates, no marker.
  const bare = list.map((t, i) => ({ t, i })).filter((q) => !ratiosOf(q.t).length).sort((p, q) => (lit(q.t) - lit(p.t)) || (p.i - q.i));
  if (bare.length) {
    y += f * 0.6;
    lines.push({ x1: 0, y1: y, x2: W, y2: y, look: 'forest.rule' });
    y += f * 0.4;
    say(ip, y + fs, NO_RATIO, 'forest.k');
    y += lh;
    for (const { t } of bare) {
      const on = lit(t), rt = ratesText(t), rw = meas(rt, font(500, fs));
      const bareRoom = W - 2 * ip - meas(t.short ?? t.name, font(on ? 600 : 500)) - rw - f * 1.2, bareLines = t.endpoint && meas(t.endpoint, font(500, fs)) > bareRoom ? wrapWords(t.endpoint, W - 2 * ip, fs, 500, meas, Infinity) : null;
      const rowH = Math.round(lh + f * 0.3) + (bareLines ? Math.round(bareLines.length * fs * 1.3) : 0);
      if (t.id === selected) rects.push({ x: 0, y, w: W, h: rowH, r: Math.round(f * 0.6), look: 'forest.sel' });
      const name = t.short ?? t.name, nw = meas(name, font(on ? 600 : 500));
      say(ip, y + f * 1.05, name, on ? 'forest.nm' : 'forest.nm.dim');
      if (!bareLines) say(ip + nw + f * 0.45, y + f * 1.05, t.endpoint || '', 'forest.of');
      else bareLines.forEach((ln, k) => say(ip, y + f * 1.05 + fs * 1.3 * (k + 1), ln, 'forest.of'));
      say(W - ip, y + f * 1.05, rt, on ? 'forest.val' : 'forest.val.dim', 'end');
      hits.push({ id: t.id, y, h: rowH });
      y += rowH;
    }
  }
  return { texts, rects, lines, hits, H: Math.ceil(y + f * 0.3) };
}

/** A trial's arms as bars on a 0 to 100% track (the trial card's, tool-trial.js): the treated arm in the series colour, the others muted, each
 *  with its name over it and its people at the right. { texts, rects, H }, in the forest's arm looks (forest.arm…, chart-looks/forest.js), drawn on host 'trial'. */
export function armsLayout(t, W, f, meas) {
  const texts = [], rects = [], bh = Math.round(f * 1.7), pad = f * 0.5, gap = f * 0.6;
  let y = 0;
  for (const a of t?.arms || []) {
    texts.push({ x: 0, y: y + f, t: a.label, look: 'forest.arm', anchor: 'start' });
    if (a.n) texts.push({ x: W, y: y + f, t: `n = ${a.n}`, look: 'forest.armn', anchor: 'end' });
    const by = y + f * 1.45, bw = Math.max(2, (W * Math.max(0, Math.min(100, a.rate))) / 100), pct = `${a.rate}%`, pw = meas(pct, `700 ${f}px Inter`);
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'forest.track' });
    rects.push({ x: 0, y: by, w: bw, h: bh, r: bh / 2, look: 'forest.bar', tone: a.side === 'treat' ? 's1' : 'text-3' });
    const inside = bw >= pw + 2 * pad + bh / 2;
    texts.push({ x: inside ? bw - pad - bh / 4 : bw + pad, y: by + bh / 2 + f * 0.36, t: pct, look: 'forest.pct', anchor: inside ? 'end' : 'start' });
    y = by + bh + gap;
  }
  return { texts, rects, H: Math.ceil(Math.max(0, y - gap) + f * 0.3) };
}

const sv = svgModel;
const textW = (s, font) => measure(s, font);
/** The model tree of a layout, for svg-gl.js. */
export function layoutTree(L, W, label) {
  return sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': label },
    ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look, ...(r.tone ? { 'data-p-tone': r.tone } : {}) })),
    ...(L.lines || []).map((l) => sv('line', { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, 'data-look': l.look })),
    ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)));
}

/** What the plot says, for a screen reader. */
export function forestWords(trials) {
  const parts = [];
  for (const t of trials || []) {
    const rs = ratiosOf(t);
    parts.push(rs.length ? `${t.short ?? t.name}: ${rs.map(ratioText).join(', ')}` : `${t.short ?? t.name}: ${ratesText(t)}, ${NO_RATIO.toLowerCase()}`);
  }
  return parts.join('. ');
}

/**
 * The forest plot as a card piece: { el, configure({ ids, highlight, selected, notes }), select(id), dispose }. host: the chart-looks host whose
 * type size it takes ('forest', the Tests card's 13 px; a slide may pass its card's). px: a fixed type size (0: the host's, as the trial card
 * fits it). onSelect(id): a row was tapped (it is marked at once). A row is a button over its band, so a keyboard and a screen reader reach it.
 */
export function createForest({ host = 'forest', px = 0, onSelect = null } = {}) {
  const el = h('div', { class: 'pz-forest', role: 'group', 'aria-label': 'Trial effects on one scale' });
  const gl = createSvgGL(el, { host });
  const hitBox = h('div', { class: 'tf-hits' });
  el.append(hitBox);
  let trials = [], highlight = null, selected = null, notes = null, drawnW = 0, drawnF = 0, dirty = true;
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!W || !el.isConnected) return;
    const f = px > 0 ? px : fittedType(el, gl, 12);
    if (px > 0) gl.setCtx({ px });
    if (!dirty && W === drawnW && f === drawnF) return;
    drawnW = W; drawnF = f; dirty = false;
    const L = forestLayout(trials, W, f, textW, { highlight, selected, notes });
    gl.show(layoutTree(L, W, forestWords(trials)), false);
    el.style.height = `${L.H}px`;   // (its height follows its width and what it shows only)
    hitBox.replaceChildren(...L.hits.map((q) => {
      const t = trials.find((x) => x.id === q.id);
      return h('button', { type: 'button', class: 'tf-hit', 'data-id': q.id, 'aria-pressed': String(q.id === selected), 'aria-label': t ? `${t.short ?? t.name}` : q.id, style: { top: `${q.y}px`, height: `${q.h}px` } });
    }));
  }
  function select(id, tell = false) {
    if (id === selected) return;
    selected = id; dirty = true; draw();
    if (tell) onSelect?.(id);
  }
  hitBox.addEventListener('click', (e) => { const b = e.target.closest?.('.tf-hit'); if (b) select(b.dataset.id, true); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    configure({ ids = [], highlight: hl = null, selected: s = null, notes: n = null } = {}) {
      trials = ids.map((id) => trialOf(id)).filter(Boolean);
      highlight = hl; selected = s; notes = n; dirty = true;
      el.setAttribute('aria-label', forestWords(trials));
      if (trials.length) draw(); else { gl.clear?.(); hitBox.replaceChildren(); }
    },
    select: (id) => select(id, false),
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
