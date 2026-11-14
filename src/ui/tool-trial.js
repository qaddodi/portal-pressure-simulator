// The trial card (deck feature 39, 11 Nov 2026; design A, "the two numbers", Mohammad 14 Nov 2026): one landmark trial, a record in trials.js
// (its numbers, each read from the abstract: guidelines/trials.md). On a slide (tool { kind: 'trial', id }) the card stands under the teaching
// card's words, not in the data card (trialBelow): the data card keeps its tiles. From the top:
//   the trial's name, and its source line (journal year · first author · people randomized)
//   what was counted, and for how long
//   each arm's share as a large number (the treated arm first), with its name and the people in it; two arms side by side, or three, or one
//   under another where their names would not fit side by side
//   each arm's share as a bar on one 0 to 100% scale, in the arm's colour (the treated arm s1, a control the muted tone); Kaplan–Meier rates say so
//   the trial's own effect (its ratio and interval as reported, or its P value), and a caveat when there is one
//   for a trial whose numbers have not been read against its paper, a line that says so
//   on a slide, one line on whether the slide's patient fits the trial (trial-fit.js), set when the slide's patient changes, never per frame
// One base type size (the host's; under the words, the teaching card's caption size), told apart by weight and colour as the other cards' words
// are. The card is a model drawn on the GPU (svg-gl.js: the same tree, of plain elements, never painted by the browser) and drawn again only
// when its width, its type size or its fit line changes; its height follows those only.

import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType, chartCtx } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { trialOf, trialSource } from './trials.js';
import { TYPE } from './chart-looks/trial.js';
import { fitTrial } from './trial-fit.js';

export const TRIAL_LINES = 2;   // (the most lines a field's words take; more are cut with an ellipsis)
export const NOTE_LINES = 3;
export const UNCHECKED = 'Not yet checked against the paper';
const TONE = { treat: 's1', control: 'text-3' };

/** Whether a deck's tool names a trial the card can draw. */
export const trialTool = (t) => !!trialOf(t?.id);

/** A slide with a trial tool, as the presenter shows it: the trial moved out of the data card (tool) to under the teaching card's words (trial),
 *  so a slide's data card keeps only its tiles. Any other slide comes back as it is. */
export function trialBelow(s) {
  if (s?.tool?.kind !== 'trial') return s;
  const { tool, ...r } = s;
  return { ...r, trial: tool };
}

/** Words cut into lines no wider than w (greedy, at the given weight and size); at most `max` lines, the last ending in an ellipsis when words were left. */
export function wrapWords(text, w, f, wt, meas, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean), all = [];
  const fits = (s) => meas(s, `${wt} ${f}px Inter`) <= w + 1e-6;
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (fits(next) || !cur) cur = next;
    else { all.push(cur); cur = word; }
  }
  if (cur) all.push(cur);
  if (all.length <= max) return all;
  const out = all.slice(0, max);
  let s = `${out[max - 1]}…`;
  while (s.length > 2 && !fits(s)) s = `${s.slice(0, -2)}…`;
  out[max - 1] = s;
  return out;
}

const lcFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const two = (x) => (Number.isFinite(x) ? x.toFixed(2) : '?');
/** The trial's effect as reported: its own words (effect), else its first ratio and interval (ratios), else null. */
export function effectOf(t) {
  if (t.effect) return t.effect;
  const r = (t.ratios ?? [])[0];
  return r && Number.isFinite(r.est) ? `${r.kind} ${two(r.est)}${Number.isFinite(r.lo) && Number.isFinite(r.hi) ? ` (${two(r.lo)}–${two(r.hi)})` : ''}` : null;
}
/** What was counted, and for how long: "Decompensation or death, median 37 months". */
export const endpointOf = (t) => (t.followUp ? `${t.endpoint}, ${lcFirst(t.followUp)}` : t.endpoint);
/** The fit line's words for fitTrial's answer, or null when there is none. */
export function fitWords(fit) {
  if (!fit) return null;
  if (fit.verdict === 'fits') return 'The patient on this slide fits';
  if (fit.verdict === 'no') {
    const r = (fit.rows ?? []).find((x) => x?.state === 'no');
    if (!r?.rule) return 'Does not fit';
    const v = typeof r.value === 'string' || Number.isFinite(r.value) ? ` (this patient: ${r.value})` : '';
    return `Does not fit: ${lcFirst(String(r.rule))}${v}`;
  }
  return 'Cannot tell from the model';
}

/** The card's drawing for trial t at width W, base type size f: the words [{ x, y, t, look, anchor }], the rectangles [{ x, y, w, h, r, look, tone? }]
 *  (a disc is a rectangle rounded to a circle), the strokes [{ d, look, tone? }] and the height H. meas(text, font) → px (glyph-measure.js).
 *  fit: fitTrial's answer for the slide's patient, or null for no fit line. Pure: the same trial, width, size and fit always give the same drawing. */
