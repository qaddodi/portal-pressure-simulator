// The spleen's bar (Mohammad, 15 Nov 2026: "a bar for the spleen elastography similar to the liver's") is this same component on the 100 Hz probe's axis, 0 to 100 kPa:
// three zones at Baveno VIII's two lines, SSM <40 (1.19, screening endoscopy spared) and >55 (1.16c, CSPH established), ticks at those two numbers only (SSM_CUTS, the one copy),
// the patient's mark, and a verdict line. Baveno VIII and AASLD 2024 give no other SSM number, so none is drawn. The organ comes with each reading (set), so a switch of organ glides.
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
import { SSM_CUTS, SSM_STEPS, ssmZone } from '../engine/ssm-cuts.js';
import { TILE } from './table-marks.js';
import { cardShow } from './card-show.js';

const GAP = 1.5;   // (px between two zones)
/** The liver's four zones: where each ends, its look and its words (one line each, or two where the zone is narrow). */
export const ZONES = [
  { to: LSM_CUTS.unlikely, look: 'stiff.z0', words: ['No cACLD'] },
  { to: LSM_CUTS.likely, look: 'stiff.z1', words: ['Suggests', 'cACLD'] },
  { to: LSM_CUTS.ruleIn, look: 'stiff.z2', words: ['cACLD,', 'CSPH unclear'] },
  { to: 30, look: 'stiff.z3', words: ['CSPH'] },   // (kPa at the bar's right end: the last zone, 25 and over, is five wide)
];
/** The spleen's three zones on the 100 Hz probe's axis (the probe's ceiling, 100 kPa, at the right end). */
export const SPLEEN_ZONES = [
  { to: SSM_CUTS.spareScope, look: 'stiff.z0', words: ['Spares', 'EGD'] },
  { to: SSM_CUTS.ruleIn, look: 'stiff.z2', words: ['CSPH', 'unclear'] },
  { to: SSM_CUTS.max, look: 'stiff.z3', words: ['CSPH'] },
];
export const RULE_NOTE = 'Rule of 5: each step of 5 kPa from 10 to 25 carries a higher risk of decompensation (Baveno VIII 1.8).';
// (From 15 to 25 kPa the liver's stiffness alone does not decide, whatever the platelet count: Baveno VIII Fig. 1 and 1.15 to 1.17 give platelets <150 no part
// in ruling CSPH in. The next step is the guideline's: a model or the spleen, or a repeat at 12 months. Review of 16 Nov 2026: the card said "not ruled in or out"
// and stopped there. AASLD 2024's own rule of five, which does presume CSPH at 20 to 25 kPa with platelets <150, is on the AASLD path, not on this Baveno VIII bar.)
export const INDETERMINATE_NOTE = 'From 15 to 25 kPa the LSM does not decide: ANTICIPATE ≥75% or an SSM >55 kPa rules CSPH in, otherwise re-evaluate in 12 months (Baveno VIII 1.16, 1.17).';
/** Whether a liver stiffness stands in the indeterminate range (above 15 and under 25 kPa), where the bar names the next step. */
export const indeterminate = (lsm) => Number.isFinite(lsm) && lsm > LSM_CUTS.likely && lsm < LSM_CUTS.ruleIn;
export const SPLEEN_NOTE = `100 Hz probe: above ${SSM_CUTS.ruleIn} kPa establishes CSPH (Baveno VIII 1.16c); below ${SSM_CUTS.spareScope} kPa spares screening endoscopy in a patient who cannot take a beta-blocker (1.19).`;
/** What each organ's bar is made of: its zones, the ticks it prints, the zone a reading stands in, and the name its words use. */
export const BARS = {
  liver: { zones: ZONES, steps: LSM_STEPS, zoneOf: (v) => ZONES.find((q) => v < q.to) ?? ZONES[3], name: 'Liver stiffness', note: RULE_NOTE },
  spleen: { zones: SPLEEN_ZONES, steps: SSM_STEPS, zoneOf: (v) => SPLEEN_ZONES[ssmZone(v) === 'spare' ? 0 : ssmZone(v) === 'in' ? 2 : 1], name: 'Spleen stiffness', note: SPLEEN_NOTE },
};
export const VERDICT = { out: ['CSPH ruled out', 'ok'], in: ['CSPH ruled in', 'hi'], open: ['CSPH not ruled out', 'mid'], between: ['CSPH not ruled in or out', 'mid'] };
/** The spleen's verdict: CSPH is ruled in above 55 kPa, and the guidelines have no SSM rule-out, so below it CSPH is simply not ruled in. */
export const SPLEEN_VERDICT = { in: VERDICT.in, notIn: ['CSPH not ruled in', 'mid'] };
/** The verdict's words and tone for a stiffness and a platelet count (a count between 15 and 25 kPa leaves CSPH open both ways). */
export function verdictOf(lsm, plt) {
  const v = csphVerdict(lsm, plt);
  return v == null ? null : v === 'open' && lsm > LSM_CUTS.likely ? VERDICT.between : VERDICT[v];
}
/** The spleen's verdict for a reading, or null with none. */
export const spleenVerdictOf = (ssm) => (Number.isFinite(ssm) ? (ssmZone(ssm) === 'in' ? SPLEEN_VERDICT.in : SPLEEN_VERDICT.notIn) : null);
/** "Platelets 128 ×10³/µL, under 150" (the count as the tile prints it). */
export const plateletWords = (plt) => `Platelets ${Math.round(plt)} ${TILE.plt.u}, ${plt < LSM_CUTS.ruleOutPlt ? `under ${LSM_CUTS.ruleOutPlt}` : `${LSM_CUTS.ruleOutPlt} or more`}`;
/** The picture's words for a screen reader. */
export function stiffWords(lsm, plt, organ = 'liver') {
  const B = BARS[organ] || BARS.liver, spleen = B === BARS.spleen;
  if (!Number.isFinite(lsm)) return `${B.name} on the ${spleen ? '100 Hz probe' : 'rule of five'}: no reading.`;
  const z = B.zoneOf(lsm), v = spleen ? spleenVerdictOf(lsm) : Number.isFinite(plt) ? verdictOf(lsm, plt) : null;
  return `${B.name} ${lsm.toFixed(1)} kPa on ${spleen ? 'the 100 Hz probe' : "Baveno VIII's rule of five"}: ${z.words.join(' ')}.${!spleen && Number.isFinite(plt) ? ` ${plateletWords(plt)}.` : ''}${v ? ` ${v[0]}.` : ''}${!spleen && indeterminate(lsm) ? ' Next: an ANTICIPATE probability or a spleen stiffness, or re-evaluate in 12 months.' : ''}`;
}

