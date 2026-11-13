// The span ruler (tool: { kind: 'spans' }; the gradients talk, Option A, Mohammad 13 Nov 2026: "Yes I love it. Do it";
// /mnt/project-files/gradients-deck-recs/). What each gradient sees: where the pressure is lost on the way from the portal vein to the IVC,
// and which of the three gradients holds that loss between its two readings.
//   bars      four zones between five stations (PV, LPV, the wedge, the hepatic vein, the IVC): Portal vein, Portal tracts, Sinusoids, To the IVC,
//             each a bar of the pressure lost across it (pv − lpv, lpv − whvp, whvp − fhvp, fhvp − ivc, mmHg). The largest drop, when it is
//             ≥ RES_MIN, is the resistance: its bar red, a faint column under it through the lanes, the word over it.
//   lanes     HVPG (wedge to hepatic vein), EUS-PPG (left portal vein to hepatic vein), PPG (portal vein to IVC): a bracket between its two
//             stations, in its rating's colour (HVPG and EUS-PPG on the HVPG's cut-offs, the PPG on its own: pressure-cuts.js). A bracket that
//             leaves out the resistance is dashed and quiet, tagged "Misses"; one that holds it but leaves out another drop ≥ RES_MIN is tagged
//             "Misses part"; with the hepatic veins clotted (hvBlocked) the HVPG and EUS-PPG lanes are hatched, "Cannot be read".
//   empty     tool option empty: true (the talk's first slide, before any reading): the stations and lanes alone, no bars, a quiet line.
// The readings themselves stand in the card's header row (the slide's tiles), not here. The card is a model drawn on the GPU (svg-gl.js:
// the same tree, of plain elements, never painted by the browser). Its height follows its width and type size only, so it is one size for
// every patient; a new patient on a kept card glides the bars and brackets (svg-morph.js), a new width draws it afresh.

import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { store } from './store.js';
import { hvpgSev, ppgSev, hvBlocked, RATE_OF_SEV } from '../engine/pressure-cuts.js';
import { wrapWords } from './tool-trial.js';

/** The least drop across a zone (mmHg) that counts as resistance. */
export const RES_MIN = 3;
/** The bars' full height, mmHg (a larger drop is drawn at full height, its number still its own). */
export const DROP_MAX = 22;
export const STATIONS = [['PV', 'tr-pv'], ['LPV', 'tr-pv'], ['Wedge', 'tr-wedge'], ['HV', 'tr-hv'], ['IVC', 'tr-ivc']];
export const ZONES = ['Portal vein', 'Portal tracts', 'Sinusoids', 'To the IVC'];
const ZONE_SAY = ['the portal vein', 'the portal tracts', 'the sinusoids', 'the hepatic vein outflow'];
/** The three gradients: key (fingerprint), name, the stations it reads between, its rating. */
export const LANES = [
  { key: 'hvpg', name: 'HVPG', a: 2, b: 3, sev: hvpgSev, from: 'the wedge', to: 'the hepatic vein' },
  { key: 'eus', name: 'EUS-PPG', a: 1, b: 3, sev: hvpgSev, from: 'the left portal vein', to: 'the hepatic vein' },
  { key: 'ppg', name: 'PPG', a: 0, b: 4, sev: ppgSev, from: 'the portal vein', to: 'the IVC' },
];
export const TAGS = { miss: 'Misses', part: 'Misses part', blank: 'Cannot be read' };
export const EMPTY_NOTE = 'The drops appear once the readings are taken';

const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
/** What the ruler shows for a fingerprint: the four drops, the resistance's zone (−1: none), and each lane's reading, rating and state
 *  ('hit', 'part', 'miss', 'blank'). empty: no reading yet. blocked: the hepatic veins take no catheter or needle. Pure. */
export function spansState(fp, { empty = false, blocked = false } = {}) {
  const P = [num(fp?.pv), num(fp?.lpv), num(fp?.whvp), num(fp?.fhvp), num(fp?.ivc)];
  const known = !empty && P.every((v) => v != null);
  const drops = known ? P.slice(0, 4).map((v, i) => Math.max(0, v - P[i + 1])) : null;
  let res = -1;
  if (drops) { const mx = Math.max(...drops); if (mx >= RES_MIN) res = drops.indexOf(mx); }
  const big = drops ? drops.map((d) => d >= RES_MIN) : [false, false, false, false];
  const lanes = LANES.map((L) => {
    const blank = !empty && blocked && L.key !== 'ppg';
    const v = empty || blank ? null : num(fp?.[L.key]);
    const rate = v == null ? null : RATE_OF_SEV[L.sev(v)];
    const holds = (z) => z >= L.a && z < L.b;
    let st = blank ? 'blank' : 'hit';
    if (!blank && res >= 0) {
      if (!holds(res)) st = 'miss';
      else if (big.some((b, z) => b && !holds(z))) st = 'part';
    }
    return { key: L.key, name: L.name, a: L.a, b: L.b, v, rate, st };
  });
  return { empty: !!empty || !known, drops, res, lanes };
}

