// Restrictive transfusion in acute variceal bleeding (Baveno VIII 5.4): transfuse below 7 g/dL, to a target hemoglobin of 7 to 8 g/dL, in one
// place. Read by the vitals monitor's hemoglobin rail (vitals-monitor.js), the bottom bar's red flag (vital-read.js) and the tiles (table-marks.js).
// No imports, so the worker loads it too.
export const TRANSFUSE = Object.freeze({ lo: 7, hi: 8 });
/** Where a hemoglobin (g/dL, as printed to a tenth) stands against the target: 'below' under 7, 'in' from 7 to 8, 'above' over 8. */
export const transfuseBand = (hb) => (hb < TRANSFUSE.lo ? 'below' : hb <= TRANSFUSE.hi ? 'in' : 'above');
/** The word for each band, the one table of them (a band-word is told once). */
export const TRANSFUSE_WORDS = Object.freeze({ below: `Below ${TRANSFUSE.lo}`, in: 'In target', above: 'Above target' });
