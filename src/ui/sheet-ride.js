// A bottom sheet that comes in and goes out on the page's frames, so its glass and its words are one piece (16 Nov 2026, iPhone: "when the
// menu opens the search bar is already there floating with no background, and then it slowly goes up").
//
// A sheet carried by a CSS animation (slide-from-edge, slide-to-edge, dock-sheet-in/out) is moved by the compositor from a clock of its own,
// while the GPU glass under it is drawn by the page, in a frame, from the page's time (glass-gl.js). In Safari the two stand a display frame
// or two apart, and a sheet's entrance is quick off the mark (the first frame or two cover most of its height), so the frost lagged the
// sheet by half its height: the search row and the tabs floated over the figure with no card behind them, and the frost caught up a few
// frames later; the exit did the same the other way. script-glide.js (3 Nov 2026) and sheet-pull.js (13 Nov) fixed it for the cards and the
// let-go of a pull: the move is written as the inline `translate` in the frame the glass reads it in, so they cannot part. This is the same
// for a sheet's own entrance and exit.
//
//   rideIn(el, reduce)     the sheet comes up from its own height (and its --edge-y: the dock's 8 px) to rest; Reduce Motion fades it in
//   rideOut(el, reduce)    the sheet goes down from where it is (a half-risen one carries on from there); Reduce Motion fades it out
//   rideStop(el)           a finger takes the sheet: the ride stops and takes its inline values off, and says how far down the sheet was (px)
//   riding(el)             whether a ride is under way (or has just ended with the sheet away)

import { glideTranslate, glideOpacity, glideStop, glideY } from './script-glide.js';
import { readMetric, readStyle } from './layout-snap.js';
import { evalLength, fillVars } from './kf-resolve.js';
import { D_FLIP, D_SMALL, easeArrive, easeIn } from './ease.js';

const rides = new WeakMap();   // sheet -> the token of the ride that owns it now (an older ride's end finds another token and leaves the sheet alone)

/** How far a sheet starts below its place and ends below it, px: its height and its --edge-y (the stylesheet's own number), and `extra` (a menu sheet's 8 px behind the thumb dock). */
function travel(el, extra) {
  const h = readMetric(el, 'offsetHeight') || 0, cs = readStyle(el);
  const y = evalLength(fillVars('var(--edge-y, 100%)', (n) => cs.getPropertyValue(n)), h);
  return (Number.isFinite(y) && y > 0 ? y : h) + extra;
}

/** The sheet comes in. Returns nothing; the inline translate (or opacity) is the sheet's until the ride ends, then it is taken off. */
export function rideIn(el, reduce, ms = D_SMALL, extra = 0) {
  const tok = {};   // alloc-rare: one token for each open
  rides.set(el, tok);
  const end = () => { if (rides.get(el) === tok) { rides.delete(el); el.style.removeProperty('translate'); el.style.removeProperty('opacity'); } };
  if (reduce) { glideOpacity(el, 0, 1, ms, easeArrive).then(end); return; }
  const y = travel(el, extra);
  if (!(y > 0)) { rides.delete(el); return; }
  glideTranslate(el, 0, y, 0, 0, ms, easeArrive, end);
}

/** The sheet goes out. It stays where the ride leaves it (away) until the page takes it off. */
export function rideOut(el, reduce, ms = D_SMALL, extra = 0) {
  rides.set(el, {});   // (a token of its own: the entrance's end, if it comes, finds it is no longer its sheet)
  if (reduce) { glideOpacity(el, 1, 0, ms, easeIn); return; }
  // (A sheet still coming in carries on from where it is: glideTranslate takes over a glide under way.)
  const y = travel(el, extra);
  glideTranslate(el, 0, 0, 0, y, ms, easeIn);
}

/** A finger takes the sheet while it rides: the ride stops, its inline values go, and the sheet's place (px down) is returned. 0 for a sheet not riding. */
export function rideStop(el) {
  if (!rides.has(el)) return 0;
  rides.delete(el);
  const y = glideY(el);
  glideStop(el);
  el.style.removeProperty('translate'); el.style.removeProperty('opacity');
  return y === y ? y : 0;
}

export const riding = (el) => rides.has(el);

// A menu sheet's (and the Why? card's) ride: over the thumb dock it rises from 8 px behind the dock and, with Reduce Motion, only fades, in 120 ms
// (as the stylesheet had it); anywhere else it is the stylesheet's own height and 240 ms. Kept arrays: nothing is made at an open.
const R_PLAIN = [D_SMALL, 0], R_DOCK = [D_SMALL, 8], R_DOCK_REDUCED = [D_FLIP, 8];
/** [ms, extra] for rideIn and rideOut of a menu sheet, as the page is now. */
export const menuRide = (reduce) => (document.documentElement.classList.contains('thumb-ui') ? (reduce ? R_DOCK_REDUCED : R_DOCK) : R_PLAIN);
