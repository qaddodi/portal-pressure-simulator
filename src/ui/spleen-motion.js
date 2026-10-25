// Whether the spleen is growing (or shrinking) on screen: a time-lapse playing its size over days. The organs reach the GPU as
// one picture (the plate), drawn again only once its key moves a step and some time has passed, so a spleen growing under it
// stood still, jumped bigger, waited and jumped again, while its outline (drawn each frame from its size) grew smoothly
// (all-new-visuals slide 8, 19 Oct). While it grows, the live drawing shows, at its size each frame, as the liver's ease does;
// the plate is drawn again once it settles.
// A slow drift (the running model's spleen creeping a notch) is not growth: it stays under the plate, as before.

export const SPLEEN_RATE = 0.01;    // scale per second (1 % of its size): faster is growth
export const SPLEEN_WINDOW = 250;   // ms over which the rate is measured
export const SPLEEN_STILL = 300;    // ms without a change before it counts as settled

/** A tracker fed the spleen's scale each time it is drawn: { see(sc, now) → true when it just started growing, moving(now) }. */
export function spleenMotion() {
  let last = null, changedAt = -Infinity, refSc = null, refAt = 0, fast = false, live = false, stillAt = -Infinity;
  const settle = (now) => {
    if (live && (!fast || now - changedAt >= SPLEEN_STILL)) { live = false; fast = false; stillAt = now; }
  };
  return {
    see(sc, now) {
      if (last !== null && sc !== last) changedAt = now;
      last = sc;
      if (refSc === null) { refSc = sc; refAt = now; }
      if (now - refAt >= SPLEEN_WINDOW) { fast = Math.abs(sc - refSc) / ((now - refAt) / 1000) > SPLEEN_RATE; refSc = sc; refAt = now; }
      const was = live;
      if (fast && now - changedAt < SPLEEN_STILL) live = true;
      else settle(now);
      return live && !was;
    },
    /** Growing now: the live drawing shows and the plate waits (it also settles here when no new size has come for a while). */
    moving(now) { if (live && now - changedAt >= SPLEEN_STILL) settle(now); return live; },
    /** When it last settled (the plate gives a moment after it, as after the liver's ease). */
    stillAt: () => stillAt,
  };
}
