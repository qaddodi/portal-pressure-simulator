// The cut-offs that name slow, absent and backward flow in a vein. One set, read by the Doppler's reading (doppler.js), the figure's
// velocity labels (stage.js), the Details sentences (inspector.js), the lobule's cards (actions.js), the screen-reader summary (a11y.js),
// the summary tables (table-marks.js) and the engine's stasis event (events.js), through judgeFlow (ui/velNormal.js). No imports, so the
// worker loads it too.
export const FLOW_CUTS = Object.freeze({
  none: 1,          // cm/s: under it a vein carries no detectable flow
  stentNone: 2,     // cm/s: under it a stent is occluded
  stasis: 9,        // cm/s: from "none" up to here, flow is stasis
  stasisOff: 12,    // cm/s: the stasis event clears only above it, so a value hovering at 9 does not flicker it
  reversedQ: 0.12,  // mL/s: a backward flow smaller than this (or than reversedRel of the vessel's healthy flow, if that is more) is not reversal
  reversedRel: 0.02,
  reversedThrough: 0.03,   // a stretch of a cut vein (topology.js JUNCTIONS) is not reversed while its backward flow is under this share of the flow through the vein (the vein's busiest stretch): near-stagnant beside a TIPS that carries 25 mL/s
  stillQ: 0.05,     // mL/s: a vessel that normally carries more than stillRef has "almost stopped" under it
  stillOffQ: 0.08,  // mL/s: a stent that has stopped counts as flowing again only above it, so a flow hovering at 0.05 does not flip Stasis and Patent
  stillRef: 0.3,
  shuntLarge: 0.3,   // share of the splanchnic blood past the liver: a large shunt from here (the Shunted tile's red, its event), a moderate one from shuntModerate
  shuntModerate: 0.1,
  liverSevere: 55,   // % of healthy sinusoidal flow: severely low up to here (the Liver flow tile's red, its event), low up to liverLow
  liverLow: 75,
});

/** Whether a stent (or any vessel) has almost stopped: its flow q (mL/s) is under stillQ. One rule for the vessel card's "Stasis", the stent's tiles, the side view's three
 *  gate numbers, the Doppler's gates and the Compare row: a tiny flow through a narrow waist makes a jet velocity of a few tens of cm/s on paper, but a stopped stent reads 0
 *  cm/s everywhere, never a number on one screen and "Stasis" on the next. */
export const stentStill = (q) => Math.abs(q) < FLOW_CUTS.stillQ;
/** The same with its memory (`was`: stopped at the last reading): the one a stent's live state uses (engine.js stentState), which every view reads. */
export const stentStillHeld = (q, was) => Math.abs(q) < (was ? FLOW_CUTS.stillOffQ : FLOW_CUTS.stillQ);
