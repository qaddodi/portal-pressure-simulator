// The over-time charts' own looks (docs/chart-looks-in-code-plan.md WP5): the flow-time chart (flow-time.js, host 'flowtime'), the parameter curve
// and the course (tool-curve.js and tool-course.js, host 'curve': the course is the curve's card). Written by hand from app.css's .pft-*, .pcv-* and
// .pco-* rules in cascade order (the old line numbers beside each entry), those rules deleted in the same change. The grid, axis, unit and series
// line shared with the talk chart are plot.js.
// The charts draw at a fitted type size f (their svg carries it), which is what `em` means in these hosts (chart-ctx.js fittedType); a word
// with no size here takes its parent's, as the stylesheet's 1em did.
// A colour a builder gives a piece is its token name in data-p-c (a line's colour, a key's), or data-p-rx (a treatment's).
// (Inside both hosts app.css 7606 sets --surface to the panel's own tone, --surface-2, so every halo and ring fill reads surface-2 here.)
import { tok, param, mix, em, ease } from './dsl.js';

const halo = (w) => ({ stroke: tok('surface-2'), width: w, join: 'round' });
const warn = (pct) => mix('oklab', tok('caution'), pct, tok('text'));
const bad = (pct) => mix('oklab', tok('danger'), pct, tok('text'));

