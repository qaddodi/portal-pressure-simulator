// The pressure monitor taking a picture's place for one measurement, and giving it back (Mohammad, 15 Nov 2026: "the monitor should REPLACE the
// scope, then once the reading is done it fades away and the scope render comes back"). Two measurements play the monitor on a card of their own
// (Tests › Scope's EUS-PPG, eus-ppg.js; Tests › HVPG's PPG by IR, ir-ppg.js). Before this, each kept the monitor up for good once it had run: the
// EUS-PPG's panel stayed over the scope until the next run, the PPG by IR's stood in the HVPG tracing's place until the HVPG was measured again.
// One rule for both, here:
//   run   the measurement is playing: the monitor stands in the picture's place.
//   hold  the reading is done: the monitor stays up with the result for HOLD_MS (a tap takes it away sooner), so the number can be read.
//   idle  the monitor has faded away and the picture is back.
// createTakeover is the clock of that (pure: the timer is injected, tests/monitor-takeover.test.js). createSwap does the hand-over on the page:
// the one that leaves fades out, then the one that comes fades in, so nothing pops in or out (Reduce Motion keeps the fade: a cross-fade is allowed,
// an instant swap is not).

import { D_SMALL, EASE_IN, EASE_ARRIVE } from './ease.js';

/** How long a finished reading stays up, ms. */
export const HOLD_MS = 6000;   // motion-scale: not a move (a wait: the time to read the result)

/**
 * The phases of one takeover: 'idle' → 'run' → 'hold' → 'idle'. `onChange(phase)` is called on every change of phase.
 * @param {{ hold?: number, onChange?: (phase: string) => void, timer?: { set: Function, clear: Function } }} [o]
 */
export function createTakeover({ hold = HOLD_MS, onChange = () => {}, timer = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id) } } = {}) {
  let phase = 'idle', id = 0;
  const go = (next) => { if (next === phase) return; phase = next; onChange(phase); };
  const stop = () => { if (id) { timer.clear(id); id = 0; } };
  return {
    phase: () => phase,
    /** The monitor is standing in the picture's place (a run, or its result held). */
    shown: () => phase !== 'idle',
    /** A measurement starts: the monitor takes the place (a result still held goes at once, the new run being under way). */
    start() { stop(); go('run'); },
    /** The measurement ended: `done` (it reached its result) holds the result, anything else (stopped, cancelled) gives the place back. */
    finish(done) { stop(); if (phase === 'idle') return; if (!done) { go('idle'); return; } go('hold'); id = timer.set(() => { id = 0; go('idle'); }, hold); },
    /** Give the place back now (a tap on the held result, a new patient, the card going away); a run in play is left to finish its own way. */
    close() { stop(); if (phase === 'hold') go('idle'); },
    /** Give the place back whatever the phase (the card goes away, a new patient is loaded). */
    reset() { stop(); go('idle'); },
    dispose() { stop(); },
  };
}

const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }], FADE_IN = [{ opacity: 0 }, { opacity: 1 }];

/**
 * The hand-over between a picture's elements (`base`, shown at rest) and the monitor's (`over`, `hidden` until its turn): `set(true)` fades the base out, hides it,
 * shows the monitor's and fades them in; `set(false)` the other way. Asked again mid-way, it finishes the fade it is in, then goes where the last ask says, so a quick
 * run-and-stop never leaves both up or neither. Where nothing is on screen to fade (the card is closed, the element has no box) it swaps at once: nothing is seen to pop.
 * `drawn(el)` says whether an element is on screen to fade (the caller passes util.js hasBox; none given, every hand-over is at once).
 * @param {{ base: HTMLElement[], over: HTMLElement[], ms?: number, drawn?: (el: HTMLElement) => boolean }} o
 */
export function createSwap({ base, over, ms = D_SMALL, drawn = () => false }) {
  let want = false, on = false, busy = false;
  for (const el of over) el.hidden = true;
  const flip = () => {
    const [from, to] = on ? [over, base] : [base, over];
    for (const el of from) el.hidden = true;
    for (const el of to) el.hidden = false;
    on = !on;
  };
  function settle() {
    if (busy || want === on) return;
    const from = on ? over : base, to = on ? base : over;
    if (!from.every((el) => el.animate) || !from.some(drawn)) { flip(); settle(); return; }
    busy = true;
    // alloc-rare: a hand-over starts only when the measurement starts or its result is let go: the fade-outs and their close
    const outs = from.map((el) => el.animate(FADE_OUT, { duration: ms, easing: EASE_IN, fill: 'forwards' }));
    let n = outs.length, closed = false;
    const land = () => {
      if (closed) return; closed = true;
      flip();
      for (const a of outs) a.cancel();
      for (const el of to) el.animate?.(FADE_IN, { duration: ms, easing: EASE_ARRIVE });
      busy = false;
      settle();
    };
    for (const a of outs) { a.onfinish = () => { if (--n <= 0) land(); }; a.oncancel = land; }
  }
  return {
    /** Which is meant to be up (true: the monitor's). */
    set(next) { want = !!next; settle(); },
    /** What is up now (true: the monitor's), whatever the last ask. */
    shown: () => on,
  };
}
