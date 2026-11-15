// Deck visuals package D (review/deck-visuals-recs.md V23, V24, V15): the teaching card's and the summary tables' opt-in
// fields, as pure functions the unit tests load. presenter.js and handout.js call them; a deck that sets none of these fields
// looks as before.

// ── V23: a source line ─────────────────────────────────────────────────────
// cite: 'Baveno VIII 1.15, 1.16'. The decks cite Baveno VIII (never VII), EASL 2025 or AASLD 2024.
export const citeText = (c) => (typeof c === 'string' ? c.trim() : '');
export const citeOk = (c) => !!citeText(c) && !/\bBaveno\s+VII(?!I)\b/i.test(c);

// ── F9: both guidelines where they part ways ───────────────────────────────
// sides: [{ who: 'Baveno VIII', text }, { who: 'AASLD 2024', text }], two columns under the line on a slide where the two guidelines give
// different answers (review F9, 15 Nov 2026). `text` takes the line's own tokens ({lsm}, {>=10 mmHg}); `rich` is the presenter's.
export const sidesOf = (s) => (Array.isArray(s?.sides) ? s.sides.filter((x) => x && typeof x.who === 'string' && x.who.trim() && typeof x.text === 'string' && x.text.trim()) : []);
export const sidesOk = (s) => s?.sides === undefined || (sidesOf(s).length === 2 && s.sides.length === 2);
export function sidesEl(s, h, rich) {
  const two = sidesOf(s);
  return two.length === 2 ? h('div', { class: 'pz-sides', role: 'group', 'aria-label': 'What each guideline says' }, ...two.map((x) => h('div', { class: 'pz-side' }, h('b', { class: 'pz-side-who' }, x.who.trim()), h('p', { class: 'pz-side-p' }, rich(x.text))))) : null;
}

// ── V15: the summary table ──────────────────────────────────────────────────
/** focusRow: '<slide id>' lights that row; the rest recede. */
export const focusOf = (s) => (typeof s?.focusRow === 'string' && s.focusRow ? s.focusRow : null);

// ── One pressure chart ──────────────────────────────────────────────────────
// A slide written for the old five-station ladder card (data: 'ladder', with brackets, block, ladderFrom: true or '<slide id>' and
// ladderFromLabel) shows the Gut to heart profile instead, everywhere (Mohammad, 21 Oct: "Gut to heart is good, unify it"): its
// earlier line becomes the profile's from (named fromLabel, else "Before"), and its tiles stay. A slide that also has an instrument
// keeps the instrument, with its tiles. Any other slide comes back as it is.
export function oneLadder(s) {
  if (s?.data !== 'ladder') return s;
  const { data, brackets, block, ladderFrom, ladderFromLabel, ...r } = s;   // eslint-disable-line no-unused-vars
  const from = ladderFrom === true || (typeof ladderFrom === 'string' && ladderFrom) ? ladderFrom : null;
  const label = typeof ladderFromLabel === 'string' && ladderFromLabel.trim() ? ladderFromLabel.trim() : null;
  const tool = r.tool || { kind: 'profile', ...(from ? { from } : {}), ...(from && label ? { fromLabel: label } : {}) };
  return { ...r, tool, ...(r.tiles?.length ? { data: 'tiles' } : {}) };
}
