// The stiffness bar (Mohammad's review, 15 Nov 2026; mock "Instrument Card Mocks"): under the FibroScan number, Baveno VIII's rule of five as one bar from 0 to 30 kPa,
// its zones at 10, 15 and 25 (LSM_CUTS, the one copy), a tick at each step of 5, the patient's mark, and, when the platelets are on the slide or the exam,
// the platelet 150 line and what the two together say about CSPH (Baveno VIII 1.15, 1.16 b). It stands in the FibroScan card, below the map, and takes its
// type size from the card (host 'stiff'). Drawn on the GPU as the other cards' pictures are (svg-gl.js), and drawn again only when the width, the type size,
// the mark's reading or the platelets change: never in a frame of the shear-wave map.
import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { wrapWords } from './tool-trial.js';
import { TYPE } from './chart-looks/stiff.js';
import { LSM_CUTS, LSM_STEPS, csphVerdict } from '../engine/lsm-cuts.js';
import { TILE } from './table-marks.js';
import { cardShow } from './card-show.js';

const AXIS = 30;   // (kPa at the bar's right end: the last zone, 25 and over, is five wide)
const GAP = 1.5;   // (px between two zones)
/** The four zones: where each ends, its look and its words (one line each, or two where the zone is narrow). */
export const ZONES = [
  { to: LSM_CUTS.unlikely, look: 'stiff.z0', words: ['No cACLD'] },
  { to: LSM_CUTS.likely, look: 'stiff.z1', words: ['Suggests', 'cACLD'] },
  { to: LSM_CUTS.ruleIn, look: 'stiff.z2', words: ['cACLD,', 'CSPH unclear'] },
  { to: AXIS, look: 'stiff.z3', words: ['CSPH'] },
];
export const RULE_NOTE = 'Rule of 5: each step of 5 kPa from 10 to 25 carries a higher risk of decompensation (Baveno VIII 1.8).';
export const VERDICT = { out: ['CSPH ruled out', 'ok'], in: ['CSPH ruled in', 'hi'], open: ['CSPH not ruled out', 'mid'], between: ['CSPH not ruled in or out', 'mid'] };
/** The verdict's words and tone for a stiffness and a platelet count (a count between 15 and 25 kPa leaves CSPH open both ways). */
export function verdictOf(lsm, plt) {
  const v = csphVerdict(lsm, plt);
  return v == null ? null : v === 'open' && lsm > LSM_CUTS.likely ? VERDICT.between : VERDICT[v];
}
/** "Platelets 128 ×10³/µL, under 150" (the count as the tile prints it). */
export const plateletWords = (plt) => `Platelets ${Math.round(plt)} ${TILE.plt.u}, ${plt < LSM_CUTS.ruleOutPlt ? `under ${LSM_CUTS.ruleOutPlt}` : `${LSM_CUTS.ruleOutPlt} or more`}`;
/** The picture's words for a screen reader. */
export function stiffWords(lsm, plt) {
  if (!Number.isFinite(lsm)) return 'Liver stiffness on the rule of five: no reading.';
  const z = ZONES.find((q) => lsm < q.to) ?? ZONES[3], v = Number.isFinite(plt) ? verdictOf(lsm, plt) : null;
  return `Liver stiffness ${lsm.toFixed(1)} kPa on Baveno VIII's rule of five: ${z.words.join(' ')}.${Number.isFinite(plt) ? ` ${plateletWords(plt)}.` : ''}${v ? ` ${v[0]}.` : ''}`;
}

/** The bar's drawing at width W, base type size f: the words [{ x, y, t, look, anchor }], the rectangles [{ x, y, w, h, r, look }], the arrow's path and the height H.
 *  lsm: the reading (kPa) or null; plt: the platelet count (thousands per µL) or null for a bar with no platelet row; note: the rule's line under it all. Pure. */
