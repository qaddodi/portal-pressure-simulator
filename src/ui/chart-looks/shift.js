// The change-from-healthy chart's own looks (tool-shift.js, host 'shift'): the circulation's readings from the healthy patient to each state
// of the talk, CO, SVR, MAP and blood volume as % of healthy in the upper panel, the portal pressure and the splanchnic inflow in the lower.
// The shared plot pieces (the panel, the grid and its numbers, the unit) are plot.js; a number coloured as its line is time.js.
import { tok, param, em } from './dsl.js';

export const SHIFT = {
  // a reading's line, the colour given by the builder (data-p-c); a line the slide does not teach is faint (class dim)
  'shift.line': {
    state: { dim: 'class:dim' },
    base: { fill: 'none', stroke: param('c'), width: 2.5, join: 'round', cap: 'round' },
    when: [[{ dim: true }, { opacity: 0.3, width: 2 }]],
  },
  // a reading at a state: a dot, a ring of the panel's tone round it
  'shift.dot': {
    state: { dim: 'class:dim' },
    base: { fill: param('c'), stroke: tok('surface-2'), width: 2 },
    when: [[{ dim: true }, { opacity: 0.3 }]],
  },
  // where a what-if slider has moved the last state's reading (the dot stays at the slide's own)
  'shift.ring': {
    state: { dim: 'class:dim' },
    base: { fill: tok('surface-2'), stroke: param('c'), width: 2.25 },
    when: [[{ dim: true }, { opacity: 0.35 }]],
  },
  // the healthy reference, 100% (a still line, never a moving trace)
  'shift.ref': { base: { stroke: tok('text-3'), width: 1.25, dash: [3, 4] } },
  // the right column: a swatch, the reading's short name and its value at the last state
  'shift.swatch': {
    state: { dim: 'class:dim' },
    base: { fill: param('c'), stroke: 'none' },
    when: [[{ dim: true }, { opacity: 0.35 }]],
  },
  'shift.lbl.n': {
    state: { dim: 'class:dim' },
    base: { font: [700, em(1)], fill: tok('text') },
    when: [[{ dim: true }, { fill: tok('text-3'), weight: 600 }]],
  },
  'shift.lbl.v': {
    state: { dim: 'class:dim' },
    base: { font: [500, em(1)], fill: tok('text-2') },
    when: [[{ dim: true }, { fill: tok('text-3') }]],
  },
  // the states' names under the lower panel (the last is "now")
  'shift.stage': {
    state: { now: 'class:now' },
    base: { font: [500, em(0.92)], fill: tok('text-2') },
    when: [[{ now: true }, { fill: tok('text'), weight: 700 }]],
  },
  // each panel's name, over its axis numbers
  'shift.panel': { base: { font: [600, em(0.92)], fill: tok('text-2') } },
};
