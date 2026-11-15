// Work backward: one virtual patient run to the readings the search compares (the shipped library is made with this, and the worker's live
// refinement runs it). The patient is loaded exactly as the app loads a patient (Engine.loadPreset with a patient made from the family's
// settings), so the readings the search predicted are the ones the figure shows when the scenario is opened.

import { Engine } from './engine.js';
import { computeMetrics } from './metrics.js';
import { presetFromPatch } from './scenario.js';
import { patientOf } from './inverse-families.js';

const r1 = (v) => Math.round(v * 10) / 10;

/** The readings of a metrics record: pressures to a tenth (as every screen prints them), the stiffnesses, the spleen, the fluid and the Doppler. */
export function readingsOf(m) {
  return {
    whvp: r1(m.whvp), fhvp: r1(m.fhvp), hvpg: r1(m.hvpg), pv: r1(m.pv), ppg: r1(m.ppg), ra: r1(m.ra), ivc: r1(m.ivc),
    lsm: r1(m.lsm), ssm: m.ssm == null ? null : Math.round(m.ssm), spleen: r1(m.spleen.length), plt: Math.round(m.spleen.platelets),
    asc: Math.round(m.ascites.volume), saag: r1(m.ascites.saag), asctp: m.ascites.totalProtein == null || !(m.ascites.volume >= 150) ? null : r1(m.ascites.totalProtein), pvVel: Math.round(m.pvVelMean), varix: r1(m.varix.d), co: r1(m.co),
  };
}

/** The readings of family `f` at settings `p`. About a quarter of a second on a laptop. */
export function runPatient(f, p) {
  const { patch, days, volume } = patientOf(f, p);
  const e = new Engine();
  e.loadPreset(null, { preset: presetFromPatch({ id: 'inverse-run', patch, days, volume }) });
  return readingsOf(computeMetrics(e));
}
