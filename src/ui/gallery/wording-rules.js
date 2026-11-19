// The wording rules the Words dump bench (benches/words-dump.js) judges the decks' text by. The list is src/ui/wording.js's, the one copy the lint, the dump, the node tests and the
// registry's wording rules share (it was a hand copy of the lint's list, tied together by a test). This file keeps the old import path.
export { RULES, EXTRA_RULES, checkWording } from '../wording.js';
