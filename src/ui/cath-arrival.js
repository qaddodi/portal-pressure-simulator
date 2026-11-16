// How a catheter slide (slide field `cath`) is arrived at. Going forward with Next the catheter travels in along the route, the camera following it
// and then closing on the tip (the slide's own animation). Arrived at any other way (Back, a jump, a link) it stands where Next would leave it, and the
// camera makes ONE glide to the tip: it used to play the whole route again, out to the route's framing and back in to the tip, two legs (Mohammad, 16 Nov
// 2026, Carvedilol slide 6 back to 5: "every slide-to-slide camera move is straight"; the return took about 13 s).

/** Where a catheter step ends (what its animation leaves up): balloon and column 0..1, the callouts shown, the ring's colour name (CC in presenter-proc.js). */
export const CATH_END = Object.freeze({
  route: { balloon: 0, column: 0, show: [], ring: null },
  free: { balloon: 0, column: 0, show: ['f'], ring: 'free' },
  wedge: { balloon: 1, column: 1, show: ['f', 'w'], ring: 'wedge' },
  result: { balloon: 1, column: 1, show: ['sum'], ring: null },
  blocked: { balloon: 0, column: 0, show: ['abort'], ring: 'bad' },
});

/** The camera's legs for a catheter step, in order: 'route' (following the catheter in), 'tip' (close on it). u: how far in the catheter is (0..1). */
export function cathLegs(mode, u, instant) {
  if (mode === 'route') return ['route'];
  return instant ? ['tip'] : [...(u < 0.999 ? ['route'] : []), 'tip'];
}

/** Whether a slide is arrived at by Next (the catheter's journey plays) rather than any other way. to: the slide, lastAt: the one shown before it (-1: none). */
export const cathInstant = (to, lastAt) => to !== lastAt + 1;
