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

// The vital signs the bottom bar, Tests > Readouts and a slide's vitals monitor show: id, short name, what it is, the value off the metrics, decimals,
// unit, the cut-off (low: a low value is the bad one) and the hysteresis that clears it.
export const VITALS = [
  { id: 'map', k: 'MAP', title: 'Mean arterial pressure', why: 'map', v: (m) => m.vitals?.map ?? m.map, d: 0, u: 'mmHg', cut: 65, low: true, hys: 2 },
  { id: 'hr', k: 'HR', title: 'Heart rate', why: 'hr', v: (m) => m.vitals?.hr ?? m.hr, d: 0, u: '/min', cut: 110, hys: 3 },
  { id: 'co', k: 'CO', title: 'Cardiac output', why: 'co', v: (m) => m.vitals?.co ?? m.co, d: 1, u: 'L/min', cut: 8, hys: 0.2 },   // (the data card tile's top of normal: table-marks RATE.co)
  { id: 'ra', k: 'RA', title: 'Right atrial pressure', why: 'ra', hideKey: 'ra', v: (m) => m.vitals?.ra ?? m.ra, d: 1, u: 'mmHg', cut: 10, hys: 0.5 },
  { id: 'hb', k: 'Hb', title: 'Hemoglobin', why: 'hb', v: (m) => m.blood.hb, d: 1, u: 'g/dL', cut: 7, low: true, hys: 0.2 },
];