/** The ruler's drawing at width W, type size f: { texts, rects, lines, circles, hatches, H }. meas(text, font) → px. Pure, and H depends
 *  on W and f only, never on the patient. */
export function spansLayout(S, W, f, meas) {
  const texts = [], rects = [], lines = [], circles = [], hatches = [];
  const say = (x, y, t, look, anchor = 'start', tone) => texts.push({ x, y, t, look, anchor, tone });
  const wide = (s, wt = 650) => meas(s, `${wt} ${f}px Inter`);
  const gw = Math.ceil(Math.max(...LANES.map((L) => wide(L.name)), wide('mmHg', 500)) + f * 0.9);
  const r = f * 0.36;
  const x0 = gw + Math.max(r, wide('PV') / 2) + 1, x1 = W - Math.max(f * 0.6, wide('IVC') / 2 + 1);
  const zw = (x1 - x0) / 4, SX = [0, 1, 2, 3, 4].map((i) => x0 + i * zw);
  const yRes = f, barTop = f * 2.7, barH = Math.round(Math.min(f * 6, Math.max(f * 3.5, W * 0.17))), BASE = barTop + barH;
  const zLh = f * 1.2, zoneY = BASE + f * 1.25, zoneEnd = BASE + f * 0.35 + 2 * zLh;
  const stY = zoneEnd + f * 1.35, dotY = stY + f * 0.75;
  const laneY = [0, 1, 2].map((i) => dotY + f * 1.9 + i * f * 2);
  const H = Math.ceil(laneY[2] + f * 1.1);
  // The resistance's column and word, under everything else
  if (S.res >= 0) {
    rects.push({ x: SX[S.res] + 2, y: 0, w: zw - 4, h: H, r: f * 0.4, look: 'spans.col' });
    say(SX[S.res] + zw / 2, yRes, 'Resistance', 'spans.res', 'middle');
  }
  // The bars and their drops, or the empty ruler's note
  say(0, barTop + f * 0.9, 'mmHg', 'spans.unit');
  say(0, barTop + f * 2.1, 'lost', 'spans.unit');
  lines.push({ x1: SX[0], y1: BASE, x2: SX[4], y2: BASE, look: 'spans.base' });
  if (S.drops) {
    const bw = Math.min(zw * 0.42, f * 2.6);
    S.drops.forEach((d, i) => {
      const hgt = d > 0 ? Math.max(1.5, (Math.min(d, DROP_MAX) / DROP_MAX) * barH) : 0, cx = SX[i] + zw / 2, isRes = i === S.res;
      rects.push({ x: cx - bw / 2, y: BASE - hgt, w: bw, h: hgt, r: Math.min(3, bw / 4), look: isRes ? 'spans.bar.res' : 'spans.bar' });
      say(cx, BASE - hgt - f * 0.35, d.toFixed(1), isRes ? 'spans.v.res' : 'spans.v', 'middle');
    });
  } else {
    wrapWords(EMPTY_NOTE, SX[4] - SX[0], f, 500, meas, 2).forEach((s, i, a) => say((SX[0] + SX[4]) / 2, BASE - barH / 2 + f * 0.36 + (i - (a.length - 1) / 2) * zLh, s, 'spans.note', 'middle'));
  }
  ZONES.forEach((z, i) => wrapWords(z, zw - f * 0.3, f, 500, meas, 2).forEach((s, k) => say(SX[i] + zw / 2, zoneY + k * zLh, s, 'spans.zone', 'middle')));
  // The stations: the line they sit on, a guide from each down to the lowest bracket that starts or ends there, the dots and their names
  lines.push({ x1: SX[0], y1: dotY, x2: SX[4], y2: dotY, look: 'spans.track' });
  STATIONS.forEach(([, tone], i) => {
    let low = -1;
    S.lanes.forEach((L, k) => { if ((L.a === i || L.b === i) && L.st !== 'blank') low = k; });
    if (low >= 0) lines.push({ x1: SX[i], y1: dotY + r + 2, x2: SX[i], y2: laneY[low] - f * 0.55, look: 'spans.guide', tone });
  });
  STATIONS.forEach(([n, tone], i) => {
    circles.push({ cx: SX[i], cy: dotY, r, look: 'spans.dot', tone });
    say(SX[i], stY, n, 'spans.st', 'middle', tone);
  });
  // The lanes
  S.lanes.forEach((L, k) => {
    const y = laneY[k], xa = SX[L.a], xb = SX[L.b];
    say(0, y + f * 0.36, L.name, 'spans.lane');
    if (L.st === 'blank') {
      rects.push({ x: xa, y: y - f * 0.5, w: xb - xa, h: f, r: 3, look: 'spans.blank' });
      hatches.push({ x: xa, y: y - f * 0.5, w: xb - xa, h: f, step: f * 0.5 });
    } else {
      const miss = L.st === 'miss';
      lines.push({ x1: xa, y1: y, x2: xb, y2: y, look: miss ? 'spans.br.miss' : 'spans.br', rate: miss ? null : L.rate });
      for (const x of [xa, xb]) lines.push({ x1: x, y1: y - f * 0.45, x2: x, y2: y + f * 0.45, look: miss ? 'spans.tick.miss' : 'spans.tick', rate: miss ? null : L.rate });
    }
    const tag = TAGS[L.st];
    if (tag) {
      const tw = wide(tag, 600) + f, th = f * 1.35;
      const cx = L.st === 'blank' ? (xa + xb) / 2 : Math.max(SX[0] + tw / 2, (SX[0] + xa) / 2);
      rects.push({ x: cx - tw / 2, y: y - th / 2, w: tw, h: th, r: th / 2, look: 'spans.tag' });
      say(cx, y + f * 0.36, tag, 'spans.tagw', 'middle');
    }
  });
  return { texts, rects, lines, circles, hatches, H };
}

