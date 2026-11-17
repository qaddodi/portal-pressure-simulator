// Two cards stacked over the foot of a phone or an iPad held upright: the vessel's card (a slim strip while Tests is open) above the Tests sheet (F46, play-test
// 17 Nov 2026, iPad 768 x 1024: the stent card 222-455 and Tests 465-940 together covered the whole figure, so the camera had no gap to pan the stent into).
// The figure keeps a band of at least BAND px between the top bar and the strip: Tests' Half height gives way for it, never the strip.
export const STRIP = 56;   // (the vessel card as a strip: its name and state, styles/app-03-layouts.css .ac-strip rules)
export const BAND = 200;   // (the least the figure keeps, px)
export const GAP = 6;      // (between the strip and the sheet)
export const MIN_HALF = 240;   // (a Tests sheet is never squeezed below this: its tabs and a chart's worth)
/** The tallest Half height the Tests sheet may have: `room` is what a sheet may fill (top bar to tab row), `wanted` the height it would have with no vessel card. */
export function testsHalfPx(room, wanted, vesselCard) {
  if (!vesselCard || !(room > 0)) return wanted;
  return Math.min(wanted, Math.max(MIN_HALF, room - BAND - STRIP - GAP));
}
/** The figure's free band above the strip, with both cards open: for the page and the tests alike. */
export function figureBand(room, testsPx) { return room - testsPx - GAP - STRIP; }
