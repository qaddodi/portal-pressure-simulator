// Resize reports during a fold describe the animation, not a new room to fit the cards into.
// Keep their strongest request without polling; the fold's final resize consumes it at rest.
export function createCardLayoutQueue({ frame, cancel, blocked, run }) {
  let pending = null, raf = 0;
  const reset = () => { cancel(raf); raf = 0; pending = null; };
  function flush() {
    raf = 0;
    if (blocked() || !pending) return;
    const kind = pending; pending = null;
    run(kind);
  }
  return {
    request(kind) {
      if (kind === 'layout' || !pending) pending = kind;
      if (!raf && !blocked()) raf = frame(flush);
    },
    // The final resize already fits and lays out the whole slide. Cancel a previously queued
    // observer callback too, so releasing a drag cannot lay everything out twice in that frame.
    settle(finalize) { reset(); finalize(); },
    reset,
  };
}
