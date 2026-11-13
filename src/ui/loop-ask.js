// One self-asking frame loop, asked for at most once at a time (10 Nov 2026, Mohammad's Mac ?perf in the lobule at rest: "lobule loop: asked for
// 360 frames/s, drew 24/s"). The lobule's loop cleared its frame id as it began and asked for the next frame at its end, and every wake (a store
// change, the tissue's bitmap, the overlay's retry, a label size) asked only `if (!raf)`. A wake that came while the loop itself ran found 0, asked
// for a second loop, and the loop's own end then asked for a third: from then on two copies ran every frame, and each later wake inside a run added
// one more. At rest only the first copy of a frame draws (the rest find the frame drawn and ask again), so the copies cost script and filled the
// readout with frames "skipped on purpose"; while the view moved (no pacing) every copy drew the whole lobule, so a pan or a glide drew it many times
// a frame.
//
// Here the id stands at RUNNING while the loop runs: a wake then is noted (woke), not asked, and once the run ends the loop is asked for again if it
// woke and did not ask itself. A run that throws still ends that way (finally), so a loop is never left marked as running.

/** The id while the loop's run is under way (never a frame id: those start at 1). */
export const RUNNING = -1;

/**
 * ask(cb) -> id: the frame asker (frame.js frameFor(tag)); cancel(id): its cancel; run(now): the loop's body, which calls `again()` for the next frame
 * or leaves it (to sleep). Returns { loop, want(ok), again(), stop(), pending }.
 */
export function createLoopAsk(ask, cancel, run) {
  let id = 0, woke = false;
  function loop(now) {
    id = RUNNING; woke = false;
    try { run(now); } finally { if (id === RUNNING) id = woke ? ask(loop) : 0; }
  }
  return {
    loop,
    /** A wake: the loop is asked for (when `ok`, default true) unless it is asked for already; inside its own run, it is asked for once the run ends. */
    want(ok = true) {
      if (!ok) return;
      if (id === RUNNING) woke = true;
      else if (!id) id = ask(loop);
    },
    /** Inside a run: the next frame is asked for (once, however often this is called in the run). */
    again() { if (id === RUNNING || !id) id = ask(loop); },
    /** The loop stops: the frame asked for is cancelled, and a run under way asks for none. */
    stop() { if (id > 0) cancel(id); id = 0; woke = false; },
    /** Whether a frame is asked for, or the run is under way. */
    get pending() { return id !== 0; },
  };
}
