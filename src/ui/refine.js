// One small CPU allowance, shared by all the optional refinement work of a display frame: the organ pictures made sharper after a
// zoom (painted on the GPU a few ops at a time, or rasterized a strip at a time) and the gut's pictures. Each of them used to take
// what it liked (6 ms of painting a step, a strip's drawing and read-back after it), every one on its own, and together, a frame.
//
//   left(at, held)   the milliseconds frame `at` gives to refinement: 0 while the figure is in hand (`held`), and 0 to every job but the
//                    first to ask in a frame (the others wait for the next one, so the jobs take turns, a step each). `at` is the
//                    scheduler's frame time (frame.js hands every callback of a frame the same one). Taken when asked, not when
//                    spent: the jobs of one frame all resume before any of them has run a step, so what was left could not be told.
//   turn(wait, held, gone)  waits for a frame in which refinement may run (wait() resolves with the next frame's time) and resolves with
//                    the ms that frame still has for it, or null once gone() says the work is not wanted any more; gone() is asked
//                    after every frame waited, so work overtaken while it waits out a gesture is given up at once.
//   spent(ms, name)  notes what a step really took, which can be more than it was given: a step paints at least one op, and one op
//                    (a big shape's mesh) can take more than the whole allowance. The longest step is kept, by name.
//
// Work waits for a frame in which a gesture is not under way (a gesture's frames are for the figure), then goes on a little each frame:
// once the figure is let go the jobs that were waiting trickle through the allowance, not all at once.
// The allowance is REFINE_MS a frame (?refinems=3 in the address tries another).

import { gpuProbe, COUNTED } from './gpu-probe.js?v=9832eccfbe';

export const REFINE_MS = 1;

/** The allowance in ms: ?refinems=, between a quarter of a millisecond and 16, or REFINE_MS. */
export function refineMsFrom(search, fallback = REFINE_MS) {
  const v = parseFloat(/[?&]refinems=([0-9.]+)/.exec(search || '')?.[1]);
  return Number.isFinite(v) ? Math.min(16, Math.max(0.25, v)) : fallback;
}

export function createRefine({ ms = REFINE_MS, probe = gpuProbe } = {}) {
  let stamp = NaN, given = false;
  const longest = { ms: 0, name: '' };
  const stats = { held: 0, steps: 0 };
  return {
    ms,
    stats,
    longest,
    left(at, held = false) {
      if (at !== stamp) { stamp = at; given = false; }
      if (held) { stats.held++; probe.note(COUNTED.refineHeld); return 0; }
      if (given) return 0;
      given = true;
      return ms;
    },
    async turn(wait, held = () => false, gone = () => false) {
      for (;;) {
        const at = await wait();
        if (gone()) return null;
        const left = this.left(at, held());
        if (left > 0) return left;
      }
    },
    spent(took, name = '') {
      stats.steps++;
      probe.note(COUNTED.refineStep);
      // (The longest one a step took: the work that did not fit its allowance, and which piece of the picture it was.)
      if (took > longest.ms) { longest.ms = took; longest.name = name; }
      if (took > ms && probe.on) probe.gauge('refinement: longest step', `${name || '?'} ${took.toFixed(1)} ms (allowance ${ms} ms)`);
    },
  };
}

export const refine = createRefine({ ms: typeof location !== 'undefined' ? refineMsFrom(location.search) : REFINE_MS });
