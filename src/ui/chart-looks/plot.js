// Looks shared by the over-time charts' plot pieces (docs/chart-looks-in-code-plan.md WP4): the rounded plot, the grid, the axis names, the
// units and the series lines. Written by hand from app.css, in the order the cascade picks a winner (specificity, then the file's order);
// each entry names the lines it replaces. The talk chart (host 'talk'), the flow-time chart ('flowtime') and the curve and course ('curve', time.js) read
// them; the profile ladder ('prof') reads the grid's numbers and the unit (WP6).
import { tok, param, mix, px, em, svk, max } from './dsl.js';

const FITTED = ['talk', 'flowtime', 'curve'];   // (the hosts that set the grid's numbers and the plain gridline in the card's type)
const ROW = ['wide', 'short', 'low'];   // (.pz:not(.stack): every layout but the stacked ones)

export const PLOT = {
  // app.css 7625 .pz-plotbg
  'plot.bg': { base: { fill: tok('surface-2') } },
  // 2956-2958 .ptk-grid line, 7627 (:is(.pz-curve, .pz-flowtime, .pz-talk) .ptk-grid:not(.cut) line), 2280 (a row card's cell)
  'plot.grid.line': {
    state: { cut: 'class:cut', rate: 'data-rate' },
    base: { stroke: mix('srgb', tok('text'), 11, 'transparent'), width: 1 },
    when: [
      [{ cut: true }, { dash: [4, 5], width: 1.5 }],
      [{ rate: 'mid' }, { stroke: tok('caution') }],
      [{ rate: 'hi' }, { stroke: tok('danger') }],
      [{ host: 'curve', cut: true, rate: 'mid' }, { stroke: mix('srgb', tok('caution'), 85, tok('text')) }],   // (7214 .pz-curve: the amber cut-off a little darker, 3:1 on the light card)
      [{ host: FITTED, cut: false }, { stroke: mix('srgb', tok('border-strong'), 70, 'transparent') }],   // (7607)
      [{ layout: ROW, in: 'cell' }, { width: max(px(1), em(0.075)) }],
    ],
  },
  // 2959 .ptk-grid text, 6178 (.pz-talk: 1em), 7122 (.pz-prof: 1em)
  'plot.grid.text': {
    base: { font: [500, svk(px(15))], fill: tok('text-3') },
    when: [[{ host: [...FITTED, 'prof'] }, { size: em(1) }]],
  },
  // 2960 .ptk-ax, 6178, 6179 (.pz-talk: 1em, .04em)
  'plot.ax': {
    base: { font: [600, svk(px(13))], letterSpacing: svk(px(0.78)), upper: true, fill: tok('text-3') },
    when: [[{ host: ['talk', 'flowtime'] }, { size: em(1), letterSpacing: em(0.04) }]],   // (6314-6315 the flow-time chart's too)
  },
  // 2961 .ptk-unit, 6178, 7122 (.pz-prof)
  'plot.unit': {
    base: { font: [500, svk(px(13))], fill: tok('text-3') },
    when: [[{ host: ['talk', 'prof'] }, { size: em(1) }]],
  },
  // 2965 .ptk-line: a series line, its colour given by the builder (data-p-c)
  'plot.line': { base: { fill: 'none', stroke: param('c'), width: 3, join: 'round', cap: 'round' } },
};
