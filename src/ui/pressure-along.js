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

/**
 * The along curve for caliber factors k (one per sample, evenly spaced by arc; 1: not narrowed): a Float32Array of k.length
 * values from 0 to 1, rising fastest at the narrowing; or null when nothing is narrowed.
 */
export function alongCurve(k, out) {
  const n = k.length;
  if (n < 3) return null;
  let any = false;
  for (let i = 0; i < n; i++) if (k[i] < 1) { any = true; break; }
  if (!any) return null;
  out = out && out.length === n ? out : new Float32Array(n);
  const w = (i) => 1 / Math.max(ALONG_K_MIN, Math.min(1, k[i])) ** 4;
  const cum = new Float64Array(n);
  let c = 0, wp = w(0);
  for (let i = 1; i < n; i++) { const wi = w(i); cum[i] = c += 0.5 * (wp + wi); wp = wi; }
  out[0] = 0;
  for (let i = 1; i < n - 1; i++) out[i] = cum[i] / c;
  out[n - 1] = 1;
  return out;
}