export function trialLayout(t, W, f, meas, fit = null) {
  const texts = [], rects = [], paths = [];
  const px = (look) => TYPE[look][1] * f, font = (look) => `${TYPE[look][0]} ${px(look)}px Inter`, lh = (look) => px(look) * 1.32;
  const say = (x, y, s, look, anchor = 'start') => texts.push({ x, y, t: s, look, anchor });
  let y = 0;
  // Words wrapped to width w at x, from y down; y moves past them.
  const lines = (s, look, max, x = 0, w = W - x) => {
    const L = wrapWords(s, w, px(look), TYPE[look][0], meas, max);
    L.forEach((l, i) => say(x, y + px(look) + i * lh(look), l, look));
    y += L.length * lh(look);
    return L;
  };
  lines(t.name, 'trial.name', TRIAL_LINES);
  y += f * 0.15;
  lines(`${trialSource(t)} · ${t.n} randomized`, 'trial.src', TRIAL_LINES);
  y += f * 0.35;
  lines(endpointOf(t), 'trial.v', TRIAL_LINES);
  y += f * 0.9;
  // The arms' numbers: side by side where every arm's name, share and people fit their column, else one under another.
  const arms = t.arms, n = arms.length, cg = f * 1.2, cw = (W - cg * (n - 1)) / n, N = px('trial.pct'), L = px('trial.lab');
  const ks = Math.round(L * 0.62), kx = ks + f * 0.45, bh = Math.max(6, Math.round(f * 0.55)), pct = (a) => `${a.rate}%`;
  const bar = (a, by) => {
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'trial.track' });
    const w = (W * a.rate) / 100;
    if (w > 0) rects.push({ x: 0, y: by, w, h: bh, r: Math.min(bh, w) / 2, look: 'trial.bar', tone: TONE[a.side] || 'text-3' });
  };
  const side = n <= 3 && arms.every((a) => meas(a.label, font('trial.lab')) + kx <= cw && meas(pct(a), font('trial.pct')) <= cw && (!a.n || meas(`n = ${a.n}`, font('trial.n')) <= cw));
  if (side) {
    let foot = y;
    arms.forEach((a, i) => {
      const x = i * (cw + cg), tone = TONE[a.side] || 'text-3';
      rects.push({ x, y: y + L * 0.32, w: ks, h: ks, r: ks * 0.25, look: 'trial.key', tone });
      say(x + kx, y + L, a.label, 'trial.lab');
      const nb = y + lh('trial.lab') + f * 0.2 + N * 0.76;
      say(x, nb, pct(a), 'trial.pct');
      let b = nb;
      if (a.n) { b = nb + f * 0.45 + px('trial.n'); say(x, b, `n = ${a.n}`, 'trial.n'); }
      foot = Math.max(foot, b + f * 0.3);
    });
    y = foot + f * 0.6;
    for (const a of arms) { bar(a, y); y += bh + f * 0.4; }
  } else {
    for (const a of arms) {
      lines(a.label, 'trial.lab', 1);
      const nb = y + f * 0.2 + N * 0.76;
      say(0, nb, pct(a), 'trial.pct');
      if (a.n) say(meas(pct(a), font('trial.pct')) + f * 0.6, nb, `n = ${a.n}`, 'trial.n');
      y = nb + f * 0.55;
      bar(a, y);
      y += bh + f * 0.8;
    }
    y -= f * 0.4;
  }
  if (t.km) { y += f * 0.1; lines('Rates are Kaplan–Meier estimates', 'trial.src', 1); }
  const eff = effectOf(t);
  if (eff) { y += f * 0.5; lines(eff, 'trial.eff', TRIAL_LINES); }
  if (t.note) { y += f * 0.3; lines(t.note, 'trial.note', W < 400 ? 2 : NOTE_LINES); }
  if (t.status !== 'checked') { y += f * 0.3; lines(UNCHECKED, 'trial.warn', 1); }
  const fw = fitWords(fit);
  if (fw) {
    y += f * 0.9;
    const d = Math.round(px('trialfit.t') * 1.15), tx = d + f * 0.55, top = y;
    const L0 = lines(fw, 'trialfit.t', 3, tx);
    const cy = top + (L0.length > 1 ? lh('trialfit.t') / 2 : (y - top) / 2) + px('trialfit.t') * 0.04, r = d / 2, cx = r;
    if (fit.verdict === 'fits') {
      rects.push({ x: 0, y: cy - r, w: d, h: d, r, look: 'trialfit.mk' });
      paths.push({ d: `M${(cx - r * 0.42).toFixed(2)} ${(cy + r * 0.02).toFixed(2)} L${(cx - r * 0.1).toFixed(2)} ${(cy + r * 0.34).toFixed(2)} L${(cx + r * 0.45).toFixed(2)} ${(cy - r * 0.3).toFixed(2)}`, look: 'trialfit.tick' });
    } else {
      rects.push({ x: 0.75, y: cy - r + 0.75, w: d - 1.5, h: d - 1.5, r: r - 0.75, look: 'trialfit.ring' });
      const q = r * 0.36;
      paths.push({ d: fit.verdict === 'no' ? `M${(cx - q).toFixed(2)} ${(cy - q).toFixed(2)} L${(cx + q).toFixed(2)} ${(cy + q).toFixed(2)} M${(cx + q).toFixed(2)} ${(cy - q).toFixed(2)} L${(cx - q).toFixed(2)} ${(cy + q).toFixed(2)}`
        : `M${(cx - q).toFixed(2)} ${cy.toFixed(2)} L${(cx + q).toFixed(2)} ${cy.toFixed(2)}`, look: 'trialfit.x' });
    }
    y = Math.max(y, cy + r);
  }
  return { texts, rects, paths, H: Math.ceil(y + f * 0.35) };
}

