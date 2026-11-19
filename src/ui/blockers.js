// What covers the figure: the one list, the one set of rules, the one box rule (bible review 19 Nov 2026, STG-2).
//
// Pieces of the page sit over the figure and its labels keep clear of them: the slide's cards (.stage-blocker), the teaching card's
// glass (.pz-shade, which on a phone reaches 16 px above the words), the view switcher's holder (#nbViews) and the phone's clock
// ("Day 30"). The stage's labels, the lobule's, the sinusoid's, the probe and the catheter's readings each used to keep their own
// copy of the list, and the lobule and sinusoid kept the shortest one: a label tucked its top under the teaching card's glass in
// those two views (the bug fixed on the anatomy on 3 Nov 2026).
//
// Everything that asks "what is over the figure" asks here:
//  - BLOCKER_SEL: the selector, once (tests/blockers.test.js fails a second copy in the label modules);
//  - blockerGone(el): the pieces that count for nothing (hidden, on their way out, a glass with no words on it);
//  - blockerRects(rectOf, els): the pieces' boxes, each where it RESTS (a card whose own entrance transform still slides it, data-safe-rest,
//    counts at its place of rest, so a label placed against it is placed once, not again when the card has landed).
// A consumer turns the page boxes into its own coordinates (stage px, the lobule's px) and pads them as it needs.
import { readBox, readStyle } from './layout-snap.js';
import { restBox, translateRest } from './util.js';

export const BLOCKER_SEL = '.stage-blocker:not([hidden]), .pz-shade, #nbViews, .stage-clock';

/** The pieces over the figure now, in document order (the same list for every consumer). */
export const blockerEls = () => document.querySelectorAll(BLOCKER_SEL);

/** True when a piece covers nothing: hidden by visibility, leaving, a glass with no words on it, or the view switcher's empty holder. */
export function blockerGone(el) {
  if (el.id === 'nbViews' && !el.querySelector('#viewSeg')) return true;   // (the holder over the play bar counts only while it holds the switcher)
  // A closed card can stay in place, invisible (the patient chart does): it hides nothing. (So does a glass with no words on it.)
  // (Nor does a card on its way out, a panel included: 2 Nov, the organs' names went off for half a second as a slide's panel left,
  // and came back once it had gone.)
  if (el.classList.contains('pz-leave')) return true;
  if (el.classList.contains('pz-shade') && el.style.opacity === '0') return true;
  return readStyle(el).visibility === 'hidden';
}

/** A piece's box where it rests: an entrance offset of its own is taken off (data-safe-rest), as the camera frames the same card. */
export function restRect(el, q) {
  return el.dataset && 'safeRest' in el.dataset ? translateRest(el, restBox(el, q)) : q;
}

/**
 * The boxes of what covers the figure, in page px, each as { el, left, top, right, bottom } (a piece with no area is left out).
 * rectOf(el): how a box is asked for (default the layout snapshot's read; the stage hands the rects its observer delivered).
 * els: when given, only these pieces count (those the boxes were asked for; one that came in since is read with the next ask).
 */
export function blockerRects(rectOf = readBox, els = null) {
  const out = [];
  for (const el of blockerEls()) {
    if (els && !els.includes(el)) continue;
    if (blockerGone(el)) continue;
    const q = restRect(el, rectOf(el));
    if (q.width && q.height) out.push({ el, left: q.left, top: q.top, right: q.right, bottom: q.bottom });
  }
  return out;
}
