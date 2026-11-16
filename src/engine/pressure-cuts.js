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
// The portal vein's own pressure (an ABSOLUTE pressure, not a gradient): amber above 10 and red from 15 mmHg. These are the model's reading bands for the portal
// pressure tile, the summary tables and the figure's pressure labels, not a guideline's cut-offs (Baveno VIII and AASLD 2024 grade the HVPG, the gradient). Said once
// here (R09, external production review, 15 Nov 2026: the screen-reader caption had its own copy, with its own words), so the tile, the table, the arrows and the
// spoken description of the same patient agree. The wedged pressure is read on the same bands (table-marks.js).
export const PV_CUTS = Object.freeze({ amber: 10, red: 15, over: true });
export const pvSev = (v) => sevOfCuts(PV_CUTS, v);
export const PV_WORDS = Object.freeze({ ok: 'Normal', caution: 'High', danger: 'Severe' });
export const PRESSURE_CUTS = Object.freeze({ hvpg: HVPG_CUTS, ppg: PPG_CUTS, pv: PV_CUTS });

// A right hepatic vein clotted this far (Budd–Chiari) takes no catheter, so the HVPG cannot be measured: the HVPG procedure aborts
// (hvpg-proc.js), and the readout tile and the procedure's idle row show "Not measurable" with no number, never a model difference
// that would read as a normal HVPG.
//
// ONE policy for a hepatic vein's measurement (R08 §6.3 of the external production review, 15 Nov 2026; until then src/ui/measure-model.js held a second one, thrombus
// 0.5 or stenosis 0.8, that no screen used). Three different questions, each with its own line, in the order they fail:
//   passes        the catheter can be passed: the vein's thrombus is under HV_BLOCKED (0.8). Past it nothing can be measured.
//   obtainable    a wedged and a free pressure can be taken: the same as passes (a vein that takes the catheter gives a reading).
//   interpretable the gradient can be read as the sinusoidal one: the vein is also under HV_SUSPECT (thrombus 0.5, stenosis 0.8). A vein clotted half way
//                 or narrowed that far still gives a reading, but the free and wedged pressures no longer stand for the liver, so the HVPG is not
//                 clinically interpretable (its number is the vein's, not the liver's).
// The tiles and the procedure read only `passes` (hvBlocked, for the right vein, the one the HVPG is taken in); `interpretable` is the line a caveat reads.
export const HV_BLOCKED = 0.8;
export const HV_SUSPECT = Object.freeze({ thrombus: 0.5, stenosis: 0.8 });
export const HV_EDGE = Object.freeze({ R: 'RHV_IVC', M: 'MHV_IVC', L: 'LHV_IVC' });
/** One hepatic vein's measurement state: { passes, obtainable, interpretable }, for vein 'R', 'M' or 'L' (the right by default). Pure: params in, three booleans out. */
export function hvMeasure(params, vein = 'R') {
  const id = HV_EDGE[vein];
  if (!id) throw new Error(`hvMeasure: vein ${vein}`);
  const th = +params?.thrombus?.[id] || 0, st = +params?.stenosis?.[id] || 0;
  const passes = th < HV_BLOCKED;
  return { passes, obtainable: passes, interpretable: passes && th < HV_SUSPECT.thrombus && st < HV_SUSPECT.stenosis };
}
export const hvBlocked = (params) => !hvMeasure(params, 'R').passes;

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
// The PPG's lines are the MODEL's reference lines (6 and 12 mmHg), not a guideline's decision boundaries: Baveno VIII and AASLD 2024 grade the HVPG, and the EUS-PPG is
// read on the HVPG's lines without a validated cut-off of its own. So the long forms, the sentences, say "model" where the short words (a tile, a cell) have no room
// (R09/§6.2, external production review, 15 Nov 2026: "Normal" and "Bleed risk" read as established clinical categories). PPG_LINE_NOTE is the one caveat sentence.
export const PPG_LINE_NOTE = 'The color lines at 6 and 12 mmHg are this model\'s reference lines, not guideline cut-offs: the guidelines grade the HVPG.';
export const EUS_LINE_NOTE = 'The EUS-PPG is read on the HVPG\'s lines (5 and 10 mmHg) as a model reference, not a validated cut-off. Anesthesia and a different sampled site (portal and left hepatic vein) can bias it, with the hepatic venous pressure overestimated (ENCOUNTER, PMID 40689144).';
// The EUS-PPG's sites, said once (play-test, 16 Nov 2026: the needle read 7.7 and 5.2 where the figure's portal vein read 8.1 and the PPG 4.2): the needle takes the LEFT portal vein
// and the LEFT hepatic vein, inside the liver, so it reads the pressure fall along the portal vein and the hepatic vein's step above the IVC that the PPG (portal vein trunk minus IVC) does not.
// In the model the two differ by 0 to 1.5 mmHg; behind a clot in the portal vein or a block of the hepatic veins the needle no longer sees the pressure the PPG reads.
export const EUS_SITE_NOTE = 'EUS-PPG is the left portal vein pressure minus the left hepatic vein pressure, both read inside the liver. The PPG is the portal vein minus the IVC, so the two usually differ by about 1 mmHg. Behind a portal vein clot or a hepatic vein block the EUS-PPG reads low and does not reflect the portal pressure.';
// The PPG's words NAME ITS OWN LINES (6 and 12 mmHg) instead of grading: its lines sit a point or two over the HVPG's (5 and 10), so the same patient reads HVPG 9.6 "Mild"
// beside PPG 9.8 and HVPG 10.9 "CSPH" beside PPG 11.1, and any severity word on the PPG ("High") read as a contradiction of the HVPG's (play-test, Mac, 16 Nov 2026).
// A band named by its numbers cannot disagree with another scale's words, claims no category the guidelines do not give it, and invents no threshold.
export const PPG_WORDS = Object.freeze({ ok: pair(`Under ${PPG_CUTS.amber}`, `Below the model's PPG reference line of ${PPG_CUTS.amber} mmHg`), caution: pair(`${PPG_CUTS.amber} to ${(PPG_CUTS.red * 10 - 1) / 10}`, `Between the model's PPG reference lines of ${PPG_CUTS.amber} and ${PPG_CUTS.red} mmHg`), danger: pair(`${PPG_CUTS.red} or more`, `At or above the model's upper PPG line (${PPG_CUTS.red} mmHg)`) });
// The bleed-risk word belongs to the HVPG only (the model's rupture line, HVPG 12): a PPG band never says it, so a patient at HVPG 11.6 (CSPH) and PPG 13.5 reads "CSPH" and "Very high", never CSPH beside "Bleed risk" (play-test 16 Nov 2026).
export const hvpgWord = (v, long = false) => HVPG_WORDS[hvpgSev(v)][long ? 1 : 0];
export const ppgWord = (v, long = false) => PPG_WORDS[ppgSev(v)][long ? 1 : 0];

// A reading that cannot be taken (the HVPG with the hepatic vein thrombosed: hvBlocked) says this, on every tile, cell and card.
export const NOT_MEASURABLE = 'Not measurable';
// (On a card with room for the reason: the hepatic vein the catheter wedges in is blocked, Budd–Chiari.)
export const NOT_MEASURABLE_WHY = `${NOT_MEASURABLE} (hepatic vein outflow obstructed)`;
// A number not known (no reading, no frame yet) prints as one em dash in its number's place, as util.js fmt prints it. In running text (a slide
// line's or a callout's live value) a dash between words would read as an em-dash aside (docs/ai-humanizer.md), so there a value still to come
// prints as an ellipsis.
export const NOT_SHOWN = '—';
export const VALUE_PENDING = '…';
