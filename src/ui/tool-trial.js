// The trial card (deck feature 39, 11 Nov 2026; docs/recommendations/deck-content-and-new-decks.md): tool { kind: 'trial', id: 'predesci' }
// puts one landmark trial in the data card, so the teaching card keeps its words and no graph. The trial is a record in trials.js (its
// numbers, each read from the abstract: guidelines/trials.md):
//   Who          the people enrolled, in one line
//   Counted      what the percentages count
//   Followed     for how long
//   two bars     the share of each arm with the outcome, on one 0 to 100% scale, the treated arm first, with the people in each arm at the right
//   Effect       the trial's own effect size and interval, then a caveat when there is one
//   a source line, and, for a trial whose numbers have not been read against its paper, a line that says so
// A trial's numbers are not the model's: the card reads nothing from it, so it is the same on every patient and holds still. One type size
// (the host's), told apart by weight and colour as the other cards' words are. The card is a model drawn on the GPU (svg-gl.js: the same
// tree, of plain elements, never painted by the browser) and drawn again only when its width changes; its height follows its width only.

import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { trialOf, trialSource } from './trials.js';

export const TRIAL_LINES = 3;   // (the most lines a field's words take; more are cut with an ellipsis)
export const NOTE_LINES = 4;
export const UNCHECKED = 'Not yet checked against the paper';
const TONE = { treat: 's1', control: 'text-3' };

/** Whether a deck's tool names a trial the card can draw. */
export const trialTool = (t) => !!trialOf(t?.id);

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

/** The card's drawing for trial t at width W, type size f: the words [{ x, y, t, look, anchor }], the rectangles [{ x, y, w, h, r, look, tone? }]
 *  and the height H. meas(text, font) → px (glyph-measure.js). Pure: the same trial at the same width and size always gives the same drawing. */
export function trialLayout(t, W, f, meas) {
  const lh = f * 1.4, gap = f * 0.9, texts = [], rects = [];
  const say = (x, y, s, look, anchor = 'start') => texts.push({ x, y, t: s, look, anchor });
  const fields = (rows, y0, vx, vw) => {
    let y = y0;
    for (const [k, v, look, max] of rows) {
      if (!v) continue;
      const lines = wrapWords(v, vw, f, look === 'trial.eff' ? 650 : 500, meas, max);
      say(0, y + f, k, 'trial.k');
      lines.forEach((s, i) => say(vx, y + f + i * lh, s, look));
      y += lines.length * lh + f * 0.2;
    }
    return y;
  };
  const keys = ['Patients', 'Endpoint', 'Follow-up', 'Effect', 'Caveat'];
  const kw = Math.max(...keys.map((k) => meas(k, `500 ${f}px Inter`)));
  const vx = Math.ceil(kw + f), vw = Math.max(40, W - vx);
  let y = fields([['Patients', t.setting, 'trial.v', TRIAL_LINES], ['Endpoint', t.endpoint, 'trial.v', TRIAL_LINES], ['Follow-up', t.followUp, 'trial.v', TRIAL_LINES]], 0, vx, vw);
  y += gap;
  // The two arms: its name and people over a bar on a 0 to 100% track, the percent on the bar's end or just past it.
  const bh = Math.round(f * 1.7), pad = f * 0.5;
  for (const a of t.arms) {
    say(0, y + f, a.label, 'trial.arm');
    if (a.n) say(W, y + f, `n = ${a.n}`, 'trial.n', 'end');
    const by = y + f * 1.45, bw = Math.max(2, (W * a.rate) / 100), pct = `${a.rate}%`, pw = meas(pct, `700 ${f}px Inter`);
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'trial.track' });
    rects.push({ x: 0, y: by, w: bw, h: bh, r: bh / 2, look: 'trial.bar', tone: TONE[a.side] || 'text-3' });
    const inside = bw >= pw + 2 * pad + bh / 2;
    say(inside ? bw - pad - bh / 4 : bw + pad, by + bh / 2 + f * 0.36, pct, 'trial.pct', inside ? 'end' : 'start');
    y = by + bh + gap;
  }
  y = fields([['Effect', t.effect, 'trial.eff', TRIAL_LINES], ['Caveat', t.note, 'trial.v', NOTE_LINES]], y - f * 0.1, vx, vw);
  y += gap * 0.6;
  const src = wrapWords(`${trialSource(t)} · ${t.n} randomized`, W, f, 500, meas, 2);
  src.forEach((s, i) => say(0, y + f + i * lh, s, 'trial.src'));
  y += src.length * lh;
  if (t.status !== 'checked') { say(0, y + f + f * 0.1, UNCHECKED, 'trial.warn'); y += lh + f * 0.1; }
  return { texts, rects, H: Math.ceil(y + f * 0.3) };
}

/** The card's spoken summary. */
export function trialWords(t) {
  const [a, b] = t.arms;
  return `${t.name}, ${trialSource(t)}. ${t.setting}. ${t.endpoint}: ${a.label} ${a.rate}%, ${b.label} ${b.rate}%.${t.effect ? ` ${t.effect}.` : ''}${t.status === 'checked' ? '' : ` ${UNCHECKED}.`}`;
}

const sv = svgModel;
const textW = (s, font) => measure(s, font);
export function createTrial() {
  const el = h('div', { class: 'pz-trial', role: 'group' });
  const gl = createSvgGL(el, { host: 'trial' });
  let trial = null, drawnW = 0, drawnF = 0;
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!trial || !W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    if (W === drawnW && f === drawnF) return;
    drawnW = W; drawnF = f;
    const L = trialLayout(trial, W, f, textW);
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look, ...(r.tone ? { 'data-p-tone': r.tone } : {}) })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    gl.show(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': trialWords(trial) }, ...kids), false);
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width only, so the card never changes size with the slide)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    configure(t) {
      const next = trialOf(t?.id);
      if (next !== trial) { trial = next; drawnW = 0; }
      el.setAttribute('aria-label', trial ? trialWords(trial) : '');
      if (trial) draw(); else gl.clear?.();
    },
    clear() {},
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
