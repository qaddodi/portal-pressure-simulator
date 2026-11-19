// The card fit rules, registered (plan screen-report-recs section 2): the judging that gallery/fit-rules.js keeps (one place, shared with scripts/card-fit.mjs and
// the gallery's Check button), now run over a screen report. One rule per kind, each a pure function of report.cards.fit (readCards' result) and
// report.cards.structure (readStructureCard's). The judges are fit-rules.js's own (judgeCards, judgeStructureCard); nothing is judged a second way here.
import { registerRule } from './rules.js';
import { judgeCards, judgeStructureCard, KINDS, KIND_WORDS } from '../gallery/fit-rules.js';

const OWNER = { scroll: 'src/ui/card-type.js', clipped: 'src/ui/card-type.js', off: 'src/ui/presenter.js', enlarged: 'src/ui/presenter-zoom.js', small: 'src/ui/card-type.js', ratio: 'src/ui/card-type.js', sideways: 'src/ui/presenter-cards.js', styled: 'src/ui/presenter-question.js', blank: 'src/ui/card.js', cut: 'src/ui/card.js', tall: 'src/ui/card.js' };
const WHY = { small: 'Data-card text is at least 12 px (17 Nov)', ratio: 'The slide title is at least 1.4 times the body (17 Nov), 1.3 on a phone where the words need the space (Mohammad, 19 Nov)', sideways: 'Nothing inside a card scrolls sideways: a phone swipe would open the next card (17 Nov)', styled: 'A card is never shown before it is fully loaded and styled; no text before its backing (17 Nov)' };

// (judgeCards and judgeStructureCard run once per report, not once per kind: the results are kept by the report object.)
const kept = new WeakMap();
function judged(cards) {
  let r = kept.get(cards);
  if (!r) { r = [...judgeCards(cards.fit || {}).map((p) => ({ ...p, where: 'slide' })), ...judgeStructureCard(cards.structure || null).map((p) => ({ ...p, where: 'card' }))]; kept.set(cards, r); }
  return r;
}

for (const kind of KINDS) {
  if (kind === 'zoomed') continue;   // (needs a second reading with the card enlarged: the gallery's zoom check, not a state of one report)
  registerRule({
    id: `fit-${kind}`, owner: OWNER[kind] || 'src/ui/presenter.js', why: WHY[kind] || `Cards must fit: ${KIND_WORDS[kind]}`,
    check: (report) => (report.cards ? judged(report.cards).filter((p) => p.kind === kind).map((p) => ({ what: p.where === 'card' ? 'Structure card' : 'Slide cards', where: p.text })) : []),
  });
}
