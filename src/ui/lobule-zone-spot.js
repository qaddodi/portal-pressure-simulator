// Where a zone's name stands on its band (Lobule, Zones layer). The first of its candidate spots whose box (margins and all) is clear of the slide's lesion ring
// AND of every zone name already placed in this layout; none clear: -1, and the name is left out (it fades out) rather than drawn over another's.
// (16 Nov 2026, iPhone, Lobule slide 7: on a zoomed phone the in-view spots of zone 1 and zone 2 were the same one, so "ZONE 1 PERIPORTAL" and "ZONE 2 MIDZONAL" were
// drawn at one place, their letters on top of each other.)
import { overlapLRTB } from './label-place.js';

const box = { l: 0, r: 0, t: 0, b: 0 };   // (one candidate's box, written again for each; read within a call)

/**
 * @param {ArrayLike<number>} tx candidate spots' x (centres), nearest first
 * @param {ArrayLike<number>} ty candidate spots' y
 * @param {number} n how many candidates
 * @param {number} w the name's width
 * @param {number} hh its height
 * @param {number} hx margin each side
 * @param {number} hy margin above and below
 * @param {(b: {l:number,r:number,t:number,b:number}) => number} ringDepth how far a box reaches into the lesion's ring (0: clear)
 * @param {ArrayLike<{l:number,r:number,t:number,b:number}>} placed the zone names' boxes already placed
 * @param {number} nPlaced how many of `placed` count
 * @returns {number} the candidate's index, or -1
 */
export function zoneSpot(tx, ty, n, w, hh, hx, hy, ringDepth, placed, nPlaced) {
  for (let j = 0; j < n; j++) {
    box.l = tx[j] - w / 2 - hx; box.r = tx[j] + w / 2 + hx; box.t = ty[j] - hh / 2 - hy; box.b = ty[j] + hh / 2 + hy;
    if (ringDepth(box)) continue;
    let clash = false;
    for (let i = 0; i < nPlaced; i++) if (overlapLRTB(box, placed[i]) > 0) { clash = true; break; }
    if (!clash) return j;
  }
  return -1;
}
