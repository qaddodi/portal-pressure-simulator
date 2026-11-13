// A procedure slide's Next is counted by its ring, never by the animation (Mohammad, 13 Nov 2026, the direct PPG slide: "I keep hitting next next next next and it's stuck at 3").
// The ring is the step the last Next reached (-1: none yet); steps is how many the slide lists (the procedure's, then its reading's). Every Next moves the ring exactly one step
// and the Next after the last moves on to the next slide, whatever the catheter, the camera or a queued run is doing: the animation is only told where to go.
//
// procNavPlan answers one press. { to: -1 } moves on; otherwise { to: the step the ring goes to, how: what the animation is told }:
//   'wait'   a run is still starting (its figure turning to the anatomy): it starts on the ring when it can
//   'jump'   a run is playing: it goes to step `at` of its own (run.to)
//   'chain'  the main run is playing and the step is its reading's: it goes to its last step and the reading goes on from there (rushed when it must play out first)
//   'start'  nothing is playing: the main run starts at step `at`, or the reading after it does (reading: true)
// run: null, or { reading: it is the reading's run (not the main one), at: the step it is on, nMain: the main run's step count }.
export function procNavPlan({ ring, steps, nMain, hasThen, waiting = false, run = null, readingPending = false }) {
  const at = Number.isFinite(ring) ? Math.max(-1, Math.floor(ring)) : -1;
  const to = at + 1;
  if (to >= steps) return { to: -1 };
  if (waiting) return { to, how: 'wait', queue: hasThen && to >= nMain };
  if (run) {
    if (run.reading) return { to, how: 'jump', at: to - nMain };
    if (to < nMain) return { to, how: 'jump', at: to };
    return { to, how: 'chain', at: nMain - 1 };
  }
  const reading = !!(hasThen && readingPending);
  const base = reading ? nMain : 0;
  return { to, how: 'start', reading, at: Math.min(to - base, (reading ? steps - nMain : nMain) - 1) };
}