export function stiffLayout(W, f, meas, { lsm = null, plt = null, note = false } = {}) {
  const texts = [], rects = [], paths = [];
  const px = (look) => TYPE[look][1] * f, font = (look) => `${TYPE[look][0]} ${px(look)}px Inter`;
  const say = (x, y, t, look, anchor = 'start') => texts.push({ x, y, t, look, anchor });
  const pad = Math.ceil(f * 0.3), ew = W - 2 * pad, X = (v) => pad + (Math.min(Math.max(v, 0), AXIS) / AXIS) * ew;
  const a = f * 0.5, bh = Math.max(8, Math.round(f * 0.9)), by = Math.ceil(a + f * 0.15);   // (a: the arrow's height)
  let from = 0;
  ZONES.forEach((z, i) => {
    const x0 = X(from) + (i ? GAP / 2 : 0), x1 = X(z.to) - (i < ZONES.length - 1 ? GAP / 2 : 0);
    rects.push({ x: x0, y: by, w: x1 - x0, h: bh, r: Math.min(3, bh / 2), look: z.look });
    from = z.to;
  });
  let y = by + bh + f * 0.3;
  const tk = px('stiff.tk');
  for (const v of LSM_STEPS) say(X(v), y + tk * 0.8, String(v), 'stiff.tk', 'middle');
  y += tk * 1.1 + f * 0.3;
  // (A zone's words stand over it, one line to a word group, the longest of them inside the card.)
  const zl = px('stiff.zl'), zlh = zl * 1.2;
  let lines = 0;
  from = 0;
  for (const z of ZONES) {
    const cx = Math.min(Math.max((X(from) + X(z.to)) / 2, 0), W);
    z.words.forEach((t, i) => {
      const w = meas(t, font('stiff.zl')), c = Math.min(Math.max(cx, w / 2), W - w / 2);   // (kept whole inside the card)
      say(c, y + zl * 0.8 + i * zlh, t, 'stiff.zl', 'middle');
    });
    lines = Math.max(lines, z.words.length);
    from = z.to;
  }
  y += lines * zlh;
  if (Number.isFinite(lsm)) {
    const mx = X(lsm), s = a * 0.62;
    paths.push({ d: `M${(mx - s).toFixed(2)} 0 L${(mx + s).toFixed(2)} 0 L${mx.toFixed(2)} ${a.toFixed(2)} Z`, look: 'stiff.mk' });
    rects.push({ x: mx - 1, y: a - 1, w: 2, h: by + bh - a + 1 + f * 0.25, r: 1, look: 'stiff.mk' });
  }
  if (Number.isFinite(plt)) {
    y += f * 0.9;
    const words = plateletWords(plt), v = verdictOf(lsm, plt), pl = px('stiff.plt');
    const wl = wrapWords(words, W, pl, TYPE['stiff.plt'][0], meas, 2);   // (a narrow card breaks the platelet words over two lines rather than clip them)
    wl.forEach((l, i) => say(0, y + pl * (0.8 + i * 1.3), l, 'stiff.plt'));
    y += (wl.length - 1) * pl * 1.3;
    if (v) {
      const vw = meas(v[0], font('stiff.v')), lw = meas(wl[wl.length - 1], font('stiff.plt'));
      if (lw + f * 0.8 + vw <= W) say(W, y + pl * 0.8, v[0], `stiff.v.${v[1]}`, 'end');
      else { y += pl * 1.4; say(0, y + pl * 0.8, v[0], `stiff.v.${v[1]}`); }
    }
    y += pl * 1.2;
  }
  if (note) {
    y += f * 0.5;
    const nl = wrapWords(RULE_NOTE, W, px('stiff.note'), TYPE['stiff.note'][0], meas, 2);
    nl.forEach((l, i) => say(0, y + px('stiff.note') * 0.85 + i * px('stiff.note') * 1.3, l, 'stiff.note'));
    y += nl.length * px('stiff.note') * 1.3;
  }
  return { texts, rects, paths, H: Math.ceil(y + f * 0.2) };
}

const sv = svgModel;
/** The bar in its own box. set(lsm, plt) puts a reading on it (null for none); the box is drawn again only when a thing it shows has changed. */
export function createStiffBar({ note = false } = {}) {
  const el = h('div', { class: 'pz-stiff', role: 'group' });
  const gl = createSvgGL(el, { host: 'stiff' }), put = cardShow(gl);
  let lsm = null, plt = null, drawn = '', dead = false;
  const textW = (s, font) => measure(s, font);
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (dead || !W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    const key = `${W}|${f}|${Number.isFinite(lsm) ? lsm.toFixed(1) : ''}|${Number.isFinite(plt) ? Math.round(plt) : ''}`;
    if (key === drawn) return;
    drawn = key;
    const L = stiffLayout(W, f, textW, { lsm, plt, note });
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
      ...L.paths.map((p) => sv('path', { d: p.d, 'data-look': p.look })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    // (A new reading at the same width and type size glides: the mark slides along the bar, the platelet words and the verdict fade across, card-show.js.)
    put(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': stiffWords(lsm, plt) }, ...kids), `${W}|${f}`);
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width and type size only)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    /** The reading (kPa, to a tenth as the card prints it) and the platelet count (thousands per µL) or null for no platelet row. */
    set(l, p = null) {
      const nl = Number.isFinite(l) ? Math.round(l * 10) / 10 : null, np = Number.isFinite(p) ? Math.round(p) : null;
      if (nl === lsm && np === plt) return;
      lsm = nl; plt = np;
      el.setAttribute('aria-label', stiffWords(lsm, plt));
      draw();
    },
    dispose() { dead = true; ro?.disconnect(); gl.dispose?.(); },
  };
}
