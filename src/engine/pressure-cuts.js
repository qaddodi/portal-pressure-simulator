// The two pressure gradients' cut-offs, in one place. HVPG = WHVP − FHVP is amber from 5 and red from 10 mmHg (10 is the
// clinically significant portal hypertension line of Baveno VIII and AASLD 2024); PPG = portal vein − IVC is amber from 6 and
// red from 12. Read by the readout tiles (dock.js), the Over time chart (pressure-time.js), the summary tables (table-marks.js),
// the catheter's tracing and labels (hvpg-proc.js, presenter.js), the talk trace (talk-trace.js), the HVPG against PPG plane
// (visual-plane.js), the pressure ladder (anatomy.js), the patient menu's chips (menu.js) and the engine's events (events.js),
// so a number is the same colour wherever it is shown. tests/pressure-vocabulary.test.js keeps any other file from writing them
// again. No imports, so the worker loads it too.
//
// `bleed` is not a guideline cut-off: HVPG 12 is where this model's varices start to rupture (a calibration, src/version.js), drawn
// as a faint line and named "Bleed risk" on the Over time chart, never as a colour change of its own.
export const HVPG_CUTS = Object.freeze({ amber: 5, red: 10, bleed: 12 });
export const PPG_CUTS = Object.freeze({ amber: 6, red: 12 });
// HVPG at which a preemptive TIPS is offered after a controlled variceal bleed, whatever the Child–Pugh score (Baveno VIII 5.31): a treatment
// criterion, not a colour. Read by the guideline path card (path-data.js).
export const PTIPS_HVPG = 20;
export const PRESSURE_CUTS = Object.freeze({ hvpg: HVPG_CUTS, ppg: PPG_CUTS });

// A right hepatic vein clotted this far (Budd–Chiari) takes no catheter, so the HVPG cannot be measured: the HVPG procedure aborts
// (hvpg-proc.js), and the readout tile and the procedure's idle row show "Not measurable" with no number, never a model difference
// that would read as a normal HVPG.
export const HV_BLOCKED = 0.8;
export const hvBlocked = (params) => (params?.thrombus?.RHV_IVC || 0) >= HV_BLOCKED;

/** A gradient's status as the colour tokens name it: 'ok' (green), 'caution' (amber), 'danger' (red). */
export const sevOfCuts = (cuts, v) => (v >= cuts.red ? 'danger' : v >= cuts.amber ? 'caution' : 'ok');
export const hvpgSev = (v) => sevOfCuts(HVPG_CUTS, v);
export const ppgSev = (v) => sevOfCuts(PPG_CUTS, v);

/** The same status as the summary tables and chart marks call it: 'ok', 'mid' (amber), 'hi' (red). */
export const RATE_OF_SEV = Object.freeze({ ok: 'ok', caution: 'mid', danger: 'hi' });
export const hvpgRate = (v) => RATE_OF_SEV[hvpgSev(v)];
export const ppgRate = (v) => RATE_OF_SEV[ppgSev(v)];
