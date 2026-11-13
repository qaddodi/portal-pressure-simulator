// The colour of each reading on a chart: ONE table, read by every chart that draws a reading as a line (the flow-time chart and the time-lapse and
// procedure graphs that borrow it, flow-time.js LINE; the parameter curve, tool-curve.js lineMeta). Before this, each chart kept its own table and
// a reading with no entry took a colour by its place in the chart (the first pink, the second blue), so the portal pressure and the PPG were
// both pink on the six-month chart (Mohammad, 13 Nov 2026: "those are same color almost not good") and the ascites and the liver flow both blue.
//
// Rules the table keeps (tests/chart-series-colours.test.js reads every chart of every deck and fails on a breach):
//  1. Two lines on one chart never share a colour, and in every look (Light, Soft, Dark, Navy, Black) their colours are at least
//     SERIES_MIN_DE apart in OKLab (the palette floor the colour audit set, x100).
//  2. A reading that has a trace colour of its own on the beat trace and the monitor wears it here too (portal vein magenta, WHVP orchid,
//     FHVP blue, IVC cyan: unification audit, finding 2); the PPG's own is the gold --tr-ppg (it is the portal vein minus the IVC, a
//     difference, so it is neither of them).
//     The HVPG stays violet (Light's --s7 as it was; on the dark looks a deeper violet, --tr-hvpg: --s7's own was ΔE 9 from the FHVP's blue, the
//     colour of the portal flow and the ascites it shares charts with).
//  3. A new reading takes the colour no partner on its charts wears; when none is free, add a token here and to theme-tokens.js, never
//     a place in the chart.
// Values are theme token names (custom properties, with the leading --).
export const SERIES_MIN_DE = 15;

export const READING_COLOUR = {
  // pressures
  pv: '--tr-pv', ppg: '--tr-ppg', hvpg: '--tr-hvpg', whvp: '--tr-wedge', fhvp: '--tr-hv', sin: '--tr-sin', ivc: '--tr-ivc', ra: '--tr-ra', map: '--tr-cav', rpp: '--tr-cav',
  // flows and the blood
  pvFlow: '--tr-hv', pvVel: '--tr-var', liver: '--tr-pv', co: '--tr-hv', shunt: '--tr-cav',
  // the body
  asc: '--tr-hv', wt: '--tr-hv', spleen: '--tr-hv', salb: '--tr-cav', plt: '--tr-ivc', lsm: '--tr-scler', ssm: '--tr-scler',
  // the varix and what presses on it
  varix: '--tr-var', gv: '--tr-var', he: '--tr-var', seen: '--tr-var', wall: '--tr-cav', across: '--tr-cav',
};
