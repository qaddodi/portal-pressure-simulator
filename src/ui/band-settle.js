// A reading's band (its colour and its word) changes once its number has landed (full app review A1 and PT-6, 15 Nov 2026; mock "Band-crossing
// settle"). A reading that crosses a cut-off rolls, or glides, in its old colour; the colour and the word change when the number stops, the
// word by its cross-fade (util.js swapText), so the number and its band never disagree mid-roll. With Reduce Motion the number lands at once
// and the colour and word change with it, no fade.
//
// (It replaces the tile's 1.5 s hold on a new band, which kept a reading flicking across a cut-off with every breath from flickering its
// colour too: the readings now hold still at rest, engine shownMean and its dead band, so a band changes only when the reading does.)

/** How often (ms) a band waiting for its number to land looks again: a roll is COUNT_MS (0.4 s), a glide about as long. */
export const BAND_RECHECK_MS = 100;

/**
 * What a tile does with the band its shown number now reads.
 * @param {string|undefined} was  the band painted now (undefined before the first)
 * @param {string} next           the band the number on show reads
 * @param {boolean} moving        the number still rolls or glides toward its target
 * @param {boolean} reduce        Reduce Motion is on
 * @returns {'same'|'now'|'fade'|'wait'} 'now': paint it at once, no fade (the first band, an unmeasured reading, Reduce Motion);
 *   'fade': paint the colour and cross-fade the word; 'wait': not yet, the number is still on its way.
 */
export function bandStep(was, next, moving, reduce) {
  if (next === was) return 'same';
  if (!was || next === 'none' || was === 'none' || reduce) return 'now';
  return moving ? 'wait' : 'fade';
}
