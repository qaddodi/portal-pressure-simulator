// The varices as drawn. Their channels (the esophageal varices' coronary vein C1a and its drain C1b; the fundal varices' short
// gastric feeder C2 and the gastrorenal shunt C5 that drains them) are sized by weeks of remodeling, but the varix itself follows
// the pressure now (the model's varix.d and gastricVarix.d, 2 mm at rest up to 8.5 mm in the gastric presets, 10.8 in Budd-Chiari),
// so a fall in pressure left the drawing as it was while the card read "none" (carvedilol 8.5 → 5.5 mm and a TIPS 8.5 → 2.1 mm moved
// a fundal channel 5 % at most). The drawing now follows the varix: the channels narrow (never under their resting caliber), the
// strands fan out less and the whole plexus fades toward the faintest stack level. A varix at or over its full size (8 mm fundal,
// 7 mm esophageal: the gastric presets at 8.0 and 8.5, the decompensated preset at 7.2) is drawn exactly as before.

/** The varix a channel draws. */
export const LOOK_SITE = { C1a: 'VAR', C1b: 'VAR', C2: 'GV', C5: 'GV' };
export const VARIX_REST_MM = 2;                // a resting vein: the model's floor (radius 1 mm)
export const VARIX_FULL_MM = { VAR: 7, GV: 8 };   // drawn as the channels are sized, from here up
export const VARIX_HOLD_MM = 0.5;              // the held step (as stage.js holds the overlays' varix size): a pulse across a rounding boundary moves nothing

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** How big the varix of a site is, 0 (a resting vein) … 1 (its full size and up). No reading (no frame yet): 1, drawn as before. */
export const varixSize = (site, d) => (Number.isFinite(d) ? clamp01((d - VARIX_REST_MM) / (VARIX_FULL_MM[site] - VARIX_REST_MM)) : 1);

/**
 * The varix diameter held in steps: `held` ({ d }) keeps the last step and only moves once the input has clearly left it
 * (a quarter of a step beyond the middle), so a varix whose diameter pulses with the beat or the breath does not redraw
 * the plexus every frame. Returns the held diameter.
 */
export function varixHold(held, d) {
  if (!Number.isFinite(d)) return d;
  if (held.d == null || Math.abs(d - held.d) > VARIX_HOLD_MM * 0.75) held.d = Math.round(d / VARIX_HOLD_MM) * VARIX_HOLD_MM;
  return held.d;
}

/** The drawn width of a channel against the one its caliber gives (the stage never takes it under the channel's resting caliber). */
export const varixWidthK = (size) => 0.4 + 0.6 * size;
/** How far the strands fan out from the vessel's line against their full spread. */
export const varixSpreadK = (size) => 0.55 + 0.45 * size;
/** The most opaque a channel may be (the stack levels run from 0.3 to 1). */
export const varixOpacity = (size) => 0.3 + 0.7 * size;
