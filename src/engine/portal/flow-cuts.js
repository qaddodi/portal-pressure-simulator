// The cut-offs that name slow, absent and backward flow in a vein. One set, read by the Doppler's reading (doppler.js), the figure's
// velocity labels (stage.js), the Details sentences (about.js), the lobule's cards (actions.js), the screen-reader summary (a11y.js),
// the summary tables (table-marks.js) and the engine's stasis event (events.js), through judgeFlow (ui/velNormal.js). No imports, so the
// worker loads it too.
export const FLOW_CUTS = Object.freeze({
  none: 1,          // cm/s: under it a vein carries no detectable flow
  stentNone: 2,     // cm/s: under it a stent is occluded
  stasis: 9,        // cm/s: from "none" up to here, flow is stasis
  stasisOff: 12,    // cm/s: the stasis event clears only above it, so a value hovering at 9 does not flicker it
  reversedQ: 0.12,  // mL/s: a backward flow smaller than this (or than reversedRel of the vessel's healthy flow, if that is more) is not reversal
  reversedRel: 0.02,
  stillQ: 0.05,     // mL/s: a vessel that normally carries more than stillRef has "almost stopped" under it
  stillRef: 0.3,
});
