// The presenter's waits that a newer press can cut. (Animation review, push B: Next on a lobule, sinusoid or view-change move did nothing until
// a fixed timer ran out.)
//
// waitCut(ms, cut) resolves when ms have passed, or on the first frame in which cut() holds, whichever is first. A timer still ends it, so a
// hidden tab (no frames) is held no longer than ms; and a slow poll (POLL_MS) looks at cut() in that tab too, as the 40 ms timer of the old
// `until` did. The look is a frame the scheduler gives, never a raw requestAnimationFrame and never a timer a frame at 60 Hz.
//
// createWaits takes its clock and frame from the caller (the presenter hands in its own frameFor('presenter')), so the tests can run it on
// a fake one.

export const POLL_MS = 100;   // (the look in a tab that paints no frames: the longest a cut goes unseen there)

/**
 * @param {{ frame: (cb: () => void) => unknown, later?: typeof setTimeout, clear?: typeof clearTimeout }} env
 */
export function createWaits({ frame, later = setTimeout, clear = clearTimeout }) {
  /** Resolves after ms, or at the first look (a frame, or POLL_MS in a tab with none) at which cut() is true. cut() is asked once now. */
  function waitCut(ms, cut) {
    return new Promise((done) => {
      let over = false, poll = 0, endT = 0;
      const end = () => { if (over) return; over = true; clear(endT); clear(poll); done(); };
      endT = later(end, Math.max(0, ms));
      // (alloc-rare: one look per frame while a presenter step waits, seconds long at most)
      const look = () => {
        if (over) return;
        let hit;
        try { hit = !!cut(); } catch { hit = true; }   // (a cut that throws ends the wait: the step that asked will see for itself)
        if (hit) { end(); return; }
        let seen = false;
        const again = () => { if (seen) return; seen = true; clear(poll); look(); };
        poll = later(again, POLL_MS);
        frame(again);
      };
      look();
    });
  }
  /** Until fn() holds or ms pass (polled by frame, not by a 40 ms timer: no wait runs about 20 ms late on average). */
  const until = (fn, ms = 3000) => waitCut(ms, fn);
  return { waitCut, until };
}
