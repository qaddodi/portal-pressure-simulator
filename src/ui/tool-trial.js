// The trial card (deck feature 39, 11 Nov 2026; design A, "the two numbers", Mohammad 14 Nov 2026): one landmark trial, a record in trials.js
// (its numbers, each read from the abstract: guidelines/trials.md). On a slide (tool { kind: 'trial', id }) it is the slide's instrument card, one more
// kind of instrument a deck can use, placed where every instrument card goes (Mohammad, 14 Nov 2026). From the top:
//   the trial's name, and its source line (journal year · first author · people randomized)
//   what was counted, and for how long
//   each arm's share as a large number (the treated arm first), with its name and the people in it; two arms side by side, or three, or one
//   under another where their names would not fit side by side
//   each arm's share as a bar on one 0 to 100% scale, in the arm's colour (the treated arm s1, a control the muted tone); Kaplan–Meier rates say so
//   the trial's own effect (its ratio and interval as reported, or its P value), and a caveat when there is one
//   for a trial whose numbers have not been read against its paper, a line that says so
//   on a slide, one line on whether the slide's patient fits the trial (trial-fit.js), set when the slide's patient changes, never per frame
// One base type size (the host's), told apart by weight and colour as the other cards' words
// are. The card is a model drawn on the GPU (svg-gl.js: the same tree, of plain elements, never painted by the browser) and drawn again only
// when its width, its type size or its fit line changes; its height follows those only.

import { h, isPhoneLayout } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { trialOf, trialSource } from './trials.js';
import { TYPE } from './chart-looks/trial.js';
import { fitTrial, metricsOfFp, lcFirst, possiblyWords, fitsWords, groupOf } from './trial-fit.js';

// (B17, play-test 16 Nov 2026: the footnote and the eligibility paragraph were cut with "…", which hid the caveats a trial is read with ("not a carvedilol-only trial", "wider than today's criteria").
// A trial card never cuts its words: every field takes the lines it needs and the card is as tall as they make it (the host sizes it from trialLayout's H). wrapWords still takes a limit for the
// cards whose words are labels, never for these.)
export const ALL_LINES = Infinity;
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

const two = (x) => (Number.isFinite(x) ? x.toFixed(Math.max(2, Math.min(3, (String(x).split('.')[1] || '').length))) : '?');   // (three decimals where the paper gave three)
/** The trial's effect as reported: its own words (effect), else its first ratio and interval (ratios), else null. */
export function effectOf(t) {
  if (t.effect) return t.effect;
  const r = (t.ratios ?? [])[0];
  return r && Number.isFinite(r.est) ? `${r.kind} ${two(r.est)}${Number.isFinite(r.lo) && Number.isFinite(r.hi) ? ` (${two(r.lo)}–${two(r.hi)})` : ''}` : null;
}
/** What was counted, and for how long: "Decompensation or death, median 37 months". */
// (Not when the endpoint already names that time: "Alive at 6 weeks, 6 weeks" and "Alive at 18 months, up to 18 months" read it twice, LT-3.
// A follow-up of one time, its number and unit both in the endpoint, is that time.)
const TIME = /(\d[\d.]*)\s*(day|week|month|year)/gi;
export function sameTime(endpoint, followUp) {
  const f = [...String(followUp).matchAll(TIME)];
  if (f.length !== 1) return false;
  const [, n, u] = f[0], e = String(endpoint);
  return new RegExp(`\\b${n.replace('.', '\\.')}\\b`).test(e) && new RegExp(u, 'i').test(e);
}
export const endpointOf = (t) => (t.followUp && !sameTime(t.endpoint, t.followUp) ? `${t.endpoint}, ${lcFirst(t.followUp)}` : t.endpoint);
/** The fit line's words for fitTrial's answer, or null when there is none. */
export function fitWords(fit) {
  if (!fit) return null;
  if (fit.verdict === 'fits') return fitsWords(fit);
  if (fit.verdict === 'no') {
    const r = (fit.rows ?? []).find((x) => x?.state === 'no');
    if (!r?.rule) return 'Does not fit';
    const v = typeof r.value === 'string' || Number.isFinite(r.value) ? ` (this patient: ${r.value})` : '';
    return `Does not fit: ${lcFirst(String(r.rule))}${v}`;
  }
  return groupOf(fit) === 'possible' ? possiblyWords(fit) : 'Cannot tell from the model';
}

/** The card's drawing for trial t at width W, base type size f: the words [{ x, y, t, look, anchor }], the rectangles [{ x, y, w, h, r, look, tone? }]
 *  (a disc is a rectangle rounded to a circle), the strokes [{ d, look, tone? }] and the height H. meas(text, font) → px (glyph-measure.js).
 *  fit: fitTrial's answer for the slide's patient, or null for no fit line. Pure: the same trial, width, size and fit always give the same drawing. */
