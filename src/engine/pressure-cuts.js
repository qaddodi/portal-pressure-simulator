// The two pressure gradients' cut-offs, in one place. HVPG = WHVP − FHVP is amber from 5 and red from 10 mmHg (10 is the
// clinically significant portal hypertension line of Baveno VIII and AASLD 2024); PPG = portal vein − IVC is amber from 6 and
// red from 12. Read by the readout tiles (dock.js), the Over time chart (pressure-time.js), the summary tables (table-marks.js),
// the catheter's tracing and labels (hvpg-proc.js, presenter.js), the talk trace (talk-trace.js), the HVPG against PPG plane
// (visual-plane.js), the pressure ladder (anatomy.js), the patient menu's chips (menu.js) and the engine's events (events.js),
// so a number is the same colour wherever it is shown. tests/pressure-vocabulary.test.js keeps any other file from writing them
// again. No imports, so the worker loads it too. The bands' words, the ratings' maps and the missing-number glyph live here as well
// (below; tests/rating-vocabulary.test.js and scripts/source-shapes/vocab.mjs keep a second copy out).
//
// HVPG portal hypertension is a gradient ABOVE 5 mmHg (Baveno VIII: normal 1 to 5), so 5.0 itself is normal and amber starts past it
// (`over: true`); CSPH is 10 or more. The PPG has no guideline line of its own and keeps amber from 6. Every reading reaching these is
// already at one decimal (the difference of the two readings as shown), so the colour and the printed number never disagree.
//
// `bleed` is not a guideline cut-off: HVPG 12 is where this model's varices start to rupture (a calibration, src/version.js), drawn
// as a faint line and named "Bleed risk" on the Over time chart, never as a colour change of its own.
export const HVPG_CUTS = Object.freeze({ amber: 5, red: 10, bleed: 12, over: true });
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
/** Past the amber line: above it for a cut-off written "over" (HVPG >5), at or above it otherwise (PPG ≥6). */
export const pastAmber = (cuts, v) => (cuts.over ? v > cuts.amber : v >= cuts.amber);
export const sevOfCuts = (cuts, v) => (v >= cuts.red ? 'danger' : pastAmber(cuts, v) ? 'caution' : 'ok');
export const hvpgSev = (v) => sevOfCuts(HVPG_CUTS, v);
export const ppgSev = (v) => sevOfCuts(PPG_CUTS, v);

/** The same status as the summary tables and chart marks call it: 'ok', 'mid' (amber), 'hi' (red). */
export const RATE_OF_SEV = Object.freeze({ ok: 'ok', caution: 'mid', danger: 'hi' });
export const hvpgRate = (v) => RATE_OF_SEV[hvpgSev(v)];
export const ppgRate = (v) => RATE_OF_SEV[ppgSev(v)];
/** The other way round: a summary table's rating ('ok', 'mid', 'hi') as the colour tokens name it ('ok', 'caution', 'danger'). */
export const SEV_OF_RATE = Object.freeze(Object.fromEntries(Object.entries(RATE_OF_SEV).map(([sev, rate]) => [rate, sev])));
/** A status's colour token, and a rating's: green, amber, red. */
export const TOKEN_OF_SEV = Object.freeze({ ok: '--ok', caution: '--caution', danger: '--danger' });
export const TOKEN_OF_RATE = Object.freeze(Object.fromEntries(Object.entries(RATE_OF_SEV).map(([sev, rate]) => [rate, TOKEN_OF_SEV[sev]])));

// A reading's colour as TEXT, one table (U2, 13 Nov 2026): the status's ink token, the same red, amber and green on the play bar, the tiles, the
// chart's labels and the deck pills. `TOKEN_OF_SEV` is the status as a fill or a stroke; text takes a step toward the page's text colour so it
// clears 4.5:1 (styles/tokens.css writes each ink as `color-mix(var(--x) SHARE%, var(--text))`, and INK_SHARE is the same shares for the canvases,
// which cannot mix a custom property; tests/reading-ink.test.js keeps the two together). Never a mix of your own in a rule.
export const INK_OF_SEV = Object.freeze({ ok: '--ok-ink', caution: '--caution-ink', danger: '--danger-ink', critical: '--critical-ink' });
export const INK_OF_RATE = Object.freeze({ ok: '--ok-ink', mid: '--caution-ink', hi: '--danger-ink', top: '--critical-ink' });
export const INK_SHARE = Object.freeze({ ok: 0.88, caution: 0.7, danger: 0.88, critical: 0.88 });

// The bands' words, one set for every card, tile, chart and table, each [short, long]: the short on a tile, a chip or a table cell, the long where
// a sentence has room. Never a third wording (unification audit 3). Frozen tables: a tile names its band every model frame.
const pair = (short, long = short) => Object.freeze([short, long]);
export const BLEED_WORD = 'Bleed risk';
export const HVPG_WORDS = Object.freeze({ ok: pair('Normal'), caution: pair('Mild', 'Mild portal hypertension'), danger: pair('CSPH', 'Clinically significant portal hypertension (CSPH)') });
export const PPG_WORDS = Object.freeze({ ok: pair('Normal'), caution: pair('High', 'Portal hypertension'), danger: pair(BLEED_WORD, 'Portal hypertension with a risk of variceal bleeding') });
export const hvpgWord = (v, long = false) => HVPG_WORDS[hvpgSev(v)][long ? 1 : 0];
export const ppgWord = (v, long = false) => PPG_WORDS[ppgSev(v)][long ? 1 : 0];

// A reading that cannot be taken (the HVPG with the hepatic vein thrombosed: hvBlocked) says this, on every tile, cell and card.
export const NOT_MEASURABLE = 'Not measurable';
// A number not known (no reading, no frame yet) prints as one em dash in its number's place, as util.js fmt prints it. In running text (a slide
// line's or a callout's live value) a dash between words would read as an em-dash aside (docs/ai-humanizer.md), so there a value still to come
// prints as an ellipsis.
export const NOT_SHOWN = '—';
export const VALUE_PENDING = '…';
