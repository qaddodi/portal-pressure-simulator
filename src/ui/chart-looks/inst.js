// The dock instruments' model pieces (docs/chart-looks-in-code-plan.md WP11b): the Ascites pane's abdominal-pressure dial in instruments.js
// (iapDial, host 'dock'). Written by hand from app.css's .ab-dial* rules in cascade order (the old line numbers beside each entry), those rules
// deleted in the same change. The panes' page elements (.ab-big, .ab-grade, .ab-tile, .ab-dp, the switches…, and .ab-dial-box that holds the
// picture) are HTML and keep their rules. The dial sits inside the figure's wrap, so in the Circuit view's dark looks its tokens are the map's
// (the chart's ctx.view, see instruments.js): nothing here names a view.
// A reading's band is the root's data-rate (ok | caution | danger), set with the number. The three small words are sized by instruments.js's fit()
// (the font-size attribute, as the dial shrinks), so the entries that it moves set no size.
import { tok, own } from './dsl.js';

const SEV = (prop) => [[{ sev: 'ok' }, { [prop]: tok('ok') }], [{ sev: 'caution' }, { [prop]: tok('caution') }], [{ sev: 'danger' }, { [prop]: tok('danger') }]];
const MID = { anchor: 'middle' };   // 5145 .ab-dial text:not(.ab-dial-tl) and 5139 .ab-dial-tl: text-anchor: middle

export const INST = {
  'inst.root': { base: {} },
  'inst.g': { base: {} },
  // 5133 .ab-dial-band: the faint ring of a band, in its rating's colour (5135-5137)
  'inst.dial.band': { state: { sev: 'data-rate' }, base: { fill: 'none', width: 7, opacity: 0.2 }, when: SEV('stroke') },
  // 5134 .ab-dial-live: the lit part of the ring (its dash is the builder's, the reading); 5134 transition: none
  'inst.dial.live': { state: { sev: 'data-rate' }, base: { fill: 'none', width: 7 }, when: SEV('stroke') },
  // 5138 .ab-dial-tick: the 12 and 20 marks
  'inst.dial.tick': { base: { stroke: tok('text-3'), width: 1.2, cap: 'round' } },
  // 5139 .ab-dial-tl: their numbers (size: fit())
  'inst.dial.tl': { base: { ...MID, weight: 600, fill: tok('text-3') } },
  // 5141 .ab-dial-knob line: the pointer (the knob's turn is the builder's, on the frame clock)
  'inst.dial.knob.line': { base: { stroke: tok('text-2'), width: 2, cap: 'round' } },
  // 5142-5144 .ab-dial-knob circle, the root's rating: the knob's ring takes the colour of the reading
  'inst.dial.knob.dot': { state: { sev: 'data-rate' }, base: { fill: tok('surface'), stroke: tok('ok'), width: 2.6 }, when: [[{ sev: 'caution' }, { stroke: tok('caution') }], [{ sev: 'danger' }, { stroke: tok('danger') }]] },
  // 5145-5146 .ab-dial-k: IAP (size: fit())
  'inst.dial.k': { base: { ...MID, weight: 600, fill: tok('text-3'), letterSpacing: own(0.12) } },
  // 5145, 5147 .ab-dial-n: the number
  'inst.dial.n': { base: { ...MID, weight: 650, fill: tok('text'), letterSpacing: own(-0.02), size: 25 } },
  // 5145, 5148 .ab-dial-u: mmHg (size: fit())
  'inst.dial.u': { base: { ...MID, weight: 500, fill: tok('text-3') } },
  // 5145, 5149-5151 .ab-dial-w: the word (size: fit()), in its rating's colour
  'inst.dial.w': { state: { sev: 'data-rate' }, base: { ...MID, weight: 650, fill: tok('ok') }, when: [[{ sev: 'caution' }, { fill: tok('caution') }], [{ sev: 'danger' }, { fill: tok('danger') }]] },
};
