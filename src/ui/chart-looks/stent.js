// The stent cards' looks (src/ui/tool-stent.js, 16 Nov 2026): the side view of a TIPS or DIPS and the bar of where its pressure goes.
// New entries, so no stylesheet rule is behind them: the colours are the app's own tokens (the stent's metal, the veins' colours, the
// flow and ramp colours the figure uses), the words' size is the builder's font-size attribute (12 px on screen, as the cross-section's).
import { tok, mix } from './dsl.js';

const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const seg = (t) => ({ base: { fill: mix('srgb', tok(t), 70, 'transparent') } });
const dot = (t) => ({ base: { fill: mix('srgb', tok(t), 70, 'transparent') } });

export const STENT = {
  // the vein stubs either side: the portal vein's colour on the left, the systemic (hepatic) vein's on the right
  'stent.vein.p': { base: { fill: mix('srgb', tok('tour-portal'), 30, tok('surface')), stroke: mix('srgb', tok('tour-portal'), 75, tok('text')), width: 1.2 } },
  'stent.vein.h': { base: { fill: mix('srgb', tok('tour-sys'), 30, tok('surface')), stroke: mix('srgb', tok('tour-sys'), 75, tok('text')), width: 1.2 } },
  // the stent's wall, in the stent metal; the lumen inside it is filled by the piece's own gradient (the figure's velocity colours)
  'stent.wall': { base: { fill: tok('stent-metal'), stroke: mix('srgb', tok('stent-metal'), 60, tok('text')), width: 1, join: 'round' } },
  'stent.lumen': { base: {} },
  // no stent: the outline it would have, dashed
  'stent.ghost': { base: { fill: 'none', stroke: tok('text-3'), width: 1.4, dash: [4.6, 3.2], join: 'round' } },
  // dimension lines (the narrowing's length and lumen), and the flow's arrow
  'stent.dim': { base: { fill: 'none', stroke: tok('text-2'), width: 1.25, cap: 'round', join: 'round' } },
  'stent.arrow': { base: { fill: tok('text-2') } },
  // the Doppler's three points: a tick, the number under it, and a band behind the slide's own third
  'stent.gate.tick': { base: { fill: 'none', stroke: tok('text-2'), width: 1.5, cap: 'round' } },
  'stent.gate.band': { base: { fill: mix('srgb', tok('accent'), 14, 'transparent') } },
  'stent.num': { base: { fill: tok('text'), weight: 700, halo, baseline: 'central' } },
  'stent.word': { base: { fill: tok('text-2'), weight: 600, halo, baseline: 'central' } },
  'stent.cap': { base: { fill: tok('text-3'), weight: 500, halo, baseline: 'central' } },
  // ── where the pressure goes ──
  // the bar's segments: the stent's tract (grey), friction along it (the accent), its two ends (the reversed-flow orange), the narrowing's jet (violet)
  'stent.seg.tract': seg('text-3'),
  'stent.seg.wall': seg('accent'),
  'stent.seg.ends': seg('flow-reversed'),
  'stent.seg.jet': seg('ramp-violet'),
  // what the PPG counts beyond the stent: hatched grey (the piece's own pattern fill), so it reads as "not this stent's"
  'stent.seg.out': { base: { stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1 } },
  'stent.hatch.bg': { base: { fill: mix('srgb', tok('text-3'), 12, 'transparent') } },
  'stent.hatch.stripe': { base: { fill: tok('text-3'), fillOpacity: 0.5 } },
  // a part's mmHg on its segment, and its name in the key under the bar (a halo in the card's colour)
  'stent.lab': { base: { weight: 700, fill: tok('text'), halo, baseline: 'central' } },
  'stent.key.dot.tract': dot('text-3'),
  'stent.key.dot.wall': dot('accent'),
  'stent.key.dot.ends': dot('flow-reversed'),
  'stent.key.dot.jet': dot('ramp-violet'),
  'stent.key.dot.out': { base: { fill: mix('srgb', tok('text-3'), 25, 'transparent'), stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1 } },
  'stent.key.text': { base: { weight: 500, fill: tok('text-2'), halo, baseline: 'central' } },
  // the two brackets under the bar ("Along the length", "Local"), and the ticks over it (the stent's drop, the PPG)
  'stent.bracket': { base: { fill: 'none', stroke: tok('text-3'), width: 1.25, cap: 'round', join: 'round' } },
  'stent.mark': { base: { fill: 'none', stroke: tok('text'), width: 1.75, cap: 'round' } },
  'stent.mark.text': { base: { weight: 600, fill: tok('text'), halo, baseline: 'central' } },
};
