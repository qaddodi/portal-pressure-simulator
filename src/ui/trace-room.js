// Where the catheter monitor puts its trace: under the big reading, above the time axis. TRACE_MIN is the least height
// the grid and trace need; below it the monitor would show only its header and number (a blank screen), so the card's
// monitor box never goes shorter than MON_MIN (styles/app.css --mon-min, tests/trace-room.test.js keeps them in step).
import { clamp } from './num.js';
export const TRACE_MIN = 30;
export const MON_MIN = 132;
// W, H: the drawn area (the canvas less its padding); y: the padding above it.
const ROOM = { big: 0, fs: 12, k: 1, top: 0, bot: 0 };   // alloc-rare: made once; every caller takes its numbers out at once
// k: how much the header's lines are spread for words past 15 px.
export function traceRoom(W, H, y = 10) {
  const big = Math.round(clamp(Math.min(W * 0.1, H * 0.17), 22, 48));
  ROOM.fs = clamp(Math.round(W / 40), 13, 17);   // (the monitor's words: 13 px on a small card, up to 17 on a wide one, to read well on a Mac or a phone held sideways; Mohammad, 13 Nov 2026: "the fonts are way too small for the size of the monitor")
  const k = Math.max(1, ROOM.fs / 15);
  ROOM.k = k; ROOM.big = big; ROOM.top = y + 30 * k + Math.max(big, 22) - 4; ROOM.bot = y + H - Math.max(16, ROOM.fs + 1);
  return ROOM;
}