const fmt1 = (v) => `${v.toFixed(1)} mmHg`;
/** The ruler's spoken summary. */
export function spansWords(S) {
  const spans = LANES.map((L) => `${L.name} from ${L.from} to ${L.to}`).join(', ');
  if (S.empty) return `Where each reading sits: ${spans}. No reading yet.`;
  const where = S.res >= 0 ? `The resistance lies in ${ZONE_SAY[S.res]}, ${fmt1(S.drops[S.res])} of the drop.` : 'No zone holds a drop ≥3 mmHg.';
  const say = S.lanes.map((L) => (L.st === 'blank' ? `${L.name} cannot be read` : `${L.name} ${fmt1(L.v ?? 0)}${L.st === 'miss' ? ', misses it' : L.st === 'part' ? ', misses part of it' : ''}`)).join('; ');
  return `Where each reading sits. ${where} ${say}.`;
}

const sv = svgModel;
let uid = 0;
/** The ruler's model tree for a layout (the hatching clipped to its lane's box). */
export function spansTree(L, W, label, id) {
  const tone = (o) => (o.tone ? { 'data-p-c': o.tone } : {});
  const rate = (o) => (o.rate ? { 'data-rate': o.rate } : {});
  const defs = [], hatch = [];
  L.hatches.forEach((b, i) => {
    const cid = `spans-${id}-${i}`;
    defs.push(sv('clipPath', { id: cid }, sv('rect', { x: b.x, y: b.y, width: b.w, height: b.h })));
    const ls = [];
    for (let x = b.x - b.h; x < b.x + b.w; x += b.step) ls.push(sv('line', { x1: x, y1: b.y + b.h, x2: x + b.h, y2: b.y, 'data-look': 'spans.hatch' }));
    hatch.push(sv('g', { 'clip-path': `url(#${cid})`, 'data-nomorph': '' }, ...ls));
  });
  return sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': label },
    sv('defs', {}, ...defs),
    ...L.rects.filter((r) => r.look === 'spans.col').map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
    ...hatch,
    ...L.rects.filter((r) => r.look !== 'spans.col' && r.look !== 'spans.tag').map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
    ...L.lines.map((l) => sv('line', { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, 'data-look': l.look, ...tone(l), ...rate(l) })),
    ...L.circles.map((c) => sv('circle', { cx: c.cx, cy: c.cy, r: c.r, 'data-look': c.look, ...tone(c) })),
    ...L.rects.filter((r) => r.look === 'spans.tag').map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
    ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look, ...tone(s) }, s.t)));
}

const textW = (s, font) => measure(s, font);
export function createSpans() {
  const el = h('div', { class: 'pz-spans', role: 'group' });
  const gl = createSvgGL(el, { host: 'spans' });
  const id = ++uid;
  let empty = false, fp = null, drawnW = 0, drawnF = 0, drawnKey = '';
  const keyOf = (S) => `${S.empty}|${S.res}|${S.drops ? S.drops.map((d) => d.toFixed(1)).join(',') : ''}|${S.lanes.map((L) => `${L.st}${L.rate}${L.v == null ? '' : L.v.toFixed(1)}`).join(',')}`;
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    const S = spansState(fp, { empty, blocked: hvBlocked(store.get().params) });
    const k = keyOf(S), fresh = W !== drawnW || f !== drawnF;
    if (!fresh && k === drawnKey) return;
    const glide = !fresh && !!drawnKey;
    drawnW = W; drawnF = f; drawnKey = k;
    const L = spansLayout(S, W, f, textW), words = spansWords(S);
    el.setAttribute('aria-label', words);
    gl.show(spansTree(L, W, words, id), glide);
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width and type only, so the card never changes size with the patient)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    configure(t, ctx) {
      const e = t?.empty === true;
      if (e !== empty) { empty = e; drawnKey = ''; }
      if (ctx?.fp) fp = ctx.fp;
      draw();
    },
    pin(next) { if (next) { fp = next; draw(); } },
    clear() {},
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
