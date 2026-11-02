// The slide change's teaching card as one page (Mohammad, 1 Nov 2026: "Steps of BRTO or HVPG TIPS during slides makes the text slide
// with my finger then pops back ... This whole slide transition might need to be reimagined"). The glass and its words are one card:
// the finger moves them together, a Next or Back carries them out together the way the talk goes, and the new card comes in together
// from the other side. Only transform and opacity change while they move (the compositor's own work on the GPU): no clip-path (a
// repaint every frame), no size or place of the glass eased (a blurred glass resized in view stalled iPhone Safari), no layout read.

/** Whether a slide change takes the page path: whenever the teaching card is up, for every kind of slide coming (question, case,
 *  visual, new patient, catheter and monitor slides included), except while starting, with reduced motion (fades only), a case card
 *  still up (its words are already out), or a catheter's monitor kept in place across the change (it stays still, only the words
 *  around it go). */
export function pageOn({ up, booting = false, reduce = false, caseCard = false, monKept = false }) {
  return !!up && !booting && !reduce && !caseCard && !monKept;
}

/** The finger follow: the card follows the whole way, never stopping, its move easing toward max px (k of the finger's travel at
 *  first), and fades with the finger's own travel toward fade over fadeAt px. */
export const FOLLOW = { k: 0.3, max: 40, fade: 0.45, fadeAt: 160 };
export function followOf(dx) {
  const x = Math.sign(dx) * FOLLOW.max * (1 - Math.exp(-Math.abs(dx) * FOLLOW.k / FOLLOW.max));
  return { x: x || 0, o: 1 - (1 - FOLLOW.fade) * Math.min(1, Math.abs(dx) / FOLLOW.fadeAt) };
}

/** Where the new card comes in from (dir: 'next' from the right, 'back' from the left, else a short rise), as one transform: the same
 *  keyframes are played on the glass and on the words, so they arrive as one. */
export function pageFrom(dir, d, rise) {
  return dir === 'next' ? `translateX(${d}px)` : dir === 'back' ? `translateX(${-d}px)` : `translateY(${rise}px)`;
}
export const pageIn = (dir, d, rise) => [{ transform: pageFrom(dir, d, rise), opacity: 0 }, { transform: 'none', opacity: 1 }];
