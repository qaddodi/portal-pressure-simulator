// The measurement tracing card's looks (tool-reading.js, host 'reading'): a bedside monitor in the data card, dark on every look, as the vitals
// monitor and the HVPG tracing are (the --mon-* tokens). Each trace, its head, its tag and its reading in the header take the tone the builder names
// (data-p-c: mon-free, mon-wedge, mon-pv, mon-ivc); the gradient, its bracket and its pill take its rating (data-rate: ok, mid, hi) on the
// monitor's own ok, caution and alarm colours. Sizes are the builder's font-size attributes.
import { tok, param, mix } from './dsl.js';

const RATE = (prop) => [[{ rate: 'ok' }, { [prop]: tok('mon-ok') }], [{ rate: 'mid' }, { [prop]: tok('mon-caution') }], [{ rate: 'hi' }, { [prop]: tok('mon-alarm') }]];

export const READING = {
  'rd.panel': { base: { fill: tok('mon-bg') } },
  'rd.g': { base: {} },
  'rd.grid': { base: { stroke: tok('mon-grid'), width: 1 } },
  'rd.ax': { base: { fill: tok('mon-text'), weight: 500 } },
  'rd.key': { base: { fill: tok('mon-text'), weight: 600 } },
  'rd.val': { base: { fill: param('c'), weight: 650 } },
  'rd.res': { state: { rate: 'data-rate' }, base: { fill: tok('mon-bright'), weight: 700 }, when: RATE('fill') },
  'rd.line': { base: { fill: 'none', stroke: param('c'), width: 2.4, cap: 'round', join: 'round' } },
  'rd.head': { base: { fill: param('c') } },
  'rd.tag': { base: { fill: param('c'), weight: 600 } },
  'rd.brk': { state: { rate: 'data-rate' }, base: { fill: 'none', stroke: tok('mon-text'), width: 2, cap: 'round' }, when: RATE('stroke') },
  'rd.pill': { state: { rate: 'data-rate' }, base: { fill: tok('mon-text') }, when: RATE('fill') },
  'rd.pillw': { base: { fill: tok('mon-bg'), weight: 700 } },
  'rd.wait': { base: { fill: tok('mon-text'), weight: 500 } },
  'rd.target': { base: { fill: 'none', stroke: mix('srgb', tok('mon-caution'), 80, 'transparent'), width: 1.2, dash: [5, 4] } },
  'rd.tword': { base: { fill: tok('mon-caution'), weight: 600 } },
};
