// The Baveno VIII stiffness × platelet zones, drawn once for every chart that shows them (Mohammad, 11 Nov 2026: the guideline card
// "Baveno VIII at a first visit" and the instrument card "Stiffness and platelets" were two different pictures of the same rule).
//
// One geometry (guidelines/baveno-viii-2026.pdf, recommendations 1.15, 1.16, 1.19): CSPH is ruled out at LSM ≤15 kPa with platelets
// ≥150 ×10³/µL, ruled in at LSM ≥25 kPa, the rest is indeterminate; a patient who cannot take an NSBB can skip the screening EGD at
// LSM <20 kPa with platelets ≥150 (the hatched area, drawn only where a card says why: tool-criteria.js). One look, the muted one of the
// guideline card: each zone a thin tint of its rating (chart-looks/crit.js `crit.zone`) laid on the card's glass, so the zones never
// overlap (a tint twice over would read stronger); no dashed borders; the hatch one grey diagonal (`crit.hatch`); the words in the same
// outlined type (`crit.word`); the axes written on the plot as 15, 20, 25 along the foot, 150K up the left, LSM kPa and PLT.
// tool-criteria.js (the guideline card) and visual-plane.js (the data card's plane and the summary) both read this file; a second
// copy of a cut-off or a colour is what let the two drift (tests/baveno-zones.test.js pins them).

import { h } from './util.js';

/** The cut-offs, in kPa and ×10³/µL. */
export const BAVENO = { out: 15, in: 25, egd: 20, plt: 150 };
/** The axis writing both charts share (and the ranges they draw, so 15 kPa stands at the same place on both): the numbers along the foot, the one up the left, the two axes' names. */
export const BAVENO_AXES = { x: [5, 35], y: [50, 250], xTicks: [15, 20, 25], yTick: [BAVENO.plt, '150K'], xName: 'LSM kPa', yName: 'PLT' };

/** The zones as plain rectangles that never overlap, each out to the ends of the ranges x = [lo, hi] (kPa) and y = [lo, hi] (platelets):
 *  [{ rate: 'ok' | 'mid' | 'hi', x: [a, b], y: [c, d] }]. */
export function bavenoRects(x, y) {
  const [x0, x1] = x, [y0, y1] = y, { out, in: rin, plt } = BAVENO;
  return [
    { rate: 'ok', x: [x0, out], y: [plt, y1] },
    { rate: 'mid', x: [out, rin], y: [y0, y1] },
    { rate: 'mid', x: [x0, out], y: [y0, plt] },
    { rate: 'hi', x: [rin, x1], y: [y0, y1] },
  ];
}
/** The area where the EGD can be skipped (LSM under 20 kPa, platelets 150 or more), to the ends of the ranges. */
export const bavenoHatch = (x, y) => ({ x: [x[0], BAVENO.egd], y: [BAVENO.plt, y[1]] });

let artN = 0;
/** The zones' picture as plain elements: { defs, g }. defs go in the svg's <defs>; g is the group of tints (and the hatch over them when hatch is
 *  given), to be clipped to the plot's rounded shape by the caller.
 *  sv: the caller's element builder. rects: bavenoRects(...). box: a rect → its { x, y, width, height } in the caller's pixels.
 *  The tints and the hatch read the looks `crit.zone` and `crit.hatch`, so every chart that draws them looks the same. */
export function zoneArt(sv, { rects, hatch = null, box }) {
  const id = `pzbz${++artN}`;
  const tint = rects.map((r) => sv('rect', { class: 'pzz-z', 'data-look': 'crit.zone', 'data-rate': r.rate, ...box(r) }));
  const defs = hatch ? [sv('pattern', { id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, sv('rect', { width: 2, height: 7, class: 'pzz-hl', 'data-look': 'crit.hatch' }))] : [];
  return { defs, g: [...tint, hatch ? sv('rect', { ...box(hatch), fill: `url(#${id})` }) : null].filter(Boolean) };
}

/** The plot's height for a width, the same on every chart of these zones: a taller one under 420 px (a phone), a flatter one above. */
export const plotHeight = (W) => Math.round(W * (W < 420 ? 0.46 : 0.34));
/** The hatch's key line under a card that draws it (the guideline card's own, tool-criteria.js): the swatch and "Hatched: can skip EGD". */
export const hatchKey = () => h('div', { class: 'pzc-key' }, h('p', { class: 'pzc-kl' }, h('span', { class: 'pzc-sw', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, 'Hatched:'), ' can skip EGD')));
