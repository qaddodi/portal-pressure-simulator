// Where the pressure falls along a vessel (combined plan V1). The lumen's colour runs from its colour at one end to its colour
// at the other; mixed by arc it spread a stenosis's drop along the whole vessel, when nearly all of it is at the waist (local
// resistance goes as 1/r⁴). Here a narrowed vessel's colour follows its resistance instead: the cumulative Σ Δs / r⁴, over the
// resistance the same vessel would have unnarrowed, normalised to 0 … 1.
//
// Only the narrowing counts: each sample's weight is (1 / k)⁴, k the stenosis's caliber factor there (stage.js waist: 1 away
// from it). The vessel's drawn tapers and the eases that meet its neighbours at a join are drawing, not resistance, and leave the
// mix by arc as it was. A vessel with no stenosis has no curve (null): the shader keeps the plain mix by arc, exactly as before.
// As a stenosis comes on (k from 1) the curve leaves the straight line smoothly, so the colour never jumps.

/** (A caliber factor is never taken under this: 1/k⁴ at most 10⁴, so one sample never holds the whole drop alone.) */
export const ALONG_K_MIN = 0.1;

/** How far (a fraction of the vessel) a concentrated loss is spread, so the colour ramps over a few samples instead of stepping in one. */
export const LOSS_SPAN = 0.05;
const smooth01 = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };

/**
 * The along curve for caliber factors k (one per sample, evenly spaced by arc; 1: not narrowed): a Float32Array of k.length
 * values from 0 to 1, rising fastest at the narrowing; or null when nothing is narrowed.
 *
 * `loss` (a narrowed stent: stent-waist.js lossShares) takes its local losses out of the friction's share and puts them where they happen:
 * { jet, ends, at, dir } with `jet` the waist's exit jet as a share of the whole fall, concentrated over LOSS_SPAN just past the waist's
 * downstream end `at` (a fraction of the path; `dir` is the flow's sign along it, 1 downstream at larger u, -1 the other way), and `ends`
 * the device's entrance and exit loss as a share, half at each end; `jet2` and `at2` (optional) a second jet the same way, the mid waist's when
 * the stent holds both an end stenosis and a waist. The rest, 1 − jet − jet2 − ends, is friction by 1/k⁴ as before. With no loss (or none of
 * any), the curve is exactly the friction alone.
 */
export function alongCurve(k, out, loss = null) {
  const n = k.length;
  if (n < 3) return null;
  let any = false;
  for (let i = 0; i < n; i++) if (k[i] < 1) { any = true; break; }
  if (!any) return null;
  out = out && out.length === n ? out : new Float32Array(n);   // alloc-rare: only a caller that brings no buffer of the right size (the stage always does); a frame's call writes into its own
  // (The running sum is walked twice, the total first and then again for each sample, in the same order and with the same additions, so each
  // value is what a kept array of the sums would hold; nothing is made for it.)
  let c = 0, wp = alongW(k[0]);
  for (let i = 1; i < n; i++) { const wi = alongW(k[i]); c += 0.5 * (wp + wi); wp = wi; }
  const J = loss && loss.jet > 0 ? Math.min(1, loss.jet) : 0, J2 = loss && loss.jet2 > 0 ? Math.min(1 - J, loss.jet2) : 0;
  const Ed = loss && loss.ends > 0 ? Math.min(1 - J - J2, loss.ends) : 0, fr = 1 - J - J2 - Ed;
  // (Each jet's window: LOSS_SPAN long, from its narrowing's downstream end on, kept inside the vessel.)
  const sp = LOSS_SPAN, j0 = J > 0 ? Math.max(0, Math.min(1 - sp, loss.dir >= 0 ? loss.at : loss.at - sp)) : 0;
  const j2 = J2 > 0 ? Math.max(0, Math.min(1 - sp, loss.dir >= 0 ? loss.at2 : loss.at2 - sp)) : 0;
  out[0] = 0;
  let run = 0;
  wp = alongW(k[0]);
  for (let i = 1; i < n - 1; i++) {
    const wi = alongW(k[i]); run += 0.5 * (wp + wi); wp = wi;
    const u = i / (n - 1);
    out[i] = fr * (run / c) + (J > 0 ? J * smooth01((u - j0) / sp) : 0) + (J2 > 0 ? J2 * smooth01((u - j2) / sp) : 0) + (Ed > 0 ? Ed * 0.5 * (smooth01(u / sp) + smooth01((u - (1 - sp)) / sp)) : 0);
  }
  out[n - 1] = 1;
  return out;
}
// One sample's weight, (1 / k)⁴ with k held to ALONG_K_MIN … 1.
const alongW = (kv) => 1 / Math.max(ALONG_K_MIN, Math.min(1, kv)) ** 4;

// The oxygen lens's vein (15 Nov 2026): flat at its own saturation, then easing into the blend of the junction it runs into over its last OXY_RAMP_LEN
// (world units), so the colours are continuous through every junction, as the origin lens's are. `dir` is 1 when that junction is at the vessel's far end,
// -1 at its near end (stage-tubes.js x.oxRamp; blood.js `far` holds the two end colours).
/** How far from its downstream end (world units) a vein's oxygen colour eases into its junction's blend (the origin lens's ramp is about three times 12 units). */
const OXY_RAMP_LEN = 36;
/** The ramp's share of a vessel `len` long (at most half). */
export const oxRampOf = (len) => (len > 0 ? Math.min(0.5, OXY_RAMP_LEN / len) : 0.5);
/** The oxygen lens's along curve for a vessel `len` long, written into `out` (smoothstep: no slope at the join). */
export function oxygenAlong(dir, len, out) {
  const n = out.length, r = oxRampOf(len);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), w = dir > 0 ? (u - (1 - r)) / r : u / r, t = w < 0 ? 0 : w > 1 ? 1 : w;
    out[i] = t * t * (3 - 2 * t);
  }
  return out;
}
