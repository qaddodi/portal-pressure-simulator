// The one lane a deck's slide states are computed on, and who may use it (17 Nov 2026, Mohammad: "whenever I open a new deck it loads forever,
// 1-2 min, an empty card with only its title").
//
// The cause. A deck's states are one 'sequence' on a second engine in a worker (calc-client.js): a fresh patient and a twelve-second run-in for every
// slide that changes the model, two to forty seconds for a whole deck. That worker does one job at a time, in the order they came. The Present menu
// warms a deck as soon as the pointer or focus is on its row (menu.js: pointerenter, focus, pointerdown), so a pointer moved down the list queued a
// whole deck's sequence for every row it crossed, all on the one worker. A deck opened then found its states queued behind every row crossed on the
// way: its first slide's patient came minutes later, the cover gave up at 12 s, and the slide showed as an empty card with only its tab. A deck
// opened a second time (its states cached) opened at once, so only "new" decks were slow.
//
// The rule. One deck's states are computed here at a time, and that deck is the one the person is on or opening:
//   - warm(key, go): a row is warmed only once the pointer has rested on it (INTENT_MS), and warming another row cancels the one before (its worker is
//     stopped, its unfinished entry dropped, so nothing is queued behind it: a row crossed in passing costs nothing);
//   - claim(key): a deck being opened keeps the lane: nothing else is warmed while it is claimed, and the warm of another deck that was running is
//     cancelled at once (the opened deck's own warm, if it is the one running, is joined and kept);
//   - the lane is its own worker, never the one a slide's instruments ask their curves of, so a deck's sequence no longer holds a card's request either.
//
// cache: deck id → { states, done }; the presenter's map. makeCalc: calc-client.js makeCalc.

/** How long (ms) the pointer or focus rests on a row before its deck is warmed. */
export const INTENT_MS = 220;

export function createSolveLane({ makeCalc, cache, later = setTimeout, clear = clearTimeout }) {
  let calc = null, running = null, claimed = null, timer = 0, wanted = null;

  const stop = () => { if (calc) { try { calc.kill(); } catch { /* already gone */ } calc = null; } };
  /** The deck on the lane that is not claimed is given up: its worker stopped (the next work makes a fresh one), its unfinished entry dropped. */
  function cancelRunning() {
    if (running == null || running === claimed) return;
    const e = cache.get(running);
    if (e && !e.done) { if (e.states) e.states.cancelled = true; cache.delete(running); }
    running = null;
    stop();
  }
  const clearIntent = () => { clear(timer); timer = 0; wanted = null; };
  return {
    /** The lane's engine (made on first use). */
    calc: () => (calc ||= makeCalc()),
    /** A deck's states begin on the lane: another deck's unfinished warm is cancelled first. Returns the engine. */
    begin(key) {
      if (running != null && running !== key) cancelRunning();
      running = key ?? null;
      return (calc ||= makeCalc());
    },
    /** The deck's sequence ended (or failed): the lane is free. */
    end(key) { if (running === key) running = null; },
    /** The engine failed: it is dropped so the next work starts a fresh one. */
    broken(c) { if (calc === c) stop(); },
    /** A deck is being opened: it keeps the lane (null: given back). Another deck's unfinished warm is cancelled now. */
    claim(key) {
      claimed = key ?? null;
      if (claimed != null) { clearIntent(); if (running != null && running !== claimed) cancelRunning(); }
    },
    /** The pointer or focus is on a row: go() warms that deck once it has rested there, never while a deck is claimed. A newer row replaces it. */
    warm(key, go) {
      if (claimed != null) return;
      if (wanted === key && timer) return;
      clearIntent();
      wanted = key;
      timer = later(() => { timer = 0; wanted = null; if (claimed == null) go(); }, INTENT_MS);
    },
    /** For the tests: what the lane is doing. */
    state: () => ({ running, claimed, wanted, calc: !!calc, waiting: !!timer }),
  };
}