/** The bar's drawing at width W, base type size f: the words [{ x, y, t, look, anchor }], the rectangles [{ x, y, w, h, r, look }], the arrow's path and the height H.
 *  lsm: the reading (kPa) or null; plt: the platelet count (thousands per µL) or null for a bar with no platelet row; note: the rule's line under it all. Pure. */
export function stiffLayout(W, f, meas, { lsm = null, plt = null, note = false, organ = 'liver' } = {}) {
  const B = BARS[organ] || BARS.liver, spleen = B === BARS.spleen, zones = B.zones, AXIS = zones.at(-1).to;
  const texts = [], rects = [], paths = [];
  const px = (look) => TYPE[look][1] * f, font = (look) => `${TYPE[look][0]} ${px(look)}px Inter`;
  const say = (x, y, t, look, anchor = 'start') => texts.push({ x, y, t, look, anchor });
  const pad = Math.ceil(f * 0.3), ew = W - 2 * pad, X = (v) => pad + (Math.min(Math.max(v, 0), AXIS) / AXIS) * ew;
  const a = f * 0.5, bh = Math.max(8, Math.round(f * 0.9)), by = Math.ceil(a + f * 0.15);   // (a: the arrow's height)
  let from = 0;
  zones.forEach((z, i) => {
    const x0 = X(from) + (i ? GAP / 2 : 0), x1 = X(z.to) - (i < zones.length - 1 ? GAP / 2 : 0);
    rects.push({ x: x0, y: by, w: x1 - x0, h: bh, r: Math.min(3, bh / 2), look: z.look });
    from = z.to;
  });
  let y = by + bh + f * 0.3;
  const tk = px('stiff.tk');
  for (const v of B.steps) say(X(v), y + tk * 0.8, String(v), 'stiff.tk', 'middle');
  y += tk * 1.1 + f * 0.3;
  // (A zone's words stand over it, one line to a word group, the longest of them inside the card.)
  const zl = px('stiff.zl'), zlh = zl * 1.2;
  let lines = 0;
  from = 0;
  for (const z of zones) {
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
  if (spleen) {
    // (The spleen has no platelet row: the verdict stands alone on its line, in the colour of what it says.)
    const v = spleenVerdictOf(lsm), pl = px('stiff.plt');
    if (v) { y += f * 0.9; say(0, y + pl * 0.8, v[0], `stiff.v.${v[1]}`); y += pl * 1.2; }
  } else if (Number.isFinite(plt)) {
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
    const nl = wrapWords(!spleen && indeterminate(lsm) ? INDETERMINATE_NOTE : B.note, W, px('stiff.note'), TYPE['stiff.note'][0], meas, 3);
    nl.forEach((l, i) => say(0, y + px('stiff.note') * 0.85 + i * px('stiff.note') * 1.3, l, 'stiff.note'));
    y += nl.length * px('stiff.note') * 1.3;
  }
  return { texts, rects, paths, H: Math.ceil(y + f * 0.2) };
}

const sv = svgModel;
/** The bar in its own box. set(value, plt, organ) puts a reading on it (null for none), the liver's by default; the box is drawn again only when a thing it shows has changed. */
export function createStiffBar({ note = false } = {}) {
  const el = h('div', { class: 'pz-stiff', role: 'group' });
  const gl = createSvgGL(el, { host: 'stiff' }), put = cardShow(gl);
  let lsm = null, plt = null, organ = 'liver', drawn = '', dead = false;
  const textW = (s, font) => measure(s, font);
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (dead || !W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    const key = `${W}|${f}|${organ}|${Number.isFinite(lsm) ? lsm.toFixed(1) : ''}|${Number.isFinite(plt) ? Math.round(plt) : ''}`;
    if (key === drawn) return;
    drawn = key;
    const L = stiffLayout(W, f, textW, { lsm, plt, note, organ });
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
      ...L.paths.map((p) => sv('path', { d: p.d, 'data-look': p.look })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    // (A new reading at the same width and type size glides: the mark slides along the bar, the platelet words and the verdict fade across, card-show.js.)
    put(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': stiffWords(lsm, plt, organ) }, ...kids), `${W}|${f}`);
    el.style.height = `${L.H}px`;   // (the picture's box: its height follows its width and type size only)
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    /** The reading (kPa, to a tenth as the card prints it), the platelet count (thousands per µL) or null for no platelet row (the spleen has none), and the organ ('liver' or 'spleen'). */
    set(l, p = null, o = organ) {
      const nl = Number.isFinite(l) ? Math.round(l * 10) / 10 : null, np = Number.isFinite(p) ? Math.round(p) : null, no = BARS[o] ? o : 'liver';
      if (nl === lsm && np === plt && no === organ) return;
      lsm = nl; plt = np; organ = no;
      el.setAttribute('aria-label', stiffWords(lsm, plt, organ));
      draw();
    },
    dispose() { dead = true; ro?.disconnect(); gl.dispose?.(); },
  };
}
