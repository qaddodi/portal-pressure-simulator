// A time budget for a search that can take seconds (15 Nov 2026, app review LZ2-1).
//
// The lobule's label layout tries every order of up to six labels (720 solves) and, when a clash remains, up to 30 other sinusoids with every order of
// each: about 0.6 s, and 2 s more on the retry, inside one frame (a node cost model of the same loop, 0.8 ms a solve). A budget is a short deadline
// the search checks between solves; at the deadline it keeps the best layout it has and stops. The search is then run again from the start in a later
// frame with a longer deadline (the same orders in the same sequence, so a longer run finds all the shorter one did, and more), until the longest has
// been used. A frame never holds more than the level's deadline.
//
//   begin()  a search starts: its level (0 for a new search, the next level when the last run was cut and asked again) and its deadline
//   over()   whether the deadline has passed; remembered, so end() knows the run was cut
//   end()    the search is over: true when it was cut and a longer run is still to come (the caller lays the labels out again)
export const SEARCH_LEVELS_MS = [10, 40, 160];
/** The longest a run asked again may follow the one it continues (ms): a layout for another reason, later, begins at the shortest level. */
const AGAIN_WITHIN_MS = 600;

export function createSearchBudget(levels = SEARCH_LEVELS_MS, now = () => performance.now()) {
  let level = 0, next = 0, deadline = Infinity, cut = false, again = false, endedAt = -1e9;
  return {   // alloc-rare: made once with the lobule's layout
    begin() {
      level = again && now() - endedAt <= AGAIN_WITHIN_MS ? next : 0;
      again = false; cut = false; deadline = now() + levels[level];
      return level;
    },
    over() {
      if (cut) return true;
      if (now() > deadline) cut = true;
      return cut;
    },
    end() {
      endedAt = now();
      if (cut && level < levels.length - 1) { again = true; next = level + 1; return true; }
      return false;
    },
    get level() { return level; },
    get cut() { return cut; },
  };
}
