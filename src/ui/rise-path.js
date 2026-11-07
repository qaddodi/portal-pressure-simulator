// The way out of a zoomed-in lobule: where the lobule's centre sits as it shrinks, one straight pull-out.
// The lobule leaves from its place on screen (a) and ends at the liver's point in the next view (b), scale going from 1 down to
// q1 (exp(-lt): the whole zoom). Scaled about one fixed point, the camera backs straight out: every point moves toward or away from
// that point as the scale changes and nothing slides sideways first (Mohammad, 20 Oct, Circulation 9 to 10: a drift timed on the
// log zoom panned across the lobule toward the bottom right before it pulled out).

/** The fixed point the whole zoom is scaled about: a at scale 1 lands on b at scale q1. */
export function riseAnchor(a, b, q1) {
  const d = 1 - q1;
  if (!(d > 1e-6)) return b;
  return [(b[0] - a[0] * q1) / d, (b[1] - a[1] * q1) / d];
}
const CENTRE = [0, 0];
/** The lobule's centre at scale q (q1 ≤ q ≤ 1): a at 1, b at q1, on a straight line, moving in step with the scale. (The pair returned is
 *  kept and written in place at each call: read it before the next.) */
export function riseCentre(a, b, q1, q) {
  const d = 1 - q1;
  let px, py;
  if (!(d > 1e-6)) { px = b[0]; py = b[1]; } else { px = (b[0] - a[0] * q1) / d; py = (b[1] - a[1] * q1) / d; }
  CENTRE[0] = px + (a[0] - px) * q; CENTRE[1] = py + (a[1] - py) * q;
  return CENTRE;
}
