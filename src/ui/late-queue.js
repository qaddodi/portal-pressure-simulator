// The figure's deferred structure writes (stage.js late(op, a, b)): a frame builds nodes and queues what to do with them; a rest pass
// applies the queue, in the order asked. No DOM here: `run` does the writing, `ask` schedules a pass (rest-pass.js restPass) and `cancel`
// drops one not yet run (cancelRest), so tests can drive it.
//
// `now()` is for work that is already between frames and writes the page itself in several steps that must land together (a label's
// new pieces, its fills, its place): it applies the queue at once instead of leaving it for a later task, in which a frame could be drawn
// of the label in its new place with its old pieces (2 Nov 2026, "no more glitches": old words against the new box for a frame).

export function createLateQueue(run, ask, cancel) {
  let q = [], pass = 0;
  function flush() {
    pass = 0;
    const list = q;
    q = [];
    for (const [op, a, b] of list) run(op, a, b);
  }
  return {
    /** Queues an op; a pass to apply the queue is asked for once. */
    push(op, a, b) { q.push([op, a, b]); if (!pass) pass = ask(flush); },
    /** Applies what is queued now, in the order asked, and drops the pass that was waiting for it. */
    now() {
      if (pass) { cancel(pass); pass = 0; }
      if (q.length) flush();
    },
    flush,
    get pending() { return q.length; },
  };
}
