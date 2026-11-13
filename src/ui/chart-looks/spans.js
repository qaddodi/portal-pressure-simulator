// The span ruler's looks (tool-spans.js, host 'spans'; the gradients talk, Option A of 13 Nov 2026, /mnt/project-files/gradients-deck-recs/).
// One type size (the host's, em(1)); words told apart by weight and colour. A station's dot and name take the token its piece names
// (data-p-c: tr-pv, tr-wedge, tr-hv, tr-ivc). A gradient's bracket is tinted by its rating (data-rate ok, mid, hi, as crit.zone);
// a bracket with no rating (the empty ruler) is the quiet grey. No piece is a bar or rule on a side of the card.
import { tok, mix, param, em } from './dsl.js';

const RATE = { rate: 'data-rate' };
const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const word = (weight, fill) => ({ base: { weight, size: em(1), fill } });
const rated = (prop, extra = {}) => ({
  state: RATE,
  base: { [prop]: tok('text-3'), ...extra },
  when: [
    [{ rate: 'ok' }, { [prop]: tok('ok') }],
    [{ rate: 'mid' }, { [prop]: tok('caution') }],
    [{ rate: 'hi' }, { [prop]: tok('danger') }],
  ],
});

export const SPANS = {
  // A zone's drop: the quiet bar, and the resistance's bar in the danger red
  'spans.bar': { base: { fill: mix('srgb', tok('text-3'), 45, 'transparent') } },
  'spans.bar.res': { base: { fill: mix('srgb', tok('danger'), 88, 'transparent') } },
  // The resistance's column, carried down through the lanes so the eye sees which bracket crosses it, and its word over the bars
  'spans.col': { base: { fill: mix('srgb', tok('danger'), 11, 'transparent') } },
  'spans.res': { base: { weight: 650, size: em(1), fill: tok('danger') } },
  // The drop over each bar (the resistance's in red), the zone names under the baseline, the quiet note of the empty ruler, the unit in the gutter
  'spans.v': { base: { weight: 650, size: em(1), fill: tok('text-2'), halo } },
  'spans.v.res': { base: { weight: 700, size: em(1), fill: tok('danger'), halo } },
  'spans.zone': word(500, tok('text-3')),
  'spans.note': word(500, tok('text-3')),
  'spans.unit': word(500, tok('text-3')),
  // The baseline under the bars, and the line the stations sit on
  'spans.base': { base: { stroke: mix('srgb', tok('text'), 18, 'transparent'), width: 1.5 } },
  'spans.track': { base: { stroke: mix('srgb', tok('text-3'), 45, 'transparent'), width: 1 } },
  // A station: its dot, its name, and the dotted guide from it down to the brackets that start or end there
  'spans.dot': { base: { fill: param('c') } },
  'spans.st': { base: { weight: 650, size: em(1), fill: param('c') } },
  'spans.guide': { base: { stroke: mix('srgb', param('c'), 55, 'transparent'), width: 1, dash: [1.5, 3] } },
  // A lane: its gradient's name in the gutter, its bracket (solid, in the rating's colour) and the bracket's end ticks
  'spans.lane': word(650, tok('text')),
  'spans.br': rated('stroke', { fill: 'none', width: 3, cap: 'round' }),
  'spans.tick': rated('stroke', { fill: 'none', width: 2.2, cap: 'round' }),
  // A bracket that misses the resistance: dashed and quiet
  'spans.br.miss': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 2.4, cap: 'round', dash: [4, 4] } },
  'spans.tick.miss': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 2, cap: 'round' } },
  // A reading that cannot be taken: the lane's outline and its diagonal hatching
  'spans.blank': { base: { fill: 'none', stroke: tok('text-3'), width: 1 } },
  'spans.hatch': { base: { stroke: mix('srgb', tok('text-3'), 55, 'transparent'), width: 1.2 } },
  // The outlined tag ("Misses", "Misses part", "Cannot be read"): no accent fill, the card's own colour under its words
  'spans.tag': { base: { fill: tok('surface'), stroke: tok('text-3'), width: 1.2 } },
  'spans.tagw': word(600, tok('text-2')),
};
