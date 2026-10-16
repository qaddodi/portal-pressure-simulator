// A vital sign as the bottom bar and Tests > Readouts show it: the model's own mean over a breath (metrics.vitals,
// engine.js controllers), so the number holds through each breath. Its red flag needs that mean past the cut-off, holds
// 1.5 s before it changes, and clears only a little inside the cut-off (hysteresis), so a patient sitting on a cut-off
// does not flicker red; a paused model takes its flag at once.
export const VITAL_HOLD = 1500;

// x: the vital's own state ({ v: its VITALS entry }); now: ms; returns { v: the number to show, bad }.
export function vitalReading(x, m, running, now) {
  const { v: def } = x, v = def.v(m);
  if (!Number.isFinite(v)) { x.bad = null; x.badNext = null; return { v, bad: false }; }
  const want = def.low ? (x.bad ? v < def.cut + def.hys : v < def.cut) : (x.bad ? v > def.cut - def.hys : v > def.cut);
  if (x.bad == null || !running) { x.bad = want; x.badNext = null; }
  else if (want !== x.bad) {
    if (x.badNext !== want) { x.badNext = want; x.badSince = now; }
    if (now - x.badSince >= VITAL_HOLD) { x.bad = want; x.badNext = null; }
  } else x.badNext = null;
  return { v, bad: x.bad };
}
