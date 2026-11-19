// The edge rules, registered (19 Nov 2026, DBG-1 of the bible review). Mohammad's 19 Nov ask: "measure each card's last text line against the card's visible edge and the
// screen edge". gallery/edge-rules.js holds the judge (judgeEdges, a pure function of readEdges' answer) and used to be called only by the headless sweeps, so the owner's own
// Check, the Sweep, the Phone check and the bug packet never named a half-drawn line. Now one rule per kind runs over `report.cards.edges` (read-cards.js), in every runner
// that runs the family 'edge'. The judge is edge-rules.js's own; nothing is judged a second way here.
import { registerRule } from './rules.js';
import { judgeEdges, EDGE_KINDS, EDGE_WORDS } from '../gallery/edge-rules.js';

const OWNER = { 'edge-cutoff': 'src/ui/card.js', 'edge-off': 'src/ui/presenter-cards.js', 'edge-cutby': 'src/ui/card.js', 'edge-stray': 'src/ui/card-shuffle.js', 'edge-nobacking': 'src/ui/presenter-cards.js' };
const WHY = {
  'edge-cutoff': 'The last line of a card is never cut by the card\'s visible edge (Mohammad, 19 Nov: the words card was clipped on many Shuffle slides and no check named it)',
  'edge-off': 'Words never reach past the screen (19 Nov)',
  'edge-cutby': 'A line is never half drawn by a box inside the card (19 Nov)',
  'edge-stray': 'A card behind in the Shuffle shows only its strip: no line stands across the strip\'s edge, so no half-line of text peeks out (Mohammad, 18 Nov 20:33: a half-line of the back card\'s title in the strip is a stray-text failure)',
  'edge-nobacking': 'No text before its backing: the teaching card\'s words stand on its glass (17 Nov)',
};

// (judgeEdges runs once per report, not once per kind: the results are kept by the edges object.)
const kept = new WeakMap();
function judged(edges) {
  let r = kept.get(edges);
  if (!r) { r = judgeEdges(edges).map((line) => { const i = line.indexOf(': '); return { kind: `edge-${line.slice(0, i)}`, text: line.slice(i + 2) }; }); kept.set(edges, r); }
  return r;
}

for (const kind of EDGE_KINDS) {
  registerRule({
    id: kind, family: 'edge', owner: OWNER[kind], why: WHY[kind] || EDGE_WORDS[kind],
    check: (report) => (report.cards?.edges ? judged(report.cards.edges).filter((p) => p.kind === kind).map((p) => ({ what: 'Slide cards', where: p.text, kind: p.kind })) : []),
  });
}
