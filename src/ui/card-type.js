// The teaching card's text in two fixed sizes, Regular and Compact (Mohammad, 19 Oct: "Two fixed sizes"): a slide short of room
// takes Compact, never a size in between, so its title always reads larger than its words and its buttons and tabs never larger
// than them. Only a slide that does not fit even at Compact goes smaller, the whole card at once (presenter.js fitCards).
// tests/card-type.test.js checks the order on every layout and text size.

// A phone, upright or on its side, and an upright iPad: the whole card at one zoom (--pz-fit), Compact four fifths of Regular
// (a 390 px phone: title 23.2 → 18.6 px, words 17.4 → 13.9 px).
export const COMPACT = 0.8;
// Its row of buttons (14 px at the usual text size) at Compact: 13 px, never under 12 (styles/app.css .pz.stack .pz-text > .pz-ab).
export const AB_COMPACT = 13 / 14, AB_FLOOR = 12 / 14;
// A laptop or a sideways iPad: the title (--pz-tk) and the words (--pz-bk) each one step.
// tight: the title's one further step, for a pair still too tall for its data card at Compact (presenter.js layout, squeeze); the words stay at
// Compact. The CAUSES line goes after it (Mohammad, 23 Oct).
export const WIDE = { title: 0.8, words: 0.88, tight: 0.62 };

// A phone held sideways (a screen 500 px tall or less) whose pair of cards is still too tall at Compact: the words' card (title, words) steps down
// further, one step at a time, never under 12 px on the screen (presenter.js layout). The data card is what the slide teaches there, so it
// keeps the room the words give up, and the words stay at the last step, never back at Compact (Doppler 3, 844 x 390: the words' card
// took two thirds of the height and the spectrum was a strip).
export const SIDEWAYS_MAX_H = 500;
export const SIDEWAYS_WORDS = [[0.62, 0.8], [0.58, 0.72], [0.54, 0.64], [0.5, 0.58]];
export const WORDS_MIN_PX = 12;
/** The sideways steps, tried in order. put(tk, bk) sets the words and says whether the pair of cards now fits; smallest() is the card's smallest
 *  lettering on the screen, px. A step is kept only while that is 12 px; where none fits the pair the words stay at the last step kept (null: not
 *  even the first keeps 12 px, the caller leaves them at Compact). Returns { below: fits, last: [tk, bk] | null }. */
export function sidewaysWords(put, smallest) {
  let last = null, below = false;
  for (const [tk, bk] of SIDEWAYS_WORDS) {
    below = put(tk, bk);
    if (smallest() < WORDS_MIN_PX - 0.01) { below = last ? put(last[0], last[1]) : false; break; }
    last = [tk, bk];
    if (below) break;
  }
  return { below, last };
}
