// The wording rules, registered (19 Nov 2026, DBG-1 and gap 9 of the bible review): the words on the screen in hand. The lint (scripts/clinical-wording.mjs) judges the app's source strings,
// the Words dump the decks' authored strings and the specimen test the opened slides; none of them could say that "Baveno VII" or "PPG (PV-IVC)" is on THIS screen, so a packet or the Phone
// check never flagged it. One rule per rule name of src/ui/wording.js (the one list), run over the lines of every card of the cards part of the report (teaching, data, top and structure
// cards, the Tests dock, the case card, a toast). Learner text for US physicians: Baveno VIII only, minus not "less", American spelling, no lay words.
import { registerRule } from './rules.js';
import { RULES, SCREEN_RULES, RULE_NAMES } from '../wording.js';

const OWNER = 'src/ui/wording.js';
const ALL = [...RULES, ...SCREEN_RULES];
const ADDED = { 'older-baveno': 'The guideline is Baveno VIII only, never VII (Mohammad, 18 Nov 2026)', 'ppg-label': 'The PPG is labelled "PPG (PV − IVC)" with the minus sign (Mohammad, 18 Nov 2026)',
  'no-number': 'A value that was never worked out never reaches the page (production)', 'open-token': 'A {token} the page did not fill never reaches the page (production)' };
const SAID = { 'less-as-minus': 'Subtraction is "minus", never "less" (Mohammad, 13 Nov 2026)', 'em-dash': 'No em-dash in learner text (Mohammad)', british: 'American spelling (US physicians)' };
const why = (name) => ADDED[name] || SAID[name] || `Learner text is written for US physicians: ${ALL.find((r) => r[0] === name)[2]} (docs/ai-humanizer.md section 6)`;

// (Each card line is judged once per report, not once per rule: the results are kept by the cards object.)
const kept = new WeakMap();
function judged(cards) {
  let found = kept.get(cards);
  if (found) return found;
  found = [];
  const seen = new Set();
  for (const c of cards.cards || []) {
    for (const [text] of c.lines || []) {
      const s = String(text);
      for (const [rule, re, fix, when] of ALL) {
        if (when && !when.test(s)) continue;
        const m = s.match(re);
        const k = `${rule}|${s}`;   // (two patterns of one rule name are one finding)
        if (m && !seen.has(k)) { seen.add(k); found.push({ rule, match: m[0], fix, line: s.length > 90 ? `${s.slice(0, 87)}...` : s, card: `${c.kind[0].toUpperCase()}${c.kind.slice(1)}${c.title ? ` "${c.title}"` : ''}` }); }
      }
    }
  }
  kept.set(cards, found);
  return found;
}

for (const name of RULE_NAMES) {
  registerRule({
    id: `wording-${name}`, family: 'wording', owner: OWNER, why: why(name),
    check: (report) => (report.cards ? judged(report.cards).filter((f) => f.rule === name).map((f) => ({ what: f.card, where: `"${f.match}" in "${f.line}" (write: ${f.fix})` })) : []),
  });
}
