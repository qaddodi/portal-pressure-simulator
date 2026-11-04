// The "What raises the pressure" waterfall's own looks (docs/chart-looks-in-code-plan.md WP7): tool-causes.js, host 'causes'. Written by hand from
// app.css's .pcs-* rules in cascade order (the old line numbers beside each entry), those rules deleted in the same change.
// The chart's type size is its root's font-size (the model's root carries it, as the sheet's inline font-size did), so no entry sets a size:
// every word is the 1em the old rules named. Pieces with no look of their own (groups, tspans, the root) are named here too, empty, so the
// picture asks the page nothing about them.
import { tok, param, mix, ease } from './dsl.js';

export const CAUSES = {
  // the drawing's root (its font-size attribute), its groups, a row, a label's lines: nothing of their own
  'causes.root': { base: {} },
  'causes.g': { base: {} },
  'causes.row': { base: {} },
  'causes.l.span': { base: {} },
  // 7253-7255 .pcs-l: a row's words; "Causes together" a shade softer, the two totals a little bolder
  'causes.l': {
    state: { other: 'class:other', total: 'class:total' },
    base: { weight: 500, fill: tok('text') },
    when: [[{ other: true }, { fill: tok('text-2') }], [{ total: true }, { weight: 650 }]],
  },
  // a step's bar: the colour of its mechanism, given by the builder (data-p-c; the grey one for "Causes together")
  'causes.bar.step': { base: { fill: param('c') } },
  // 7258-7261 .pcs-row.total .pcs-b: Healthy and Now, grey, or in their rating's colour
  'causes.bar.total': { state: { rate: 'data-rate' }, base: { fill: tok('text-3') }, when: [[{ rate: 'ok' }, { fill: tok('ok') }], [{ rate: 'mid' }, { fill: tok('caution') }], [{ rate: 'hi' }, { fill: tok('danger') }]] },
  // 7257, 7262-7264 .pcs-v: a row's number, a halo of the card's tone under it; the Now row's in its rating's colour (a shade toward the text)
  'causes.val': {
    state: { now: 'class:now', rate: 'data-rate' },
    base: { weight: 700, fill: tok('text'), halo: { stroke: tok('surface'), width: 8, join: 'round' } },
    when: [
      [{ now: true, rate: 'ok' }, { fill: tok('ok') }],
      [{ now: true, rate: 'mid' }, { fill: mix('oklab', tok('caution'), 70, tok('text')) }],
      [{ now: true, rate: 'hi' }, { fill: mix('oklab', tok('danger'), 80, tok('text')) }],
    ],
  },
  // 7265 .pcs-c: the dashed links carrying the running total from bar to bar
  'causes.link': { base: { fill: 'none', stroke: tok('text-3'), width: 1, dash: [2, 3] } },
  // 7273-7274 .pcs-cut, .pcs-ax .pcs-cut, .pcs-cut.off: a cut-off's line or number group, eased out when the scale leaves it (or the number has no room)
  'causes.cut': {
    state: { off: 'class:off' },
    base: { ease: { opacity: ease('small') } },
    when: [[{ off: true }, { opacity: 0 }]],
  },
  // 7266-7268 .pcs-cut line: a cut-off, dashed, in its rating's colour
  'causes.cut.line': {
    state: { rate: 'data-rate' },
    base: { width: 1.5, dash: [4, 5] },
    when: [[{ rate: 'mid' }, { stroke: mix('srgb', tok('caution'), 85, tok('text')) }], [{ rate: 'hi' }, { stroke: tok('danger') }]],
  },
  // 7269, 7271-7272 .pcs-ax text: a cut-off's number under its line, in its rating's colour (a shade toward the text)
  'causes.cut.num': {
    state: { rate: 'data-rate' },
    base: { weight: 600 },
    when: [[{ rate: 'mid' }, { fill: mix('oklab', tok('caution'), 70, tok('text')) }], [{ rate: 'hi' }, { fill: mix('oklab', tok('danger'), 80, tok('text')) }]],
  },
  // 7269-7270 .pcs-ax .pcs-u: the unit at the right of the axis
  'causes.unit': { base: { weight: 500, fill: tok('text-3') } },
};