/** The card's spoken summary (and, on a slide, whether the patient fits). */
export function trialWords(t, fit = null) {
  const eff = effectOf(t), fw = fitWords(fit);
  return `${t.name}, ${trialSource(t)}. ${t.setting}. ${t.endpoint}: ${t.arms.map((a) => `${a.label} ${a.rate}%`).join(', ')}${t.km ? ' (Kaplan–Meier)' : ''}.${eff ? ` ${eff}.` : ''}${fw ? ` ${fw}.` : ''}${t.status === 'checked' ? '' : ` ${UNCHECKED}.`}`;
}

/** fitTrial's answer for trial t on a slide's state ({ fp, params }: the slide's own patient, the fingerprint the tiles read), or null when it
 *  cannot be asked (no state yet) or throws. */
export function fitOf(t, st) {
  if (!t || !st?.fp) return null;
  try { return fitTrial(t, st.fp, st.params ?? null) ?? null; } catch { return null; }
}

const sv = svgModel;
const textW = (s, font) => measure(s, font);
/** The card. base: one of the card's type sizes (card-scale.js: 'cap' under the teaching card's words) its words grow to; else the host's own. */
export function createTrial({ base = null } = {}) {
  const el = h('div', { class: 'pz-trial', role: 'group' });
  const gl = createSvgGL(el, { host: 'trial' });
  let trial = null, fit = null, drawnW = 0, drawnF = 0;
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!trial || !W || !el.isConnected) return;
    let boost = 12;
    if (base) { try { boost = Math.max(12, chartCtx(el).scale[base] || 0); } catch { /* (no card round it yet) */ } }
    const f = fittedType(el, gl, boost);
    if (W === drawnW && f === drawnF) return;
    drawnW = W; drawnF = f;
    const L = trialLayout(trial, W, f, textW, fit);
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look, ...(r.tone ? { 'data-p-tone': r.tone } : {}) })),
      ...L.paths.map((p) => sv('path', { d: p.d, 'data-look': p.look, ...(p.tone ? { 'data-p-tone': p.tone } : {}) })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    gl.show(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': trialWords(trial, fit) }, ...kids), false);
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width only, so the card never changes size with the slide)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    configure(t) {
      const next = trialOf(t?.id);
      if (next !== trial) { trial = next; drawnW = 0; }
      el.setAttribute('aria-label', trial ? trialWords(trial, fit) : '');
      if (trial) draw(); else gl.clear?.();
    },
    /** The slide's patient against the trial (fitTrial's answer, or null): drawn again only when the line's words change. */
    setFit(next) {
      if (fitWords(next) === fitWords(fit)) { fit = next; return; }
      fit = next; drawnW = 0;
      if (trial) { el.setAttribute('aria-label', trialWords(trial, fit)); draw(); }
    },
    clear() {},
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}

/** The trial card under a slide's teaching card (a slide's trial, trialBelow): its element, and show(st) with the slide's state, called once
 *  the element is in the card (its first drawing reads its width) and again when the slide's patient changes. Null for a trial the app lacks. */
export function trialUnder(tool) {
  const t = trialOf(tool?.id);
  if (!t) return null;
  const card = createTrial({ base: 'cap' });
  return {
    el: h('div', { class: 'pz-trialcard' }, card.el),
    show(st) { card.setFit(fitOf(t, st)); card.configure(tool); },
    dispose() { card.dispose(); },
  };
}
