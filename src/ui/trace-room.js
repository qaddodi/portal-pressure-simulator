// Where the catheter monitor puts its trace: under the big reading, above the time axis. TRACE_MIN is the least height
// the grid and trace need; below it the monitor would show only its header and number (a blank screen), so the card's
// monitor box never goes shorter than MON_MIN (styles/app.css --mon-min, tests/trace-room.test.js keeps them in step).
export const TRACE_MIN = 30;
export const MON_MIN = 132;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// W, H: the drawn area (the canvas less its padding); y: the padding above it.
export function traceRoom(W, H, y = 10) {
  const big = Math.round(clamp(Math.min(W * 0.1, H * 0.14), 22, 40));
  return { big, top: y + 30 + Math.max(big, 22) - 4, bot: y + H - 16 };
}