// opts.head false: no name or source line (the Tests card's open trial, whose row already names it). opts.zero: every bar drawn at no width, the
// drawing a grow starts from (createTrial's grow: the bars then glide to their shares, svg-morph.js). opts.compact: the phone's card (LT-1, 16 Nov
// 2026): the two large numbers carry the arms without their bars or their people (the source line keeps the trial's size), "Kaplan–Meier" joins
// what was counted, so the card fits beside the words and the figure instead of coming in closed to its handle.
const NO_OPTS = Object.freeze({});
export function trialLayout(t, W, f, meas, fit = null, { head = true, zero = false, compact = false } = NO_OPTS) {
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
  if (head) {
    // (Compact, the phone's slide card: its own header, a line above, already says the trial's name in capitals, so it is not drawn a second
    // time: 22 px more room for the words' card, which takes its size from what the data card leaves it, 17 Nov 2026. The spoken name stays.)
    if (!compact) { lines(t.name, 'trial.name', ALL_LINES); y += f * 0.15; }
    lines(`${trialSource(t)} · ${t.n} randomized`, 'trial.src', ALL_LINES);
    y += f * 0.35;
  }
  lines(compact && t.km ? `${endpointOf(t)} (Kaplan–Meier)` : endpointOf(t), 'trial.v', ALL_LINES);
  y += f * 0.9;
  // The arms' numbers: side by side where every arm's name, share and people fit their column, else one under another.
  const arms = t.arms, n = arms.length, cg = f * 1.2, cw = (W - cg * (n - 1)) / n, N = px('trial.pct'), L = px('trial.lab');
  const ks = Math.round(L * 0.62), kx = ks + f * 0.45, bh = Math.max(6, Math.round(f * 0.55)), pct = (a) => `${a.rate}%`;
  const bar = (a, by) => {
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'trial.track' });
    const w = zero ? 0 : (W * a.rate) / 100;
    if (w > 0 || (zero && a.rate > 0)) rects.push({ x: 0, y: by, w, h: bh, r: Math.min(bh, w) / 2, look: 'trial.bar', tone: TONE[a.side] || 'text-3' });
  };
  const people = (a) => !compact && a.n;
  // An arm's name as drawn: in full where its column holds it, else the arm's own short name (a.short: "LVP" for large-volume paracentesis, 17 Nov
  // 2026), so every two-arm card keeps its numbers side by side on a phone instead of one under another. null: neither fits, the arms stack.
  const nameOf = (a) => [a.label, a.short].find((s) => s && meas(s, font('trial.lab')) + kx <= cw) ?? null;
  const side = n <= 3 && arms.every((a) => nameOf(a) != null && meas(pct(a), font('trial.pct')) <= cw && (!people(a) || meas(`n = ${a.n}`, font('trial.n')) <= cw));
  if (side) {
    let foot = y;
    arms.forEach((a, i) => {
      const x = i * (cw + cg), tone = TONE[a.side] || 'text-3';
      rects.push({ x, y: y + L * 0.32, w: ks, h: ks, r: ks * 0.25, look: 'trial.key', tone });
      say(x + kx, y + L, nameOf(a), 'trial.lab');
      const nb = y + lh('trial.lab') + f * 0.2 + N * 0.76;
      say(x, nb, pct(a), 'trial.pct');
      let b = nb;
      if (people(a)) { b = nb + f * 0.45 + px('trial.n'); say(x, b, `n = ${a.n}`, 'trial.n'); }
      foot = Math.max(foot, b + f * 0.3);
    });
    y = foot + f * 0.6;
    if (compact) y -= f * 0.4;
    else for (const a of arms) { bar(a, y); y += bh + f * 0.4; }
  } else {
    for (const a of arms) {
      lines(a.label, 'trial.lab', ALL_LINES);
      const nb = y + f * 0.2 + N * 0.76;
      say(0, nb, pct(a), 'trial.pct');
      if (people(a)) say(meas(pct(a), font('trial.pct')) + f * 0.6, nb, `n = ${a.n}`, 'trial.n');
      y = nb + f * 0.55;
      if (!compact) { bar(a, y); y += bh; }
      y += f * 0.8;
    }
    y -= f * 0.4;
  }
  if (t.km && !compact) { y += f * 0.1; lines('Rates are Kaplan–Meier estimates', 'trial.src', 1); }
  const eff = effectOf(t);
  if (eff) { y += f * 0.5; lines(eff, 'trial.eff', ALL_LINES); }
  if (t.note) { y += f * 0.3; lines(t.note, 'trial.note', ALL_LINES); }
  if (t.status !== 'checked') { y += f * 0.3; lines(UNCHECKED, 'trial.warn', 1); }
  const fw = fitWords(fit);
  if (fw) {
    y += f * 0.9;
    const d = Math.round(px('trialfit.t') * 1.15), tx = d + f * 0.55, top = y;
    const L0 = lines(fw, 'trialfit.t', ALL_LINES, tx);
    const cy = top + (L0.length > 1 ? lh('trialfit.t') / 2 : (y - top) / 2) + px('trialfit.t') * 0.04, r = d / 2, cx = r;
    // (Never the filled accent badge with a check: "matches the modeled criteria" is not an eligibility verdict, so it wears the same quiet ring as the others, R01.)
    rects.push({ x: 0.75, y: cy - r + 0.75, w: d - 1.5, h: d - 1.5, r: r - 0.75, look: 'trialfit.ring' });
    const q = r * 0.36;
    paths.push({ d: fit.verdict === 'no' ? `M${(cx - q).toFixed(2)} ${(cy - q).toFixed(2)} L${(cx + q).toFixed(2)} ${(cy + q).toFixed(2)} M${(cx + q).toFixed(2)} ${(cy - q).toFixed(2)} L${(cx - q).toFixed(2)} ${(cy + q).toFixed(2)}`
      : fit.verdict === 'fits' ? `M${(cx - r * 0.34).toFixed(2)} ${(cy + r * 0.02).toFixed(2)} L${(cx - r * 0.08).toFixed(2)} ${(cy + r * 0.28).toFixed(2)} L${(cx + r * 0.36).toFixed(2)} ${(cy - r * 0.24).toFixed(2)}`
      : `M${(cx - q).toFixed(2)} ${cy.toFixed(2)} L${(cx + q).toFixed(2)} ${cy.toFixed(2)}`, look: 'trialfit.x' });
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
export function fitOf(t, st, facts = null) {
  if (!t || !st?.fp) return null;
  try { return fitTrial(t, metricsOfFp(st.fp), st.params ?? null, facts) ?? null; } catch { return null; }
}

const sv = svgModel;
const textW = (s, font) => measure(s, font);
/** The card, in the instrument card's slot: its words at the host's own type size (chart-looks/index.js HOSTS.trial). */
// opts.head false: the drawing has no name or source line (trialLayout). grow(): the next drawing starts with its bars at no width and they glide to
// their shares (svg-morph.js, the same glide every chart uses; under Reduce Motion it fades in instead), the Tests card's open trial (TC-M5).
export function createTrial({ head = true } = NO_OPTS) {
  // (On a slide on a phone the card is drawn compact (trialLayout): the Tests card's open trial, headless, keeps every line.)
  const compactNow = () => head && isPhoneLayout();
  const el = h('div', { class: 'pz-trial', role: 'group' });
  const gl = createSvgGL(el, { host: 'trial' });
  let trial = null, fit = null, drawnW = 0, drawnF = 0, drawnC = false, growing = false;
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!trial || !W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    const compact = compactNow();
    if (W === drawnW && f === drawnF && compact === drawnC) return;
    drawnW = W; drawnF = f; drawnC = compact;
    if (growing) {
      growing = false;
      gl.show(treeOf(trialLayout(trial, W, f, textW, fit, { head, zero: true, compact }), W), false);
      gl.show(treeOf(trialLayout(trial, W, f, textW, fit, { head, compact }), W), true);
      return;
    }
    gl.show(treeOf(trialLayout(trial, W, f, textW, fit, { head, compact }), W), false);
  }
  function treeOf(L, W) {
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width only, so the card never changes size with the slide)
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look, ...(r.tone ? { 'data-p-tone': r.tone } : {}) })),
      ...L.paths.map((p) => sv('path', { d: p.d, 'data-look': p.look, ...(p.tone ? { 'data-p-tone': p.tone } : {}) })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    return sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': trialWords(trial, fit) }, ...kids);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    /** t: the slide's tool; ctx: the slide's context (presenter ctxOf: fp, params), whose patient the fit line is asked for. */
    configure(t, ctx = null) {
      const next = trialOf(t?.id);
      // (The entry rules are judged on the patient as enrolled, before the slide's treatment (ctx.enrolled), never after it: on carvedilol a
      // PREDESCI patient's HVPG is under 10 and with a stent in no TIPS trial would take him, LT-2.)
      if (ctx) { const f2 = fitOf(next, ctx.enrolled ?? ctx, t?.facts ?? null); if (fitWords(f2) !== fitWords(fit)) drawnW = 0; fit = f2; }
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
    /** Gives the box the height its drawing will have at width W before it is in the page, so what is under it is laid out once, in its
     *  place (TC-M5: the Tests card's open trial grew after it had come in). The drawing itself comes once the box is in the page. */
    prime(W) {
      if (!trial || !(W > 0)) return;
      el.style.height = `${trialLayout(trial, W, fittedType(el, gl, 12), textW, fit, { head, compact: compactNow() }).H}px`;
    },
    /** The next drawing grows its bars from nothing (a trial just opened). */
    grow() { growing = true; drawnW = 0; if (trial) draw(); },
    clear() {},
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
