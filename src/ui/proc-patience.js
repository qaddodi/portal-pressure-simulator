// How long a Next may be swallowed while a procedure's step is still on its way (presenter.js procNext): a Next that waits for the figure to turn to the anatomy, or for the IVC
// reading to play out before the portal reading starts, is held for that, never for good. Past maxMs the Next is let through (the slide moves on): steps must never block
// navigation (Mohammad, 13 Nov 2026, the direct PPG slide: "refusing to go to step 4 or 5 or even to the following slide even if I keep hitting next").
export function createPatience(maxMs) {
  let t0 = 0;
  return {
    /** A Next arrived while waiting: true while the wait is still within maxMs of its first Next, false once it has gone on too long (the wait is then over). */
    ok(now) { if (!t0) t0 = now || 1; if (now - t0 <= maxMs) return true; t0 = 0; return false; },
    /** The wait began, ended or was given up: the next one counts from its own first Next. */
    reset() { t0 = 0; },
  };
}
