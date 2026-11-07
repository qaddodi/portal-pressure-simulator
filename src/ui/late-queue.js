// The figure's deferred structure writes (stage.js late(op, a, b)): a frame builds nodes and queues what to do with them; a rest pass
// applies the queue, in the order asked. No DOM here: `run` does the writing, `ask` schedules a pass (rest-pass.js restPass) and `cancel`
// drops one not yet run (cancelRest), so tests can drive it.
//
// `now()` is for work that is already between frames and writes the page itself in several steps that must land together (a label's
// new pieces, its fills, its place): it applies the queue at once instead of leaving it for a later task, in which a frame could be drawn
// of the label in its new place with its old pieces (2 Nov 2026, "no more glitches": old words against the new box for a frame).

export function createLateQueue(run, ask, cancel) {
  // (A frame queues ops into a kept set of three lists and a count, no record per op. `flush` takes the set that is filling, and
  // fills a spare one meanwhile, so an op queued by a `run` call (or a `now()` inside one) waits for the next pass, as before. Spares
  // are kept in a pool: they only grow to the deepest nesting seen.)
  const spare = [];
  const fresh = () => spare.pop() || { o: [], a: [], b: [], n: 0 };   // alloc-rare: a set is made only while nested flushes are deeper than ever before
  let cur = fresh(), pass = 0;
  function flush() {
    pass = 0;
    const set = cur;
    cur = fresh();
    const { o, a, b, n } = set;
    for (let i = 0; i < n; i++) { run(o[i], a[i], b[i]); a[i] = b[i] = undefined; }   // (the pieces are let go as they run)
    set.n = 0;
    spare.push(set);
  }
  return {
    /** Queues an op; a pass to apply the queue is asked for once. */
    push(op, a, b) { const n = cur.n++; cur.o[n] = op; cur.a[n] = a; cur.b[n] = b; if (!pass) pass = ask(flush); },
    /** Applies what is queued now, in the order asked, and drops the pass that was waiting for it. */
    now() {
      if (pass) { cancel(pass); pass = 0; }
      if (cur.n) flush();
    },
    flush,
    get pending() { return cur.n; },
  };
}
