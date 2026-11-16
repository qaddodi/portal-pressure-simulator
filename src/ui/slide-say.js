// What the bar's count and the screen reader's line say about the slide asked for (`want`), in one place, so the two never read different slides
// (play-test, 16 Nov 2026: on the case cards of Choose the treatment and Preventing the next bleed the bar read "2 / n" while the hidden
// "Slide 1 of n" line still stood: the line waited for the slide's cards to land, and a case card holds the slide back until it is lifted).
// No imports: the presenter and its tests read it.

/** The bar's count: "2 / 12". */
export const slideCount = (i, n) => `${i + 1} / ${n}`;

/** The reader's line: "Slide 2 of 12: its title" (the title when the slide has one). */
export const slideSay = (i, n, title) => `Slide ${i + 1} of ${n}${title ? `: ${title}` : ''}`;

/** The button's spoken label: the count, and what it opens. */
export const slideCountLabel = (i, n) => `Slide ${i + 1} of ${n}: list the slides`;

/**
 * Whether a slide asked for is already what the screen shows without having landed: a case or question card standing for that very slide
 * (presenter-case.js cardUp tags it with the slide it came up for). A card of an earlier slide, or none, is not.
 * @param {{ want: number, card: { i?: number }|null|undefined }} at
 */
export const slideSaid = ({ want, card }) => !!card && card.i === want;
