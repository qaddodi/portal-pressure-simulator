// A reveal (a shunt drawing on or retracting, stage-transitions.js) that is turned round part way: the same record read the other way, its
// clock set so that the share drawn this frame is the share it had a frame ago. (16 Nov 2026, Mohammad: "the TIPS comes in and out of
// existence, pops": a shunt turned off while it drew on left at once, and one turned on while it retracted finished its retraction and then
// drew on again from nothing.)
import { clamp } from './num.js';

/** The share drawn (0 to 1) of reveal `r` at `now`; `ease` is the app's in-out curve. */
export const revealShare = (r, now, ease) => { const e = ease(clamp((now - r.t0) / r.dur, 0, 1)); return r.out ? 1 - e : e; };
/** The clock start that makes a reveal of length `dur`, going out (or in), show `share` at `now`. */
export function turnedStart(share, out, now, dur, ease) {
  const y = out ? 1 - share : share;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (ease(m) < y) lo = m; else hi = m; }
  return now - ((lo + hi) / 2) * dur;
}
