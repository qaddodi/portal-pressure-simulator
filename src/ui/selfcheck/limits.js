// The owner's standing decisions that the judges hold the screen to, named once with their date, their exceptions and their words (bible review 19 Nov 2026, DBG-10). The numbers were
// spread over card-type.js (the app's own floor), fit-rules.js (the judges' copies and their one-line meanings, which disagreed: "under 1.4 times" over a judge that accepted 1.3 on a
// phone) and the owner's messages (the Shuffle's 10 px lived nowhere). A judge imports its number from here; the words in the Check's copy are made from the same numbers, so they
// cannot disagree; `npm run debug -- limits` and the unified debug doc print the table. Pure: no DOM, no page.
//
// The app's own numbers stay where the app reads them (card-type.js owns the floor and the title ratio; the pressure cut-offs are src/engine/portal/pressure-cuts.js); this file imports them, and a test
// ties each to what the app uses.
import { WORDS_MIN_PX, TITLE_RATIO } from '../card-type.js';
import { DIM_ALPHA } from '../label-explain.js';

export { WORDS_MIN_PX, TITLE_RATIO, DIM_ALPHA };

/** A tall instrument card in the Shuffle on a short sideways phone may go down to this (owner, 18 Nov 2026 21:08 ET); every other card's lettering is held to WORDS_MIN_PX. */
export const SHUFFLE_MIN_PX = 10;
/** A phone's stacked or sideways slide (a 23.2 px title over a 17.4 px body, 1.33) may stand at this (owner, 19 Nov 2026: "1.33 is OK if text needs more space"). */
export const PHONE_TITLE_RATIO = 1.3;
/** Sizes are measured to a tenth of a pixel: the least ratio that passes is a hair under the rule. */
export const RATIO_TOLERANCE = 0.02;
/** Empty glass allowed above the first line or below the last of a structure card (its own padding is 14 and 12). */
export const BLANK_MAX = 24;
/** How far a phone sheet's top may stand below the top bar's foot while its words scroll (the gap; a sheet that scrolls has used the room). */
export const SHEET_SHORT_MAX = 40;
/** The teaching card's body, shrunk to fit, is a failure (owner, 17 Nov 2026, 2a8217e3: "body text never shrinks to fit"): it may stand at most this far under its role size (a tenth of a pixel of rounding). */
export const BODY_SHRINK_TOLERANCE_PX = 0.3;

/** The words of the two rules whose meaning depends on a number, made from the numbers. */
export const wording = {
  small: `lettering under ${WORDS_MIN_PX} px (${SHUFFLE_MIN_PX} px on a tall instrument card in the Shuffle)`,
  ratio: `the title is under ${TITLE_RATIO} times the words (${PHONE_TITLE_RATIO} on a phone)`,
};

/** The table, for the doc and `npm run debug -- limits`: { id, value, unit, since, rule, exceptions }. */
export const LIMITS = Object.freeze([
  { id: 'words-floor', value: WORDS_MIN_PX, unit: 'px', since: '17 Nov 2026', rule: 'Lettering on a card is never under this on the screen (data-card text, ffa2bfba).', exceptions: `Tall instrument cards in the Shuffle on a short sideways phone: ${SHUFFLE_MIN_PX} px (18 Nov 21:08 ET).` },
  { id: 'title-ratio', value: TITLE_RATIO, unit: 'x the body', since: '17 Nov 2026', rule: 'A slide title is at least this many times its words (0dcbf220).', exceptions: `A phone's slide: ${PHONE_TITLE_RATIO} when the words need the space (19 Nov 2026).` },
  { id: 'body-never-shrinks', value: BODY_SHRINK_TOLERANCE_PX, unit: 'px under the role size', since: '17 Nov 2026', rule: 'The teaching card\'s body text never shrinks to fit (2a8217e3): the figure and the top card yield instead.', exceptions: 'none' },
  { id: 'label-dim', value: DIM_ALPHA, unit: 'alpha', since: '16 Nov 2026', rule: 'Dim labels step back to one value everywhere (tokens.css --label-dim).', exceptions: 'none' },
  { id: 'blank-glass', value: BLANK_MAX, unit: 'px', since: '18 Nov 2026', rule: 'A structure card stands no more empty glass than this above its first line or below its last.', exceptions: 'none' },
  { id: 'sheet-room', value: SHEET_SHORT_MAX, unit: 'px', since: '18 Nov 2026', rule: 'A phone sheet is as tall as its words, up to the room under the top bar, and scrolls only past that.', exceptions: 'Layers (stops under half the screen on purpose) and the command palette (a fixed-height list on purpose).' },
]);