export const TIME = {
  // ── Shared by flow-time and curve ──
  // 2944 .pft-key line (+ 7222-7223, 7224 the curve's dashed and reference keys)
  'time.key.line': {
    state: { ref: 'class:pcv-ref', dash: 'class:pcv-dash' },
    base: { stroke: param('c'), width: 4, cap: 'round' },
    when: [[{ ref: true }, { width: 1.5, dash: [3, 4] }], [{ dash: true }, { dash: [3, 9] }]],
  },
  // 2945, 6314, 7197 .pft-key text (a line's name, in its colour)
  'time.key.text': { base: { font: [700, em(1)], fill: param('c') } },
  // 6316, 7201 .pft-u: the unit after a name
  'time.key.unit': { base: { weight: 500, fill: tok('text-3') } },
  // (a tspan that only carries its text's look)
  'time.span': { base: {} },
  // 2946 .pft-x: the time or x axis line
  'time.axis.line': { base: { stroke: tok('text-3'), width: 1.5 } },
  // 2949, 6314, 7197 .pft-tk: the numbers under the axis
  'time.tk': { base: { font: [500, em(1)], fill: tok('text-3') } },
  // 2959, 6314, 7197 .ptk-grid text: a gridline's number, in the colour of its line (data-p-c, text-3 where plain)
  'time.grid.text': { base: { font: [500, em(1)], fill: param('c') } },

  // ── The flow-time chart ──
  // 2947-2948, 6314 .pft-t and .pft-t.meal: "Fasting" and "Meal"
  'ft.t': { state: { meal: 'class:meal' }, base: { font: [600, em(1)], fill: tok('text-2') }, when: [[{ meal: true }, { fill: tok('text'), weight: 700 }]] },
  // 2950 .pft-meal: the dashed line at the meal
  'ft.meal': { base: { stroke: tok('text-2'), width: 2, dash: [5, 5] } },
  // 2951 .pft-start: the ring where a line starts
  'ft.start': { base: { fill: tok('surface-2'), stroke: param('c'), width: 2.5 } },
  // 2952 .pft-dot: the head of a line
  'ft.dot': { base: { fill: param('c'), stroke: tok('surface-2'), width: 2 } },
  // 2954, 6314 .pft-v0: a line's first value
  'ft.v0': { base: { font: [600, em(1)], fill: param('c'), halo: halo(4) } },
  // 2953, 2955, 6315 .pft-v: a line's value at its head; near the start the first value is already there (off)
  'ft.v': {
    state: { off: 'class:off' },
    base: { font: [700, em(1.1)], fill: param('c'), halo: halo(4), ease: { opacity: ease('small') } },
    when: [[{ off: true }, { opacity: 0 }]],
  },
  // 7169, 7173, 7176 .pft-band: a treatment's thin bar (stronger on a dark card)
  'ft.band.bar': { base: { fill: mix('oklab', param('rx'), 70, tok('text')) }, when: [[{ dark: true }, { fill: param('rx'), opacity: 0.8 }]] },
  // 7172, 7174, 7177 .pft-band-n tspan: a treatment's name under the clock
  'ft.band.name': { base: { font: [600, em(1)], fill: mix('oklab', param('rx'), 62, tok('text')) }, when: [[{ dark: true }, { fill: mix('oklab', param('rx'), 72, tok('text')) }]] },

  // ── The curve and the course ──
  // 7202 .pcv-ax: the x axis's name
  'cv.ax': { base: { font: [600, em(1)], fill: tok('text-2') } },
  // 2965 .ptk-line, 7203 .pcv-line, 7222 .pcv-ref, 7223 .pcv-dash: a series line (a reference line thin and dotted, a sweep dashed)
  'cv.line': {
    state: { ref: 'class:pcv-ref', dash: 'class:pcv-dash' },
    base: { fill: 'none', stroke: param('c'), width: 3, join: 'round', cap: 'round', ease: { opacity: ease('surface') } },
    when: [[{ ref: true }, { width: 1.5, dash: [3, 4] }], [{ dash: true }, { dash: [5, 7] }]],
  },
  // 7204, 7206, 7209 .pcv-at, .pcv-atx: the case's upright line, or a short tick up from the x axis
  'cv.at': {
    state: { off: 'class:off', atx: 'class:pcv-atx' },
    base: { stroke: tok('text-3'), width: 1.5, dash: [3, 4], ease: { opacity: ease('small') } },
    when: [[{ atx: true }, { dash: [], width: 2.5, cap: 'round' }], [{ off: true }, { opacity: 0 }]],
  },
  // 7207, 7209 .pcv-ring
  'cv.ring': {
    state: { off: 'class:off' },
    base: { fill: tok('surface-2'), stroke: param('c'), width: 3, ease: { opacity: ease('small') } },
    when: [[{ off: true }, { opacity: 0 }]],
  },
  // 7208-7209, 7217 .pcv-v: a ring's value (on its own line the dashes stop round the words: a wider halo)
  'cv.v': {
    state: { off: 'class:off', on: 'class:on' },
    base: { font: [700, em(1.1)], fill: param('c'), halo: halo(4), ease: { opacity: ease('small') } },
    when: [[{ on: true }, { halo: { width: 8 } }], [{ off: true }, { opacity: 0 }]],
  },
  // 7230 .pcv-sep: the dot between two values of one readout
  'cv.sep': { base: { fill: tok('text-3') } },
  // (a part of a merged readout, in its line's colour)
  'cv.vpart': { base: { fill: param('c') } },
  // 7211-7212 .pcv-name: a line's name on the drawing
  'cv.name': {
    state: { off: 'class:off' },
    base: { font: [700, em(1)], fill: param('c'), halo: halo(4), ease: { opacity: ease('small') } },
    when: [[{ off: true }, { opacity: 0 }]],
  },
  // 7212-7213 .pcv-alt: the key that stands in for the names on a cramped chart
  'cv.alt': { state: { off: 'class:off' }, base: { ease: { opacity: ease('small') } }, when: [[{ off: true }, { opacity: 0 }]] },
  // 7216-7217, 7218-7219 .pcv-cut: a cut-off's name, in its rating's colour
  'cv.cut': {
    state: { on: 'class:on', rate: 'data-rate' },
    base: { font: [600, em(1)], fill: tok('text-3'), halo: halo(3) },
    when: [[{ rate: 'mid' }, { fill: warn(70) }], [{ rate: 'hi' }, { fill: bad(80) }], [{ on: true }, { halo: { width: 8 } }]],
  },
  // 7225 .pcv-dot: another state, a small filled point
  'cv.dot': { base: { fill: param('c'), stroke: tok('surface-2'), width: 1.5 } },
  // 7226-7227, 7229, 7232 .pcv-dname, .pcv-dnum: a point's name, or its number
  'cv.dname': {
    state: { off: 'class:off', num: 'class:pcv-dnum' },
    base: { font: [600, em(1)], fill: tok('text-2'), halo: halo(4), ease: { opacity: ease('small') } },
    when: [[{ num: true }, { weight: 700 }], [{ off: true }, { opacity: 0 }]],
  },
  // 7228-7229 .pcv-lead: the line from a point to its name
  'cv.lead': {
    state: { off: 'class:off' },
    base: { stroke: tok('text-3'), width: 1, ease: { opacity: ease('small') } },
    when: [[{ off: true }, { opacity: 0 }]],
  },
  // 7233 .pcv-sk, 7234 .pcv-sn: the steps' key under the chart, a number bold before its name
  'cv.sk': { base: { font: [600, em(1)], fill: tok('text-2') } },
  'cv.sn': { base: { weight: 700 } },
  // 7235 .pcv-kv: the case's value in a key
  'cv.kv': { base: { weight: 700 } },
  // 7237-7239 .pcv-tc: a cut-off held as a tick on the left axis (its number bold, in its rating's colour), or a zone's name on the course
  'cv.tc': {
    state: { tc: 'data-tc' },
    base: { font: [700, em(1)], fill: tok('text-3') },
    when: [[{ tc: 'mid' }, { fill: warn(70) }], [{ tc: 'hi' }, { fill: bad(80) }]],
  },
  // 7240-7242 .pcv-stub: a short stub at the plot's edge. (The rating colours of 7241-7242 lost to the plain gridline's rule at 7607, which is more specific,
  // so the stub always drew in the gridline's tone; it is written as it drew.)
  'cv.stub': { base: { stroke: mix('srgb', tok('border-strong'), 70, 'transparent'), width: 2.5, cap: 'round' } },
  // 7243 .pcv-walk: a patient's visits joined in order
  'cv.walk': { base: { fill: 'none', stroke: param('c'), width: 1.5, dash: [2, 4], cap: 'round', opacity: 0.7 } },
  // 7244 .pcv-arrow: which way he went
  'cv.arrow': { base: { stroke: 'none', fill: param('c'), opacity: 0.85 } },
  // 7245-7247 .pcv-zone-*: a guideline zone, a soft band under a dashed edge, its name
  'cv.zone.fill': { base: { fill: mix('srgb', tok('ok'), 12, 'transparent'), stroke: 'none' } },
  'cv.zone.edge': { base: { fill: 'none', stroke: tok('ok'), width: 1.5, dash: [4, 5] } },
  'cv.zone.t': { base: { font: [600, em(1)], fill: mix('oklab', tok('ok'), 80, tok('text')), halo: halo(3) } },
  // 7249-7252 .pco-z: the course's rating bands behind the lines, the first and last a little stronger
  'co.z': {
    state: { rate: 'data-rate', deep: 'data-deep' },
    base: { fill: mix('srgb', tok('ok'), 22, 'transparent') },
    when: [[{ rate: 'mid' }, { fill: mix('srgb', tok('caution'), 17, 'transparent') }], [{ rate: 'hi' }, { fill: mix('srgb', tok('danger'), 12, 'transparent') }], [{ deep: true }, { fill: mix('srgb', tok('danger'), 24, 'transparent') }]],
  },
};
