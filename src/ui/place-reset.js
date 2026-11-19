// A new layout mode starts the cards from the stylesheet, as a fresh open does (19 Nov 2026: an iPad held sideways, then turned upright,
// left the data card above the screen on 8 of the first 12 HVPG slides).
//
// layoutNow writes each card's place as inline styles (the data card's top, left, width, max-width and max-height; the words' top, bottom and
// margin) at the END of its pass, and reads the cards' computed top and bottom at the START of the next to plan the phone's cap and its closed
// data card (phoneTextCap). Within one mode the two agree. Across a turn they do not: the sideways layout's `top: 453px; bottom: auto` was still
// on the cards when the upright pass measured, so it saw 258 px of room instead of 1088, planned the data card shut (autoDock) and kept it shut
// (the plan is held for the slide at that size), where a fresh open at the same size leaves it open. Any change of mode (a turn, a window crossing
// the phone, the short or the card width) is that same stale read, so the inline places are dropped when the mode changes, before anything is measured.
//
// Pure: no DOM beyond `el.style`, so tests/place-reset.test.js runs it in node.

/** The inline places the layout writes on the data card, the words' card and the panel, and the shade/safe boxes it sizes from them. */
export const PLACED = {
  data: ['top', 'left', 'width', 'maxWidth', 'maxHeight'],
  text: ['top', 'bottom', 'marginBlock', 'maxHeight'],
};

/** The layout mode a pass is in: when it changes, the places left by the last mode are stale. */
export const modeKey = ({ phone, card, short, low }) => `${+!!phone}${+!!card}${+!!short}${+!!low}`;

/**
 * Drops the inline places of `cards` ({ data, text }) when `key` is not the mode they were last laid out in (`seen`: a WeakMap keyed by any
 * object that lives as long as the cards, the presenter's root). The first pass of a new talk only records the mode: nothing is stale there.
 * Returns true when it cleared.
 */
export function resetPlace(seen, owner, key, cards) {
  const was = seen.get(owner);
  seen.set(owner, key);
  if (was === undefined || was === key) return false;
  for (const name of ['data', 'text']) {
    const el = cards[name];
    if (el?.style) for (const prop of PLACED[name]) el.style[prop] = '';
  }
  return true;
}
