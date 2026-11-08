// A data card tile's number, bar mark and start ring follow the model on the page's one shown state (shown.js, display-state.js
// createShownState: the filter the dock's bars and the Readouts tab use, the vessels' time constant), so the number, the bar and the
// figure arrive together (motion recs item 15, 8 Nov 2026).
//
// Before this a change of values wrote the tile's final number at once while the bar's mark travelled on a CSS transition over 280 to
// 950 ms (and a kept card re-aimed that transition at every 150 ms poll, restarting its curve each time): the number showed its end
// before the bar got there. Now the card hands each tile's value and start to a follower per name, and every display frame while one is
// on its way the card paints the number (the GPU words, gl-words.js) and the mark (a translate) from what the follower shows.
// A follower is critically damped, so a new target bends its speed instead of restarting it, whatever the rate it is polled at.
import { FILL_SMALL } from './display-state.js';

let uid = 0;

/** One step of a tile counted as nothing: half of the last digit it prints, or half a pixel of its bar (FILL_SMALL of the scale), the
 *  smaller; in the model's units. T: the tile (x: its factor to the shown unit, d: decimals), S: its scale [from, to, cuts] or undefined. */
export function tileSmall(T, S) {
  const x = T?.x ?? 1, d = T?.d ?? 1, bar = S ? FILL_SMALL * Math.abs(S[1] - S[0]) : Infinity;
  return Math.min(0.5 * 10 ** -d, bar) / x;
}

/** The followers of one strip of tiles on `state` (a createShownState). Keys are made once per tile and kept. */
export function createTileShown(state) {
  const id = ++uid, names = new Map(), opts = { snap: false, small: 0, eps: 0, across: true };
  const nameOf = (k, ref) => {
    const m = ref ? 'r' : 'v', key = `${m}:${k}`;
    let n = names.get(key);
    if (!n) names.set(key, n = `tile${id}:${key}`);   // alloc-rare: once per tile and kind, when its tiles are built
    return n;
  };
  return {
    /** The value to show for tile k (its start, with ref) now, aimed at T. glide false: shown at once. A value that is no number is
     *  not followed (it is returned as it is, and its follower dropped). small: tileSmall(). across: a jump of the model is glided too
     *  (a slide's change always was), so a card never snaps its number where the bar used to travel. */
    set(k, T, small, glide, ref = false) {
      const key = nameOf(k, ref);
      if (!Number.isFinite(T)) { state.delete(key); return T; }
      opts.snap = !glide; opts.small = small; opts.eps = small * 0.1;
      return state.set(key, T, opts);
    },
    /** The value shown for tile k now, or fallback where it has none. */
    get(k, fallback, ref = false) { return state.or(nameOf(k, ref), fallback); },
    /** Lets go of tile k's followers (its tile was replaced). */
    drop(k) { state.delete(nameOf(k, false)); state.delete(nameOf(k, true)); },
    /** Calls cb after each display frame's step while anything on the state moves; returns the function that stops it. */
    onFrame(cb) { return state.on(cb); },
  };
}
