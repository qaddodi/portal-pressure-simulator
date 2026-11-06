// The talk-so-far chart's own looks (docs/chart-looks-in-code-plan.md WP4): talk-trace.js, host 'talk'. Written by hand from app.css's .ptk-* and
// .pz-talk rules in cascade order (the old line numbers beside each entry), those rules deleted in the same change. The shared plot pieces
// (grid, axis, unit, series line, panel) are plot.js.
// (Inside the talk host app.css 7626 sets --surface to the panel's own tone, --surface-2, so the halos and the points' fill read it: surface-2 here.)
import { tok, param, mix, px, em, svk } from './dsl.js';

export const TALK = {
  // 7180, 7190-7194 .ptk-band rect: the treatment's colour (data-p-rx), twice as strong in a dark look
  'talk.band.rect': { base: { fill: param('rx'), opacity: 0.12 }, when: [[{ dark: true }, { opacity: 0.24 }]] },
  // 7188-7196 .ptk-band-n: the treatment's name, a halo of the tile colour under it; paint-order: stroke
  'talk.band.name': {
    base: { font: [600, em(1)], fill: mix('oklab', param('rx'), 62, tok('text')), halo: { stroke: tok('surface-2'), width: 3, join: 'round' } },
    when: [[{ dark: true }, { fill: mix('oklab', param('rx'), 72, tok('text')) }]],
  },
  // 2962 .ptk-mark line
  'talk.mark.line': { base: { stroke: tok('border'), width: 1, dash: [2, 6] } },
  // 2959, 6178, 2964 .ptk-mark text (the time under the chart; the last mark is "now")
  'talk.mark.text': {
    state: { now: 'class:now' },
    base: { font: [500, svk(px(15))], fill: tok('text-3') },
    when: [[{ host: 'talk' }, { size: em(1) }], [{ now: true }, { fill: tok('text'), weight: 700 }]],
  },
  // 2963, 6178, 2964 .ptk-mark text.ptk-ev: what happened there, at 45 degrees
  'talk.mark.ev': {
    state: { now: 'class:now' },
    base: { font: [600, px(16)], fill: tok('text-2') },
    when: [[{ host: 'talk' }, { size: em(1) }], [{ now: true }, { fill: tok('text'), weight: 700 }]],
  },
  // 2966, 7184 .ptk-line.hv: the HVPG line (the milestones style gives each stretch the colour of its cut-off, data-rate)
  'talk.line.hv': {
    state: { rate: 'data-rate' },
    base: { fill: 'none', stroke: tok('text-2'), width: 2.5, join: 'round', cap: 'round' },
    when: [[{ rate: 'mid' }, { stroke: tok('caution') }], [{ rate: 'hi' }, { stroke: tok('danger') }]],
  },
  // 2967, 6178 .ptk-lbl: a line's name at its right end, in the line's colour (data-p-c)
  'talk.lbl': { base: { font: [700, px(14)], fill: param('c') }, when: [[{ host: 'talk' }, { size: em(1) }]] },
  // 2968-2969 .ptk-pt: a point, filled in its cut-off's colour
  'talk.pt': {
    state: { rate: 'data-rate' },
    base: { fill: tok('surface-2'), stroke: tok('text-2'), width: 2.5 },
    when: [[{ rate: 'mid' }, { stroke: tok('caution'), fill: tok('caution') }], [{ rate: 'hi' }, { stroke: tok('danger'), fill: tok('danger') }]],
  },
  // 2970-2971, 6180 .ptk-v: the last HVPG value
  'talk.value': {
    state: { rate: 'data-rate' },
    base: { font: [700, px(22)], fill: tok('text') },
    when: [[{ host: 'talk' }, { size: em(1.5) }], [{ rate: 'mid' }, { fill: tok('caution') }], [{ rate: 'hi' }, { fill: tok('danger') }]],
  },
  // 7182-7183 .pz-talk .ptk-ms: a milestone's name, a halo under it
  'talk.ms': {
    state: { now: 'class:now' },
    base: { font: [600, em(1)], fill: tok('text-2'), halo: { stroke: tok('surface-2'), width: 3, join: 'round' } },
    when: [[{ now: true }, { fill: tok('text') }]],
  },
  // ── The full chart's "Two gaps" pieces (Mohammad's pick, 6 Nov 2026) ──
  // The band between PV and WHVP (the gap before the sinusoids) and between WHVP and FHVP (the HVPG), in their lines' colours (data-p-c)
  'talk.gap': { base: { fill: param('c'), fillOpacity: 0.16, stroke: 'none' }, when: [[{ dark: true }, { fillOpacity: 0.24 }]] },
  'talk.gap.hv': { base: { fill: param('c'), fillOpacity: 0.09, stroke: 'none' }, when: [[{ dark: true }, { fillOpacity: 0.13 }]] },
  // a band's name, once, inside it
  'talk.gap.name': {
    state: { hv: 'data-hv' },
    base: { font: [600, em(0.92)], fill: tok('text') },
    when: [[{ hv: true }, { fill: tok('text-2') }]],
  },
  // a series line and its points (a ring of the panel's tone round each), the colour given by the builder (data-p-c)
  'talk.line': { base: { fill: 'none', stroke: param('c'), width: 2.25, join: 'round', cap: 'round' } },
  'talk.dot': { base: { fill: param('c'), stroke: tok('surface-2'), width: 2 } },
  // FHVP: a dashed neutral reference
  'talk.line.free': { base: { fill: 'none', stroke: tok('text-3'), width: 1.5, dash: [4, 4], join: 'round', cap: 'round' } },
  // the right column: a swatch, the line's name in the text colour, its last value
  'talk.swatch': { base: { fill: param('c'), stroke: 'none' } },
  'talk.swatch.gap': { base: { fill: param('c'), fillOpacity: 0.6, stroke: 'none' } },
  'talk.lbl.n': { base: { font: [700, em(1)], fill: tok('text') } },
  'talk.lbl.v': { base: { font: [500, em(1)], fill: tok('text-2') } },
  // the stage names, level over the plot (the last is "now")
  'talk.stage': {
    state: { now: 'class:now' },
    base: { font: [600, em(1)], fill: tok('text-2') },
    when: [[{ now: true }, { fill: tok('text') }]],
  },
  // the treatments: a thin neutral bar, a dot where it starts, the name over it
  'talk.rx.bar': { base: { fill: tok('text-3'), opacity: 0.6, stroke: 'none' } },
  'talk.rx.dot': { base: { fill: tok('text-2'), stroke: 'none' } },
  'talk.rx.name': { base: { font: [500, em(0.9)], fill: tok('text-2') } },
  // the time row: a visit's bracket and the breaks between visits, its day, the time between visits
  'talk.axis.mark': { base: { fill: 'none', stroke: tok('text-3'), width: 1.25, cap: 'round', join: 'round' } },
  'talk.when': {
    state: { now: 'class:now' },
    base: { font: [500, em(0.92)], fill: tok('text-2') },
    when: [[{ now: true }, { fill: tok('text'), weight: 700 }]],
  },
  'talk.span': { base: { font: [500, em(0.85)], fill: tok('text-3') } },
  // the readings rows under the plot (the HVPG's in its cut-off's colour, data-rate) and their names
  'talk.read': {
    state: { rate: 'data-rate', now: 'class:now' },
    base: { font: [600, em(1)], fill: tok('text') },
    when: [[{ rate: 'mid' }, { fill: tok('caution') }], [{ rate: 'hi' }, { fill: tok('danger') }], [{ now: true }, { weight: 700 }]],
  },
  'talk.read.name': { base: { font: [500, em(0.92)], fill: tok('text-3') } },
};
