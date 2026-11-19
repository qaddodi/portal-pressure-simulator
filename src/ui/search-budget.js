// A budget for the lobule's label search, counted in solves, never in milliseconds (15 Nov 2026, app review LZ2-1; 19 Nov 2026, STG-1).
//
// The lobule's label layout tries every order of up to six labels (720 solves) and, when a clash remains, up to 8 other sinusoids with every order of
// each. It used to keep to a wall-clock deadline (8, 16, then 32 ms) and run again from the start with a longer one: the result then depended on how
// fast the device was (a phone found fewer orders than a Mac and could name another sinusoid), and each cut laid its best so far, so one change faded the
// labels to new spots up to three times.
//
// Now the search is a generator (lobule-zoom-records.js): it yields between solves when its frame's slice is spent and is picked up again in the next
// frame where it stopped, and the labels stand where they are until it has finished, so they are laid once. What bounds the work is the number of solves,
// the same on every device, so the same lobule state gives the same layout everywhere.
//
//   begin()  a search starts
//   spend()  one solve was made
//   over()   whether the solves allowed have been made
export const SEARCH_SOLVES = 360;

export function createSearchBudget(max = SEARCH_SOLVES) {
  let spent = 0;
  return {   // alloc-rare: made once with the lobule's layout
    begin() { spent = 0; },
    spend() { spent++; },
    over() { return spent >= max; },
    get spent() { return spent; },
    get max() { return max; },
  };
}
