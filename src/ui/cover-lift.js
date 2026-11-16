// The start's "Preparing the slides" cover lifts on a finished slide, never on a card still coming in.
// The cards' own way in is card-throw.js's, on the eases' clock: getAnimations() never lists it, so a wait on the browser's animations alone ended
// while a card still faded in (slow machine, long frames), and the card came in again under the lifting cover, the pop (Mohammad's play-test,
// 16 Nov 2026, build ca029399: "Preparing the slides" for about 5 s with the card ghosted behind, then the card pops fully in).

/** Resolves once no card is on its way in (or alive() says the talk is over), or after cap ms. until(pred, ms) is the presenter's frame-polled wait. */
export const cardsLanded = ({ until, alive, entering, cap = 3000 }) => until(() => !alive() || !entering(), cap);

/** Then the cover's own fade, timed by the clock like a card's, starts on smooth frames (smooth(cut, ms) resolves when frames come promptly, or after ms). */
export const calmFrames = ({ smooth, alive, ms = 600 }) => smooth(() => !alive(), ms);

/** The two frame gates of the presenter's waits, on its frame scheduler (nextFrame = frameFor('presenter')). */
export function createFrameGates(nextFrame) {
  /** One painted frame (or 100 ms: a hidden tab paints none). */
  const painted = () => new Promise((done) => { const t = setTimeout(done, 100); nextFrame(() => { clearTimeout(t); done(); }); });
  /** Until the page paints two frames in a row promptly, or ms pass. A card's fade is timed by the clock, not by the frames shown:
   *  one begun just before a long frame (a new organ picture, a lens repainting the figure) is over when that frame lands, and the
   *  card seems to pop. Begun once the frames come smoothly, it is seen whole. */
  async function smooth(cut, ms = 700) {
    const need = 2;   // (two prompt frames in a row since 1 Nov 2026: one alone was often the gap between two long ones)
    const t0 = performance.now(); await painted(); let last = performance.now(), run = 0;
    while (!cut() && performance.now() - t0 < ms) { await painted(); const t = performance.now(); run = t - last < 40 ? run + 1 : 0; if (run >= need) return; last = t; }
  }
  return { painted, smooth };
}
