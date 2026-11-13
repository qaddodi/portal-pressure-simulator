// The guideline path card's looks (7 Nov 2026): tool-path.js, host 'path'. The whole card is one model drawn on the GPU (svg-gl.js): the
// connectors, the dots, and every word (path.<role>, the roles of tool-path.js ROLE). A piece's colour is the piece's data-p-tone (a token
// name: text, ok, caution or danger); a piece on the patient's path has the class lit.
//   unlit: the card's quiet grey and the nodes' words at 40%      lit: the branch's own colour, the line a little thicker, the words full
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
  // the nodes' words of the whole chart: a condition, a verdict (the branch's colour when lit), a detail, the statement's number
  'path.t': { state: { lit: 'class:lit' }, base: { weight: 400, fill: tok('text-2'), opacity: 0.4, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  'path.r': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text'), opacity: 0.4, halo }, when: [[{ lit: true }, { fill: param('tone'), opacity: 1 }]] },
  'path.s': { state: { lit: 'class:lit' }, base: { weight: 400, fill: tok('text-3'), opacity: 0.4, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  'path.st': { state: { lit: 'class:lit' }, base: { weight: 500, fill: tok('text-3'), opacity: 0.4, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  // the card's head and foot: the source, the patient's numbers, the guideline's statements
  'path.kick': { base: { weight: 600, fill: tok('text-2') } },
  // the source's pill behind it
  'path.pill': { base: { fill: tok('surface-2') } },
  'path.chips': { base: { weight: 500, fill: tok('text'), halo } },
  'path.foot': { base: { weight: 400, fill: tok('text-3'), halo } },
  // the small map's reading: the verdict in its colour, the statement, the why and the next step
  'path.rh': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text'), halo }, when: [[{ lit: true }, { fill: param('tone') }]] },
  'path.rs': { base: { weight: 500, fill: tok('text-3'), halo } },
  'path.rp': { base: { weight: 400, fill: tok('text'), halo } },
  // ── the other kinds (path-cards.js): the score card and checklist, the grid, the ladder ──
  // at rest plain ink; on the patient's answers the colour of the verdict (or of the cell); everything else unlit at 40%
  // a row's name and its definition
  'path.rn': { base: { weight: 600, fill: tok('text'), halo } },
  'path.rd': { base: { weight: 400, fill: tok('text-3'), halo } },
  // an answer to choose from: the box, its words and its points
  'path.opt': {
    state: { lit: 'class:lit' },
    base: { fill: 'none', stroke: tok('border-strong'), width: 1, opacity: 0.4 },
    when: [[{ lit: true }, { fill: mix('srgb', param('tone'), 14, 'transparent'), stroke: param('tone'), width: 1.5, opacity: 1 }]],
  },
  'path.op': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text-2'), opacity: 0.4, halo }, when: [[{ lit: true }, { fill: param('tone'), opacity: 1 }]] },
  'path.pt': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text-3'), opacity: 0.4, halo }, when: [[{ lit: true }, { fill: param('tone'), opacity: 1 }]] },
  // the score's bar of zones and the zones' names under it
  'path.bar': { state: { lit: 'class:lit' }, base: { fill: tok('border-strong'), opacity: 0.4 }, when: [[{ lit: true }, { fill: param('tone'), opacity: 1 }]] },
  'path.zl': { state: { lit: 'class:lit' }, base: { weight: 500, fill: tok('text-3'), opacity: 0.4, halo }, when: [[{ lit: true }, { weight: 500, fill: param('tone'), opacity: 1 }]] },
  // the grid: the columns' and rows' names, a cell and its words (the cell's colour is its own)
  'path.gh': { state: { lit: 'class:lit' }, base: { weight: 500, fill: tok('text-3'), halo }, when: [[{ lit: true }, { fill: param('tone') }]] },
  'path.gr': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text-2'), halo }, when: [[{ lit: true }, { fill: param('tone') }]] },
  'path.gs': { state: { lit: 'class:lit' }, base: { weight: 400, fill: tok('text-3'), halo }, when: [[{ lit: true }, { fill: tok('text-2') }]] },
  // (7 Nov 2026, mock C) the cells with the same answer are one shape in the answer's colour, faint at rest; the patient's cell a filled inset in it
  'path.group': {
    state: { lit: 'class:lit' },
    base: { fill: mix('srgb', param('tone'), 8, 'transparent'), stroke: mix('srgb', param('tone'), 50, 'transparent'), width: 1.25 },
    when: [[{ lit: true }, { fill: mix('srgb', param('tone'), 14, 'transparent'), stroke: param('tone'), width: 2 }]],
  },
  'path.cell': { base: { fill: mix('srgb', param('tone'), 24, 'transparent'), stroke: 'none' } },
  // an answer's words in its own colour, quieter at rest; the column and row names lit in the ink on the patient's answers
  'path.ct': { state: { lit: 'class:lit' }, base: { weight: 600, fill: mix('srgb', param('tone'), 100, 'transparent'), opacity: 0.75, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  'path.ctc': { state: { lit: 'class:lit' }, base: { weight: 600, fill: mix('srgb', param('tone'), 100, 'transparent'), opacity: 0.75, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  'path.cs': { state: { lit: 'class:lit' }, base: { weight: 400, fill: tok('text-3'), opacity: 0.75, halo }, when: [[{ lit: true }, { fill: tok('text-2'), opacity: 1 }]] },
  // the ladder: a step's line, "Stage n", "Patient is here", what the stage means, and the way back
  'path.step': { state: { lit: 'class:lit' }, base: { fill: 'none', stroke: tok('border-strong'), width: 3, cap: 'butt', opacity: 0.4 }, when: [[{ lit: true }, { stroke: param('tone'), opacity: 1 }]] },
  'path.sn': { state: { lit: 'class:lit' }, base: { weight: 500, fill: tok('text-3'), opacity: 0.4, halo }, when: [[{ lit: true }, { opacity: 1 }]] },
  'path.yo': { base: { weight: 600, fill: mix('srgb', param('tone'), 100, 'transparent'), halo } },
  'path.sw': { base: { weight: 600, fill: tok('text'), halo } },
  'path.back': {
    state: { lit: 'class:lit' },
    base: { fill: 'none', stroke: tok('border-strong'), width: 1, dash: [4, 3], opacity: 0.4 },
    when: [[{ lit: true }, { stroke: param('tone'), opacity: 1 }]],
  },
  'path.bk': { state: { lit: 'class:lit' }, base: { weight: 400, fill: tok('text-2'), opacity: 0.4, halo }, when: [[{ lit: true }, { fill: tok('text'), opacity: 1 }]] },
  'path.bb': { state: { lit: 'class:lit' }, base: { weight: 600, fill: tok('text-2'), opacity: 0.4, halo }, when: [[{ lit: true }, { fill: param('tone'), opacity: 1 }]] },
  // a hairline between the card's parts
  'path.rule': { base: { fill: 'none', stroke: tok('hairline'), width: 1 } },
};
