// The criteria card's zones graph looks (docs/chart-looks-in-code-plan.md WP8): tool-criteria.js, host 'crit'. Written by hand from app.css's
// .pzz-* rules (7594-7600, now deleted). The card's own rows (.pzc-*) are page elements, not model pieces, and stay on the stylesheet.
// The rounded plot behind the zones is plot.bg (plot.js). The words' size is the builder's font-size attribute, so no size here.
import { tok, mix } from './dsl.js';

export const CRIT = {
  // 7594-7597 .pzz-z: a zone, tinted in its rating's colour (data-rate); a zone without a rating is the quiet grey
  'crit.zone': {
    state: { rate: 'data-rate' },
    base: { fill: mix('srgb', tok('text-3'), 22, 'transparent') },
    when: [
      [{ rate: 'ok' }, { fill: mix('srgb', tok('ok'), 34, 'transparent') }],
      [{ rate: 'mid' }, { fill: mix('srgb', tok('caution'), 28, 'transparent') }],
      [{ rate: 'hi' }, { fill: mix('srgb', tok('danger'), 32, 'transparent') }],
    ],
  },
  // 7598 .pzz-hl: one diagonal line of the hatched area
  'crit.hatch': { base: { fill: mix('srgb', tok('text'), 30, 'transparent') } },
  // 7599-7600 .pzz-w, .pzz-w.q: the zone names and numbers (a halo in the card's own colour under them); the axis names (q) are quieter
  'crit.word': {
    state: { q: 'class:q' },
    base: { weight: 600, fill: tok('text'), halo: { stroke: tok('surface'), width: 3, join: 'round' } },
    when: [[{ q: true }, { weight: 500, fill: tok('text-2') }]],
  },
};
