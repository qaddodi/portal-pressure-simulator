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

/** The time the varix's drawn size takes to follow its diameter (ms): a beat or a breath moves the diameter by up to 0.8 mm, more than a step. */
export const VARIX_MEAN_MS = 2000;
/** A diameter this far (mm) from the mean is a real change (a new patient, a TIPS, a time jump), not a pulse: the mean jumps to it. */
export const VARIX_JUMP_MM = 1.5;

/**
 * The diameter's running mean at time `now` (ms) in `held.m`: a pulse of the beat or the breath (the engine's varix.d swings 0.8 mm
 * with them, so it crossed the step below about every model frame in a decompensated patient) averages out, a real change is followed
 * within VARIX_MEAN_MS and a jump or a long gap is taken at once. `held.snap` (the stage sets it for a frame of a model that is
 * paused, which sends one frame per change and none after, and for a frame the model jumped in) takes the diameter at once too: no
 * later frame would finish the move, and a stopped model has no pulse to average.
 */
export function varixMean(held, d, now) {
  const dt = now - (held.at ?? now);
  held.at = now;
  // (`held.k` keeps the share of the way to d this call took, 1 for a jump: the scope's field (instruments.js) follows its other
  // readings, the wall's ratio and the air's table, the same share, so everything it draws moves with the figure's varices.)
  held.k = held.snap || held.m == null || dt > 3000 || dt < 0 || Math.abs(d - held.m) > VARIX_JUMP_MM ? 1 : dt > 0 ? 1 - Math.exp(-dt / VARIX_MEAN_MS) : 0;
  held.m = held.k >= 1 ? d : held.m + (d - held.m) * held.k;
  return held.m;
}

/**
 * The varix diameter held in steps: `held` ({ d }) keeps the last step and only moves once the input has clearly left it
 * (a quarter of a step beyond the middle), so a varix whose diameter pulses with the beat or the breath does not redraw
 * the plexus every frame. Returns the held diameter. With `held.now` set (the stage sets it to the time of each model frame) the
 * input is first averaged over the pulse (varixMean): a step's own width is narrower than the pulse, so held alone flipped between
 * two steps on every beat and eased the plexus's spread and width again each time.
 */
export function varixHold(held, d) {
  if (!Number.isFinite(d)) return d;
  if (held.now != null) d = varixMean(held, d, held.now);
  if (held.d == null || Math.abs(d - held.d) > VARIX_HOLD_MM * 0.75) held.d = Math.round(d / VARIX_HOLD_MM) * VARIX_HOLD_MM;
  return held.d;
}

/** The drawn width of a channel against the one its caliber gives (the stage never takes it under the channel's resting caliber). */
export const varixWidthK = (size) => 0.4 + 0.6 * size;
/** How far the strands fan out from the vessel's line against their full spread. */
export const varixSpreadK = (size) => 0.55 + 0.45 * size;
/** The most opaque a channel may be (the stack levels run from 0.3 to 1). */
export const varixOpacity = (size) => 0.3 + 0.7 * size;
