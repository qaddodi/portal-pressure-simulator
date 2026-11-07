// The bands on the esophageal varices as the figure draws them. The model counts them whole (each band is +1, and they slough
// over days), and each one thromboses a channel of the varices' plexus (stage.js widthWrites: strand i is live while the count is
// under i + 1): drawn straight from the count, the strand a band closes vanished in one frame. The count the figure draws follows
// the model's in a moment, so the strand fades out (or back in, as a band sloughs) over about D_SMALL.
import { D_SMALL } from './ease.js';

/** The time constant of the follow (s): about 95 % of the way in D_SMALL. */
export const BANDS_TAU = D_SMALL / 3000;
/** Within this of the model's count it lands: a slow slough (a time-lapse moves the count a few hundredths a frame) is taken as it is. */
export const BANDS_SNAP = 0.04;

/** The drawn count after `dt` seconds toward the model's `goal` (null: nothing drawn yet, take the goal; quiet: Reduce Motion). */
export function bandsStep(shown, goal, dt, quiet = false) {
  if (shown === null || quiet || shown === goal) return goal;
  const next = shown + (goal - shown) * (1 - Math.exp(-Math.max(0, dt) / BANDS_TAU));
  return Math.abs(goal - next) < BANDS_SNAP ? goal : next;
}
