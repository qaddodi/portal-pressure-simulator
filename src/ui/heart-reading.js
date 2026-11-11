// The heart's rate and output as words on the heart (11 Nov 2026, Mohammad: the heart stays still, and its heart rate and cardiac output
// show only as labels on it, on any deck slide that shows the heart). No DOM: the sums that say which slides those are, so a unit test
// can load them. The words themselves are an organ mark of ext-callouts.js ('Heart {hr} · {co}'), drawn by the label layer.
import { regionBox, isCamOn, CIRC_REGIONS } from './cam-frame.js';
import { ORGAN_ANCHOR } from './callout-math.js';

export const HEART_WORDS = 'Heart {hr} · {co}';
const inside = (b, p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const circHeart = [(CIRC_REGIONS.heart[0] + CIRC_REGIONS.heart[2]) / 2, (CIRC_REGIONS.heart[1] + CIRC_REGIONS.heart[3]) / 2];

/** Whether a slide's camera has the heart in frame: the whole-figure fit does (both views), a region or a raw box does when it holds the
 *  heart's middle, and a by-name camera when its `near` region does (with none it frames the route from the portal vein to the heart,
 *  which the presenter grows to take in what it names). The lobule and the sinusoid are close-ups of the liver: no heart there. */
export function showsHeart(s, regions) {
  if (!s || s.visual || s.cols) return false;
  const circ = s.view === 'circuit', cam = s.cam;
  if (cam == null || cam === 'fit') return true;
  if (cam === 'lobule' || cam === 'sinusoid') return false;
  if (circ) { const b = regionBox(cam, CIRC_REGIONS); return !b || inside(b, circHeart); }   // (a name the circuit lacks is the fit)
  const b = regionBox(isCamOn(cam) ? cam.near : cam, regions) || regions.route;
  return !!b && inside(b, ORGAN_ANCHOR.heart.at);
}
