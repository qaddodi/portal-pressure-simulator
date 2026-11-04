// The portal-blood bar's own looks (docs/chart-looks-in-code-plan.md WP6): tool-flows.js, host 'flows'. Written by hand from app.css's .pfl-* rules
// and the pill's .ppf-pill rules in cascade order (the old line numbers beside each entry), those deleted in the same change. A part's colour is
// the piece's data-p-tone (a token name: it was the inline --tone).
import { tok, mix, param, em } from './dsl.js';

const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const lab = (weight) => ({ base: { weight, size: em(1), fill: tok('text'), halo } });

export const FLOWS = {
  // 7156 .pfl-seg: a part's segment of the bar
  'flows.seg': { base: { fill: mix('srgb', param('tone'), 70, 'transparent') } },
  // 7157-7158 .pfl-lab text, .pfl-lab .v: a part's name and its percent on the bar, a halo in the card's colour
  'flows.lab.n': lab(500),
  'flows.lab.v': lab(700),
  // 7160 .pfl-lead
  'flows.lead': { base: { fill: 'none', stroke: tok('text-3'), width: 1, join: 'round' } },
  // 7161-7162 .pfl-mk: the Healthy line and its words
  'flows.mk.line': { base: { fill: 'none', stroke: tok('text-3'), width: 1.75, dash: [4, 5], cap: 'round', join: 'round' } },
  'flows.mk.text': { base: { weight: 500, size: em(1), fill: tok('text-2'), halo } },
  // 7148-7150, 7159 .ppf-pill.pfl-pill: tinted with the part's colour, its words in the text colour (which reads on every tint)
  'flows.pill.rect': { base: { fill: mix('srgb', param('tone'), 15, tok('surface')), stroke: mix('srgb', param('tone'), 50, 'transparent'), width: 1 } },
  'flows.pill.text': { base: { weight: 700, size: em(1), fill: tok('text') } },
  'flows.pill.k': { base: { weight: 600 } },
  'flows.tspan': { base: {} },
};
