// Nearby views kept warm (recs R08, 2 Nov 2026): going Anatomy → Lobule → Anatomy, or past a slide whose organ pictures are painted
// again, gave back the GPU's targets at once and made them again on the way back, a burst of allocation each time. Now:
//   - the vessel layer's targets stay through a short visit under the lobule (WARM_MS), and are given back only once it lasts longer,
//     or at once when the page itself is hidden (real memory pressure);
//   - the GPU painter's tile, resolve and shadow targets stay WARM_MS after the last paint (was 3 s), so the paints of a slide change
//     and the next one reuse them;
//   - scratch targets are made in size buckets (bucket()), so a picture a few pixels larger reuses the one there instead of making
//     another. Clearing content never deletes capacity; a lost context still drops every handle (a restored one makes them afresh).
export const WARM_VIEWS = true;   // (switch deleted; kept for stage.js until its own pass)
/** How long a view out of sight keeps its GPU targets (ms). */
export const WARM_MS = 12000;
/** A size rounded up to its bucket (256 px steps). */
export const bucket = (n) => Math.ceil(n / 256) * 256;
