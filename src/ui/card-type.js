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
/** A title stays clearly a title (17 Nov 2026, the tester: at 1440 x 780 the title of slide 20 fell to 22.4 px over 18 px words, 1.24 times, and read as a bold first line). */
export const TITLE_RATIO = 1.4;
/** The least the title may step down to (--pz-tk) on a laptop: TITLE_RATIO times the words (px, both at tk 1), never under the card-type steps' last (WIDE.tight), never over 1 (a title already
 *  closer to the words than that is not made smaller, nor larger). */
export const titleFloorK = (titlePx, bodyPx) => (titlePx > 0 && bodyPx > 0 ? Math.min(1, Math.max(WIDE.tight, TITLE_RATIO * bodyPx / titlePx)) : WIDE.tight);

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
export function sidewaysWords(put, smallest, own) {
  // (own: { clear(), restore() }: the card's zoom from an earlier, larger fit, taken off while the steps are judged and put back where none is kept. A step is
  // judged at its own size: with Regular's 0.984 still on it, Circulation 3 on a 844 x 390 phone read 11.8 px at the first step and kept none.)
  own?.clear();
  let last = null, below = false;
  for (const [tk, bk] of SIDEWAYS_WORDS) {
    below = put(tk, bk);
    if (smallest() < WORDS_MIN_PX - 0.01) { below = last ? put(last[0], last[1]) : false; break; }
    last = [tk, bk];
    if (below) break;
  }
  if (!last) own?.restore();
  return { below, last };
}

/** How far a stacked pair of cards that overshoots the screen by `over` px may rise into its top margin: the overshoot, and no more than the margin
 *  less `keep` px (never closer than that to the top). 0 where it fits. (A phone on its side, presenter.js layout: the pair's last few px.) */
export const pairRise = (over, top, keep) => Math.max(0, Math.min(over, top - keep));

// A phone's stack (upright: the data card on top, the figure between, the words' card under it), planned from measured heights, screen px.
// The words keep their Regular size on every slide (Mohammad, 17 Nov 2026, TIPS 6 and 12, MASLD 6: "Fix this issue everywhere"): they used to take
// what the data card left them, 12 px to Compact, so a tall data card (a trial, Fibroscan) shrank them. Now the room is found on the other side:
// the figure's share gives way first, from figMin down to figFloor, and where that is not enough the data card comes in closed (its handle at the
// top, pulled open by the reader), never the words smaller. Pure: tests/phone-words-plan.test.js runs it over every height.
//   room: the height for dtop + data card + figure + words (screen height less the foot, the glass's reach and the top margin)
//   dtop: the data card's top margin; data: its height at full size; dmax: the tallest it may stand open (Infinity: no cap); lip: its sheet's edge
//   regular: the words' card at Regular, its natural height; mine: the words' own cap (62 % of the screen); grip: the closed card's edge
//   figMin, figFloor: the figure's usual share and the least it may give way to; gone: no data card; hasData: it has something to close
export function phonePlan({ room, dtop, data, dmax = Infinity, lip = 0, regular, mine, grip, figMin, figFloor, gone = false, hasData = true }) {
  let both = room - dtop - figMin, fig = figMin;
  const short = regular - (both - data);
  if (!gone && short > 0 && short <= figMin - figFloor) { both += short; fig = figMin - short; }
  const shut = !gone && hasData && (both - data < regular || data - lip > dmax + 0.5);
  const cap = shut
    ? Math.min(room - grip, Math.max(Math.min(mine, room - dtop - Math.min(data, dmax + lip)), regular))
    : Math.min(room - dtop - data, Math.max(Math.min(mine, both - data), regular));
  return { cap: Math.max(120, cap), shut, fig };
}
/** The least a phone's figure gives way to: over a fifth of the screen, never under 150 px (and never over the figure's usual share). A smaller band hid what a slide is
 *  about behind the words (TIPS 6, an iPhone, 17 Nov 2026: the ascites, bowel and colon stood under the teaching card, the figure squeezed to 12 %). Where the words at
 *  their Regular size need more than that, the data card closes (phonePlan), as it does when it is too tall. */
export const figFloorOf = (H) => Math.min(Math.round(Math.max(150, 0.22 * H)), Math.round(Math.max(170, 0.3 * H)));
