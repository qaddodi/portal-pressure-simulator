// The newest model snapshot per render (the 120 fps addendum, §10.3). The engine posts a snapshot about every 95 ms, and the page
// repaints from one at most every 80 ms; when snapshots pile up behind a busy main thread, each used to be painted in turn, every
// one already out of date. Now every snapshot is INGESTED at once (its parameters, clinical events and monitor samples are taken
// whole, whatever happens to the picture), and only the newest waiting one is PAINTED, in the next frame (or, in a hidden tab where
// no frame comes, after fallbackMs). Nothing is interpolated: a snapshot is painted as the engine sent it, so a reset, an
// intervention or a clock change is never blended into the state before it.

export function createPaintGate({ ingest, paint, ask, cancel, later = setTimeout, unlater = clearTimeout, now = () => performance.now(), minGap = 80, fallbackMs = 100 }) {
  let newest = null, lastPaint = 0, asked = 0, timer = 0;
  function flush() {
    if (asked) { cancel(asked); asked = 0; }
    if (timer) { unlater(timer); timer = 0; }
    const f = newest;
    newest = null;
    if (!f) return;
    lastPaint = now();
    paint(f);
  }
  return {
    /** A snapshot arrived. True when it will be painted (it or a newer one). */
    push(f) {
      ingest(f);
      const quiet = !f.changed && !f.params && !f.events?.length;
      if (quiet && !newest && now() - lastPaint < minGap) return false;   // nothing waits and nothing changed: not painted, as before
      newest = f;
      if (!asked) { asked = ask(flush); timer = later(flush, fallbackMs); }
      return true;
    },
    flush,
    get waiting() { return newest; },
  };
}
