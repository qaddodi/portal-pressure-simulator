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
export const WIDE = { title: 0.8, words: 0.88 };
