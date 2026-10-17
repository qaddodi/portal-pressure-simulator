// How the scope's view moves between states (instruments.js): every change eases, nothing cuts.
// The shaded field is a bitmap redrawn in small steps (a step of size or stigmata, each frame of a band going on); each new
// bitmap fades in over the one shown, so a step reads as a glide. The balloon and the bleeding jet fade in and out.
export const FADE_MS = 280;
// The band follows the deflating vein: the vein starts at once, the band cinches in a beat later.
export const DEFLATE_MS = 500, BAND_MS = 420, BAND_DELAY_MS = 140;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** How far the new field has faded in, 0..1, ms after it was drawn. */
export function fadeIn(ms) { return ms >= FADE_MS ? 1 : ms <= 0 ? 0 : ease(ms / FADE_MS); }
/** cur eased toward target over dtMs (time constant tauMs, about 0.6 s to settle at 120 ms), landing exactly on it. */
export function glide(cur, target, dtMs, tauMs = 120) {
  const v = cur + (target - cur) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs));
  return Math.abs(target - v) < 0.004 ? target : v;
}
