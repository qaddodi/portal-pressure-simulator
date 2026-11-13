// The pressure ladder's own looks (docs/chart-looks-in-code-plan.md WP6): tool-profile.js, hosts 'prof' (the chart), 'pstrip' and 'pstriph' (the
// phone grid's strips). Written by hand from app.css's .ppf-* and .pps-* rules in cascade order (the old line numbers beside each entry), those
// rules deleted in the same change. The gridlines, the unit and the numbers' type are plot.js (host 'prof').
//
// A piece whose type size is its own (a zone's name, a bracket's words, set smaller to fit) says so with a font-size attribute and leaves `size`
// alone here; every other piece is 1 em of the host (the size the chart was drawn at). A tspan under a piece is `prof.tspan`: it takes the
// look of its text and nothing of its own.
import { tok, mix, px, em, max } from './dsl.js';

const ROW = ['wide', 'short', 'low'];
const CELL = { layout: ROW, in: 'cell' };   // (.pz:not(.stack) .pz-cell: the instrument drawn once in a wide screen's grid cell, 2275-2280)
const RATE = { rate: 'data-rate' };
const rated = (mid, hi) => [[{ rate: 'mid' }, mid], [{ rate: 'hi' }, hi]];
const halo = { stroke: tok('surface'), width: 4, join: 'round' };
// (the readings' pills: the tone of the rating, green, amber or red; 7145-7147 set --tone for each)
const pillRect = (t) => ({ fill: mix('srgb', tok(t), 15, tok('surface')), stroke: mix('srgb', tok(t), 50, 'transparent'), width: 1 });
const pillText = (t) => ({ fill: mix('srgb', tok(t), 82, tok('text')) });

export const PROFILE = {
  // 7117-7119 .ppf-liver / .ppf-pre / .ppf-post rect: the zones' tints (the --chart-*-band theme tokens, which charts.js and stage.js read too)
  'prof.zone.liver': { base: { fill: tok('chart-liver-band') } },
  'prof.zone.pre': { base: { fill: tok('chart-pre-band') } },
  'prof.zone.post': { base: { fill: tok('chart-post-band') } },
  // 7120-7121 .ppf-zone text (its size is the piece's own, and its letter-spacing .06em, 0 when tight, as attributes)
  'prof.zone.text': { base: { weight: 600, fill: tok('text-3') } },
  // 7123, 7126, 2276-2277 .ppf-hl: the healthy line
  'prof.hl': {
    base: { fill: 'none', stroke: tok('text-3'), dash: [4, 5], width: 1.75, cap: 'round' },
    when: [[CELL, { width: max(px(1.75), em(0.14)), dash: [max(px(4), em(0.33)), max(px(5), em(0.42))] }]],
  },
  // 7124, 7126, 2276, 2278 .ppf-bf: the earlier line
  'prof.bf': {
    base: { fill: 'none', stroke: tok('text-2'), dash: [1.5, 4.5], width: 1.75, cap: 'round' },
    when: [[CELL, { width: max(px(1.75), em(0.14)), dash: [max(px(1.5), em(0.125)), max(px(4.5), em(0.375))] }]],
  },
  // 7125 .ppf-lname, 7131 .ppf-name (7132 .liv italic: the picture never drew it)
  'prof.name': { base: { weight: 500, size: em(1), fill: tok('text-2') } },
  // 7127 .ppf-fill (the gradient is the piece's fill attribute)
  'prof.fill': { base: { opacity: 0.16 } },
  // 7128, 2275 .ppf-line (the gradient is the piece's stroke attribute)
  'prof.line': {
    base: { fill: 'none', width: 3, join: 'round', cap: 'round' },
    when: [[CELL, { width: max(px(3), em(0.2)) }]],
  },
  // 7129 .ppf-v: a reading, a halo of the card's colour under it
  'prof.v': { base: { weight: 700, size: em(1), fill: tok('text'), halo } },
  // 7130, 2280 .ppf-axis
  'prof.axis': { base: { stroke: tok('axis'), width: 1 }, when: [[CELL, { width: max(px(1), em(0.075)) }]] },
  // 7133 .ppf-blk: the red block (the hatching is the piece's fill attribute)
  'prof.blk': { base: { stroke: tok('danger'), width: 1.2, strokeOpacity: 0.7 } },
  // 7138, 2279 .ppf-brace path / 7139 text: the sinusoidal brace
  'prof.brace.path': {
    base: { fill: 'none', stroke: tok('text-3'), width: 1.5, cap: 'round', join: 'round' },
    when: [[CELL, { width: max(px(1.5), em(0.11)) }]],
  },
  'prof.brace.text': { base: { weight: 500, size: em(1), fill: tok('text-2') } },
  // 7140, 7143-7144, 2279 .ppf-br path: a bracket (the HVPG and PPG), in its cut-off's colour
  'prof.br.path': {
    state: RATE,
    base: { fill: 'none', stroke: tok('text-3'), width: 1.5 },
    when: [...rated({ stroke: tok('caution') }, { stroke: tok('danger') }), [CELL, { width: max(px(1.5), em(0.11)) }]],
  },
  // 7141, 7143-7144 .ppf-br text (the size is the bracket's own, an attribute); 7142 .ppf-br text .k keeps its own ink
  'prof.br.text': {
    state: RATE,
    base: { weight: 700, fill: tok('text'), halo },
    when: rated({ fill: tok('caution') }, { fill: tok('danger') }),
  },
  'prof.br.k': { base: { weight: 600, fill: tok('text-2') } },
  // 7145-7150 .ppf-pill: a reading's pill, tinted as the bracket rates it
  'prof.pill.rect': { state: RATE, base: pillRect('ok'), when: rated(pillRect('caution'), pillRect('danger')) },
  'prof.pill.text': { state: RATE, base: { weight: 700, size: em(1), ...pillText('ok') }, when: rated(pillText('caution'), pillText('danger')) },
  'prof.pill.k': { base: { weight: 600 } },
  // .pps-line, .pps-v (the phone grid's strip: a case's line and its readings, outlined in the cell's colour)
  'prof.strip.line': { base: { fill: 'none', width: 4, cap: 'round' } },
  'prof.strip.v': { base: { weight: 700, size: em(1), fill: tok('text'), halo: { stroke: tok('surface-2'), width: 4, join: 'round' } } },
  // a tspan: the look of its text
  'prof.tspan': { base: {} },
};
