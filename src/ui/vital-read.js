// A vital sign as the bottom bar and Tests > Readouts show it: the model's own mean over a breath (metrics.vitals,
// engine.js controllers), so the number holds through each breath. Its red flag needs that mean past the cut-off, holds
// 1.5 s before it changes, and clears only a little inside the cut-off (hysteresis), so a patient sitting on a cut-off
// does not flicker red; a paused model takes its flag at once.
import { MAP_BETA_CUT, SBP_BETA_CUT } from '../engine/kidney-cuts.js';

export const VITAL_HOLD = 1500;

// x: the vital's own state ({ v: its VITALS entry }); now: ms; returns { v: the number to show, bad }.
export function vitalReading(x, m, running, now) {
  const { v: def } = x, v = def.v(m);
  const r = x.read || (x.read = { v: 0, bad: false });   // alloc-rare: one reading record per vital, made the first time it is read, then written in place
  if (!Number.isFinite(v)) { x.bad = null; x.badNext = null; r.v = v; r.bad = false; return r; }
  let want = def.low ? (x.bad ? v < def.cut + def.hys : v < def.cut) : (x.bad ? v > def.cut - def.hys : v > def.cut);
  // (The blood pressure's second limit, the systolic: Baveno VIII 4.6 holds carvedilol at a systolic <90 or a MAP <65 mmHg.)
  const a = def.alt, av = a ? a.v(m) : NaN;
  if (!want && Number.isFinite(av)) want = x.bad ? av < a.cut + a.hys : av < a.cut;
  if (x.bad == null || !running) { x.bad = want; x.badNext = null; }
  else if (want !== x.bad) {
    if (x.badNext !== want) { x.badNext = want; x.badSince = now; }
    if (now - x.badSince >= VITAL_HOLD) { x.bad = want; x.badNext = null; }
  } else x.badNext = null;
  r.v = v; r.bad = x.bad; r.s = def.s ? def.s(m) : NaN; r.d = def.dia ? def.dia(m) : NaN;
  return r;
}

// The vital signs the bottom bar, Tests > Readouts and a slide's vitals monitor show: id, short name, what it is, the value off the metrics, decimals,
// unit, the cut-off (low: a low value is the bad one) and the hysteresis that clears it.
export const VITALS = [
  // (The blood pressure as it is written at the bedside, systolic/diastolic (mean): 120/80 (93). The number the bar, the rail and the cut-off read
  // is the mean; s and dia give the other two (engine.js bpNow), and alt is the systolic's own limit.)
  { id: 'map', k: 'BP', title: 'Blood pressure', why: 'map', v: (m) => m.vitals?.map ?? m.map, s: (m) => m.vitals?.sbp ?? m.sbp, dia: (m) => m.vitals?.dbp ?? m.dbp,
    d: 0, u: 'mmHg', cut: MAP_BETA_CUT, low: true, hys: 2, alt: { v: (m) => m.vitals?.sbp ?? m.sbp, cut: SBP_BETA_CUT, hys: 3 } },
  { id: 'hr', k: 'HR', title: 'Heart rate', why: 'hr', v: (m) => m.vitals?.hr ?? m.hr, d: 0, u: '/min', cut: 110, hys: 3 },
  { id: 'co', k: 'CO', title: 'Cardiac output', why: 'co', v: (m) => m.vitals?.co ?? m.co, d: 1, u: 'L/min', cut: 8, hys: 0.2 },   // (the data card tile's top of normal: table-marks RATE.co)
  { id: 'ra', k: 'RA', title: 'Right atrial pressure', why: 'ra', hideKey: 'ra', v: (m) => m.vitals?.ra ?? m.ra, d: 1, u: 'mmHg', cut: 10, hys: 0.5 },
  // (to: where the reading is heading, the hemoglobin once the plasma has refilled after a bleed or a unit's extra plasma has gone,
  // engine.js RED: the bar prints it beside the number while the two differ, so a bleed shows on the hemoglobin at once.)
  { id: 'hb', k: 'Hb', title: 'Hemoglobin', why: 'hb', v: (m) => m.blood.hb, to: (m) => m.blood.hbSettled, d: 1, u: 'g/dL', cut: 7, low: true, hys: 0.2 },
];

// Where a vital is heading (its `to`), or null while it is there already: shown from TO_SHOW apart, kept until TO_HIDE, so a reading
// settling onto it does not flicker the arrow on and off.
export const TO_SHOW = 0.3, TO_HIDE = 0.15;
export function vitalHeading(x, m) {
  const to = x.v.to?.(m), v = x.v.v(m);
  if (!Number.isFinite(to) || !Number.isFinite(v)) { x.heading = false; return null; }
  x.heading = Math.abs(to - v) >= (x.heading ? TO_HIDE : TO_SHOW);
  return x.heading ? to : null;
}

/** The blood pressure as it is written at the bedside: systolic/diastolic (mean), "120/80 (93)"; the mean alone where the other two are unknown. */
export function bpText(sbp, dbp, map) {
  if (!Number.isFinite(map)) return '—';
  const r = (v) => String(Math.round(v));
  return Number.isFinite(sbp) && Number.isFinite(dbp) ? `${r(sbp)}/${r(dbp)} (${r(map)})` : r(map);
}
