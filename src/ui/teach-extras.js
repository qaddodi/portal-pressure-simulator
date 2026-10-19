// Deck visuals package D (review/deck-visuals-recs.md V23, V24, V15): the teaching card's and the summary tables' opt-in
// fields, as pure functions the unit tests load. presenter.js and handout.js call them; a deck that sets none of these fields
// looks as before.

// ── V23: a source line ─────────────────────────────────────────────────────
// cite: 'Baveno VIII 1.15, 1.16'. The decks cite Baveno VIII (never VII), EASL 2025 or AASLD 2024.
export const citeText = (c) => (typeof c === 'string' ? c.trim() : '');
export const citeOk = (c) => !!citeText(c) && !/\bBaveno\s+VII(?!I)\b/i.test(c);

// ── V15: the summary table ──────────────────────────────────────────────────
/** focusRow: '<slide id>' lights that row; the rest recede. */
export const focusOf = (s) => (typeof s?.focusRow === 'string' && s.focusRow ? s.focusRow : null);

// ── V24: the ladder's earlier state ─────────────────────────────────────────
// ladderFrom: true (the slide before) or '<slide id>'. Returns { prev: true } or { id }, or null when the slide does not ask.
export const ladderFromOf = (s) => (s?.ladderFrom === true ? { prev: true } : typeof s?.ladderFrom === 'string' && s.ladderFrom ? { id: s.ladderFrom } : null);
/** The legend's name for that line: ladderFromLabel (a few words, such as 'No Rx'), else "Before". */
export const ladderFromName = (s) => (typeof s?.ladderFromLabel === 'string' && s.ladderFromLabel.trim() ? s.ladderFromLabel.trim() : 'Before');
