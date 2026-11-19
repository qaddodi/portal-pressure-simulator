// The SAAG plane's looks (tool-saag.js, host 'saag'; review F7, 15 Nov 2026): the ascitic fluid's SAAG against its protein, the two cut-off lines and the
// patients as points. One type size (the host's, em(1)), a step under it for the axes and the quieter words, told apart by weight and colour. The
// patient the slide is about is filled in full ink, the others in the accent; a cause the model does not simulate is an open ring. No glow, no box round a name.
import { tok, mix, em } from './dsl.js';
import { AXIS } from './common.js';

/** look → [weight, size in em of the host's size]: the plane's words, the one table the layout measures with (tool-saag.js). */
export const TYPE = {
  'saag.ql': [600, 0.85], 'saag.ax': [500, 0.92], 'saag.axl': [600, 0.92], 'saag.pl': [600, 1], 'saag.pls': [500, 0.85], 'saag.read': [500, 1], 'saag.src': [500, 0.85],
};
const word = (look, fill, extra = {}) => ({ base: { weight: TYPE[look][0], size: em(TYPE[look][1]), fill, ...extra } });
const halo = { stroke: tok('surface'), width: 3, join: 'round' };

export const SAAG = {
  // The two zones with portal hypertension (SAAG at the cut-off or over), the one with a protein-rich fluid a step fainter
  'saag.zone': { base: { fill: mix('srgb', tok('text'), 8, 'transparent') } },
  'saag.zone.hi': { base: { fill: mix('srgb', tok('text'), 5, 'transparent') } },
  // The two cut-off lines, dashed, and the plot's own axes
  'saag.cut': { base: { fill: 'none', stroke: tok('text-3'), width: 1.2, dash: [4, 3] } },
  'saag.axis': { base: { ...AXIS } },
  // The zone's name, the ticks' numbers, the axes' names
  'saag.ql': word('saag.ql', tok('text-3')),
  'saag.ax': word('saag.ax', tok('text-3')),
  'saag.axl': word('saag.axl', tok('text-2')),
  // A patient: the accent, the one the slide is about in full ink, a cause not modelled as an open ring; each one's name, and what is under it
  'saag.pt': { base: { fill: tok('accent') } },
  'saag.pt.cur': { base: { fill: tok('text') } },
  'saag.ptx': { base: { fill: 'none', stroke: tok('text-3'), width: 1.5 } },
  'saag.pl': word('saag.pl', tok('text'), { halo }),
  'saag.pls': word('saag.pls', tok('text-3'), { halo }),
  // What the slide's own patient reads, and the source
  'saag.read': word('saag.read', tok('text-2')),
  'saag.src': word('saag.src', tok('text-3')),
};
