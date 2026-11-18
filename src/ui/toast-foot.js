// Where a preset's note (the toast at the foot of the figure) stands: its bottom edge, px up from the app's foot (--toast-foot).
// 18 Nov 2026, the tester at 390 px, TIPS placed from Treat's Procedures: "TIPS placed: right portal vein → right hepatic vein." stood in the middle of the Treat sheet, over the Band and Balloon buttons and half of TIPS's own. The
// foot counted the Tests sheet (`sheet`) and a vessel's docked card (`acUp`), never the Treat or History sheet, which rests on the same dock. Every bottom sheet is counted now: the note stands on the tallest of them, and no higher than
// leaves it room under the top bars (a sheet that fills the screen leaves it at the top of what is left, not off the screen).
export const NOTE_H = 64, NOTE_GAP = 8;   // (a note's height at its tallest, two short lines, and its gap to what it stands on)

/**
 * thumb, tabOcc: the phone's thumb dock and its occupancy from the app's foot; sheet: the Tests sheet's height + gap (0 none); bot: the foot without a thumb dock; sheetsH: the heights of the other bottom sheets that are open
 * (a vessel's docked card, Treat, History), 0 for one that is not; ah, tbH: the app's height and the top bar's.
 */
export function toastFoot({ thumb, tabOcc, sheet, bot, sheetsH = [], ah = 0, tbH = 0 }) {
  const up = sheetsH.reduce((m, h) => (h > 0 ? Math.max(m, h + NOTE_GAP) : m), 0);
  const foot = (thumb && tabOcc ? (sheet ? tabOcc + sheet : tabOcc + 50) : bot) + 8 + up;
  const max = ah > 0 ? ah - tbH - NOTE_H - NOTE_GAP : Infinity;   // (clear of the top bars)
  return Math.max(0, Math.min(foot, max));
}
