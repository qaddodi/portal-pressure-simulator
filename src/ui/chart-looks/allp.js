// The all-patients chart's own looks (visual-allpatients.js, host 'curve'): the four patients' HVPG over two years with the CSPH line, and the key beside it
// (or under it on a phone). The grid, axis, series line, dot, ring, value and key text are the over-time charts' own (time.js, plot.js); what is here is
// only what no other chart has: the zone words on the plot and the model's dotted year.
import { tok, param, mix, em } from './dsl.js';

const halo = (w) => ({ stroke: tok('surface-2'), width: w, join: 'round' });

export const ALLP = {
  // "CSPH" over the line, "No CSPH" under it, each in its rating's colour
  'ap.zone': {
    state: { tc: 'data-tc' },
    base: { font: [700, em(1)], fill: mix('oklab', tok('danger'), 80, tok('text')), halo: halo(3), letterSpacing: em(0.06) },
    when: [[{ tc: 'ok' }, { fill: mix('oklab', tok('ok'), 80, tok('text')) }]],
  },
  // the second year the deck has no slide for (the model with year one's pace kept): the patient's colour, as short round dashes
  'ap.model': { base: { fill: 'none', stroke: param('c'), width: 3, join: 'round', cap: 'round', dash: [2, 7] } },
};
