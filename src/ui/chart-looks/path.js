// The guideline path card's looks (7 Nov 2026): tool-path.js, host 'path'. The connectors of the whole chart (Mac, iPad) and the whole of the
// small map (phone) are a model drawn on the GPU (svg-gl.js); the chart's own words are page text. A piece's colour is the piece's data-p-tone
// (a token name: text, ok, caution or danger); a piece on the patient's path has the class lit.
//   unlit: the card's quiet grey and the words at 55%      lit: the branch's own colour, the line a little thicker, the words full
import { tok, mix, param } from './dsl.js';

const halo = { stroke: tok('surface'), width: 3, join: 'round' };

export const PATH = {
  // a connector between two nodes: grey, or the node's colour on the patient's path
  'path.edge': {
    state: { lit: 'class:lit' },
    base: { fill: 'none', stroke: mix('srgb', tok('border-strong'), 80, 'transparent'), width: 1.5, join: 'round', cap: 'round' },
    when: [[{ lit: true }, { stroke: param('tone'), width: 2.8 }]],
  },
  // a node of the small map: a ring, filled in its colour on the path
  'path.dot': {
    state: { lit: 'class:lit' },
    base: { fill: tok('surface'), stroke: tok('border-strong'), width: 1.5 },
    when: [[{ lit: true }, { fill: param('tone'), stroke: param('tone') }]],
  },
  // a node's name on the small map, in the label style (outlined, plain ink at rest; lit: the branch's colour; unlit: quiet)
  'path.word': {
    state: { lit: 'class:lit' },
    base: { weight: 500, fill: tok('text-2'), opacity: 0.6, halo },
    when: [[{ lit: true }, { weight: 600, fill: param('tone'), opacity: 1 }]],
  },
};
